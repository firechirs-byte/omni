const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const gate = require('../auth-gate.js');

test('Create account opens above the desktop login screen', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  const gateRule = css.match(/body\.desktop-locked \.desktop-gate\{[^}]*z-index:\s*(\d+)/);
  const modalRule = css.match(/body\.desktop-locked \.modal-backdrop\{[^}]*z-index:\s*(\d+)/);
  assert.ok(gateRule && modalRule);
  assert.ok(Number(modalRule[1]) > Number(gateRule[1]));
  const firebase = fs.readFileSync(path.join(__dirname, '..', 'firebase.js'), 'utf8');
  assert.match(firebase, /\$\('#desktopNew'\)\.onclick = \(\) => openSignUp\(\)/);
});

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
