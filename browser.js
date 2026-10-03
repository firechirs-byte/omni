/* =====================================================================
   Omni — browser.js   (the mini browser side panel)
   Many big websites (Google, YouTube, Discord…) refuse to be shown inside
   another app's <iframe>. That's a safety rule called X-Frame-Options or
   frame-ancestors, and a web page can't get around it. So:
     • sites we know block it → a friendly "Open in new tab" card
     • everything else → shown in the iframe, with a hint underneath
       in case it stays blank
     • searches use DuckDuckGo's simple HTML page with safe search on
   When the family filter is on, search words are checked first.
   ===================================================================== */
const SEARCH_URL = q => 'https://html.duckduckgo.com/html/?kp=1&q=' + encodeURIComponent(q);   // kp=1 = strict safe search
// Sites that are known to refuse iframes (you can add more)
const NO_FRAME = ['google.', 'youtube.com', 'youtu.be', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'reddit.com',
  'github.com', 'discord.com', 'tiktok.com', 'amazon.', 'netflix.com', 'roblox.com', 'khanacademy.org', 'microsoft.com',
  'apple.com', 'linkedin.com', 'twitch.tv', 'spotify.com', 'bing.com', 'stackoverflow.com', 'chatgpt.com', 'openai.com',
  'minecraft.net', 'developer.mozilla.org', 'whatsapp.com', 'snapchat.com', 'pinterest.', 'duckduckgo.com/?'];
const START_LINKS = [['Wikipedia', 'https://en.m.wikipedia.org/wiki/Special:Random'], ['Simple English Wikipedia', 'https://simple.m.wikipedia.org/wiki/HTML'],
  ['Wiktionary', 'https://en.m.wiktionary.org/'], ['OpenStreetMap', 'https://www.openstreetmap.org/export/embed.html']];

const bp = { history: [], index: -1 };   // our own back/forward list (the iframe's own history is private)

function openBrowser() { $('#browserPanel').classList.add('open'); $('#browserBtn').classList.add('on'); if (bp.index < 0) showStart(); setTimeout(() => $('#bpAddress').focus(), 50); }
function closeBrowser() { $('#browserPanel').classList.remove('open'); $('#browserBtn').classList.remove('on'); }
$('#browserBtn').onclick = () => $('#browserPanel').classList.contains('open') ? closeBrowser() : openBrowser();
$('#bpClose').onclick = closeBrowser;

// What did they type? A web address, or words to search for?
function toURL(input) {
  const t = input.trim(); if (!t) return null;
  if (/^https?:\/\//i.test(t)) { try { return { url: new URL(t).href }; } catch { return null; } }
  if (/^[a-z]+:/i.test(t) && !/^[\w.-]+:\d+/.test(t)) return { bad: true };          // javascript:, file:, data: … not allowed
  if (!/\s/.test(t) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t)) return { url: 'https://' + t };
  return { search: t };
}
// YouTube videos can use the special "embed" address, which IS allowed in an iframe
function friendlier(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  return m ? 'https://www.youtube-nocookie.com/embed/' + m[1] : url;
}
// Does this address match the NO_FRAME list? 'google.' = any google.xyz, 'x.com' = x.com and its subdomains,
// 'duckduckgo.com/?' = only that exact page (html.duckduckgo.com is fine)
function blocksFrames(url) {
  const u = new URL(url), host = u.hostname.replace(/^www\./, ''), full = host + u.pathname + u.search;
  return NO_FRAME.some(d => d.includes('/') ? full.startsWith(d)
    : d.endsWith('.') ? host.startsWith(d) || host.includes('.' + d)
    : host === d || host.endsWith('.' + d));
}

function go(input, addToHistory = true) {
  const r = toURL(input);
  if (!r) return;
  if (r.bad) return toast('Only http:// and https:// web addresses work here', 3000);
  let url = r.url;
  if (r.search !== undefined) {
    // family filter: search words get the same check as names (blocked, not starred)
    if (!Filter.apply(r.search, 'name').ok) { filterWarning('message'); return; }
    url = SEARCH_URL(r.search);
  }
  url = friendlier(url);
  if (addToHistory) { bp.history = bp.history.slice(0, bp.index + 1); bp.history.push(url); bp.index = bp.history.length - 1; }
  show(url);
}
function show(url) {
  $('#bpAddress').value = url.startsWith('https://html.duckduckgo.com/') ? decodeURIComponent(new URL(url).searchParams.get('q') || '') : url;
  updateButtons();
  if (blocksFrames(url)) return showBlocked(url);
  $('#bpHint').hidden = false;
  // sandbox = the page can run, but can't take over Omni or open pop-ups without asking
  $('#bpBody').innerHTML = `<iframe id="bpFrame" title="Mini browser" src="${esc(url)}" referrerpolicy="no-referrer" ` +
    `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" allow="fullscreen"></iframe>`;
}
function showStart() {
  bp.history = []; bp.index = -1; updateButtons(); $('#bpAddress').value = ''; $('#bpHint').hidden = true;
  $('#bpBody').innerHTML = `<div class="bp-start"><h3>Mini browser</h3><p>Type a web address, or some words to search with DuckDuckGo (safe search on).` +
    ` Big sites like Google and YouTube don't allow being opened inside other apps, so Omni gives you an <b>Open in new tab</b> button for those.</p>` +
    `<div class="bp-links">${START_LINKS.map(([n, u]) => `<button data-bp-go="${esc(u)}">${esc(n)}</button>`).join('')}</div></div>`;
}
function showBlocked(url) {
  $('#bpHint').hidden = true;
  const host = new URL(url).hostname.replace(/^www\./, '');
  $('#bpBody').innerHTML = `<div class="bp-blocked"><h3>This site can't open inside Omni</h3>` +
    `<p><b>${esc(host)}</b> doesn't allow other apps to show it (a safety rule websites can set). You can still open it in a normal browser tab.</p>` +
    `<button class="confirm" id="bpOpenTab">${icon('external')} Open in new tab</button></div>`;
  $('#bpOpenTab').onclick = () => openExternal(url);
}
function openExternal(url = bp.history[bp.index]) {
  if (!url) return toast('Nothing to open yet');
  window.open(url, '_blank', 'noopener,noreferrer');
}
function updateButtons() {
  $('#bpBack').disabled = bp.index <= 0;
  $('#bpForward').disabled = bp.index >= bp.history.length - 1;
  $('#bpReload').disabled = $('#bpExternal').disabled = bp.index < 0;
}
$('#bpForm').onsubmit = e => { e.preventDefault(); go($('#bpAddress').value); };
$('#bpBack').onclick = () => { if (bp.index > 0) show(bp.history[--bp.index]); };
$('#bpForward').onclick = () => { if (bp.index < bp.history.length - 1) show(bp.history[++bp.index]); };
$('#bpReload').onclick = () => { if (bp.index >= 0) show(bp.history[bp.index]); };
$('#bpExternal').onclick = () => openExternal();
$('#bpBody').addEventListener('click', e => { const b = e.target.closest('[data-bp-go]'); if (b) go(b.dataset.bpGo); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#browserPanel').classList.contains('open') && !document.querySelector('.modal-backdrop[style*="grid"]')) closeBrowser(); });
updateButtons();
