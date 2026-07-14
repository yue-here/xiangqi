// Pure MLG event detection over the game history. Stateless: everything is
// recomputed from the record list, so undo/reload resync comes for free.
import { crossedRiver } from '../game/board.js';

export const STREAK_LABELS = {
  2: 'DOUBLE KILL!',
  3: 'TRIPLE KILL!',
  4: 'WOMBO COMBO!!',
  5: 'M-M-M-MONSTER KILL!!',
  6: 'GODLIKE!',
  7: 'BEYOND GODLIKE!!',
};

// Phonetic announcer lines - never derived from the display labels, which
// TTS engines mangle ("MMMMONSTER KILL").
const STREAK_SAY = {
  2: 'double kill!',
  3: 'triple kill!',
  4: 'wombo combo!',
  5: 'm, m, m, monster kill!',
  6: 'god-like!',
  7: 'beyond god-like!',
};

export const PIECE_POINTS = { S: 100, A: 150, E: 150, H: 300, C: 350, R: 500, G: 1000 };

// Capture streaks per color: consecutive captures by one side, reset when the
// opponent captures.
export function computeStreaks(history) {
  const streaks = { red: 0, black: 0 };
  for (const rec of history) {
    if (rec.captured) {
      streaks[rec.piece.color] += 1;
      streaks[rec.captured.color] = 0;
    }
  }
  return streaks;
}

// MLG score per color: piece points multiplied by the capturer's streak at
// the time of the capture.
export function computeScores(history) {
  const scores = { red: 0, black: 0 };
  const streaks = { red: 0, black: 0 };
  for (const rec of history) {
    if (!rec.captured) continue;
    const color = rec.piece.color;
    streaks[color] += 1;
    streaks[rec.captured.color] = 0;
    scores[color] += (PIECE_POINTS[rec.captured.type] ?? 100) * streaks[color];
  }
  return scores;
}

export function capturePoints(history) {
  const cur = history[history.length - 1];
  if (!cur?.captured) return 0;
  const streak = computeStreaks(history)[cur.piece.color];
  return (PIECE_POINTS[cur.captured.type] ?? 100) * streak;
}

// Single escalation scalar driving MLG intensity: 0 = quiet move, 1 = plain
// capture, 2 = big capture or streak, 3 = full circus. `history` must
// already include the latest move's record.
export function hypeOf(history) {
  const cur = history[history.length - 1];
  if (!cur?.captured) return 0;
  const streak = computeStreaks(history)[cur.piece.color];
  const big = cur.captured.type === 'R' || cur.captured.type === 'C';
  const topPriority = detectEvents(history)[0]?.priority ?? 0;
  if (streak >= 4 || topPriority >= 65) return 3;
  if (big || streak >= 2) return 2;
  return 1;
}

// Detect all MLG events triggered by the latest move. `history` must already
// include the move's record. Returns events sorted by descending priority.
export function detectEvents(history) {
  const n = history.length - 1;
  const cur = history[n];
  if (!cur) return [];
  const prev = history[n - 1];
  const events = [];
  const color = cur.piece.color;

  if (cur.captured) {
    const streak = computeStreaks(history)[color];

    if (streak >= 2) {
      const level = Math.min(streak, 7);
      events.push({
        type: 'STREAK',
        priority: streak >= 5 ? 80 : 50,
        label: STREAK_LABELS[level],
        say: STREAK_SAY[level],
        streak,
      });
    }

    if (history.filter((r) => r.captured).length === 1) {
      events.push({ type: 'FIRST_BLOOD', priority: 70, label: 'FIRST BLOOD!', say: 'first blood' });
    }

    if (cur.captured.type === 'R' && cur.piece.type === 'S') {
      events.push({ type: 'HUMILIATION', priority: 65, label: 'HUMILIATION!', say: 'humiliation' });
    }

    if (cur.piece.type === 'C') {
      const dist = Math.abs(cur.move.to[0] - cur.move.from[0]) + Math.abs(cur.move.to[1] - cur.move.from[1]);
      if (dist >= 5) {
        events.push({ type: 'NOSCOPE', priority: 60, label: '360 NOSCOPE!', say: 'three sixty, no scope!' });
      }
    }

    // REVENGE: the piece being removed now is exactly the piece that made a
    // capture on the opponent's previous ply.
    if (prev?.captured && cur.captured.id === prev.piece.id) {
      events.push({ type: 'REVENGE', priority: 55, label: 'REVENGE!', say: 'revenge' });
    }

    if (cur.captured.type === 'R' || cur.captured.type === 'C') {
      const chariot = cur.captured.type === 'R';
      events.push({
        type: 'BIG_CAPTURE',
        priority: 40,
        label: chariot ? 'OH BABY A CHARIOT!' : 'MOM GET THE CAMERA!',
        say: chariot ? 'oh baby! a chariot!' : 'mom, get the camera!',
      });
    }
  }

  if (
    cur.piece.type === 'S'
    && crossedRiver(cur.move.to[0], color)
    && !crossedRiver(cur.move.from[0], color)
  ) {
    events.push({ type: 'LEVEL_UP', priority: 30, label: 'LEVEL UP!', say: null });
  }

  return events.sort((a, b) => b.priority - a.priority);
}
