// Le fond commun du mode « 🔍 Continuer à jouer », partagé par ses trois hôtes :
// l'explorateur d'ouvertures (app.js), les puzzles d'entraînement (training.js)
// et les exercices de tactique (tactics.js).
//
// Les trois UI restent chez elles : elles n'ont ni le même DOM (#oe-* / #exp-* /
// #tac-*), ni les mêmes boutons, ni les mêmes extras (app.js suit la théorie,
// tactics.js peint les menaces). Ce qui était vraiment dupliqué, et qui avait
// déjà divergé, c'est la logique échecs/moteur : conversion de la PV en français,
// mise en forme de l'éval du point de vue des Blancs, phrase d'état et détection
// des positions terminales. Quatre copies de pvToFr existaient, dont une avec
// `promotion: uci[4] || 'q'` et les autres `|| undefined`.
const FreePlay = (() => {

  // UCI -> SAN français, sur au plus `max` demi-coups. S'arrête net au premier
  // coup illégal : une PV tronquée vaut mieux qu'une ligne inventée.
  function pvToFr(fen, pvStr, max) {
    if (!pvStr) return [];
    let g;
    try { g = new Chess(fen); } catch (_) { return []; }
    const out = [];
    for (const uci of String(pvStr).trim().split(/\s+/)) {
      if (out.length >= (max || 5)) break;
      let m = null;
      try { m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' }); } catch (_) { m = null; }
      if (!m) break;
      out.push((typeof Analyzer !== 'undefined' && Analyzer.toFrench) ? Analyzer.toFrench(m.san) : m.san);
    }
    return out;
  }

  // Stockfish rend son score du point de vue du trait ; on l'affiche toujours du
  // point de vue des Blancs, comme la barre d'éval.
  function evalWhite(res, stm) {
    if (!res) return '';
    if (res.mate != null) {
      const mw = stm === 'w' ? res.mate : -res.mate;
      return 'Mat en ' + Math.abs(mw) + (mw > 0 ? ' (Blancs)' : ' (Noirs)');
    }
    const w = (stm === 'w' ? res.score : -res.score) / 100;
    return (w >= 0 ? '+' : '') + w.toFixed(1);
  }

  // Position terminale ? Rend la phrase à afficher, ou null si la partie continue.
  // `back` = comment l'hôte nomme son bouton de retour arrière.
  function terminalHtml(fen, back) {
    const b = back || 'Annule pour explorer une autre suite.';
    try {
      const g = new Chess(fen);
      if (g.in_checkmate()) return `♚ <b>Échec et mat.</b> ${b}`;
      if (g.in_stalemate()) return `<b>Pat</b> - nulle. ${b}`;
      if (g.in_draw()) return `<b>Nulle</b> (matériel / répétition). ${b}`;
    } catch (_) {}
    return null;
  }

  // La ligne d'état sous l'échiquier : trait, éval, meilleur coup, suite.
  function statusHtml(fen, res, back) {
    const term = terminalHtml(fen, back);
    if (term) return term;
    const stm = fen.split(' ')[1] === 'w' ? 'w' : 'b';
    const head = `Trait aux <b>${stm === 'w' ? 'Blancs' : 'Noirs'}</b>.`;
    if (!res) return head + ` Moteur indisponible - joue librement, sans suggestion.`;
    const pv = pvToFr(fen, res.pv, 5);
    return `${head} Éval <b>${evalWhite(res, stm)}</b>.`
      + (pv[0] ? ` Meilleur : <b>${pv[0]}</b> <span class="oe-sugg">(flèche bleue)</span>.` : '')
      + (pv.length > 1 ? `<div class="oe-explore-pv">Suite : ${pv.join(' ')}</div>` : '');
  }

  // Réveille le moteur au besoin et évalue. Rend null plutôt que de lever : les
  // hôtes affichent alors « moteur indisponible » et laissent jouer librement.
  async function analyze(fen, movetime) {
    try {
      if (typeof StockfishEngine === 'undefined') return null;
      if (!StockfishEngine.isReady()) await StockfishEngine.init();
      return await StockfishEngine.evaluate(fen, movetime || 'movetime 600');
    } catch (_) { return null; }
  }

  return { pvToFr, evalWhite, terminalHtml, statusHtml, analyze };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FreePlay;
