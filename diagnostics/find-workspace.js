// Paste this into the browser DevTools console while on a Scratch editor
// tab. It tries a few ways to locate the live Blockly workspace object,
// which a JS-to-blocks compiler needs in order to create real blocks.
// Report back whichever branch logs a result (and the object it prints).
(function () {
  // 1) Direct global — rare in production builds, but cheap to check.
  if (window.Blockly && typeof window.Blockly.getMainWorkspace === 'function') {
    console.log('[found] global Blockly.getMainWorkspace():', window.Blockly.getMainWorkspace());
    return;
  }

  // 2) Blockly stashes a reference to the workspace on the SVG it renders
  // into.
  const svg = document.querySelector('.injectionDiv svg.blocklySvg');
  if (svg && svg.workspace) {
    console.log('[found] svg.workspace:', svg.workspace);
    window.__scratchWorkspace = svg.workspace;
    console.log('Stashed at window.__scratchWorkspace');
    return;
  }

  // 3) Walk up the React fiber tree from .injectionDiv looking for a
  // component instance with a `.workspace` property (scratch-gui's Blocks
  // component keeps the ScratchBlocks workspace as `this.workspace`).
  const container = document.querySelector('.injectionDiv');
  if (!container) {
    console.log('[miss] no .injectionDiv on the page.');
    return;
  }
  const fiberKey = Object.keys(container).find(
    k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
  );
  if (!fiberKey) {
    console.log('[miss] no React fiber key found on .injectionDiv — is React DevTools-style access blocked?');
    return;
  }

  let fiber = container[fiberKey];
  let depth = 0;
  while (fiber && depth < 40) {
    const inst = fiber.stateNode;
    if (inst && inst.workspace) {
      console.log(`[found] component with .workspace at fiber depth ${depth}:`, inst);
      window.__scratchWorkspace = inst.workspace;
      console.log('Stashed at window.__scratchWorkspace');
      return;
    }
    fiber = fiber.return;
    depth++;
  }

  console.log('[miss] walked 40 fiber levels without finding a .workspace property.');
})();
