# Xiangqi

Two-player local (hotseat) Xiangqi — Chinese chess — with light 3D graphics,
synthesized sound effects, and an optional over-the-top MLG mode. No AI, no
network play: two people, one screen.

![stack](https://img.shields.io/badge/stack-vanilla%20JS%20%2B%20Three.js%20%2B%20Vite-blue)

## Run

```
npm install
npm run dev      # local server at http://localhost:5173
```

Production build: `npm run build`, then `npm run preview`.

## Features

- **Full rules enforcement** — palace confinement, elephant river limit and
  blocked eyes, horse-leg blocking, cannon screen captures, flying-general
  rule, self-check prevention, check / checkmate / stalemate detection
  (stalemate is a loss for the stalemated player, per xiangqi rules).
- **Light 3D board** — tilted wooden board with soft shadows; pieces are
  engraved discs whose characters face their owner.
- **Symbols toggle** — for players who can't read Chinese: piece faces
  switch to chess-style silhouettes (chariot→rook, horse→knight,
  elephant→bishop, general→king, soldier→pawn, plus matching custom glyphs
  for the advisor and cannon), and the history panel shows plain notation.
- **Auto-flip** — optional: the camera swings 180° after each move so the
  player to move is always at the bottom.
- **Sound effects** — synthesized with the Web Audio API: select, move,
  capture, check, game over.
- **Move history** — side panel in WXF notation (e.g. `炮 C2=5`).
- **Undo** — one ply per click; also revives a finished game.
- **Persistence** — the game auto-saves to localStorage after every move and
  restores on load, so it survives a browser refresh or server shutdown.
- **MLG mode 😎** — optional toggle, and it goes hard:
  - Captured pieces get **yeeted off the board** in a tumbling arc with a 3D
    shard burst, hitmarker, floating `+points`, and tiered screen shake.
  - **Kill feed** (`黑砲 💣 红傌`) and a live **MLG scoreboard** with combo
    meters — points multiply with your kill streak.
  - Event banners with an **announcer voice**: FIRST BLOOD, REVENGE,
    HUMILIATION (soldier takes chariot), 360 NOSCOPE (long cannon snipe,
    with a hitmarker trail), LEVEL UP (soldier crosses the river),
    DOUBLE KILL → BEYOND GODLIKE streaks.
  - **Airhorns** (a real CC0 sample - synthesized ones never sounded
    convincing), plus synthesized record scratches and coin blips — and
    checkmate lands in **slow motion**, then drops a dubstep wobble-bass
    while the camera does a full 360° victory orbit through confetti + emoji
    rain, and the winning general receives its sunglasses. Stalemate gets
    "BRUH." Undo gets a **fart**.
  - Everything else is synthesized/CSS/emoji; the only asset files are the
    bundled CC0 airhorn samples. Everything respects the mute toggle and
    cleans up on undo/new game.

## MLG glossary (for the uninitiated)

Everything in MLG mode parodies **MLG montage culture** — early-2010s YouTube
edits of first-person-shooter clips drowning in airhorns, hitmarkers, and
zooms (MLG = Major League Gaming, an esports league whose name became
shorthand for the aesthetic):

| Thing | Origin |
|---|---|
| Airhorn (BWAAAH) | The signature MLG montage sound |
| Hitmarker ✛ | Call of Duty's hit indicator, spammed in every montage |
| FIRST BLOOD, DOUBLE/TRIPLE KILL, M-M-M-MONSTER KILL, GODLIKE | The Unreal Tournament announcer (the stutter is his echo effect) |
| HUMILIATION | Quake III Arena announcer, for melee-weapon kills — hence a soldier taking a chariot |
| 360 NOSCOPE | CoD sniper trickshot: spin a full circle and fire without aiming down the scope — hence a long-range cannon kill |
| WOMBO COMBO | Legendary shoutcast from a 2008 Super Smash Bros. Melee doubles match — fits the SSB-style launch |
| OH BABY A CHARIOT! | "OH BABY A TRIPLE!" — a screamed CoD triple-kill Vine that became an MLG staple |
| MOM GET THE CAMERA! | Another montage-culture scream, yelled when something incredible happens |
| SSB launch + KO star | Super Smash Bros.: KO'd fighters rocket off-screen and burst into a star twinkle |
| GET REKT / GG / BRUH | Gamer slang: "wrecked", "good game", and dismayed disbelief respectively |
| Deal-With-It sunglasses | The 😎 GIF meme: sunglasses descend onto whoever just won an argument |
| Kill feed, +XP, combo meter | FPS/RPG HUD pastiche |
| 💯🔥🥤 emoji rain | Montage iconography (the 🥤 is the Mountain Dew) |

## Out of scope

Tournament perpetual-check / perpetual-chase rules are not enforced — these
require repetition arbitration that is out of scope for casual hotseat play.

## Dev

- Rule self-tests run in the browser console at
  `http://localhost:5173/?selftest=1`.
- Debug positions (dev builds): `window.loadDebugPosition('flyingGeneral')`
  — also `pinned`, `doubleChariotMate`, `soldierStalemate`.
- Browser-driven end-to-end check (needs the dev server running and
  Microsoft Edge installed): `npm run verify:e2e`.
- Audio sandbox (dev only): `http://localhost:5173/sound-lab.html` — play
  every MLG stinger in isolation, A/B the candidate airhorn samples, and tune
  blast duration/pitch/echo live. Not part of the production entry point.

## Code map

```
src/
  main.js         orchestration: input, move/undo pipelines, boot/restore
  game/           board model, movement rules, Game state machine, notation
  scene/          Three.js scene, board/piece textures, highlights, camera rig
  ui/             DOM HUD: turn indicator, history panel, dialogs
  audio/          Web Audio synthesis for game sounds
  fx/             MLG mode (visuals + audio: sampled airhorn, synth stingers)
  store/          localStorage persistence (move-list replay)
```
