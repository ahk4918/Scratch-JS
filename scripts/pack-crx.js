// scripts/pack-crx.js
// Packs a pre-built extension .zip into a signed .crx (CRX3 format)
// using the official 'crx3' library.
//
// Usage: node scripts/pack-crx.js <key.pem> <input.zip> <output.crx>

const fs = require('fs');
const path = require('path');
const crx3 = require('crx3');

const [, , keyPath, zipPath, outputPath] = process.argv;

if (!keyPath || !zipPath || outputPath === undefined) {
  console.error('Usage: node scripts/pack-crx.js <key.pem> <input.zip> <output.crx>');
  process.exit(1);
}

const resolvedKeyPath = path.resolve(keyPath);
const resolvedZipPath = path.resolve(zipPath);
const resolvedOutputPath = path.resolve(outputPath);

// 1. Pre-flight verification checks
if (!fs.existsSync(resolvedKeyPath)) {
  console.error(`Private key file not found at: ${resolvedKeyPath}`);
  process.exit(1);
}

if (!fs.existsSync(resolvedZipPath)) {
  console.error(`Input ZIP file package not found at: ${resolvedZipPath}`);
  process.exit(1);
}

console.log(`Packing extension archive via crx3...`);

// 2. Generate the signed CRX3 package
crx3([resolvedZipPath], {
  keyPath: resolvedKeyPath,
  crxPath: resolvedOutputPath
})
  .then(() => {
    // 3. Print out structural details for debugging confirmation
    const crxBuffer = fs.readFileSync(resolvedOutputPath);
    console.log(`Successfully wrote ${outputPath} (${crxBuffer.length} bytes) using crx3 wrapper.`);
  })
  .catch((err) => {
    console.error('Failed to parse or pack the CRX extension package:', err);
    process.exit(1);
  });
