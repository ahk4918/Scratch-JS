// Not used by the extension itself (Firefox loads dist/js-editor-extension.js
// directly per manifest.json). Kept only for tooling/tests that want to
// import the source module in Node.
module.exports = require('./src/js-editor-extension');
