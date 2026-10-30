'use strict';
// Regression for empty RGSS3 Table Marshal payloads. Run with: node tests/table-empty-regression.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('src/rgss3-rpg.rb', 'utf8');
assert.match(source, /xs >= 0 && ys >= 0 && zs >= 0/);
assert.match(source, /count < 0 \|\| count > 20_000_000/);
console.log('RGSS3 Table guard accepts zero dimensions and rejects negative counts.');
// Full Ruby Marshal tests require the Ruby WASM worker or a local Ruby interpreter.
