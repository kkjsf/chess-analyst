var Module = { locateFile: function(f) { return 'vendor/' + f; } };

try {
  if (typeof WebAssembly === 'object') {
    importScripts('vendor/stockfish.wasm.js');
  } else {
    importScripts('vendor/stockfish.js');
  }
} catch (_) {
  try { importScripts('vendor/stockfish.js'); } catch (_) {
    postMessage('error:load_failed');
  }
}
