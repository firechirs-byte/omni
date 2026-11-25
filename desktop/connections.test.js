const test = require('node:test');
const assert = require('node:assert/strict');
const links = require('../connections.js');

function memory() {
  const data = new Map();
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
}

test('gamer names and links stay on the official sites', () => {
  assert.equal(links.cleanName('minecraft', 'Steve_1'), 'Steve_1');
  assert.equal(links.cleanName('minecraft', 'no'), null);
  assert.equal(links.cleanName('roblox', 'bad name'), null);
  assert.equal(links.cleanLink('minecraft', 'https://www.minecraft.net/en-us'), 'https://www.minecraft.net/en-us');
  assert.equal(links.cleanLink('roblox', 'https://www.roblox.com/users/1/profile'), 'https://www.roblox.com/users/1/profile');
  assert.equal(links.cleanLink('minecraft', 'https://user:pass@www.minecraft.net/'), null);
  assert.equal(links.cleanLink('minecraft', 'http://www.minecraft.net/'), null);
  assert.equal(links.cleanLink('minecraft', 'https://evilminecraft.net/'), null);
  assert.equal(links.cleanLink('roblox', 'javascript:alert(1)'), null);
  assert.equal(links.cleanLink('roblox', 'https://www.roblox.com.evil.com/'), null);
});

test('saved names stay with the Omni user who wrote them', () => {
  const store = memory();
  const saved = links.saveGame('uid-a', 'minecraft', 'Purrtion', 'https://www.minecraft.net/en-us', store);
  assert.equal(saved.ok, true);
  assert.equal(links.saveGame('uid-a', 'roblox', 'nope!', 'https://example.com', store).ok, false);
  assert.equal(links.load('uid-a', store).roblox.name, '');
  assert.equal(links.load('uid-b', store).minecraft.name, '');
  assert.equal(links.load('uid-a', store).minecraft.name, 'Purrtion');
  links.clearGame('uid-a', 'minecraft', store);
  assert.equal(links.load('uid-a', store).minecraft.name, '');
  assert.equal(links.saveGame('', 'minecraft', 'Steve_1', '', store).ok, false);
});
