# Scratch JS Editor — Chrome build

Same extension as the Firefox version, packaged for Chrome (Manifest V3,
no Firefox-only `browser_specific_settings` key).

## Build

```bash
npm install
npm run build
```

This produces `dist/js-editor-extension.js` plus Monaco's worker and font
assets, which `manifest.json` references.

## Install in Chrome

1. Run the build step above.
2. Go to chrome://extensions
3. Turn on "Developer mode" (top-right toggle).
4. Click "Load unpacked".
5. Select this folder (the one containing manifest.json).
6. Open a Scratch project editor (scratch.mit.edu/projects/<id>/editor/) and
   look for the "View as JS" button near the green flag.

## Notes

- Only runs on scratch.mit.edu project editor pages.
- Needs the live Blockly workspace to generate the JS view — if that can't
  be located on your build of Scratch, it'll show an error via alert()
  instead of a blank panel; check the console for `[Scratch JS Editor]`
  logs.
