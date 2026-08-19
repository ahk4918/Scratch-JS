// Packs a pre-built extension .zip into a signed .crx (CRX3 format)
// using only Node's built-in crypto module.
//
// Usage: node scripts/pack-crx.js <key.pem> <input.zip> <output.crx>
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [, , keyPath, zipPath, outputPath] = process.argv;

if (!keyPath || !zipPath || !outputPath) {
  console.error('Usage: node scripts/pack-crx.js <key.pem> <input.zip> <output.crx>');
  process.exit(1);
}

function uint32LE(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function encodeVarint(value) {
  const bytes = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return Buffer.from(bytes);
}

function fieldTag(fieldNumber, wireType) {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function lengthDelimitedField(fieldNumber, value) {
  return Buffer.concat([fieldTag(fieldNumber, 2), encodeVarint(value.length), value]);
}

const privateKeyPem = fs.readFileSync(path.resolve(keyPath), 'utf8');
const zipBuffer = fs.readFileSync(path.resolve(zipPath));
const privateKey = crypto.createPrivateKey(privateKeyPem);
const publicKey = crypto.createPublicKey(privateKey);
const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
const crxId = crypto.createHash('sha256').update(publicKeyDer).digest().subarray(0, 16);
const signedHeaderData = lengthDelimitedField(1, crxId);
const dataToSign = Buffer.concat([
  Buffer.from('CRX3 SignedData\0', 'ascii'),
  uint32LE(signedHeaderData.length),
  signedHeaderData,
  zipBuffer
]);
const signature = crypto.sign('RSA-SHA256', dataToSign, privateKeyPem);

if (!crypto.verify('RSA-SHA256', dataToSign, publicKey, signature)) {
  console.error('CRX3 signature self-check failed. Aborting.');
  process.exit(1);
}

const proof = Buffer.concat([
  lengthDelimitedField(1, publicKeyDer),
  lengthDelimitedField(2, signature)
]);
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
