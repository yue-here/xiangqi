// Optional MLG mode: every effect here no-ops unless enabled. Visuals are
// DOM/CSS overlays plus Three.js meshes in fxGroup; audio lives in
// mlg-audio.js - synthesized, except the airhorn, which plays a real CC0
// sample (see mlg-audio.js for why). All streak/score/feed state is
// recomputed from the game history, so undo/reload resync is free.
import * as THREE from 'three';
import {
  playAirhorn, playAirhornRiff, playMegaAirhorn, playBassDrop, playSadTrombone,
  playHitmarker, playStreakStinger, playCoin, playCoinBurst, playRecordScratch, playWobbleDrop,
  playWhoosh, playKoStar, playFart, say, stopSpeech,
} from './mlg-audio.js';
import { detectEvents, computeStreaks, computeScores, capturePoints, hypeOf } from './mlg-events.js';
import { tween, tweenPromise, cancelTween, setTimeScale, ease } from '../scene/tween.js';
import { gridToWorld } from '../scene/scene.js';
import { PIECE_HEIGHT, restingY } from '../scene/pieces.js';
import { pieceChar } from '../game/notation.js';

const CONFETTI_COLORS = ['#ffe000', '#ff1744', '#00e676', '#2979ff', '#e040fb', '#ff9100', '#69f000'];
const CONFETTI_EMOJI = ['💯', '🔥', '😂', '🏆', '🥤', '😎', '👑'];
const WEAPON_EMOJI = { C: '💣', R: '🏎️', H: '🐎', S: '🔪', G: '👑', A: '🛡️', E: '🐘' };

// Motion-sickness guard: heavy camera work and shakes are capped, everything
// else (text, confetti, audio) stays - the meme survives, the nausea doesn't.
const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function createMLG({ container, layer, camera, fxGroup, rig, getHistory, getSymbols, getMeshes }) {
  let enabled = false;
  let sunglasses = null;
  const timers = new Set();
  const flights = new Set(); // in-flight 3D effect tweens: {entry, cleanup}

  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };

  const track = (entry, cleanup) => {
    const flight = { entry, cleanup };
    flights.add(flight);
    return flight;
  };

  const spawn = (className, text = '') => {
    const div = document.createElement('div');
    div.className = className;
    if (text) div.textContent = text;
    layer.appendChild(div);
    return div;
  };

  // --mlg-life drives the CSS animation duration so removal and fade stay in
  // sync (inline animation-duration would clobber --mega's infinite hue cycle).
  const impactText = (text, extraClass = '', lifeMs = 1600) => {
    const div = spawn(`mlg-impact ${extraClass}`, text);
    div.style.setProperty('--mlg-life', `${lifeMs}ms`);
    later(() => div.remove(), lifeMs);
    return div;
  };

  // Per-letter slam: each character drops in from above the viewport with a
  // small stagger. The --letters class hands the parent's animation to the
  // spans (the parent only fades out at the end). The stagger is capped so
  // long phrases still land every letter before the fade begins.
  const impactLetters = (text, extraClass = '', lifeMs = 2600) => {
    const div = spawn(`mlg-impact mlg-impact--letters ${extraClass}`);
    div.style.setProperty('--mlg-life', `${lifeMs}ms`);
    [...text].forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'mlg-letter';
      s.style.animationDelay = `${Math.min(i * 45, 700)}ms`;
      s.textContent = ch === ' ' ? '\u00a0' : ch;
      div.appendChild(s);
    });
    later(() => div.remove(), lifeMs);
  };

  const worldToScreen = (worldPos) => {
    const v = worldPos.clone().project(camera);
    const rect = container.getBoundingClientRect();
    return {
      x: (v.x * 0.5 + 0.5) * rect.width,
      y: (-v.y * 0.5 + 0.5) * rect.height,
    };
  };

  const screenPosOf = (row, col, lift = PIECE_HEIGHT) => {
    const pos = gridToWorld(row, col);
    pos.y += lift;
    return worldToScreen(pos);
  };

  const hitmarkerAt = (row, col, jitter = 0) => {
    const { x, y } = screenPosOf(row, col);
    const div = spawn('mlg-hitmarker');
    div.style.left = `${x + (Math.random() - 0.5) * jitter}px`;
    div.style.top = `${y + (Math.random() - 0.5) * jitter}px`;
    later(() => div.remove(), 500);
  };

  // Hitmarker trail along the shot line for NOSCOPE cannon snipes.
  const hitmarkerTrail = (from, to) => {
    for (let i = 1; i <= 3; i++) {
      const t = i / 3;
      const row = from[0] + (to[0] - from[0]) * t;
      const col = from[1] + (to[1] - from[1]) * t;
      later(() => {
        hitmarkerAt(row, col, 14);
        playHitmarker();
      }, i * 70);
    }
  };

  const SHAKE_MS = { 1: 400, 2: 550, 3: 700, 4: 900 };
  const SHAKE_CLASSES = ['mlg-shake-1', 'mlg-shake-2', 'mlg-shake-3', 'mlg-shake-4'];

  const shake = (tier = 1) => {
    const level = REDUCED ? 1 : Math.max(1, Math.min(tier, 4));
    const cls = `mlg-shake-${level}`;
    container.classList.remove(...SHAKE_CLASSES);
    // Force a reflow so re-adding a class restarts the animation.
    void container.offsetWidth;
    container.classList.add(cls);
    later(() => container.classList.remove(cls), SHAKE_MS[level] + 80);
    // Big hits also rattle the HUD (banners, scoreboard) - it's a sibling of
    // the scene container, so it never shakes on its own.
    if (level >= 3) {
      const hud = layer.parentElement;
      hud.classList.remove('mlg-hud-shake');
      void hud.offsetWidth;
      hud.classList.add('mlg-hud-shake');
      later(() => hud.classList.remove('mlg-hud-shake'), 630);
    }
  };

  // Continuous low-level rumble; the ID-scoped shake classes outrank its CSS,
  // so a big shake plays over it and hands off cleanly.
  const setRumble = (on) => {
    if (REDUCED) return;
    container.classList.toggle('mlg-rumble', on);
  };

  const speedlines = () => {
    const div = spawn('mlg-speedlines');
    later(() => div.remove(), 550);
  };

  const floatText = (text, x, y, extraClass = '') => {
    const div = spawn(`mlg-float ${extraClass}`, text);
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    later(() => div.remove(), 1600);
  };

  const confetti = (rects = 90, emoji = 40, doritos = 0) => {
    // Soft cap so stacked celebration waves can't run away with the DOM.
    if (layer.querySelectorAll('.mlg-confetto').length > 320) return;
    const rect = container.getBoundingClientRect();
    for (let i = 0; i < rects + emoji + doritos; i++) {
      const isEmoji = i >= rects && i < rects + emoji;
      const isDorito = i >= rects + emoji;
      const div = spawn(isDorito
        ? 'mlg-confetto mlg-confetto-dorito'
        : isEmoji ? 'mlg-confetto mlg-confetto-emoji' : 'mlg-confetto');
      div.style.left = `${Math.random() * rect.width}px`;
      div.style.animationDuration = `${1.8 + Math.random() * 2.2}s`;
      div.style.animationDelay = `${Math.random() * 0.8}s`;
      if (isEmoji) {
        div.textContent = CONFETTI_EMOJI[i % CONFETTI_EMOJI.length];
        div.style.fontSize = `${18 + Math.random() * 16}px`;
      } else if (!isDorito) {
        div.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        div.style.width = `${8 + Math.random() * 10}px`;
        div.style.height = `${6 + Math.random() * 8}px`;
      }
      later(() => div.remove(), 5400);
    }
  };

  // --- 3D effects ---

  // Rainbow trail puffs: pooled billboard sprites sharing one radial-gradient
  // texture, each with its own material so hues can differ.
  let puffTexture = null;
  const puffPool = [];

  const getPuffTexture = () => {
    if (!puffTexture) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const pctx = canvas.getContext('2d');
      const grad = pctx.createRadialGradient(32, 32, 2, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      pctx.fillStyle = grad;
      pctx.fillRect(0, 0, 64, 64);
      puffTexture = new THREE.CanvasTexture(canvas);
    }
    return puffTexture;
  };

  const getPuff = () => {
    for (const sprite of puffPool) {
      if (!sprite.visible) return sprite;
    }
    if (puffPool.length >= 160) return null;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getPuffTexture(),
      transparent: true,
      depthWrite: false,
    }));
    sprite.visible = false;
    fxGroup.add(sprite);
    puffPool.push(sprite);
    return sprite;
  };

  const spawnPuff = (position, hue, size = 0.9) => {
    const sprite = getPuff();
    if (!sprite) return;
    sprite.position.copy(position);
    sprite.material.color.setHSL(hue, 1, 0.62);
    sprite.visible = true;
    tween({
      duration: 0.45,
      easing: ease.outQuad,
      onUpdate: (t) => {
        const s = size * (0.3 + t * 0.9);
        sprite.scale.set(s, s, 1);
        sprite.material.opacity = 0.9 * (1 - t);
      },
      onComplete: () => {
        sprite.visible = false;
      },
    });
  };

  // Additive ember sparks: same radial texture, gravity-driven arcs that die
  // fast and bright.
  const sparkPool = [];

  const getSpark = () => {
    for (const sprite of sparkPool) {
      if (!sprite.visible) return sprite;
    }
    if (sparkPool.length >= 96) return null;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getPuffTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    sprite.visible = false;
    fxGroup.add(sprite);
    sparkPool.push(sprite);
    return sprite;
  };

  const spawnSpark = (position, velocity, hue = 0.12) => {
    const sprite = getSpark();
    if (!sprite) return;
    const p0 = position.clone();
    sprite.position.copy(p0);
    sprite.material.color.setHSL(hue, 1, 0.7);
    sprite.visible = true;
    tween({
      duration: 0.7,
      easing: ease.linear,
      onUpdate: (t) => {
        const e = t * 0.7;
        sprite.position.set(
          p0.x + velocity.x * e,
          Math.max(p0.y + velocity.y * e - 4.9 * e * e, 0.02),
          p0.z + velocity.z * e,
        );
        const s = 0.28 * (1 - t) + 0.05;
        sprite.scale.set(s, s, 1);
        sprite.material.opacity = 1 - t;
      },
      onComplete: () => {
        sprite.visible = false;
      },
    });
  };

  // Emoji sprites in 3D: cached per-char canvas textures, fountain arcs that
  // land on the board and fade.
  const emojiTextures = new Map();
  const emojiPool = [];

  const getEmojiTexture = (char) => {
    let tex = emojiTextures.get(char);
    if (!tex) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ectx = canvas.getContext('2d');
      ectx.font = '96px serif';
      ectx.textAlign = 'center';
      ectx.textBaseline = 'middle';
      ectx.fillText(char, 64, 64);
      tex = new THREE.CanvasTexture(canvas);
      emojiTextures.set(char, tex);
    }
    return tex;
  };

  const getEmojiSprite = (char) => {
    let sprite = emojiPool.find((s) => !s.visible);
    if (!sprite) {
      if (emojiPool.length >= 32) return null;
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        transparent: true,
        depthWrite: false,
      }));
      sprite.visible = false;
      fxGroup.add(sprite);
      emojiPool.push(sprite);
    }
    sprite.material.map = getEmojiTexture(char);
    return sprite;
  };

  const emojiBurst = (row, col, chars, count = 10) => {
    const origin = gridToWorld(row, col);
    for (let i = 0; i < count; i++) {
      const sprite = getEmojiSprite(chars[i % chars.length]);
      if (!sprite) return;
      const angle = Math.random() * Math.PI * 2;
      const vh = 1 + Math.random() * 1.5;
      const vx = Math.cos(angle) * vh;
      const vz = Math.sin(angle) * vh;
      const vy = 3 + Math.random() * 2;
      const spin = (Math.random() - 0.5) * 6;
      const p0 = new THREE.Vector3(origin.x, PIECE_HEIGHT, origin.z);
      sprite.position.copy(p0);
      sprite.material.rotation = 0;
      sprite.material.opacity = 1;
      sprite.scale.set(0.7, 0.7, 1);
      sprite.visible = true;
      tween({
        duration: 1.3,
        easing: ease.linear,
        onUpdate: (t) => {
          const e = t * 1.3;
          sprite.position.set(
            p0.x + vx * e,
            Math.max(p0.y + vy * e - 4.5 * e * e, 0.05),
            p0.z + vz * e,
          );
          sprite.material.rotation = spin * e;
          sprite.material.opacity = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
        },
        onComplete: () => {
          sprite.visible = false;
        },
      });
    }
  };

  // SSB-style KO launch: brief hitstop at the moment of impact, then the
  // captured piece rockets into the stratosphere at high speed with a rainbow
  // trail, spinning wildly, and pops an off-screen KO star. The returned
  // promise resolves at 0.3s (matching the fadeSink pipeline slot) while the
  // visual continues in the background.
  const launchPiece = (mesh, record) => {
    const hype = hypeOf(getHistory());
    const [tr, tc] = record.move.to;
    const start = gridToWorld(tr, tc);
    const startY = mesh.position.y;
    // Fly outward, away from the board center, and far UP - farther, higher
    // and spinnier as the hype climbs.
    const dir = Math.atan2(start.z, start.x) + (Math.random() - 0.5) * 1.0;
    const distance = 11 + hype * 2 + Math.random() * 4;
    const height = 16 + hype * 5 + Math.random() * 5;
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const spins = (10 + hype * 2 + Math.random() * 4) * Math.PI * 2;
    const hueBase = Math.random();

    const cleanup = () => {
      mesh.visible = false;
      mesh.rotation.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
      mesh.position.y = startY;
    };
    const flight = track(null, cleanup);
    let lastPuffT = 0;
    let puffCount = 0;

    // KO star fires the moment the piece leaves the viewport, at that frame's
    // projected position - so mid-flight camera flips/orbits can't desync it.
    let koFired = false;
    let wasInside = false;
    const lastInside = { x: 0, y: 0 };
    const koStarAt = (x, y) => {
      if (koFired) return;
      koFired = true;
      const rect = container.getBoundingClientRect();
      const star = spawn('mlg-ko-star', '✦');
      star.style.left = `${Math.min(Math.max(x, 50), rect.width - 50)}px`;
      star.style.top = `${Math.min(Math.max(y, 50), rect.height - 50)}px`;
      later(() => star.remove(), 900);
      playKoStar();
    };
    const trackExit = () => {
      const rect = container.getBoundingClientRect();
      const { x, y } = worldToScreen(mesh.position);
      const inside = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
      if (inside) {
        wasInside = true;
        lastInside.x = x;
        lastInside.y = y;
      } else if (wasInside) {
        // Nudge the star slightly back toward the screen from the exit point.
        koStarAt(lastInside.x, lastInside.y);
      }
    };

    // Hitstop juggle: on big hits the victim pops up and hangs in the air
    // during the freeze before the blast connects.
    if (hype >= 2) {
      const juggle = track(null, () => {
        mesh.position.y = startY;
      });
      juggle.entry = tween({
        duration: 0.2,
        easing: ease.linear,
        onUpdate: (t) => {
          mesh.position.y = startY + 0.9 * Math.sin(t * Math.PI);
        },
        onComplete: () => {
          flights.delete(juggle);
          mesh.position.y = startY;
        },
      });
    }

    // Hitstop: the victim freezes on impact while the shake lands, then gets
    // blasted. Timed so launch begins as the attacker's slide arrives.
    const holdId = setTimeout(() => {
      timers.delete(holdId);
      playWhoosh(0.9);
      flight.entry = tween({
        duration: 1.5,
        // Explosive start, slight ease at the end - SSB knockback curve.
        easing: (t) => 1 - Math.pow(1 - t, 1.7),
        onUpdate: (t) => {
          mesh.position.set(
            start.x + Math.cos(dir) * distance * t,
            startY + height * t,
            start.z + Math.sin(dir) * distance * t,
          );
          mesh.setRotationFromAxisAngle(axis, spins * t);
          const shrink = 1 - t * 0.45;
          mesh.scale.set(shrink, shrink, shrink);
          if (t - lastPuffT > 0.012) {
            lastPuffT = t;
            puffCount++;
            spawnPuff(mesh.position, (hueBase + puffCount * 0.07) % 1);
          }
          if (!koFired) trackExit();
        },
        onComplete: () => {
          flights.delete(flight);
          // Fallback: the piece never left the viewport - pop at its final
          // projected position instead.
          if (!koFired) {
            const { x, y } = worldToScreen(mesh.position);
            koStarAt(x, y);
          }
          cleanup();
        },
      });
    }, 240);
    timers.add(holdId);

    return tweenPromise({ duration: 0.3, onUpdate: () => {} });
  };

  // Shards + sparks + shockwave exploding from the capture square.
  const shardGeometry = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  const bigShardGeometry = new THREE.BoxGeometry(0.13, 0.13, 0.13);
  const shardBurst = (row, col, color, hype = 1) => {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: color === 'red' ? '#ff6b5e' : '#c9b28a' });
    const origin = gridToWorld(row, col);
    const shards = [];
    const count = 28 + hype * 14;
    for (let i = 0; i < count; i++) {
      const shard = new THREE.Mesh(i % 3 === 0 ? bigShardGeometry : shardGeometry, material);
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      shards.push({
        shard,
        vx: Math.cos(angle) * (1.7 + Math.random() * 2.8),
        vz: Math.sin(angle) * (1.7 + Math.random() * 2.8),
        vy: 2.8 + Math.random() * 3.4,
      });
      group.add(shard);
    }
    group.position.set(origin.x, PIECE_HEIGHT, origin.z);
    fxGroup.add(group);

    // Bright spark puffs radiating with the debris.
    for (let i = 0; i < 10 + hype * 5; i++) {
      const sparkPos = new THREE.Vector3(
        origin.x + (Math.random() - 0.5) * 1.2,
        PIECE_HEIGHT + Math.random() * 0.8,
        origin.z + (Math.random() - 0.5) * 1.2,
      );
      spawnPuff(sparkPos, 0.12 + Math.random() * 0.06, 0.55);
    }
    // Additive embers flying farther than the debris.
    for (let i = 0; i < 12 + hype * 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5;
      spawnSpark(
        new THREE.Vector3(origin.x, PIECE_HEIGHT + 0.1, origin.z),
        new THREE.Vector3(Math.cos(angle) * speed, 2 + Math.random() * 3, Math.sin(angle) * speed),
      );
    }
    shockwave(row, col, '#ffffff');
    if (hype >= 2) later(() => expandRing(row, col, '#ffe000', 3.0, 0.7), 120);

    const cleanup = () => group.removeFromParent();
    const flight = track(null, cleanup);
    flight.entry = tween({
      duration: 1.1,
      easing: ease.linear,
      onUpdate: (t) => {
        for (const { shard, vx, vy, vz } of shards) {
          shard.position.set(vx * t, vy * t - 4.9 * t * t, vz * t);
          const s = Math.max(1 - t, 0.001);
          shard.scale.set(s, s, s);
        }
      },
      onComplete: () => {
        flights.delete(flight);
        cleanup();
      },
    });
  };

  // Expanding flat ring at a square (LEVEL UP gold, capture shockwave white).
  const ringGeometry = new THREE.RingGeometry(0.75, 1, 40);
  const expandRing = (row, col, color, maxScale = 1.3, duration = 0.6) => {
    const material = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeometry, material);
    const pos = gridToWorld(row, col);
    ring.position.set(pos.x, 0.03, pos.z);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.set(0.2, 0.2, 0.2);
    fxGroup.add(ring);

    const cleanup = () => ring.removeFromParent();
    const flight = track(null, cleanup);
    flight.entry = tween({
      duration,
      easing: ease.outQuad,
      onUpdate: (t) => {
        const s = 0.2 + t * maxScale;
        ring.scale.set(s, s, s);
        material.opacity = 0.9 * (1 - t);
      },
      onComplete: () => {
        flights.delete(flight);
        cleanup();
      },
    });
  };
  const shockwave = (row, col, color) => expandRing(row, col, color, 2.0, 0.5);

  // Squash-stretch pop on the attacking piece as its capture lands.
  const slamAttacker = (mesh) => {
    if (!mesh) return;
    const flight = track(null, () => mesh.scale.set(1, 1, 1));
    flight.entry = tween({
      duration: 0.28,
      easing: ease.linear,
      onUpdate: (t) => {
        const k = Math.sin(t * Math.PI) * 0.3;
        mesh.scale.set(1 + k, 1 - k * 0.85, 1 + k);
      },
      onComplete: () => {
        flights.delete(flight);
        mesh.scale.set(1, 1, 1);
      },
    });
  };

  // Height above rest at time t for an upward impulse v0, with gravity and
  // dampened rebounds - a closed-form piecewise bounce.
  const bounceY = (v0, t, g = 22, restitution = 0.45) => {
    let v = v0;
    let remaining = t;
    for (let i = 0; i < 4; i++) {
      const arc = (2 * v) / g;
      if (remaining < arc) return Math.max(v * remaining - 0.5 * g * remaining * remaining, 0);
      remaining -= arc;
      v *= restitution;
    }
    return 0;
  };

  // Impact rattle: every piece on the board hops with an impulse that decays
  // with distance from the impact square, delayed like a shockwave, with a
  // small decaying tilt wobble. Driven by a single tween.
  let activeRattle = null;
  const rattlePieces = (row, col, intensity, excludeIds = []) => {
    const meshMap = getMeshes?.();
    if (!meshMap) return;
    if (activeRattle) {
      cancelTween(activeRattle.entry);
      activeRattle.cleanup();
      flights.delete(activeRattle);
      activeRattle = null;
    }

    const origin = gridToWorld(row, col);
    const rattled = [];
    for (const [id, m] of meshMap) {
      if (!m.visible || excludeIds.includes(id)) continue;
      const dist = Math.hypot(m.position.x - origin.x, m.position.z - origin.z);
      const falloff = 1 / (1 + dist * 0.35);
      // v0 ~3.3 gives a satisfying ~0.25-unit hop with a 0.3s first arc;
      // capped so the max-intensity game-over rattle stays plausible.
      const v0 = Math.min(intensity * falloff * (0.75 + Math.random() * 0.5) * 3.4, 6.0);
      rattled.push({
        m,
        delay: dist * 0.035,
        v0,
        wobble: 0.07 * falloff,
        wx: Math.random() * Math.PI * 2,
        wz: Math.random() * Math.PI * 2,
      });
    }
    if (!rattled.length) return;

    const DURATION = 1.15;
    const cleanup = () => {
      for (const r of rattled) {
        r.m.position.y = restingY();
        r.m.rotation.set(0, 0, 0);
      }
    };
    const flight = track(null, cleanup);
    activeRattle = flight;
    flight.entry = tween({
      duration: DURATION,
      easing: ease.linear,
      onUpdate: (t) => {
        const now = t * DURATION;
        for (const r of rattled) {
          const lt = now - r.delay;
          if (lt <= 0) continue;
          r.m.position.y = restingY() + bounceY(r.v0, lt);
          const decay = Math.max(1 - lt / 0.8, 0);
          r.m.rotation.x = Math.sin(lt * 28 + r.wx) * r.wobble * decay;
          r.m.rotation.z = Math.sin(lt * 24 + r.wz) * r.wobble * decay;
        }
      },
      onComplete: () => {
        flights.delete(flight);
        if (activeRattle === flight) activeRattle = null;
        cleanup();
      },
    });
  };

  // "Deal With It": pixel sunglasses built from black planes, descending onto
  // the winning general.
  const dropSunglasses = (row, col) => {
    removeSunglasses();
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#0a0a0a' });
    const lensGeo = new THREE.BoxGeometry(0.28, 0.02, 0.16);
    const left = new THREE.Mesh(lensGeo, mat);
    left.position.x = -0.17;
    const right = new THREE.Mesh(lensGeo, mat);
    right.position.x = 0.17;
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.05), mat);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.04), mat);
    arm.position.z = -0.08;
    group.add(left, right, bridge, arm);

    const pos = gridToWorld(row, col);
    group.position.set(pos.x, pos.y + 3.2, pos.z + 0.05);
    fxGroup.add(group);
    sunglasses = group;

    const targetY = pos.y + PIECE_HEIGHT + 0.04;
    const startY = group.position.y;
    tweenPromise({
      duration: 1.1,
      easing: ease.inOutCubic,
      onUpdate: (t) => {
        group.position.y = startY + (targetY - startY) * t;
      },
    });
  };

  const removeSunglasses = () => {
    if (sunglasses) {
      sunglasses.removeFromParent();
      sunglasses = null;
    }
  };

  // --- Scoreboard + kill feed (rebuilt from history) ---

  const comboBar = (streak) => {
    let bar = '';
    for (let i = 0; i < 5; i++) bar += i < Math.min(streak, 5) ? '■' : '□';
    return bar;
  };

  const pieceTag = (piece) => {
    const cls = piece.color === 'red' ? 'mlg-red' : 'mlg-black';
    const name = getSymbols?.()
      ? `${piece.color === 'red' ? 'R' : 'B'}·${piece.type}`
      : `${piece.color === 'red' ? '红' : '黑'}${pieceChar(piece.type, piece.color)}`;
    return `<span class="${cls}">${name}</span>`;
  };

  const renderBoards = () => {
    const history = getHistory();
    let scoreboard = layer.querySelector('.mlg-scoreboard');
    if (!scoreboard) {
      scoreboard = spawn('mlg-scoreboard');
    }
    const scores = computeScores(history);
    const streaks = computeStreaks(history);
    scoreboard.innerHTML = `
      <div class="mlg-scoreboard-title">🎮 MLG SCORE</div>
      <div class="mlg-score-row"><span class="mlg-red">RED</span><b>${scores.red}</b><span class="mlg-combo">${comboBar(streaks.red)}</span></div>
      <div class="mlg-score-row"><span class="mlg-black">BLK</span><b>${scores.black}</b><span class="mlg-combo">${comboBar(streaks.black)}</span></div>
    `;

    let feed = layer.querySelector('.mlg-feed');
    if (!feed) feed = spawn('mlg-feed');
    const captures = history.filter((r) => r.captured).slice(-4);
    feed.innerHTML = captures.map((rec, i) => {
      const tags = i === captures.length - 1 && rec === history[history.length - 1]
        ? detectEvents(history).filter((e) => e.priority < 100).map((e) => ` <i>${e.type.replace('_', ' ')}</i>`).join('')
        : '';
      return `<div class="mlg-feed-row${i === captures.length - 1 ? ' latest' : ''}">`
        + `${pieceTag(rec.piece)} ${WEAPON_EMOJI[rec.piece.type] ?? '⚔️'} ${pieceTag(rec.captured)}${tags}</div>`;
    }).join('');
  };

  // Up to four stacked event banners: the headliner center-stage (mega /
  // per-letter treatment as hype climbs), the rest smaller, lower, and
  // staggered. All through later() so undo mid-cascade cancels cleanly.
  const queueBanners = (banners, hype) => {
    banners.slice(0, 4).forEach((e, i) => {
      later(() => {
        if (i === 0) {
          if (hype >= 3) impactLetters(e.label, 'mlg-impact--mega', 2200);
          else if (hype >= 2) impactText(e.label, 'mlg-impact--mega', 1900);
          else impactText(e.label);
          if (e.say) say(e.say);
        } else {
          const div = impactText(e.label, 'mlg-impact--minor', 1300);
          div.style.top = `${52 + i * 8}%`;
        }
      }, i * 380);
    });
  };

  // Checkmate circus: a scripted ~7s timeline. Every beat goes through
  // later() so undo mid-sequence tears the whole thing down.
  const runCheckmateSequence = (status, generalPos) => {
    const last = getHistory().at(-1);
    const mateSq = last?.move.to ?? generalPos ?? [4, 4];

    const flash = spawn('mlg-flash-white');
    later(() => flash.remove(), 300);
    playBassDrop(0.9);
    shake(4);
    rattlePieces(
      mateSq[0],
      mateSq[1],
      4.2,
      last ? [last.piece.id, last.captured?.id].filter(Boolean) : [],
    );
    shardBurst(mateSq[0], mateSq[1], status.winner === 'red' ? 'black' : 'red', 3);

    later(() => {
      const badge = spawn('mlg-replay-badge');
      badge.innerHTML = '<i>●</i> REC&nbsp;&nbsp;INSTANT REPLAY';
      later(() => badge.remove(), 2250);
    }, 150);
    later(() => {
      if (REDUCED) {
        rig.punchFov(6);
      } else {
        rig.crashZoom(18, 0.7);
        speedlines();
      }
    }, 300);
    later(() => {
      playWobbleDrop(4.5);
      setRumble(true);
    }, 500);
    later(() => {
      playMegaAirhorn();
      say('game over. get rekt.');
    }, 800);
    later(() => impactLetters('GG', 'mlg-gg', 4400), 900);
    later(() => {
      confetti(150, 60, 30);
      if (generalPos) emojiBurst(generalPos[0], generalPos[1], ['🏆', '👑', '💯'], 14);
    }, 1100);
    later(() => rig.victorySpin(8), 1700);
    later(() => {
      // Sits below the giant GG, which is still on screen.
      impactText('GET REKT', 'mlg-impact--mega', 2400).style.top = '60%';
    }, 2300);
    later(() => {
      impactText('NOT EVEN CLOSE BABY', 'mlg-impact--minor', 1800);
      confetti(120, 50, 20);
    }, 2900);
    if (generalPos) later(() => dropSunglasses(generalPos[0], generalPos[1]), 3200);
    later(() => {
      const scores = computeScores(getHistory());
      const div = impactText(
        `${status.winner.toUpperCase()} WINS · ${scores[status.winner]} PTS`,
        'mlg-impact--minor',
        2200,
      );
      div.style.top = '64%';
    }, 3600);
    later(() => {
      rattlePieces(mateSq[0], mateSq[1], 2.4, []);
      playCoin();
      later(() => playCoin(), 120);
      later(() => playCoin(), 240);
    }, 4300);
    later(() => confetti(90, 70, 0), 4800);
    later(() => setRumble(false), 5200);
  };

  const runStalemateSequence = (generalPos) => {
    const last = getHistory().at(-1);
    if (last) {
      rattlePieces(
        last.move.to[0],
        last.move.to[1],
        3.2,
        [last.piece.id, last.captured?.id].filter(Boolean),
      );
    }
    playRecordScratch();
    say('bruh');
    impactLetters('BRUH.', 'mlg-gg', 4000);
    confetti(60, 30, 10);
    later(() => playSadTrombone(), 900);
    later(() => impactText('NO MOVES. NO HOPE.', 'mlg-impact--minor', 2000), 1600);
    later(() => rig.victorySpin(6), 400);
    if (generalPos) later(() => dropSunglasses(generalPos[0], generalPos[1]), 1200);
  };

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(value, { splash = false } = {}) {
      enabled = value;
      if (!value) {
        this.clear();
        return;
      }
      renderBoards();
      if (splash) {
        impactText('MLG MODE ACTIVATED', 'mlg-impact--activate', 2400);
        playAirhornRiff();
        say('M L G mode activated');
      }
    },
    syncFromHistory() {
      if (!enabled) return;
      renderBoards();
    },
    // Replaces fadeSink for captures while enabled; null lets main.js fall
    // back to the default animation.
    captureAnimation(mesh, record) {
      if (!enabled) return null;
      return launchPiece(mesh, record);
    },
    // Called after every completed move animation (capture or not).
    onMoveComplete(record, status) {
      if (!enabled) return;
      const history = getHistory();
      const events = detectEvents(history);
      const streak = record.captured ? computeStreaks(history)[record.piece.color] : 0;
      const hype = hypeOf(history);
      const [tr, tc] = record.move.to;

      if (record.captured) {
        hitmarkerAt(tr, tc);
        playHitmarker();
        shardBurst(tr, tc, record.captured.color, hype);
        slamAttacker(getMeshes?.()?.get(record.piece.id));

        shake(hype);
        rattlePieces(tr, tc, 1.7 + hype * 0.55, [record.piece.id, record.captured.id]);

        const points = capturePoints(history);
        const { x, y } = screenPosOf(tr, tc);
        floatText(`+${points}${streak >= 2 ? ` ×${streak}` : ''}`, x, y - 30);
        // Slightly delayed so the hitmarker tick lands first.
        playCoinBurst(2 + Math.floor(points / 150), { when: 0.12 });

        if (events.some((e) => e.type === 'NOSCOPE')) {
          hitmarkerTrail(record.move.from, record.move.to);
        }
        if (events.some((e) => e.type === 'FIRST_BLOOD')) {
          const flash = spawn('mlg-flash-red');
          later(() => flash.remove(), 600);
        }
        // Audio caps: max one airhorn call and one special stinger per move.
        if (hype >= 3) {
          playAirhornRiff();
          playBassDrop(0.6);
        } else if (hype >= 2) {
          playAirhorn();
        } else if (Math.random() < 0.25) {
          playAirhorn({ dur: 0.65, pitch: 1.1 });
        }
        const top = events[0];
        if (top?.type === 'STREAK') playStreakStinger(Math.min(streak, 7));
        else if (top?.type === 'HUMILIATION') playRecordScratch();

        // Camera: fov punch -> dutch roll -> full crash zoom as hype climbs.
        if (REDUCED) {
          rig.punchFov(6);
        } else if (hype >= 3) {
          rig.crashZoom(17, 0.6);
          rig.punchRoll(5, 0.6);
          speedlines();
        } else if (hype >= 2) {
          rig.punchFov(12);
          rig.punchRoll(3, 0.45);
        } else {
          rig.punchFov(7);
        }

        if (hype >= 2) later(() => emojiBurst(tr, tc, ['🔥', '💯'], 8 + hype * 4), 350);
        if (hype >= 3 && !status.over) {
          later(() => confetti(40, 16, 8), 500);
          if (streak >= 6) {
            setRumble(true);
            later(() => setRumble(false), 1200);
          }
        }
        renderBoards();
      }

      const levelUp = events.find((e) => e.type === 'LEVEL_UP');
      if (levelUp) {
        playCoin();
        expandRing(tr, tc, '#ffd700');
        const { x, y } = screenPosOf(tr, tc);
        floatText('+100 XP', x, y - 46, 'mlg-float--xp');
      }

      // Banner cascade: suppressed entirely at game over (the checkmate
      // sequence owns the screen).
      if (!status.over) {
        queueBanners(events.filter((e) => e.label && e.type !== 'LEVEL_UP'), hype);
      }
    },
    onCheck() {
      if (!enabled) return;
      const vignette = spawn('mlg-vignette');
      later(() => vignette.remove(), 1000);
      const warning = spawn('mlg-warning', '⚠ WARNING ⚠');
      later(() => warning.remove(), 1300);
      playAirhorn({ dur: 0.65, pitch: 0.85 });
    },
    onUndo() {
      if (!enabled) return;
      playFart();
    },
    onGameOver(status, generalPos) {
      if (!enabled) return;
      if (status.reason === 'checkmate') runCheckmateSequence(status, generalPos);
      else runStalemateSequence(generalPos);
      renderBoards();
    },
    onNewGame() {
      this.clear();
      if (enabled) renderBoards();
    },
    clear() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const flight of flights) {
        if (flight.entry) cancelTween(flight.entry);
        flight.cleanup();
      }
      flights.clear();
      activeRattle = null;
      for (const sprite of puffPool) sprite.visible = false;
      for (const sprite of sparkPool) sprite.visible = false;
      for (const sprite of emojiPool) sprite.visible = false;
      layer.innerHTML = '';
      container.classList.remove(...SHAKE_CLASSES, 'mlg-rumble');
      layer.parentElement.classList.remove('mlg-hud-shake');
      removeSunglasses();
      rig.cancelSpin();
      rig.cancelFx();
      setTimeScale(1);
      stopSpeech();
      if (enabled) renderBoards();
    },
  };
}
