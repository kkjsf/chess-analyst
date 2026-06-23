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
  async function analyzeOne(g, onMove) {
    const moves = Analyzer.parsePgnMoves(g.pgn);
    if (!moves.length) return { error: 'pgn' };
    const results = await Analyzer.analyzeGameAsync(new Chess(), moves, onMove, BULK_MOVETIME);
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

  // Feed every analyzed game's mistakes into the spaced-repetition trainer
  // (Mode entraînement), so the SRS deck draws on your whole archive — not
  // only games opened one-by-one in the analyzer.
  function syncToTraining() {
    if (typeof Training === 'undefined' || !Training.ingestGame) return 0;
    const user = getUser();
    let added = 0;
    analyzed().forEach(g => {
      const bl = (g.analysis && g.analysis.blunderList) || [];
      if (!bl.length) return;
      const white = g.userColor === 'w' ? user : g.oppName;
      const black = g.userColor === 'w' ? g.oppName : user;
      const date = g.endTime ? new Date(g.endTime * 1000).toLocaleDateString('fr-FR') : '';
      added += Training.ingestGame(g.uuid, bl, { side: g.userColor, white, black, date }) || 0;
    });
    if (added && typeof App !== 'undefined' && App.refreshHome) App.refreshHome();
    return added;
  }

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
      renderNarrative(an) +
      renderTrends(an) +
      renderRepertoire(an) +
      renderWeakness(an) +
      renderGamesDrill(an) +
      renderTrainingCta();
    bindTrainingCta();
    bindGamesDrill();
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

  function renderNarrative(an) {
    const total = an.length;
    const wins = an.filter(g => g.result === 'win').length;
    const winPct = pct(wins, total);
    const acc = Math.round(avg(an.map(g => g.analysis.accuracy)));
    const w = an.filter(g => g.userColor === 'w'), b = an.filter(g => g.userColor === 'b');
    const wP = pct(w.filter(g => g.result === 'win').length, w.length);
    const bP = pct(b.filter(g => g.result === 'win').length, b.length);
    const pa = { opening: { t: 0, c: 0 }, middle: { t: 0, c: 0 }, endgame: { t: 0, c: 0 } };
    let bl = 0, mv = 0;
    an.forEach(g => {
      ['opening', 'middle', 'endgame'].forEach(p => { if (g.analysis.phaseAccuracy[p]) { pa[p].t += g.analysis.phaseAccuracy[p].total; pa[p].c += g.analysis.phaseAccuracy[p].count; } });
      bl += g.analysis.blunders || 0; mv += g.analysis.moveCount || 0;
    });
    const pAcc = p => pa[p].c ? Math.round(pa[p].t / pa[p].c) : 0;
    const phases = [{ k: 'opening', l: "l'ouverture" }, { k: 'middle', l: 'le milieu de jeu' }, { k: 'endgame', l: 'la finale' }].map(p => ({ ...p, a: pAcc(p.k) }));
    const best = phases.slice().sort((x, y) => y.a - x.a)[0];
    const worst = phases.slice().sort((x, y) => x.a - y.a)[0];
    const blRate = mv ? bl / mv * 100 : 0;
    const sorted = an.slice().sort((x, y) => x.endTime - y.endTime);
    const recent = sorted.slice(-10), prior = sorted.slice(-20, -10);
    const recentWin = pct(recent.filter(g => g.result === 'win').length, recent.length);
    const priorWin = prior.length ? pct(prior.filter(g => g.result === 'win').length, prior.length) : null;

    const s = [];
    s.push(`Sur vos <b>${total} parties</b> analysées, vous l'emportez dans <b>${winPct}%</b> des cas, avec une précision moyenne de <b>${acc}%</b>.`);
    if (w.length && b.length && Math.abs(wP - bP) >= 12)
      s.push(`Vous êtes nettement plus à l'aise avec les <b>${wP > bP ? 'Blancs' : 'Noirs'}</b> (${Math.max(wP, bP)}% de victoires, contre ${Math.min(wP, bP)}% de l'autre côté) — un répertoire à consolider du côté faible.`);
    s.push(`Votre point fort est <b>${best.l}</b> (${best.a}% de précision) ; à l'inverse, <b>${worst.l}</b> est votre maillon faible (${worst.a}%). ${phaseAdvice(worst.k)}`);
    if (blRate > 0)
      s.push(`Vous lâchez une erreur grave environ tous les <b>${Math.round(100 / Math.max(blRate, 0.1))} coups</b> : réduire ces gaffes est de loin le levier n°1 pour gagner des points.`);
    if (priorWin !== null && Math.abs(recentWin - priorWin) >= 10)
      s.push(`Tendance récente : vous <b>${recentWin > priorWin ? 'progressez' : 'marquez le pas'}</b> (${recentWin}% sur vos 10 dernières parties contre ${priorWin}% auparavant).`);
    s.push(`Concrètement : ouvrez le <b>Mode entraînement</b> ci-dessous (vos erreurs y deviennent des exercices) et relisez vos parties perdues dans <b>${worst.l}</b>.`);

    return `<div class="home-card coach-card coach-narrative"><h3>📋 Le mot du coach</h3><p>${s.join(' ')}</p></div>`;
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

  // ─────────────── Training entry (unified SRS trainer) ───────────────
  // Coach feeds every analysed game into the single Mode entraînement deck
  // (see syncToTraining). Rather than duplicate a puzzle player here, just
  // surface the deck and link to it.
  function renderTrainingCta() {
    let due = 0;
    try { if (typeof Training !== 'undefined' && Training.dueCount) due = Training.dueCount(); } catch (_) {}
    const line = due
      ? `<b>${due} exercice${due > 1 ? 's' : ''}</b> à réviser.`
      : 'Rien à réviser pour l\'instant — beau travail !';
    return `<div class="home-card coach-card" id="coach-training-cta">
      <h3>🧩 Entraînement</h3>
      <p class="coach-puz-intro">Toutes vos erreurs alimentent un seul entraînement, en répétition espacée. ${line}</p>
      <button class="btn-primary" id="coach-open-training">🎯 Ouvrir le Mode entraînement</button>
    </div>`;
  }

  function bindTrainingCta() {
    const b = $('#coach-open-training');
    if (b) b.addEventListener('click', () => { if (typeof Training !== 'undefined') Training.show(); });
  }

  // Replay one archive game's own mistakes as a focused "Devine le coup" drill.
  // Archive games aren't in the analyzer's localStorage cache, so we rebuild a
  // sparse, ply-indexed analysis array from the stored blunderList and hand it
  // to GuessMove's focused mode.
  function renderGamesDrill(an) {
    if (typeof GuessMove === 'undefined') return '';
    const withErr = an
      .filter(g => g.analysis.blunderList && g.analysis.blunderList.length)
      .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))
      .slice(0, 8);
    if (!withErr.length) return '';
    const resLbl = { win: 'V', draw: 'N', loss: 'D' };
    const rows = withErr.map(g => {
      const n = g.analysis.blunderList.length;
      return `<div class="coach-drill-row">
        <span class="coach-drill-res ${g.result || 'draw'}">${resLbl[g.result] || '·'}</span>
        <span class="coach-drill-opp">${esc(g.oppName)}</span>
        <span class="coach-drill-date">${g.endTime ? fmtDate(g.endTime) : ''}</span>
        <span class="coach-drill-count">${n} erreur${n > 1 ? 's' : ''}</span>
        <button class="coach-drill-btn" data-uuid="${esc(g.uuid)}">🎯 Rejouer</button>
      </div>`;
    }).join('');
    return `<div class="home-card coach-card" id="coach-games-drill">
      <h3>🎯 Rejoue tes erreurs partie par partie</h3>
      <p class="coach-puz-intro">Reprends une partie récente et retrouve le bon coup à chacune de tes erreurs.</p>
      ${rows}
    </div>`;
  }

  function bindGamesDrill() {
    document.querySelectorAll('#coach-games-drill .coach-drill-btn').forEach(b =>
      b.addEventListener('click', () => drillGame(b.dataset.uuid)));
  }

  function drillGame(uuid) {
    if (typeof GuessMove === 'undefined') return;
    const g = games.find(x => x.uuid === uuid);
    const bl = g && g.analysis && g.analysis.blunderList;
    if (!bl || !bl.length) return;
    const side = g.userColor;
    const analysis = [];
    const indices = [];
    for (const b of bl) {
      if (b.ply == null || !b.fenBefore || !b.bestUci) continue;
      let from = null, to = null;
      try {
        const c = new Chess(b.fenBefore);
        let mv = c.move(b.playedSan, { sloppy: true });
        if (!mv && b.playedSan) {
          const en = b.playedSan.replace(/[CFTDR]/g, x => ({ C: 'N', F: 'B', T: 'R', D: 'Q', R: 'K' }[x]));
          mv = c.move(en, { sloppy: true });
        }
        if (mv) { from = mv.from; to = mv.to; }
      } catch (_) {}
      analysis[b.ply] = {
        move: { color: side, from, to, san: b.playedSan },
        fenBefore: b.fenBefore, sanFr: b.playedSan,
        bestUci: b.bestUci, bestSan: b.bestSan || '', type: b.type
      };
      indices.push(b.ply);
    }
    if (!indices.length) return;
    GuessMove.start(analysis, null, side, { indices, title: '🎯 Tes erreurs vs ' + (g.oppName || '?') });
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
    syncToTraining();
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
    syncToTraining();
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
    syncToTraining();
  }

  function hide() {
    $('#screen-coach').classList.remove('active');
    $('#screen-import').classList.add('active');
  }

  return { show, hide };
})();
