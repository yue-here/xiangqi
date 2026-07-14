import * as THREE from 'three';

// Board top texture, drawn on a canvas. The playable grid is 8x9 cells; the
// board mesh adds a 0.8-world-unit margin per side, so the texture margin
// must match for pieces to sit exactly on the intersections.
const TEX_W = 1024;
const TEX_H = 1152;
const BOARD_W = 9.6; // world units: 8 cells + 2 * 0.8 margin
const BOARD_H = 10.6; // world units: 9 cells + 2 * 0.8 margin
const MARGIN_X = (BOARD_W - 8) / 2;
const MARGIN_Z = (BOARD_H - 9) / 2;

// Canvas px per world unit.
const SCALE_X = TEX_W / BOARD_W;
const SCALE_Y = TEX_H / BOARD_H;

// Grid (row, col) -> canvas (x, y). Row 0 (red back rank) is drawn at the
// bottom of the canvas; +v in UV space maps from canvas bottom upward, and
// the board mesh top face maps canvas top to -z... We simply define row 0 at
// canvas y max and verify orientation once in scene assembly.
function gridToCanvas(row, col) {
  const x = (MARGIN_X + col) * SCALE_X;
  const y = TEX_H - (MARGIN_Z + row) * SCALE_Y;
  return [x, y];
}

function drawWood(ctx) {
  ctx.fillStyle = '#c89b62';
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  // Streaks: translucent horizontal bands with slight waviness.
  const streaks = 46;
  for (let i = 0; i < streaks; i++) {
    const y0 = (i / streaks) * TEX_H + Math.sin(i * 12.9898) * 14;
    const alpha = 0.05 + 0.06 * Math.abs(Math.sin(i * 78.233));
    const shade = Math.sin(i * 3.7) > 0 ? '110, 74, 32' : '236, 205, 155';
    ctx.strokeStyle = `rgba(${shade}, ${alpha})`;
    ctx.lineWidth = 6 + 10 * Math.abs(Math.sin(i * 1.3));
    ctx.beginPath();
    for (let x = 0; x <= TEX_W; x += 32) {
      const y = y0 + Math.sin(x * 0.013 + i * 2.1) * 9;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Soft vignette for depth.
  const grad = ctx.createRadialGradient(
    TEX_W / 2, TEX_H / 2, TEX_H * 0.25,
    TEX_W / 2, TEX_H / 2, TEX_H * 0.75,
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(60,30,0,0.18)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
}

function drawGrid(ctx) {
  const line = '#4a2c14';
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  const seg = (r1, c1, r2, c2) => {
    const [x1, y1] = gridToCanvas(r1, c1);
    const [x2, y2] = gridToCanvas(r2, c2);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  // Horizontal lines: all 10 rows.
  for (let r = 0; r < 10; r++) seg(r, 0, r, 8);
  // Vertical lines: edge files run the full length; inner files break at the river.
  for (let c = 0; c < 9; c++) {
    if (c === 0 || c === 8) {
      seg(0, c, 9, c);
    } else {
      seg(0, c, 4, c);
      seg(5, c, 9, c);
    }
  }
  // Palace diagonals.
  seg(0, 3, 2, 5);
  seg(0, 5, 2, 3);
  seg(7, 3, 9, 5);
  seg(7, 5, 9, 3);

  // Outer border, slightly outside the grid.
  ctx.lineWidth = 5;
  const [bx1, by1] = gridToCanvas(9.22, -0.22);
  const [bx2, by2] = gridToCanvas(-0.22, 8.22);
  ctx.strokeRect(bx1, by2, bx2 - bx1, by1 - by2);
}

// Corner brackets marking cannon and soldier starting points.
function drawMarkers(ctx) {
  ctx.strokeStyle = '#4a2c14';
  ctx.lineWidth = 2.5;
  const gap = 0.09; // world units from the intersection
  const len = 0.18;

  const bracket = (row, col, dr, dc) => {
    const [x, y] = gridToCanvas(row, col);
    // Canvas y decreases as row increases, so flip dr for canvas space.
    const sx = dc * gap * SCALE_X;
    const sy = -dr * gap * SCALE_Y;
    const lx = dc * len * SCALE_X;
    const ly = -dr * len * SCALE_Y;
    ctx.beginPath();
    ctx.moveTo(x + sx + lx, y + sy);
    ctx.lineTo(x + sx, y + sy);
    ctx.lineTo(x + sx, y + sy + ly);
    ctx.stroke();
  };

  const mark = (row, col) => {
    for (const dr of [-1, 1]) {
      for (const dc of [-1, 1]) {
        const nc = col + dc;
        if (nc < 0 || nc > 8) continue; // half markers at edge files
        bracket(row, col, dr, dc);
      }
    }
  };

  for (const [r, c] of [[2, 1], [2, 7], [7, 1], [7, 7]]) mark(r, c); // cannons
  for (const c of [0, 2, 4, 6, 8]) { mark(3, c); mark(6, c); } // soldiers
}

function drawRiverText(ctx) {
  ctx.fillStyle = 'rgba(74, 44, 20, 0.75)';
  ctx.font = `600 ${Math.round(0.62 * SCALE_Y)}px "KaiTi", "STKaiti", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const riverY = (gridToCanvas(4, 0)[1] + gridToCanvas(5, 0)[1]) / 2;

  // 楚河 reads toward red (canvas-upright near the red side).
  const chuhe = '楚河';
  const hanjie = '漢界';
  [...chuhe].forEach((ch, i) => {
    const x = TEX_W * (0.30 - i * 0.13);
    ctx.fillText(ch, x, riverY);
  });
  // 漢界 rotated 180° so it reads toward black.
  [...hanjie].forEach((ch, i) => {
    const x = TEX_W * (0.70 + i * 0.13);
    ctx.save();
    ctx.translate(x, riverY);
    ctx.rotate(Math.PI);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
}

export function createBoardTexture(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');

  drawWood(ctx);
  drawGrid(ctx);
  drawMarkers(ctx);
  drawRiverText(ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
}
