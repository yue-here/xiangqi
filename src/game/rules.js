import { inBoard, inPalace, crossedRiver, forward, findGeneral, opposite } from './board.js';

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

// Pseudo-legal moves for the piece at (r, c) — movement/blocking rules only,
// without the self-check filter.
export function pseudoMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const moves = [];
  const push = (tr, tc) => {
    if (!inBoard(tr, tc)) return;
    const target = board[tr][tc];
    if (!target || target.color !== piece.color) moves.push([tr, tc]);
  };

  switch (piece.type) {
    case 'G':
      for (const [dr, dc] of ORTHO) {
        const tr = r + dr, tc = c + dc;
        if (inPalace(tr, tc, piece.color)) push(tr, tc);
      }
      break;
    case 'A':
      for (const [dr, dc] of DIAG) {
        const tr = r + dr, tc = c + dc;
        if (inPalace(tr, tc, piece.color)) push(tr, tc);
      }
      break;
    case 'E':
      for (const [dr, dc] of DIAG) {
        const tr = r + 2 * dr, tc = c + 2 * dc;
        if (!inBoard(tr, tc)) continue;
        if (crossedRiver(tr, piece.color)) continue;
        if (board[r + dr][c + dc]) continue; // blocked elephant eye
        push(tr, tc);
      }
      break;
    case 'H':
      for (const [dr, dc] of ORTHO) {
        const legR = r + dr, legC = c + dc;
        if (!inBoard(legR, legC) || board[legR][legC]) continue; // blocked horse leg
        // From a clear leg, the horse lands one diagonal step further out.
        if (dr === 0) {
          push(r + 1, c + 2 * dc);
          push(r - 1, c + 2 * dc);
        } else {
          push(r + 2 * dr, c + 1);
          push(r + 2 * dr, c - 1);
        }
      }
      break;
    case 'R':
      for (const [dr, dc] of ORTHO) {
        let tr = r + dr, tc = c + dc;
        while (inBoard(tr, tc)) {
          if (board[tr][tc]) {
            if (board[tr][tc].color !== piece.color) moves.push([tr, tc]);
            break;
          }
          moves.push([tr, tc]);
          tr += dr;
          tc += dc;
        }
      }
      break;
    case 'C':
      for (const [dr, dc] of ORTHO) {
        let tr = r + dr, tc = c + dc;
        // Quiet moves until the screen piece.
        while (inBoard(tr, tc) && !board[tr][tc]) {
          moves.push([tr, tc]);
          tr += dr;
          tc += dc;
        }
        // Skip the screen, then the first piece beyond is capturable if enemy.
        tr += dr;
        tc += dc;
        while (inBoard(tr, tc)) {
          if (board[tr][tc]) {
            if (board[tr][tc].color !== piece.color) moves.push([tr, tc]);
            break;
          }
          tr += dr;
          tc += dc;
        }
      }
      break;
    case 'S': {
      const f = forward(piece.color);
      push(r + f, c);
      if (crossedRiver(r, piece.color)) {
        push(r, c + 1);
        push(r, c - 1);
      }
      break;
    }
  }
  return moves;
}

// True if `color`'s general is attacked. Includes the flying-general rule, so
// the legal-move filter automatically forbids every exposing move.
export function isInCheck(board, color) {
  const gen = findGeneral(board, color);
  if (!gen) return true;
  const [gr, gc] = gen;

  const enemyGen = findGeneral(board, opposite(color));
  if (enemyGen && enemyGen[1] === gc) {
    let clear = true;
    for (let r = Math.min(gr, enemyGen[0]) + 1; r < Math.max(gr, enemyGen[0]); r++) {
      if (board[r][gc]) { clear = false; break; }
    }
    if (clear) return true;
  }

  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const p = board[r][c];
      if (!p || p.color === color || p.type === 'G') continue;
      for (const [tr, tc] of pseudoMoves(board, r, c)) {
        if (tr === gr && tc === gc) return true;
      }
    }
  }
  return false;
}

export function applyMove(board, move) {
  const [fr, fc] = move.from;
  const [tr, tc] = move.to;
  const captured = board[tr][tc];
  board[tr][tc] = board[fr][fc];
  board[fr][fc] = null;
  return captured;
}

export function revertMove(board, move, captured) {
  const [fr, fc] = move.from;
  const [tr, tc] = move.to;
  board[fr][fc] = board[tr][tc];
  board[tr][tc] = captured ?? null;
}

export function legalMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const result = [];
  for (const to of pseudoMoves(board, r, c)) {
    const move = { from: [r, c], to };
    const captured = applyMove(board, move);
    if (!isInCheck(board, piece.color)) result.push(to);
    revertMove(board, move, captured);
  }
  return result;
}

export function hasAnyLegalMove(board, color) {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const p = board[r][c];
      if (p && p.color === color && legalMoves(board, r, c).length > 0) return true;
    }
  }
  return false;
}
