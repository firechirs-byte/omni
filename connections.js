/* Self-reported Minecraft and Roblox names. Not checked with those companies.
   Saved on this device under the signed-in Omni user id. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OmniConnections = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const GAMES = ['minecraft', 'roblox'];
  const NAME = { minecraft: /^[A-Za-z0-9_]{3,16}$/, roblox: /^[A-Za-z0-9_]{3,20}$/ };
  const HOSTS = {
    minecraft: ['minecraft.net', 'www.minecraft.net'],
    roblox: ['roblox.com', 'www.roblox.com']
  };
  const blank = () => ({ minecraft: { name: '', url: '' }, roblox: { name: '', url: '' } });
  const key = uid => 'omni_v4_connections_' + uid;
  function cleanName(game, raw) {
    const s = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!s) return '';
    return NAME[game] && NAME[game].test(s) ? s : null;
  }
  function cleanLink(game, raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    let url;
    try { url = new URL(s); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!HOSTS[game] || !HOSTS[game].includes(url.hostname.toLowerCase())) return null;
    return url.href;
  }
  function normalize(input) {
    const out = blank();
    for (const game of GAMES) {
      const row = input && input[game] ? input[game] : {};
      const name = cleanName(game, row.name);
      const url = cleanLink(game, row.url);
      if (name === null || url === null) return null;
      out[game] = { name, url };
    }
    return out;
  }
  function load(uid, storage) {
    if (!uid || !storage) return blank();
    try { return normalize(JSON.parse(storage.getItem(key(uid)) || 'null')) || blank(); }
    catch { return blank(); }
  }
  function saveGame(uid, game, name, url, storage) {
    if (!uid || !storage) return { ok: false, error: 'Sign in first.' };
    if (!GAMES.includes(game)) return { ok: false, error: 'That game is not listed.' };
    const next = load(uid, storage);
    const cleanN = cleanName(game, name);
    const cleanU = cleanLink(game, url);
    if (cleanN === null || cleanU === null) return { ok: false, error: 'Use a normal game name, and an https link on the official site only.' };
    if (!cleanN && cleanU) return { ok: false, error: 'Add the gamer name as well as the link.' };
    next[game] = { name: cleanN, url: cleanU };
    storage.setItem(key(uid), JSON.stringify(next));
    return { ok: true, data: next };
  }
  function clearGame(uid, game, storage) {
    const data = load(uid, storage);
    if (!GAMES.includes(game)) return data;
    data[game] = { name: '', url: '' };
    if (uid && storage) storage.setItem(key(uid), JSON.stringify(data));
    return data;
  }
  return { GAMES, HOSTS, cleanName, cleanLink, load, saveGame, clearGame, blank, key };
});
