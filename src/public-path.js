// This must be the FIRST thing imported by the entry file. Monaco lazily
// loads worker scripts and font assets from webpack's public path, but a
// content script runs on the page's origin (https://scratch.mit.edu), not
// the extension's origin — so we can't hardcode a path at build time.
// Firefox assigns each installed extension a random moz-extension://<uuid>
// origin, only known at runtime via browser.runtime.getURL().
if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getURL) {
  // eslint-disable-next-line no-undef, camelcase
  __webpack_public_path__ = browser.runtime.getURL('dist/');
} else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
  // eslint-disable-next-line no-undef, camelcase
  __webpack_public_path__ = chrome.runtime.getURL('dist/');
}
