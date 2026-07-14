// Board representation: board[row][col], 10 rows x 9 cols.
// Row 0 = Red back rank, rows 0-4 Red half, river between rows 4/5, row 9 = Black back rank.
export const ROWS = 10;
export const COLS = 9;
export const RED = 'red';
export const BLACK = 'black';

export function inBoard(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

export function inPalace(r, c, color) {
  if (c < 3 || c > 5) return false;
  return color === RED ? r >= 0 && r <= 2 : r >= 7 && r <= 9;
}

export function crossedRiver(r, color) {
  return color === RED ? r >= 5 : r <= 4;
}

export function forward(color) {
  return color === RED ? 1 : -1;
}

export function opposite(color) {
  return color === RED ? BLACK : RED;
}

// Piece types: G general, A advisor, E elephant, H horse, R chariot, C cannon, S soldier
const BACK_RANK = ['R', 'H', 'E', 'A', 'G', 'A', 'E', 'H', 'R'];

export function createInitialBoard() {
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const counters = {};
  const place = (r, c, type, color) => {
    const key = `${color}-${type}`;
    const n = counters[key] ?? 0;
    counters[key] = n + 1;
    board[r][c] = { id: `${key}-${n}`, type, color };
  };
  BACK_RANK.forEach((type, c) => place(0, c, type, RED));
  place(2, 1, 'C', RED);
  place(2, 7, 'C', RED);
  for (const c of [0, 2, 4, 6, 8]) place(3, c, 'S', RED);
  BACK_RANK.forEach((type, c) => place(9, c, type, BLACK));
  place(7, 1, 'C', BLACK);
  place(7, 7, 'C', BLACK);
  for (const c of [0, 2, 4, 6, 8]) place(6, c, 'S', BLACK);
  return board;
}

export function findGeneral(board, color) {
  const rows = color === RED ? [0, 1, 2] : [9, 8, 7];
  for (const r of rows) {
    for (let c = 3; c <= 5; c++) {
      const p = board[r][c];
      if (p && p.type === 'G' && p.color === color) return [r, c];
    }
  }
  return null;
}

export function cloneBoard(board) {
  return board.map((row) => row.slice());
}
