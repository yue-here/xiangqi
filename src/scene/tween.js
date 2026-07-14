// Minimal Promise-based tween engine, driven from the single rAF loop.
const active = new Set();

// Global timescale: <1 slows every running tween (used for MLG slow-mo).
let timeScale = 1;

export function setTimeScale(value) {
  timeScale = value;
}

export function cancelTween(entry) {
  active.delete(entry);
}

export const ease = {
  linear: (t) => t,
  outQuad: (t) => t * (2 - t),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

export function tween({ duration, easing = ease.outQuad, onUpdate, onComplete }) {
  const entry = { elapsed: 0, duration, easing, onUpdate, onComplete };
  active.add(entry);
  return entry;
}

export function tweenPromise(options) {
  return new Promise((resolve) => {
    const userComplete = options.onComplete;
    tween({
      ...options,
      onComplete: () => {
        userComplete?.();
        resolve();
      },
    });
  });
}

export function updateTweens(dt) {
  const scaled = dt * timeScale;
  for (const entry of active) {
    entry.elapsed += scaled;
    const t = Math.min(entry.elapsed / entry.duration, 1);
    entry.onUpdate?.(entry.easing(t));
    if (t >= 1) {
      active.delete(entry);
      entry.onComplete?.();
    }
  }
}

export function delay(ms) {
  return tweenPromise({ duration: ms / 1000, onUpdate: () => {} });
}
