import { createInitialBoard, RED, BLACK, opposite } from './board.js';
import { legalMoves, applyMove, revertMove, isInCheck, hasAnyLegalMove } from './rules.js';
import { moveToWXF } from './notation.js';

export class Game {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = createInitialBoard();
    this.turn = RED;
    this.history = [];
    this.status = { over: false, winner: null, reason: null, inCheck: false };
  }

  getLegalMoves(r, c) {
    const piece = this.board[r][c];
    if (!piece || piece.color !== this.turn || this.status.over) return [];
    return legalMoves(this.board, r, c);
  }

  makeMove(from, to) {
    if (this.status.over) return null;
    const piece = this.board[from[0]][from[1]];
    if (!piece || piece.color !== this.turn) return null;
    if (!legalMoves(this.board, from[0], from[1]).some(([r, c]) => r === to[0] && c === to[1])) {
      return null;
    }

    const move = { from: [...from], to: [...to] };
    const notation = moveToWXF(this.board, move);
    const captured = applyMove(this.board, move);
    const mover = this.turn;
    this.turn = opposite(this.turn);

    const inCheck = isInCheck(this.board, this.turn);
    // Stalemate loses in xiangqi, so no-legal-moves ends the game whether or
    // not the trapped player is in check.
    if (!hasAnyLegalMove(this.board, this.turn)) {
      this.status = {
        over: true,
        winner: mover,
        reason: inCheck ? 'checkmate' : 'stalemate',
        inCheck,
      };
    } else {
      this.status = { over: false, winner: null, reason: null, inCheck };
    }

    const record = { move, piece, captured, notation, checkAfter: inCheck };
    this.history.push(record);
    return record;
  }

  undo() {
    const record = this.history.pop();
    if (!record) return null;
    revertMove(this.board, record.move, record.captured);
    this.turn = record.piece.color;
    const prev = this.history[this.history.length - 1];
    this.status = { over: false, winner: null, reason: null, inCheck: prev?.checkAfter ?? false };
    return record;
  }

  getMovesForSave() {
    return this.history.map(({ move }) => ({ from: [...move.from], to: [...move.to] }));
  }

  static replay(moves) {
    const game = new Game();
    for (const { from, to } of moves) {
      if (!game.makeMove(from, to)) {
        throw new Error(`Illegal move in saved game: ${JSON.stringify({ from, to })}`);
      }
    }
    return game;
  }
}
