// Packs release-package/ into a signed .crx file.
//
// Usage: node scripts/pack-crx.js <key.pem path> <output .crx path>
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
const ChromeExtension = require('crx');

const [, , keyPath, outputPath] = process.argv;

if (!keyPath || !outputPath) {
  console.error('Usage: node scripts/pack-crx.js <key.pem> <output.crx>');
  process.exit(1);
}

const crx = new ChromeExtension({
  // Read as a utf8 string, not a raw Buffer — node-rsa (used internally by
  // `crx`) auto-detects a PEM's format from a string but throws "Key
  // format must be specified" when given a Buffer instead.
  privateKey: fs.readFileSync(path.resolve(keyPath), 'utf8')
});

crx
  .load(path.resolve('release-package'))
  .then(loaded => loaded.pack())
  .then(crxBuffer => {
    fs.writeFileSync(path.resolve(outputPath), crxBuffer);
    console.log(`Wrote ${outputPath} (${crxBuffer.length} bytes)`);
  })
  .catch(err => {
    console.error('Failed to pack .crx:', err);
    process.exit(1);
  });