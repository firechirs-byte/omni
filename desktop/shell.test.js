const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('all four modes share a dark shell and start in the chat layout', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const modes = src.slice(src.indexOf('const MODES'), src.indexOf('const SCHEMES'));
  assert.equal(modes.includes("layout: 'meeting'"), false);
  assert.equal((modes.match(/layout: 'chat'/g) || []).length, 4);
  assert.equal((modes.match(/bg: '#121417'/g) || []).length, 4);
  assert.equal((modes.match(/panel: '#1c1f24'/g) || []).length, 4);
  assert.equal(modes.includes('#fff'), false);
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  assert.match(css, /body:not\(\.people-open\) \.right\{display:none\}/);
  assert.match(css, /body:not\(\.board-open\) \.bottom-stage\{display:none\}/);
  assert.match(css, /body\.layout-chat \.meeting\.in-call \.video-grid\{display:grid/);
});
