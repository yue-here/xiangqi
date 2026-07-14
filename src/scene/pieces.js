import * as THREE from 'three';
import { pieceChar } from '../game/notation.js';
import { drawGlyph } from './piece-glyphs.js';
import { gridToWorld } from './scene.js';

export const PIECE_RADIUS = 0.4;
export const PIECE_HEIGHT = 0.26;

const faceTextureCache = new Map();

function createFaceTexture(type, color, symbolic) {
  const key = `${color}-${type}-${symbolic ? 's' : 'c'}`;
  if (faceTextureCache.has(key)) return faceTextureCache.get(key);

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;

  // Wooden disc face.
  const grad = ctx.createRadialGradient(cx - 30, cx - 30, 20, cx, cx, cx);
  grad.addColorStop(0, '#f4dcae');
  grad.addColorStop(1, '#d9b478');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const ink = color === 'red' ? '#b02318' : '#1e1a16';

  // Double ring border.
  ctx.strokeStyle = ink;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cx, cx - 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cx, cx - 28, 0, Math.PI * 2);
  ctx.stroke();

  // Glyph. The cylinder top cap maps texture-up to world +x, so the glyph is
  // pre-rotated on the canvas: -90deg reads upright from the red camera
  // (+z looking -z), +90deg reads upright from the black camera.
  ctx.fillStyle = ink;
  ctx.save();
  ctx.translate(cx, cx);
  ctx.rotate(color === 'black' ? Math.PI / 2 : -Math.PI / 2);
  if (symbolic) {
    drawGlyph(ctx, type, 0, 0, 152);
  } else {
    ctx.font = 'bold 150px "KaiTi", "STKaiti", "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pieceChar(type, color), 0, 6);
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  faceTextureCache.set(key, texture);
  return texture;
}

const sideMaterialCache = new Map();

function sideMaterial(color) {
  if (!sideMaterialCache.has(color)) {
    sideMaterialCache.set(color, new THREE.MeshStandardMaterial({
      color: color === 'red' ? '#e6c188' : '#d4af78',
      roughness: 0.55,
    }));
  }
  return sideMaterialCache.get(color);
}

const bottomMaterial = new THREE.MeshStandardMaterial({ color: '#c9a469', roughness: 0.7 });
const pieceGeometry = new THREE.CylinderGeometry(PIECE_RADIUS, PIECE_RADIUS, PIECE_HEIGHT, 32);

export function createPieceMesh(piece, symbolic = false) {
  const topMaterial = new THREE.MeshStandardMaterial({
    map: createFaceTexture(piece.type, piece.color, symbolic),
    roughness: 0.5,
  });
  // Cylinder material order: side, top cap, bottom cap.
  const mesh = new THREE.Mesh(pieceGeometry, [sideMaterial(piece.color), topMaterial, bottomMaterial]);
  mesh.castShadow = true;
  mesh.userData.pieceId = piece.id;
  return mesh;
}

export function restingY() {
  return PIECE_HEIGHT / 2;
}

export function placePieceMesh(mesh, row, col) {
  const pos = gridToWorld(row, col);
  mesh.position.set(pos.x, restingY(), pos.z);
}

// Build meshes for every piece on the board. Returns Map<pieceId, mesh>.
export function buildAllPieces(board, pieceGroup, symbolic = false) {
  pieceGroup.clear();
  const meshes = new Map();
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const mesh = createPieceMesh(piece, symbolic);
      placePieceMesh(mesh, r, c);
      pieceGroup.add(mesh);
      meshes.set(piece.id, mesh);
    }
  }
  return meshes;
}
