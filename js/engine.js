const StockfishEngine = (() => {
  let worker = null;
  let resolver = null;
  let currentResult = null;
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
        reject(new Error('worker_error'));
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
          const cp = msg.match(/\bscore cp (-?\d+)/);
          const mate = msg.match(/\bscore mate (-?\d+)/);
          const pv = msg.match(/\bpv\s+(.+)/);

          if (cp) currentResult.score = parseInt(cp[1]);
          else if (mate) {
            const m = parseInt(mate[1]);
            currentResult.score = m > 0 ? 30000 - m : -30000 - m;
            currentResult.mate = m;
          }
          if (pv) currentResult.pv = pv[1].trim();
        }

        if (msg.startsWith('bestmove')) {
          const bm = msg.match(/bestmove\s+(\S+)/);
          if (bm && bm[1] !== '(none)') currentResult.bestMove = bm[1];
          const r = resolver;
          resolver = null;
          r(currentResult);
        }
      };

      worker.postMessage('uci');
    });
  }

  function evaluate(fen, depth) {
    if (!ready) return Promise.reject(new Error('not_ready'));
    return new Promise((resolve) => {
      currentResult = { score: 0, bestMove: null, pv: '', mate: null };
      resolver = resolve;
      worker.postMessage('position fen ' + fen);
      worker.postMessage('go depth ' + (depth || 12));
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
