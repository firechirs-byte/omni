const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the mac target is an unsigned arm64 zip, not a renamed Windows exe', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const mac = pkg.build.mac;
  assert.equal(mac.identity, null);
  assert.deepEqual(mac.target, [{ target: 'zip', arch: ['arm64'] }]);
  assert.equal(mac.artifactName.includes('.exe'), false);
  assert.match(mac.extendInfo.NSMicrophoneUsageDescription, /microphone/i);
  assert.match(mac.extendInfo.NSCameraUsageDescription, /camera/i);
  assert.match(mac.extendInfo.NSScreenCaptureUsageDescription, /screen/i);
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.match(main, /OmniOS\/Mac/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
});
