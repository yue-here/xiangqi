// End-to-end verification: drives the running dev server through Edge.
import puppeteer from 'puppeteer-core';

const SHOT_DIR = 'C:/Users/y_w_u/AppData/Local/Temp/claude/c--Users-y-w-u-Code-xiangqi/05e90332-ed0a-43e0-9863-773a777a16c1/scratchpad';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const results = [];
const check = (label, cond) => {
  results.push({ label, ok: Boolean(cond) });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1400,900', '--disable-gpu'],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();

// Collect console output for the selftest run.
const consoleLines = [];
page.on('console', (msg) => consoleLines.push(msg.text()));
page.on('pageerror', (err) => consoleLines.push(`PAGEERROR: ${err.message}`));

// Fresh state.
await page.goto('http://localhost:5173/?selftest=1', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.goto('http://localhost:5173/?selftest=1', { waitUntil: 'load' });
await sleep(800);

check('no page errors on load', !consoleLines.some((l) => l.startsWith('PAGEERROR')));
check('browser selftest all pass', consoleLines.some((l) => /all \d+ assertions passed/.test(l))
  && !consoleLines.some((l) => l.includes('FAILED')));

const clickGrid = async (row, col) => {
  const pos = await page.evaluate((r, c) => window.gridScreenPos(r, c), row, col);
  await page.mouse.click(pos.x, pos.y);
};

// Wait for the busy flag to clear (buttons re-enabled after animations).
const waitIdle = () => page.waitForFunction(
  () => !document.getElementById('btn-new').disabled,
  { timeout: 5000 },
);

// --- Select red cannon (2,7): expect legal dots ---
await clickGrid(2, 7);
await sleep(300);
await page.screenshot({ path: `${SHOT_DIR}/verify-1-selection.png` });

// --- Cannon captures horse over screen: (2,7) -> (9,7) ---
await clickGrid(9, 7);
await sleep(900); // slide + capture animations
const state1 = await page.evaluate(() => ({
  historyLen: window.game.history.length,
  notation: window.game.history[0]?.notation,
  capturedType: window.game.history[0]?.captured?.type,
  turn: window.game.turn,
  moveListText: document.getElementById('move-list').textContent,
}));
check('cannon capture accepted', state1.historyLen === 1);
check('notation is C2+7', state1.notation === 'C2+7');
check('captured piece is horse', state1.capturedType === 'H');
check('turn passed to black', state1.turn === 'black');
check('history panel shows move', state1.moveListText.includes('C2+7'));
await page.screenshot({ path: `${SHOT_DIR}/verify-2-after-capture.png` });

// --- Illegal click does nothing: black piece can't move to random square ---
await clickGrid(9, 8); // black chariot
await sleep(200);
await clickGrid(5, 8); // not a legal chariot move (blocked? (9,8)->(5,8) actually may be legal!)
await sleep(600);

// --- Undo: horse must come back ---
const undoBefore = await page.evaluate(() => window.game.history.length);
await page.click('#btn-undo');
await sleep(700);
const state2 = await page.evaluate(() => ({
  historyLen: window.game.history.length,
  horseBack: window.game.board[9][7]?.type === 'H',
  cannonBack: window.game.board[2][7]?.type === 'C',
  turn: window.game.turn,
}));
check('undo removes one ply', state2.historyLen === undoBefore - 1);
check('undo restores horse mesh/logic', state2.horseBack);
check('undo returns cannon', state2.cannonBack);
check('undo restores red turn', state2.turn === 'red');
await page.screenshot({ path: `${SHOT_DIR}/verify-3-after-undo.png` });

// --- Auto-flip: enable, make a red move, camera should rotate to black side ---
await page.click('#chk-flip');
await sleep(300);
await clickGrid(2, 1); // red left cannon
await sleep(200);
await clickGrid(2, 4); // C8=5 traverse
await sleep(1800); // move + camera flip
const flipShot = `${SHOT_DIR}/verify-4-flipped.png`;
await page.screenshot({ path: flipShot });
const state3 = await page.evaluate(() => ({
  turn: window.game.turn,
  autoFlip: document.getElementById('chk-flip').checked,
}));
check('auto-flip toggle on', state3.autoFlip);
check('turn is black after cannon traverse', state3.turn === 'black');

// --- Persistence: reload, game + settings must survive ---
await page.reload({ waitUntil: 'load' });
await sleep(800);
const state4 = await page.evaluate(() => ({
  historyLen: window.game.history.length,
  autoFlip: document.getElementById('chk-flip').checked,
  moveListText: document.getElementById('move-list').textContent,
}));
check('game restored after reload', state4.historyLen === 1);
check('auto-flip setting restored', state4.autoFlip);
check('history panel restored', state4.moveListText.includes('C8=5'));
await page.screenshot({ path: `${SHOT_DIR}/verify-5-restored.png` });

// --- Symbolic mode: chess glyphs + notation-only history, persisted ---
await page.click('#chk-symbols');
await sleep(500);
const sym1 = await page.evaluate(() => ({
  moveListText: document.getElementById('move-list').textContent,
  checked: document.getElementById('chk-symbols').checked,
}));
check('symbols: history drops Chinese prefix', sym1.checked
  && sym1.moveListText.includes('C8=5') && !sym1.moveListText.includes('炮'));
await page.screenshot({ path: `${SHOT_DIR}/verify-8-symbolic.png` });
await page.reload({ waitUntil: 'load' });
await sleep(800);
const sym2 = await page.evaluate(() => ({
  checked: document.getElementById('chk-symbols').checked,
  moveListText: document.getElementById('move-list').textContent,
}));
check('symbols: setting survives reload', sym2.checked && !sym2.moveListText.includes('炮'));

// --- MLG mode: enable (expect activation splash), capture something ---
await page.click('#chk-mlg');
await sleep(300);
const splash = await page.evaluate(() => ({
  splashText: document.querySelector('.mlg-impact--activate')?.textContent ?? '',
  scoreboard: Boolean(document.querySelector('.mlg-scoreboard')),
}));
check('MLG activation splash shown', splash.splashText.includes('MLG MODE ACTIVATED'));
check('MLG scoreboard appears on enable', splash.scoreboard);
await sleep(1700); // let the splash finish
// Black to move (auto-flip restored to black side). Black cannon (7,7) takes
// the red... let's check what's capturable: play black cannon (7,1) -> (0,1)?
// Screen at (2,1)? Red cannon moved to (2,4). Column 1: (7,1) black cannon,
// (9,1)? no wait. Use horse instead: black horse (9,7) -> (7,6)? no capture.
// Simplest capture: black cannon (7,7) over screen... column 7 after C2 came
// back: red cannon back at (2,7)? No - undo returned it, then we moved the
// LEFT cannon (2,1). So col 7: black cannon (7,7), screen (6,7)? empty...
// pieces on col 7: (2,7) red C, (7,7) black C, (9,7)? horse restored... hmm
// (9,7) black H. From (7,7) sliding down: (6,7)(5,7)(4,7)(3,7) empty, screen
// = (2,7) red cannon, beyond: (0,7) red horse at (0,7)! capture C8+7.
await clickGrid(7, 7);
await sleep(300);
await clickGrid(0, 7);
await sleep(500); // mid-animation + effects
// Piece rattle: bystander pieces should be airborne right now.
const airborne = await page.evaluate(
  () => window.debugPieceYs().filter((y) => y > 0.14 && y < 1.0).length,
);
check('piece rattle lifts bystanders', airborne >= 2);
// SSB KO star pops the moment the launched piece exits the viewport.
const koSeen = await page.waitForSelector('.mlg-ko-star', { timeout: 3000 })
  .then(() => true).catch(() => false);
check('SSB KO star fired at viewport exit', koSeen);
const mlgState = await page.evaluate(() => ({
  layerChildren: document.getElementById('mlg-layer').children.length,
  captured: window.game.history.at(-1)?.captured?.type,
  feedRows: document.querySelectorAll('.mlg-feed-row').length,
  scoreText: document.querySelector('.mlg-scoreboard')?.textContent ?? '',
}));
await page.screenshot({ path: `${SHOT_DIR}/verify-6-mlg-capture.png` });
check('MLG capture happened (horse)', mlgState.captured === 'H');
check('MLG overlay elements spawned', mlgState.layerChildren > 0);
check('MLG kill feed has entries', mlgState.feedRows >= 1);
check('MLG score counts the horse (300)', mlgState.scoreText.includes('300'));

// Rattle settles: every piece back at resting height.
await sleep(1500);
const settled = await page.evaluate(
  () => window.debugPieceYs().every((y) => Math.abs(y - 0.13) < 0.02),
);
check('piece rattle settles back to rest', settled);

// --- New game via modal ---
await waitIdle();
await page.click('#btn-new');
await sleep(200);
await page.click('#btn-modal-yes');
await sleep(500);
const state5 = await page.evaluate(() => ({
  historyLen: window.game.history.length,
  moveListEmpty: document.getElementById('move-list').children.length === 0,
  redCannonHome: window.game.board[2][1]?.type === 'C',
}));
check('new game resets history', state5.historyLen === 0);
check('new game clears panel', state5.moveListEmpty);
check('new game resets board', state5.redCannonHome);

// --- Checkmate flow via debug position ---
await page.evaluate(() => window.loadDebugPosition('doubleChariotMate'));
await sleep(400);
await clickGrid(7, 1);
await sleep(300);
await clickGrid(9, 1);
await sleep(2400); // mate move runs in MLG slow-mo (~1.1s real) before the celebration
const state6 = await page.evaluate(() => ({
  over: window.game.status.over,
  winner: window.game.status.winner,
  reason: window.game.status.reason,
  overlayHidden: document.getElementById('gameover-overlay').hidden,
  ggBanner: document.querySelector('.mlg-gg')?.textContent ?? '',
  confetti: document.querySelectorAll('.mlg-confetto').length,
  emojiConfetti: document.querySelectorAll('.mlg-confetto-emoji').length,
}));
check('checkmate detected', state6.over && state6.reason === 'checkmate');
check('red wins', state6.winner === 'red');
check('overlay delayed during celebration', state6.overlayHidden);
check('MLG GG banner shown', state6.ggBanner === 'GG');
check('MLG confetti raining', state6.confetti > 50);
check('MLG emoji mixed into confetti', state6.emojiConfetti > 10);
await page.screenshot({ path: `${SHOT_DIR}/verify-7-checkmate.png` });
// The win banner slides up at the bottom after the GG banner finishes.
await sleep(3200);
const state6b = await page.evaluate(() => ({
  overlayVisible: !document.getElementById('gameover-overlay').hidden,
  overlayText: document.getElementById('gameover-text').textContent,
  mlgClass: document.getElementById('gameover-overlay').classList.contains('mlg'),
}));
check('game-over banner shown after celebration', state6b.overlayVisible);
check('overlay text correct', state6b.overlayText.includes('Red wins'));
check('overlay in undimmed MLG style', state6b.mlgClass);
await page.screenshot({ path: `${SHOT_DIR}/verify-7b-banner.png` });

// Undo revives the finished game and clears the celebration (orbit, GG).
await waitIdle();
await page.click('#btn-undo');
await sleep(700);
const state7 = await page.evaluate(() => ({
  over: window.game.status.over,
  overlayHidden: document.getElementById('gameover-overlay').hidden,
  ggGone: !document.querySelector('.mlg-gg'),
  scoreboardBack: Boolean(document.querySelector('.mlg-scoreboard')),
}));
check('undo revives finished game', !state7.over && state7.overlayHidden);
check('undo clears MLG celebration', state7.ggGone);
check('scoreboard survives undo', state7.scoreboardBack);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

