// Dev-only rule assertions and canned debug positions.
// Run via http://localhost:5173/?selftest=1 and check the console.
import { ROWS, COLS, RED, BLACK, createInitialBoard } from './board.js';
import { legalMoves, isInCheck, hasAnyLegalMove } from './rules.js';
import { moveToWXF } from './notation.js';
import { Game } from './game.js';
import { detectEvents, computeScores } from '../fx/mlg-events.js';

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function put(board, r, c, type, color) {
  board[r][c] = { id: `${color}-${type}-${r}${c}`, type, color };
  return board;
}

// Named positions loadable from the console via window.loadDebugPosition(name).
export const DEBUG_POSITIONS = {
  flyingGeneral() {
    const b = emptyBoard();
    put(b, 0, 4, 'G', RED);
    put(b, 9, 4, 'G', BLACK);
    put(b, 4, 4, 'R', RED); // red screen between the generals
    put(b, 9, 0, 'R', BLACK);
    return { board: b, turn: RED };
  },
  pinned() {
    const b = emptyBoard();
    put(b, 0, 4, 'G', RED);
    put(b, 9, 3, 'G', BLACK);
    put(b, 4, 4, 'H', RED); // shields the red general from the black chariot
    put(b, 8, 4, 'R', BLACK);
    return { board: b, turn: RED };
  },
  doubleChariotMate() {
    const b = emptyBoard();
    put(b, 9, 4, 'G', BLACK);
    put(b, 8, 0, 'R', RED);
    put(b, 7, 1, 'R', RED);
    put(b, 0, 3, 'G', RED);
    return { board: b, turn: RED };
  },
  soldierStalemate() {
    const b = emptyBoard();
    put(b, 9, 4, 'G', BLACK);
    put(b, 8, 3, 'S', RED);
    put(b, 8, 5, 'S', RED);
    put(b, 0, 3, 'G', RED);
    return { board: b, turn: BLACK };
  },
};

export function runSelfTests() {
  let passed = 0;
  let failed = 0;
  const assert = (cond, label) => {
    if (cond) {
      passed++;
    } else {
      failed++;
      console.error(`✗ ${label}`);
    }
  };
  const movesEqual = (moves, expected) => {
    const key = (m) => m.join(',');
    const a = new Set(moves.map(key));
    const b = new Set(expected.map(key));
    return a.size === b.size && [...a].every((k) => b.has(k));
  };

  // --- Opening position basics ---
  const start = createInitialBoard();
  assert(!isInCheck(start, RED) && !isInCheck(start, BLACK), 'no check at start');
  assert(movesEqual(legalMoves(start, 0, 4), [[1, 4]]), 'general: one step at start');
  assert(movesEqual(legalMoves(start, 0, 3), [[1, 4]]), 'advisor: diagonal into palace center');
  assert(movesEqual(legalMoves(start, 0, 2), [[2, 0], [2, 4]]), 'elephant: two diagonals at start');
  assert(movesEqual(legalMoves(start, 0, 1), [[2, 0], [2, 2]]), 'horse: edge horse two moves');
  assert(movesEqual(legalMoves(start, 3, 0), [[4, 0]]), 'soldier: forward only before river');

  // Cannon at (2,7): quiet moves + capture on black horse (9,7) over screen (7,7).
  const cannonMoves = legalMoves(start, 2, 7);
  assert(cannonMoves.some(([r, c]) => r === 9 && c === 7), 'cannon: captures horse over screen');
  assert(!cannonMoves.some(([r, c]) => r === 7 && c === 7), 'cannon: cannot land on screen');
  assert(!cannonMoves.some(([r, c]) => r === 8 && c === 7), 'cannon: no quiet move beyond screen');
  assert(cannonMoves.some(([r, c]) => r === 6 && c === 7), 'cannon: quiet move up to the screen');
  assert(cannonMoves.some(([r, c]) => r === 2 && c === 4), 'cannon: quiet traverse to center');

  // --- Horse leg block ---
  {
    const b = emptyBoard();
    put(b, 0, 4, 'G', RED);
    put(b, 9, 3, 'G', BLACK);
    put(b, 4, 4, 'H', RED);
    put(b, 4, 5, 'S', RED); // leg blocked to the right
    const moves = legalMoves(b, 4, 4);
    assert(!moves.some(([r, c]) => r === 5 && c === 6) && !moves.some(([r, c]) => r === 3 && c === 6),
      'horse: right leg blocked removes both right jumps');
    assert(moves.some(([r, c]) => r === 6 && c === 5), 'horse: unblocked jump still available');
  }

  // --- Elephant eye block + river ---
  {
    const b = emptyBoard();
    put(b, 0, 4, 'G', RED);
    put(b, 9, 3, 'G', BLACK); // off-file so no flying-general interference
    put(b, 2, 2, 'E', RED);
    put(b, 3, 3, 'S', BLACK); // blocks the eye of the (2,2)->(4,4) diagonal
    const moves = legalMoves(b, 2, 2);
    assert(!moves.some(([r, c]) => r === 4 && c === 4), 'elephant: blocked eye');
    assert(moves.some(([r, c]) => r === 4 && c === 0), 'elephant: clear eye ok');
    assert(moves.some(([r, c]) => r === 0 && c === 0), 'elephant: retreat ok');
    assert(!moves.some(([r]) => r > 4), 'elephant: never crosses river');
  }

  // --- Flying general ---
  {
    const { board: b } = DEBUG_POSITIONS.flyingGeneral();
    const screenMoves = legalMoves(b, 4, 4);
    assert(screenMoves.every(([, c]) => c === 4), 'flying general: screen pinned to the file');
    const genMoves = legalMoves(b, 0, 4);
    assert(genMoves.some(([r, c]) => r === 0 && c === 3), 'flying general: general may leave the file');
    // Remove the screen: generals face each other, red general cannot stay/step on file 4.
    b[4][4] = null;
    assert(isInCheck(b, RED) && isInCheck(b, BLACK), 'flying general: open file is mutual check');
  }

  // --- Pin ---
  {
    const { board: b } = DEBUG_POSITIONS.pinned();
    const moves = legalMoves(b, 4, 4);
    assert(moves.length === 0, 'pin: horse cannot move off the pin line (horse never stays on file)');
  }

  // --- Checkmate ---
  {
    const game = new Game();
    const { board, turn } = DEBUG_POSITIONS.doubleChariotMate();
    game.board = board;
    game.turn = turn;
    const rec = game.makeMove([7, 1], [9, 1]);
    assert(rec !== null, 'mate: move accepted');
    assert(game.status.over && game.status.winner === RED && game.status.reason === 'checkmate',
      'mate: double chariot checkmates');
  }

  // --- Stalemate is a loss ---
  {
    const { board, turn } = DEBUG_POSITIONS.soldierStalemate();
    assert(!isInCheck(board, BLACK), 'stalemate: black not in check');
    assert(!hasAnyLegalMove(board, BLACK), 'stalemate: black has no legal moves');
  }

  // --- Notation anchors ---
  {
    const b = createInitialBoard();
    assert(moveToWXF(b, { from: [2, 7], to: [2, 4] }) === 'C2=5', 'notation: C2=5');
    assert(moveToWXF(b, { from: [0, 7], to: [2, 6] }) === 'H2+3', 'notation: H2+3');
    assert(moveToWXF(b, { from: [0, 8], to: [1, 8] }) === 'R1+1', 'notation: R1+1');
    assert(moveToWXF(b, { from: [7, 7], to: [7, 4] }) === 'C8=5', 'notation: black C8=5');
    // Tandem chariots on one file use +/- designators.
    const t = emptyBoard();
    put(t, 0, 4, 'G', RED);
    put(t, 9, 4, 'G', BLACK);
    put(t, 5, 0, 'R', RED);
    put(t, 2, 0, 'R', RED);
    assert(moveToWXF(t, { from: [5, 0], to: [7, 0] }) === '+R+2', 'notation: front chariot +R+2');
    assert(moveToWXF(t, { from: [2, 0], to: [1, 0] }) === '-R-1', 'notation: rear chariot -R-1');
  }

  // --- MLG event detection ---
  {
    const rec = (color, type, from, to, captured = null, id = `${color}-${type}-t`) => ({
      move: { from, to },
      piece: { id, type, color },
      captured,
      notation: '',
      checkAfter: false,
    });
    const has = (events, type) => events.some((e) => e.type === type);

    // First blood: exactly one capture in the game so far.
    const fb = detectEvents([
      rec(RED, 'H', [2, 2], [4, 3], { id: 'black-S-0', type: 'S', color: BLACK }),
    ]);
    assert(has(fb, 'FIRST_BLOOD'), 'mlg: first blood on first capture');

    // Revenge: the piece captured now is the one that captured last ply.
    const rv = detectEvents([
      rec(BLACK, 'H', [7, 2], [5, 3], { id: 'red-S-1', type: 'S', color: RED }, 'black-H-0'),
      rec(RED, 'R', [3, 3], [5, 3], { id: 'black-H-0', type: 'H', color: BLACK }),
    ]);
    assert(has(rv, 'REVENGE'), 'mlg: revenge detected');
    assert(!has(rv, 'FIRST_BLOOD'), 'mlg: no first blood on second capture');

    // Humiliation: soldier takes chariot.
    const hm = detectEvents([
      rec(RED, 'S', [6, 4], [6, 5], { id: 'black-R-0', type: 'R', color: BLACK }),
    ]);
    assert(has(hm, 'HUMILIATION'), 'mlg: humiliation on soldier-takes-chariot');
    assert(has(hm, 'BIG_CAPTURE'), 'mlg: chariot capture is big');
    assert(hm[0].type === 'FIRST_BLOOD', 'mlg: priority sort (first blood 70 > humiliation 65)');

    // Noscope: cannon capture at Manhattan distance >= 5; short shots do not count.
    const ns = detectEvents([rec(RED, 'C', [2, 4], [9, 4], { id: 'black-A-0', type: 'A', color: BLACK })]);
    assert(has(ns, 'NOSCOPE'), 'mlg: noscope on long cannon shot');
    const nsShort = detectEvents([rec(RED, 'C', [2, 4], [5, 4], { id: 'black-S-2', type: 'S', color: BLACK })]);
    assert(!has(nsShort, 'NOSCOPE'), 'mlg: no noscope on short cannon shot');

    // Level up: soldier crossing the river this move, capture not required.
    const lu = detectEvents([rec(RED, 'S', [4, 2], [5, 2])]);
    assert(has(lu, 'LEVEL_UP'), 'mlg: level up on river crossing');
    const luAfter = detectEvents([rec(RED, 'S', [5, 2], [5, 3])]);
    assert(!has(luAfter, 'LEVEL_UP'), 'mlg: no level up once already across');

    // Streaks reset when the opponent captures; scores multiply by streak.
    const streakHistory = [
      rec(RED, 'R', [0, 0], [3, 0], { id: 'black-S-3', type: 'S', color: BLACK }),
      rec(BLACK, 'H', [9, 1], [7, 2]),
      rec(RED, 'R', [3, 0], [6, 0], { id: 'black-S-4', type: 'S', color: BLACK }),
      rec(BLACK, 'H', [7, 2], [9, 1]),
      rec(RED, 'R', [6, 0], [6, 4], { id: 'black-H-9', type: 'H', color: BLACK }),
    ];
    const st = detectEvents(streakHistory);
    assert(st.find((e) => e.type === 'STREAK')?.label === 'TRIPLE KILL!', 'mlg: triple kill streak');
    const st4 = detectEvents([
      ...streakHistory,
      rec(BLACK, 'H', [9, 1], [7, 2]),
      rec(RED, 'R', [6, 4], [6, 6], { id: 'black-S-5', type: 'S', color: BLACK }),
    ]);
    assert(st4.find((e) => e.type === 'STREAK')?.label === 'WOMBO COMBO!!', 'mlg: streak 4 is wombo combo');
    const scores = computeScores(streakHistory);
    assert(scores.red === 100 * 1 + 100 * 2 + 300 * 3, 'mlg: score multiplies by streak');
    const reset = detectEvents([
      ...streakHistory,
      rec(BLACK, 'R', [9, 8], [6, 4], { id: 'red-R-t', type: 'R', color: RED }),
    ]);
    assert(!reset.find((e) => e.type === 'STREAK'), 'mlg: opponent capture resets streak (black streak = 1)');
  }

  const total = passed + failed;
  if (failed === 0) {
    console.log(`%c✓ selftest: all ${total} assertions passed`, 'color: #2e7d32; font-weight: bold');
  } else {
    console.error(`✗ selftest: ${failed}/${total} assertions FAILED`);
  }
  return failed === 0;
}
