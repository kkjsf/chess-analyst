// Coach — bulk analysis of all your Chess.com games + progress dashboard.
const Coach = (() => {
  const DB_NAME = 'chess-coach';
  const DB_VER = 1;
  const STORE = 'games';
  const META = 'meta';
  const USER_KEY = 'chess-coach-user';
  const HOSTED_URL = './coach-data.json';
  const ACTIONS_URL = 'https://github.com/kkjsf/chess-analyst/actions/workflows/analyze.yml';
  const BULK_MOVETIME = 'movetime 600';
  const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

  let db = null;
  let games = [];
  let busy = false;
  let stopFlag = false;
  let puzzles = [];
  let puzIdx = 0;
  let puzFilter = 'all';
  let puzRevealed = false;
  let hostedInfo = null;

  const $ = (s) => document.querySelector(s);

  // ─────────────── IndexedDB ───────────────
  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'uuid' });
        if (!d.objectStoreNames.contains(META)) d.createObjectStore(META, { keyPath: 'k' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function store(name, mode) { return db.transaction(name, mode).objectStore(name); }
  function getAll() {
    return new Promise((res) => {
      const out = [];
      const c = store(STORE, 'readonly').openCursor();
      c.onsuccess = (e) => { const cur = e.target.result; if (cur) { out.push(cur.value); cur.continue(); } else res(out); };
      c.onerror = () => res(out);
    });
  }
  function getOne(uuid) {
    return new Promise((res) => { const r = store(STORE, 'readonly').get(uuid); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
  }
  function put(rec) {
    return new Promise((res, rej) => { const r = store(STORE, 'readwrite').put(rec); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
  }
  function getMeta(k) {
    return new Promise((res) => { const r = store(META, 'readonly').get(k); r.onsuccess = () => res(r.result ? r.result.v : null); r.onerror = () => res(null); });
  }
  function setMeta(k, v) {
    return new Promise((res) => { const r = store(META, 'readwrite').put({ k, v }); r.onsuccess = () => res(); r.onerror = () => res(); });
  }

  // ─────────────── Username ───────────────
  function getUser() { return (localStorage.getItem(USER_KEY) || 'nimokaji').trim(); }
  function setUser(u) { localStorage.setItem(USER_KEY, u.trim()); }

  // ─────────────── Chess.com sync ───────────────
  async function fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  function prettyOpening(ecoUrl) {
    if (!ecoUrl) return null;
    const slug = ecoUrl.split('/openings/')[1] || ecoUrl.split('/').pop();
    if (!slug) return null;
    return decodeURIComponent(slug).replace(/-/g, ' ').replace(/\d+\s*\w*$/, '').trim();
  }
  function openingFamily(name) {
    if (!name) return 'Inconnue';
    const words = name.split(/\s+/);
    return words.slice(0, 2).join(' ');
  }

  function normalize(g, user) {
    const u = user.toLowerCase();
    const userColor = (g.white.username || '').toLowerCase() === u ? 'w' : 'b';
    const me = userColor === 'w' ? g.white : g.black;
    const opp = userColor === 'w' ? g.black : g.white;
    let result = 'loss';
    if (me.result === 'win') result = 'win';
    else if (DRAW_RESULTS.has(me.result)) result = 'draw';
    const name = prettyOpening(g.eco);
    return {
      uuid: g.uuid,
      url: g.url,
      pgn: g.pgn,
      userColor,
      result,
      endReason: me.result,
      myRating: me.rating || null,
      oppRating: opp.rating || null,
      oppName: opp.username || '?',
      eco: g.eco || null,
      opening: name,
      family: openingFamily(name),
      timeClass: g.time_class || null,
      timeControl: g.time_control || null,
      rated: !!g.rated,
      endTime: g.end_time || 0,
      ccAccuracy: g.accuracies ? (userColor === 'w' ? g.accuracies.white : g.accuracies.black) : null,
      analysis: null
    };
  }

  async function sync(onStatus) {
    const user = getUser();
    onStatus && onStatus('Récupération des archives de ' + user + '…');
    const arch = await fetchJson(`https://api.chess.com/pub/player/${user}/games/archives`);
    const months = arch.archives || [];
    const done = new Set((await getMeta('doneMonths')) || []);
    let added = 0;
    for (let i = 0; i < months.length; i++) {
      const url = months[i];
      const isRecent = i >= months.length - 2; // always refetch current + previous month
      if (done.has(url) && !isRecent) continue;
      onStatus && onStatus(`Mois ${i + 1}/${months.length}…`);
      let data;
      try { data = await fetchJson(url); } catch (_) { continue; }
      for (const g of (data.games || [])) {
        if (g.rules && g.rules !== 'chess') continue;
        if (!g.uuid || !g.pgn) continue;
        const existing = await getOne(g.uuid);
        if (existing) continue; // keep existing analysis
        await put(normalize(g, user));
        added++;
      }
      if (!isRecent) done.add(url);
    }
    await setMeta('doneMonths', [...done]);
    await setMeta('lastSync', Date.now());
    games = await getAll();
    return { added, total: games.length };
  }

  // ─────────────── Hosted analysis (GitHub Action output) ───────────────
  // Server-computed analysis is authoritative. Falls back gracefully if the
  // file doesn't exist yet (app then works fully in local-engine mode).
  async function loadHosted() {
    let data;
    try {
      const r = await fetch(HOSTED_URL, { cache: 'no-store' });
      if (!r.ok) return null;
      data = await r.json();
    } catch (_) { return null; }
    if (!data || !Array.isArray(data.games)) return null;
    hostedInfo = { generatedAt: data.generatedAt, count: data.count, analyzedCount: data.analyzedCount };
    const prevGen = await getMeta('hostedGeneratedAt');
    if (prevGen === data.generatedAt) return { ...hostedInfo, unchanged: true };
    for (const hg of data.games) {
      if (hg.analysis && !hg.analysis.error) await put(hg);
      else { const ex = await getOne(hg.uuid); if (!ex) await put(hg); }
    }
    await setMeta('hostedGeneratedAt', data.generatedAt);
    games = await getAll();
    return hostedInfo;
  }

  // ─────────────── Bulk analysis ───────────────
  function stripComments(pgn) {
    let p = pgn.replace(/\r\n/g, '\n').replace(/\{[^}]*\}/g, ' ');
    p = p.replace(/\$\d+/g, '').replace(/\d+\.\.\./g, ' ');
    return p;
  }

  async function analyzeOne(g, onMove) {
    const chess = new Chess();
    let ok = false;
    try { ok = chess.load_pgn(g.pgn, { sloppy: true }); } catch (_) { ok = false; }
    if (!ok) { try { ok = chess.load_pgn(stripComments(g.pgn), { sloppy: true }); } catch (_) { ok = false; } }
    if (!ok) return { error: 'pgn' };
    const moves = chess.history({ verbose: true });
    if (!moves.length) return { error: 'empty' };

    const results = await Analyzer.analyzeGameAsync(chess, moves, onMove, BULK_MOVETIME);
    const summary = Analyzer.generateSummary(results, moves);
    return deriveStats(results, summary, g);
  }

  function deriveStats(results, summary, g) {
    const side = g.userColor;
    const us = side === 'w' ? summary.stats.w : summary.stats.b;
    const phaseErrors = { opening: 0, middle: 0, endgame: 0 };
    const phaseAcc = { opening: { total: 0, count: 0 }, middle: { total: 0, count: 0 }, endgame: { total: 0, count: 0 } };
    const blunders = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.move || r.move.color !== side) continue;
      const phase = i < 20 ? 'opening' : i < 50 ? 'middle' : 'endgame';
      if (r.type === 'blunder' || r.type === 'mistake') {
        phaseErrors[phase]++;
        if (r.fenBefore && r.bestUci) {
          blunders.push({
            ply: i, phase, type: r.type,
            fenBefore: r.fenBefore, bestUci: r.bestUci, bestSan: r.bestSan || null,
            playedSan: r.sanFr || r.san, cpLoss: r.cpLoss || 0, tip: r.tipFr || ''
          });
        }
      }
      const loss = r.winPctLoss || 0;
      phaseAcc[phase].total += Math.max(0, Math.min(100, Math.round((1 - loss * 2) * 100)));
      phaseAcc[phase].count++;
    }
    return {
      analyzedAt: Date.now(),
      accuracy: us.accuracy,
      acpl: us.acpl,
      blunders: us.blunders,
      mistakes: us.mistakes,
      inaccuracies: us.inaccuracies,
      moveCount: us.moveCount,
      phaseErrors,
      phaseAccuracy: phaseAcc,
      blunderList: blunders
    };
  }

  async function analyzePending(onProg) {
    if (busy) return;
    busy = true; stopFlag = false;
    const pending = games.filter(g => !g.analysis);
    let engineOk = true;
    try { await StockfishEngine.init(); } catch (_) { engineOk = false; }
    if (!engineOk) { busy = false; return { engineFailed: true }; }
    let done = 0;
    for (let i = 0; i < pending.length; i++) {
      if (stopFlag) break;
      const g = pending[i];
      onProg && onProg(done, pending.length, 0, 1, g);
      const an = await analyzeOne(g, (m, t) => onProg && onProg(done, pending.length, m, t, g));
      g.analysis = an;
      await put(g);
      done++;
    }
    busy = false;
    return { done, total: pending.length, stopped: stopFlag };
  }

  function stop() { stopFlag = true; }

  // ─────────────── Aggregation helpers ───────────────
  function analyzed() { return games.filter(g => g.analysis && !g.analysis.error); }
  function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
  function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
  function fmtDate(ts) { const d = new Date(ts * 1000); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); }
  function fmtIso(iso) { try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) { return iso; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ─────────────── Dashboard rendering ───────────────
  function render() {
    renderSyncBar();
    const an = analyzed();
    const body = $('#coach-dashboard');
    if (!games.length) {
      body.innerHTML = `<div class="coach-empty">Aucune partie. Lancez une synchronisation pour récupérer vos parties Chess.com.</div>`;
      return;
    }
    if (!an.length) {
      body.innerHTML = `<div class="coach-empty">${games.length} parties synchronisées. Lancez l'analyse complète pour générer votre bilan.</div>`;
      return;
    }
    body.innerHTML =
      renderTrends(an) +
      renderRepertoire(an) +
      renderWeakness(an) +
      renderPuzzleCard(an);
    bindPuzzleCard();
  }

  function renderSyncBar() {
    const bar = $('#coach-sync-bar');
    if (!bar) return;
    const pending = games.filter(g => !g.analysis).length;
    const u = getUser();
    const src = hostedInfo
      ? `<div class="coach-source">☁︎ Analyse serveur — ${fmtIso(hostedInfo.generatedAt)} · ${hostedInfo.analyzedCount}/${hostedInfo.count} parties</div>`
      : `<div class="coach-source local">Analyse locale — le service automatique n'a pas encore publié de données.</div>`;
    bar.innerHTML = `
      <div class="coach-user-row">
        <span class="coach-user-label">Compte Chess.com</span>
        <input type="text" id="coach-user-input" value="${esc(u)}" spellcheck="false" autocapitalize="off">
      </div>
      ${src}
      <div class="coach-actions">
        <button class="btn-primary" id="coach-refresh-btn">⟳ Actualiser</button>
        ${pending ? `<button class="btn-secondary" id="coach-analyze-btn">Analyser ${pending} ici</button>` : ''}
        <button class="btn-secondary" id="coach-stop-btn" hidden>Arrêter</button>
      </div>
      <div class="coach-stat-line" id="coach-stat-line">${games.length} parties · ${analyzed().length} analysées${pending ? ` · ${pending} en attente` : ''}</div>
      <a class="coach-server-link" href="${ACTIONS_URL}" target="_blank" rel="noopener">⚙ Relancer l'analyse complète (serveur)</a>
      <div class="coach-progress" id="coach-progress" hidden>
        <div class="coach-progress-bar"><div class="coach-progress-fill" id="coach-progress-fill"></div></div>
        <div class="coach-progress-text" id="coach-progress-text"></div>
      </div>`;
    $('#coach-refresh-btn').addEventListener('click', onRefresh);
    const ab = $('#coach-analyze-btn');
    if (ab) ab.addEventListener('click', onAnalyzeAll);
    $('#coach-stop-btn').addEventListener('click', () => { stop(); });
    $('#coach-user-input').addEventListener('change', (e) => setUser(e.target.value));
  }

  function donut(parts, total) {
    // parts: [{v, color}], renders a horizontal stacked bar
    if (!total) return '';
    return `<div class="coach-bar">` + parts.map(p =>
      p.v ? `<span style="width:${pct(p.v, total)}%;background:${p.color}"></span>` : '').join('') + `</div>`;
  }

  function renderTrends(an) {
    const wins = an.filter(g => g.result === 'win').length;
    const draws = an.filter(g => g.result === 'draw').length;
    const losses = an.filter(g => g.result === 'loss').length;
    const total = an.length;

    // by color
    const byColor = ['w', 'b'].map(c => {
      const gs = an.filter(g => g.userColor === c);
      return { c, n: gs.length, w: gs.filter(g => g.result === 'win').length, d: gs.filter(g => g.result === 'draw').length, l: gs.filter(g => g.result === 'loss').length };
    });
    // by time class
    const classes = {};
    an.forEach(g => { const k = g.timeClass || 'autre'; (classes[k] = classes[k] || []).push(g); });
    // by opponent strength (relative to own avg rating)
    const myAvg = avg(an.map(g => g.myRating).filter(Boolean)) || 0;
    const vsStronger = an.filter(g => g.oppRating && g.oppRating > myAvg + 25);
    const vsWeaker = an.filter(g => g.oppRating && g.oppRating < myAvg - 25);

    const ratingSvg = ratingChart(an);

    const colorRows = byColor.map(b => b.n ? `
      <div class="coach-row">
        <span class="coach-row-label">${b.c === 'w' ? '⚪ Blancs' : '⚫ Noirs'}</span>
        ${donut([{ v: b.w, color: '#56b886' }, { v: b.d, color: '#8a8aa0' }, { v: b.l, color: '#d36b6b' }], b.n)}
        <span class="coach-row-val">${pct(b.w, b.n)}%</span>
      </div>` : '').join('');

    const classRows = Object.keys(classes).map(k => {
      const gs = classes[k];
      const w = gs.filter(g => g.result === 'win').length;
      return `<div class="coach-row">
        <span class="coach-row-label">${tcLabel(k)}</span>
        ${donut([{ v: w, color: '#56b886' }, { v: gs.filter(g => g.result === 'draw').length, color: '#8a8aa0' }, { v: gs.filter(g => g.result === 'loss').length, color: '#d36b6b' }], gs.length)}
        <span class="coach-row-val">${pct(w, gs.length)}%</span>
      </div>`;
    }).join('');

    return `
    <div class="home-card coach-card">
      <h3>📈 Bilan & tendances</h3>
      <div class="coach-headline">
        <div class="coach-big"><b>${pct(wins, total)}%</b><span>victoires</span></div>
        <div class="coach-wdl">
          <span class="wdl-w">${wins}V</span> · <span class="wdl-d">${draws}N</span> · <span class="wdl-l">${losses}D</span>
          <small>${total} parties analysées · précision moy. ${Math.round(avg(an.map(g => g.analysis.accuracy)))}%</small>
        </div>
      </div>
      ${ratingSvg}
      <div class="coach-sub">Par couleur</div>
      ${colorRows}
      <div class="coach-sub">Par cadence</div>
      ${classRows}
      <div class="coach-sub">Face à l'adversité</div>
      <div class="coach-row"><span class="coach-row-label">Plus forts (+25)</span>
        ${donut([{ v: vsStronger.filter(g => g.result === 'win').length, color: '#56b886' }, { v: vsStronger.filter(g => g.result === 'draw').length, color: '#8a8aa0' }, { v: vsStronger.filter(g => g.result === 'loss').length, color: '#d36b6b' }], vsStronger.length)}
        <span class="coach-row-val">${pct(vsStronger.filter(g => g.result === 'win').length, vsStronger.length)}%</span></div>
      <div class="coach-row"><span class="coach-row-label">Plus faibles (−25)</span>
        ${donut([{ v: vsWeaker.filter(g => g.result === 'win').length, color: '#56b886' }, { v: vsWeaker.filter(g => g.result === 'draw').length, color: '#8a8aa0' }, { v: vsWeaker.filter(g => g.result === 'loss').length, color: '#d36b6b' }], vsWeaker.length)}
        <span class="coach-row-val">${pct(vsWeaker.filter(g => g.result === 'win').length, vsWeaker.length)}%</span></div>
    </div>`;
  }

  function ratingChart(an) {
    const pts = an.filter(g => g.myRating && g.rated).sort((a, b) => a.endTime - b.endTime);
    if (pts.length < 3) return '';
    const W = 320, H = 90, pad = 6;
    const ratings = pts.map(p => p.myRating);
    const min = Math.min(...ratings), max = Math.max(...ratings);
    const range = Math.max(1, max - min);
    const x = (i) => pad + (i / (pts.length - 1)) * (W - 2 * pad);
    const y = (r) => H - pad - ((r - min) / range) * (H - 2 * pad);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.myRating).toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1].myRating;
    const first = pts[0].myRating;
    const delta = last - first;
    return `<div class="coach-rating">
      <div class="coach-rating-head"><span>Évolution Elo (parties classées)</span>
        <b class="${delta >= 0 ? 'up' : 'down'}">${last} ${delta >= 0 ? '▲ +' + delta : '▼ ' + delta}</b></div>
      <svg viewBox="0 0 ${W} ${H}" class="coach-rating-svg" preserveAspectRatio="none">
        <path d="${path}" fill="none" stroke="#e2b857" stroke-width="2"/>
        <circle cx="${x(pts.length - 1)}" cy="${y(last)}" r="3" fill="#e2b857"/>
      </svg></div>`;
  }

  function tcLabel(k) {
    return { bullet: '🔥 Bullet', blitz: '⚡ Blitz', rapid: '🕐 Rapide', daily: '📅 Journalier', autre: 'Autre' }[k] || k;
  }

  function renderRepertoire(an) {
    function table(colorKey, label) {
      const gs = an.filter(g => g.userColor === colorKey && g.family && g.family !== 'Inconnue');
      const fam = {};
      gs.forEach(g => { (fam[g.family] = fam[g.family] || []).push(g); });
      const rows = Object.keys(fam).map(name => {
        const list = fam[name];
        const w = list.filter(g => g.result === 'win').length;
        const d = list.filter(g => g.result === 'draw').length;
        const l = list.filter(g => g.result === 'loss').length;
        const acc = Math.round(avg(list.map(g => g.analysis.accuracy)));
        const score = (w + d * 0.5) / list.length;
        return { name, n: list.length, w, d, l, acc, score };
      }).filter(r => r.n >= 1).sort((a, b) => b.n - a.n);
      if (!rows.length) return '';
      const worst = rows.filter(r => r.n >= 2).sort((a, b) => a.score - b.score)[0];
      const top = rows.slice(0, 6);
      return `<div class="coach-sub">${label}</div>
        <table class="coach-rep-table">
          <thead><tr><th>Ouverture</th><th>P</th><th>Bilan</th><th>Préc.</th></tr></thead>
          <tbody>${top.map(r => `<tr class="${worst && r.name === worst.name ? 'rep-weak' : ''}">
            <td>${esc(r.name)}</td><td>${r.n}</td>
            <td><span class="wdl-w">${r.w}</span>/<span class="wdl-d">${r.d}</span>/<span class="wdl-l">${r.l}</span></td>
            <td>${r.acc}%</td></tr>`).join('')}</tbody>
        </table>
        ${worst ? `<div class="coach-flag">⚠ Plus faible : <b>${esc(worst.name)}</b> (${pct(worst.w, worst.n)}% · ${worst.acc}% préc.) — à réviser.</div>` : ''}`;
    }
    return `<div class="home-card coach-card">
      <h3>📖 Répertoire d'ouvertures</h3>
      ${table('w', 'Avec les Blancs')}
      ${table('b', 'Avec les Noirs')}
    </div>`;
  }

  function renderWeakness(an) {
    const pe = { opening: 0, middle: 0, endgame: 0 };
    const pa = { opening: { total: 0, count: 0 }, middle: { total: 0, count: 0 }, endgame: { total: 0, count: 0 } };
    let totalBlunders = 0, totalMistakes = 0, totalMoves = 0;
    an.forEach(g => {
      const a = g.analysis;
      ['opening', 'middle', 'endgame'].forEach(p => {
        pe[p] += a.phaseErrors[p] || 0;
        if (a.phaseAccuracy[p]) { pa[p].total += a.phaseAccuracy[p].total; pa[p].count += a.phaseAccuracy[p].count; }
      });
      totalBlunders += a.blunders || 0;
      totalMistakes += a.mistakes || 0;
      totalMoves += a.moveCount || 0;
    });
    const phaseAcc = (p) => pa[p].count ? Math.round(pa[p].total / pa[p].count) : 0;
    const blunderRate = totalMoves ? (totalBlunders / totalMoves * 100) : 0;
    const phases = [
      { k: 'opening', label: 'Ouverture' }, { k: 'middle', label: 'Milieu de jeu' }, { k: 'endgame', label: 'Finale' }
    ].map(p => ({ ...p, errors: pe[p.k], acc: phaseAcc(p.k) }));
    const worstPhase = phases.slice().sort((a, b) => a.acc - b.acc)[0];

    // prioritized recommendations
    const recs = [];
    if (worstPhase && worstPhase.acc < 80) recs.push(`Votre <b>${worstPhase.label.toLowerCase()}</b> est votre maillon faible (${worstPhase.acc}% de précision, ${worstPhase.errors} erreurs). ${phaseAdvice(worstPhase.k)}`);
    if (blunderRate > 6) recs.push(`Vous commettez une gaffe tous les ${Math.round(100 / blunderRate)} coups environ. Avant chaque coup, vérifiez les <b>captures, échecs et pièces en prise</b> (méthode CCT).`);
    if (totalMistakes + totalBlunders > 0) recs.push(`Entraînez-vous sur vos <b>${totalMistakes + totalBlunders} erreurs réelles</b> dans la section ci-dessous — c'est le moyen le plus rapide de progresser.`);
    if (!recs.length) recs.push('Belle régularité ! Continuez à analyser et visez moins d\'imprécisions.');

    const phaseRows = phases.map(p => `
      <div class="coach-row">
        <span class="coach-row-label">${p.label}</span>
        <div class="coach-bar"><span style="width:${p.acc}%;background:${p.acc >= 85 ? '#56b886' : p.acc >= 75 ? '#e2b857' : '#d36b6b'}"></span></div>
        <span class="coach-row-val">${p.acc}% · ${p.errors} err.</span>
      </div>`).join('');

    return `<div class="home-card coach-card">
      <h3>🎯 Points à travailler</h3>
      <div class="coach-sub">Précision par phase</div>
      ${phaseRows}
      <div class="coach-metric-row">
        <div class="coach-metric"><b>${blunderRate.toFixed(1)}%</b><span>taux de gaffe</span></div>
        <div class="coach-metric"><b>${totalBlunders}</b><span>gaffes</span></div>
        <div class="coach-metric"><b>${totalMistakes}</b><span>erreurs</span></div>
      </div>
      <div class="coach-sub">Plan d'action prioritaire</div>
      <ol class="coach-recs">${recs.map(r => `<li>${r}</li>`).join('')}</ol>
    </div>`;
  }

  function phaseAdvice(k) {
    return {
      opening: 'Révisez les principes : développez vos pièces, contrôlez le centre, roquez tôt.',
      middle: 'Travaillez la tactique (puzzles quotidiens) et cherchez un plan à chaque coup.',
      endgame: 'Apprenez les finales de base : roi+pion, tours, et l\'activité du roi.'
    }[k] || '';
  }

  // ─────────────── Puzzle trainer (your own mistakes) ───────────────
  function collectPuzzles() {
    const list = [];
    analyzed().forEach(g => {
      (g.analysis.blunderList || []).forEach(b => {
        list.push({ ...b, oppName: g.oppName, endTime: g.endTime, url: g.url, userColor: g.userColor });
      });
    });
    list.sort((a, b) => b.cpLoss - a.cpLoss);
    return list;
  }

  function renderPuzzleCard(an) {
    const all = collectPuzzles();
    const counts = {
      all: all.length,
      opening: all.filter(p => p.phase === 'opening').length,
      middle: all.filter(p => p.phase === 'middle').length,
      endgame: all.filter(p => p.phase === 'endgame').length
    };
    return `<div class="home-card coach-card" id="coach-puzzle-card">
      <h3>🧩 Vos erreurs en exercices <span class="coach-count">${all.length}</span></h3>
      ${all.length ? `
      <div class="coach-puz-filters">
        ${['all', 'opening', 'middle', 'endgame'].map(f => `<button class="coach-puz-filter ${f === 'all' ? 'active' : ''}" data-f="${f}">${{ all: 'Toutes', opening: 'Ouverture', middle: 'Milieu', endgame: 'Finale' }[f]} (${counts[f]})</button>`).join('')}
      </div>
      <div id="coach-puz-stage"></div>` : `<div class="coach-empty-mini">Aucune erreur détectée — bravo !</div>`}
    </div>`;
  }

  function bindPuzzleCard() {
    const card = $('#coach-puzzle-card');
    if (!card) return;
    card.querySelectorAll('.coach-puz-filter').forEach(b => {
      b.addEventListener('click', () => {
        card.querySelectorAll('.coach-puz-filter').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        puzFilter = b.dataset.f;
        puzIdx = 0;
        loadPuzzles();
        showPuzzle();
      });
    });
    loadPuzzles();
    showPuzzle();
  }

  function loadPuzzles() {
    const all = collectPuzzles();
    puzzles = puzFilter === 'all' ? all : all.filter(p => p.phase === puzFilter);
  }

  function showPuzzle() {
    const stage = $('#coach-puz-stage');
    if (!stage) return;
    if (!puzzles.length) { stage.innerHTML = `<div class="coach-empty-mini">Aucune erreur dans cette phase.</div>`; return; }
    if (puzIdx >= puzzles.length) puzIdx = 0;
    if (puzIdx < 0) puzIdx = puzzles.length - 1;
    const p = puzzles[puzIdx];
    puzRevealed = false;
    const toMove = p.userColor === 'w' ? 'Blancs' : 'Noirs';
    stage.innerHTML = `
      <div class="coach-puz-meta">vs ${esc(p.oppName)} · ${fmtDate(p.endTime)} · ${p.type === 'blunder' ? 'Gaffe' : 'Erreur'} (−${(p.cpLoss / 100).toFixed(1)})</div>
      <div class="coach-puz-board">
        <svg viewBox="0 0 360 360" id="coach-puz-svg"></svg>
        <svg viewBox="0 0 360 360" id="coach-puz-arrows" class="arrow-overlay"></svg>
      </div>
      <div class="coach-puz-prompt">Trait aux <b>${toMove}</b>. Vous aviez joué <b>${esc(p.playedSan)}</b>. Trouvez mieux.</div>
      <div class="coach-puz-answer" id="coach-puz-answer" hidden></div>
      <div class="coach-puz-nav">
        <button class="nav-btn" id="coach-puz-prev">◀</button>
        <span class="coach-puz-counter">${puzIdx + 1} / ${puzzles.length}</span>
        <button class="btn-primary coach-puz-reveal" id="coach-puz-reveal">Voir la solution</button>
        <button class="nav-btn" id="coach-puz-next">▶</button>
      </div>`;
    BoardRenderer.setFlipped(p.userColor === 'b');
    BoardRenderer.render($('#coach-puz-svg'), p.fenBefore, null);
    BoardRenderer.clearArrows($('#coach-puz-arrows'));
    $('#coach-puz-prev').addEventListener('click', () => { puzIdx--; showPuzzle(); });
    $('#coach-puz-next').addEventListener('click', () => { puzIdx++; showPuzzle(); });
    $('#coach-puz-reveal').addEventListener('click', revealPuzzle);
  }

  function revealPuzzle() {
    if (puzRevealed) { puzIdx++; showPuzzle(); return; }
    puzRevealed = true;
    const p = puzzles[puzIdx];
    if (p.bestUci && p.bestUci.length >= 4) {
      BoardRenderer.drawArrows($('#coach-puz-arrows'), [{ from: p.bestUci.slice(0, 2), to: p.bestUci.slice(2, 4), color: '#56b886', opacity: 0.9, width: 6 }]);
    }
    const ans = $('#coach-puz-answer');
    ans.hidden = false;
    ans.innerHTML = `<b>Meilleur coup : ${esc(p.bestSan || '—')}</b>${p.tip ? `<div class="coach-puz-tip">${p.tip}</div>` : ''}`;
    const btn = $('#coach-puz-reveal');
    if (btn) btn.textContent = 'Suivant ▶';
  }

  // ─────────────── UI actions ───────────────
  function setProgress(show, ratio, text) {
    const box = $('#coach-progress');
    if (!box) return;
    box.hidden = !show;
    if (show) {
      $('#coach-progress-fill').style.width = Math.round((ratio || 0) * 100) + '%';
      $('#coach-progress-text').textContent = text || '';
    }
  }

  async function onRefresh() {
    const btn = $('#coach-refresh-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⟳ …'; }
    setProgress(true, 0, 'Mise à jour depuis le serveur…');
    const info = await loadHosted();
    try { await sync((s) => setProgress(true, 0, s)); } catch (_) {}
    games = await getAll();
    setProgress(false);
    render();
    const pending = games.filter(g => !g.analysis).length;
    flash(info
      ? `À jour — ${info.analyzedCount}/${info.count} analysées (serveur)${pending ? `, ${pending} nouvelle(s) en attente` : ''}.`
      : 'Actualisé.');
  }

  async function onSync() {
    const btn = $('#coach-sync-btn');
    btn.disabled = true; btn.textContent = '⟳ …';
    setProgress(true, 0, 'Synchronisation…');
    try {
      const r = await sync((s) => setProgress(true, 0, s));
      setProgress(false);
      render();
      flash(`${r.added} nouvelle(s) partie(s). ${r.total} au total.`);
    } catch (e) {
      setProgress(false);
      flash('Échec de la synchronisation. Vérifiez le pseudo Chess.com.', true);
      btn.disabled = false; btn.textContent = '⟳ Synchroniser';
    }
  }

  async function onAnalyzeAll() {
    const aBtn = $('#coach-analyze-btn');
    const sBtn = $('#coach-stop-btn');
    aBtn.disabled = true; sBtn.hidden = false;
    const r = await analyzePending((gi, gtotal, mi, mtotal, g) => {
      const ratio = gtotal ? (gi + (mtotal ? mi / mtotal : 0)) / gtotal : 0;
      setProgress(true, ratio, `Partie ${gi + 1}/${gtotal} · coup ${mi}/${mtotal} · vs ${g ? g.oppName : ''}`);
      // live count refresh
      const line = $('#coach-stat-line');
      if (line) line.textContent = `${games.length} parties · ${analyzed().length} analysées`;
    });
    setProgress(false);
    sBtn.hidden = true;
    if (r && r.engineFailed) { flash('Moteur Stockfish indisponible sur ce navigateur.', true); aBtn.disabled = false; return; }
    render();
    flash(r && r.stopped ? `Analyse interrompue (${r.done} faites).` : `Analyse terminée (${r ? r.done : 0} parties).`);
  }

  let flashTimer = null;
  function flash(msg, isError) {
    const el = $('#coach-flash');
    if (!el) return;
    el.textContent = msg;
    el.className = 'coach-flash' + (isError ? ' error' : '') + ' show';
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.className = 'coach-flash'; }, 4000);
  }

  // ─────────────── Entry ───────────────
  async function show() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('#screen-coach').classList.add('active');
    window.scrollTo(0, 0);
    if (!db) {
      try { db = await openDB(); games = await getAll(); } catch (_) { games = []; }
    }
    render(); // instant from local cache
    const info = await loadHosted(); // server analysis is authoritative
    if (info) { render(); }
    else if (!games.length) {
      const last = await getMeta('lastSync');
      if (!last) onSync(); // no hosted data yet → local-engine fallback
    }
  }

  function hide() {
    $('#screen-coach').classList.remove('active');
    $('#screen-import').classList.add('active');
  }

  return { show, hide };
})();
