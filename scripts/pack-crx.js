// Packs a pre-built extension .zip into a signed .crx (CRX3 format),
// using only Node's built-in `crypto` module — no third-party packages.
//
// Why: the `crx` npm package delegates key handling to `node-rsa`, and
// current node-rsa versions require an explicit key format that `crx`
// doesn't pass, breaking with "Key format must be specified" regardless
// of how the key is read. Rather than fight that dependency, this
// implements the (public, stable) CRX3 spec directly:
// https://www.chromium.org/developers/design-documents/extensions/how-the-extension-system-works/crx3/
//
// Usage: node scripts/pack-crx.js <key.pem> <input.zip> <output.crx>
//
// The private key must be generated once, kept secret, and reused for
// every release — reusing it is what keeps the extension's ID stable
// across versions. Generate it locally (never in CI, never committed):
//
//   openssl genrsa -out key.pem 2048
//
// Then store the *contents* of key.pem as a GitHub Actions secret
// (e.g. CRX_PRIVATE_KEY) and never commit key.pem itself.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [, , keyPath, zipPath, outputPath] = process.argv;

if (!keyPath || !zipPath || !outputPath) {
  console.error('Usage: node scripts/pack-crx.js <key.pem> <input.zip> <output.crx>');
  process.exit(1);
}

function uint32LE(n) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(n, 0);
  return buf;
}

// Minimal protobuf varint + length-delimited field encoding — the CRX3
// header only uses length-delimited (wire type 2) fields, so that's all
// this needs to support.
function encodeVarint(n) {
  const bytes = [];
  while (n > 0x7f) {
    bytes.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  bytes.push(n & 0x7f);
  return Buffer.from(bytes);
}

function fieldTag(fieldNumber, wireType) {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function lengthDelimitedField(fieldNumber, valueBuf) {
  return Buffer.concat([fieldTag(fieldNumber, 2), encodeVarint(valueBuf.length), valueBuf]);
}

const privateKeyPem = fs.readFileSync(path.resolve(keyPath), 'utf8');
const zipBuffer = fs.readFileSync(path.resolve(zipPath));

// Derive the DER-encoded SubjectPublicKeyInfo for the matching public key —
// this is what CRX3 embeds and what Chrome hashes to compute the crx_id.
const privateKeyObj = crypto.createPrivateKey(privateKeyPem);
const publicKeyObj = crypto.createPublicKey(privateKeyObj);
const publicKeyDer = publicKeyObj.export({ type: 'spki', format: 'der' });

// crx_id = first 16 bytes of SHA-256(public key DER).
const crxId = crypto.createHash('sha256').update(publicKeyDer).digest().subarray(0, 16);

// SignedData { crx_id = 1 } — this whole encoded message is
// CrxFileHeader.signed_header_data.
const signedHeaderData = lengthDelimitedField(1, crxId);

// The exact byte sequence CRX3 requires to be signed:
// "CRX3 SignedData\0" + uint32LE(len(signed_header_data)) + signed_header_data + zip bytes
const signaturePrefix = Buffer.from('CRX3 SignedData\0', 'ascii');
const dataToSign = Buffer.concat([
  signaturePrefix,
  uint32LE(signedHeaderData.length),
  signedHeaderData,
  zipBuffer
]);

const signature = crypto.sign('RSA-SHA256', dataToSign, privateKeyPem);

// Self-check before writing anything: verify our own signature with the
// public key we just derived, over the exact bytes we just built. If this
// fails, the file we're about to write would fail in Chrome too — better
// to catch it here.
const verified = crypto.verify('RSA-SHA256', dataToSign, publicKeyObj, signature);
if (!verified) {
  console.error('Internal self-check failed: signature does not verify against the derived public key. Aborting.');
  process.exit(1);
}

// AsymmetricKeyProof { public_key = 1, signature = 2 }
const proof = Buffer.concat([
  lengthDelimitedField(1, publicKeyDer),
  lengthDelimitedField(2, signature)
]);

// CrxFileHeader { sha256_with_rsa = 2 (repeated), signed_header_data = 10000 }
const header = Buffer.concat([
  lengthDelimitedField(2, proof),
  lengthDelimitedField(10000, signedHeaderData)
]);

const crxFile = Buffer.concat([
  Buffer.from('Cr24', 'ascii'),
  uint32LE(3),
  uint32LE(header.length),
  header,
  zipBuffer
]);

fs.writeFileSync(path.resolve(outputPath), crxFile);
console.log(`Wrote ${outputPath} (${crxFile.length} bytes) - signature self-check passed.`);