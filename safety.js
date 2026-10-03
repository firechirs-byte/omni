/* =====================================================================
   Omni — safety.js   (the screens for the family word filter)
   The filter itself lives in filter.js. This file is the grown-up part:
     • Parent / guardian setup (name, relationship, PIN)
     • PIN check before any change
     • The manager: on/off, replace or block, word list, allowed words
     • Forgot PIN → type RESET
   ===================================================================== */

// The card shown in Safety (shield button) and in Settings
function filterCardHTML() {
  const s = Filter.state;
  const status = !s.setup ? '⏸ Off · not set up yet'
    : `${s.enabled ? 'On' : 'Off'} · ${s.action === 'block' ? 'blocks messages with rude words' : 'replaces rude words with ****'} · set up by ${esc(s.adult.name)} (${esc(s.adult.relationship)})`;
  return `<div class="modal-card wide filter-card"><b>🧹 Family word filter</b><span class="filter-status">${status}</span>` +
    (s.resetAt ? `<span class="warn-note">⚠ This filter was reset on ${new Date(s.resetAt).toLocaleString()}.</span>` : '') +
    `<span>Hides swear words and slurs in messages, edits, forwards, GIF captions, channel names and display names, in every mode. ` +
    `It works on <b>this device only</b> until Omni has a server.</span>` +
    `<div class="row"><span></span><button class="confirm" id="filterBtn">${s.setup ? icon('lock') + ' Manage filter (PIN)' : icon('shield') + ' Parent / guardian setup'}</button></div></div>`;
}
function bindSafety() {
  const b = $('#filterBtn');
  if (b) b.onclick = () => (Filter.state.setup ? askPin() : startSetup());
}

/* ---------- Setup (first time) ---------- */
function startSetup() {
  modal('Parent / guardian setup', 'This part is for a grown-up. Kids: please pass the device to a parent or guardian 🙂',
    `<div class="modal-card wide"><label class="check-line"><input type="checkbox" id="fsAdult"> <em>I am this child's <b>parent or guardian</b>, or their <b>brother/sister aged 18 or over</b>.</em></label></div>` +
    `<div class="modal-card"><b>Your name</b><input id="fsName" class="modal-input" maxlength="30" autocomplete="off"></div>` +
    `<div class="modal-card"><b>Relationship</b><select id="fsRel" class="modal-input"><option value="">Choose…</option>` +
      ['Mum', 'Dad', 'Parent', 'Guardian', 'Brother (18+)', 'Sister (18+)'].map(r => `<option>${r}</option>`).join('') + `</select></div>` +
    `<div class="modal-card"><b>Choose a PIN (4–6 digits)</b><input id="fsPin" class="modal-input" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>` +
    `<div class="modal-card"><b>Type the PIN again</b><input id="fsPin2" class="modal-input" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>` +
    `<div class="modal-card"><b>When a rude word is used</b><select id="fsAction" class="modal-input"><option value="replace">Replace it with ****</option><option value="block">Block sending + friendly warning</option></select></div>` +
    `<div class="modal-card"><b>Turn it on now?</b><div class="row"><span>Filter on</span><label class="switch"><input type="checkbox" id="fsOn" checked><span></span></label></div></div>` +
    `<div class="modal-card wide"><span>🔐 The PIN is saved as a scrambled code (a SHA-256 hash), never as the PIN itself. ` +
    `Omni can't check ages yet, so this is an honour system until real accounts arrive.</span><span class="form-error" id="fsErr"></span></div>`,
    async () => {
      const err = msg => { $('#fsErr').textContent = msg; return false; };
      if (!$('#fsAdult').checked) return err('Please tick the box to confirm you are a parent, guardian or sibling aged 18+.');
      const name = $('#fsName').value.trim(); if (!name) return err('Please enter your name.');
      const rel = $('#fsRel').value; if (!rel) return err('Please choose your relationship.');
      const pin = $('#fsPin').value;
      if (!Filter.PIN_OK.test(pin)) return err('The PIN must be 4 to 6 digits (numbers only).');
      if (pin !== $('#fsPin2').value) return err('The two PINs don\'t match.');
      if (!Filter.canHash()) return err('This browser can\'t store a PIN safely on this address. Open Omni from https://, localhost, or the file itself.');
      await Filter.setupAdult({ name, relationship: rel, pin, action: $('#fsAction').value, enabled: $('#fsOn').checked });
      Sounds.play('installed'); toast('Family filter set up and locked', 3000);
    }, 'Save & lock');
  $('#modalGrid').oninput = () => { $('#fsErr').textContent = ''; };   // hide old errors once they start fixing it
}

/* ---------- PIN check ---------- */
function askPin(next = openManage) {
  const s = Filter.state;
  modal('Enter the parent PIN', `The family filter was set up by ${s.adult.name} (${s.adult.relationship}).`,
    `<div class="modal-card wide"><input id="pinIn" class="modal-input" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="PIN">` +
    `<span class="form-error" id="pinErr"></span><div class="row"><span></span><button class="close" id="forgotPin">Forgot PIN?</button></div></div>`,
    async () => {
      const r = await Filter.checkPin($('#pinIn').value);
      if (r.ok) { next(); return false; }      // next() opens a new screen in the same pop-up
      $('#pinErr').textContent = r.locked ? `Too many wrong tries. Please wait ${r.locked} seconds.` : `Wrong PIN. ${r.left} ${r.left === 1 ? 'try' : 'tries'} left before a 1-minute wait.`;
      $('#pinIn').value = ''; $('#pinIn').focus();
      return false;
    }, 'Unlock');
  $('#forgotPin').onclick = forgotPin;
}

/* ---------- The manager (only reachable after the PIN) ---------- */
let showWords = false;
const mask = w => w[0] + '•'.repeat(Math.max(1, w.length - 1));

function openManage() {
  const s = Filter.state;
  modal('Family word filter · unlocked', 'Unlocked. Changes save straight away and apply in every mode. Press “Done & lock” when finished.',
    `<div class="modal-card"><b>Filter</b><div class="row"><span id="fmOnLabel">${s.enabled ? 'On' : 'Off'}</span><label class="switch"><input type="checkbox" id="fmOn" ${s.enabled ? 'checked' : ''}><span></span></label></div></div>` +
    `<div class="modal-card"><b>When a rude word is used</b><select id="fmAction" class="modal-input">` +
      `<option value="replace" ${s.action === 'replace' ? 'selected' : ''}>Replace it with ****</option>` +
      `<option value="block" ${s.action === 'block' ? 'selected' : ''}>Block sending + friendly warning</option></select></div>` +
    `<div class="modal-card wide"><div class="row top"><b>Blocked words (<i id="fmCount"></i>)</b><label class="check-line"><input type="checkbox" id="fmShow" ${showWords ? 'checked' : ''}> show words</label></div>` +
      `<div class="word-list" id="fmWords"></div>` +
      `<div class="row"><input id="fmAdd" class="mini-input" maxlength="30" placeholder="Add a word" autocomplete="off"><button class="close" id="fmAddBtn">Add</button></div>` +
      `<span>Tip: words with 4+ letters also catch endings like -s, -ed, -ing. End a word with ! to match only that exact word.</span></div>` +
    `<div class="modal-card wide"><b>Allowed words (never hidden)</b><span>Exceptions, e.g. a name, place or word that gets hidden by mistake.</span>` +
      `<div class="word-list" id="fmAllowed"></div>` +
      `<div class="row"><input id="fmAllow" class="mini-input" maxlength="30" placeholder="Allow a word" autocomplete="off"><button class="close" id="fmAllowBtn">Allow</button></div></div>` +
    `<div class="modal-card wide"><b>Try it out</b><input id="fmTry" class="modal-input" placeholder="Type something to test the filter" autocomplete="off"><span id="fmTryOut">Type above to see what the filter would do.</span></div>`,
    () => { toast('Filter settings locked'); }, 'Done & lock');

  const renderWords = () => {
    const words = Filter.words();
    $('#fmCount').textContent = words.length;
    $('#fmWords').innerHTML = words.map(w => `<span class="wchip ${w.isDefault ? '' : 'added'}">${esc(showWords ? w.base : mask(w.base))}` +
      `<button data-rmword="${esc(w.word)}" title="Remove">×</button></span>`).join('') || '<span>No words.</span>';
    $('#fmAllowed').innerHTML = Filter.state.allowed.map(a => `<span class="wchip ok">${esc(a)}<button data-rmallow="${esc(a)}" title="Remove">×</button></span>`).join('') || '<span>None yet.</span>';
  };
  const tryIt = () => {
    const t = $('#fmTry').value; if (!t) return;
    const hits = Filter.find(t).length, st = Filter.state;
    $('#fmTryOut').textContent = !hits ? 'Nothing would be hidden.'
      : (st.action === 'block' ? 'This would be blocked.' : 'Would become: ' + Filter.clean(t)) + (st.enabled ? '' : ' (the filter is off right now)');
  };
  renderWords();
  $('#fmOn').onchange = e => { Filter.setEnabled(e.target.checked); $('#fmOnLabel').textContent = e.target.checked ? 'On' : 'Off'; toast(e.target.checked ? 'Filter on' : 'Filter off'); };
  $('#fmAction').onchange = e => { Filter.setAction(e.target.value); tryIt(); };
  $('#fmShow').onchange = e => { showWords = e.target.checked; renderWords(); };
  const add = () => { if (Filter.addWord($('#fmAdd').value)) { $('#fmAdd').value = ''; renderWords(); tryIt(); toast('Word added'); } };
  const allow = () => { if (Filter.addAllowed($('#fmAllow').value)) { $('#fmAllow').value = ''; renderWords(); tryIt(); toast('Word allowed'); } };
  $('#fmAddBtn').onclick = add; $('#fmAllowBtn').onclick = allow;
  $('#fmAdd').onkeydown = e => { if (e.key === 'Enter') add(); };
  $('#fmAllow').onkeydown = e => { if (e.key === 'Enter') allow(); };
  $('#fmTry').oninput = tryIt;
  $('#fmTry').onkeydown = e => e.stopPropagation();       // Enter here shouldn't press Done
  $('#modalGrid').onclick = e => {
    const rm = e.target.closest('[data-rmword]'), ra = e.target.closest('[data-rmallow]');
    if (rm) { Filter.removeWord(rm.dataset.rmword); renderWords(); tryIt(); }
    if (ra) { Filter.removeAllowed(ra.dataset.rmallow); renderWords(); tryIt(); }
  };
}

/* ---------- Forgot PIN ---------- */
function forgotPin() {
  modal('Forgot the PIN?', 'This resets the family filter on this device.',
    `<div class="modal-card wide"><span>Omni doesn't have accounts yet, so a forgotten PIN can't be recovered. The only option is a reset: ` +
    `it turns the filter <b>off</b> and deletes the PIN, the grown-up's details and any custom words. ` +
    `The reset date is then shown in Safety so a parent can see it happened. Real accounts with proper PIN recovery will come later.</span>` +
    `<b>Type RESET to confirm</b><input id="resetIn" class="modal-input" autocomplete="off"></div>`,
    () => {
      if ($('#resetIn').value.trim() !== 'RESET') { toast('Type RESET in capital letters to confirm'); return false; }
      Filter.reset(); toast('Family filter reset', 3000);
    }, 'Reset filter');
}
