// Arbre visuel des ouvertures — panneau "Apprendre".
// Arbre horizontal dépliable, branches courbes colorées par famille, barre de
// détail avec échiquier (BoardRenderer) et deux liens : explorateur interne
// (App.openOpeningByLine) et fiche Chess.com.
const OpeningTree = (() => {
  const FAM = {
    open:       { name: 'Ouvertes',      color: '#4ade80' },
    semiopen:   { name: 'Semi-ouvertes', color: '#60a5fa' },
    closed:     { name: 'Fermées',       color: '#c084fc' },
    semiclosed: { name: 'Semi-fermées',  color: '#22d3ee' },
    flank:      { name: 'Flanc',         color: '#fb923c' },
  };
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const CC_HUB = 'https://www.chess.com/openings';

  // mv = coup affiché (FR) · line = ligne SAN anglaise (chemin complet)
  // appLine = ligne exacte de l'explorateur interne (ou null → liste Ouvertures)
  // cc = slug de la fiche Chess.com (ou null → hub Chess.com)
  const TREE = {
    icon: '🏁', lbl: 'Position de départ', fen: START, appLine: null, cc: null,
    idea: "Le premier coup des Blancs donne le ton : <span class='k'>1.e4</span> vise le jeu ouvert et rapide, <span class='k'>1.d4</span> un centre solide et stratégique, les coups de flanc (<span class='k'>1.c4</span>, <span class='k'>1.Cf3</span>) attaquent le centre à distance.",
    kids: [
      { mv: '1.e4', icon: '⚔️', lbl: 'Pion roi', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', appLine: null, cc: null,
        idea: "Libère fou-roi et dame, occupe le centre. Le pion e4 n'est pas défendu → jeu souvent vif et tactique.",
        kids: [
          { mv: '1...e5', icon: '🔓', lbl: 'Jeux ouverts', fam: 'open', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', appLine: null, cc: null,
            idea: "Réponse symétrique : les deux camps se disputent le centre frontalement → <span class='k'>jeux ouverts</span>, riches en tactique.",
            kids: [
              { mv: '2.Cf3', icon: '♞', lbl: 'Cavalier roi', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', appLine: null, cc: null,
                idea: "Menace immédiatement e5 : le coup le plus naturel.",
                kids: [
                  { mv: '2...Cc6', icon: '🛡️', lbl: 'Défense de e5', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', appLine: null, cc: null,
                    idea: "Carrefour des grandes ouvertes : les Noirs défendent e5 et développent.",
                    kids: [
                      { mv: '3.Fb5', icon: '🇪🇸', lbl: 'Espagnole (Ruy Lopez)', eco: 'C60–C99', fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
                        appLine: 'e4 e5 Nf3 Nc6 Bb5', cc: 'Ruy-Lopez-Opening',
                        idea: "Le fou attaque le défenseur de e5. L'ouverture la plus profonde du répertoire classique : pression durable, jeu positionnel." },
                      { mv: '3.Fc4', icon: '🇮🇹', lbl: 'Italienne', eco: 'C50–C54', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
                        appLine: 'e4 e5 Nf3 Nc6 Bc4', cc: 'Italian-Game',
                        idea: "Le fou vise f7, le point faible. Développement rapide, parfaite pour apprendre les principes d'ouverture." },
                      { mv: '3.d4', icon: '🏴', lbl: 'Écossaise', eco: 'C44–C45', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3 0 3',
                        appLine: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', cc: 'Scotch-Game',
                        idea: "Ouvre le centre tout de suite : jeu clair et actif, peu de théorie." },
                    ]},
                ]},
              { mv: '2.f4', icon: '🔥', lbl: 'Gambit du Roi', eco: 'C30–C39', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PPP/RNBQKBNR b KQkq f3 0 2',
                appLine: 'e4 e5 f4', cc: 'Kings-Gambit',
                idea: "Sacrifie un pion pour un développement fulgurant et l'ouverture de la colonne f. Romantique et tranchant." },
            ]},
          { mv: '1...c5', icon: '🌋', lbl: 'Sicilienne', fam: 'semiopen', eco: 'B20–B99', fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
            appLine: 'e4 c5', cc: 'Sicilian-Defense',
            idea: "La réponse la plus combative à 1.e4. Jeu asymétrique → <span class='k'>semi-ouvert</span>, contre-jeu sur l'aile dame.",
            kids: [
              { mv: '2.Cf3 d6 3.d4', icon: '🗡️', lbl: 'Sicilienne ouverte', eco: 'B30–B99', fen: 'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 1 5',
                appLine: 'e4 c5', cc: 'Sicilian-Defense',
                idea: "Les Blancs ouvrent le centre. Najdorf, Dragon, Scheveningen en découlent." },
            ]},
          { mv: '1...e6', icon: '🇫🇷', lbl: 'Française', fam: 'semiopen', eco: 'C00–C19', fen: 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
            appLine: 'e4 e6 d4 d5', cc: 'French-Defense',
            idea: "Solide mais un peu passive : le fou de cases blanches reste enfermé. Prépare d5, structures fermées." },
          { mv: '1...c6', icon: '🧱', lbl: 'Caro-Kann', fam: 'semiopen', eco: 'B10–B19', fen: 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
            appLine: 'e4 c6 d4 d5', cc: 'Caro-Kann-Defense',
            idea: "Comme la française mais sans enfermer le fou. Très solide, chère aux joueurs positionnels." },
          { mv: '1...d5', icon: '❄️', lbl: 'Scandinave', fam: 'semiopen', eco: 'B01', fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2',
            appLine: 'e4 d5 exd5 Qxd5', cc: 'Scandinavian-Defense',
            idea: "Défie e4 tout de suite. Après 2.exd5 Dxd5, la dame sort tôt : simple, peu de théorie." },
        ]},
      { mv: '1.d4', icon: '🏛️', lbl: 'Pion dame', fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1', appLine: null, cc: null,
        idea: "Le pion d4 est défendu par la dame : centre plus stable, jeu plus lent et stratégique.",
        kids: [
          { mv: '1...d5', icon: '🔒', lbl: 'Jeux fermés', fam: 'closed', fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6 0 2', appLine: null, cc: null,
            idea: "Réponse symétrique, centre verrouillé → <span class='k'>jeux fermés</span> : la stratégie prime sur la tactique.",
            kids: [
              { mv: '2.c4', icon: '💎', lbl: 'Gambit dame', eco: 'D06–D69', fen: 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2', appLine: null, cc: 'Queens-Gambit',
                idea: "Offre le pion c pour dévier d5 et dominer le centre. Faux sacrifice : le pion se récupère.",
                kids: [
                  { mv: '2...dxc4', icon: '🤝', lbl: 'GD accepté', eco: 'D20–D29', fen: 'rnbqkbnr/ppp1pppp/8/8/2pP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
                    appLine: 'd4 d5 c4 dxc4', cc: 'Queens-Gambit-Accepted',
                    idea: "Les Noirs prennent mais rendront le pion ; les Blancs obtiennent un centre mobile." },
                  { mv: '2...e6', icon: '🚫', lbl: 'GD refusé', eco: 'D30–D69', fen: 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
                    appLine: 'd4 d5 c4 e6', cc: 'Queens-Gambit-Declined',
                    idea: "Solide et classique : structure rigide, plan clair (attaque de minorité)." },
                  { mv: '2...c6', icon: '🐻', lbl: 'Défense slave', eco: 'D10–D19', fen: 'rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
                    appLine: 'd4 d5 c4 c6', cc: 'Slav-Defense',
                    idea: "Renforce d5 sans enfermer le fou de cases blanches. Très fiable au plus haut niveau." },
                ]},
            ]},
          { mv: '1...Cf6', icon: '🧩', lbl: 'Jeux semi-fermés', fam: 'semiclosed', fen: 'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2', appLine: null, cc: null,
            idea: "Les Noirs refusent la symétrie, laissent le centre aux Blancs pour l'attaquer ensuite (hypermoderne) → <span class='k'>semi-fermés</span>.",
            kids: [
              { mv: '2.c4 e6 3.Cc3 Fb4', icon: '📌', lbl: 'Nimzo-indienne', eco: 'E20–E59', fen: 'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4',
                appLine: 'd4 Nf6 c4 e6 Nc3 Bb4', cc: 'Nimzo-Indian-Defense',
                idea: "Le fou cloue Cc3 et vise à doubler les pions blancs. Équilibre solidité / jeu de pièces." },
              { mv: '2.c4 g6 3.Cc3 Fg7', icon: '🏹', lbl: 'Est-indienne / Grünfeld', eco: 'E60–E99', fen: 'rnbqk2r/ppppppbp/5np1/8/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4',
                appLine: 'd4 Nf6 c4 g6 Nc3 Bg7', cc: 'Kings-Indian-Defense',
                idea: "Fianchetto : on laisse un gros centre blanc… pour le bombarder. Contre-attaque tranchante." },
            ]},
          { mv: '1...f5', icon: '🌷', lbl: 'Hollandaise', fam: 'semiclosed', eco: 'A80–A99', fen: 'rnbqkbnr/ppppp1pp/8/5p2/3P4/8/PPP1PPPP/RNBQKBNR w KQkq f6 0 2',
            appLine: null, cc: 'Dutch-Defense',
            idea: "Vise l'attaque sur l'aile roi (case e4). Ambitieuse, mais affaiblit un peu le roque." },
        ]},
      { mv: '1.c4', icon: '🇬🇧', lbl: 'Anglaise', fam: 'flank', eco: 'A10–A39', fen: 'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3 0 1',
        appLine: 'c4', cc: 'English-Opening',
        idea: "Ouverture de <span class='k'>flanc</span> : contrôle d5 à distance sans avancer de pion central. Transpose souvent." },
      { mv: '1.Cf3', icon: '🐎', lbl: 'Réti', fam: 'flank', eco: 'A04–A09', fen: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKBNR b KQkq - 1 1',
        appLine: 'Nf3 d5 c4', cc: 'Reti-Opening',
        idea: "Flexible et hypermoderne : développe avant de fixer la structure. Peut transposer partout." },
    ]
  };

  let built = false, selectedCard = null, landscapeLocked = false;
  const active = new Set(Object.keys(FAM));
  const famColor = f => f ? FAM[f].color : '#6b7a99';

  // ── Forçage du paysage (Android PWA installée : contourne le WebAPK figé) ──
  async function lockLandscape() {
    const so = screen.orientation;
    if (!so || !so.lock) return false;
    try { await so.lock('landscape'); return true; }
    catch (_) {
      // Certains navigateurs exigent le plein écran avant de verrouiller.
      try {
        const el = document.documentElement;
        if (el.requestFullscreen) { await el.requestFullscreen(); await so.lock('landscape'); return true; }
      } catch (_) {}
    }
    return false;
  }
  function unlockOrientation() {
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (_) {}
    if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (_) {} }
  }
  async function toggleLandscape() {
    const btn = document.getElementById('ot-landscape');
    if (!landscapeLocked) {
      const ok = await lockLandscape();
      if (ok) { landscapeLocked = true; if (btn) btn.textContent = '⟳ Portrait'; setTimeout(draw, 350); }
      else if (btn) { btn.textContent = 'Rotation indispo'; setTimeout(() => { btn.textContent = '⟳ Paysage'; }, 1900); }
    } else {
      unlockOrientation(); landscapeLocked = false; if (btn) { btn.textContent = '⟳ Paysage'; } setTimeout(draw, 350);
    }
  }
  // Déverrouille l'orientation quand le panneau se ferme (ne pas piéger le reste de l'app en paysage).
  function observePanelClose() {
    const p = document.getElementById('panel-tree');
    if (!p || p._otObs) return;
    const obs = new MutationObserver(() => {
      if (!p.classList.contains('open') && landscapeLocked) {
        unlockOrientation(); landscapeLocked = false;
        const b = document.getElementById('ot-landscape'); if (b) b.textContent = '⟳ Paysage';
      }
    });
    obs.observe(p, { attributes: true, attributeFilter: ['class'] });
    p._otObs = true;
  }

  function findPath(node, target, acc = []) {
    const here = [...acc, node];
    if (node === target) return here;
    if (node.kids) for (const k of node.kids) { const r = findPath(k, target, here); if (r) return r; }
    return null;
  }

  function renderDetailBoard(fen) {
    const host = document.getElementById('ot-dboard');
    if (!host || typeof BoardRenderer === 'undefined') return;
    const prev = BoardRenderer.isFlipped();
    BoardRenderer.setFlipped(false);
    BoardRenderer.render(host, fen);
    BoardRenderer.setFlipped(prev);
  }

  function select(node, fam, card) {
    if (selectedCard) selectedCard.classList.remove('selected');
    if (card) { card.classList.add('selected'); selectedCard = card; }
    const path = findPath(TREE, node) || [node];
    const moves = path.filter(n => n.mv).map(n => n.mv).join('  ');
    const famTag = fam ? `<span class="ot-pill" style="background:${famColor(fam)}22;color:${famColor(fam)}">${FAM[fam].name}</span>` : '';
    const eco = node.eco ? `<span class="ot-eco">${node.eco}</span>` : '';
    const ccUrl = node.cc ? `${CC_HUB}/${node.cc}` : CC_HUB;
    const detail = document.getElementById('ot-detail');
    detail.innerHTML = `
      <svg class="ot-dboard" id="ot-dboard" viewBox="0 0 360 360"></svg>
      <div class="ot-txt">
        <h3>${node.icon || ''} ${node.lbl}</h3>
        <div class="ot-metarow">${famTag}${eco}<span class="ot-path">${moves ? moves.replace(/(\d+\.(?:\.\.)?)/g, '<b>$1</b>') : 'position de départ'}</span></div>
        <div class="ot-idea">${node.idea || ''}</div>
        <div class="ot-actions">
          <button class="ot-link ot-link-app" id="ot-open-app">♟ Ouvrir dans Chess Analyst</button>
          <a class="ot-link ot-link-cc" id="ot-open-cc" href="${ccUrl}" target="_blank" rel="noopener">↗ Voir sur Chess.com</a>
        </div>
      </div>`;
    renderDetailBoard(node.fen);
    const appBtn = document.getElementById('ot-open-app');
    appBtn.addEventListener('click', () => {
      if (typeof App !== 'undefined' && App.openOpeningByLine) App.openOpeningByLine(node.appLine);
    });
    if (!node.appLine) appBtn.title = "Aucune fiche dédiée — ouvre la liste des ouvertures";
  }

  function buildNode(node, parentFam, depth) {
    const fam = node.fam || parentFam || null;
    const st = document.createElement('div');
    st.className = 'ot-subtree';
    if (depth >= 1 && node.kids) st.classList.add('collapsed'); // racine + niveau 1 ouverts
    const card = document.createElement('div');
    card.className = 'ot-card' + (depth === 0 ? ' root' : '');
    card.style.setProperty('--ot-fam', famColor(fam));
    card.dataset.fam = node.fam || '';
    const eco = node.eco ? `<span class="ot-card-eco">${node.eco}</span>` : '';
    const mv = node.mv ? `<span class="ot-mv">${node.mv}</span>` : '';
    card.innerHTML = `<div class="ot-ic">${node.icon || '♟️'}</div>
      <div class="ot-body-txt"><div class="ot-tt">${node.lbl}</div><div class="ot-sub">${mv}${eco}</div></div>`;
    const hasKids = node.kids && node.kids.length;
    if (hasKids) {
      const ch = document.createElement('div'); ch.className = 'ot-chev'; ch.textContent = '◀';
      ch.addEventListener('click', e => { e.stopPropagation(); st.classList.toggle('collapsed'); draw(); });
      card.appendChild(ch);
    }
    card.addEventListener('click', () => { if (hasKids) st.classList.remove('collapsed'); select(node, fam, card); draw(); });
    st.appendChild(card);
    if (hasKids) {
      const kids = document.createElement('div'); kids.className = 'ot-kids';
      node.kids.forEach(k => kids.appendChild(buildNode(k, fam, depth + 1)));
      st.appendChild(kids);
    }
    st._node = node;
    return st;
  }

  function draw() {
    const svg = document.getElementById('ot-links'), content = document.getElementById('ot-content');
    if (!svg || !content) return;
    const base = content.getBoundingClientRect();
    svg.setAttribute('width', content.scrollWidth);
    svg.setAttribute('height', content.scrollHeight);
    let d = '';
    content.querySelectorAll('.ot-subtree').forEach(st => {
      if (st.classList.contains('collapsed')) return;
      const pc = st.querySelector(':scope > .ot-card');
      if (!pc || pc.offsetParent === null) return;
      const pr = pc.getBoundingClientRect();
      const px = pr.right - base.left, py = pr.top - base.top + pr.height / 2;
      st.querySelectorAll(':scope > .ot-kids > .ot-subtree > .ot-card').forEach(kc => {
        const kr = kc.getBoundingClientRect();
        const cx = kr.left - base.left, cy = kr.top - base.top + kr.height / 2;
        const dx = Math.max(24, (cx - px) / 2);
        const col = famColor(kc.dataset.fam || null);
        d += `<path d="M ${px} ${py} C ${px + dx} ${py}, ${cx - dx} ${cy}, ${cx} ${cy}" fill="none" stroke="${col}" stroke-width="2.5" stroke-opacity="0.55"/>`;
      });
    });
    svg.innerHTML = d;
  }

  function buildLegend() {
    const el = document.getElementById('ot-legend');
    if (!el) return;
    el.innerHTML = '';
    Object.entries(FAM).forEach(([k, f]) => {
      const c = document.createElement('button'); c.className = 'ot-chip'; c.type = 'button';
      c.innerHTML = `<span class="ot-dot" style="background:${f.color}"></span>${f.name}`;
      c.addEventListener('click', () => {
        active.has(k) ? (active.delete(k), c.classList.add('off')) : (active.add(k), c.classList.remove('off'));
        applyFilter();
      });
      el.appendChild(c);
    });
  }
  function applyFilter() {
    document.querySelectorAll('.ot-card').forEach(c => {
      const f = c.dataset.fam; if (!f) return;
      c.classList.toggle('ot-hidden', !active.has(f));
    });
    draw();
  }

  function enablePan() {
    const cv = document.getElementById('ot-canvas'); if (!cv || cv._panBound) return;
    let down = false, sx, sy, sl, stp;
    cv.addEventListener('mousedown', e => {
      if (e.target.closest('.ot-card') || e.target.closest('.ot-chip')) return;
      down = true; cv.classList.add('grabbing'); sx = e.clientX; sy = e.clientY; sl = cv.scrollLeft; stp = cv.scrollTop;
    });
    window.addEventListener('mousemove', e => { if (!down) return; cv.scrollLeft = sl - (e.clientX - sx); cv.scrollTop = stp - (e.clientY - sy); });
    window.addEventListener('mouseup', () => { down = false; cv.classList.remove('grabbing'); });
    cv.addEventListener('scroll', draw);
    cv._panBound = true;
  }

  function build() {
    const tree = document.getElementById('ot-tree'); if (!tree) return;
    tree.innerHTML = '';
    tree.appendChild(buildNode(TREE, null, 0));
    buildLegend();
    enablePan();
    const expand = document.getElementById('ot-expand'), collapse = document.getElementById('ot-collapse');
    if (expand) expand.onclick = () => { document.querySelectorAll('.ot-subtree').forEach(s => s.classList.remove('collapsed')); draw(); };
    if (collapse) collapse.onclick = () => {
      document.querySelectorAll('.ot-subtree').forEach(s => { if (s._node && s._node !== TREE && s.querySelector(':scope > .ot-kids')) s.classList.add('collapsed'); });
      draw();
    };
    const rotClose = document.getElementById('ot-rotate-close');
    if (rotClose) rotClose.onclick = () => { const h = document.getElementById('ot-rotate-hint'); if (h) h.classList.add('dismissed'); };
    const lsBtn = document.getElementById('ot-landscape');
    if (lsBtn) lsBtn.onclick = toggleLandscape;
    observePanelClose();
    window.addEventListener('resize', draw);
    // orientationchange fires before the viewport settles — redraw once it has.
    window.addEventListener('orientationchange', () => setTimeout(draw, 320));
    built = true;
  }

  // Appelé à l'ouverture du panneau (panneau déjà visible → layout disponible).
  function render() {
    if (!built) build();
    requestAnimationFrame(() => {
      draw();
      if (!selectedCard) select(TREE, null, document.querySelector('.ot-card.root'));
      draw();
      const cv = document.getElementById('ot-canvas'); // démarrer sur la racine (haut-gauche)
      if (cv) { cv.scrollTop = 0; cv.scrollLeft = 0; }
    });
  }

  return { render };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OpeningTree;
