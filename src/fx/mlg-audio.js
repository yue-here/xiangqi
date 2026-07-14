// Synthesized MLG stingers. Shares the AudioContext from sfx.js so the mute
// toggle and autoplay-gesture handling apply here too.
import { getAudioContext, getMaster, isMuted } from '../audio/sfx.js';

// The classic MLG airhorn: stacked detuned sawtooths with a fast pitch drop
// into a held tone with vibrato.
export function playAirhorn({ when = 0, dur = 0.7 } = {}) {
  const ctx = getAudioContext();
  const master = getMaster();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
  out.gain.setValueAtTime(0.22, t0 + dur - 0.15);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  out.connect(master);

  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 9;
  const vibratoGain = ctx.createGain();
  vibratoGain.gain.value = 12;
  vibrato.connect(vibratoGain);

  for (const detune of [-12, 0, 10, 22]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(1100, t0);
    osc.frequency.exponentialRampToValueAtTime(440, t0 + 0.09);
    vibratoGain.connect(osc.frequency);
    osc.connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
  vibrato.start(t0);
  vibrato.stop(t0 + dur + 0.05);
}

export function playTripleAirhorn() {
  playAirhorn({ when: 0.3, dur: 0.45 });
  playAirhorn({ when: 0.7, dur: 0.45 });
  playAirhorn({ when: 1.1, dur: 0.9 });
}

// Short hitmarker tick.
export function playHitmarker() {
  const ctx = getAudioContext();
  const master = getMaster();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(2600, t0);
  osc.frequency.exponentialRampToValueAtTime(1400, t0 + 0.04);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + 0.06);
}

// Rising arpeggio stinger that escalates with the kill streak length.
export function playStreakStinger(level) {
  const ctx = getAudioContext();
  const master = getMaster();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const base = 392; // G4
  const steps = Math.min(2 + level, 8);
  for (let i = 0; i < steps; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = base * Math.pow(2, i / 4 + level * 0.1);
    const gain = ctx.createGain();
    const start = t0 + i * 0.07;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.1, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + 0.14);
  }
}

// Mario-style coin blip for LEVEL UP / XP gains.
export function playCoin() {
  const ctx = getAudioContext();
  const master = getMaster();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  for (const [freq, when, dur] of [[988, 0, 0.08], [1319, 0.08, 0.24]]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0 + when);
    gain.gain.exponentialRampToValueAtTime(0.09, t0 + when + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + when + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0 + when);
    osc.stop(t0 + when + dur + 0.02);
  }
}

// Vinyl record scratch: fast saw pitch-drop plus a swept noise burst.
export function playRecordScratch() {
  const ctx = getAudioContext();
  const master = getMaster();
  if (!ctx) return;
  const t0 = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(420, t0);
  osc.frequency.exponentialRampToValueAtTime(70, t0 + 0.22);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.0001, t0);
  oscGain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.01);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
  osc.connect(oscGain);
  oscGain.connect(master);
  osc.start(t0);
  osc.stop(t0 + 0.27);

  const noise = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.25), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise.buffer = buffer;
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.Q.value = 2;
  bandpass.frequency.setValueAtTime(3200, t0);
  bandpass.frequency.exponentialRampToValueAtTime(500, t0 + 0.22);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, t0);
  noiseGain.gain.exponentialRampToValueAtTime(0.1, t0 + 0.01);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
  noise.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(t0);
  noise.stop(t0 + 0.25);
}

// Dubstep wobble-bass drop for checkmate: detuned saw stack + sub sine
// through a lowpass whose cutoff is driven by an accelerating LFO.
export function playWobbleDrop(dur = 2.6) {
  const ctx = getAudioContext();
  const master = getMaster();
  if (!ctx) return;
  const t0 = ctx.currentTime;

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.34, t0 + 0.06);
  out.gain.setValueAtTime(0.34, t0 + dur - 0.5);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  out.connect(master);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 350;
  lowpass.Q.value = 8;
  lowpass.connect(out);

  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(3, t0);
  lfo.frequency.linearRampToValueAtTime(7, t0 + dur);
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 900;
  lfo.connect(lfoGain);
  lfoGain.connect(lowpass.frequency);
  lfo.start(t0);
  lfo.stop(t0 + dur);

  for (const [freq, detune] of [[55, -8], [55, 8], [110, 0]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(lowpass);
    osc.start(t0);
    osc.stop(t0 + dur);
  }
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = 27.5;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.5;
  sub.connect(subGain);
  subGain.connect(out);
  sub.start(t0);
  sub.stop(t0 + dur);
}

// Rising whoosh for the SSB launch: swept bandpassed noise + a rising sine.
export function playWhoosh(dur = 0.8) {
  const ctx = getAudioContext();
  const master = getMaster();
  if (!ctx) return;
  const t0 = ctx.currentTime;

  const noise = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise.buffer = buffer;
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.Q.value = 1.4;
  bandpass.frequency.setValueAtTime(300, t0);
  bandpass.frequency.exponentialRampToValueAtTime(2600, t0 + dur);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, t0);
  noiseGain.gain.exponentialRampToValueAtTime(0.18, t0 + dur * 0.6);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  noise.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(t0);
  noise.stop(t0 + dur);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, t0);
  osc.frequency.exponentialRampToValueAtTime(950, t0 + dur);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.0001, t0);
  oscGain.gain.exponentialRampToValueAtTime(0.07, t0 + dur * 0.5);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(oscGain);
  oscGain.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// SSB off-screen KO twinkle: fast high sparkle arpeggio + a tiny noise ping.
export function playKoStar() {
  const ctx = getAudioContext();
  const master = getMaster();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  [1976, 2637, 3136, 3951].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const start = t0 + i * 0.05;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + 0.18);
  });
}

// --- Announcer voice (speechSynthesis; bypasses the master GainNode, so the
// mute check is manual) ---
let cachedVoice = null;

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const en = voices.filter((v) => /en[-_]/i.test(v.lang));
  // Edge ships neural "Natural" voices on Windows 11 - massively better.
  cachedVoice = en.find((v) => /natural/i.test(v.name))
    ?? en.find((v) => /david|mark|guy|male/i.test(v.name))
    ?? en[0]
    ?? voices[0]
    ?? null;
}

if ('speechSynthesis' in window) {
  pickVoice();
  window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

export function say(text, { pitch = 0.8, rate = 1.05 } = {}) {
  if (!('speechSynthesis' in window) || isMuted() || !text) return;
  window.speechSynthesis.cancel(); // one announcer line at a time
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.pitch = pitch;
  utterance.rate = rate;
  utterance.volume = 1;
  if (cachedVoice) utterance.voice = cachedVoice;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeech() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
