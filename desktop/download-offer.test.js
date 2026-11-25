const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const offerApi = require('../download-offer.js');

test('the shipped download page does not invent a file', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'download-config.json'), 'utf8'));
  const result = offerApi.offer(config);
  assert.equal(result.available, false);
  assert.equal(result.url, '');
  assert.equal(result.label, 'Download is not published yet');
});

test('a download link needs https, a version, and a checksum', () => {
  const good = offerApi.offer({
    enabled: true,
    url: 'https://example.com/Omni-win.zip',
    version: '4.3.5',
    sha256: 'ab'.repeat(32)
  });
  assert.equal(good.available, true);
  assert.equal(good.url, 'https://example.com/Omni-win.zip');
  const http = offerApi.offer({ enabled: true, url: 'http://example.com/a.zip', version: '1.2.3', sha256: 'ab'.repeat(32) });
  assert.equal(http.available, false);
  const token = offerApi.offer({ enabled: true, url: 'https://user:secret@example.com/a.zip', version: '1.2.3', sha256: 'cd'.repeat(32) });
  assert.equal(token.available, false);
  const page = fs.readFileSync(path.join(__dirname, '..', 'download.html'), 'utf8');
  assert.equal(page.includes('index.html'), false);
  assert.equal(page.includes('testimonial'), false);
});
