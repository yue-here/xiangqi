const KEY = 'xiangqi.save.v1';

export function save(game, settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      v: 1,
      moves: game.getMovesForSave(),
      autoFlip: settings.autoFlip,
      muted: settings.muted,
      mlg: settings.mlg,
      symbols: settings.symbols,
    }));
  } catch {
    // Storage full or unavailable - persistence is best-effort.
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.v !== 1 || !Array.isArray(data.moves)) throw new Error('bad shape');
    return {
      moves: data.moves,
      settings: {
        autoFlip: Boolean(data.autoFlip),
        muted: Boolean(data.muted),
        mlg: Boolean(data.mlg),
        symbols: Boolean(data.symbols),
      },
    };
  } catch {
    clear();
    return null;
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
