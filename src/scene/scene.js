import * as THREE from 'three';
import { createBoardTexture } from './board-texture.js';

export const CELL = 1.0;
export const BOARD_TOP_Y = 0; // board top surface sits at y = 0
const BOARD_THICKNESS = 0.6;

export function gridToWorld(row, col) {
  return new THREE.Vector3((col - 4) * CELL, BOARD_TOP_Y, (4.5 - row) * CELL);
}

export function worldToGrid(point) {
  const col = Math.round(point.x / CELL + 4);
  const row = Math.round(4.5 - point.z / CELL);
  if (row < 0 || row > 9 || col < 0 || col > 8) return null;
  return { row, col };
}

export function createScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1b2430');

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // Lights: soft ambient dome + one shadow-casting key light.
  const hemi = new THREE.HemisphereLight('#dfe8ff', '#5a4630', 0.85);
  scene.add(hemi);

  const key = new THREE.DirectionalLight('#fff4e0', 2.0);
  key.position.set(-6, 14, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 32;
  key.shadow.bias = -0.0005;
  scene.add(key);

  // Board: only the top face gets the drawn texture.
  const boardTexture = createBoardTexture(renderer);
  const sideWood = new THREE.MeshStandardMaterial({ color: '#8a5a2b', roughness: 0.8 });
  const topWood = new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.65 });
  // Box face order: +x, -x, +y, -y, +z, -z
  const boardMaterials = [sideWood, sideWood, topWood, sideWood, sideWood, sideWood];
  const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(9.6, BOARD_THICKNESS, 10.6), boardMaterials);
  boardMesh.position.y = BOARD_TOP_Y - BOARD_THICKNESS / 2;
  boardMesh.receiveShadow = true;
  scene.add(boardMesh);

  // Table surface under the board to catch its shadow.
  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: '#2a3441', roughness: 0.95 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = BOARD_TOP_Y - BOARD_THICKNESS - 0.02;
  table.receiveShadow = true;
  scene.add(table);

  const pieceGroup = new THREE.Group();
  scene.add(pieceGroup);
  const highlightGroup = new THREE.Group();
  scene.add(highlightGroup);
  const fxGroup = new THREE.Group();
  scene.add(fxGroup);

  const resize = () => {
    const rect = container.getBoundingClientRect();
    const w = Math.max(rect.width, 1);
    const h = Math.max(rect.height, 1);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  return { scene, camera, renderer, pieceGroup, highlightGroup, fxGroup, boardMesh };
}
