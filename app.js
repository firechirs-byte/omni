/* =====================================================================
   Omni — app.js   (plain JavaScript, no frameworks, no build step)

   Map of this file:
     1. MODES      – the 4 modes: channels, words, panels, default look
     2. FONTS      – font choices for the Customize panel
     3. Storage    – saving and loading with localStorage
     4. Theme      – turning a theme object into CSS variables
     5. Rendering  – drawing the sidebar, chat and panels
     6. Actions    – sending messages, adding channels, search, settings…
     7. Media      – microphone, camera and screen sharing
     8. Whiteboard
     9. Customize panel
    10. Welcome screen + mode switching
    11. Install as an app, offline + updates (service worker)
   Other files: config.js (online keys, empty = local only), sounds.js,
   filter.js + filter-words.js (family word filter), emoji.js, icons.js
   (Omni's own SVG icons), media.js (profile picture, background picture,
   colour matching), extras.js (message menu, emoji picker, GIFs),
   safety.js (parent filter screens), browser.js (mini browser),
   firebase.js (going online, optional) and assistant.js (Ask Omni).
   ===================================================================== */

/* Omni's version number. When you release a change, bump this AND the
   CACHE name in sw.js, so everyone gets the "Update available" banner. */
const APP_VERSION = '4.3.8';
/* Set by the Windows shell (desktop/main.js). The website never sends this. */
const DESKTOP = /\bOmniDesktop\//.test(navigator.userAgent);
const PUBLIC_WEB_URL = 'https://firechirs-byte.github.io/omni/';

/* The app's name lives in ONE place: APP_NAME in config.js. The page is written
   with "Omni"; named() swaps it for APP_NAME in the page, pop-ups and toasts. */
const NAME = typeof APP_NAME === 'string' && APP_NAME.trim() ? APP_NAME.trim() : 'Omni';
const named = s => NAME === 'Omni' || typeof s !== 'string' ? s : s.replace(/\bOmni\b/g, NAME);
function applyAppName(root = document) {
  document.title = named(document.title);
  if (NAME === 'Omni') return;
  const walk = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue.includes('Omni')) n.nodeValue = named(n.nodeValue);
  (root.body || root).querySelectorAll('[title],[aria-label],[placeholder]').forEach(el =>
    ['title', 'aria-label', 'placeholder'].forEach(a => { const v = el.getAttribute(a); if (v && v.includes('Omni')) el.setAttribute(a, named(v)); }));
  $('meta[name="description"]').content = named($('meta[name="description"]').content);
}

/* ---------- 1. MODES ----------
   Want a 5th mode? Copy one of these blocks, give it a new key, and
   it will appear in the mode picker automatically. */
const ALL_PANELS = ['meeting', 'people', 'breakouts', 'chat', 'extra', 'whiteboard', 'files'];

const MODES = {
  gaming: {
    name: 'Gaming', icon: 'gamepad',
    tagline: 'Squads, parties and voice-first hangouts. Dark, sharp and fast.',
    servers: ['Squad HQ', 'Minecraft Crew', 'Speedrun Club'],
    channelIcon: 'hash',
    channels: [
      { id: 'lfg', icon: 'target', topic: 'Looking for group: post what you want to play and when.' },
      { id: 'voice-lounge', icon: 'volume', topic: 'Hop in voice and hang out with your squad.' },
      { id: 'clips', icon: 'film', topic: 'Share your best plays and highlights.' },
      { id: 'general', icon: 'hash', topic: 'Chat about anything (keep it friendly).' }
    ],
    labels: {
      workspaceTag: 'gaming squad', channels: 'Channels', dms: 'Friends', addChannel: 'Add channel',
      addDm: 'Add friend', addServer: 'New squad server', meeting: 'Voice Lounge', breakouts: 'Squad rooms',
      people: 'Party', chat: 'Text chat', whiteboard: 'Strategy board', files: 'Clips & files', upload: 'Upload a clip or file'
    },
    roles: ['Player', 'Squad leader', 'Moderator'],
    rooms: [['Squad 1', 'Ranked'], ['Squad 2', 'Casual'], ['Squad 3', 'Creative']],
    extra: { title: 'Party finder', text: 'Game + what you need (e.g. "need 2 for duos")', meta: 'When? (e.g. 7pm)', empty: 'No party posts yet. Post one to find teammates.', check: 'Party finder' },
    emphasize: ['micBtn', 'callBtn'],                 // voice-first
    panelOrder: ['people', 'extra', 'breakouts', 'chat'],
    theme: {
      accent: '#c6f432', accent2: '#ff8a9a', bg: '#121417', panel: '#1c1f24', text: '#f2f3f5',
      font: 'inter', headFont: 'space', fontSize: 15, letterSpacing: 0, lineHeight: 150, radius: 10, density: 'comfortable',
      msgWidth: 900, sideWidth: 248, avatarShape: 'circle', iconStyle: 'line', grain: 8, motion: 'on', bgDim: 45, bgBlur: 0,
      layout: 'chat', sidebar: 'left', chatStyle: 'list',
      panels: { meeting: true, people: true, breakouts: true, chat: true, extra: true, whiteboard: true, files: true }
    }
  },

  school: {
    name: 'School', icon: 'school',
    tagline: 'Classes as servers, homework and assignments, on calm paper-like pages.',
    servers: ['Maths', 'Science', 'English', 'History'],
    channelIcon: 'hash',
    channels: [
      { id: 'announcements', icon: 'megaphone', topic: 'Notices from your teacher.' },
      { id: 'homework', icon: 'book', topic: 'Homework help and questions. Show your working!' },
      { id: 'class-chat', icon: 'chat', topic: 'Talk about today\'s lesson.' },
      { id: 'parents-corner', icon: 'house', topic: 'For parents and teachers to keep in touch.' }
    ],
    labels: {
      workspaceTag: 'class', channels: 'Class channels', dms: 'Messages', addChannel: 'Add channel',
      addDm: 'New message', addServer: 'Add a class / subject', meeting: 'Live class', breakouts: 'Breakout groups',
      people: 'Class', chat: 'Class chat', whiteboard: 'Class whiteboard', files: 'Class files', upload: 'Hand in or share a file'
    },
    roles: ['Student', 'Teacher', 'Parent'],
    rooms: [['Group A', 'Reading'], ['Group B', 'Problem solving'], ['Group C', 'Project work']],
    extra: { title: 'Assignments', text: 'Assignment (e.g. "Fractions worksheet")', meta: 'Due date', metaType: 'date', empty: 'No assignments yet. Nice!', check: 'Assignments' },
    emphasize: ['raiseBtn'],
    panelOrder: ['extra', 'breakouts', 'people', 'chat'],
    theme: {
      accent: '#7aa2ff', accent2: '#e7a15a', bg: '#121417', panel: '#1c1f24', text: '#f2f3f5',
      font: 'atkinson', headFont: 'lexend', fontSize: 16, letterSpacing: 0, lineHeight: 155, radius: 10, density: 'comfortable',
      msgWidth: 820, sideWidth: 248, avatarShape: 'circle', iconStyle: 'line', grain: 8, motion: 'on', bgDim: 45, bgBlur: 0,
      layout: 'chat', sidebar: 'left', chatStyle: 'list',
      panels: { meeting: true, people: true, breakouts: true, chat: true, extra: true, whiteboard: true, files: true }
    }
  },

  work: {
    name: 'Work', icon: 'hardhat',
    tagline: 'For building sites, offices and any job: updates, schedules, safety and tasks.',
    servers: ['Main Site', 'Office', 'Workshop'],
    channelIcon: 'hash',
    channels: [
      { id: 'site-updates', icon: 'crane', topic: 'Progress photos and updates from site.' },
      { id: 'schedule', icon: 'calendar', topic: 'Shifts, deliveries and deadlines.' },
      { id: 'safety', icon: 'alert', topic: 'Hazards, toolbox talks and near-misses. Safety first.' },
      { id: 'general', icon: 'hash', topic: 'Everything else.' }
    ],
    labels: {
      workspaceTag: 'work site', channels: 'Team channels', dms: 'Direct messages', addChannel: 'Add channel',
      addDm: 'New direct message', addServer: 'Add a site / team', meeting: 'Toolbox talk', breakouts: 'Crew rooms',
      people: 'Crew', chat: 'Team chat', whiteboard: 'Plan sketch', files: 'Shared documents', upload: 'Upload plans, photos or documents'
    },
    roles: ['Worker', 'Supervisor', 'Manager', 'Client'],
    rooms: [['Crew 1', 'Groundworks'], ['Crew 2', 'Electrical'], ['Crew 3', 'Office']],
    extra: { title: 'Tasks & shifts', text: 'Task (e.g. "Order 20 bags of cement")', meta: 'Shift / due (e.g. Mon 7am)', empty: 'No tasks yet.', check: 'Tasks & shifts' },
    emphasize: ['uploadBtn', 'attachBtn'],           // file sharing
    panelOrder: ['extra', 'people', 'chat', 'breakouts'],
    theme: {
      accent: '#ff8a3d', accent2: '#7aa2ff', bg: '#121417', panel: '#1c1f24', text: '#f2f3f5',
      font: 'inter', headFont: 'inter', fontSize: 15, letterSpacing: 0, lineHeight: 150, radius: 10, density: 'comfortable',
      msgWidth: 900, sideWidth: 248, avatarShape: 'circle', iconStyle: 'line', grain: 8, motion: 'on', bgDim: 45, bgBlur: 0,
      layout: 'chat', sidebar: 'left', chatStyle: 'list',
      panels: { meeting: true, people: true, breakouts: false, chat: true, extra: true, whiteboard: true, files: true }
    }
  },

  casual: {
    name: 'Casual', icon: 'chat',
    tagline: 'Chat-first like WeChat or Viber: friends, family and group chats in warm bubbles.',
    servers: ['Friends', 'Family'],
    dmsFirst: true,
    channelIcon: 'users',
    channels: [
      { id: 'friends', icon: 'users', topic: 'Group chat' },
      { id: 'family', icon: 'house', topic: 'Group chat' },
      { id: 'weekend-plans', icon: 'party', topic: 'Group chat' }
    ],
    labels: {
      workspaceTag: 'chats', channels: 'Group chats', dms: 'Chats', addChannel: 'New group chat',
      addDm: 'New chat', addServer: 'New space', meeting: 'Call', breakouts: 'Side rooms',
      people: 'People', chat: 'Chat', whiteboard: 'Doodle pad', files: 'Photos & files', upload: 'Send a photo or file'
    },
    roles: ['Friend', 'Family'],
    rooms: [['Room 1', 'Hang out'], ['Room 2', 'Games'], ['Room 3', 'Homework']],
    extra: { title: 'Reminders', text: 'Reminder (e.g. "Bring snacks")', meta: 'When?', empty: 'No reminders.', check: 'Reminders' },
    emphasize: [],
    panelOrder: ['people', 'extra', 'breakouts', 'chat'],
    theme: {
      accent: '#3dbe7a', accent2: '#ff8a3d', bg: '#121417', panel: '#1c1f24', text: '#f2f3f5',
      font: 'nunito', headFont: 'nunito', fontSize: 16, letterSpacing: 0, lineHeight: 150, radius: 10, density: 'comfortable',
      msgWidth: 760, sideWidth: 248, avatarShape: 'circle', iconStyle: 'line', grain: 8, motion: 'on', bgDim: 45, bgBlur: 0,
      layout: 'chat', sidebar: 'left', chatStyle: 'bubbles',
      panels: { meeting: true, people: true, breakouts: false, chat: true, extra: true, whiteboard: true, files: true }
    }
  }
};

/* Generic dark / light colours used by the Dark/Light buttons in Customize */
const SCHEMES = {
  dark: { bg: '#101214', panel: '#181b1e', text: '#eceae4' },
  light: { bg: '#efede8', panel: '#fdfcf9', text: '#1f2226' }
};

/* ---------- 2. FONTS ----------
   The first six are saved in the fonts/ folder (free, open-source fonts),
   so they look the same on every computer and work offline.
   The rest are "system stacks": a list of fonts, and your device uses the
   first one it has. */
const FONTS = {
  inter:     { name: 'Inter (clean, bundled)', css: '"Inter", system-ui, sans-serif' },
  atkinson:  { name: 'Atkinson Hyperlegible (easy to read, bundled)', css: '"Atkinson Hyperlegible", "Inter", system-ui, sans-serif' },
  space:     { name: 'Space Grotesk (techy, bundled)', css: '"Space Grotesk", "Inter", system-ui, sans-serif' },
  nunito:    { name: 'Nunito (rounded, bundled)', css: '"Nunito", ui-rounded, system-ui, sans-serif' },
  lexend:    { name: 'Lexend (friendly, bundled)', css: '"Lexend", "Inter", system-ui, sans-serif' },
  jetbrains: { name: 'JetBrains Mono (coder, bundled)', css: '"JetBrains Mono", ui-monospace, Consolas, monospace' },
  system:    { name: 'System default', css: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' },
  humanist:  { name: 'Humanist (Segoe / Gill Sans)', css: '"Segoe UI", "Gill Sans", "Gill Sans MT", Seravek, Calibri, sans-serif' },
  geometric: { name: 'Geometric (Century Gothic / Futura)', css: '"Century Gothic", Futura, "Avenir Next", Avenir, sans-serif' },
  rounded:   { name: 'Rounded (system)', css: 'ui-rounded, "Arial Rounded MT Bold", "Varela Round", "Trebuchet MS", sans-serif' },
  tech:      { name: 'Condensed (Bahnschrift / DIN)', css: 'Bahnschrift, "DIN Alternate", "Arial Narrow", sans-serif-condensed, sans-serif' },
  serif:     { name: 'Serif (Georgia)', css: 'Georgia, Cambria, "Times New Roman", serif' },
  oldstyle:  { name: 'Old-style serif (Palatino)', css: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", serif' },
  slab:      { name: 'Slab serif (Rockwell)', css: 'Rockwell, "Roboto Slab", "Courier New", serif' },
  mono:      { name: 'Monospace (system)', css: 'ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace' },
  hand:      { name: 'Handwriting (Segoe Print)', css: '"Segoe Print", "Bradley Hand", "Comic Neue", cursive' },
  comic:     { name: 'Comic (fun)', css: '"Comic Sans MS", "Comic Neue", "Chalkboard SE", cursive' }
};

/* ---------- Small helpers ---------- */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
// esc() makes text safe to put inside HTML (stops people injecting code into messages)
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const slug = s => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const initials = n => (n.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase();
// Short label for a server button: "Main Site" → "MS", "Maths" → "Ma"
const serverLabel = n => { const w = n.trim().split(/\s+/); return w.length > 1 ? initials(n) : w[0].slice(0, 2).replace(/^./, c => c.toUpperCase()); };
const prettyName = id => id.replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase());

/* Avatars. Your own picture (media.js saves it) or coloured initials.
   The colour comes from the name, so the same person always gets the same one. */
const AVATAR_COLOURS = ['#b5523b', '#3f7a5a', '#4a62a8', '#8a5a9e', '#a8752b', '#2f7f8a', '#9e4a6a', '#5f6b2f'];
const nameColour = n => AVATAR_COLOURS[[...String(n)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_COLOURS.length];
let myAvatar = localStorage.getItem('omni_v4_avatar') || '';   // a small data: URL picture, or ''
function avatarHTML(name, opts = {}) {
  const url = opts.me ? myAvatar : opts.url;   // your picture, or someone's online picture
  const pic = url ? `<img src="${esc(url)}" alt="">` : esc(initials(name || '?'));
  const status = opts.status ? `<span class="status ${opts.status === 'online' ? 'online' : ''}"></span>` : '';
  return `<span class="av-face" style="--av:${nameColour(name)}">${pic}</span>${status}`;
}

/* ---------- 3. Storage ----------
   omni_v3              → settings (current mode, your name, saved themes)
   omni_v3_data_<mode>  → messages, channels, files, tasks for ONE mode
   omni_v3_board_<mode> → the whiteboard picture for ONE mode
   omni_v2              → the old version's data (copied in once) */
const SETTINGS_KEY = 'omni_v3', OLD_KEY = 'omni_v2';
const dataKey = m => 'omni_v3_data_' + m;
const boardKey = m => 'omni_v3_board_' + m;

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function store(key, value) {
  try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); return true; }
  catch { toast('Storage is full: could not save'); return false; }
}

let settings = Object.assign({ mode: 'gaming', welcomed: false, name: 'Keagan', status: '', themes: {}, presets: {}, matchPref: 'ask', migrated: false }, load(SETTINGS_KEY, {}));
if (!MODES[settings.mode]) settings.mode = 'gaming';
const saveSettings = () => store(SETTINGS_KEY, settings);

// A brand-new, empty data object for a mode (no fake messages or users!)
function freshData(mode) {
  const m = MODES[mode], servers = {};
  m.servers.forEach(s => servers[s] = { channels: Object.fromEntries(m.channels.map(c => [c.id, []])) });
  return { server: m.servers[0], servers, dms: {}, files: [], tasks: [], role: m.roles[0] };
}
// Load a mode's data and patch in anything missing
function currentUserId() {
  if (typeof Online !== 'undefined' && Online.uid) return Online.uid;
  if (!settings.localUserId) {
    settings.localUserId = 'local-' + Math.random().toString(36).slice(2, 10);
    saveSettings();
  }
  return settings.localUserId;
}
function loadData(mode) {
  let d = load(dataKey(mode), null);
  if (!d || !d.servers || !Object.keys(d.servers).length) d = freshData(mode);
  else {
    d.dms ||= {}; d.files ||= []; d.tasks ||= []; d.role ||= MODES[mode].roles[0];
    if (!d.servers[d.server]) d.server = Object.keys(d.servers)[0];
    const tidy = arr => Array.isArray(arr) ? arr.filter(m => m && !m.deleted) : [];
    Object.values(d.servers).forEach(sv => Object.keys(sv.channels || {}).forEach(c => sv.channels[c] = tidy(sv.channels[c])));
    Object.values(d.dms).forEach(dm => dm.msgs = tidy(dm.msgs));
  }
  if (typeof OmniGroups !== 'undefined') OmniGroups.normalizeStore(d, currentUserId());
  return d;
}

let data = loadData(settings.mode);
const saveData = () => store(dataKey(settings.mode), data);
const M = () => MODES[settings.mode];          // the current mode
const srv = () => data.servers[data.server];   // the current server

// What you are looking at right now: a channel or a direct message
let view = { type: 'channel', id: Object.keys(srv().channels)[0] };
let mediaStream = null, screenStream = null, muted = false, cameraOn = false, hand = false, room = null, callGen = 0, callJoined = false;

/* ---------- 4. Theme ---------- */
// The mode's default theme with your saved changes laid on top
function themeFor(mode) {
  const base = clone(MODES[mode].theme), saved = settings.themes[mode] || {};
  return { ...base, ...saved, panels: { ...base.panels, ...(saved.panels || {}) } };
}
// Colour maths for readable text (the WCAG rules websites use)
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
// Contrast ratio between two colours: 1 (none) to 21 (black on white). Text needs 4.5+.
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
const isLight = hex => luminance(hex) > 0.4;
// Black or white text on top of a colour, whichever is easier to read
const textOn = hex => contrast(hex, '#0b0d0e') >= contrast(hex, '#ffffff') ? '#0b0d0e' : '#ffffff';

// Turn the theme into CSS variables + classes on <body>
function applyTheme() {
  const t = themeFor(settings.mode), css = document.documentElement.style;
  ['accent', 'accent2', 'bg', 'panel', 'text'].forEach(k => css.setProperty('--' + k, t[k]));
  css.setProperty('--on-accent', textOn(t.accent));
  css.setProperty('--font', (FONTS[t.font] || FONTS.inter).css);
  css.setProperty('--font-head', (FONTS[t.headFont] || FONTS[t.font] || FONTS.inter).css);
  css.setProperty('--fs', t.fontSize + 'px');
  css.setProperty('--r', t.radius + 'px');
  css.setProperty('--r-sm', Math.round(t.radius * 0.65) + 'px');
  css.setProperty('--d', t.density === 'compact' ? '0.7' : '1');
  css.setProperty('--ls', (t.letterSpacing / 100) + 'em');      // 2 → 0.02em
  css.setProperty('--lh', t.lineHeight / 100);                  // 150 → 1.5
  css.setProperty('--msg-w', t.msgWidth >= 1400 ? '100%' : t.msgWidth + 'px');
  css.setProperty('--side-w', t.sideWidth + 'px');
  css.setProperty('--grain', (t.grain / 100 * 0.35).toFixed(3)); // 100% grain = 0.35 opacity
  css.setProperty('--bg-dim', t.bgDim / 100);
  css.setProperty('--bg-blur', t.bgBlur + 'px');

  const p = t.panels, bigChat = t.layout === 'chat' || !p.meeting;
  const cls = ['mode-' + settings.mode, isLight(t.panel) ? 'scheme-light' : 'scheme-dark', 'layout-' + t.layout, 'chat-' + t.chatStyle];
  cls.push('icons-' + t.iconStyle, 'av-' + t.avatarShape);
  if (t.motion === 'off') cls.push('no-motion');
  if (typeof hasBackground === 'function' && hasBackground()) cls.push('has-bg');   // media.js
  if (t.sidebar === 'right') cls.push('side-right');
  if (M().dmsFirst) cls.push('dms-first');
  ALL_PANELS.forEach(k => { if (!p[k]) cls.push('hide-' + k); });
  if (!p.whiteboard && !p.files) cls.push('hide-bottom');
  // Hide the whole right column if nothing in it is showing
  if (!p.people && !p.breakouts && !p.extra && !(p.chat && !bigChat)) cls.push('no-right');
  ['desktop-locked', 'show-lobby', 'show-side', 'people-open', 'board-open'].forEach(name => {
    if (document.body.classList.contains(name)) cls.push(name);
  });
  document.body.className = cls.join(' ');
  $('meta[name="theme-color"]').content = t.panel;
  if (typeof showBackground === 'function') showBackground();   // media.js
  Sounds.setMode(settings.mode);   // each mode has its own sound style
  requestAnimationFrame(sizeWB);   // whiteboard may have changed size
}

/* ---------- 5. Rendering ---------- */
function toast(msg, ms = 2000) {
  Sounds.play('toast');   // soft blip (skipped if another sound just played)
  const el = $('#toast'); el.textContent = named(msg); el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), ms);
}

// Pop-up window. html = cards to show, done = what "Done" does
let modalDone = () => {};
function modal(title, copy, html = '', done = () => {}, doneLabel = 'Done') {
  $('#modalTitle').textContent = named(title); $('#modalCopy').textContent = named(copy);
  $('#modalGrid').innerHTML = named(html); $('#modalGrid').onclick = $('#modalGrid').oninput = null; $('#confirmModal').textContent = doneLabel || '';
  $('#confirmModal').style.display = doneLabel ? '' : 'none';   // doneLabel null = no Done button
  $('#modalBackdrop').style.display = 'grid'; modalDone = done || (() => {});
  setTimeout(() => $('#modalGrid input')?.focus(), 30);
}
function closeModal() { $('#modalBackdrop').style.display = 'none'; modalDone = () => {}; }

// Every element with data-label="x" gets the current mode's word for x
function renderLabels() {
  $$('[data-label]').forEach(el => { const w = M().labels[el.dataset.label]; if (w) el.textContent = w; });
  $('#addServerBtn').title = M().labels.addServer;
  $('#extraTitle').textContent = M().extra.title;
  $('#extraCheckLabel').textContent = M().extra.check;
  $('#extraText').placeholder = M().extra.text;
  $('#extraMeta').placeholder = M().extra.meta;
  $('#extraMeta').type = M().extra.metaType || 'text';
}

function renderModeSwitch() {
  const buttons = Object.entries(MODES).map(([key, m]) =>
    `<button type="button" data-mode="${key}" class="${key === settings.mode ? 'active' : ''}" title="${esc(m.name)} mode" aria-pressed="${key === settings.mode}">${icon(m.icon)}<span class="lbl">${esc(m.name)}</span></button>`).join('');
  $('#modeSwitch').innerHTML = buttons;
}

function renderServers() {
  const names = typeof OmniGroups !== 'undefined' ? OmniGroups.visibleNames(data.servers, currentUserId()) : Object.keys(data.servers);
  if (names.length && !names.includes(data.server)) {
    data.server = names[0];
    view = { type: 'channel', id: Object.keys(data.servers[data.server].channels)[0] };
  }
  $('#serverList').innerHTML = names.map(name =>
    `<button class="dot ${name === data.server ? 'active' : ''} ${data.servers[name].online ? 'online-server' : ''}" data-server="${esc(name)}" title="${esc(name)}">` +
    `${data.servers[name].online ? icon('globe') : esc(serverLabel(name))}</button>`).join('');
  $('#workspaceName').textContent = data.server;
}

const channelInfo = id => M().channels.find(c => c.id === id) || { icon: M().channelIcon, topic: 'Custom channel · saved on this device' };

function renderChannels() {
  $('#channelList').innerHTML = Object.keys(srv().channels).map(id =>
    `<button class="item channel ${view.type === 'channel' && view.id === id ? 'active' : ''}" data-channel="${esc(id)}">` +
    `<span class="ico">${icon(channelInfo(id).icon)}</span><span>${esc(id)}</span></button>`).join('');
}

function renderDMs() {
  const ids = Object.keys(data.dms);
  $('#dmList').innerHTML = ids.length ? ids.map(id => {
    const dm = data.dms[id], lm = dm.msgs.at(-1);
    const last = !lm ? 'No messages yet' : lm.text || (lm.gif ? 'GIF' : '');
    return `<button class="dm-item ${view.type === 'dm' && view.id === id ? 'active' : ''}" data-dm="${esc(id)}">` +
      `<div class="avatar">${avatarHTML(dm.name, { status: dm.online ? 'online' : 'away', url: dm.avatar })}</div>` +
      `<div class="dm-meta"><div class="dm-name">${esc(dm.name)}</div><div class="dm-sub">${esc(last)}</div></div></button>`;
  }).join('') : `<div class="empty">Nothing here yet. Use “${esc(M().labels.addDm)}” to start one.</div>`;
}

function currentMessages() {
  if (view.type === 'dm') return data.dms[view.id]?.msgs || [];
  return srv().channels[view.id] || (srv().channels[view.id] = []);
}

function renderHeader() {
  const isDm = view.type === 'dm';
  const name = isDm ? data.dms[view.id]?.name || view.id : view.id;
  $('#channelIcon').innerHTML = icon(isDm ? 'at' : channelInfo(view.id).icon);
  $('#channelName').textContent = name;
  if ($('#whereMode')) $('#whereMode').textContent = M().name;
  const onlineTopic = typeof Online !== 'undefined' && Online.topicFor();
  $('#topic').textContent = onlineTopic || (isDm ? 'Direct message · saved on this device only (they can\'t see it until Omni is online)' : channelInfo(view.id).topic);
  $('#messageInput').placeholder = 'Message ' + (isDm ? name : (M().dmsFirst ? '' : '#') + name);
  $('#bigChatTitle').innerHTML = icon(isDm ? 'at' : channelInfo(view.id).icon) + esc(name);
}

// Messages are drawn into BOTH chat areas; CSS decides which one you see
function renderChat() {
  const msgs = currentMessages();
  let html = '';
  if (!msgs.length) html = '<div class="empty">No messages yet. Start the conversation below.</div>';
  else {
    let lastDay = '';
    html = msgs.map((m, i) => {
      const d = new Date(m.ts), day = d.toDateString();
      const note = day !== lastDay ? `<div class="day-note">${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</div>` : '';
      lastDay = day;
      return note + msgHTML(m, i);
    }).join('');
  }
  ['#chatList', '#bigChat'].forEach(sel => { const el = $(sel); el.innerHTML = html; el.scrollTop = el.scrollHeight; });
  const isOnline = typeof Online !== 'undefined' && !!Online.current();
  $('#chatPill').textContent = isOnline ? 'online' : view.type === 'channel' ? 'this device' : 'local DM';
}

// Only messages you wrote on this device are yours (later, a server will send other people's)
const isMine = m => m.mine !== false;
// Only allow GIF sources we trust: Omni's own GIFs, GIFs saved from your computer, or https links
function gifSrc(g) {
  const s = g && g.src;
  return s && (/^gifs\/[a-z0-9-]+\.gif$/.test(s) || /^data:image\/gif;base64,/.test(s) || /^https:\/\//.test(s)) ? s : '';
}
// One message → HTML. data-i is its position in the list (used by the right-click menu)
function msgHTML(m, i) {
  const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (m.deleted) return '';   // (old v3 data) deleted messages are simply gone
  const fwd = m.forwarded ? `<div class="msg-fwd">${icon('share')} Forwarded${m.forwarded.from ? ' from ' + esc(m.forwarded.from) : ''}</div>` : '';
  const src = gifSrc(m.gif);
  const gif = src ? `<img class="msg-gif" src="${esc(src)}" alt="${esc(m.gif.alt || 'GIF')}" loading="lazy" referrerpolicy="no-referrer">` : '';
  const text = m.text ? `<span class="msg-text">${esc(m.text)}</span>` : '';
  const rx = Object.entries(m.reactions || {}).filter(([, who]) => who.length).map(([e, who]) =>
    `<button class="rx ${who.includes('me') ? 'mine' : ''}" data-rx="${esc(e)}" data-i="${i}" title="${who.includes('me') ? 'You reacted' : ''}">${e} ${who.length}</button>`).join('');
  const who = m.from || settings.name, mine = isMine(m);
  return `<div class="chat-msg ${mine ? 'me' : 'them'}" data-i="${i}" tabindex="0" title="Right-click (or long-press) for options">` +
    `<span class="avatar">${avatarHTML(who, { me: mine, url: m.uid && typeof Online !== 'undefined' ? Online.avatarOf(m.uid) : '' })}</span><div class="msg-head"><b>${esc(who)}</b>${handleHTML(m)}<time>${time}${m.edited ? ' (edited)' : ''}</time></div>` +
    `${fwd}${gif}${text}` + (rx ? `<div class="rx-row">${rx}</div>` : '') + `</div>`;
}

/* The family word filter (filter.js) checks text before it's saved.
   Returns the text to use, or null if it was blocked. kind 'name' is for names. */
// "@username" after the name on online messages (display names can repeat; usernames can't)
function handleHTML(m) {
  const u = m.uid && typeof Online !== 'undefined' && Online.usernameOf ? Online.usernameOf(m.uid) : '';
  return u ? `<span class="handle">@${esc(u)}</span>` : '';
}
function guard(text, kind = 'message') {
  const r = Filter.apply(text, kind);
  if (!r.ok) { filterWarning(kind); return null; }
  if (r.changed) toast('Some words were hidden by the family filter', 3000);
  return r.text;
}
function filterWarning(kind) {
  modal('Let\'s keep it friendly 🙂',
    kind === 'name' ? 'That name has a word the family filter doesn\'t allow. Please choose a different one.'
                    : 'Your message has a word the family filter doesn\'t allow, so it wasn\'t sent. Try saying it another way!',
    '<div class="modal-card wide"><span>A parent or guardian turned on the family filter on this device.</span></div>', () => {}, 'OK');
}

function renderFiles() {
  const box = $('#fileList');
  box.innerHTML = data.files.length ? data.files.slice(-6).reverse().map(f =>
    `<div class="file"><div class="ficon">${icon('file')}</div><div><strong>${esc(f.name)}</strong><small>${(f.size / 1024 / 1024).toFixed(2)} MB · listed locally</small></div></div>`).join('')
    : '<div class="empty">No shared files yet.</div>';
}

function renderPeople() {
  $('#peopleList').innerHTML = `<div class="member"><div class="avatar">${avatarHTML(settings.name, { me: true, status: 'online' })}</div>` +
    `<div><div class="mini">${esc(settings.name)}</div><span class="role">You · ${esc(data.role)}</span></div></div>`;
  $('#meName').textContent = settings.name;
  $('#meRole').textContent = settings.status || data.role + ' · Available';
  $('#meAvatar').innerHTML = avatarHTML(settings.name, { me: true, status: 'online' });
  $('#localFace').innerHTML = `<span class="avatar">${avatarHTML(settings.name, { me: true })}</span>`;
}

function renderRooms() {
  $('#roomList').innerHTML = M().rooms.map(([name, sub], i) =>
    `<div class="breakout ${room === i ? 'here' : ''}"><div><strong>${esc(name)} · ${esc(sub)}</strong><small>${room === i ? 'You are here' : 'Empty'}</small></div>` +
    `<button class="join" data-room="${i}">${room === i ? 'Leave' : 'Join'}</button></div>`).join('');
  $('#roomPill').textContent = M().rooms.length + ' rooms';
}

// The mode panel: party finder / assignments / tasks / reminders
function renderExtra() {
  const list = data.tasks;
  $('#extraPill').textContent = list.filter(t => !t.done).length + ' open';
  $('#extraList').innerHTML = list.length ? list.map(t => {
    let meta = t.meta;
    if (meta && M().extra.metaType === 'date') meta = 'Due ' + new Date(meta + 'T00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    return `<div class="task ${t.done ? 'done' : ''}"><input type="checkbox" data-task="${t.id}" ${t.done ? 'checked' : ''} aria-label="Done">` +
      `<div><div class="t-text">${esc(t.text)}</div>${meta ? `<span class="t-meta">${esc(meta)}</span>` : ''}</div>` +
      `<button class="t-del" data-del="${t.id}" title="Delete" aria-label="Delete">${icon('x')}</button></div>`;
  }).join('') : `<div class="empty">${esc(M().extra.empty)}</div>`;
}

const CALL_EMPH = new Set(['micBtn', 'callBtn', 'cameraBtn', 'shareBtn', 'raiseBtn', 'leaveBtn', 'reactBtn']);
function renderEmphasis() {
  $$('.emph').forEach(el => el.classList.remove('emph'));
  M().emphasize.forEach(id => { if (!callJoined && CALL_EMPH.has(id)) return; $('#' + id)?.classList.add('emph'); });
  // put the right-hand panels in this mode's order
  M().panelOrder.forEach((key, i) => { const el = $('#' + key + 'Panel'); if (el) el.style.order = i; });
}

function renderAll() {
  renderLabels(); renderModeSwitch(); renderServers(); renderChannels(); renderDMs();
  renderHeader(); renderChat(); renderFiles(); renderPeople(); renderRooms(); renderExtra(); renderEmphasis();
  syncCallView();
}

/* ---------- 6. Actions ---------- */
function openChannel(id) { document.body.classList.remove('show-side'); view = { type: 'channel', id }; renderChannels(); renderDMs(); renderHeader(); renderChat(); }
function openDM(id) { document.body.classList.remove('show-side'); view = { type: 'dm', id }; renderChannels(); renderDMs(); renderHeader(); renderChat(); }

// Clicks on things that are re-drawn often are handled here ("event delegation")
document.addEventListener('click', e => {
  const t = e.target.closest('[data-channel],[data-dm],[data-server],[data-mode],[data-room],[data-del],[data-scheme]');
  if (!t) return;
  if (t.dataset.channel) openChannel(t.dataset.channel);
  else if (t.dataset.dm) openDM(t.dataset.dm);
  else if (t.dataset.server) {
    data.server = t.dataset.server; saveData(); renderServers();
    openChannel(Object.keys(srv().channels)[0]); toast('Switched to ' + data.server);
  }
  else if (t.dataset.mode) switchMode(t.dataset.mode);
  else if (t.dataset.room !== undefined) enterLounge(Number(t.dataset.room));
  else if (t.dataset.del) { data.tasks = data.tasks.filter(x => String(x.id) !== t.dataset.del); saveData(); renderExtra(); }
  else if (t.dataset.scheme) setScheme(t.dataset.scheme);
});
document.addEventListener('change', e => {
  const id = e.target.dataset?.task; if (!id) return;
  const task = data.tasks.find(x => String(x.id) === id); if (task) { task.done = e.target.checked; saveData(); renderExtra(); }
});

$('#composer').onsubmit = e => {
  e.preventDefault();
  const input = $('#messageInput'), text = input.value.trim(); if (!text) return;
  if (view.type === 'dm' && !data.dms[view.id]) return;
  const clean = guard(text); if (clean === null) return;   // blocked by the family filter
  const msg = { text: clean, ts: Date.now(), from: settings.name, mine: true };
  currentMessages().push(msg);
  if (typeof Online !== 'undefined') Online.sent(msg);   // only does something when signed in online
  // @someone → mention sound, direct message → DM sound, otherwise a quick "sent" tick
  Sounds.play(/(^|\s)@\w/.test(text) ? 'mention' : view.type === 'dm' ? 'dm' : 'send');
  saveData(); input.value = ''; renderChat(); renderDMs();
};

$('#extraForm').onsubmit = e => {
  e.preventDefault();
  const text = $('#extraText').value.trim(); if (!text) return;
  data.tasks.push({ id: Date.now(), text, meta: $('#extraMeta').value.trim(), done: false });
  saveData(); $('#extraText').value = ''; $('#extraMeta').value = ''; renderExtra();
};

$('#closeModal').onclick = closeModal;
// "Done" runs the modal's job. Returning false (or a promise of false) keeps it open.
$('#confirmModal').onclick = () => { Promise.resolve(modalDone()).then(r => { if (r !== false) closeModal(); }); };
$('#modalBackdrop').onclick = e => { if (e.target.id === 'modalBackdrop') closeModal(); };
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (typeof closeGroupMenu === 'function' && closeGroupMenu()) return;
  if (typeof closeMenu === 'function' && (closeMenu() || closePops())) return;   // menus/pop-ups first (extras.js)
  closeModal(); $('#customize').classList.remove('open');
});
$('#modalGrid').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input.modal-input')) $('#confirmModal').click(); });

$('#meAvatar').onclick = () => pickAvatar();   // media.js: choose + crop a profile picture
function markToggle(id, open) {
  const el = $('#' + id);
  if (!el) return;
  el.setAttribute('aria-pressed', open ? 'true' : 'false');
}
$('#peopleToggle').onclick = () => {
  document.body.classList.toggle('people-open');
  markToggle('peopleToggle', document.body.classList.contains('people-open'));
};
$('#boardToggle').onclick = () => {
  document.body.classList.toggle('board-open');
  markToggle('boardToggle', document.body.classList.contains('board-open'));
};
$('#moreToggle').onclick = () => {
  const box = $('#moreTools');
  box.hidden = !box.hidden;
  $('#moreToggle').setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
};
$('#menuBtn').onclick = () => {
  document.body.classList.toggle('show-side');
  $('#menuBtn').setAttribute('aria-expanded', document.body.classList.contains('show-side') ? 'true' : 'false');
};
$('#homeBtn').onclick = () => { openChannel(Object.keys(srv().channels)[0]); toast('Home'); };

function templateChannelIds(template) {
  const info = OmniGroups.TEMPLATES[template];
  const mode = info ? info.mode : settings.mode;
  return MODES[mode].channels.map(c => c.id);
}
function finishCreate(name, message) {
  data.server = name;
  saveData();
  renderServers();
  openChannel(Object.keys(srv().channels)[0]);
  closeModal();
  toast(message || ('Created ' + name));
}
function openCreateWizard() {
  let state = OmniGroups.wizardStart();
  modal('Create a group', '', '', null, '');
  const paint = () => {
    const err = state.error ? `<p class="form-error" id="wizErr">${esc(state.error)}</p>` : '<p class="form-error" id="wizErr"></p>';
    let body = '';
    if (state.step === 1) {
      $('#modalTitle').textContent = 'Create a group';
      $('#modalCopy').textContent = 'Start a place for chats on this device, or join one with a code.';
      const templates = Object.entries(OmniGroups.TEMPLATES).map(([id, info]) =>
        `<button type="button" class="item" data-wiz-template="${id}">${esc(info.label)}</button>`).join('');
      body = `<div class="modal-card wide wizard-choices"><button type="button" class="confirm" id="wizOwn">Start a blank group</button>${templates}` +
        `<button type="button" class="close" id="wizJoin">Join a group</button></div>${err}`;
    } else if (state.step === 2) {
      $('#modalTitle').textContent = 'Who is it for?';
      $('#modalCopy').textContent = 'You can skip this. It only labels the group.';
      body = `<div class="modal-card wide wizard-choices"><button type="button" class="item" id="wizFriends">Friends</button>` +
        `<button type="button" class="item" id="wizCommunity">Club or community</button></div>` +
        `<div class="wizard-row"><button type="button" class="close" id="wizBack">Back</button><button type="button" class="close" id="wizSkip">Skip</button></div>${err}`;
    } else if (state.step === 'join') {
      $('#modalTitle').textContent = 'Join a group';
      $('#modalCopy').textContent = 'Use an invite code from someone in the group.';
      body = `<div class="modal-card wide"><input id="wizCode" class="modal-input" maxlength="8" placeholder="Invite code" autocomplete="off"></div>` +
        `<div class="wizard-row"><button type="button" class="close" id="wizBack">Back</button><button type="button" class="confirm" id="wizDoJoin">Join</button></div>${err}`;
    } else {
      $('#modalTitle').textContent = 'Name the group';
      $('#modalCopy').textContent = 'The name is required. A picture is optional.';
      body = `<div class="modal-card wide"><label>Picture <input id="wizIcon" type="file" accept="image/png,image/jpeg,image/webp"></label>` +
        `<label>Name <input id="wizName" class="modal-input" maxlength="28" value="${esc(state.name)}" autocomplete="off"></label></div>` +
        `<div class="wizard-row"><button type="button" class="close" id="wizBack">Back</button><button type="button" class="confirm" id="wizCreate">Create</button></div>${err}`;
    }
    $('#modalGrid').innerHTML = body;
    const set = (next) => { state = next; paint(); };
    const own = $('#wizOwn'); if (own) own.onclick = () => set(OmniGroups.wizardOwn(state));
    $$('[data-wiz-template]').forEach(btn => btn.onclick = () => set(OmniGroups.wizardTemplate(state, btn.dataset.wizTemplate)));
    const join = $('#wizJoin'); if (join) join.onclick = () => set(OmniGroups.wizardJoin(state));
    const back = $('#wizBack'); if (back) back.onclick = () => set(OmniGroups.wizardBack(state));
    const skip = $('#wizSkip'); if (skip) skip.onclick = () => set(OmniGroups.wizardSkip(state));
    const friends = $('#wizFriends'); if (friends) friends.onclick = () => set(OmniGroups.wizardKind(state, 'friends'));
    const community = $('#wizCommunity'); if (community) community.onclick = () => set(OmniGroups.wizardKind(state, 'community'));
    const icon = $('#wizIcon');
    if (icon) icon.onchange = () => {
      const file = icon.files && icon.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { state = OmniGroups.wizardIcon(state, String(reader.result || '')); paint(); };
      reader.readAsDataURL(file);
    };
    const create = $('#wizCreate');
    if (create) create.onclick = () => {
      const name = $('#wizName').value;
      if (guard(name, 'name') === null) return;
      const made = OmniGroups.createGroup(data, {
        name, userId: currentUserId(), channelIds: templateChannelIds(state.template),
        icon: state.icon, kind: state.kind, template: state.template || 'own'
      });
      if (!made.ok) { state = Object.assign({}, state, { name, error: made.message }); paint(); return; }
      finishCreate(made.name);
    };
    const doJoin = $('#wizDoJoin');
    if (doJoin) doJoin.onclick = async () => {
      const code = $('#wizCode').value;
      doJoin.disabled = true; doJoin.textContent = 'Checking…';
      const local = OmniGroups.joinLocal(data, code, currentUserId());
      if (local.ok) { finishCreate(local.name, 'Joined ' + local.name); return; }
      if (typeof Online !== 'undefined' && Online.ready) {
        try { const chat = await Online.joinChat(code); goOnline(chat); closeModal(); return; }
        catch (e) { state = Object.assign({}, state, { error: e.message || String(e) }); paint(); return; }
      }
      state = Object.assign({}, state, { error: local.message }); paint();
    };
  };
  paint();
}
$('#addServerBtn').onclick = () => openCreateWizard();

let groupMenuName = '';
function closeGroupMenu() {
  const menu = $('#groupMenu');
  if (!menu || !menu.classList.contains('show')) return false;
  menu.classList.remove('show');
  menu.hidden = true;
  return true;
}
function openGroupMenu(name, x, y) {
  const group = data.servers[name];
  if (!group) return;
  const plan = OmniGroups.menuFor(group, currentUserId());
  if (plan.role === 'none') { toast('You are not a member of that group.'); return; }
  groupMenuName = name;
  const sep = plan.items.some(item => item.id === 'leave') && plan.items.length > 1 ? '<div class="ctx-sep"></div>' : '';
  const leave = plan.items.filter(item => item.id === 'leave').map(item =>
    `<button type="button" role="menuitem" class="danger" data-group-act="leave">${esc(item.label)}</button>`).join('');
  const rest = plan.items.filter(item => item.id !== 'leave').map(item =>
    `<button type="button" role="menuitem" data-group-act="${item.id}">${esc(item.label)}</button>`).join('');
  const menu = $('#groupMenu');
  menu.innerHTML = rest + (rest && leave ? sep : '') + leave + (plan.note ? `<p class="ctx-note">${esc(plan.note)}</p>` : '');
  menu.hidden = false;
  menu.classList.add('show');
  menu.style.left = '0px'; menu.style.top = '0px';
  const rect = menu.getBoundingClientRect();
  const spot = OmniGroups.clampMenu(x, y, rect.width, rect.height, innerWidth, innerHeight);
  menu.style.left = spot.left + 'px';
  menu.style.top = spot.top + 'px';
  const first = menu.querySelector('button');
  if (first) first.focus();
}
function askLeaveGroup(name) {
  const plan = OmniGroups.menuFor(data.servers[name], currentUserId());
  if (!plan.items.some(item => item.id === 'leave')) {
    toast(plan.role === 'owner' ? 'Owners stay with the group they started.' : 'You cannot leave that group.');
    return;
  }
  modal('Leave ' + name, 'You leave the group. It stays for the other members, including its channels.',
    '<p class="form-error" id="leaveErr"></p>', () => {
      const out = OmniGroups.leaveGroup(data, name, currentUserId());
      if (!out.ok) { $('#leaveErr').textContent = out.error === 'owner' ? 'Owners stay with the group they started.' : 'You cannot leave that group.'; return false; }
      const next = OmniGroups.visibleNames(data.servers, currentUserId());
      if (data.server === name && next[0]) {
        data.server = next[0];
        saveData();
        renderAll();
      } else saveData();
      renderServers();
      toast('You left ' + name);
    }, 'Leave group');
}
document.addEventListener('contextmenu', e => {
  const el = e.target.closest('[data-server]');
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  openGroupMenu(el.dataset.server, e.clientX || 24, e.clientY || 24);
});
document.addEventListener('keydown', e => {
  const el = e.target.closest && e.target.closest('[data-server]');
  if (!el) return;
  if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return;
  e.preventDefault();
  const rect = el.getBoundingClientRect();
  openGroupMenu(el.dataset.server, rect.left, rect.bottom);
});
$('#groupMenuBtn').onclick = () => {
  const rect = $('#groupMenuBtn').getBoundingClientRect();
  openGroupMenu(data.server, rect.left, rect.bottom + 4);
};
$('#groupMenu').onclick = e => {
  const btn = e.target.closest('[data-group-act]');
  if (!btn) return;
  const name = groupMenuName;
  const act = btn.dataset.groupAct;
  closeGroupMenu();
  if (act === 'copy-invite') {
    const code = data.servers[name] && data.servers[name].inviteCode;
    if (!code) return;
    const done = () => toast('Invite code ' + code);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, done);
    else done();
  } else if (act === 'leave') askLeaveGroup(name);
};
document.addEventListener('pointerdown', e => {
  const menu = $('#groupMenu');
  if (menu && !menu.contains(e.target) && e.target.id !== 'groupMenuBtn') closeGroupMenu();
});

$('#addChannelBtn').onclick = () => modal(M().labels.addChannel, 'Create a channel in ' + data.server + '.',
  '<div class="modal-card wide"><input id="newChannel" class="modal-input" placeholder="channel-name" maxlength="32"></div>', () => {
    const n = slug($('#newChannel').value); if (!n) return;
    if (guard($('#newChannel').value, 'name') === null || guard(n, 'name') === null) return false;
    if (srv().channels[n]) { toast('Channel already exists'); return false; }
    srv().channels[n] = []; saveData(); openChannel(n);
  });

$('#addContactBtn').onclick = () => modal(M().labels.addDm, 'Add a contact by display name. Until Omni has a real server, messages stay on this device.',
  '<div class="modal-card wide"><input id="newContact" class="modal-input" placeholder="Display name" maxlength="40"></div>', () => {
    const n = $('#newContact').value.trim(); if (!n) return;
    if (guard(n, 'name') === null) return false;
    const id = slug(n) || String(Date.now());
    data.dms[id] ||= { name: n, msgs: [] }; saveData(); openDM(id);
  });

$('#workspaceBtn').onclick = () => {
  modal(data.server, `${M().name} mode`,
    `<div class="modal-card"><b>Saved on this device</b><span>No bots or fake accounts are ever created.</span></div>` +
    `<div class="modal-card"><b>Channels</b><span>${Object.keys(srv().channels).length} channels in ${esc(data.server)}</span></div>` +
    `<div class="modal-card"><b>Mode</b><span>Switch between Gaming, School, Work and Casual.</span><div class="row"><button class="close" id="wsModes">Show mode picker</button></div></div>` +
    `<div class="modal-card"><b>Look &amp; feel</b><span>Colours, fonts, layout and panels.</span><div class="row"><button class="close" id="wsCustom">Open Customize</button></div></div>`);
  $('#wsModes').onclick = () => { closeModal(); showWelcome(); };
  $('#wsCustom').onclick = () => { closeModal(); openCustomize(); };
};

// The Safety section (shared by the shield button and Settings)
function safetyHTML() {
  return `<div class="modal-card wide"><b>Safety centre</b><span>Omni is being built to keep kids, teens and parents safe. Everything here works on <b>this device only</b> until Omni has a server.</span></div>` +
    filterCardHTML() +   // family word filter (safety.js)
    `<div class="modal-card"><b>Parent link <span class="soon">Coming soon</span></b><span>Connect a parent account to see who you talk to.</span>` +
    `<div class="row"><span>Linked to a parent</span><label class="switch"><input type="checkbox" disabled><span></span></label></div></div>` +
    `<div class="modal-card"><b>Block &amp; report <span class="soon">Coming soon</span></b><span>Stop someone contacting you, or tell a moderator.</span>` +
    `<div class="row"><button class="close" disabled>Block someone</button><button class="close" disabled>Report</button></div></div>` +
    `<div class="modal-card wide"><b>Stay safe online</b><ul><li>Never share passwords, your address, school or phone number.</li>` +
    `<li>People online aren't always who they say they are.</li><li>If something feels wrong, tell a parent or trusted adult.</li>` +
    `<li>Omni never shows bots or fake people pretending to be real.</li></ul></div>`;
}
$('#safetyBtn').onclick = () => { modal('Safety', 'Keeping everyone safe is the whole point of Omni.', safetyHTML()); bindSafety(); };

$('#settingsBtn').onclick = () => {
  const roles = M().roles.map(r => `<option ${r === data.role ? 'selected' : ''}>${esc(r)}</option>`).join('');
  modal('Settings', 'Saved on this device only.',
    `<div class="modal-card wide"><div class="profile-row"><span class="avatar">${avatarHTML(settings.name, { me: true })}</span><div class="grow"><b>Profile picture</b>` +
    `<span>Shown next to your messages and in calls. It's shrunk to a small square and saved on this device.</span><div class="row"><span class="row-left"><button class="close" id="setPfp">${icon('image')} ${myAvatar ? 'Change' : 'Upload'} picture</button>` +
    (myAvatar ? `<button class="close" id="setPfpRemove">${icon('trash')} Remove</button>` : '') + `</span></div></div></div></div>` +
    `<div class="modal-card"><b>Display name</b><input id="setName" class="modal-input" maxlength="24" value="${esc(settings.name)}"></div>` +
    `<div class="modal-card"><b>Status line</b><input id="setStatus" class="modal-input" maxlength="40" placeholder="e.g. Building Omni" value="${esc(settings.status || '')}"></div>` +
    `<div class="modal-card"><b>Your role in ${esc(M().name)} mode</b><select id="setRole" class="modal-input">${roles}</select></div>` +
    `<div class="modal-card"><b>Appearance</b><span>Colours, fonts, background picture, layout.</span><div class="row"><button class="close" id="setCustom">${icon('palette')} Customize</button></div></div>` +
    `<div class="modal-card"><b>Data</b><span>${DESKTOP ? 'Local chats, themes and the whiteboard stay in this Windows app, separate from the website browser.' : 'Everything is stored in this browser.'}</span><div class="row"><button class="close" id="setClear">Clear ${esc(M().name)} data</button></div></div>` +
    `<div class="modal-card wide"><b>Sound &amp; updates</b><span>Omni <b id="setVersion">v${APP_VERSION}</b> · ${DESKTOP ? 'desktop app · internet required for online chat' : (swReg ? 'saved for offline use' : 'offline mode needs https:// or localhost')}</span>` +
    `<div class="row"><span class="row-left"><label class="switch"><input type="checkbox" id="setSound" ${Sounds.prefs.on ? 'checked' : ''}><span></span></label> Sound on</span>` +
    `<span class="row-left"><button class="close" id="setSoundMore">${icon('volume')} Sound settings</button><button class="close" id="setUpdate">${icon('reload')} Check for updates</button></span></div></div>` +
    (typeof onlineCardHTML === 'function' ? onlineCardHTML() : '') +   // firebase.js
    safetyHTML(), () => {
      const name = $('#setName').value.trim() || 'Keagan';
      if (guard(name, 'name') === null) return false;
      const status = $('#setStatus').value.trim();
      if (status && guard(status, 'name') === null) return false;      // status line is checked like a name
      settings.name = name; settings.status = status; data.role = $('#setRole').value;
      saveSettings(); saveData(); renderPeople(); renderChat();
      if (typeof Online !== 'undefined') Online.profileChanged();   // keeps your online name in sync
    }, 'Save');
  bindSafety();
  if (typeof bindOnline === 'function') bindOnline();
  $('#setPfp').onclick = () => { closeModal(); pickAvatar(); };                       // media.js
  if ($('#setPfpRemove')) $('#setPfpRemove').onclick = () => { removeAvatar(); closeModal(); };
  $('#setCustom').onclick = () => { closeModal(); openCustomize(); };
  $('#setSound').onchange = e => { Sounds.set('on', e.target.checked); syncSounds(); if (e.target.checked) Sounds.play('toast', true); };
  $('#setSoundMore').onclick = () => { closeModal(); openCustomize(); $('#soundSection').scrollIntoView({ block: 'start' }); };
  $('#setUpdate').onclick = () => { closeModal(); checkForUpdate(); };
  $('#setClear').onclick = () => {
    if (!confirm(`Delete all ${M().name} mode messages, channels, files and tasks on this device?`)) return;
    localStorage.removeItem(dataKey(settings.mode)); localStorage.removeItem(boardKey(settings.mode));
    data = freshData(settings.mode); view = { type: 'channel', id: Object.keys(srv().channels)[0] };
    closeModal(); renderAll(); sizeWB(); toast('Cleared');
  };
};

$('#membersBtn').onclick = () => modal(M().labels.people, 'Only real people appear in Omni. Remote users need a server connection (coming later).',
  `<div class="modal-card"><b>${esc(settings.name)}</b><span>You · ${esc(data.role)} · Online</span></div><div class="modal-card"><b>Remote participants</b><span>0 connected</span></div>`);

$('#searchBtn').onclick = () => modal('Search', `Search your saved ${M().name} messages.`,
  '<div class="modal-card wide"><input id="searchInput" class="modal-input" placeholder="Search messages..." maxlength="80"></div>', () => {
    const q = $('#searchInput').value.trim().toLowerCase(); if (!q) return;
    const results = [];
    Object.entries(data.servers).forEach(([s, sv]) => Object.entries(sv.channels).forEach(([ch, arr]) =>
      arr.forEach(m => (m.text || '').toLowerCase().includes(q) && results.push({ where: s + ' › #' + ch, text: m.text }))));
    Object.values(data.dms).forEach(dm => dm.msgs.forEach(m => (m.text || '').toLowerCase().includes(q) && results.push({ where: '@' + dm.name, text: m.text })));
    setTimeout(() => modal('Search results', results.length ? `${results.length} match(es)` : 'No matches',
      results.slice(-8).reverse().map(r => `<div class="modal-card"><b>${esc(r.where)}</b><span>${esc(r.text)}</span></div>`).join('') ||
      '<div class="modal-card wide"><span>No saved messages match.</span></div>'));
  }, 'Search');


$('#attachBtn').onclick = $('#uploadBtn').onclick = () => $('#fileInput').click();
// Note: only the file's name and size are saved, not the file itself
$('#fileInput').onchange = e => {
  const n = e.target.files.length;
  for (const f of e.target.files) data.files.push({ name: f.name, size: f.size, ts: Date.now() });
  saveData(); renderFiles(); toast(`${n} file(s) added`); e.target.value = '';
};

/* ---------- 7. Media (mic, camera, screen share) ---------- */
function inCall() {
  return !!(mediaStream || screenStream || cameraOn || room !== null || hand || $('#livePill').classList.contains('red'));
}
function stopTracks(stream) {
  try { stream?.getTracks().forEach(track => track.stop()); } catch { /* already ended */ }
}
function resetCallChrome() {
  for (const id of ['localVideo', 'screenVideo']) {
    const el = $('#' + id); if (!el) continue;
    try { el.srcObject = null; } catch { /* ignore */ }
    el.style.display = 'none';
  }
  $('#localFace').style.display = 'grid';
  $('#screenCard').style.display = 'block';
  $('#screenLabel').textContent = 'Screen share is off';
  $('#shareBtn').classList.remove('active'); $('#shareBtn .label').textContent = 'Share';
  $('#cameraBtn').classList.remove('active'); $('#cameraBtn .label').textContent = 'Camera';
  $('#micBtn').classList.remove('active'); $('#micBtn .label').textContent = 'Mute';
  $('#localMic').innerHTML = icon('mic');
  $('#raiseBtn').classList.remove('active'); $('#raiseBtn .label').textContent = 'Raise hand';
  $('#livePill').textContent = 'READY'; $('#livePill').classList.remove('red');
  if ($('#meetingCount')) $('#meetingCount').textContent = 'Not in a call';
}
/* Drop every local capture. Remote text chats are left alone: there is no call subscription. */
function stopCapture() {
  const media = mediaStream, screen = screenStream;
  mediaStream = null; screenStream = null; cameraOn = false; muted = false; hand = false;
  stopTracks(screen); stopTracks(media);
  resetCallChrome();
}
/* Leave the lounge and the call. Safe to call again. silent: no sound or toast (mode switch). */
function syncCallView() {
  const panel = $('#meetingPanel');
  if (panel) panel.classList.toggle('in-call', !!callJoined);
  if ($('#callIdleTitle')) $('#callIdleTitle').textContent = M().labels.meeting || 'Call';
}
function leaveCall(opts = {}) {
  const was = callJoined || !!(mediaStream || screenStream || cameraOn || hand || $('#livePill').classList.contains('red'));
  callGen++;
  callJoined = false;
  const wasRoom = room;
  stopCapture();
  if (wasRoom !== null) { room = null; renderRooms(); }
  syncCallView();
  renderEmphasis();
  if (!was) return false;
  if (!opts.silent) { Sounds.play('leave'); toast('You left the call'); }
  return true;
}
async function startMedia(video = false, opts = {}) {
  const gen = opts.gen;
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!video });
    if (gen !== undefined && gen !== callGen) { stopTracks(stream); return false; }
    stopTracks(mediaStream);
    mediaStream = stream;
    if (video) {
      $('#localVideo').srcObject = mediaStream; $('#localVideo').style.display = 'block'; $('#localFace').style.display = 'none'; cameraOn = true;
    }
    mediaStream.getAudioTracks().forEach(t => t.enabled = !muted);
    $('#livePill').textContent = 'LIVE'; $('#livePill').classList.add('red');
    if ($('#meetingCount')) $('#meetingCount').textContent = '1 participant';
    if (!opts.quiet) { Sounds.play('join'); toast('Meeting media connected'); }
    return true;
  } catch {
    stopTracks(stream);
    if (!opts.quiet) toast('Browser blocked microphone/camera permission');
    return false;
  }
}
/* Squad rooms only pick a room. The microphone starts from Join Call, not from opening a channel or a room. */
function enterLounge(i) {
  const rooms = M().rooms || [];
  if (!Number.isInteger(i) || i < 0 || i >= rooms.length) return;
  room = room === i ? null : i;
  renderRooms();
}
async function joinCall() {
  if (callJoined && mediaStream) return;
  const gen = ++callGen;
  const ok = await startMedia(false, { quiet: true, gen });
  if (gen !== callGen) return;
  if (!ok || !mediaStream) {
    callJoined = false;
    stopCapture();
    syncCallView();
    toast('Could not join the call. The microphone was not allowed.');
    return;
  }
  callJoined = true;
  syncCallView();
  renderEmphasis();
  Sounds.play('join');
  toast('Joined the call');
}
async function toggleMic() {
  if (!callJoined) return;
  if (!mediaStream) return;
  muted = !muted; mediaStream.getAudioTracks().forEach(t => t.enabled = !muted);
  $('#micBtn').classList.toggle('active', muted); $('#micBtn .label').textContent = muted ? 'Unmute' : 'Mute';
  $('#localMic').innerHTML = icon(muted ? 'micOff' : 'mic');
}
$('#micBtn').onclick = toggleMic;
$('#joinCallBtn').onclick = () => joinCall();
$('#callBtn').onclick = () => { if (callJoined) return toast('You are already in the call'); joinCall(); };
$('#cameraBtn').onclick = async () => {
  if (!callJoined) return;
  if (cameraOn) {
    mediaStream?.getVideoTracks().forEach(t => t.stop()); cameraOn = false;
    $('#localVideo').style.display = 'none'; $('#localFace').style.display = 'grid';
    $('#cameraBtn').classList.remove('active'); $('#cameraBtn .label').textContent = 'Camera'; return;
  }
  await startMedia(true);
  if (cameraOn) { $('#cameraBtn').classList.add('active'); $('#cameraBtn .label').textContent = 'Stop camera'; }
};
$('#videoBtn').onclick = () => $('#cameraBtn').click();
$('#shareBtn').onclick = async () => {
  if (!callJoined) return;
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop()); screenStream = null;
    $('#screenVideo').style.display = 'none'; $('#screenCard').style.display = 'block'; $('#screenLabel').textContent = 'Screen share is off';
    $('#shareBtn').classList.remove('active'); $('#shareBtn .label').textContent = 'Share'; return;
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    $('#screenVideo').srcObject = screenStream; $('#screenVideo').style.display = 'block'; $('#screenCard').style.display = 'none';
    $('#screenLabel').textContent = 'You are sharing your screen'; $('#shareBtn').classList.add('active'); $('#shareBtn .label').textContent = 'Stop sharing';
    screenStream.getVideoTracks()[0].addEventListener('ended', () => screenStream && $('#shareBtn').click());
  } catch { toast('Screen sharing cancelled or unavailable'); }
};
$('#raiseBtn').onclick = () => {
  hand = !hand; $('#raiseBtn').classList.toggle('active', hand);
  if (hand) Sounds.play('hand');
  $('#raiseBtn .label').textContent = hand ? 'Lower hand' : 'Raise hand'; toast(hand ? 'Hand raised ✋' : 'Hand lowered');
};
$('#reactBtn').onclick = () => { Sounds.play('reaction'); toast('Reaction sent 👍'); };
$('#leaveBtn').onclick = () => leaveCall();
$('#copyBtn').onclick = async () => {
  const link = (DESKTOP ? PUBLIC_WEB_URL : location.href.split('#')[0]) + '#meeting=' + slug(M().labels.meeting + '-' + data.server);
  try { await navigator.clipboard.writeText(link); toast('Meeting link copied'); }
  catch { modal('Meeting link', 'Copy this link. (Other people can only join once Omni has a server.)', `<div class="modal-card wide"><span>${esc(link)}</span></div>`); }
};
$('#inviteBtn').onclick = () => $('#copyBtn').click();

/* ---------- 8. Whiteboard (saved per mode) ---------- */
const wb = $('#wbCanvas'), ctx = wb.getContext('2d');
let drawing = false;
function sizeWB() {
  const r = wb.getBoundingClientRect(); if (!r.width || !r.height) return;
  const dpr = window.devicePixelRatio || 1;
  wb.width = Math.floor(r.width * dpr); wb.height = Math.floor(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineWidth = 2.5; ctx.lineCap = ctx.lineJoin = 'round';
  const url = localStorage.getItem(boardKey(settings.mode));   // redraw the saved picture
  if (url) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height); img.src = url; }
}
new ResizeObserver(sizeWB).observe(wb);
wb.onpointerdown = e => {
  drawing = true; wb.setPointerCapture(e.pointerId);
  ctx.strokeStyle = themeFor(settings.mode).accent; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY);
};
wb.onpointermove = e => { if (!drawing) return; ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); $('#wbStatus').textContent = 'drawing…'; };
wb.onpointerup = wb.onpointercancel = () => {
  if (!drawing) return; drawing = false;
  if (store(boardKey(settings.mode), wb.toDataURL('image/png'))) $('#wbStatus').textContent = 'saved on this device';
};
$('#wbClear').onclick = () => { ctx.clearRect(0, 0, wb.width, wb.height); localStorage.removeItem(boardKey(settings.mode)); $('#wbStatus').textContent = 'cleared'; };

/* ---------- 9. Customize panel ---------- */
$('#fontSelect').innerHTML = $('#headFontSelect').innerHTML = Object.entries(FONTS).map(([k, f]) => `<option value="${k}">${f.name}</option>`).join('');
// How each slider's number is shown next to it
const OUT = {
  fontSize: v => v + 'px', radius: v => v + 'px', sideWidth: v => v + 'px', bgBlur: v => v + 'px',
  letterSpacing: v => (v / 100).toFixed(2) + 'em', lineHeight: v => (v / 100).toFixed(2),
  msgWidth: v => v >= 1400 ? 'Full' : v + 'px', grain: v => v + '%', bgDim: v => v + '%'
};

function openCustomize() { syncCustomize(); $('#customize').classList.add('open'); }
$('#customizeBtn').onclick = () => $('#customize').classList.contains('open') ? $('#customize').classList.remove('open') : openCustomize();
$('#closeCustomize').onclick = () => $('#customize').classList.remove('open');

// Copy the current theme values into the controls
function syncCustomize() {
  const t = themeFor(settings.mode);
  $('#customizeMode').textContent = `${M().name} mode · saved separately for each mode`;
  $$('#customize [data-k]').forEach(el => { el.value = t[el.dataset.k]; });
  $$('#customize [data-out]').forEach(el => { const k = el.dataset.out; el.textContent = (OUT[k] || (v => v))(t[k]); });
  // Is the text easy to read on the panels? (WCAG: 4.5 is OK, 7 is great)
  const c = contrast(t.text, t.panel);
  $('#contrastNote').innerHTML = `Text contrast <b>${c.toFixed(1)}:1</b> ${c >= 7 ? '✓ great' : c >= 4.5 ? '✓ OK' : '⚠ hard to read'}`;
  if (typeof syncBackgroundControls === 'function') syncBackgroundControls();   // media.js
  renderPresets();
  $$('#customize [data-panel]').forEach(el => { el.checked = !!t.panels[el.dataset.panel]; });
  const light = isLight(t.panel);
  $$('#customize [data-scheme]').forEach(b => b.classList.toggle('active', (b.dataset.scheme === 'light') === light));
  syncSounds();
}
// Sound controls (these are shared by all modes, so they live in sounds.js, not the theme)
$('#sndStyle').innerHTML = '<option value="auto">Match the mode</option>' +
  Object.entries(Sounds.STYLES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
function syncSounds() {
  const p = Sounds.prefs;
  $$('#customize [data-snd]').forEach(el => { if (el.type === 'checkbox') el.checked = !!p[el.dataset.snd]; else el.value = p[el.dataset.snd]; });
  $('[data-sndout="volume"]').textContent = p.volume + '%';
  $('#soundControls').classList.toggle('muted', !p.on);
}
// Save a change to the current mode's theme, then re-apply it
function updateTheme(change) {
  const t = themeFor(settings.mode); change(t);
  settings.themes[settings.mode] = t; saveSettings(); applyTheme(); syncCustomize();
}
$('#customize').addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.k) updateTheme(t => { t[el.dataset.k] = el.type === 'range' ? Number(el.value) : el.value; });
  else if (el.dataset.panel) updateTheme(t => { t.panels[el.dataset.panel] = el.checked; });
  else if (el.dataset.snd) {
    Sounds.set(el.dataset.snd, el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value);
    syncSounds();
  }
});
// Hear a preview when you let go of the volume slider or pick a new style
$('#customize').addEventListener('change', e => {
  if (e.target.dataset.snd === 'volume' || e.target.dataset.snd === 'style') Sounds.play('receive', true);
});
// ▶ Test buttons
$('#customize').addEventListener('click', e => {
  const b = e.target.closest('[data-test]'); if (!b) return;
  if (!Sounds.prefs.volume) return toast('Volume is at 0%');
  Sounds.test(b.dataset.test);
});
// Dark / Light: use the mode's own colours if they match, otherwise the generic ones
function setScheme(scheme) {
  const def = MODES[settings.mode].theme, defLight = isLight(def.panel);
  const colours = (scheme === 'light') === defLight ? { bg: def.bg, panel: def.panel, text: def.text } : SCHEMES[scheme];
  updateTheme(t => Object.assign(t, colours));
}
/* Saved themes: give the current look a name and use it again later (in any mode) */
function renderPresets() {
  const names = Object.keys(settings.presets || {});
  $('#presetList').innerHTML = names.length ? names.map(n => {
    const t = settings.presets[n];
    return `<div class="preset"><span class="sw">${['bg', 'panel', 'accent', 'accent2', 'text'].map(k => `<i style="background:${t[k]}"></i>`).join('')}</span>` +
      `<span class="nm">${esc(n)}</span><button class="close" data-preset-use="${esc(n)}">Use</button><button class="close" data-preset-del="${esc(n)}" aria-label="Delete ${esc(n)}">${icon('trash')}</button></div>`;
  }).join('') : '<p class="tiny">No saved themes yet.</p>';
}
$('#presetSave').onclick = () => {
  const n = $('#presetName').value.trim(); if (!n) return toast('Give your theme a name first');
  if (guard(n, 'name') === null) return;   // theme names go through the family filter too
  settings.presets ||= {}; settings.presets[n] = themeFor(settings.mode);
  saveSettings(); $('#presetName').value = ''; renderPresets(); toast(`Saved “${n}”`);
};
$('#presetName').addEventListener('keydown', e => { if (e.key === 'Enter') $('#presetSave').click(); });
$('#presetList').onclick = e => {
  const use = e.target.closest('[data-preset-use]'), del = e.target.closest('[data-preset-del]');
  if (use) { const t = settings.presets[use.dataset.presetUse]; if (t) { settings.themes[settings.mode] = cleanTheme(t); saveSettings(); applyTheme(); syncCustomize(); toast('Theme applied'); } }
  if (del) { delete settings.presets[del.dataset.presetDel]; saveSettings(); renderPresets(); }
};

$('#resetTheme').onclick = () => { delete settings.themes[settings.mode]; saveSettings(); applyTheme(); syncCustomize(); toast('Back to the ' + M().name + ' default look'); };

$('#exportTheme').onclick = () => {
  const json = JSON.stringify({ app: 'omni', type: 'theme', version: 1, mode: settings.mode, theme: themeFor(settings.mode) }, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `omni-theme-${settings.mode}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('Theme exported');
};
$('#importTheme').onclick = () => $('#themeInput').click();
$('#themeInput').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    settings.themes[settings.mode] = cleanTheme(obj.theme || obj);
    saveSettings(); applyTheme(); syncCustomize(); toast('Theme imported into ' + M().name + ' mode');
  } catch { toast('That file is not a valid Omni theme'); }
};
// Only accept values we understand (never trust a file blindly!)
function cleanTheme(input) {
  if (!input || typeof input !== 'object') throw new Error('bad theme');
  const t = themeFor(settings.mode), hex = /^#[0-9a-f]{6}$/i;
  ['accent', 'accent2', 'bg', 'panel', 'text'].forEach(k => { if (hex.test(input[k])) t[k] = input[k].toLowerCase(); });
  if (FONTS[input.font]) t.font = input.font;
  if (FONTS[input.headFont]) t.headFont = input.headFont;
  const num = (k, lo, hi) => { if (Number.isFinite(input[k])) t[k] = Math.min(hi, Math.max(lo, Math.round(input[k]))); };
  num('fontSize', 12, 20); num('radius', 0, 24); num('letterSpacing', -3, 10); num('lineHeight', 115, 190);
  num('msgWidth', 420, 1400); num('sideWidth', 190, 340); num('grain', 0, 100); num('bgDim', 0, 85); num('bgBlur', 0, 20);
  const pick = (k, ok) => { if (ok.includes(input[k])) t[k] = input[k]; };
  pick('density', ['compact', 'comfortable']); pick('layout', ['meeting', 'chat']);
  pick('sidebar', ['left', 'right']); pick('chatStyle', ['bubbles', 'list']);
  pick('avatarShape', ['circle', 'rounded', 'square', 'hex']); pick('iconStyle', ['sketch', 'line', 'bold']); pick('motion', ['on', 'off']);
  if (input.panels && typeof input.panels === 'object') ALL_PANELS.forEach(k => { if (typeof input.panels[k] === 'boolean') t.panels[k] = input.panels[k]; });
  return t;
}

/* ---------- 10. Welcome screen + mode switching ---------- */
let pickedMode = settings.mode;
function showWelcome() {
  pickedMode = settings.mode;
  $('#modeCards').innerHTML = Object.entries(MODES).map(([key, m]) => {
    const t = themeFor(key);
    return `<button class="mode-card ${key === pickedMode ? 'selected' : ''}" data-pick="${key}" style="--c:${t.accent}">` +
      `<div class="swatch" style="background:${t.bg}"><i style="background:${t.panel};border:1px solid ${t.accent}55"></i>` +
      `<i style="background:${t.panel}"></i><i style="background:${t.panel};box-shadow:inset 0 -14px 0 ${t.accent},inset 6px 0 0 ${t.accent2}"></i></div>` +
      `<h3>${icon(m.icon)} ${esc(m.name)}</h3><p>${esc(m.tagline)}</p></button>`;
  }).join('');
  $('#welcomeName').value = settings.name;
  $('#welcome').classList.add('show');
}
$('#modeCards').onclick = e => {
  const card = e.target.closest('[data-pick]'); if (!card) return;
  pickedMode = card.dataset.pick;
  $$('.mode-card').forEach(c => c.classList.toggle('selected', c === card));
};
$('#welcomeStart').onclick = () => {
  const name = $('#welcomeName').value.trim() || 'Keagan';
  if (guard(name, 'name') === null) return;
  settings.name = name;
  settings.welcomed = true; saveSettings();
  $('#welcome').classList.remove('show');
  switchMode(pickedMode, true); migrateOld();
  toast(`Welcome, ${settings.name}! ${M().name} mode`);
};

function switchMode(mode, quiet) {
  if (!MODES[mode]) return;
  leaveCall({ silent: true });
  settings.mode = mode; saveSettings();
  data = loadData(mode); room = null;
  if (typeof Online !== 'undefined') Online.attach();   // online chats show in every mode
  view = { type: 'channel', id: Object.keys(srv().channels)[0] };
  applyTheme(); renderAll();
  if ($('#customize').classList.contains('open')) syncCustomize();
  if (!quiet) toast(`${M().name} mode`);
}

// Copy messages from the old version (omni_v2) into the first mode you pick, once
function migrateOld() {
  const old = load(OLD_KEY, null);
  if (!old || settings.migrated) return;
  settings.migrated = true; saveSettings();
  const fix = arr => (Array.isArray(arr) ? arr : []).map(m => ({ text: String(m.text ?? ''), ts: m.ts || Date.now(), from: settings.name }));
  Object.entries(old.channels || {}).forEach(([ch, arr]) => { if (arr?.length) srv().channels[ch] = (srv().channels[ch] || []).concat(fix(arr)); });
  Object.entries(old.dms || {}).forEach(([id, arr]) => { data.dms[id] ||= { name: prettyName(id), msgs: [] }; data.dms[id].msgs.push(...fix(arr)); });
  (old.files || []).forEach(f => data.files.push(f));
  saveData(); renderAll(); toast('Your old Omni messages were copied in');
}

/* ---------- 11. Install as an app + offline ---------- */
let deferredInstall = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
window.addEventListener('appinstalled', () => { Sounds.play('installed'); toast('Omni installed', 3000); $('#installBtn').style.display = 'none'; });
if (standalone() || DESKTOP) $('#installBtn').style.display = 'none';
$('#installBtn').onclick = async () => {
  if (deferredInstall) {
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === 'accepted') toast('Omni installed');
    deferredInstall = null; return;
  }
  modal('Install Omni', 'Omni can be installed like a normal app (it works offline too).',
    '<div class="modal-card"><b>Chrome / Edge (computer)</b><span>Click the install icon ⊕ at the right of the address bar, or Menu ⋮ → “Install Omni”.</span></div>' +
    '<div class="modal-card"><b>Android</b><span>Chrome menu ⋮ → “Add to Home screen” / “Install app”.</span></div>' +
    '<div class="modal-card"><b>iPhone / iPad</b><span>Safari → Share ⬆ → “Add to Home Screen”.</span></div>' +
    '<div class="modal-card"><b>Not showing?</b><span>The site must be on https:// (e.g. GitHub Pages) or http://localhost. Opening the file directly won\'t work.</span></div>');
};

/* The service worker (sw.js) saves the app so it opens offline, and tells us
   when a newer version has been downloaded. The steps of an update:
     1. The browser notices sw.js changed and downloads the new files
     2. The new worker waits → we show the "Update available" banner
     3. You press "Update now" → we tell it to take over (SKIP_WAITING)
     4. "controllerchange" fires → we reload, and say "Updated to vX" */
let swReg = null, waitingWorker = null, updateRequested = false;

function showUpdateBanner(worker) {
  waitingWorker = worker;
  if (!$('#updateBanner').classList.contains('show')) Sounds.play('updateAvailable');
  $('#updateBanner').classList.add('show');
}
$('#updateLater').onclick = () => $('#updateBanner').classList.remove('show');
$('#updateNow').onclick = () => {
  if (!waitingWorker) return location.reload();
  updateRequested = true;
  localStorage.setItem('omni_v3_updated_from', APP_VERSION);   // remember the old version
  $('#updateNow').textContent = 'Updating…';
  waitingWorker.postMessage('SKIP_WAITING');
  setTimeout(() => location.reload(), 4000);   // just in case controllerchange never comes
};

async function checkForUpdate() {
  if (DESKTOP) return toast('Omni does not download updates by itself yet. Replace the files in this same Omni folder when you have a newer copy. Your sign-in stays on this Windows profile.', 5000);
  if (!swReg) return toast('Updates need Omni to be opened from https:// or localhost', 3500);
  if (waitingWorker) return showUpdateBanner(waitingWorker);
  toast('Checking for updates…');
  try { await swReg.update(); } catch { return toast('Could not check for updates (offline?)'); }
  setTimeout(() => { if (!swReg.installing && !swReg.waiting) toast(`You have the latest version (v${APP_VERSION}) ✓`, 3000); }, 800);
}

if ('serviceWorker' in navigator && window.isSecureContext && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    swReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing; if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state !== 'installed') return;
        if (navigator.serviceWorker.controller) showUpdateBanner(worker);   // a new version is waiting
        else { Sounds.play('installed'); toast('Omni is saved for offline use ✓', 3000); }   // very first install
      });
    });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);   // check again every 30 minutes
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) location.reload();   // the new version took over: reload to use it
  });
}

// Just updated? Celebrate! (the old version left a note before reloading)
const updatedFrom = localStorage.getItem('omni_v3_updated_from');
if (updatedFrom) {
  localStorage.removeItem('omni_v3_updated_from');
  if (updatedFrom !== APP_VERSION) {
    Sounds.play('updated');   // plays straight away, or on your first click (autoplay rule)
    setTimeout(() => toast(`Updated to v${APP_VERSION} (from v${updatedFrom})`, 4500), 300);
  }
}

/* ---------- Start! ---------- */
applyAppName();   // "Omni" → APP_NAME from config.js
applyTheme(); renderAll(); resetCallChrome();
if (DESKTOP) { const w = $('#welcome'); if (w) w.classList.remove('show'); }
else if (!settings.welcomed) showWelcome();
