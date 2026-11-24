const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'sounds.js'), 'utf8');

test('cues stay short and quiet', () => {
  const levels = [...src.matchAll(/level:\s*([0-9.]+)/g)].map(match => Number(match[1]));
  assert.ok(levels.length >= 4);
  assert.ok(levels.every(level => level <= 0.1), 'levels ' + levels.join(','));
  assert.equal(src.includes("wave: 'square'"), false);
  const tails = [...src.matchAll(/tail:\s*([0-9.]+)/g)].map(match => Number(match[1]));
  assert.ok(tails.every(tail => tail <= 0.16), 'tails ' + tails.join(','));
  assert.match(src, /volume:\s*32/);
  assert.match(src, /nowClock < busyUntil/);
});

test('leaving a lounge hangs up the call', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(app, /function leaveCall/);
  assert.match(app, /function enterLounge/);
  assert.match(app, /dataset\.room !== undefined\) enterLounge/);
  assert.match(app, /\$\('#leaveBtn'\)\.onclick = \(\) => leaveCall\(\)/);
  assert.match(app, /stopTracks\(screen\); stopTracks\(media\)/);
  assert.match(app, /if \(room === i\) \{ leaveCall\(\); return; \}/);
  assert.match(app, /Could not join the lounge/);
  assert.equal(app.includes("You left the meeting"), false);
});
