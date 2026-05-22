try {
  importScripts('vendor/stockfish.js');
} catch (_) {
  postMessage('error:load_failed');
}
