import { initHUD } from './ui/hud.js';
import { Game } from './game/game.js';
import { RED, findGeneral } from './game/board.js';
import { createScene, gridToWorld } from './scene/scene.js';
import { buildAllPieces, restingY, placePieceMesh } from './scene/pieces.js';
import { createHighlights } from './scene/highlights.js';
import { createPicker } from './scene/picker.js';
import { createCameraRig } from './scene/camera-rig.js';
import { updateTweens, tweenPromise, setTimeScale, ease } from './scene/tween.js';
import * as sfx from './audio/sfx.js';
import * as persistence from './store/persistence.js';
import { createMLG } from './fx/mlg.js';

// --- Boot: restore a saved game if present ---
const saved = persistence.load();
let game;
try {
  game = saved ? Game.replay(saved.moves) : new Game();
} catch {
  persistence.clear();
  game = new Game();
}
const settings = {
  autoFlip: saved?.settings.autoFlip ?? false,
  muted: saved?.settings.muted ?? false,
  mlg: saved?.settings.mlg ?? false,
  symbols: saved?.settings.symbols ?? false,
};
sfx.setMuted(settings.muted);

// --- Scene ---
const container = document.getElementById('scene-container');
const { scene, camera, renderer, pieceGroup, highlightGroup, fxGroup, boardMesh } = createScene(container);
const rig = createCameraRig(camera);
let meshes = buildAllPieces(game.board, pieceGroup, settings.symbols);
const highlights = createHighlights(highlightGroup);
const mlg = createMLG({
  container,
  layer: document.getElementById('mlg-layer'),
  camera,
  fxGroup,
  rig,
  getHistory: () => game.history,
  getSymbols: () => settings.symbols,
  getMeshes: () => meshes,
});
mlg.setEnabled(settings.mlg);

function findPieceCoords(pieceId) {
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      if (game.board[r][c]?.id === pieceId) return { row: r, col: c };
    }
  }
  return null;
}
const pick = createPicker(renderer, camera, pieceGroup, boardMesh, findPieceCoords);

// --- State ---
let busy = false;
let selected = null; // { row, col, moves }
let overlayTimer = null;

// The game-over banner is delayed so it never sits on top of the ending
// animation (MLG celebrations run for several seconds).
function scheduleGameOver() {
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(
    () => hud.showGameOver(game.status, { mlg: settings.mlg }),
    mlg.enabled ? 4000 : 800,
  );
}

function cancelGameOverTimer() {
  clearTimeout(overlayTimer);
  overlayTimer = null;
}

function saveNow() {
  persistence.save(game, settings);
}

function meshOf(piece) {
  return meshes.get(piece.id);
}

function liftSelected(mesh, lifted) {
  mesh.position.y = restingY() + (lifted ? 0.15 : 0);
}

function clearSelection() {
  if (selected) {
    const piece = game.board[selected.row]?.[selected.col];
    if (piece) liftSelected(meshOf(piece), false);
  }
  selected = null;
  highlights.clearSelection();
}

function lastMoveOf(history) {
  const rec = history[history.length - 1];
  return rec ? [rec.move.from, rec.move.to] : [null, null];
}

// --- HUD ---
const hud = initHUD({
  onNewGame: newGame,
  onUndo: undo,
  onAutoFlipChange(value) {
    settings.autoFlip = value;
    saveNow();
    if (busy) return;
    flipCameraFor(value ? game.turn : RED);
  },
  onSymbolsChange(value) {
    settings.symbols = value;
    clearSelection();
    meshes = buildAllPieces(game.board, pieceGroup, settings.symbols);
    hud.setSymbolMode(value);
    hud.renderHistory(game.history);
    mlg.syncFromHistory();
    saveNow();
  },
  onSoundChange(value) {
    settings.muted = !value;
    sfx.setMuted(settings.muted);
    saveNow();
  },
  onMlgChange(value) {
    settings.mlg = value;
    mlg.setEnabled(value, { splash: value });
    saveNow();
  },
});

function syncHUD() {
  hud.setSymbolMode(settings.symbols);
  hud.setTurn(game.turn);
  hud.setCheck(game.status.inCheck);
  hud.renderHistory(game.history);
  hud.setToggles({
    autoFlip: settings.autoFlip,
    symbols: settings.symbols,
    sound: !settings.muted,
    mlg: settings.mlg,
  });
  if (game.status.over) hud.showGameOver(game.status, { mlg: settings.mlg });
  else hud.hideGameOver();
}

async function flipCameraFor(side) {
  if (rig.side === side) return;
  busy = true;
  hud.setBusy(true);
  await rig.flipTo(side);
  busy = false;
  hud.setBusy(false);
}

// --- Animations ---
function slide(mesh, from, to, duration = 0.32) {
  const a = gridToWorld(from[0], from[1]);
  const b = gridToWorld(to[0], to[1]);
  const baseY = restingY();
  return tweenPromise({
    duration,
    easing: ease.inOutCubic,
    onUpdate: (t) => {
      mesh.position.set(
        a.x + (b.x - a.x) * t,
        baseY + Math.sin(t * Math.PI) * 0.45,
        a.z + (b.z - a.z) * t,
      );
    },
    onComplete: () => {
      mesh.position.set(b.x, baseY, b.z);
    },
  });
}

function setMeshOpacity(mesh, opacity) {
  for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    mat.transparent = opacity < 1;
    mat.opacity = opacity;
  }
}

function fadeSink(mesh) {
  const baseY = mesh.position.y;
  return tweenPromise({
    duration: 0.25,
    onUpdate: (t) => {
      setMeshOpacity(mesh, 1 - t);
      mesh.position.y = baseY - 0.15 * t;
    },
    onComplete: () => {
      mesh.visible = false;
      setMeshOpacity(mesh, 1);
      mesh.position.y = restingY();
    },
  });
}

function fadeIn(mesh, row, col) {
  placePieceMesh(mesh, row, col);
  mesh.visible = true;
  return tweenPromise({
    duration: 0.2,
    onUpdate: (t) => setMeshOpacity(mesh, t),
    onComplete: () => setMeshOpacity(mesh, 1),
  });
}

// Captured meshes fade with opacity: cloning materials per-piece would defeat
// the shared caches, so capture animations temporarily toggle `transparent`
// on the shared side material - visually fine for a 250 ms fade.

// --- Core move pipeline ---
async function doMove(from, to) {
  busy = true;
  hud.setBusy(true);

  const record = game.makeMove(from, to);
  if (!record) {
    busy = false;
    hud.setBusy(false);
    return;
  }

  clearSelection();
  highlights.setLastMove(record.move.from, record.move.to);

  // MLG slow-mo: the mate-delivering move crawls. Busy flag blocks re-entry
  // for the whole await, and auto-flip is skipped when the game is over.
  const slowMo = mlg.enabled && game.status.over;
  if (slowMo) setTimeScale(0.3);
  try {
    const jobs = [slide(meshOf(record.piece), record.move.from, record.move.to)];
    if (record.captured) {
      const capturedMesh = meshOf(record.captured);
      jobs.push(mlg.captureAnimation(capturedMesh, record) ?? fadeSink(capturedMesh));
    }
    await Promise.all(jobs);
  } finally {
    setTimeScale(1);
  }

  if (record.captured) sfx.playCapture();
  else sfx.playMove();
  mlg.onMoveComplete(record, game.status);

  hud.setTurn(game.turn);
  hud.setCheck(record.checkAfter);
  hud.renderHistory(game.history);

  if (game.status.over) {
    scheduleGameOver();
    if (!mlg.enabled) sfx.playGameOver();
    mlg.onGameOver(game.status, findGeneral(game.board, game.status.winner));
  } else if (record.checkAfter) {
    sfx.playCheck();
    mlg.onCheck();
  }

  if (!game.status.over && settings.autoFlip && rig.side !== game.turn) {
    await rig.flipTo(game.turn);
  }

  saveNow();
  busy = false;
  hud.setBusy(false);
}

async function undo() {
  if (busy || game.history.length === 0) return;
  busy = true;
  hud.setBusy(true);

  const wasOver = game.status.over;
  const record = game.undo();
  clearSelection();
  cancelGameOverTimer();
  mlg.clear();
  mlg.syncFromHistory();
  if (wasOver) hud.hideGameOver();

  const jobs = [slide(meshOf(record.piece), record.move.to, record.move.from, 0.25)];
  if (record.captured) {
    jobs.push(fadeIn(meshOf(record.captured), record.move.to[0], record.move.to[1]));
  }
  await Promise.all(jobs);
  sfx.playUndo();

  const [lastFrom, lastTo] = lastMoveOf(game.history);
  highlights.setLastMove(lastFrom, lastTo);
  hud.setTurn(game.turn);
  hud.setCheck(game.status.inCheck);
  hud.renderHistory(game.history);

  if (settings.autoFlip && rig.side !== game.turn) {
    await rig.flipTo(game.turn);
  }

  saveNow();
  busy = false;
  hud.setBusy(false);
}

function newGame() {
  if (busy) return;
  game.reset();
  clearSelection();
  cancelGameOverTimer();
  highlights.setLastMove(null, null);
  mlg.onNewGame();
  meshes = buildAllPieces(game.board, pieceGroup, settings.symbols);
  syncHUD();
  persistence.clear();
  saveNow();
  if (settings.autoFlip) flipCameraFor(RED);
}

// --- Input ---
renderer.domElement.addEventListener('pointerdown', (event) => {
  sfx.ensureAudio();
  if (busy || game.status.over) return;

  const hit = pick(event);
  if (!hit) {
    clearSelection();
    return;
  }
  const { row, col } = hit;
  const piece = game.board[row][col];

  if (selected && selected.moves.some(([r, c]) => r === row && c === col)) {
    doMove([selected.row, selected.col], [row, col]);
    return;
  }

  if (piece && piece.color === game.turn) {
    if (selected && selected.row === row && selected.col === col) {
      clearSelection();
      return;
    }
    clearSelection();
    selected = { row, col, moves: game.getLegalMoves(row, col) };
    highlights.showSelection(row, col);
    highlights.showLegalDots(selected.moves, game.board);
    liftSelected(meshOf(piece), true);
    sfx.playSelect();
    return;
  }

  clearSelection();
});

// First gesture anywhere also unlocks audio (HUD buttons included).
window.addEventListener('pointerdown', () => sfx.ensureAudio(), { once: true });

// --- Restore visuals for a loaded game ---
const [lastFrom, lastTo] = lastMoveOf(game.history);
highlights.setLastMove(lastFrom, lastTo);
rig.setSideInstant(settings.autoFlip && !game.status.over ? game.turn : RED);
syncHUD();

// --- Render loop ---
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  updateTweens(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Dev helpers ---
if (import.meta.env.DEV) {
  window.game = game;
  window.mlg = mlg;
  window.debugPieceYs = () => [...meshes.values()]
    .filter((m) => m.visible)
    .map((m) => Math.round(m.position.y * 1000) / 1000);
  window.mlgTest = (name = 'gg') => {
    const pos = findGeneral(game.board, 'red');
    if (name === 'gg') mlg.onGameOver({ over: true, winner: 'red', reason: 'checkmate' }, pos);
    else if (name === 'bruh') mlg.onGameOver({ over: true, winner: 'red', reason: 'stalemate' }, pos);
    else if (name === 'splash') mlg.setEnabled(true, { splash: true });
    else console.warn('mlgTest: gg | bruh | splash');
  };
  window.gridScreenPos = (row, col) => {
    const v = gridToWorld(row, col).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
    };
  };
  if (location.search.includes('selftest')) {
    const { runSelfTests } = await import('./game/selftest.js');
    runSelfTests();
  }
  window.loadDebugPosition = async (name) => {
    const { DEBUG_POSITIONS } = await import('./game/selftest.js');
    const factory = DEBUG_POSITIONS[name];
    if (!factory) {
      console.warn(`Unknown position. Available: ${Object.keys(DEBUG_POSITIONS).join(', ')}`);
      return;
    }
    const { board, turn } = factory();
    game.reset();
    game.board = board;
    game.turn = turn;
    clearSelection();
    highlights.setLastMove(null, null);
    meshes = buildAllPieces(game.board, pieceGroup, settings.symbols);
    syncHUD();
  };
}
