/* Decides whether the download page may offer a file. No network. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OmniDownload = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function offer(config) {
    const src = config || {};
    const unavailable = { available: false, url: '', version: '', sha256: '', label: 'Download is not published yet' };
    if (src.enabled !== true) return unavailable;
    let url;
    try { url = new URL(String(src.url || '')); } catch { return unavailable; }
    if (url.protocol !== 'https:' || url.username || url.password) return unavailable;
    if (!/^\d+\.\d+\.\d+$/.test(String(src.version || ''))) return unavailable;
    const sha = String(src.sha256 || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha)) return unavailable;
    return { available: true, url: url.href, version: src.version, sha256: sha, label: 'Download Omni ' + src.version + ' zip' };
  }
  return { offer };
});
