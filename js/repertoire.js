// Répertoire — ONE simple opening scheme for both colors (Italian-style setup),
// with a cheat-sheet panel, a drill (via Tactics.start) and an adherence check
// used by the Coach ("did you actually play your repertoire in real games?").
const Repertoire = (() => {
  const $ = (s) => document.querySelector(s);
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // sans = full line in ENGLISH SAN from move 1; color = the side you play.
  const LINES = [
    {
      id: 'w-italienne', color: 'w', title: 'Le plan de base : l\'Italienne',
      vs: 'Contre 1…e5',
      sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O'],
      plan: 'Fou en c4 (il vise f7), petit centre avec c3 + d3, roque rapide. Développe TOUT avant d\'attaquer.',
      warn: 'Ne sors pas ta dame tôt, et surveille ton propre f2 comme tu vises son f7.'
    },
    {
      id: 'w-2cavaliers', color: 'w', title: 'S\'il joue 3…Cf6 (Deux Cavaliers)',
      vs: 'Contre 3…Cf6',
      sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Bc5', 'O-O', 'd6', 'c3', 'O-O'],
      plan: 'Même schéma : d3 protège e4 tout de suite, puis roque tranquillement.',
      warn: 'Joue d3 avant tout le reste — sinon ton pion e4 traîne en prise.'
    },
    {
      id: 'w-sicilienne', color: 'w', title: 'S\'il joue 1…c5 (Sicilienne)',
      vs: 'Contre 1…c5',
      sans: ['e4', 'c5', 'Nf3', 'Nc6', 'Bc4', 'e6', 'O-O', 'Nf6', 'd3', 'd6'],
      plan: 'Pas besoin de théorie : le MÊME développement (Cf3, Fc4, roque, d3) marche très bien.',
      warn: 'S\'il joue …e6, son …d5 va pousser ton fou — recule-le en b3 sans paniquer.'
    },
    {
      id: 'b-italienne', color: 'b', title: 'Le miroir : 1…e5 et développement',
      vs: 'Contre 1.e4 + 2.Cf3',
      sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6'],
      plan: 'Exactement ton plan Blancs, en miroir : …e5, …Cc6, …Fc5, …Cf6, …d6, roque.',
      warn: 'Ton f7 est LA cible à ce niveau. Dame ou fou adverse pointés sur f7 = alarme.'
    },
    {
      id: 'b-berger', color: 'b', title: 'Contre l\'attaque du Berger (2.Dh5)',
      vs: 'Contre 2.Dh5',
      sans: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'Nf6'],
      plan: '2…Cc6 défend e5, 3…g6 chasse la dame, 4…Cf6 bloque la colonne f. Sa dame a perdu 3 temps : développe et prends l\'avantage.',
      warn: 'Ici …g6 est correct : la dame en h5 est attaquée. Ne le joue PAS quand rien ne l\'exige.'
    },
    {
      id: 'b-fou', color: 'b', title: 'Contre le début du Fou (2.Fc4)',
      vs: 'Contre 2.Fc4 / Viennoise',
      sans: ['e4', 'e5', 'Bc4', 'Nf6', 'd3', 'c6', 'Nf3', 'd5'],
      plan: '…Cf6 attaque e4, puis …c6 et …d5 : tu chasses le fou et tu prends le centre.',
      warn: 'Tu as perdu 3 fois contre cette ouverture — apprends ces 4 coups par cœur.'
    },
    {
      id: 'b-d4', color: 'b', title: 'Contre 1.d4',
      vs: 'Contre 1.d4',
      sans: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3', 'Be7'],
      plan: '…d5 tient le centre, puis …e6, …Cf6, …Fe7 et roque. Solide, sans piège à connaître.',
      warn: 'S\'il prend cxd5, reprends avec …exd5 et continue ton développement.'
    }
  ];

  const RULES = [
    'Un coup d\'ouverture = une pièce NOUVELLE développée (pas deux fois la même).',
    'Roque avant le coup 10.',
    'La dame reste à la maison tant que les pièces mineures ne sont pas sorties.',
    'Avant chaque coup : Échecs, Captures, Menaces (CCT) — les 5 secondes qui sauvent la partie.'
  ];

  function toFr(san) {
    return (san || '').replace(/[KQRBN]/g, c => ({ K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' }[c]));
  }
  function fmtLine(sans) {
    return sans.map((s, i) => (i % 2 === 0 ? (i / 2 + 1) + '.' : '') + toFr(s)).join(' ');
  }

  // Position → expected repertoire move, keyed on board+turn+castling so the
  // check survives move-order transpositions. Built once, lazily.
  let _map = null;
  function posKey(fen) { return fen.split(' ').slice(0, 3).join(' '); }
  function posMap() {
    if (_map) return _map;
    _map = new Map();
    for (const line of LINES) {
      const g = new Chess();
      for (const san of line.sans) {
        if (g.turn() === line.color) {
          const k = posKey(g.fen());
          if (!_map.has(k)) _map.set(k, { san, lineId: line.id });
        }
        if (!g.move(san)) break;
      }
    }
    return _map;
  }

  // Did the user follow the repertoire in this game? Scans the first 12 plies:
  // every position the map knows counts as "known"; playing the mapped move
  // counts as "followed". Memoized on the game object.
  function checkGame(g) {
    if (g._rep) return g._rep;
    let moves = [];
    try { moves = Analyzer.parsePgnMoves(g.pgn); } catch (_) {}
    const map = posMap();
    const game = new Chess();
    let known = 0, followed = 0, deviation = null;
    for (let i = 0; i < Math.min(moves.length, 12); i++) {
      const m = moves[i];
      if (m.color === g.userColor) {
        const hit = map.get(posKey(game.fen()));
        if (hit) {
          known++;
          if (m.san === hit.san) followed++;
          else if (!deviation) deviation = { moveNo: Math.floor(i / 2) + 1, played: toFr(m.san), expected: toFr(hit.san) };
        }
      }
      try { if (!game.move(m.san, { sloppy: true })) break; } catch (_) { break; }
    }
    g._rep = { known, followed, deviation };
    return g._rep;
  }

  function adherence(gamesArr) {
    let known = 0, followed = 0, gamesKnown = 0;
    const deviations = [];
    for (const g of gamesArr || []) {
      if (!g.pgn) continue;
      const r = checkGame(g);
      if (!r.known) continue;
      gamesKnown++;
      known += r.known; followed += r.followed;
      if (r.deviation) deviations.push(Object.assign({ opp: g.oppName || '?', uuid: g.uuid, endTime: g.endTime || 0 }, r.deviation));
    }
    deviations.sort((a, b) => b.endTime - a.endTime);
    return { known, followed, gamesKnown, deviations };
  }

  // ───────────────────────── cheat-sheet panel ─────────────────────────
  function lineCard(l) {
    return `<div class="rep-line">
      <div class="rep-line-head"><b>${l.title}</b><span class="rep-vs">${l.vs}</span></div>
      <button class="rep-moves" data-line="${l.sans.join(' ')}" data-name="${l.title}" title="Rejouer sur l'échiquier">${fmtLine(l.sans)} ▶</button>
      <div class="rep-plan">💡 ${l.plan}</div>
      <div class="rep-warn">⚠ ${l.warn}</div>
    </div>`;
  }

  let built = false;
  function renderPanel() {
    const host = $('#repertoire-content');
    if (!host || built) return;
    built = true;
    const w = LINES.filter(l => l.color === 'w'), b = LINES.filter(l => l.color === 'b');
    host.innerHTML = `
      <p class="rep-intro">Un seul schéma, appris à fond, vaut mieux que dix ouvertures survolées : le même développement « à l'Italienne » avec les deux couleurs. Touche une ligne pour la rejouer, ou lance le drill pour la retenir.</p>
      <div class="rep-rules">${RULES.map(r => `<div class="rep-rule">✔ ${r}</div>`).join('')}</div>
      <h4 class="rep-cat">♔ Avec les Blancs <button class="train-btn good rep-drill" data-color="w">🎯 Réviser</button></h4>
      ${w.map(lineCard).join('')}
      <h4 class="rep-cat">♚ Avec les Noirs <button class="train-btn good rep-drill" data-color="b">🎯 Réviser</button></h4>
      ${b.map(lineCard).join('')}`;
    host.querySelectorAll('.rep-moves').forEach(btn => btn.addEventListener('click', () => {
      if (typeof App === 'undefined' || !App.openOpeningExplorer) return;
      App.openOpeningExplorer(
        { name: btn.dataset.name, eco: '', line: btn.dataset.line, moves: btn.dataset.line.split(' ').length, showEval: true },
        [], 'Rejoue la ligne coup par coup pour la mémoriser.'
      );
    }));
    host.querySelectorAll('.rep-drill').forEach(btn => btn.addEventListener('click', () => drill(btn.dataset.color)));
  }

  // Drill through Tactics' solve-it overlay: even sol index = your move, odd =
  // auto-played reply. Black lines start from the position after White's first move.
  function drill(color) {
    if (typeof Tactics === 'undefined' || !Tactics.start) return;
    const puzzles = LINES.filter(l => l.color === color).map(l => {
      let fen = START_FEN, sol = l.sans.slice();
      if (l.color === 'b') {
        const g = new Chess();
        g.move(sol.shift());
        fen = g.fen();
      }
      if (sol.length % 2 === 0) sol.pop(); // end on the learner's move
      return { fen, sol, hint: l.plan };
    });
    Tactics.start(puzzles, color === 'w' ? 'Mon répertoire — Blancs' : 'Mon répertoire — Noirs');
  }

  return { LINES, renderPanel, drill, adherence };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Repertoire;
