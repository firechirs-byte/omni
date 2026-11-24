const test = require('node:test');
const assert = require('node:assert/strict');
const gate = require('../auth-gate.js');

test('the website is not locked behind desktop sign-in', () => {
  assert.deepEqual(gate.decide({ desktop: false, authRestored: false, signedIn: false }), { locked: false, screen: 'app' });
});

test('desktop stays locked until auth restore finishes', () => {
  assert.deepEqual(gate.decide({ desktop: true, authRestored: false, signedIn: false }), { locked: true, screen: 'restoring' });
  assert.deepEqual(gate.decide({ desktop: true, authRestored: false, signedIn: true }), { locked: true, screen: 'restoring' });
});

test('a restored signed-in desktop session opens the app', () => {
  assert.deepEqual(gate.decide({ desktop: true, authRestored: true, signedIn: true }), { locked: false, screen: 'app' });
});

test('signed out and offline stay on the gate, with no guest entry', () => {
  assert.deepEqual(gate.decide({ desktop: true, authRestored: true, signedIn: false }), { locked: true, screen: 'login' });
  assert.deepEqual(gate.decide({ desktop: true, authRestored: true, signedIn: false, offline: true }), { locked: true, screen: 'offline' });
  const again = gate.decide({ desktop: true, authRestored: true, signedIn: false, password: 'secret' });
  assert.equal(again.screen, 'login');
  assert.equal(JSON.stringify(again).includes('secret'), false);
});
