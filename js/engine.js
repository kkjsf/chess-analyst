const StockfishEngine = (() => {
  const EVAL_TIMEOUT = 8000; // ms — abandon a position the engine stalls on
  const DRAIN_TIMEOUT = 3000; // ms — grace for an aborted search's late bestmove
  let worker = null;
  let currentLines = [];
  let ready = false;
  let failed = false;

  // UCI is a serial protocol: every `go` produces exactly ONE `bestmove`. So we
  // keep a single slot for the search the engine is actually running and match
  // replies to it one-to-one.
  //
  // Without that pairing, a search abandoned on EVAL_TIMEOUT still emitted its
  // bestmove, and the NEXT caller picked it up — shifting every following
  // evaluation by one position (and handing one move an empty {score:0,
  // lines:[]}, which reads as a free ★ Best at 100% accuracy because it isn't
  // null and so never triggers the heuristic fallback).
  let active = null;   // { id, deliver } — the in-flight search, or null
  let searchId = 0;
  // evaluate() calls run strictly one at a time: a new `position` is never
  // posted while a previous search still owes us its bestmove.
  let chain = Promise.resolve();

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
        // In js/vendor/ so the wasm build can find stockfish.wasm next to it.
        worker = new Worker('js/vendor/stockfish-worker.js');
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
        } else if (active) {
          // Worker died mid-evaluation: settle the pending eval with null so the
          // caller falls back to a heuristic instead of hanging forever.
          const cur = active;
          active = null;
          cur.deliver(null);
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
          // 5, not 3. analysis.js scores the played move from its line INSIDE
          // the pre-move search (so the best move loses exactly 0 and we don't
          // compare two independent searches). Outside the top N it falls back
          // to the noisy path — and at 350 Elo the move played is outside the
          // top 3 more often than not. The wasm build absorbs the extra cost.
          worker.postMessage('setoption name MultiPV value 5');
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

        // No search in flight — anything arriving now is trailing output from a
        // search nobody is waiting for. Dropping it keeps currentLines clean for
        // whoever calls next.
        if (!ready || !active) return;

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
          // This reply belongs to `active` and to nothing else — hand it over,
          // free the slot, and reset the line buffer for the next search.
          const lines = currentLines.filter(l => l != null);
          const cur = active;
          active = null;
          currentLines = [];
          cur.deliver(lines);
        }
      };

      worker.postMessage('uci');
    });
  }

  function evaluate(fen, depth) {
    if (!ready) return Promise.reject(new Error('not_ready'));

    const run = () => new Promise((resolve) => {
      if (!ready) { resolve(null); return; }
      const id = ++searchId;
      let abandoned = false;      // EVAL_TIMEOUT fired; we no longer want the result
      let evalTo = null, drainTo = null;

      // Called exactly once, with the bestmove that belongs to THIS search.
      const deliver = (lines) => {
        if (evalTo) clearTimeout(evalTo);
        if (drainTo) clearTimeout(drainTo);
        if (abandoned || !lines) { resolve(null); return; }
        const best = lines[0] || { score: 0, move: null, pv: '', mate: null };
        resolve({
          score: best.score,
          bestMove: best.move,
          pv: best.pv,
          mate: best.mate,
          lines
        });
      };

      currentLines = [];
      active = { id, deliver };

      evalTo = setTimeout(() => {
        // The engine stalled on this position. Abort the search, but DON'T
        // resolve yet: we hold the slot until its bestmove lands, so the reply
        // can't leak into the next position. Stockfish answers `stop` in a few
        // milliseconds, so this costs nothing in practice.
        abandoned = true;
        try { worker.postMessage('stop'); } catch (_) {}
        drainTo = setTimeout(() => {
          // Not even a bestmove after `stop` — the engine is wedged. Release
          // the slot and hand back null; the caller falls back to a heuristic
          // for this move rather than freezing the whole analysis.
          if (active && active.id === id) active = null;
          resolve(null);
        }, DRAIN_TIMEOUT);
      }, EVAL_TIMEOUT);

      worker.postMessage('position fen ' + fen);
      if (typeof depth === 'string' && depth.startsWith('movetime')) {
        worker.postMessage('go ' + depth);
      } else {
        worker.postMessage('go depth ' + (depth || 18));
      }
    });

    // Queue behind any search still in flight. Serialising is what makes the
    // one-to-one pairing above hold: a `position` command is never sent while
    // the engine still owes a bestmove.
    chain = chain.then(run, run);
    return chain;
  }

  function destroy() {
    if (worker) {
      worker.postMessage('quit');
      worker.terminate();
      worker = null;
    }
    ready = false;
    failed = false;
    if (active) { const cur = active; active = null; cur.deliver(null); }
    chain = Promise.resolve();
    currentLines = [];
  }

  function isReady() { return ready; }

  return { init, evaluate, destroy, isReady };
})();
