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

  // Real, chess.js-validated tactical cases tied to each line - either a
  // drillable one-move puzzle (fen+sol) or a text-only "why" note (hint only).
  // Positions/moves verified offline (node + chess.min.js) before being added here.
  const TRAPS = [
    {
      lineId: 'w-italienne', title: '🪤 S\'il oublie de roquer',
      hint: 'S\'il traîne à roquer et que tu places Cg5, Cxf7! gagne le pion : son roi ne peut PAS reprendre (ton fou en c4 tient la case f7) et tu fourches Dame + Tour.',
      fen: 'r1bqk2r/1pp2ppp/p1np1n2/2b1p1N1/2B1P3/2PP4/PP3PPP/RNBQK2R w KQkq - 0 7',
      sol: ['Nxf7']
    },
    {
      lineId: 'w-2cavaliers', title: '🪤 À connaître si TU joues Noir un jour (Fried Liver)',
      hint: 'On ne joue pas 4.Cg5 nous-mêmes (trop risqué à retenir), mais si un adversaire te le fait subir : après 4.Cg5 d5 5.exd5, NE reprends PAS 5…Cxd5?? (perd à 6.Cxf7! fourchette Dame+Tour) - joue 5…Ca5! qui chasse le fou.',
      fen: 'r1bqkb1r/ppp2ppp/2n2n2/3Pp1N1/2B5/8/PPPP1PPP/RNBQK2R b KQkq - 0 5',
      sol: ['Na5']
    },
    {
      lineId: 'b-italienne', title: '🪤 S\'il joue Cg5 avant que tu aies roqué',
      hint: 'Roque TOUT DE SUITE (ta tour f8 protège alors f7). Si tu joues autre chose d\'abord, Cxf7! gagne le pion sans recapture possible (ton roi ne peut pas : son fou en c4 tient f7) et fourche Dame + Tour.',
      fen: 'r1bqk2r/ppp2ppp/2np1n2/2b1p1N1/2B1P3/2PP4/PP3PPP/RNBQK2R b KQkq - 1 6',
      sol: ['O-O']
    },
    {
      lineId: 'b-berger', title: '🪤 Pourquoi pas 2…Cf6 ?',
      hint: '2…Cf6?? a l\'air de développer mais oublie de défendre e5 : 3.Dxe5+! gagne un pion gratuit avec échec. C\'est pour ça qu\'on joue 2…Cc6 d\'abord - il défend e5.'
    },
    {
      lineId: 'b-fou', title: '🪤 S\'il joue 3.Dh5 au lieu de 3.d3',
      hint: 'Sa dame ET son fou visent tous les deux f7. NE prends PAS 3…Cxe4?? (perd : 4.Dxf7 est ÉCHEC ET MAT, ton roi ne peut pas reprendre à cause du fou en c4). Défends-toi comme contre l\'attaque du Berger : 3…g6! chasse la dame.',
      fen: 'rnbqkb1r/pppp1ppp/5n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
      sol: ['g6']
    }
  ];
  function trapsFor(lineId) { return TRAPS.filter(t => t.lineId === lineId); }

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
  function trapCard(t, i) {
    const btn = t.fen && t.sol
      ? `<button class="train-btn good rep-trap-drill" data-i="${i}">🎯 Essayer ce coup</button>` : '';
    return `<div class="rep-trap">
      <div class="rep-trap-title">${t.title}</div>
      <div class="rep-trap-hint">${t.hint}</div>
      ${btn}
    </div>`;
  }
  function lineCard(l) {
    const traps = trapsFor(l.id);
    return `<div class="rep-line">
      <div class="rep-line-head"><b>${l.title}</b><span class="rep-vs">${l.vs}</span></div>
      <button class="rep-moves" data-line="${l.sans.join(' ')}" data-name="${l.title}" title="Rejouer sur l'échiquier">${fmtLine(l.sans)} ▶</button>
      <div class="rep-plan">💡 ${l.plan}</div>
      <div class="rep-warn">⚠ ${l.warn}</div>
      ${traps.map(t => trapCard(t, TRAPS.indexOf(t))).join('')}
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
    host.querySelectorAll('.rep-trap-drill').forEach(btn => btn.addEventListener('click', () => {
      const t = TRAPS[+btn.dataset.i];
      if (t && t.fen && t.sol && typeof Tactics !== 'undefined' && Tactics.start) {
        Tactics.start([{ fen: t.fen, sol: t.sol, hint: t.hint }], t.title.replace(/^🪤\s*/, ''));
      }
    }));
  }

  // Drill through Tactics' solve-it overlay: even sol index = your move, odd =
  // auto-played reply. Black lines start from the position after White's first move.
  function drill(color) {
    if (typeof Tactics === 'undefined' || !Tactics.start) return;
    const colorLineIds = new Set(LINES.filter(l => l.color === color).map(l => l.id));
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
    // only fold a trap into the bulk drill when it's actually the learner's
    // move in that color's deck (e.g. the Fried Liver trap is a Black-to-move
    // bonus tied to the w-2cavaliers line - it stays a standalone button instead).
    TRAPS.filter(t => t.fen && t.sol && colorLineIds.has(t.lineId) && t.fen.split(' ')[1] === color)
      .forEach(t => puzzles.push({ fen: t.fen, sol: t.sol, hint: t.hint }));
    Tactics.start(puzzles, color === 'w' ? 'Mon répertoire — Blancs' : 'Mon répertoire — Noirs');
  }

  return { LINES, renderPanel, drill, adherence };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Repertoire;
