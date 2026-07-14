// All sound effects are synthesized with the Web Audio API - no asset files.
// The AudioContext is created/resumed lazily inside the first user gesture to
// satisfy browser autoplay policies; every play function no-ops before that.
let ctx = null;
let master = null;
let noiseBuffer = null;
let muted = false;

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);

  noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.2), ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = value ? 0 : 1;
}

// speechSynthesis bypasses the master GainNode, so speech callers must check
// the mute state manually.
export function isMuted() {
  return muted;
}

export function getAudioContext() {
  return ctx;
}

export function getMaster() {
  return master;
}

function envGain(t0, peak, dur, attack = 0.005) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  gain.connect(master);
  return gain;
}

// Tonal blip: oscillator with a pitch ramp.
function blip({ type = 'sine', f0, f1 = f0, dur, gain = 0.2, when = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
  osc.connect(envGain(t0, gain, dur));
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Wooden knock: a low sine thump with a fast pitch drop plus a bandpassed
// noise burst - reads as wood-on-wood.
function knock({ f = 190, dur = 0.09, gain = 0.5, when = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when;

  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(f * 2.2, t0);
  thump.frequency.exponentialRampToValueAtTime(f, t0 + 0.02);
  thump.connect(envGain(t0, gain, dur, 0.002));
  thump.start(t0);
  thump.stop(t0 + dur + 0.02);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 1800;
  bandpass.Q.value = 1.1;
  noise.connect(bandpass);
  bandpass.connect(envGain(t0, gain * 0.55, dur * 0.6, 0.001));
  noise.start(t0);
  noise.stop(t0 + dur);
}

export function playSelect() {
  blip({ f0: 620, f1: 880, dur: 0.06, gain: 0.12 });
}

export function playMove() {
  knock({ f: 190, dur: 0.09, gain: 0.5 });
}

export function playCapture() {
  knock({ f: 160, dur: 0.1, gain: 0.65 });
  knock({ f: 120, dur: 0.12, gain: 0.55, when: 0.07 });
}

export function playCheck() {
  blip({ type: 'square', f0: 880, f1: 660, dur: 0.12, gain: 0.09 });
  blip({ type: 'square', f0: 880, f1: 660, dur: 0.12, gain: 0.09, when: 0.16 });
}

export function playGameOver() {
  blip({ type: 'triangle', f0: 523, dur: 0.22, gain: 0.16 });
  blip({ type: 'triangle', f0: 659, dur: 0.22, gain: 0.16, when: 0.18 });
  blip({ type: 'triangle', f0: 784, dur: 0.38, gain: 0.18, when: 0.36 });
}

export function playUndo() {
  blip({ f0: 500, f1: 340, dur: 0.09, gain: 0.12 });
}
