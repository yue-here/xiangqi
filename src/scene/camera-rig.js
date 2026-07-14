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
  let roll = 0;
  let rollSign = 1;
  // Captured once: FX always restore to this, so overlapping punches can't
  // save a mid-punch fov as their baseline.
  const baseFov = camera.fov;
  const fxEntries = new Set();

  const apply = () => {
    camera.position.set(DISTANCE * Math.sin(angle), HEIGHT, DISTANCE * Math.cos(angle));
    camera.lookAt(0, LOOK_Y, 0);
    // lookAt resets orientation every call, so the dutch-angle roll must be
    // reapplied after it.
    if (roll) camera.rotateZ(roll);
  };
  apply();

  const restoreFov = () => {
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
  };

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
      const entry = tween({
        duration,
        easing: ease.outQuad,
        onUpdate: (t) => {
          camera.fov = baseFov - delta * Math.sin(t * Math.PI); // in and back out
          camera.updateProjectionMatrix();
        },
        onComplete: () => {
          fxEntries.delete(entry);
          restoreFov();
        },
      });
      fxEntries.add(entry);
    },
    // Crash zoom: snap in fast, hold, ease back out - for big captures.
    crashZoom(delta = 16, duration = 0.55) {
      const entry = tween({
        duration,
        easing: ease.linear,
        onUpdate: (t) => {
          const k = t < 0.18 ? t / 0.18 : t < 0.45 ? 1 : 1 - (t - 0.45) / 0.55;
          camera.fov = baseFov - delta * k;
          camera.updateProjectionMatrix();
        },
        onComplete: () => {
          fxEntries.delete(entry);
          restoreFov();
        },
      });
      fxEntries.add(entry);
    },
    // Dutch-angle punch, alternating tilt direction per call.
    punchRoll(deg = 4, duration = 0.5) {
      rollSign = -rollSign;
      const rad = (deg * Math.PI / 180) * rollSign;
      const entry = tween({
        duration,
        easing: ease.linear,
        onUpdate: (t) => {
          roll = rad * Math.sin(t * Math.PI);
          apply();
        },
        onComplete: () => {
          fxEntries.delete(entry);
          roll = 0;
          apply();
        },
      });
      fxEntries.add(entry);
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
    // Cancel every fov/roll effect and restore the neutral camera.
    cancelFx() {
      for (const entry of fxEntries) cancelTween(entry);
      fxEntries.clear();
      roll = 0;
      restoreFov();
      apply();
    },
  };
}
