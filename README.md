# Scratch JS Editor Firefox Add-on

A Firefox WebExtension that injects a Monaco-powered JavaScript editor overlay into Scratch.

## Files

- `manifest.json` — Firefox extension manifest (loads `dist/js-editor-extension.js`)
- `src/js-editor-extension.js` — content script source, injected into Scratch pages
- `src/public-path.js` — sets webpack's runtime public path so Monaco can find its worker/font assets at the extension's `moz-extension://` origin
- `webpack.config.js` — bundles the content script + Monaco into `dist/`
- `package.json` — build tooling and dependencies
- `.gitignore` — ignored files (`node_modules/`, `dist/`)

## Build

Monaco is not something you can load as a plain `<script>` — it needs to be
bundled, and its web workers need a small runtime fix to load across origins.
Build it once before loading the extension, and rebuild after any source
change:

```bash
npm install
npm run build
```

This produces `dist/js-editor-extension.js` plus Monaco's worker and font
assets (`dist/*.js`, `dist/*.ttf`), which `manifest.json` already references.

## Install in Firefox

1. Run the build step above.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click `Load Temporary Add-on`.
4. Select `manifest.json` from this folder.
5. Open `https://scratch.mit.edu` and click the `Open JS Editor` button.

## Notes

- This is a Firefox extension, not a Scratch GUI plugin.
- It works only on `scratch.mit.edu` pages.
- Save/load uses the page's `localStorage`.
- `strict_min_version` in `manifest.json` is `109.0` — MV3 content scripts
  and Monaco's worker approach need a reasonably modern Firefox.
