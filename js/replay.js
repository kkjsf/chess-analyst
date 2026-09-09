// « Rejoue ta défaite » — reprendre la main juste avant une de tes gaffes et
// rejouer la position CONTRE Stockfish, avec un commentaire du coach à chaque
// coup. Réutilise la coquille .guess-* (comme tactics.js/mates.js), le rendu
// d'échiquier + drag + flèches (BoardRenderer), le moteur (StockfishEngine) et
// les commentaires de analysis.js (explainBadMove / detectForkAfterMove).
const Replay = (() => {
  const $ = (s) => document.querySelector(s);

  // ── état de la session courante ──
  let mySide = 'w';      // le camp que tu joues (celui qui avait gaffé)
  let seedFen = '';      // position de reprise (fenBefore de la gaffe)
  let intro = null;      // { playedSan, bestSan, bestUci, tip, moveNo, dot }
  let hist = [];         // pile de { fen, move, by } — fen APRÈS le coup
  let token = 0;         // incrémenté à chaque reset/close/undo → annule l'async périmé
  let busy = false;      // moteur en réflexion / animation → entrées bloquées
  let curEvalMe = null;  // éval (cp, point de vue de mon camp) à mon trait courant
  let myBestUci = null;  // meilleur coup du moteur pour moi (flèche bleue)
  // 'replay'  = « Rejoue ta défaite » : le moteur montre tout (flèche + éval),
  //             c'est un bac à sable pour comprendre une gaffe.
  // 'convert' = « Termine la partie » : MÊME moteur, en mode ACCOMPAGNÉ. Un
  //             briefing (ce que tu as, le plan pour cette position), à chaque
  //             coup ce qui est en prise et ce que ton coup a coûté, un indice
  //             en trois temps à la demande, et la reprise du coup après une
  //             gaffe. Le coup lui-même n'est jamais donné d'office.
  let mode = 'replay';
  let startEvalMe = null;  // éval à la position de départ (mesurée une fois)
  let warned = false;      // l'avertissement « ton avantage file » a déjà servi
  let convDone = false;    // partie terminée : verrouille le bilan
  let hintLevel = 0;       // indice progressif du coup courant (0 = aucun, 3 = le coup)
  let hintArrow = false;   // l'indice n°3 a été demandé → flèche autorisée ce coup-ci
  let convStats = null;    // bilan de la session : { moves, best, slips, hints }

  const CONV_WIN = 300;    // seuil « position gagnante » (une pièce d'avance)
  const CONV_SLIP = 120;   // sous ce seuil, l'avantage est considéré comme parti

  const DEPTH_MY = 12;              // éval + flèche bleue à mon trait
  const REPLY_MT = 'movetime 700';  // force de la réplique de l'ordi
  // Duree unique, definie dans board.js. Le garde `typeof` sert aux tests
  // hors navigateur (tools/test_core.cjs requiert ce module sans BoardRenderer).
  const ANIM_MS = (typeof BoardRenderer !== 'undefined' && BoardRenderer.ANIM_MS) || 340;

  // ── helpers d'affichage (calqués sur l'explorateur d'ouverture) ──
  function fr(san) { return (typeof Analyzer !== 'undefined' && Analyzer.toFrench) ? Analyzer.toFrench(san) : san; }

  function uciToFr(fen, uci) {
    if (!uci) return null;
    try {
      const g = new Chess(fen);
      const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
      return m ? fr(m.san) : null;
    } catch (_) { return null; }
  }

  // Convertisseur PV partagé (js/freeplay.js).
  const pvToFr = (fen, pvStr, max) => FreePlay.pvToFr(fen, pvStr, max || 4);

  // Éval en centipions au point de vue de mon camp (Stockfish rapporte le score
  // du trait). +100000 ≈ je mate, -100000 ≈ je me fais mater.
  function meScore(res, fen) {
    if (!res || typeof res.score !== 'number') return null;
    const stm = fen.split(' ')[1] === 'w' ? 'w' : 'b';
    const sign = stm === mySide ? 1 : -1;
    return sign * res.score;
  }
  // Mat au point de vue de mon camp (>0 = je mate en N, <0 = je suis maté en N).
  function meMate(res, fen) {
    if (!res || res.mate == null) return null;
    const stm = fen.split(' ')[1] === 'w' ? 'w' : 'b';
    return (stm === mySide ? 1 : -1) * res.mate;
  }
  // Éval formatée au point de vue des Blancs (comme la barre d'analyse).
  function evalWhite(res, fen) {
    const stm = fen.split(' ')[1] === 'w' ? 'w' : 'b';
    if (res && res.mate != null) { const mw = stm === 'w' ? res.mate : -res.mate; return 'Mat en ' + Math.abs(mw) + (mw > 0 ? ' (Blancs)' : ' (Noirs)'); }
    if (!res || typeof res.score !== 'number') return '?';
    const w = (stm === 'w' ? res.score : -res.score) / 100;
    return (w >= 0 ? '+' : '') + w.toFixed(1);
  }

  // ═══════════ Conversion guidée : matériel, plan, vigilance, indices ═══════════
  // « Termine la partie » était muet par principe (aucune aide affichée). En
  // pratique ça revenait à le remettre dans la position qu'il a déjà perdue,
  // sans rien lui apprendre. Le mode est maintenant COMMENTÉ : on lui dit ce
  // qu'il a, le plan qui convertit ce genre d'avantage, ce qui est en prise à
  // chaque coup, et ce que son coup vient de coûter, avec un indice en trois
  // temps quand il est bloqué. Ce qu'on ne donne jamais d'office, c'est le coup.
  const PVAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const PART = { p: 'ton pion', n: 'ton cavalier', b: 'ton fou', r: 'ta tour', q: 'ta dame', k: 'ton roi' };
  const FILES = 'abcdefgh';
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  function countMaterial(fen) {
    const out = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    for (const ch of (fen || '').split(' ')[0]) {
      const low = ch.toLowerCase();
      if (!PVAL[low]) continue;
      out[ch === low ? 'b' : 'w'][low]++;
    }
    return out;
  }
  const pieceCount = (m) => m.n + m.b + m.r + m.q;
  const pawnValue = (m) => m.p + 3 * m.n + 3 * m.b + 5 * m.r + 9 * m.q;
  function sides(fen) {
    const m = countMaterial(fen);
    const mine = m[mySide], his = m[mySide === 'w' ? 'b' : 'w'];
    return { mine, his, diff: pawnValue(mine) - pawnValue(his) };
  }
  // Le matériel en mots : « une tour de plus » ne se convertit pas comme
  // « un pion de plus », et c'est la première chose à savoir avant de jouer.
  function edgeWords(diff) {
    if (diff >= 8) return 'une dame de plus';
    if (diff >= 5) return 'une tour de plus';
    if (diff >= 3) return 'une pièce de plus';
    if (diff === 2) return 'deux pions de plus';
    if (diff === 1) return 'un pion de plus';
    if (diff === 0) return 'le matériel égal';
    return 'moins de matériel que lui';
  }

  // Éval au point de vue de MON camp : dans un exercice de conversion, « +5 »
  // doit toujours vouloir dire « je gagne », jamais « les Blancs gagnent ».
  function fmtMe(cp) {
    if (cp == null) return '?';
    if (Math.abs(cp) > 20000) return cp > 0 ? 'mat pour toi' : 'mat contre toi';
    const v = cp / 100;
    return (v >= 0 ? '+' : '') + v.toFixed(1);
  }
  // Deux formulations, et le choix compte : sur un bon coup on donne l'avantage
  // en absolu (« +6.3 tient »), parce qu'annoncer une chute de 6.9 à 6.3 sur le
  // MEILLEUR coup ne mesure que le bruit de profondeur du moteur et se lit comme
  // un reproche. Sur un coup qui coûte, la comparaison est justement l'info.
  function advHold(after) {
    return after == null ? '' : `Ton avantage tient : <b>${fmtMe(after)}</b>.`;
  }
  function advDrop(after) {
    if (after == null) return '';
    if (curEvalMe == null) return `Avantage : <b>${fmtMe(after)}</b>.`;
    return `Tu passes de <b>${fmtMe(curEvalMe)}</b> à <b>${fmtMe(after)}</b>.`;
  }

  // Balayage « qu'est-ce qui est en prise chez moi » : le réflexe qui manque
  // exactement quand une partie gagnée bascule. Réutilise le SEE de
  // js/tactics.js (échange statique), donc une pièce défendue ne compte pas.
  function myHanging(fen) {
    if (typeof Tactics === 'undefined' || !Tactics.boardOf || !Tactics.seeOn) return [];
    let b;
    try { b = Tactics.boardOf(fen); } catch (_) { return []; }
    const foe = mySide === 'w' ? 'b' : 'w';
    const out = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = b[r] && b[r][c];
      if (!p || p.c !== mySide || p.t === 'k') continue;
      const sq = FILES[c] + (8 - r);
      let gain = 0;
      try { gain = Tactics.seeOn(b, sq, foe); } catch (_) { gain = 0; }
      if (gain >= 2) out.push({ sq, t: p.t, gain });
    }
    return out.sort((x, y) => y.gain - x.gain);
  }

  // Le plan d'entrée de session : deux consignes tirées de la position, plus la
  // règle de tempo (ses parties gagnées basculent sur des coups joués vite).
  function conversionPlan(fen, cp) {
    const { mine, his, diff } = sides(fen);
    const out = [];
    if (his.q) out.push({ ic: '👑', txt: `<b>Sa dame est encore là.</b> Avant chaque coup, regarde ce qu'elle peut attaquer : c'est elle qui retourne les parties déjà gagnées.` });
    if (diff >= 3) out.push({ ic: '🔁', txt: `<b>Échange les pièces, garde les pions.</b> Avec du matériel en plus, chaque échange te rapproche d'une finale gagnée d'office et lui enlève une chance de contre-jeu.` });
    else if (diff <= 1 && cp != null && cp >= 300) out.push({ ic: '🎯', txt: `Ton avantage n'est pas matériel : il faut le <b>transformer</b>, gagner une pièce ou ouvrir une ligne sur son roi, avant qu'il ne s'évapore.` });
    if (out.length < 2) {
      if (pieceCount(mine) + pieceCount(his) <= 4) out.push({ ic: '♔', txt: `Peu de pièces : <b>fais monter ton roi</b>${mine.p ? ' et pousse le pion passé' : ' pour pousser le sien vers le bord'}. En finale, le roi est une pièce d'attaque.` });
      else out.push({ ic: '🛡️', txt: `<b>Sécurise d'abord</b> : une case d'air pour ton roi, aucune pièce en prise. Le plan gagnant vient après.` });
    }
    out.length = Math.min(out.length, 2);
    out.push({ ic: '⏱️', txt: `<b>Aucun coup rapide.</b> 39 % de tes défaites sont des parties déjà gagnées, et elles basculent presque toujours sur un coup joué en cinq secondes.` });
    return out;
  }

  // Consigne du tour : ce qu'il faut regarder MAINTENANT, dans l'ordre où un
  // entraîneur le dirait, d'abord le danger puis le plan.
  function turnCue(fen) {
    const hang = myHanging(fen);
    if (hang.length) {
      const h = hang[0];
      return `⚠️ <b>${cap(PART[h.t])} en ${h.sq} est en prise.</b> Règle ça avant tout autre plan : mets-la à l'abri, défends-la, ou prends plus gros ailleurs.`;
    }
    let inCheck = false;
    try { inCheck = new Chess(fen).in_check(); } catch (_) {}
    if (inCheck) return `⚠️ Tu es en <b>échec</b>. Sors-en de la façon la plus solide, pas la plus rapide : compte ce qu'il attaque après chaque parade.`;
    const { mine, his, diff } = sides(fen);
    if (his.q && !mine.q) return `🎯 Sa dame est seule face à tes pièces : <b>cherche l'échange ou le mat</b>, mais compte ses échecs avant de jouer.`;
    if (diff >= 3 && pieceCount(his) > 0) return `🎯 Tu as ${edgeWords(diff)} : <b>cherche un échange de pièces</b>, c'est ça qui transforme l'avantage en victoire.`;
    if (pieceCount(mine) + pieceCount(his) <= 4) return mine.p
      ? `🎯 Finale : <b>fais monter ton roi</b> et pousse le pion passé, une case après l'autre.`
      : `🎯 Finale sans pion : <b>pousse son roi vers le bord</b> avec le tien, c'est de là que vient le mat.`;
    return `🎯 Regarde d'abord ce qu'il menace, puis améliore ta pièce la moins bien placée.`;
  }

  // Indice en trois temps : le thème, puis la pièce, puis le coup. Trouver le
  // coup soi-même est l'exercice ; l'indice sert à ne pas rester bloqué.
  function bestMoveObj() {
    if (!myBestUci) return null;
    try {
      const g = new Chess(curFen());
      return g.move({ from: myBestUci.slice(0, 2), to: myBestUci.slice(2, 4), promotion: myBestUci[4] || 'q' });
    } catch (_) { return null; }
  }
  function hintFor(level) {
    const fen = curFen();
    const mv = bestMoveObj();
    if (!mv) return `Indice indisponible ici : le moteur n'a pas répondu.`;
    if (level <= 1) return `💡 <b>Le thème</b> — ${hintTheme(fen, mv)}`;
    if (level === 2) return `💡 <b>La pièce</b> — c'est <b>${PART[mv.piece]} en ${mv.from}</b> qui doit jouer. À toi de trouver où.`;
    return `💡 <b>Le coup</b> — <b>${fr(mv.san)}</b>, la flèche bleue sur l'échiquier.`;
  }
  function hintTheme(fen, mv) {
    if (mv.san.includes('#')) return `il y a un <b>mat</b>. Cherche l'échec qui ne laisse aucune case au roi.`;
    const hang = myHanging(fen);
    if (hang.length) return `tu as <b>${PART[hang[0].t]} en prise en ${hang[0].sq}</b> : c'est ça qu'il faut traiter.`;
    if (mv.promotion) return `un <b>pion va à dame</b>.`;
    if (mv.captured) return `il y a du <b>matériel à prendre</b>, et la reprise ne te coûte rien.`;
    if (mv.san.includes('+')) return `un <b>échec</b> te fait gagner du matériel ou du temps.`;
    if (mv.piece === 'k') return `c'est <b>ton roi</b> qui doit bouger : à l'abri, ou en avant si la finale est là.`;
    if (mv.piece === 'p') return `un <b>pion</b> doit avancer.`;
    return `rien à gagner tout de suite : il s'agit d'<b>améliorer une pièce</b>, de la mettre sur sa meilleure case.`;
  }
  function useHint() {
    if (mode !== 'convert' || busy || gameOver()) return;
    if (sideToMove() !== mySide) return;
    hintLevel = Math.min(3, hintLevel + 1);
    if (convStats) convStats.hints++;
    if (hintLevel >= 3) { hintArrow = true; drawMyArrow(); }
    const box = $('#rp-hint-out');
    if (box) { box.hidden = false; box.innerHTML = hintFor(hintLevel); }
    syncHintBtn();
  }
  function syncHintBtn() {
    const btn = $('#rp-hint');
    if (!btn) return;
    btn.hidden = mode !== 'convert';
    btn.disabled = hintLevel >= 3 || busy || gameOver() || sideToMove() !== mySide;
    btn.textContent = hintLevel >= 3 ? '💡 Indice donné'
      : hintLevel === 2 ? '💡 Donne-moi le coup'
      : hintLevel === 1 ? '💡 Encore un indice' : '💡 Indice';
  }
  function resetHint() {
    hintLevel = 0; hintArrow = false;
    const box = $('#rp-hint-out');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    syncHintBtn();
  }
  const RETRY_HTML = `<div class="rp-retry-row"><button type="button" class="train-btn rp-retry" id="rp-retry">↶ Reprendre ce coup</button><span class="rp-retry-note">Rejoue-le autrement : c'est là que la partie se gagne.</span></div>`;

  // ── DOM (créé une seule fois) ──
  let boardSvg = null, arrowsSvg = null, bound = false;
  function ensureDom() {
    if ($('#replay-overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'replay-overlay';
    ov.className = 'guess-overlay';
    ov.hidden = true;
    ov.innerHTML = `
      <div class="guess-panel">
        <div class="guess-head">
          <button class="back-btn" id="rp-close">←</button>
          <span class="guess-title" id="rp-title">Rejoue ta défaite</span>
          <span class="guess-score" id="rp-turn"></span>
        </div>
        <div class="guess-prompt rp-intro" id="rp-intro"></div>
        <div class="guess-board-wrap">
          <svg viewBox="0 0 360 360" id="rp-board"></svg>
          <svg viewBox="0 0 360 360" id="rp-arrows" class="arrow-overlay"></svg>
        </div>
        <div class="guess-feedback rp-comment">
          <div class="rp-verdict" id="rp-verdict"></div>
          <div class="rp-status" id="rp-status"></div>
          <div class="rp-hintbox" id="rp-hint-out" hidden></div>
        </div>
        <div class="rp-actions">
          <button class="train-btn ghost" id="rp-hint" hidden>💡 Indice</button>
          <button class="train-btn ghost" id="rp-undo">↶ Annuler</button>
          <button class="train-btn ghost" id="rp-reset">⟳ Recommencer</button>
          <button class="train-btn ghost" id="rp-quit">✕ Quitter</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    boardSvg = $('#rp-board');
    arrowsSvg = $('#rp-arrows');
    $('#rp-close').onclick = close;
    $('#rp-quit').onclick = close;
    $('#rp-reset').onclick = () => { if (busy) return; resetToSeed(); };
    $('#rp-undo').onclick = () => { if (busy) return; undo(); };
    $('#rp-hint').onclick = () => useHint();
    // « Reprendre ce coup » est injecté dans le verdict après une gaffe : on le
    // récupère par délégation plutôt que de le rebrancher à chaque coup.
    $('#rp-verdict').addEventListener('click', (e) => {
      if (e.target && e.target.id === 'rp-retry' && !busy) undo();
    });
    if (!bound) {
      bound = true;
      BoardRenderer.enableDrag(boardSvg, {
        getFen: () => curFen(),
        arrows: arrowsSvg,
        canMove: () => !busy && !gameOver() && sideToMove() === mySide,
        onMove: (from, to) => playMyMove(from, to),
      });
    }
  }

  function curFen() { return hist.length ? hist[hist.length - 1].fen : seedFen; }
  function sideToMove() { return curFen().split(' ')[1] === 'w' ? 'w' : 'b'; }
  function gameOver() { try { return new Chess(curFen()).game_over(); } catch (_) { return false; } }

  // ── entrée publique ──
  function start(entry) { return begin(entry, 'replay'); }
  // « Termine la partie » : même coquille, aide coupée, objectif = gagner.
  function startConversion(entry) { return begin(entry, 'convert'); }

  function begin(entry, m) {
    mode = m === 'convert' ? 'convert' : 'replay';
    if (!entry || !entry.fenBefore) return;
    try { if (!new Chess(entry.fenBefore)) return; } catch (_) { return; }
    seedFen = entry.fenBefore;
    mySide = seedFen.split(' ')[1] === 'b' ? 'b' : 'w';
    const ply = (typeof entry.ply === 'number') ? entry.ply : null;
    const moveNo = ply != null ? Math.floor(ply / 2) + 1 : (entry.moveNo || null);
    const dot = ply != null ? (ply % 2 === 0 ? '.' : '...') : '.';
    intro = {
      playedSan: fr(entry.playedSan || ''), bestSan: fr(entry.bestSan || ''),
      bestUci: entry.bestUci || '', tip: (entry.tip || '').replace(/<[^>]*>/g, '').trim(),
      moveNo, dot,
    };
    intro.oppName = entry.oppName || null;
    intro.date = entry.date || null;
    // Éval de départ telle que le Coach l'a mesurée SUR CETTE POSITION. On ne
    // retombe pas sur entry.maxEval : c'est le maximum de toute la partie, donc
    // annoncer « +10 » ici serait faux. Sans evalCp le briefing reste sur le
    // matériel, et la vraie éval s'affiche au premier trait.
    intro.cp = (typeof entry.evalCp === 'number') ? entry.evalCp : null;
    ensureDom();
    $('#rp-title').textContent = mode === 'convert' ? 'Termine la partie' : 'Rejoue ta défaite';
    $('#replay-overlay').hidden = false;
    document.body.classList.add('guess-open');
    BoardRenderer.setFlipped(mySide === 'b');
    resetToSeed();
  }

  function close() {
    token++;
    busy = false;
    const ov = $('#replay-overlay');
    if (ov) ov.hidden = true;
    document.body.classList.remove('guess-open');
    if (arrowsSvg) BoardRenderer.clearArrows(arrowsSvg);
  }

  function resetToSeed() {
    token++;
    hist = [{ fen: seedFen, move: null, by: null }];
    curEvalMe = null; myBestUci = null; busy = false;
    startEvalMe = null; warned = false; convDone = false;
    convStats = { moves: 0, best: 0, slips: 0, hints: 0 };
    resetHint();
    renderIntro();
    setVerdict('');
    renderBoard(null);
    onMyTurn();
  }

  // Annuler : revenir à ma position de trait précédente (retire la réplique de
  // l'ordi puis mon coup). Ne descend jamais sous la position de départ.
  function undo() {
    token++;
    if (hist.length <= 1) return;
    if (hist[hist.length - 1].by === 'opp') hist.pop();
    if (hist.length > 1 && hist[hist.length - 1].by === 'me') hist.pop();
    curEvalMe = null; myBestUci = null; busy = false;
    resetHint();
    setVerdict('');
    renderBoard(null);
    onMyTurn();
  }

  function renderIntro() {
    const el = $('#rp-intro');
    if (!el) return;
    if (mode === 'convert') {
      const vs = intro.oppName ? ` contre <b>${intro.oppName}</b>` : '';
      const when = intro.date ? ` le ${intro.date}` : '';
      const { diff } = sides(seedFen);
      const cp = intro.cp;
      const edge = diff >= 1 ? `Tu as <b>${edgeWords(diff)}</b>` : `Ton avantage est positionnel`;
      const evalTxt = cp != null ? ` (${fmtMe(cp)} au moteur)` : '';
      const plan = conversionPlan(seedFen, cp)
        .map(x => `<li><span class="rp-plan-ic">${x.ic}</span><span>${x.txt}</span></li>`).join('');
      // Le plan est replié sur téléphone : déployé, il repoussait l'échiquier
      // sous la ligne de flottaison, et un briefing qu'il faut scroller ne se
      // lit pas. Un appui sur le titre l'ouvre.
      const open = window.innerWidth >= 900 ? ' open' : '';
      el.innerHTML = `<div class="rp-brief-head">Tu étais <b>gagnant</b> ici${vs}${when}, et tu as perdu la partie.</div>`
        + `<div class="rp-brief-edge">${edge}${evalTxt}. Le travail, maintenant, c'est de la <b>finir</b>.</div>`
        + `<details class="rp-brief-plan"${open}><summary>Le plan pour cette position</summary>`
        + `<ul class="rp-plan">${plan}</ul>`
        + `<span class="rp-goal">Je commente chaque coup et je te dis ce qui est en prise. Bloqué ? le bouton <b>Indice</b> t'aide en trois temps sans te donner le coup tout de suite.</span>`
        + `</details>`;
      return;
    }
    const head = intro.moveNo != null ? `Coup ${intro.moveNo}${intro.dot} — ` : '';
    let h = `${head}tu avais joué <b>${intro.playedSan || '?'}</b>.`;
    if (intro.tip) h += ` ${intro.tip}`;
    // N'ajoute la meilleure suite que si le tip ne la mentionne pas déjà.
    if (intro.bestSan && !(intro.tip && intro.tip.includes(intro.bestSan))) h += ` La meilleure suite était <b>${intro.bestSan}</b>.`;
    h += ` <span class="rp-goal">À toi de rejouer : trouve mieux, ou vois la punition. L'ordi te répond.</span>`;
    el.innerHTML = h;
  }

  function renderBoard(lastMove, animateFrom) {
    if (animateFrom) BoardRenderer.renderAnimated(boardSvg, animateFrom, curFen(), lastMove, ANIM_MS);
    else BoardRenderer.render(boardSvg, curFen(), lastMove);
    syncControls();
  }

  // Les controles seuls, sans redessiner le plateau : un rendu sec a mon trait
  // effacait l'animation de la reponse de l'ordi dans la meme frame.
  function syncControls() {
    const undoBtn = $('#rp-undo'); if (undoBtn) undoBtn.disabled = hist.length <= 1 || busy;
    const resetBtn = $('#rp-reset'); if (resetBtn) resetBtn.disabled = hist.length <= 1 || busy;
    const turnEl = $('#rp-turn');
    if (turnEl) turnEl.textContent = gameOver() ? '' : (sideToMove() === mySide ? 'À toi' : 'Ordi…');
    syncHintBtn();
  }

  function drawMyArrow() {
    const arr = [];
    // En conversion la flèche n'apparaît qu'après le troisième indice : le coup
    // affiché d'office, c'est l'exercice qui disparaît.
    if (myBestUci && (mode !== 'convert' || hintArrow)) arr.push({ from: myBestUci.slice(0, 2), to: myBestUci.slice(2, 4), color: '#5b8fb9', opacity: 0.9, width: 7 });
    BoardRenderer.drawArrows(arrowsSvg, arr);
  }

  // Two persistent zones: the verdict of your LAST move (+ the engine's reply),
  // which must stay readable, and a status line for the CURRENT turn (eval /
  // best move) that refreshes each ply without wiping the verdict.
  function setVerdict(html, cls) {
    const el = $('#rp-verdict');
    if (!el) return;
    el.className = 'rp-verdict' + (cls ? ' ' + cls : '');
    el.innerHTML = html || '';
  }
  function setStatus(html) {
    const el = $('#rp-status');
    if (el) el.innerHTML = html || '';
  }

  // À mon trait : évaluer la position (flèche bleue + éval), mémoriser l'éval
  // pour juger mon prochain coup. Puis attendre mon glisser-déposer.
  async function onMyTurn() {
    BoardRenderer.clearArrows(arrowsSvg);
    if (gameOver()) return terminalComment();
    busy = true;
    syncControls();
    setStatus('⏳ Le moteur regarde la position…');
    const my = ++token;
    const fen = curFen();
    let res = null;
    try {
      if (typeof StockfishEngine !== 'undefined') {
        if (!StockfishEngine.isReady()) await StockfishEngine.init();
        if (my !== token) return;
        res = await StockfishEngine.evaluate(fen, DEPTH_MY);
      }
    } catch (_) { res = null; }
    if (my !== token) return;
    curEvalMe = meScore(res, fen);
    myBestUci = res && res.bestMove ? res.bestMove : null;
    busy = false;
    drawMyArrow();
    syncControls();
    if (mode === 'convert') {
      // startEvalMe est figé au premier passage : c'est la référence du bilan
      // de fin et de l'alerte « ton avantage file ».
      if (startEvalMe == null) startEvalMe = curEvalMe;
      resetHint();
      const drift = (startEvalMe != null && curEvalMe != null && Math.abs(curEvalMe - startEvalMe) >= 50)
        ? ` <span class="rp-drift">(au départ ${fmtMe(startEvalMe)})</span>` : '';
      const evalTxt = curEvalMe == null ? `Moteur indisponible : joue au jugement.`
        : Math.abs(curEvalMe) > 20000
          ? (curEvalMe > 0 ? `Il y a un <b>mat forcé</b> pour toi ici.` : `Attention : <b>il a un mat forcé</b> contre toi.`)
          : `Avantage <b>${fmtMe(curEvalMe)}</b>${drift}.`;
      setStatus(`Trait à <b>toi</b>. ${evalTxt}<div class="rp-cue">${turnCue(fen)}</div>`);
      return;
    }
    const best = uciToFr(fen, myBestUci);
    const evalTxt = res ? `Éval <b>${evalWhite(res, fen)}</b>.` : 'Moteur indisponible — joue librement.';
    const bestTxt = best ? ` Meilleur : <b>${best}</b> <span class="rp-hint">(flèche bleue)</span>.` : '';
    setStatus(`Trait à <b>toi</b>. ${evalTxt}${bestTxt}`);
  }

  function playMyMove(from, to) {
    if (busy || gameOver() || sideToMove() !== mySide) return;
    const fen = curFen();
    let g, mv = null;
    try { g = new Chess(fen); mv = g.move({ from, to, promotion: 'q' }); } catch (_) { mv = null; }
    if (!mv) { setStatus('⚠️ Coup illégal. Glisse une pièce sur une case légale.'); return; }
    const myUci = from + to + (mv.promotion || '');
    const fenAfterMe = g.fen();
    hist.push({ fen: fenAfterMe, move: mv, by: 'me' });
    BoardRenderer.clearArrows(arrowsSvg);
    renderBoard(mv, fen);
    busy = true;
    setVerdict('');
    setStatus('⏳ L\'ordi réfléchit…');
    judgeAndReply(fenAfterMe, mv, myUci, ++token);
  }

  async function judgeAndReply(fenAfterMe, myMove, myUci, my) {
    let res = null;
    try {
      if (typeof StockfishEngine !== 'undefined') {
        if (!StockfishEngine.isReady()) await StockfishEngine.init();
        if (my !== token) return;
        res = await StockfishEngine.evaluate(fenAfterMe, REPLY_MT);
      }
    } catch (_) { res = null; }
    if (my !== token) return;

    // Verdict sur MON coup (perte de centipions vue de mon camp).
    const afterMe = meScore(res, fenAfterMe);
    const mateForMe = meMate(res, fenAfterMe);
    const cpLoss = (curEvalMe != null && afterMe != null) ? Math.max(0, curEvalMe - afterMe) : null;
    const iDeliveredMate = (() => { try { return new Chess(fenAfterMe).in_checkmate(); } catch (_) { return false; } })();
    if (convStats) convStats.moves++;
    const verdict = gradeMyMove(myUci === myBestUci, cpLoss, mateForMe, iDeliveredMate, fenAfterMe, myMove, res);
    // Le bouton « Reprendre ce coup » va TOUJOURS en fin de bloc, après la
    // réponse de l'ordi : sinon il s'intercale au milieu du commentaire.
    const tail = (v) => (v.retry ? RETRY_HTML : '');

    // Partie finie sur mon coup (mat / pat) → pas de réplique.
    let over = false; try { over = new Chess(fenAfterMe).game_over(); } catch (_) {}
    if (over) { busy = false; renderBoard(null); setVerdict(verdict.html + terminalLine(fenAfterMe), verdict.cls); setStatus(''); return; }

    // L'ordi joue son meilleur coup.
    const replyUci = res && res.bestMove ? res.bestMove : firstLegal(fenAfterMe);
    let replyHtml = '';
    if (replyUci) {
      let g2, rm = null;
      try { g2 = new Chess(fenAfterMe); rm = g2.move({ from: replyUci.slice(0, 2), to: replyUci.slice(2, 4), promotion: replyUci[4] || 'q' }); } catch (_) { rm = null; }
      if (rm) {
        const before = fenAfterMe;
        hist.push({ fen: g2.fen(), move: rm, by: 'opp' });
        renderBoard(rm, before);
        replyHtml = describeReply(rm, res && res.lines ? res.lines : null);
      }
    }
    if (my !== token) return;

    let overAfter = false; try { overAfter = new Chess(curFen()).game_over(); } catch (_) {}
    if (overAfter) { busy = false; setVerdict(verdict.html + replyHtml + terminalLine(curFen()), verdict.cls); setStatus(''); renderBoard(null); return; }

    setVerdict(verdict.html + replyHtml + tail(verdict), verdict.cls);
    busy = false;
    // Nouveau tour : réévaluer pour la flèche bleue + l'éval de référence (le
    // verdict ci-dessus reste affiché, seule la ligne de statut se rafraîchit).
    onMyTurn();
  }

  function firstLegal(fen) {
    try { const g = new Chess(fen); const ms = g.moves({ verbose: true }); if (ms.length) return ms[0].from + ms[0].to + (ms[0].promotion || ''); } catch (_) {}
    return null;
  }

  // Verdict textuel de mon coup, calqué sur la classification de l'app mais en
  // direct : coup parfait / précis / imprécision / erreur / gaffe, enrichi par
  // le commentaire de analysis.js (pièce en prise, fourchette menacée…).
  function gradeMyMove(isBest, cpLoss, mateForMe, iDeliveredMate, fenAfterMe, myMove, res) {
    if (iDeliveredMate) {
      if (convStats) convStats.best++; // un mat compte évidemment comme le meilleur coup
      return { html: '🏆 <b>Échec et mat !</b> Superbe, tu punis la position.', cls: 'right' };
    }
    // Mode conversion : pas de note coup par coup (ce serait rendre l'aide par
    // la fenêtre). Un seul retour, et une seule fois : le moment où l'avantage
    // passe sous le seuil. C'est l'information dont il a besoin, et c'est tout.
    // Mode conversion : on commente CHAQUE coup, comme un entraîneur qui
    // regarde par-dessus l'épaule. Le verdict dit ce que le coup a coûté et
    // pourquoi ; sur une vraie gaffe il propose de reprendre le coup, parce
    // qu'une erreur qui passe sans être rejouée n'apprend rien.
    if (mode === 'convert') {
      const after = meScore(res, fenAfterMe);
      const bad = badExplain(fenAfterMe, myMove, res);
      const gone = after != null && startEvalMe != null && startEvalMe >= CONV_WIN && after < CONV_SLIP;
      const goneTxt = (gone && !warned) ? (warned = true, ` <b>Ton avantage a disparu</b> : la partie est redevenue jouable pour lui.`) : '';
      if (mateForMe != null && mateForMe < 0) {
        if (convStats) convStats.slips++;
        return { html: `🔴 <b>Ce coup permet un mat forcé contre toi.</b>${bad ? ' ' + bad : ''}`, cls: 'wrong', retry: true };
      }
      if (isBest) {
        if (convStats) convStats.best++;
        return { html: `✅ <b>Le meilleur coup.</b> ${advHold(after)}`, cls: 'right' };
      }
      if (cpLoss == null) return { html: `🔵 Coup joué. ${advHold(after)}`, cls: '' };
      const loss = Math.round(cpLoss);
      if (loss <= 30) return { html: `👍 <b>Solide</b>, tu gardes la main. ${advHold(after)}`, cls: 'right' };
      if (loss <= 100) return { html: `🟡 <b>Imprécis</b> (-${loss} cp), pas grave ici. ${advDrop(after)}${bad ? ' ' + bad : ''}${goneTxt}`, cls: '' };
      if (convStats) convStats.slips++;
      const head = loss > 250
        ? `🔴 <b>Voilà exactement le genre de coup qui te fait reperdre une partie gagnée.</b>`
        : `🟠 <b>Ce coup laisse filer une partie de ton avantage.</b>`;
      // Au-delà de 3 pions perdus, le chiffre en centipions n'apprend rien de
      // plus que « de +6.9 à -6.1 » : on ne garde que la phrase.
      const cost = loss > 300 ? '' : ` (-${loss} cp)`;
      return { html: `${head}${cost} ${advDrop(after)}${bad ? ' ' + bad : ''}${goneTxt}`, cls: 'wrong', retry: true };
    }
    if (mateForMe != null && mateForMe < 0) {
      const bad = badExplain(fenAfterMe, myMove, res);
      return { html: `🔴 <b>Attention</b> — ce coup permet un mat forcé pour l'adversaire.${bad ? ' ' + bad : ''}`, cls: 'wrong' };
    }
    if (isBest) return { html: '✅ <b>Parfait</b>, c\'est le meilleur coup.', cls: 'right' };
    if (cpLoss == null) return { html: '🔵 Coup joué.', cls: '' };
    const loss = Math.round(cpLoss);
    if (loss <= 20) return { html: '👍 <b>Précis</b>, tu gardes le fil.', cls: 'right' };
    if (loss <= 50) return { html: `🟡 <b>Petite imprécision</b> (-${loss} cp), rien de grave.`, cls: '' };
    const bad = badExplain(fenAfterMe, myMove, res);
    if (loss <= 120) return { html: `🟠 <b>Erreur</b> (-${loss} cp).${bad ? ' ' + bad : ''}`, cls: 'wrong' };
    return { html: `🔴 <b>Gaffe</b> (-${loss} cp).${bad ? ' ' + bad : ''}`, cls: 'wrong' };
  }

  // Ce que l'adversaire (le moteur) menace après mon coup, via analysis.js.
  function badExplain(fenAfterMe, myMove, res) {
    if (typeof Analyzer === 'undefined' || !Analyzer.explainBadMove) return '';
    const lines = res && res.lines && res.lines.length ? res.lines : (res && res.bestMove ? [{ move: res.bestMove }] : null);
    if (!lines) return '';
    try { return Analyzer.explainBadMove(fenAfterMe, myMove, lines) || ''; } catch (_) { return ''; }
  }

  function describeReply(rm, oppLinesAfterReply) {
    let note = '';
    if (rm.san.includes('#')) note = ' — et c\'est mat.';
    else if (rm.captured) {
      const names = { p: 'un pion', n: 'le cavalier', b: 'le fou', r: 'la tour', q: 'la dame' };
      note = ` — il prend ${names[rm.captured] || 'du matériel'}.`;
    } else if (rm.san.includes('+')) note = ' — échec.';
    return `<div class="rp-reply">L'ordi répond <b>${fr(rm.san)}</b>${note}</div>`;
  }

  function terminalLine(fen) {
    try {
      const g = new Chess(fen);
      const converted = (v) => {
        // Bilan de conversion : gagné = converti. C'est le seul verdict qui
        // compte, et il est journalisé une seule fois par partie.
        if (mode !== 'convert') return '';
        if (!convDone) { convDone = true; logConv(v); }
        return (v
          ? `<div class="rp-term rp-term-win">✅ <b>Converti !</b> Voilà la partie que tu avais perdue, gagnée.</div>`
          : `<div class="rp-term">❌ <b>Reperdue.</b> Annule quelques coups et rejoue le passage : c'est là qu'est la leçon, pas dans le résultat.</div>`)
          + convRecap();
      };
      if (g.in_checkmate()) {
        const loserIsMe = (fen.split(' ')[1] === mySide);
        if (mode === 'convert') return converted(!loserIsMe);
        return loserIsMe
          ? `<div class="rp-term">♚ Échec et mat contre toi. Annule pour tenter une autre suite.</div>`
          : `<div class="rp-term">🏆 Échec et mat, bien joué ! Annule pour explorer une variante.</div>`;
      }
      if (g.in_stalemate()) return (mode === 'convert' ? converted(false) : `<div class="rp-term">Pat — nulle. Annule pour tenter autre chose.</div>`);
      if (g.in_draw()) return (mode === 'convert' ? converted(false) : `<div class="rp-term">Nulle (matériel / répétition). Annule pour tenter autre chose.</div>`);
    } catch (_) {}
    return '';
  }

  // Le bilan chiffré de la session : sans lui, « converti / reperdue » ne dit
  // pas OÙ ça s'est joué. Trois nombres suffisent.
  function convRecap() {
    if (!convStats || !convStats.moves) return '';
    const c = convStats;
    const bits = [`${c.moves} coup${c.moves > 1 ? 's' : ''} joué${c.moves > 1 ? 's' : ''}`];
    if (c.best) bits.push(`${c.best} meilleur${c.best > 1 ? 's' : ''} coup${c.best > 1 ? 's' : ''}`);
    bits.push(c.slips ? `${c.slips} coup${c.slips > 1 ? 's' : ''} qui coûte${c.slips > 1 ? 'nt' : ''} cher` : `aucune gaffe`);
    if (c.hints) bits.push(`${c.hints} indice${c.hints > 1 ? 's' : ''}`);
    return `<div class="rp-recap">${bits.join(' · ')}</div>`;
  }

  function logConv(won) {
    if (typeof Training !== 'undefined' && Training.logSession) Training.logSession('conversion', 1, won ? 1 : 0);
  }

  function terminalComment() {
    setVerdict(terminalLine(curFen()) || 'Position terminale.', '');
    setStatus('');
    renderBoard(null);
  }

  return { start, startConversion, close };
})();
