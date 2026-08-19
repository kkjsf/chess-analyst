// Single source of truth for the app's script list, in load order.
//
// Read by TWO consumers that used to keep their own copy and drifted apart:
//   - index.html, which writes the <script> tags;
//   - sw.js, which precaches them at the exact versioned URL.
// The drift was silent and one-directional: courses.js and opening-tree.js were
// loaded but never precached (so a cold offline launch broke the Apprendre tab),
// while repertoire.js was precached but never loaded. Keep this list as the only
// place the filenames appear.
//
// `self` resolves to `window` in the page and to the worker global in sw.js.
self.APP_SCRIPTS = [
  'js/chess.min.js',
  'js/board.js',
  'js/engine.js',
  'js/openings.js',
  // tactics.js before analysis.js: analysis.js reads the board through Tactics
  // (seeOn / netGain / threats) to tell a real fork from a hanging piece.
  'js/tactics.js',
  'js/analysis.js',
  'js/training.js',
  'js/guess.js',
  'js/mates.js',
  'js/courses.js',
  'js/opening-tree.js',
  'js/replay.js',
  'js/coach.js',
  'js/app.js'
];
