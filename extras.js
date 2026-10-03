/* =====================================================================
   Omni — extras.js   (loaded after app.js, so it can use its helpers)
     1. Message menu  – right-click / long-press: react, edit, forward, copy, delete
     2. Reactions
     3. Emoji picker   – uses the list in emoji.js
     4. GIFs           – Omni's own GIFs (gifs/ folder), links, or your computer
   ===================================================================== */

/* ---------- 1. Message menu ---------- */
const menu = document.createElement('div');
menu.className = 'ctx-menu'; menu.id = 'ctxMenu'; menu.setAttribute('role', 'menu');
document.body.append(menu);
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];
let menuIndex = null, menuMsgEl = null, menuOpenedAt = 0;

function openMenu(msgEl, x, y) {
  const i = Number(msgEl.dataset.i), m = currentMessages()[i];
  if (!m) return;
  menuIndex = i; menuMsgEl = msgEl;
  const mine = isMine(m), canCopy = m.text || /^https:/.test(m.gif?.src || '');
  menu.innerHTML =
    `<div class="ctx-react">${QUICK_REACTIONS.map(e => `<button data-act="react" data-e="${e}" title="React ${e}">${e}</button>`).join('')}` +
    `<button data-act="more" title="More reactions" aria-label="More reactions">${icon('plus')}</button></div>` +
    `<button data-act="edit" ${mine ? '' : 'disabled'}>${icon('edit')} Edit</button>` +
    `<button data-act="forward">${icon('share')} Forward</button>` +
    `<button data-act="copy" ${canCopy ? '' : 'disabled'}>${icon('copy')} Copy ${m.text ? 'text' : 'GIF link'}</button>` +
    `<button data-act="delete" class="danger" ${mine ? '' : 'disabled'}>${icon('trash')} Delete</button>`;
  menu.style.left = '0px'; menu.style.top = '0px'; menu.classList.add('show'); menuOpenedAt = Date.now();
  // Keep the whole menu on the screen
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  menu.querySelector('button:not(:disabled)').focus({ preventScroll: true });
}
// Returns true if a menu was actually open (so Escape knows it did something)
function closeMenu() { const was = menu.classList.contains('show'); menu.classList.remove('show'); return was; }

// Right-click (also the keyboard "menu" key / Shift+F10 on a focused message)
document.addEventListener('contextmenu', e => {
  const el = e.target.closest('.chat-msg[data-i]');
  if (!el || e.target.closest('textarea')) return;
  e.preventDefault();
  let { clientX: x, clientY: y } = e;
  if (!x && !y) { const r = el.getBoundingClientRect(); x = r.left + 20; y = r.top + 20; }
  openMenu(el, x, y);
});
// Long-press on touch screens (phones / tablets)
let pressTimer = null, pressAt = null;
const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null; };
document.addEventListener('pointerdown', e => {
  if (!menu.contains(e.target)) closeMenu();                              // click outside closes it
  if (!e.target.closest('.pop, #emojiBtn, #gifBtn')) closePops();
  if (e.pointerType !== 'touch') return;
  const el = e.target.closest('.chat-msg[data-i]'); if (!el) return;
  pressAt = [e.clientX, e.clientY];
  pressTimer = setTimeout(() => { openMenu(el, pressAt[0], pressAt[1] + 12); navigator.vibrate?.(15); }, 550);
});
document.addEventListener('pointermove', e => { if (pressTimer && Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 10) cancelPress(); });
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, cancelPress));
document.addEventListener('scroll', () => { if (Date.now() - menuOpenedAt > 400) closeMenu(); }, true);   // scrolling closes it
window.addEventListener('resize', closeMenu);
window.addEventListener('blur', closeMenu);

menu.addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b || b.disabled) return;
  const i = menuIndex, el = menuMsgEl; closeMenu();
  const actions = {
    react: () => toggleReaction(i, b.dataset.e),
    more: () => openEmoji({ react: i }),
    edit: () => startEdit(i, el),
    forward: () => openForward(i),
    copy: () => copyMessage(i),
    delete: () => askDelete(i)
  };
  actions[b.dataset.act]();
});

// Edit: swap the text for a text box right inside the message
function startEdit(i, el) {
  const m = currentMessages()[i]; if (!m || !isMine(m)) return;
  const box = document.createElement('div'); box.className = 'msg-edit';
  box.innerHTML = '<textarea class="edit-input" maxlength="2000" rows="2"></textarea>' +
    '<div class="edit-actions"><span class="tiny">Enter = save · Esc = cancel</span><button class="close" data-edit="cancel">Cancel</button><button class="confirm" data-edit="save">Save</button></div>';
  const ta = box.querySelector('textarea'); ta.value = m.text || '';
  const old = el.querySelector('.msg-text');
  if (old) old.replaceWith(box); else el.querySelector('time').before(box);
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  const save = () => {
    const t = ta.value.trim();
    if (!t && !m.gif) return toast('A message can\'t be empty. Use Delete instead.');
    if (t === (m.text || '')) return renderChat();
    const clean = t ? guard(t) : '';
    if (clean === null) return;                    // blocked by the family filter
    m.text = clean; m.edited = Date.now();
    saveData(); renderChat(); renderDMs(); toast('Message edited');
    Online.edited(m);   // firebase.js (only when signed in)
  };
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); save(); }
    if (ev.key === 'Escape') { ev.stopPropagation(); renderChat(); }
  });
  box.addEventListener('click', ev => {
    const a = ev.target.closest('[data-edit]')?.dataset.edit;
    if (a === 'save') save(); else if (a === 'cancel') renderChat();
  });
}

// Delete: ask first, then remove the message completely (no "deleted" note left behind)
function askDelete(i) {
  const list = currentMessages(), m = list[i]; if (!m || !isMine(m)) return;
  const preview = m.text ? esc(m.text.slice(0, 120)) : 'GIF';
  modal('Delete this message?', 'It will disappear completely. (Only on this device for now.)',
    `<div class="modal-card wide"><span>${preview}</span></div>`, () => {
      const at = list.indexOf(m); if (at >= 0) list.splice(at, 1);   // take it out of the list
      saveData(); renderChat(); renderDMs(); toast('Message deleted');
      Online.deleted(m);
    }, 'Delete');
}

// Forward: copy the message into another channel or chat in this mode
function openForward(i) {
  const m = currentMessages()[i]; if (!m) return;
  const dests = [];
  Object.entries(data.servers).forEach(([s, sv]) => Object.keys(sv.channels).forEach(ch => {
    if (!(view.type === 'channel' && s === data.server && ch === view.id)) dests.push({ type: 'channel', server: s, id: ch, label: `${s} › ${M().dmsFirst ? '' : '#'}${ch}` });
  }));
  Object.entries(data.dms).forEach(([id, dm]) => { if (!(view.type === 'dm' && view.id === id)) dests.push({ type: 'dm', id, label: dm.name }); });
  modal('Forward message', `Pick where to send a copy (${M().name} mode).`,
    `<div class="modal-card wide fwd-list">${dests.map((d, k) => `<button class="fwd-dest" data-fwd="${k}">${icon(d.type === 'dm' ? 'at' : 'hash')}${esc(d.label)}</button>`).join('') || '<span>No other channels or chats yet.</span>'}</div>`, null, null);
  $$('.fwd-dest').forEach(b => b.onclick = () => forwardTo(m, dests[Number(b.dataset.fwd)]));
}
function forwardTo(m, d) {
  const text = m.text ? guard(m.text) : '';
  if (text === null) return;                       // forwarded text goes through the filter too
  const from = view.type === 'dm' ? '@' + (data.dms[view.id]?.name || view.id) : (M().dmsFirst ? '' : '#') + view.id;
  const copy = { text, ts: Date.now(), from: settings.name, mine: true, forwarded: { from } };
  if (m.gif) copy.gif = { ...m.gif };
  const list = d.type === 'dm' ? data.dms[d.id].msgs : data.servers[d.server].channels[d.id];
  list.push(copy);
  if (!saveData()) { list.pop(); return; }
  closeModal(); Sounds.play('send'); renderDMs(); toast('Forwarded to ' + d.label);
}

async function copyMessage(i) {
  const m = currentMessages()[i]; const t = m?.text || m?.gif?.src || '';
  try { await navigator.clipboard.writeText(t); }
  catch {   // older browsers: copy with a hidden text box
    const ta = document.createElement('textarea'); ta.value = t; document.body.append(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
  toast('Copied');
}

/* ---------- 2. Reactions ---------- */
function toggleReaction(i, emoji) {
  const m = currentMessages()[i]; if (!m) return;
  m.reactions ||= {};
  const who = m.reactions[emoji] ||= [];
  const had = who.includes('me');
  if (had) who.splice(who.indexOf('me'), 1); else who.push('me');
  if (!who.length) delete m.reactions[emoji];
  rememberEmoji(emoji);
  saveData(); renderChat();
  if (!had) Sounds.play('reaction');
}
// Click a reaction chip under a message to add/remove yours
document.addEventListener('click', e => {
  const chip = e.target.closest('.rx[data-rx]');
  if (chip) toggleReaction(Number(chip.dataset.i), chip.dataset.rx);
});

/* ---------- 3. Emoji picker ---------- */
const RECENT_KEY = 'omni_v3_emoji_recent';
let recentEmoji = load(RECENT_KEY, []);
let emojiCat = recentEmoji.length ? 'recent' : 'smileys';
let emojiReactTo = null;               // null = insert into text, number = react to that message
let emojiTarget = $('#messageInput');  // the text box emoji go into
document.addEventListener('focusin', e => { if (e.target.matches('#messageInput, .edit-input, #gifCaption')) emojiTarget = e.target; });

function rememberEmoji(e) { recentEmoji = [e, ...recentEmoji.filter(x => x !== e)].slice(0, 24); store(RECENT_KEY, recentEmoji); }

function openEmoji(opts = {}) {
  closePops();
  emojiReactTo = opts.react ?? null;
  $('#emojiSearch').value = '';
  $('#emojiPop').classList.toggle('reacting', emojiReactTo !== null);
  renderEmoji(); $('#emojiPop').classList.add('show');
  $('#emojiSearch').focus({ preventScroll: true });
}
function closePops() {
  const was = $$('.pop.show').length > 0;
  $$('.pop').forEach(p => p.classList.remove('show'));
  return was;
}
$('#emojiBtn').onclick = () => $('#emojiPop').classList.contains('show') ? closePops() : openEmoji();

function renderEmoji() {
  const q = $('#emojiSearch').value.trim().toLowerCase();
  const tabs = [['recent', '🕘', 'Recently used'], ...Object.entries(EMOJI).map(([k, c]) => [k, c.icon, c.name])];
  $('#emojiTabs').innerHTML = tabs.map(([k, icon, name]) => `<button data-ecat="${k}" class="${!q && k === emojiCat ? 'active' : ''}" title="${name}">${icon}</button>`).join('');
  let items, title;
  if (q) {
    items = Object.values(EMOJI).flatMap(c => c.items).filter(x => x.n.includes(q)).map(x => x.e);
    title = items.length ? `Results for “${q}”` : 'No emoji found';
  } else if (emojiCat === 'recent') {
    items = recentEmoji; title = items.length ? 'Recently used' : 'Recently used (none yet)';
  } else { items = EMOJI[emojiCat].items.map(x => x.e); title = EMOJI[emojiCat].name; }
  $('#emojiTitle').textContent = (emojiReactTo !== null ? 'React with… · ' : '') + title;
  const names = Object.fromEntries(Object.values(EMOJI).flatMap(c => c.items).map(x => [x.e, x.n]));
  $('#emojiGrid').innerHTML = items.map(e => `<button data-emoji="${e}" title="${esc(names[e] || '')}">${e}</button>`).join('');
}
$('#emojiSearch').oninput = renderEmoji;
$('#emojiTabs').onclick = e => { const b = e.target.closest('[data-ecat]'); if (!b) return; emojiCat = b.dataset.ecat; $('#emojiSearch').value = ''; renderEmoji(); };
$('#emojiGrid').onclick = e => { const b = e.target.closest('[data-emoji]'); if (b) pickEmoji(b.dataset.emoji); };
$('#emojiSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { const first = $('#emojiGrid [data-emoji]'); if (first) pickEmoji(first.dataset.emoji); } });

function pickEmoji(e) {
  rememberEmoji(e);
  if (emojiReactTo !== null) { toggleReaction(emojiReactTo, e); closePops(); return; }
  const el = document.contains(emojiTarget) ? emojiTarget : $('#messageInput');
  const s = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? s;
  el.value = el.value.slice(0, s) + e + el.value.slice(end);         // insert at the cursor
  el.focus(); el.setSelectionRange(s + e.length, s + e.length);
}

/* ---------- 4. GIFs ---------- */
// Omni's own GIFs: drawn with code (see README) and saved in the gifs/ folder
const OMNI_GIFS = [['thumbs-up', 'Thumbs up'], ['laughing', 'Laughing'], ['wave', 'Wave'], ['party', 'Party'], ['gg', 'GG'], ['ok', 'OK'], ['heart', 'Heart'], ['lol', 'LOL']];
const GIF_LIMIT = 1.5 * 1024 * 1024;   // 1.5 MB: localStorage only has about 5 MB for ALL of Omni

$('#gifGrid').innerHTML = OMNI_GIFS.map(([file, name]) =>
  `<button data-gif="${file}" title="${name}"><img src="gifs/${file}.gif" alt="${name}" loading="lazy"><span>${name}</span></button>`).join('');
$('#gifBtn').onclick = () => {
  if ($('#gifPop').classList.contains('show')) return closePops();
  closePops(); $('#gifPop').classList.add('show');
};
$('#gifPop').addEventListener('click', e => {
  const tab = e.target.closest('[data-gtab]');
  if (tab) {
    $$('[data-gtab]').forEach(b => b.classList.toggle('active', b === tab));
    $$('.gif-pane').forEach(p => { p.hidden = p.dataset.pane !== tab.dataset.gtab; });
    if (tab.dataset.gtab === 'search' && gifKey() && !$('#gifSearch').value.trim() && !gifFound.length) loadGifs();   // trending first
  }
  const g = e.target.closest('[data-gif]');
  if (g) sendGif({ src: `gifs/${g.dataset.gif}.gif`, alt: g.title });
});

function sendGif(gif) {
  if (view.type === 'dm' && !data.dms[view.id]) return;
  const caption = $('#gifCaption').value.trim();
  const text = caption ? guard(caption) : '';       // captions go through the family filter
  if (text === null) return;
  const list = currentMessages();
  const msg = { text, gif, ts: Date.now(), from: settings.name, mine: true };
  list.push(msg);
  if (!saveData()) { list.pop(); toast('Not enough space to save that GIF. Try a smaller one.', 4000); return; }
  Online.sent(msg);
  $('#gifCaption').value = ''; $('#gifUrl').value = '';
  closePops(); renderChat(); renderDMs();
  Sounds.play(view.type === 'dm' ? 'dm' : 'send');
}

/* Search tab: online GIFs from GIPHY (or Tenor), ONLY if a key is set in config.js.
   Opening the tab shows TRENDING GIFs; typing searches.
   Safety: GIPHY is asked for rating "g" and Tenor for contentfilter "high" (their
   strictest, family-safe settings), and your search words go through the family filter first.
   GIPHY's rules say we must show "Powered by GIPHY" wherever their GIFs appear. */
const gifKey = () => (typeof OMNI_CONFIG !== 'undefined' && OMNI_CONFIG.GIF_API_KEY) || '';
// q = search words, or '' for trending
function gifSearchURL(q) {
  const k = encodeURIComponent(gifKey()), term = encodeURIComponent(q);
  if (OMNI_CONFIG.GIF_PROVIDER === 'tenor') {
    const common = `key=${k}&client_key=omni&limit=24&contentfilter=high&media_filter=gif,tinygif`;
    return q ? `https://tenor.googleapis.com/v2/search?q=${term}&${common}` : `https://tenor.googleapis.com/v2/featured?${common}`;
  }
  return q ? `https://api.giphy.com/v1/gifs/search?api_key=${k}&q=${term}&limit=24&rating=g&lang=en&bundle=messaging_non_clips`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${k}&limit=24&rating=g&bundle=messaging_non_clips`;
}
// Turn either provider's answer into [{ src, thumb, alt }]
function gifResults(json) {
  if (OMNI_CONFIG.GIF_PROVIDER === 'tenor') return (json.results || []).map(r => ({ src: r.media_formats?.gif?.url, thumb: r.media_formats?.tinygif?.url, alt: r.content_description || 'GIF' }));
  return (json.data || []).map(r => ({ src: r.images?.fixed_height?.url, thumb: r.images?.fixed_width_small?.url || r.images?.fixed_height?.url, alt: r.title || 'GIF' }));
}
let gifFound = [];
function renderGifSearch() {
  if (!gifKey()) {
    // No key yet: show Omni's own GIFs here too, plus a note for the grown-ups
    $('#gifResults').innerHTML = $('#gifGrid').innerHTML;
    $('#gifSearch').disabled = true;
    $('#gifSearchNote').innerHTML = 'Online GIF search needs a free Giphy or Tenor key. Add it as <b>GIF_API_KEY</b> in <b>config.js</b> (see README → Going online). Until then, here are Omni\'s own GIFs.';
    return;
  }
  $('#gifSearch').disabled = false;
  const tenor = OMNI_CONFIG.GIF_PROVIDER === 'tenor';
  $('#gifSearchNote').innerHTML = `<a class="powered-by" href="${tenor ? 'https://tenor.com' : 'https://giphy.com'}" target="_blank" rel="noopener noreferrer">Powered by ${tenor ? 'Tenor' : 'GIPHY'}</a>` +
    ` · ${gifShowing === 'trending' ? 'Trending' : 'Search results'} · family-safe (rated G) only`;
}
let gifShowing = 'trending';
const searchGifs = () => loadGifs($('#gifSearch').value.trim());
async function loadGifs(q = '') {
  if (!gifKey()) return;
  if (q && Filter.apply(q, 'name').ok === false) { filterWarning('message'); return; }   // filter search words
  gifShowing = q ? 'search' : 'trending';
  $('#gifSearchNote').textContent = q ? 'Searching…' : 'Loading trending GIFs…';
  try {
    const res = await fetch(gifSearchURL(q)); if (!res.ok) throw new Error(res.status);
    gifFound = gifResults(await res.json()).filter(g => /^https:\/\//.test(g.src || ''));
    $('#gifResults').innerHTML = gifFound.map((g, k) => `<button data-gfound="${k}" title="${esc(g.alt)}"><img src="${esc(g.thumb || g.src)}" alt="${esc(g.alt)}" loading="lazy" referrerpolicy="no-referrer"></button>`).join('') || '<p class="tiny">No GIFs found.</p>';
    renderGifSearch();
  } catch { $('#gifSearchNote').textContent = 'Couldn\'t reach the GIF service (offline, or the key is wrong).'; }
}
let gifTimer = null;
$('#gifSearch').addEventListener('input', () => { clearTimeout(gifTimer); gifTimer = setTimeout(searchGifs, 450); });
$('#gifResults').addEventListener('click', e => {
  const f = e.target.closest('[data-gfound]'); if (!f) return;
  const g = gifFound[Number(f.dataset.gfound)]; if (g) sendGif({ src: g.src, alt: g.alt.slice(0, 80) });
});
renderGifSearch();

// From a link: must be https:// and end in .gif
function validGifUrl(u) { try { const x = new URL(u); return x.protocol === 'https:' && /\.gif$/i.test(x.pathname); } catch { return false; } }
$('#gifUrlSend').onclick = () => {
  const u = $('#gifUrl').value.trim();
  if (!validGifUrl(u)) return toast('Paste an https:// link that ends in .gif', 3500);
  sendGif({ src: u, alt: 'GIF from a link' });
};
$('#gifUrl').addEventListener('keydown', e => { if (e.key === 'Enter') $('#gifUrlSend').click(); });

// From your computer: saved inside the browser as a "data URL" (the picture written as text)
$('#gifFileBtn').onclick = () => $('#gifFile').click();
$('#gifFile').onchange = e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > GIF_LIMIT) {
    return modal('That GIF is too big', `It's ${(f.size / 1024 / 1024).toFixed(1)} MB. The limit is 1.5 MB.`,
      '<div class="modal-card wide"><span>GIFs from your computer are saved inside this browser, which only has about 5 MB of space for all of Omni. Try a smaller GIF, or use “From a link” instead.</span></div>', () => {}, 'OK');
  }
  const reader = new FileReader();
  reader.onload = () => {
    const url = String(reader.result);
    if (!url.startsWith('data:image/gif;base64,R0lGOD')) return toast('That file isn\'t a GIF', 3000);   // real GIFs start with "GIF8"
    const name = f.name.replace(/\.gif$/i, '').slice(0, 40);
    sendGif({ src: url, alt: Filter.apply(name, 'name').ok ? name : 'GIF' });   // file names are filtered too
  };
  reader.readAsDataURL(f);
};
// If a GIF link stops working, show a note instead of a broken picture
document.addEventListener('error', e => {
  if (e.target.matches?.('img.msg-gif')) {
    const s = document.createElement('span'); s.className = 'gif-broken'; s.textContent = 'This GIF couldn\'t load';
    e.target.replaceWith(s);
  }
}, true);
