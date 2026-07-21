// Standalone harness for sound-lab.html. Not imported anywhere in the game -
// dev-only, reached at /sound-lab.html under `npm run dev`.
import { ensureAudio } from '../audio/sfx.js';
import {
  playAirhorn, playAirhornRiff, playTripleAirhorn, playMegaAirhorn,
  playBassDrop, playWobbleDrop, playRecordScratch, playSadTrombone,
  playHitmarker, playCoin, playKoStar, playFart, airhornStatus,
  AIRHORN_VARIANTS, loadAirhornVariant,
} from './mlg-audio.js';

const variantSelect = document.getElementById('variant');
for (const v of AIRHORN_VARIANTS) {
  const opt = document.createElement('option');
  opt.value = v.url;
  opt.textContent = v.label;
  variantSelect.appendChild(opt);
}
variantSelect.addEventListener('change', () => {
  ensureAudio();
  loadAirhornVariant(variantSelect.value);
});

const PRESETS = {
  check: () => playAirhorn({ dur: 0.65, pitch: 0.85 }),
  captureHype2: () => playAirhorn(),
  captureOccasional: () => playAirhorn({ dur: 0.65, pitch: 1.1 }),
  riff: () => playAirhornRiff(),
  triple: () => playTripleAirhorn(),
  mega: () => playMegaAirhorn(),
};

const OTHERS = {
  bassDrop: () => playBassDrop(),
  wobbleDrop: () => playWobbleDrop(),
  recordScratch: () => playRecordScratch(),
  sadTrombone: () => playSadTrombone(),
  hitmarker: () => playHitmarker(),
  coin: () => playCoin(),
  koStar: () => playKoStar(),
  fart: () => playFart(),
};

document.querySelectorAll('[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    ensureAudio();
    PRESETS[btn.dataset.preset]();
  });
});

document.querySelectorAll('[data-other]').forEach((btn) => {
  btn.addEventListener('click', () => {
    ensureAudio();
    OTHERS[btn.dataset.other]();
  });
});

const durInput = document.getElementById('dur');
const pitchInput = document.getElementById('pitch');
const durVal = document.getElementById('durVal');
const pitchVal = document.getElementById('pitchVal');
const echoInput = document.getElementById('echo');

const syncLabels = () => {
  durVal.textContent = Number(durInput.value).toFixed(2);
  pitchVal.textContent = Number(pitchInput.value).toFixed(2);
};
durInput.addEventListener('input', syncLabels);
pitchInput.addEventListener('input', syncLabels);
syncLabels();

document.querySelector('[data-custom="play"]').addEventListener('click', () => {
  ensureAudio();
  playAirhorn({
    dur: Number(durInput.value),
    pitch: Number(pitchInput.value),
    echo: echoInput.checked,
  });
});

const statusEl = document.getElementById('status');
const statusNoteEl = document.getElementById('statusNote');
const STATUS_NOTES = {
  idle: 'no airhorn played yet - click a button below',
  loading: 'sample fetched/decoding - next blast may still fall back to synth',
  sample: 'real sample loaded - every blast from here on uses it',
};
setInterval(() => {
  const s = airhornStatus();
  statusEl.textContent = s;
  statusEl.className = s;
  statusNoteEl.textContent = STATUS_NOTES[s] ?? '';
}, 200);
