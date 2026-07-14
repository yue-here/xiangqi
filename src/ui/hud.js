import './hud.css';
import { pieceChar } from '../game/notation.js';
import { RED } from '../game/board.js';

export function initHUD(callbacks) {
  const el = (id) => document.getElementById(id);
  const turnPill = el('turn-pill');
  const checkBadge = el('check-badge');
  const moveList = el('move-list');
  const btnNew = el('btn-new');
  const btnUndo = el('btn-undo');
  const chkFlip = el('chk-flip');
  const chkSymbols = el('chk-symbols');
  const chkSound = el('chk-sound');
  const chkMlg = el('chk-mlg');
  let symbolMode = false;
  const modal = el('modal');
  const overlay = el('gameover-overlay');
  const overlayText = el('gameover-text');

  btnNew.addEventListener('click', () => {
    modal.hidden = false;
  });
  el('btn-modal-no').addEventListener('click', () => {
    modal.hidden = true;
  });
  el('btn-modal-yes').addEventListener('click', () => {
    modal.hidden = true;
    callbacks.onNewGame();
  });
  el('btn-gameover-new').addEventListener('click', () => {
    overlay.hidden = true;
    callbacks.onNewGame();
  });
  btnUndo.addEventListener('click', () => callbacks.onUndo());
  chkFlip.addEventListener('change', () => callbacks.onAutoFlipChange(chkFlip.checked));
  chkSymbols.addEventListener('change', () => callbacks.onSymbolsChange(chkSymbols.checked));
  chkSound.addEventListener('change', () => callbacks.onSoundChange(chkSound.checked));
  chkMlg.addEventListener('change', () => callbacks.onMlgChange(chkMlg.checked));

  return {
    setTurn(turn) {
      turnPill.textContent = turn === RED ? 'Red to move' : 'Black to move';
      turnPill.classList.toggle('black', turn !== RED);
    },
    setCheck(inCheck) {
      checkBadge.hidden = !inCheck;
    },
    renderHistory(records) {
      moveList.innerHTML = '';
      for (let i = 0; i < records.length; i += 2) {
        const li = document.createElement('li');
        const num = document.createElement('span');
        num.className = 'num';
        num.textContent = `${i / 2 + 1}.`;
        li.appendChild(num);
        for (const record of [records[i], records[i + 1]]) {
          if (!record) continue;
          const ply = document.createElement('span');
          ply.className = `ply ${record.piece.color}`;
          // In symbolic mode the notation letter already identifies the piece.
          ply.textContent = symbolMode
            ? record.notation
            : `${pieceChar(record.piece.type, record.piece.color)} ${record.notation}`;
          li.appendChild(ply);
        }
        moveList.appendChild(li);
      }
      const plies = moveList.querySelectorAll('.ply');
      plies[plies.length - 1]?.classList.add('latest');
      moveList.scrollTop = moveList.scrollHeight;
    },
    showGameOver(status, { mlg = false } = {}) {
      const winner = status.winner === RED ? 'Red' : 'Black';
      const loser = status.winner === RED ? 'Black' : 'Red';
      overlayText.textContent = status.reason === 'checkmate'
        ? `${winner} wins — checkmate!`
        : `${winner} wins — ${loser} has no legal moves (stalemate)`;
      overlayText.className = status.winner === RED ? 'red-wins' : 'black-wins';
      overlay.classList.toggle('mlg', mlg);
      overlay.hidden = false;
    },
    hideGameOver() {
      overlay.hidden = true;
    },
    setToggles({ autoFlip, symbols, sound, mlg }) {
      chkFlip.checked = autoFlip;
      chkSymbols.checked = symbols;
      chkSound.checked = sound;
      chkMlg.checked = mlg;
    },
    setSymbolMode(value) {
      symbolMode = value;
    },
    setBusy(busy) {
      btnUndo.disabled = busy;
      btnNew.disabled = busy;
      chkSymbols.disabled = busy; // symbol toggle rebuilds meshes; not mid-animation
    },
  };
}
