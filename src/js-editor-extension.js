const BUILD_TAG = 'blocks-to-js-1';
console.log(`[Scratch JS Editor #${BUILD_TAG}] script starting to load`);

import './public-path';
import * as monaco from 'monaco-editor';

const LOG_PREFIX = `[Scratch JS Editor #${BUILD_TAG}]`;
console.log(LOG_PREFIX, 'monaco imported successfully, continuing setup');

const runtime = typeof browser !== 'undefined' ? browser : chrome;

// Monaco's workers (for tokenizing/IntelliSense) are separate scripts.
// `new Worker(url)` throws a SecurityError if `url` isn't same-origin as
// the page, and our worker files live at moz-extension://<uuid>/... while
// the content script runs on https://scratch.mit.edu. The standard fix is
// to hand the browser a same-origin Blob URL whose only job is to
// importScripts() the real, cross-origin worker file (importScripts is not
// subject to the same restriction).
self.MonacoEnvironment = {
  getWorkerUrl(moduleId, label) {
    const workerFile = label === 'javascript' || label === 'typescript'
      ? 'ts.worker.js'
      : 'editor.worker.js';
    const workerUrl = runtime.runtime.getURL(`dist/${workerFile}`);
    const blob = new Blob(
      [`importScripts(${JSON.stringify(workerUrl)});`],
      { type: 'application/javascript' }
    );
    return URL.createObjectURL(blob);
  }
};

// Same idea for the green-flag control's container box, if the heuristics
// in findGreenFlagBar() don't land on the right element. Right-click the
// correct box in DevTools > Inspect, Copy > Copy selector, paste here.
const GREEN_FLAG_SELECTOR = '.box_box_bP3Aq';

const SCRATCH_PURPLE = '#855CD6';
const SCRATCH_PURPLE_DARK = '#774DCB';
const SCRATCH_BG = '#F9F9FA';

// Function signatures shown on hover / used for syntax highlighting in the
// generated read-only view. Not executed anywhere — the view is a mirror
// of the blocks, not a program.
const CATEGORY_APIS = {
  Motion: `
declare function moveSteps(steps: number): void;
declare function turnRight(degrees: number): void;
declare function turnLeft(degrees: number): void;
declare function goToXY(x: number, y: number): void;
declare function glideSecsToXY(secs: number, x: number, y: number): void;
declare function pointInDirection(direction: number): void;
declare function changeXBy(dx: number): void;
declare function setXTo(x: number): void;
declare function changeYBy(dy: number): void;
declare function setYTo(y: number): void;
declare function ifOnEdgeBounce(): void;`,
  Looks: `
declare function sayForSecs(message: string, secs: number): void;
declare function say(message: string): void;
declare function thinkForSecs(message: string, secs: number): void;
declare function think(message: string): void;
declare function switchCostumeTo(costume: string): void;
declare function nextCostume(): void;
declare function switchBackdropTo(backdrop: string): void;
declare function changeSizeBy(delta: number): void;
declare function setSizeTo(percent: number): void;
declare function show(): void;
declare function hide(): void;`,
  Sound: `
declare function playSound(soundName: string): void;
declare function playSoundUntilDone(soundName: string): void;
declare function stopAllSounds(): void;
declare function changeVolumeBy(delta: number): void;
declare function setVolumeTo(percent: number): void;`,
  Events: `
declare function whenGreenFlagClicked(callback: () => void): void;
declare function whenKeyPressed(key: string, callback: () => void): void;
declare function whenThisSpriteClicked(callback: () => void): void;
declare function broadcast(message: string): void;
declare function broadcastAndWait(message: string): void;`,
  Control: `
declare function wait(secs: number): void;
declare function repeat(times: number, callback: () => void): void;
declare function forever(callback: () => void): void;
declare function ifThen(condition: boolean, callback: () => void): void;
declare function ifElse(condition: boolean, thenCallback: () => void, elseCallback: () => void): void;
declare function waitUntil(condition: () => boolean): void;
declare function repeatUntil(condition: () => boolean, callback: () => void): void;
declare function stopScript(option: string): void;`,
  Sensing: `
declare function touchingColor(color: string): boolean;
declare function isKeyPressed(key: string): boolean;
declare function isMouseDown(): boolean;
declare function mouseX(): number;
declare function mouseY(): number;
declare function askAndWait(question: string): void;
declare function answer(): string;
declare function distanceTo(target: string): number;`,
  Operators: `
declare function pickRandom(min: number, max: number): number;
declare function joinStrings(a: string, b: string): string;`,
  Variables: `
declare function setVariableTo(name: string, value: unknown): void;
declare function changeVariableBy(name: string, delta: number): void;`,
  Pen: `
declare function penDown(): void;
declare function penUp(): void;
declare function eraseAll(): void;
declare function stamp(): void;
declare function setPenColorTo(color: string): void;
declare function setPenSizeTo(size: number): void;`
};

let editor = null;
let themeDefined = false;
let extraLibAdded = false;
let buttonResizeHandler = null;
let workspaceRef = null;
let workspaceChangeListener = null;

function defineScratchTheme() {
  if (themeDefined) return;
  monaco.editor.defineTheme('scratch-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#333333',
      'editorLineNumber.foreground': '#B0B0C0',
      'editorCursor.foreground': SCRATCH_PURPLE,
      'editor.selectionBackground': '#D9CBFA'
    }
  });
  themeDefined = true;
}

function ensureExtraLib() {
  if (extraLibAdded) return;
  const source = Object.entries(CATEGORY_APIS)
    .map(([name, decl]) => `// ${name}\n${decl}`)
    .join('\n\n');
  monaco.languages.typescript.javascriptDefaults.addExtraLib(source, 'ts:scratch-blocks.d.ts');
  extraLibAdded = true;
}

function waitForBody(callback) {
  if (document.body) {
    return callback();
  }
  const observer = new MutationObserver((mutations, obs) => {
    if (document.body) {
      obs.disconnect();
      callback();
    }
  });
  observer.observe(document.documentElement, { childList: true });
}

// --- Locating Scratch's own UI so the button can blend in ---------------

function findGreenFlagElement() {
  const strategies = [
    () => document.querySelector('[class*="green-flag" i]'),
    () => document.querySelector('[class*="greenFlag" i]'),
    () => document.querySelector('img[src*="green-flag" i], img[alt*="go" i]'),
    () => document.querySelector('[title="Go" i], [aria-label="Go" i]'),
    () => document.querySelector('[title*="green flag" i], [aria-label*="green flag" i]')
  ];
  for (const strategy of strategies) {
    const el = strategy();
    if (el) return el;
  }
  return null;
}

function hasUsableSize(rect) {
  return rect.width > 4 && rect.height > 4;
}

function findGreenFlagBar() {
  if (GREEN_FLAG_SELECTOR) {
    const el = document.querySelector(GREEN_FLAG_SELECTOR);
    if (el && hasUsableSize(el.getBoundingClientRect())) {
      console.log(LOG_PREFIX, 'green flag bar via GREEN_FLAG_SELECTOR (trusted, manually confirmed):', el);
      return el;
    }
    if (el) {
      console.log(LOG_PREFIX, 'GREEN_FLAG_SELECTOR matched but element has no usable size — falling back', el.getBoundingClientRect());
    } else {
      console.log(LOG_PREFIX, 'GREEN_FLAG_SELECTOR matched nothing — falling back');
    }
  }
  const flag = findGreenFlagElement();
  if (!flag) {
    console.log(LOG_PREFIX, 'could not find the green flag element at all');
    return null;
  }
  let node = flag;
  for (let i = 0; i < 5 && node.parentElement; i++) {
    node = node.parentElement;
    if (node.children.length >= 2 && hasUsableSize(node.getBoundingClientRect())) {
      console.log(LOG_PREFIX, 'green flag bar via ancestor walk:', node);
      return node;
    }
  }
  const fallback = flag.parentElement || flag;
  console.log(LOG_PREFIX, 'green flag bar via immediate parent fallback:', fallback);
  return fallback;
}

// --- Locating the live Blockly workspace ---------------------------------
// Blockly (scratch-blocks) instances aren't exposed globally in production
// builds, so this tries a few ways to reach the live object, same as the
// standalone diagnostics/find-workspace.js script.
function findWorkspace() {
  if (window.Blockly && typeof window.Blockly.getMainWorkspace === 'function') {
    const ws = window.Blockly.getMainWorkspace();
    if (ws) return ws;
  }
  const svg = document.querySelector('.injectionDiv svg.blocklySvg');
  if (svg && svg.workspace) return svg.workspace;

  const container = document.querySelector('.injectionDiv');
  if (!container) return null;
  const fiberKey = Object.keys(container).find(
    k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
  );
  if (!fiberKey) return null;

  let fiber = container[fiberKey];
  let depth = 0;
  while (fiber && depth < 40) {
    const inst = fiber.stateNode;
    if (inst && inst.workspace) return inst.workspace;
    fiber = fiber.return;
    depth++;
  }
  return null;
}

// --- Blocks -> JS conversion ---------------------------------------------

const INDENT = '  ';

function fieldValue(block, name) {
  try {
    return block.getFieldValue(name);
  } catch (err) {
    return '';
  }
}

function jsString(value) {
  return JSON.stringify(String(value == null ? '' : value));
}

function sanitizeIdentifier(text) {
  const cleaned = String(text || 'block')
    .replace(/%[sbn]/g, ' ')
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (match, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
  if (!cleaned) return 'customBlock';
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}

// Returns a JS expression for a value/boolean input slot: recurses into a
// connected reporter block, or falls back to the input's shadow field.
function inputExpr(block, name) {
  const target = block.getInputTargetBlock ? block.getInputTargetBlock(name) : null;
  if (target) return blockToExpr(target);
  const shadowField = block.getField ? block.getField(name) : null;
  if (shadowField) return jsString(shadowField.getValue());
  return jsString('');
}

const EXPR_CONVERTERS = {
  operator_add: b => `(${inputExpr(b, 'NUM1')} + ${inputExpr(b, 'NUM2')})`,
  operator_subtract: b => `(${inputExpr(b, 'NUM1')} - ${inputExpr(b, 'NUM2')})`,
  operator_multiply: b => `(${inputExpr(b, 'NUM1')} * ${inputExpr(b, 'NUM2')})`,
  operator_divide: b => `(${inputExpr(b, 'NUM1')} / ${inputExpr(b, 'NUM2')})`,
  operator_mod: b => `(${inputExpr(b, 'NUM1')} % ${inputExpr(b, 'NUM2')})`,
  operator_random: b => `pickRandom(${inputExpr(b, 'FROM')}, ${inputExpr(b, 'TO')})`,
  operator_gt: b => `(${inputExpr(b, 'OPERAND1')} > ${inputExpr(b, 'OPERAND2')})`,
  operator_lt: b => `(${inputExpr(b, 'OPERAND1')} < ${inputExpr(b, 'OPERAND2')})`,
  operator_equals: b => `(${inputExpr(b, 'OPERAND1')} === ${inputExpr(b, 'OPERAND2')})`,
  operator_and: b => `(${inputExpr(b, 'OPERAND1')} && ${inputExpr(b, 'OPERAND2')})`,
  operator_or: b => `(${inputExpr(b, 'OPERAND1')} || ${inputExpr(b, 'OPERAND2')})`,
  operator_not: b => `!${inputExpr(b, 'OPERAND')}`,
  operator_join: b => `joinStrings(${inputExpr(b, 'STRING1')}, ${inputExpr(b, 'STRING2')})`,
  operator_length: b => `${inputExpr(b, 'STRING')}.length`,
  data_variable: b => sanitizeIdentifier(fieldValue(b, 'VARIABLE')),
  sensing_mousex: () => 'mouseX()',
  sensing_mousey: () => 'mouseY()',
  sensing_answer: () => 'answer()',
  sensing_touchingcolor: b => `touchingColor(${jsString(fieldValue(b, 'COLOR'))})`,
  sensing_keypressed: b => `isKeyPressed(${jsString(fieldValue(b, 'KEY_OPTION'))})`,
  sensing_mousedown: () => 'isMouseDown()',
  sensing_distanceto: b => `distanceTo(${jsString(fieldValue(b, 'DISTANCETOMENU'))})`
};

function blockToExpr(block) {
  if (!block) return 'undefined';
  const converter = EXPR_CONVERTERS[block.type];
  if (converter) return converter(block);
  return `/* unsupported: ${block.type} */ undefined`;
}

const STATEMENT_CONVERTERS = {
  motion_movesteps: b => `moveSteps(${inputExpr(b, 'STEPS')});`,
  motion_turnright: b => `turnRight(${inputExpr(b, 'DEGREES')});`,
  motion_turnleft: b => `turnLeft(${inputExpr(b, 'DEGREES')});`,
  motion_gotoxy: b => `goToXY(${inputExpr(b, 'X')}, ${inputExpr(b, 'Y')});`,
  motion_glidesecstoxy: b => `glideSecsToXY(${inputExpr(b, 'SECS')}, ${inputExpr(b, 'X')}, ${inputExpr(b, 'Y')});`,
  motion_pointindirection: b => `pointInDirection(${inputExpr(b, 'DIRECTION')});`,
  motion_changexby: b => `changeXBy(${inputExpr(b, 'DX')});`,
  motion_setx: b => `setXTo(${inputExpr(b, 'X')});`,
  motion_changeyby: b => `changeYBy(${inputExpr(b, 'DY')});`,
  motion_sety: b => `setYTo(${inputExpr(b, 'Y')});`,
  motion_ifonedgebounce: () => 'ifOnEdgeBounce();',

  looks_sayforsecs: b => `sayForSecs(${inputExpr(b, 'MESSAGE')}, ${inputExpr(b, 'SECS')});`,
  looks_say: b => `say(${inputExpr(b, 'MESSAGE')});`,
  looks_thinkforsecs: b => `thinkForSecs(${inputExpr(b, 'MESSAGE')}, ${inputExpr(b, 'SECS')});`,
  looks_think: b => `think(${inputExpr(b, 'MESSAGE')});`,
  looks_switchcostumeto: b => `switchCostumeTo(${jsString(fieldValue(b, 'COSTUME'))});`,
  looks_nextcostume: () => 'nextCostume();',
  looks_switchbackdropto: b => `switchBackdropTo(${jsString(fieldValue(b, 'BACKDROP'))});`,
  looks_changesizeby: b => `changeSizeBy(${inputExpr(b, 'CHANGE')});`,
  looks_setsizeto: b => `setSizeTo(${inputExpr(b, 'SIZE')});`,
  looks_show: () => 'show();',
  looks_hide: () => 'hide();',

  sound_play: b => `playSound(${jsString(fieldValue(b, 'SOUND_MENU'))});`,
  sound_playuntildone: b => `playSoundUntilDone(${jsString(fieldValue(b, 'SOUND_MENU'))});`,
  sound_stopallsounds: () => 'stopAllSounds();',
  sound_changevolumeby: b => `changeVolumeBy(${inputExpr(b, 'VOLUME')});`,
  sound_setvolumeto: b => `setVolumeTo(${inputExpr(b, 'VOLUME')});`,

  event_broadcast: b => `broadcast(${jsString(fieldValue(b, 'BROADCAST_INPUT'))});`,
  event_broadcastandwait: b => `broadcastAndWait(${jsString(fieldValue(b, 'BROADCAST_INPUT'))});`,

  control_wait: b => `wait(${inputExpr(b, 'DURATION')});`,
  control_wait_until: b => `waitUntil(() => ${inputExpr(b, 'CONDITION')});`,
  control_stop: b => `stopScript(${jsString(fieldValue(b, 'STOP_OPTION'))});`,

  sensing_askandwait: b => `askAndWait(${inputExpr(b, 'QUESTION')});`,

  data_setvariableto: b => `setVariableTo(${jsString(fieldValue(b, 'VARIABLE'))}, ${inputExpr(b, 'VALUE')});`,
  data_changevariableby: b => `changeVariableBy(${jsString(fieldValue(b, 'VARIABLE'))}, ${inputExpr(b, 'VALUE')});`,

  pen_clear: () => 'eraseAll();',
  pen_stamp: () => 'stamp();',
  pen_penDown: () => 'penDown();',
  pen_penUp: () => 'penUp();',
  pen_setPenColorToColor: b => `setPenColorTo(${inputExpr(b, 'COLOR')});`,
  pen_setPenSizeTo: b => `setPenSizeTo(${inputExpr(b, 'SIZE')});`
};

function getProcedureName(block) {
  return block.procCode_ || block.type;
}

function convertOne(block, indent) {
  const pad = INDENT.repeat(indent);

  switch (block.type) {
    case 'control_repeat': {
      const body = blockToLines(block.getInputTargetBlock('SUBSTACK'), indent + 1);
      return [`${pad}repeat(${inputExpr(block, 'TIMES')}, () => {`, ...body, `${pad}});`];
    }
    case 'control_forever': {
      const body = blockToLines(block.getInputTargetBlock('SUBSTACK'), indent + 1);
      return [`${pad}forever(() => {`, ...body, `${pad}});`];
    }
    case 'control_repeat_until': {
      const body = blockToLines(block.getInputTargetBlock('SUBSTACK'), indent + 1);
      return [`${pad}repeatUntil(() => ${inputExpr(block, 'CONDITION')}, () => {`, ...body, `${pad}});`];
    }
    case 'control_if': {
      const body = blockToLines(block.getInputTargetBlock('SUBSTACK'), indent + 1);
      return [`${pad}ifThen(${inputExpr(block, 'CONDITION')}, () => {`, ...body, `${pad}});`];
    }
    case 'control_if_else': {
      const thenBody = blockToLines(block.getInputTargetBlock('SUBSTACK'), indent + 1);
      const elseBody = blockToLines(block.getInputTargetBlock('SUBSTACK2'), indent + 1);
      return [
        `${pad}ifElse(${inputExpr(block, 'CONDITION')}, () => {`,
        ...thenBody,
        `${pad}}, () => {`,
        ...elseBody,
        `${pad}});`
      ];
    }
    case 'procedures_call':
    case 'procedures_callnoreturn':
    case 'procedures_callnoreturn_internal': {
      const args = (block.inputList || [])
        .filter(input => input.name && input.name.startsWith('ARG'))
        .map(input => inputExpr(block, input.name));
      const name = sanitizeIdentifier(getProcedureName(block));
      return [`${pad}${name}(${args.join(', ')});`];
    }
    default: {
      const converter = STATEMENT_CONVERTERS[block.type];
      if (converter) return [`${pad}${converter(block)}`];
      return [`${pad}// unsupported block: ${block.type}`];
    }
  }
}

function blockToLines(startBlock, indent) {
  const lines = [];
  let current = startBlock;
  while (current) {
    lines.push(...convertOne(current, indent));
    current = current.getNextBlock ? current.getNextBlock() : null;
  }
  return lines;
}

function proceduresDefinitionToJs(defBlock) {
  const prototype = defBlock.getInputTargetBlock ? defBlock.getInputTargetBlock('custom_block') : null;
  if (!prototype) return '// unsupported custom block definition';
  const name = sanitizeIdentifier(prototype.procCode_ || 'customBlock');
  const argNames = (prototype.argumentNames_ || []).map(sanitizeIdentifier);
  const body = blockToLines(defBlock.getNextBlock ? defBlock.getNextBlock() : null, 1);
  return [`function ${name}(${argNames.join(', ')}) {`, ...body, '}'].join('\n');
}

const HAT_WRAPPERS = {
  event_whenflagclicked: () => 'whenGreenFlagClicked(() => {',
  event_whenkeypressed: b => `whenKeyPressed(${jsString(fieldValue(b, 'KEY_OPTION'))}, () => {`,
  event_whenthisspriteclicked: () => 'whenThisSpriteClicked(() => {'
};

function workspaceToJs(workspace) {
  const topBlocks = workspace.getTopBlocks(true);
  const parts = [];

  for (const block of topBlocks) {
    if (block.type === 'procedures_definition') {
      parts.push(proceduresDefinitionToJs(block));
      continue;
    }
    if (block.type === 'procedures_prototype') {
      continue; // handled as part of its procedures_definition
    }

    const wrapHeader = HAT_WRAPPERS[block.type];
    const body = blockToLines(block.getNextBlock ? block.getNextBlock() : null, 1);
    if (wrapHeader) {
      parts.push([wrapHeader(block), ...body, '});'].join('\n'));
    } else {
      // Orphan stack (not under a recognized hat block).
      parts.push(blockToLines(block, 0).join('\n'));
    }
  }

  return parts.join('\n\n') || '// No blocks in this workspace yet.';
}

function refreshGeneratedJs() {
  if (!editor || !workspaceRef) return;
  try {
    editor.setValue(workspaceToJs(workspaceRef));
  } catch (err) {
    console.error(LOG_PREFIX, 'error generating JS from blocks:', err);
    editor.setValue(`// Error generating JS from blocks — see console.\n// ${err}`);
  }
}

// --- Toolbar button ----------------------------------------------------

function styleButton(button) {
  Object.assign(button.style, {
    zIndex: '2147483647',
    padding: '4px 10px',
    background: SCRATCH_PURPLE,
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '700',
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
  });
  button.addEventListener('mouseenter', () => { button.style.background = SCRATCH_PURPLE_DARK; });
  button.addEventListener('mouseleave', () => { button.style.background = SCRATCH_PURPLE; });
}

function positionButtonInBar(button, bar) {
  const useFallback = () => {
    Object.assign(button.style, { position: 'fixed', top: '16px', right: '16px', transform: 'none' });
  };
  if (!bar) {
    useFallback();
    return;
  }
  const update = () => {
    const rect = bar.getBoundingClientRect();
    if (!hasUsableSize(rect)) {
      console.log(LOG_PREFIX, 'green flag bar has no usable size, using fallback position', rect);
      useFallback();
      return;
    }
    Object.assign(button.style, {
      position: 'fixed',
      top: `${rect.top + rect.height / 2}px`,
      left: `${rect.left + rect.width / 2}px`,
      transform: 'translate(-50%, -50%)'
    });
  };
  update();
  buttonResizeHandler = update;
  window.addEventListener('resize', buttonResizeHandler);
}

function createOpenButton() {
  if (document.getElementById('scratch-js-editor-open-button')) return;

  const button = document.createElement('button');
  button.id = 'scratch-js-editor-open-button';
  button.textContent = 'View as JS';
  styleButton(button);
  button.addEventListener('click', createEditorOverlay);
  Object.assign(button.style, { position: 'fixed', top: '16px', right: '16px' });
  document.body.appendChild(button);
  console.log(LOG_PREFIX, 'button appended to page');

  try {
    const bar = findGreenFlagBar();
    positionButtonInBar(button, bar);
  } catch (err) {
    console.error(LOG_PREFIX, 'error while positioning button, leaving it at the fallback spot:', err);
  }
}

// --- Editor overlay (docked at the bottom, doesn't cover the toolbox) ---

function createEditorOverlay() {
  if (document.getElementById('scratch-js-editor-overlay')) return;
  defineScratchTheme();

  workspaceRef = findWorkspace();
  if (!workspaceRef) {
    console.error(LOG_PREFIX, 'could not locate the live Blockly workspace — cannot generate JS view');
    alert('Could not find the Blockly workspace. Check the console for details.');
    workspaceRef = null;
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'scratch-js-editor-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '0',
    width: '100%',
    height: '280px',
    background: SCRATCH_BG,
    borderTop: '2px solid #ddd',
    boxShadow: '0 -4px 12px rgba(0,0,0,0.15)',
    zIndex: '2147483647',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
  });

  overlay.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:${SCRATCH_PURPLE};color:#fff;">
      <span style="font-weight:700;font-size:13px;">Blocks as JS (read-only)</span>
      <button id="scratch-js-close" style="background:rgba(255,255,255,0.25);border:none;color:#fff;padding:4px 10px;cursor:pointer;border-radius:4px;font-weight:700;">Close</button>
    </div>
    <div id="scratch-js-code" style="flex:1;min-height:0;"></div>
  `;

  document.body.appendChild(overlay);
  ensureExtraLib();

  editor = monaco.editor.create(document.getElementById('scratch-js-code'), {
    value: '',
    language: 'javascript',
    theme: 'scratch-light',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    readOnly: true
  });

  refreshGeneratedJs();
  workspaceChangeListener = () => refreshGeneratedJs();
  workspaceRef.addChangeListener(workspaceChangeListener);

  document.getElementById('scratch-js-close').addEventListener('click', () => closeEditorOverlay(overlay));
}

function closeEditorOverlay(overlay) {
  if (editor) {
    editor.dispose();
    editor = null;
  }
  if (workspaceRef && workspaceChangeListener) {
    workspaceRef.removeChangeListener(workspaceChangeListener);
  }
  workspaceChangeListener = null;
  workspaceRef = null;
  overlay.remove();
}

waitForBody(() => {
  createOpenButton();
});
