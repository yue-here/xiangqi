// Optional MLG mode: every effect here no-ops unless enabled. Visuals are
// DOM/CSS overlays plus Three.js meshes in fxGroup; audio lives in
// mlg-audio.js. No external assets. All streak/score/feed state is recomputed
// from the game history, so undo/reload resync is free.
import * as THREE from 'three';
import {
  playAirhorn, playTripleAirhorn, playHitmarker, playStreakStinger,
  playCoin, playRecordScratch, playWobbleDrop, playWhoosh, playKoStar,
  say, stopSpeech,
} from './mlg-audio.js';
import { detectEvents, computeStreaks, computeScores, capturePoints } from './mlg-events.js';
import { tween, tweenPromise, cancelTween, setTimeScale, ease } from '../scene/tween.js';
import { gridToWorld } from '../scene/scene.js';
import { PIECE_HEIGHT, restingY } from '../scene/pieces.js';
import { pieceChar } from '../game/notation.js';

const CONFETTI_COLORS = ['#ffe000', '#ff1744', '#00e676', '#2979ff', '#e040fb', '#ff9100'];
const CONFETTI_EMOJI = ['💯', '🔥', '😂', '🏆', '🥤', '😎', '👑'];
const WEAPON_EMOJI = { C: '💣', R: '🏎️', H: '🐎', S: '🔪', G: '👑', A: '🛡️', E: '🐘' };

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

  const impactText = (text, extraClass = '', lifeMs = 2200) => {
    const div = spawn(`mlg-impact ${extraClass}`, text);
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

  const shake = (tier = 1) => {
    const cls = `mlg-shake-${Math.max(1, Math.min(tier, 3))}`;
    container.classList.remove('mlg-shake-1', 'mlg-shake-2', 'mlg-shake-3');
    // Force a reflow so re-adding a class restarts the animation.
    void container.offsetWidth;
    container.classList.add(cls);
    later(() => container.classList.remove(cls), 650);
  };

  const floatText = (text, x, y, extraClass = '') => {
    const div = spawn(`mlg-float ${extraClass}`, text);
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    later(() => div.remove(), 1600);
  };

  const confetti = (rects = 90, emoji = 40) => {
    const rect = container.getBoundingClientRect();
    for (let i = 0; i < rects + emoji; i++) {
      const isEmoji = i >= rects;
      const div = spawn(isEmoji ? 'mlg-confetto mlg-confetto-emoji' : 'mlg-confetto');
      div.style.left = `${Math.random() * rect.width}px`;
      div.style.animationDuration = `${1.8 + Math.random() * 2.2}s`;
      div.style.animationDelay = `${Math.random() * 0.8}s`;
      if (isEmoji) {
        div.textContent = CONFETTI_EMOJI[i % CONFETTI_EMOJI.length];
        div.style.fontSize = `${18 + Math.random() * 16}px`;
      } else {
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

  const getPuff = () => {
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
    for (const sprite of puffPool) {
      if (!sprite.visible) return sprite;
    }
    if (puffPool.length >= 48) return null;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: puffTexture,
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

  // SSB-style KO launch: brief hitstop at the moment of impact, then the
  // captured piece rockets into the stratosphere at high speed with a rainbow
  // trail, spinning wildly, and pops an off-screen KO star. The returned
  // promise resolves at 0.3s (matching the fadeSink pipeline slot) while the
  // visual continues in the background.
  const launchPiece = (mesh, record) => {
    const [tr, tc] = record.move.to;
    const start = gridToWorld(tr, tc);
    const startY = mesh.position.y;
    // Fly outward, away from the board center, and far UP.
    const dir = Math.atan2(start.z, start.x) + (Math.random() - 0.5) * 1.0;
    const distance = 10 + Math.random() * 4;
    const height = 16 + Math.random() * 5;
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const spins = (8 + Math.random() * 4) * Math.PI * 2;
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
          if (t - lastPuffT > 0.02) {
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
  const shardBurst = (row, col, color) => {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: color === 'red' ? '#ff6b5e' : '#c9b28a' });
    const origin = gridToWorld(row, col);
    const shards = [];
    for (let i = 0; i < 24; i++) {
      const shard = new THREE.Mesh(i % 3 === 0 ? bigShardGeometry : shardGeometry, material);
      const angle = (i / 24) * Math.PI * 2 + Math.random() * 0.4;
      shards.push({
        shard,
        vx: Math.cos(angle) * (1.4 + Math.random() * 2.2),
        vz: Math.sin(angle) * (1.4 + Math.random() * 2.2),
        vy: 2.4 + Math.random() * 2.6,
      });
      group.add(shard);
    }
    group.position.set(origin.x, PIECE_HEIGHT, origin.z);
    fxGroup.add(group);

    // Bright spark puffs radiating with the debris.
    for (let i = 0; i < 8; i++) {
      const sparkPos = new THREE.Vector3(
        origin.x + (Math.random() - 0.5) * 1.2,
        PIECE_HEIGHT + Math.random() * 0.8,
        origin.z + (Math.random() - 0.5) * 1.2,
      );
      spawnPuff(sparkPos, 0.12 + Math.random() * 0.06, 0.55);
    }
    shockwave(row, col, '#ffffff');

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
      const v0 = Math.min(intensity * falloff * (0.75 + Math.random() * 0.5) * 3.4, 4.5);
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
        impactText('MLG MODE ACTIVATED', 'mlg-impact--activate', 1800);
        playAirhorn({ dur: 0.5 });
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
      const [tr, tc] = record.move.to;

      if (record.captured) {
        hitmarkerAt(tr, tc);
        playHitmarker();
        shardBurst(tr, tc, record.captured.color);

        const big = record.captured.type === 'R' || record.captured.type === 'C';
        shake(streak >= 4 ? 3 : big || streak >= 2 ? 2 : 1);
        rattlePieces(
          tr,
          tc,
          streak >= 4 ? 2.6 : big || streak >= 2 ? 2.0 : 1.4,
          [record.piece.id, record.captured.id],
        );

        const points = capturePoints(history);
        const { x, y } = screenPosOf(tr, tc);
        floatText(`+${points}${streak >= 2 ? ` ×${streak}` : ''}`, x, y - 30);

        if (events.some((e) => e.type === 'NOSCOPE')) {
          hitmarkerTrail(record.move.from, record.move.to);
        }
        if (events.some((e) => e.type === 'FIRST_BLOOD')) {
          const flash = spawn('mlg-flash-red');
          later(() => flash.remove(), 600);
        }
        // Audio caps: max one airhorn and one special stinger per move.
        if (big || streak >= 3) playAirhorn();
        const top = events[0];
        if (top?.type === 'STREAK') playStreakStinger(Math.min(streak, 7));
        else if (top?.type === 'HUMILIATION') playRecordScratch();
        rig.punchFov(Math.min(big ? 11 : 5 + 2 * streak, 14));
        renderBoards();
      }

      const levelUp = events.find((e) => e.type === 'LEVEL_UP');
      if (levelUp) {
        playCoin();
        expandRing(tr, tc, '#ffd700');
        const { x, y } = screenPosOf(tr, tc);
        floatText('+100 XP', x, y - 46, 'mlg-float--xp');
      }

      // Banner queue: top event center-stage, runner-up smaller and delayed,
      // the rest live in the kill feed only. Suppressed entirely at game over
      // (the GG/BRUH celebration owns the screen).
      if (!status.over) {
        const banners = events.filter((e) => e.label && e.type !== 'LEVEL_UP');
        if (banners[0]) {
          impactText(banners[0].label);
          if (banners[0].say) say(banners[0].say);
        }
        if (banners[1]) {
          later(() => impactText(banners[1].label, 'mlg-impact--minor', 1600), 700);
        }
      }
    },
    onCheck() {
      if (!enabled) return;
      const vignette = spawn('mlg-vignette');
      later(() => vignette.remove(), 1000);
      const warning = spawn('mlg-warning', '⚠ WARNING ⚠');
      later(() => warning.remove(), 1300);
    },
    onGameOver(status, generalPos) {
      if (!enabled) return;
      const mate = status.reason === 'checkmate';
      const last = getHistory().at(-1);
      if (last) {
        rattlePieces(
          last.move.to[0],
          last.move.to[1],
          3.2,
          [last.piece.id, last.captured?.id].filter(Boolean),
        );
      }
      if (mate) {
        playWobbleDrop();
        playTripleAirhorn();
        say('game over. get rekt.');
        impactText('GG', 'mlg-gg', 3600);
        later(() => impactText('GET REKT', '', 2000), 1600);
        confetti(130, 60);
      } else {
        playRecordScratch();
        say('bruh');
        impactText('BRUH.', 'mlg-gg', 3600);
        later(() => impactText('NO MOVES. NO HOPE.', 'mlg-impact--minor', 2000), 1600);
        confetti(60, 30);
      }
      later(() => rig.victorySpin(6), 400);
      if (generalPos) later(() => dropSunglasses(generalPos[0], generalPos[1]), 1200);
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
      layer.innerHTML = '';
      container.classList.remove('mlg-shake-1', 'mlg-shake-2', 'mlg-shake-3');
      removeSunglasses();
      rig.cancelSpin();
      setTimeScale(1);
      stopSpeech();
      if (enabled) renderBoards();
    },
  };
}
