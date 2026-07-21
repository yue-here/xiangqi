// Mostly-synthesized MLG stingers, with one exception: the airhorn plays a
// real recorded sample (oscillators alone never read as convincing - two
// rounds of tuning proved that). Shares the AudioContext from sfx.js so the
// mute toggle and autoplay-gesture handling apply here too.
import { getAudioContext, getMaster, isMuted } from '../audio/sfx.js';

// Candidate real recordings, all freesound.org, all CC0 (public domain -
// no attribution required). sound-lab.html lets these be A/B'd; the real
// game always plays AIRHORN_VARIANTS[0].
export const AIRHORN_VARIANTS = [
  { id: 'zar265', label: 'Air Horn Hype - zar.265 (#581334)', url: '/audio/airhorn-zar265.mp3' },
  { id: 'neopolitansixth', label: 'DJ Airhorn - neopolitansixth (#547020)', url: '/audio/airhorn-neopolitansixth.mp3' },
  { id: 'pfranzen', label: 'DJ airhorn sound - pfranzen (#528807)', url: '/audio/airhorn-pfranzen.mp3' },
  { id: 'pol', label: 'Airhorn Bright Sound - Pol (#385922)', url: '/audio/airhorn-pol.mp3' },
  { id: 'gemgem88', label: 'Airhorn, 7s - gemgem88 (#728683)', url: '/audio/airhorn-gemgem88.mp3' },
  { id: 'funwithsound', label: 'Horn 9 (Federal) - FunWithSound (#608112)', url: '/audio/airhorn-funwithsound.mp3' },
];

// The fetch starts the instant this module loads - at page load, not on
// first play - so decode (gated on the AudioContext, which needs a user
// gesture) is the only thing racing the very first airhorn call. If either
// step fails (offline, blocked), hornBlast falls back to the synthesized
// version below - see hornBlastSynth.
let airhornUrl = AIRHORN_VARIANTS[0].url;
let airhornBuffer = null;
let airhornDecodeStarted = false;
let airhornFetchPromise = fetch(airhornUrl).then((r) => r.arrayBuffer()).catch(() => null);

function preloadAirhorn(ctx) {
  if (airhornDecodeStarted) return;
  airhornDecodeStarted = true;
  airhornFetchPromise
    .then((buf) => (buf ? ctx.decodeAudioData(buf) : null))
    .then((decoded) => { airhornBuffer = decoded; })
    .catch(() => {}); // airhornBuffer stays null -> synth fallback
}

// For the sound-lab test page: 'sample' once real audio is playing, 'synth'
// if the fallback took over, 'loading' in between.
export function airhornStatus() {
  if (airhornBuffer) return 'sample';
  if (airhornDecodeStarted) return 'loading';
  return 'idle';
}

// sound-lab.html only - the real game never calls this, it always plays
// AIRHORN_VARIANTS[0]. Swaps the active sample and re-decodes immediately if
// the AudioContext already exists (otherwise the next hornBlast call does).
export function loadAirhornVariant(url) {
  if (url === airhornUrl && (airhornBuffer || airhornDecodeStarted)) return;
  airhornUrl = url;
  airhornBuffer = null;
  airhornDecodeStarted = false;
  airhornFetchPromise = fetch(url).then((r) => r.arrayBuffer()).catch(() => null);
  const ctx = getAudioContext();
  if (ctx) preloadAirhorn(ctx);
}

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
// One blast: real sample when it's loaded, synthesized fallback otherwise.
function hornBlast(ctx, t0, dur, opts = {}) {
  preloadAirhorn(ctx);
  if (airhornBuffer) hornBlastSample(ctx, airhornBuffer, t0, dur, opts);
  else hornBlastSynth(ctx, t0, dur, opts);
}

// Sample path: pitch is a real playbackRate change (physically what changing
// how you blow an airhorn does, so it reads as natural rather than a
// formant-preserving pitch-shift trick). Fast attack to avoid a click on
// buffers that don't start at a zero-crossing, then hold and fade over the
// same release window the synth path uses. Held notes get the sample's pitch
// wobbled the same way the synth path automates oscillator frequency.
function hornBlastSample(ctx, buffer, t0, dur, { pitch = 1, echo = false } = {}) {
  const release = dur < 0.25 ? 0.05 : 0.15;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = pitch;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(0.9, t0 + 0.003);
  amp.gain.setValueAtTime(0.9, t0 + dur - release);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  source.connect(amp);
  amp.connect(hornBus(ctx));
  source.start(t0);
  source.stop(t0 + dur + 0.05);

  if (dur > 0.4) {
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.5;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.setValueAtTime(0, t0);
    vibratoGain.gain.setValueAtTime(0, t0 + dur * 0.25);
    vibratoGain.gain.linearRampToValueAtTime(0.045, t0 + dur * 0.9);
    vibrato.connect(vibratoGain);
    vibratoGain.connect(source.playbackRate);
    vibrato.start(t0);
    vibrato.stop(t0 + dur + 0.05);
  }

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
    amp.connect(send);
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
}

// Synth fallback (offline / sample failed to load). One blast. The classic
// sample scoops UP into the note (the "bw"), sits on it, and falls off as
// pressure dies (the "aa"). Long blasts get a delayed vibrato that blooms
// across the sustain. The reed rasp comes from soft-clipping a tight saw
// unison, two horn-body formants, and fast shallow AM; wide detune or a dark
// lowpass here turns the whole thing back into an organ.
function hornBlastSynth(ctx, t0, dur, { pitch = 1, echo = false } = {}) {
  const target = 415 * pitch; // ~G#4, where the classic sample sits
  const release = dur < 0.25 ? 0.05 : 0.15;

  // Drive stage: the mix level sets how hard the saws hit the clipper.
  const mix = ctx.createGain();
  mix.gain.value = 0.4;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(2.5 * (i / 511.5 - 1));
  shaper.curve = curve;
  shaper.oversample = '4x';

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 220;
  hp.Q.value = 0.7;
  const bell = ctx.createBiquadFilter();
  bell.type = 'peaking';
  bell.frequency.value = 900;
  bell.Q.value = 2;
  bell.gain.value = 8;
  const bite = ctx.createBiquadFilter();
  bite.type = 'peaking';
  bite.frequency.value = 2800;
  bite.Q.value = 1.5;
  bite.gain.value = 6;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 8000;

  // Diaphragm flutter: fast shallow AM on a unity gain, randomized per blast
  // so the riff's blasts don't phase identically.
  const rough = ctx.createGain();
  rough.gain.setValueAtTime(1, t0);
  const am = ctx.createOscillator();
  am.frequency.value = 50 + Math.random() * 12;
  const amDepth = ctx.createGain();
  amDepth.gain.value = 0.18;
  am.connect(amDepth);
  amDepth.connect(rough.gain);
  am.start(t0);
  am.stop(t0 + dur + 0.05);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(0.14, t0 + 0.008);
  amp.gain.setValueAtTime(0.14, t0 + dur - release);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  mix.connect(shaper);
  shaper.connect(hp);
  hp.connect(bell);
  bell.connect(bite);
  bite.connect(lowpass);
  lowpass.connect(rough);
  rough.connect(amp);
  amp.connect(hornBus(ctx));

  // Breath: a whisper of bandpassed noise, mixed in after the clipper so it
  // stays airy instead of intermodulating with the saws.
  const noise = ctx.createBufferSource();
  const nbuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const nd = nbuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  noise.buffer = nbuf;
  const nbp = ctx.createBiquadFilter();
  nbp.type = 'bandpass';
  nbp.frequency.value = 2800;
  nbp.Q.value = 1;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.045, t0 + 0.015);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  noise.connect(nbp);
  nbp.connect(ng);
  ng.connect(hp);
  noise.start(t0);
  noise.stop(t0 + dur);

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
    amp.connect(send);
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

  const scoopEnd = t0 + Math.min(0.08, dur * 0.4);
  for (const [type, detune, level] of [
    ['sawtooth', -5, 1], ['sawtooth', 0, 1], ['sawtooth', 6, 1], ['square', -1200, 0.25],
  ]) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(target * 0.55, t0);
    osc.frequency.exponentialRampToValueAtTime(target, scoopEnd);
    if (dur >= 0.25) {
      osc.frequency.setValueAtTime(target, t0 + dur - 0.05);
      osc.frequency.exponentialRampToValueAtTime(target * 0.82, t0 + dur);
    }
    if (vibratoGain) vibratoGain.connect(osc.frequency);
    if (level === 1) {
      osc.connect(mix);
    } else {
      const oscGain = ctx.createGain();
      oscGain.gain.value = level;
      osc.connect(oscGain);
      oscGain.connect(mix);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
}

export function playAirhorn({ when = 0, dur = 1.0, pitch = 1, echo = false } = {}) {
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
  duckBed(ctx, t0, 2.6);
  hornBlast(ctx, t0, 0.5, { pitch });
  hornBlast(ctx, t0 + 0.6, 0.22, { pitch });
  hornBlast(ctx, t0 + 0.87, 1.5, { pitch, echo: true });
}

// Long / short-short / looong.
export function playTripleAirhorn() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  duckBed(ctx, t0, 3.0);
  hornBlast(ctx, t0, 0.5, {});
  hornBlast(ctx, t0 + 0.65, 0.22, {});
  hornBlast(ctx, t0 + 0.9, 0.22, {});
  hornBlast(ctx, t0 + 1.15, 1.6, { echo: true });
}

// Checkmate: the riff twice, second pass a hair sharper, echoing into the
// celebration.
export function playMegaAirhorn() {
  playAirhornRiff();
  playAirhornRiff({ when: 2.6, pitch: 1.06 });
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

// Undo, in MLG mode: a comedic raspberry. A buzzy low tone (fast, slightly
// irregular amplitude modulation - two detuned LFOs summed onto the gain, the
// same trick the synth airhorn uses for its diaphragm flutter, just slower
// and deeper) plus a whisper of filtered noise for wetness, sliding flat as
// it runs out of air. Randomized a little per call so undo spam doesn't loop
// identically.
export function playFart() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const dur = 0.42 + Math.random() * 0.28;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  const startFreq = 105 + Math.random() * 25;
  osc.frequency.setValueAtTime(startFreq, t0);
  osc.frequency.exponentialRampToValueAtTime(startFreq * 0.55, t0 + dur);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 1100;

  const buzz = ctx.createGain();
  buzz.gain.value = 1;
  const lfo1 = ctx.createOscillator();
  lfo1.frequency.value = 38 + Math.random() * 10;
  const lfo2 = ctx.createOscillator();
  lfo2.frequency.value = 27 + Math.random() * 8;
  const lfoGain1 = ctx.createGain();
  lfoGain1.gain.value = 0.22;
  const lfoGain2 = ctx.createGain();
  lfoGain2.gain.value = 0.18;
  lfo1.connect(lfoGain1);
  lfoGain1.connect(buzz.gain);
  lfo2.connect(lfoGain2);
  lfoGain2.connect(buzz.gain);
  lfo1.start(t0);
  lfo1.stop(t0 + dur);
  lfo2.start(t0);
  lfo2.stop(t0 + dur);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
  amp.gain.setValueAtTime(0.22, t0 + dur - 0.08);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(lowpass);
  lowpass.connect(buzz);
  buzz.connect(amp);
  amp.connect(bedBus(ctx));
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);

  // A little filtered noise for wetness.
  const noise = ctx.createBufferSource();
  const nbuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const nd = nbuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  noise.buffer = nbuf;
  const nbp = ctx.createBiquadFilter();
  nbp.type = 'bandpass';
  nbp.frequency.value = 700;
  nbp.Q.value = 0.8;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.05, t0 + 0.02);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  noise.connect(nbp);
  nbp.connect(ng);
  ng.connect(bedBus(ctx));
  noise.start(t0);
  noise.stop(t0 + dur);
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

// Mario-style two-note coin: B5 -> E6, scaled together by ratio so the
// interval survives per-coin pitch jitter.
function coinBlip(ctx, t0, ratio = 1, peak = 0.09) {
  for (const [freq, when, dur] of [[988, 0, 0.08], [1319, 0.08, 0.24]]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq * ratio;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0 + when);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + when + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + when + dur);
    osc.connect(gain);
    gain.connect(bedBus(ctx));
    osc.start(t0 + when);
    osc.stop(t0 + when + dur + 0.02);
  }
}

// Single coin for LEVEL UP / XP gains.
export function playCoin() {
  const ctx = getAudioContext();
  if (!ctx) return;
  coinBlip(ctx, ctx.currentTime);
}

// Coins spilling out of a captured piece: a cascade of quieter coin blips
// with per-coin pitch and timing jitter. Bed-routed, so airhorns duck it.
export function playCoinBurst(count = 4, { when = 0 } = {}) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const n = Math.max(2, Math.min(Math.round(count), 9));
  let at = ctx.currentTime + when;
  for (let i = 0; i < n; i++) {
    const ratio = Math.pow(2, (Math.random() * 2 - 1) / 12); // +/- 1 semitone
    coinBlip(ctx, at, ratio, 0.055);
    at += 0.055 + Math.random() * 0.035;
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
