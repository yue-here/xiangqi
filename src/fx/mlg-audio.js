// Synthesized MLG stingers. Shares the AudioContext from sfx.js so the mute
// toggle and autoplay-gesture handling apply here too.
import { getAudioContext, getMaster, isMuted } from '../audio/sfx.js';

// --- MLG bus ---
// Everything routes through one compressor so stacked horns, wobble and
// stingers sum cleanly. Horns get their own gain; the "bed" (everything else)
// ducks under them, sidechain-style.
let busCompressor = null;
let hornGain = null;
let bedGain = null;

function ensureBus(ctx) {
  if (busCompressor) return;
  busCompressor = ctx.createDynamicsCompressor();
  busCompressor.threshold.value = -18;
  busCompressor.knee.value = 12;
  busCompressor.ratio.value = 6;
  busCompressor.attack.value = 0.003;
  busCompressor.release.value = 0.25;
  busCompressor.connect(getMaster());
  hornGain = ctx.createGain();
  hornGain.connect(busCompressor);
  bedGain = ctx.createGain();
  bedGain.connect(busCompressor);
}

function hornBus(ctx) {
  ensureBus(ctx);
  return hornGain;
}

function bedBus(ctx) {
  ensureBus(ctx);
  return bedGain;
}

// Dip the bed while a horn speaks. cancelAndHoldAtTime keeps overlapping
// ducks click-free; the setValueAtTime fallback may pop but stays correct.
function duckBed(ctx, t0, dur) {
  ensureBus(ctx);
  const gain = bedGain.gain;
  if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(t0);
  else {
    gain.cancelScheduledValues(t0);
    gain.setValueAtTime(1, t0);
  }
  gain.linearRampToValueAtTime(0.4, t0 + 0.05);
  gain.linearRampToValueAtTime(1, t0 + dur + 0.25);
}

// --- The airhorn ---
// One blast. The classic sample scoops UP into the note (the "bw"), sits on
// it, and falls off as pressure dies (the "aa"). Long blasts get a delayed
// vibrato that blooms across the sustain; a peaking formant plus a lowpass
// turn the raw saw stack into a horn honk.
function hornBlast(ctx, t0, dur, { pitch = 1, echo = false } = {}) {
  const target = 440 * pitch;
  const release = dur < 0.25 ? 0.05 : 0.15;

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.19, t0 + 0.008);
  out.gain.setValueAtTime(0.19, t0 + dur - release);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  const formant = ctx.createBiquadFilter();
  formant.type = 'peaking';
  formant.frequency.value = 1200;
  formant.Q.value = 1.8;
  formant.gain.value = 7;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 4500;
  out.connect(formant);
  formant.connect(lowpass);
  lowpass.connect(hornBus(ctx));

  if (echo) {
    const send = ctx.createGain();
    send.gain.value = 0.45; // first repeat already quieter than the source
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.22;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const echoLp = ctx.createBiquadFilter();
    echoLp.type = 'lowpass';
    echoLp.frequency.value = 2000;
    lowpass.connect(send);
    send.connect(delay);
    delay.connect(echoLp);
    echoLp.connect(feedback);
    feedback.connect(delay);
    echoLp.connect(hornBus(ctx));
    // The feedback loop keeps processing forever unless broken.
    const tailMs = (t0 - ctx.currentTime + dur + 1.8) * 1000;
    setTimeout(() => {
      delay.disconnect();
      echoLp.disconnect();
      feedback.disconnect();
    }, tailMs);
  }

  let vibratoGain = null;
  if (dur > 0.4) {
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.5;
    vibratoGain = ctx.createGain();
    vibratoGain.gain.setValueAtTime(0, t0);
    vibratoGain.gain.setValueAtTime(0, t0 + dur * 0.25);
    vibratoGain.gain.linearRampToValueAtTime(18, t0 + dur * 0.9);
    vibrato.connect(vibratoGain);
    vibrato.start(t0);
    vibrato.stop(t0 + dur + 0.05);
  }

  const scoopEnd = t0 + Math.min(0.06, dur * 0.35);
  for (const [detune, level] of [[-14, 1], [0, 1], [9, 1], [19, 1], [-1200, 0.35]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(target * 0.55, t0);
    osc.frequency.exponentialRampToValueAtTime(target, scoopEnd);
    if (dur >= 0.25) {
      osc.frequency.setValueAtTime(target, t0 + dur - 0.05);
      osc.frequency.exponentialRampToValueAtTime(target * 0.82, t0 + dur);
    }
    if (vibratoGain) vibratoGain.connect(osc.frequency);
    if (level === 1) {
      osc.connect(out);
    } else {
      const oscGain = ctx.createGain();
      oscGain.gain.value = level;
      osc.connect(oscGain);
      oscGain.connect(out);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
}

export function playAirhorn({ when = 0, dur = 0.7, pitch = 1, echo = false } = {}) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  duckBed(ctx, t0, dur);
  hornBlast(ctx, t0, dur, { pitch, echo });
}

// The canonical meme riff - "bwaa bw-bwaaaaa": a long blast, a short pickup
// stab, then a held finale with blooming vibrato and an echo tail. The pickup
// gap is tight on purpose; any looser and it stops reading as one phrase.
export function playAirhornRiff({ when = 0, pitch = 1 } = {}) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  duckBed(ctx, t0, 1.7);
  hornBlast(ctx, t0, 0.32, { pitch });
  hornBlast(ctx, t0 + 0.46, 0.13, { pitch });
  hornBlast(ctx, t0 + 0.62, 1.0, { pitch, echo: true });
}

// Long / short-short / looong.
export function playTripleAirhorn() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  duckBed(ctx, t0, 2.1);
  hornBlast(ctx, t0, 0.3, {});
  hornBlast(ctx, t0 + 0.5, 0.13, {});
  hornBlast(ctx, t0 + 0.66, 0.13, {});
  hornBlast(ctx, t0 + 0.82, 1.2, { echo: true });
}

// Checkmate: the riff twice, second pass a hair sharper, echoing into the
// celebration.
export function playMegaAirhorn() {
  playAirhornRiff();
  playAirhornRiff({ when: 1.7, pitch: 1.06 });
}

// Sub drop under big moments: sine dive with a noise click at the onset.
export function playBassDrop(dur = 0.8) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t0 = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(130, t0);
  osc.frequency.exponentialRampToValueAtTime(38, t0 + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.05);
  gain.gain.setValueAtTime(0.4, t0 + dur - 0.2);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(hornBus(ctx));
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);

  const noise = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.06), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise.buffer = buffer;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.12, t0);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
  noise.connect(noiseGain);
  noiseGain.connect(hornBus(ctx));
  noise.start(t0);
}

// Womp womp womp womppppp - for stalemate.
export function playSadTrombone() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const notes = [[233, 0, 0.28], [220, 0.3, 0.28], [208, 0.6, 0.28], [185, 0.9, 0.7]];
  notes.forEach(([freq, when, dur], i) => {
    const start = t0 + when;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const last = i === notes.length - 1;
    if (last) {
      // The final womp slides flat and wobbles.
      osc.detune.setValueAtTime(0, start);
      osc.detune.linearRampToValueAtTime(-80, start + dur);
      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = 5;
      const vibratoGain = ctx.createGain();
      vibratoGain.gain.value = 6;
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);
      vibrato.start(start);
      vibrato.stop(start + dur + 0.05);
    }
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1100;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.setValueAtTime(0.18, start + dur - 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(bedBus(ctx));
    osc.start(start);
    osc.stop(start + dur + 0.05);
  });
}

// Short hitmarker tick.
export function playHitmarker() {
  const ctx = getAudioContext();
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
  gain.connect(bedBus(ctx));
  osc.start(t0);
  osc.stop(t0 + 0.06);
}

// Rising arpeggio stinger that escalates with the kill streak length.
export function playStreakStinger(level) {
  const ctx = getAudioContext();
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
    gain.connect(bedBus(ctx));
    osc.start(start);
    osc.stop(start + 0.14);
  }
}

// Mario-style coin blip for LEVEL UP / XP gains.
export function playCoin() {
  const ctx = getAudioContext();
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
    gain.connect(bedBus(ctx));
    osc.start(t0 + when);
    osc.stop(t0 + when + dur + 0.02);
  }
}

// Vinyl record scratch: fast saw pitch-drop plus a swept noise burst.
export function playRecordScratch() {
  const ctx = getAudioContext();
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
  oscGain.connect(bedBus(ctx));
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
  noiseGain.connect(bedBus(ctx));
  noise.start(t0);
  noise.stop(t0 + 0.25);
}

// Dubstep wobble-bass drop for checkmate: detuned saw stack + sub sine
// through a lowpass whose cutoff is driven by an accelerating LFO.
export function playWobbleDrop(dur = 2.6) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t0 = ctx.currentTime;

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.34, t0 + 0.06);
  out.gain.setValueAtTime(0.34, t0 + dur - 0.5);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  out.connect(bedBus(ctx));

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
  noiseGain.connect(bedBus(ctx));
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
  oscGain.connect(bedBus(ctx));
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// SSB off-screen KO twinkle: fast high sparkle arpeggio + a tiny noise ping.
export function playKoStar() {
  const ctx = getAudioContext();
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
    gain.connect(bedBus(ctx));
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
