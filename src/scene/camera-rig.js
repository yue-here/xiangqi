import { tween, tweenPromise, cancelTween, ease } from './tween.js';
import { RED } from '../game/board.js';

// ~57 degree elevation at board center; the below-center look target shifts
// the board up-screen so the near edge clears the bottom controls.
// (Max-steep alternative: DISTANCE 7.8, HEIGHT 13.5, LOOK_Y -0.8 for ~60deg.)
const DISTANCE = 8.6;
const HEIGHT = 13.2;
const LOOK_Y = -0.9;

// Fixed per-side camera: angle 0 = red side (+z), PI = black side (-z).
export function createCameraRig(camera) {
  let angle = 0;
  let side = RED;
  let spinEntry = null;

  const apply = () => {
    camera.position.set(DISTANCE * Math.sin(angle), HEIGHT, DISTANCE * Math.cos(angle));
    camera.lookAt(0, LOOK_Y, 0);
  };
  apply();

  return {
    get side() {
      return side;
    },
    setSideInstant(newSide) {
      side = newSide;
      angle = newSide === RED ? 0 : Math.PI;
      apply();
    },
    flipTo(newSide) {
      if (newSide === side) return Promise.resolve();
      const from = angle;
      // Always sweep the short way around: red (0) <-> black (PI).
      const to = newSide === RED ? 0 : Math.PI;
      side = newSide;
      return tweenPromise({
        duration: 0.9,
        easing: ease.inOutCubic,
        onUpdate: (t) => {
          angle = from + (to - from) * t;
          apply();
        },
      });
    },
    // Temporary fov punch for MLG zoom effects.
    punchFov(delta, duration = 0.3) {
      const base = camera.fov;
      return tweenPromise({
        duration,
        easing: ease.outQuad,
        onUpdate: (t) => {
          const k = Math.sin(t * Math.PI); // in and back out
          camera.fov = base - delta * k;
          camera.updateProjectionMatrix();
        },
        onComplete: () => {
          camera.fov = base;
          camera.updateProjectionMatrix();
        },
      });
    },
    // Slow 360 orbit for the MLG victory celebration. Cancellable: undo/new
    // game must snap the camera back to its side.
    victorySpin(duration = 6) {
      this.cancelSpin();
      const from = angle;
      const to = from + Math.PI * 2;
      spinEntry = tween({
        duration,
        easing: ease.inOutCubic,
        onUpdate: (t) => {
          angle = from + (to - from) * t;
          apply();
        },
        onComplete: () => {
          spinEntry = null;
          angle = from;
          apply();
        },
      });
    },
    cancelSpin() {
      if (!spinEntry) return;
      cancelTween(spinEntry);
      spinEntry = null;
      angle = side === RED ? 0 : Math.PI;
      apply();
    },
  };
}
