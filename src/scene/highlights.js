import * as THREE from 'three';
import { gridToWorld } from './scene.js';
import { PIECE_RADIUS } from './pieces.js';

const HOVER_Y = 0.015; // float above the board top to avoid z-fighting

function flatMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function createHighlights(highlightGroup) {
  // Selection ring under the picked-up piece.
  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(PIECE_RADIUS * 0.85, PIECE_RADIUS * 1.18, 40),
    flatMaterial('#ffd54f', 0.85),
  );
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.visible = false;
  highlightGroup.add(selectionRing);

  // Pool of quiet-move dots.
  const dotPool = [];
  const dotGeometry = new THREE.CircleGeometry(0.13, 24);
  const dotMaterial = flatMaterial('#66bb6a', 0.9);
  // Pool of capture rings around enemy pieces.
  const capturePool = [];
  const captureGeometry = new THREE.RingGeometry(PIECE_RADIUS * 1.0, PIECE_RADIUS * 1.28, 40);
  const captureMaterial = flatMaterial('#ef5350', 0.9);

  const getPooled = (pool, geometry, material) => {
    for (const mesh of pool) {
      if (!mesh.visible) return mesh;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    highlightGroup.add(mesh);
    pool.push(mesh);
    return mesh;
  };

  // Last-move markers: square outlines at from/to, wider than a piece so the
  // "to" marker stays visible around the piece that landed on it.
  const outlineGeometry = new THREE.RingGeometry(0.48, 0.58, 4);
  const lastFrom = new THREE.Mesh(outlineGeometry, flatMaterial('#ffb74d', 0.75));
  const lastTo = new THREE.Mesh(outlineGeometry, flatMaterial('#ffb74d', 0.9));
  for (const m of [lastFrom, lastTo]) {
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.PI / 4; // diamond ring -> square-ish outline
    m.visible = false;
    highlightGroup.add(m);
  }

  const placeFlat = (mesh, row, col) => {
    const pos = gridToWorld(row, col);
    mesh.position.set(pos.x, HOVER_Y, pos.z);
    mesh.visible = true;
  };

  return {
    showSelection(row, col) {
      placeFlat(selectionRing, row, col);
    },
    showLegalDots(moves, board) {
      this.hideLegalDots();
      for (const [r, c] of moves) {
        if (board[r][c]) {
          placeFlat(getPooled(capturePool, captureGeometry, captureMaterial), r, c);
        } else {
          placeFlat(getPooled(dotPool, dotGeometry, dotMaterial), r, c);
        }
      }
    },
    hideLegalDots() {
      for (const mesh of dotPool) mesh.visible = false;
      for (const mesh of capturePool) mesh.visible = false;
    },
    clearSelection() {
      selectionRing.visible = false;
      this.hideLegalDots();
    },
    setLastMove(from, to) {
      if (!from || !to) {
        lastFrom.visible = false;
        lastTo.visible = false;
        return;
      }
      placeFlat(lastFrom, from[0], from[1]);
      placeFlat(lastTo, to[0], to[1]);
    },
  };
}
