// Stockfish worker. Lives in js/vendor/ ON PURPOSE: the WebAssembly build asks
// for "stockfish.wasm" as a bare relative path (its own locateFile returns the
// filename verbatim, ignoring scriptDirectory), so the file only resolves when
// the worker sits in the same folder as the build.
//
// The wasm build is ~11x faster than the asm.js one on the same hardware
// (374k n/s vs 33k n/s, MultiPV 3), which is worth about four extra plies at
// the movetime budgets the app uses. asm.js stays as the fallback for a browser
// without WebAssembly; it is not precached, so nobody pays for it in practice.
try {
  if (typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function') {
    importScripts('stockfish.wasm.js');
  } else {
    importScripts('stockfish.js');
  }
} catch (_) {
  try { importScripts('stockfish.js'); }
  catch (_) { postMessage('error:load_failed'); }
}
