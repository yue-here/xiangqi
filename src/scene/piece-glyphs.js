// Chess-style silhouette glyphs for symbolic mode, drawn as SVG paths in a
// 100x100 viewBox. Natural mappings use the standard chess forms (general ->
// king, chariot -> rook, horse -> knight, elephant -> bishop, soldier ->
// pawn); the advisor (ferz coronet) and cannon are custom glyphs in the same
// silhouette language. Holes (wheel hub, bishop slit, knight eye) are
// evenodd subpaths so the wood background shows through.
const BASE = 'M27 82 Q27 80 29 80 L71 80 Q73 80 73 82 L73 90 L27 90 Z';

const circle = (cx, cy, r) =>
  `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

const GLYPHS = {
  // King: cross above an arched dome.
  G: [
    'M46 4 L54 4 L54 12 L62 12 L62 20 L54 20 L54 28 L46 28 L46 20 L38 20 L38 12 L46 12 Z',
    'M50 26 C 33 32 27 47 30 60 C 31 66 34 70 36 78 L 64 78 C 66 70 69 66 70 60 C 73 47 67 32 50 26 Z',
    BASE,
  ],
  // Advisor: three-point ferz coronet with tip balls.
  A: [
    circle(35, 20, 4.5),
    circle(50, 13, 4.5),
    circle(65, 20, 4.5),
    'M31 52 L35 27 L45 40 L50 21 L55 40 L65 27 L69 52 L64 62 L68 78 L32 78 L36 62 Z',
    BASE,
  ],
  // Elephant -> bishop: mitre with diagonal slit and top ball.
  E: [
    circle(50, 11, 5.5),
    'M50 19 C 63 30 69 43 69 53 C 69 63 61 69 58 71 L 62 78 L 38 78 L 42 71 C 39 69 31 63 31 53 C 31 43 37 30 50 19 Z'
    + ' M50 31 L54 27 L63 46 L59 50 Z',
    BASE,
  ],
  // Horse -> knight: horse head facing left, eye hole.
  H: [
    'M29 50 C 24 45 25 35 30 30 L 37 23 L 41 10 L 49 21 C 54 19 59 20 63 24 C 70 32 73 44 73 60 L 73 78 L 39 78 C 39 64 44 57 41 51 C 37 54 32 53 29 50 Z'
    + ` ${circle(45, 31, 3)}`,
    BASE,
  ],
  // Chariot -> rook: crenellated turret.
  R: [
    'M32 12 L42 12 L42 20 L46 20 L46 12 L54 12 L54 20 L58 20 L58 12 L68 12 L68 28 L62 34 L62 66 L68 72 L68 78 L32 78 L32 72 L38 66 L38 34 L32 28 Z',
    BASE,
  ],
  // Cannon: barrel over a spoked wheel.
  C: [
    'M32 56 L64 30 L74 42 L44 68 Z',
    'M62 26 L71 19 L81 31 L73 39 Z',
    circle(44, 62, 15) + circle(44, 62, 5.5),
    BASE,
  ],
  // Soldier -> pawn: ball on a flared stem.
  S: [
    circle(50, 29, 11),
    'M50 40 C 42 42 40 48 41 54 C 43 60 38 66 36 78 L 64 78 C 62 66 57 60 59 54 C 60 48 58 42 50 40 Z',
    BASE,
  ],
};

const pathCache = new Map();

function pathsFor(type) {
  if (!pathCache.has(type)) {
    pathCache.set(type, GLYPHS[type].map((d) => new Path2D(d)));
  }
  return pathCache.get(type);
}

// Draw the glyph centered at (x, y), scaled so the 100-unit viewBox spans
// `size` pixels. Fill style must be set by the caller.
export function drawGlyph(ctx, type, x, y, size) {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  const s = size / 100;
  ctx.scale(s, s);
  for (const path of pathsFor(type)) {
    ctx.fill(path, 'evenodd');
  }
  ctx.restore();
}
