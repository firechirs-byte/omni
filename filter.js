/* =====================================================================
   Omni — filter.js   (family word filter + parent/guardian PIN)

   How the filter decides if a word is rude:
     1. plain()  – turns a word into plain letters: "Sh!T" → "shit",
                   "$h1t" → "shit", "f.u.c.k" → "fuck", "fück" → "fuck"
     2. pattern  – one big regular expression built from the word list.
                   Each letter may repeat, so "fuuuuck" still matches.
     3. find()   – checks WHOLE words only, so "class", "grass" and
                   "Scunthorpe" are fine (that's the "Scunthorpe problem").
                   It also joins spaced-out letters: "f u c k".

   Honest note: this runs only on this device until Omni has a server.
   The PIN is stored as a SHA-256 hash (never the PIN itself). A hash stops
   people peeking at the PIN, but it's not bank-level security.
   ===================================================================== */
const Filter = (() => {
  const KEY = 'omni_v3_filter', LOCK_KEY = 'omni_v3_filter_lock';
  const blank = () => ({ setup: false, enabled: false, action: 'replace', pinHash: '', salt: '', adult: null, added: [], removed: [], allowed: [], resetAt: null });
  let st = blank();
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* defaults */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* storage full */ } rebuild(); };

  /* ---------- 1. Plain letters ---------- */
  const SWAPS = { '@': 'a', '4': 'a', '$': 's', '5': 's', '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '7': 't', '+': 't', '8': 'b', '€': 'e' };
  const plain = chunk => String(chunk).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')       // ü → u
    .replace(/[@4$5013!|78+€]/g, c => SWAPS[c])             // symbol swaps
    .replace(/[^a-z]/g, '');                                // drop dots, dashes, spaces…

  /* ---------- 2. The pattern ---------- */
  let pattern = null, allowedSet = new Set();
  function words() {
    const removed = new Set(st.removed);
    return [...new Set([...FILTER_WORDS, ...st.added])].filter(w => !removed.has(w));
  }
  function rebuild() {
    const exact = [], stretchy = [];
    words().forEach(w => {
      const onlyThis = w.endsWith('!'), base = w.replace(/[^a-z]/g, '');
      if (!base) return;
      const p = base.split('').map(c => c + '+').join('');  // "ass" → "a+s+s+"
      (onlyThis || base.length < 4 ? exact : stretchy).push(p);
    });
    const parts = [];
    if (exact.length) parts.push(`(?:${exact.join('|')})`);
    if (stretchy.length) parts.push(`(?:${stretchy.join('|')})(?:s|es|ed|er|ers|ing|in|y)?`);  // endings
    pattern = parts.length ? new RegExp(`^(?:${parts.join('|')})$`) : null;
    allowedSet = new Set(st.allowed.map(plain));
  }
  rebuild();

  /* ---------- 3. Finding rude words ---------- */
  const isBad = s => !!pattern && s.length > 1 && !allowedSet.has(s) && pattern.test(s);
  const LEAD = /^[("'“‘«[]*/, TRAIL = /[.,!?;:)"'”’»\]…]*$/;

  // Returns [start, end] positions of every rude word in the text
  function find(text) {
    const toks = [];
    for (const m of String(text).matchAll(/\S+/g)) {
      const raw = m[0], lead = raw.match(LEAD)[0].length;
      const trail = Math.min(raw.length - lead, raw.match(TRAIL)[0].length);
      const core = raw.slice(lead, raw.length - trail);
      if (core) toks.push({ start: m.index + lead, end: m.index + raw.length - trail, p: plain(core) });
    }
    const hits = [];
    toks.forEach(t => { if (isBad(t.p)) hits.push([t.start, t.end]); });
    // Words joined by - _ . / like "this-shit" or "bad_word": test each part too
    for (const m of String(text).matchAll(/[^\s\-_./\\,~:;]+/g)) {
      const p = plain(m[0]);
      if (p.length > 1 && isBad(p)) hits.push([m.index, m.index + m[0].length]);
    }
    // Spaced-out letters like "f u c k": join runs of single letters and test them
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].p.length !== 1) continue;
      let j = i;
      while (j + 1 < toks.length && toks[j + 1].p.length === 1) j++;
      for (let a = i; a <= j; a++) for (let b = a + 2; b <= j; b++) {
        if (isBad(toks.slice(a, b + 1).map(t => t.p).join(''))) hits.push([toks[a].start, toks[b].end]);
      }
      i = j;
    }
    // sort and merge overlapping hits
    hits.sort((x, y) => x[0] - y[0]);
    return hits.reduce((out, h) => {
      const last = out[out.length - 1];
      if (last && h[0] <= last[1]) last[1] = Math.max(last[1], h[1]); else out.push([...h]);
      return out;
    }, []);
  }
  // Swap rude words for stars: "what the ****!"
  function clean(text) {
    let out = '', last = 0;
    find(text).forEach(([s, e]) => { out += text.slice(last, s) + '*'.repeat(e - s); last = e; });
    return out + text.slice(last);
  }

  /* apply(text, kind) is what the app calls before saving anything.
     kind 'message' follows the parent's choice (replace or block);
     kind 'name' (display names, channel names) is always blocked. */
  function apply(text, kind = 'message') {
    if (!st.setup || !st.enabled || !text) return { ok: true, text, changed: false };
    if (!find(text).length) return { ok: true, text, changed: false };
    if (kind === 'name' || st.action === 'block') return { ok: false, text, changed: false };
    return { ok: true, text: clean(text), changed: true };
  }

  /* ---------- PIN (4–6 digits, stored as a salted SHA-256 hash) ---------- */
  const PIN_OK = /^\d{4,6}$/;
  const canHash = () => !!(window.crypto && crypto.subtle);
  async function hash(pin, salt) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function setupAdult({ name, relationship, pin, action, enabled }) {
    const salt = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
    st = { ...blank(), setup: true, enabled, action, salt, pinHash: await hash(pin, salt), adult: { name, relationship, at: Date.now() }, resetAt: st.resetAt };
    save();
  }
  // 5 wrong PINs in a row = locked for 60 seconds
  let fails = 0;
  async function checkPin(pin) {
    const lockedUntil = Number(localStorage.getItem(LOCK_KEY) || 0);
    if (Date.now() < lockedUntil) return { ok: false, locked: Math.ceil((lockedUntil - Date.now()) / 1000) };
    if (st.setup && PIN_OK.test(pin) && await hash(pin, st.salt) === st.pinHash) { fails = 0; return { ok: true }; }
    if (++fails >= 5) { fails = 0; localStorage.setItem(LOCK_KEY, String(Date.now() + 60000)); return { ok: false, locked: 60 }; }
    return { ok: false, left: 5 - fails };
  }

  /* ---------- Changes (the app only calls these after the PIN was checked) ---------- */
  const tidy = w => { const only = String(w).trim().endsWith('!'); const b = plain(w); return b ? b + (only ? '!' : '') : ''; };
  function addWord(w) {
    const word = tidy(w); if (!word) return false;
    if (st.removed.includes(word)) st.removed = st.removed.filter(x => x !== word);
    else if (!FILTER_WORDS.includes(word) && !st.added.includes(word)) st.added.push(word);
    save(); return true;
  }
  function removeWord(word) {
    if (st.added.includes(word)) st.added = st.added.filter(x => x !== word);
    else if (!st.removed.includes(word)) st.removed.push(word);
    save();
  }
  function addAllowed(w) { const a = plain(w); if (!a || st.allowed.includes(a)) return false; st.allowed.push(a); save(); return true; }
  function removeAllowed(a) { st.allowed = st.allowed.filter(x => x !== a); save(); }

  return {
    apply, find, clean, plain, PIN_OK, canHash, setupAdult, checkPin, addWord, removeWord, addAllowed, removeAllowed,
    words: () => words().map(w => ({ word: w, base: w.replace(/!$/, ''), isDefault: FILTER_WORDS.includes(w) })),
    get state() { const { pinHash, salt, ...rest } = st; return JSON.parse(JSON.stringify(rest)); },
    setEnabled(on) { st.enabled = !!on; save(); },
    setAction(a) { if (a === 'replace' || a === 'block') { st.action = a; save(); } },
    reset() { st = { ...blank(), resetAt: Date.now() }; localStorage.removeItem(LOCK_KEY); save(); }
  };
})();
