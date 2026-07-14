import { RED } from './board.js';

const CHARS = {
  red: { G: '帥', A: '仕', E: '相', H: '傌', R: '俥', C: '炮', S: '兵' },
  black: { G: '將', A: '士', E: '象', H: '馬', R: '車', C: '砲', S: '卒' },
};

export function pieceChar(type, color) {
  return CHARS[color][type];
}

// WXF files count 1-9 from each player's right. Red's right hand is high
// cols (camera at +Z looking at -Z, screen-right = +X = higher cols).
function fileOf(col, color) {
  return color === RED ? 9 - col : col + 1;
}

// Standard WXF move notation, e.g. C2=5, H2+3, R1+1, +R+2.
export function moveToWXF(board, move) {
  const [fr, fc] = move.from;
  const [tr, tc] = move.to;
  const piece = board[fr][fc];
  const { type, color } = piece;
  const fwd = color === RED ? 1 : -1;

  // Piece designator: file number, or +/- prefix when two of the same piece
  // share the file ("front"/"rear" relative to the owner's direction of play).
  let designator = String(fileOf(fc, color));
  const sameFileRows = [];
  for (let r = 0; r < 10; r++) {
    const p = board[r][fc];
    if (p && p.type === type && p.color === color) sameFileRows.push(r);
  }
  if (sameFileRows.length > 1 && type !== 'G') {
    // Front = furthest advanced. Best-effort for 3+ soldiers: treat the
    // frontmost as '+' and everything else as '-'.
    const frontRow = color === RED ? Math.max(...sameFileRows) : Math.min(...sameFileRows);
    designator = (fr === frontRow ? '+' : '-') + type;
  }

  const prefix = designator.startsWith('+') || designator.startsWith('-')
    ? designator
    : type + designator;

  if (tr === fr) {
    return `${prefix}=${fileOf(tc, color)}`;
  }
  const dir = (tr - fr) * fwd > 0 ? '+' : '-';
  // Diagonal movers name the destination file; straight movers count ranks.
  const operand = fc === tc ? Math.abs(tr - fr) : fileOf(tc, color);
  return `${prefix}${dir}${operand}`;
}
