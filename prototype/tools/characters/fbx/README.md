three.js r186's `examples/jsm/loaders/FBXLoader.js` (MIT, © 2010-2025 three.js authors), unchanged but for where it
finds three.js (the release kept in `vendor/three-r186/`), with Node's zlib in fflate's place and no NURBS curves:
only `tools/characters/car-moves.mjs` uses it, in Node, to read the owner's Mixamo movement files. Not in the game.
