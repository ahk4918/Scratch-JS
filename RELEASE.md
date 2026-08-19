## What's new

- Adds a "View as JS" button next to the green-flag controls in the Scratch project editor.
- Shows a live, read-only JavaScript view generated from the blocks currently in the workspace — updates automatically as blocks are added, removed, or edited.
- Custom blocks ("My Blocks") are converted into JS `function` declarations; calls to them become function calls with their arguments.
- Covers the common Motion, Looks, Sound, Events, Control, Sensing, Operators, Variables, and Pen blocks. Anything not yet supported shows as `// unsupported block: <type>` instead of silently producing incorrect output.
- The block toolbox and workspace are left fully visible and usable — the JS view docks in its own panel at the bottom of the screen rather than covering anything.
- Chrome build support (Manifest V3) using the official `manifest.json`.

## Notes

- This is a viewer, not an editor — the generated JS can't be edited and run back into the project. Nothing here changes what actually executes; it's a read-only mirror of the blocks.
- Only runs on `scratch.mit.edu` project editor pages (`/projects/*/editor/*`).