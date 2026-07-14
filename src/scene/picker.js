import * as THREE from 'three';
import { worldToGrid } from './scene.js';

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

// Resolve a pointer event to grid coordinates, or null. World-space raycast,
// so the camera flip needs no special handling here.
export function createPicker(renderer, camera, pieceGroup, boardMesh, findPieceCoords) {
  return function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    // Pieces first: robust even when the selected piece is lifted.
    const pieceHits = raycaster.intersectObjects(pieceGroup.children, false);
    if (pieceHits.length > 0) {
      const coords = findPieceCoords(pieceHits[0].object.userData.pieceId);
      if (coords) return coords;
    }

    const boardHits = raycaster.intersectObject(boardMesh, false);
    if (boardHits.length > 0) {
      return worldToGrid(boardHits[0].point);
    }
    return null;
  };
}
