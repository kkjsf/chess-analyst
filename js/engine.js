const StockfishEngine = (() => {
  const EVAL_TIMEOUT = 8000; // ms — abandon a position the engine stalls on
  let worker = null;
  let resolver = null;
  let currentLines = [];
  let ready = false;
  let failed = false;

  function init() {
    if (ready) return Promise.resolve();
    if (failed) return Promise.reject(new Error('engine_failed'));

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        failed = true;
        if (worker) { worker.terminate(); worker = null; }
        reject(new Error('timeout'));
      }, 10000);

      try {
        worker = new Worker('js/stockfish-worker.js');
      } catch (e) {
        clearTimeout(timeout);
        failed = true;
        reject(e);
        return;
      }

      worker.onerror = () => {
        clearTimeout(timeout);
        failed = true;
        if (!ready) {
          reject(new Error('worker_error'));
        } else if (resolver) {
          // Worker died mid-evaluation: settle the pending eval with null so the
          // caller falls back to a heuristic instead of hanging forever.
          const r = resolver;
          resolver = null;
          r(null);
        }
      };

      let phase = 'uci';

      worker.onmessage = (e) => {
        const msg = typeof e.data === 'string' ? e.data : String(e.data || '');

        if (msg.startsWith('error:')) {
          clearTimeout(timeout);
          failed = true;
          reject(new Error(msg));
          return;
        }

        if (phase === 'uci' && msg.includes('uciok')) {
          phase = 'ready';
          worker.postMessage('setoption name Skill Level value 20');
          worker.postMessage('setoption name MultiPV value 3');
          worker.postMessage('isready');
          return;
        }

        if (phase === 'ready' && msg.includes('readyok')) {
          phase = 'idle';
          ready = true;
          clearTimeout(timeout);
          resolve();
          return;
        }

        if (!ready || !resolver) return;

        if (msg.startsWith('info') && msg.includes(' score ')) {
          const pvIdx = msg.match(/\bmultipv (\d+)/);
          const idx = pvIdx ? parseInt(pvIdx[1]) - 1 : 0;

          const cp = msg.match(/\bscore cp (-?\d+)/);
          const mate = msg.match(/\bscore mate (-?\d+)/);
          const pv = msg.match(/\bpv\s+(.+)/);

          if (!currentLines[idx]) currentLines[idx] = { score: 0, move: null, pv: '', mate: null };

          if (cp) currentLines[idx].score = parseInt(cp[1]);
          else if (mate) {
            const m = parseInt(mate[1]);
            currentLines[idx].score = m > 0 ? 30000 - m : -30000 - m;
            currentLines[idx].mate = m;
          }
          if (pv) {
            const pvStr = pv[1].trim();
            currentLines[idx].pv = pvStr;
            currentLines[idx].move = pvStr.split(/\s+/)[0];
          }
        }

        if (msg.startsWith('bestmove')) {
          const lines = currentLines.filter(l => l != null);
          const best = lines[0] || { score: 0, move: null, pv: '', mate: null };
          const r = resolver;
          resolver = null;
          if (r) r({
            score: best.score,
            bestMove: best.move,
            pv: best.pv,
            mate: best.mate,
            lines
          });
        }
      };

      worker.postMessage('uci');
    });
  }

  function evaluate(fen, depth) {
    if (!ready) return Promise.reject(new Error('not_ready'));
    return new Promise((resolve) => {
      currentLines = [];
      let settled = false;
      let to = null;
      const finish = (val) => {
        if (settled) return;
        settled = true;
        if (to) clearTimeout(to);
        if (resolver === wrapped) resolver = null;
        resolve(val);
      };
      const wrapped = (r) => finish(r);
      resolver = wrapped;
      to = setTimeout(() => {
        // The engine stalled on this position — stop the search and hand back
        // null so analyzeGameAsync falls back to a heuristic for this move
        // instead of freezing the whole analysis at N/total.
        try { worker.postMessage('stop'); } catch (_) {}
        finish(null);
      }, EVAL_TIMEOUT);
      worker.postMessage('position fen ' + fen);
      if (typeof depth === 'string' && depth.startsWith('movetime')) {
        worker.postMessage('go ' + depth);
      } else {
        worker.postMessage('go depth ' + (depth || 18));
      }
    });
  }

  function destroy() {
    if (worker) {
      worker.postMessage('quit');
      worker.terminate();
      worker = null;
    }
    ready = false;
    failed = false;
    resolver = null;
  }

  function isReady() { return ready; }

  return { init, evaluate, destroy, isReady };
})();
