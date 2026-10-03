/* =====================================================================
   Omni — media.js   (pictures)
     1. Loading + shrinking pictures (so they fit in localStorage)
     2. Profile picture: pick → crop to a square → 256 × 256
     3. Background picture (one per mode) with dim + blur
     4. "Match Omni's colours to this picture?" – finds the main colours
        with k-means, then makes sure text stays readable (WCAG contrast)
   Everything stays in this browser. Pictures are shrunk first because
   localStorage only holds about 5 MB for the whole app.
   ===================================================================== */

/* ---------- 1. Loading + shrinking ---------- */
const AVATAR_KEY = 'omni_v4_avatar';
const bgKey = mode => 'omni_v4_bg_' + mode;

// File → <img>. Rejects things that aren't pictures.
function fileToImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('not an image'));
    if (file.size > 25 * 1024 * 1024) return reject(new Error('too big'));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('broken')); };
    img.src = url;
  });
}
// Any picture (or data URL) → <img>
function loadImage(src) {
  return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
}
// Canvas → the smallest good data URL (WebP if the browser can, else JPEG)
function canvasToURL(canvas, quality) {
  const webp = canvas.toDataURL('image/webp', quality);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality);
}
function pictureError(err) {
  toast(err.message === 'too big' ? 'That picture is too big (max 25 MB).' : 'That file isn\'t a picture Omni can open.', 3500);
}

/* ---------- 2. Profile picture ---------- */
function pickAvatar() { $('#avatarInput').click(); }
$('#avatarInput').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try { openCrop(await fileToImage(file)); } catch (err) { pictureError(err); }
};

// The crop window: drag to move, slider to zoom. The canvas is the real 256 × 256 result.
function openCrop(img) {
  const SIZE = 256;
  let zoom = 1, cx = img.naturalWidth / 2, cy = img.naturalHeight / 2;   // centre of the crop, in picture pixels
  modal('Crop your picture', 'Drag to move it, use the slider to zoom. It\'s saved as a small 256 × 256 square on this device.',
    `<div class="modal-card wide"><div class="crop-wrap"><div class="crop-stage" id="cropStage"><canvas id="cropCanvas" width="${SIZE}" height="${SIZE}"></canvas></div>` +
    `<div class="crop-side"><label class="field">Zoom<input type="range" id="cropZoom" min="1" max="4" step="0.05" value="1"></label>` +
    `<span>Tip: use the arrow keys to nudge it, + and − to zoom.</span></div></div></div>`,
    () => saveAvatar(canvasToURL($('#cropCanvas'), 0.86)), 'Use picture');
  const cv = $('#cropCanvas'), g = cv.getContext('2d');
  const base = SIZE / Math.min(img.naturalWidth, img.naturalHeight);   // zoom 1 = picture just fills the square
  function draw() {
    const s = base * zoom, half = SIZE / 2 / s;
    // keep the picture covering the whole square
    cx = Math.min(img.naturalWidth - half, Math.max(half, cx));
    cy = Math.min(img.naturalHeight - half, Math.max(half, cy));
    g.fillStyle = '#fff'; g.fillRect(0, 0, SIZE, SIZE);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, SIZE / 2 - cx * s, SIZE / 2 - cy * s, img.naturalWidth * s, img.naturalHeight * s);
  }
  draw();
  $('#cropZoom').oninput = e => { zoom = Number(e.target.value); draw(); };
  const stage = $('#cropStage'); stage.tabIndex = 0;
  let drag = null;
  stage.onpointerdown = e => { drag = [e.clientX, e.clientY]; stage.setPointerCapture(e.pointerId); };
  stage.onpointermove = e => {
    if (!drag) return;
    const k = SIZE / stage.clientWidth / (base * zoom);   // screen pixels → picture pixels
    cx -= (e.clientX - drag[0]) * k; cy -= (e.clientY - drag[1]) * k; drag = [e.clientX, e.clientY]; draw();
  };
  stage.onpointerup = stage.onpointercancel = () => { drag = null; };
  stage.onkeydown = e => {
    const step = 12 / (base * zoom), moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { cx += moves[e.key][0]; cy += moves[e.key][1]; }
    else if (e.key === '+' || e.key === '=') zoom = Math.min(4, zoom + 0.1);
    else if (e.key === '-') zoom = Math.max(1, zoom - 0.1);
    else return;
    e.preventDefault(); $('#cropZoom').value = zoom; draw();
  };
}
function saveAvatar(url) {
  if (!store(AVATAR_KEY, url)) return false;   // storage full → keep the window open
  myAvatar = url; renderPeople(); renderChat();
  toast('Profile picture saved');
  Online.avatarChanged(url);   // uploads it when you're signed in online (supabase.js)
  setTimeout(() => askMatch(url, 'profile picture'), 50);
}
function removeAvatar() {
  localStorage.removeItem(AVATAR_KEY); myAvatar = ''; renderPeople(); renderChat(); toast('Profile picture removed');
  Online.avatarChanged(null);
}

/* ---------- 3. Background picture (per mode) ---------- */
const bgCache = {};
const getBackground = (mode = settings.mode) => (bgCache[mode] ??= localStorage.getItem(bgKey(mode)) || '');
const hasBackground = () => !!getBackground();
function showBackground() {
  const url = getBackground();
  $('#bgLayer').style.backgroundImage = url ? `url("${url}")` : '';
}
function syncBackgroundControls() {
  const url = getBackground();
  $('#bgThumb').style.backgroundImage = url ? `url("${url}")` : '';
  $('#bgThumb').textContent = url ? '' : 'No picture';
  $('#bgRemove').disabled = $('#bgMatch').disabled = !url;
  $('#matchPref').value = settings.matchPref || 'ask';
}
// Shrink to at most 1600 px wide/tall. If it's still big, try smaller + lower quality.
async function shrinkBackground(img) {
  for (const [max, q] of [[1600, 0.8], [1280, 0.7], [960, 0.6]]) {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const url = canvasToURL(c, q);
    if (url.length < 900 * 1024) return url;   // under ~0.9 MB of text: good
  }
  return null;
}
$('#bgChoose').onclick = () => $('#bgInput').click();
$('#bgInput').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const url = await shrinkBackground(await fileToImage(file));
    if (!url || !store(bgKey(settings.mode), url)) return toast('That picture is too big to save. Try a smaller one.', 3500);
    bgCache[settings.mode] = url; applyTheme(); syncCustomize();
    toast(`Background set for ${M().name} mode`);
    setTimeout(() => askMatch(url, 'background'), 50);
  } catch (err) { pictureError(err); }
};
$('#bgRemove').onclick = () => {
  localStorage.removeItem(bgKey(settings.mode)); bgCache[settings.mode] = '';
  applyTheme(); syncCustomize(); toast('Background removed');
};
$('#bgMatch').onclick = () => { const url = getBackground(); if (url) askMatch(url, 'background', true); };
$('#matchPref').onchange = e => { settings.matchPref = e.target.value; saveSettings(); };

/* ---------- 4. Colour matching ---------- */
// Little colour helpers: hex ⇄ RGB ⇄ HSL (hue 0-360, saturation + lightness 0-1)
const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgbToHex = rgb => '#' + rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function hslToHex([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

/* k-means: shrink the picture to 48 × 48, then group the pixels into k
   colour "clusters". Each cluster's average is one palette colour. */
function kMeans(pixels, k = 6, rounds = 12) {
  // start from pixels spread evenly through the picture sorted by brightness
  const sorted = [...pixels].sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  let centres = Array.from({ length: k }, (_, i) => sorted[Math.floor((i + 0.5) * sorted.length / k)].slice());
  let groups = [];
  for (let r = 0; r < rounds; r++) {
    groups = centres.map(() => []);
    for (const p of pixels) {
      let best = 0, bestD = Infinity;
      centres.forEach((c, i) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bestD) { bestD = d; best = i; } });
      groups[best].push(p);
    }
    centres = groups.map((g, i) => g.length ? [0, 1, 2].map(ch => g.reduce((sum, p) => sum + p[ch], 0) / g.length) : centres[i]);
  }
  return centres.map((c, i) => ({ hex: rgbToHex(c), share: groups[i].length / pixels.length }))
    .filter(c => c.share > 0).sort((a, b) => b.share - a.share);
}
async function imagePalette(src) {
  const img = await loadImage(src), S = 48, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data, pixels = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) pixels.push([d[i], d[i + 1], d[i + 2]]);
  return kMeans(pixels);
}

// Nudge a colour's lightness until test(colour) is true (or we run out of room)
function adjustUntil(hsl, dir, test) {
  let [h, s, l] = hsl;
  for (let i = 0; i < 60 && !test(hslToHex([h, s, l])); i++) l = Math.min(0.98, Math.max(0.02, l + dir * 0.015));
  return hslToHex([h, s, l]);
}

/* Palette → Omni colours, with readable contrast:
   text on panels ≥ 7:1 (WCAG AAA), button text on the accent ≥ 4.5:1 (AA),
   accent against the panels ≥ 3:1 (so buttons and outlines stand out). */
function themeFromPalette(pal) {
  const avgL = pal.reduce((sum, c) => sum + luminance(c.hex) * c.share, 0);
  const dark = avgL < 0.3;                       // mostly dark picture → dark Omni
  const main = rgbToHsl(hexToRgb(pal[0].hex));
  const sat = Math.min(main[1], 0.35);
  const bg = hslToHex([main[0], sat * 0.9, dark ? 0.07 : 0.93]);
  const panel = hslToHex([main[0], sat * 0.7, dark ? 0.11 : 0.985]);
  const text = adjustUntil([main[0], 0.12, dark ? 0.9 : 0.15], dark ? 1 : -1, c => contrast(c, panel) >= 7);
  // the most colourful clusters (that aren't nearly grey) become the accents
  const colourful = pal.map(c => ({ ...c, hsl: rgbToHsl(hexToRgb(c.hex)) }))
    .map(c => ({ ...c, score: c.hsl[1] * (1 - Math.abs(c.hsl[2] - 0.5)) * Math.sqrt(c.share) }))
    .sort((a, b) => b.score - a.score);
  const pick = (c, fallbackHue) => c && c.hsl[1] > 0.18 ? [c.hsl[0], Math.max(0.45, c.hsl[1]), c.hsl[2]] : [fallbackHue, 0.55, 0.5];
  const a1 = pick(colourful[0], main[0]);
  const second = colourful.find(c => Math.abs(c.hsl[0] - a1[0]) > 35 && c.hsl[1] > 0.18);
  const a2 = pick(second, (a1[0] + 150) % 360);
  // dark Omni: light accent with dark text on it. Light Omni: deep accent with white text.
  const accentOK = c => contrast(c, panel) >= 3 && contrast(c, textOn(c)) >= 4.5 && (dark ? textOn(c) !== '#ffffff' : textOn(c) === '#ffffff');
  const accent = adjustUntil(a1, dark ? 1 : -1, accentOK);
  const accent2 = adjustUntil(a2, dark ? 1 : -1, c => contrast(c, panel) >= 3);
  return {
    colours: { bg, panel, text, accent, accent2 },
    report: { text: contrast(text, panel), button: contrast(accent, textOn(accent)), accent: contrast(accent, panel) }
  };
}

let matchResult = null;
async function askMatch(src, what, force = false) {
  const pref = settings.matchPref || 'ask';
  if (!force && pref === 'never') return;
  let pal;
  try { pal = await imagePalette(src); } catch { return; }
  matchResult = themeFromPalette(pal);
  if (!force && pref === 'always') return applyMatch();
  const { colours: c, report: r } = matchResult;
  const ok = (v, need) => `<b class="${v >= need ? 'ok-mark' : ''}">${v.toFixed(1)}:1</b>`;
  modal('Match Omni\'s colours to this picture?', `Omni found these colours in your ${what}. Text is checked so it stays easy to read.`,
    `<div class="modal-card"><b>Picture colours</b><div class="palette">${pal.slice(0, 6).map(p => `<i style="background:${p.hex};color:${textOn(p.hex)}">${Math.round(p.share * 100)}%</i>`).join('')}</div></div>` +
    `<div class="modal-card"><b>Omni would look like</b><div class="match-preview" style="background:${c.bg};color:${c.text}">` +
    `<div class="mp-top" style="background:${c.panel}"><span>Aa · Hello!</span><span class="mp-btn" style="background:${c.accent};color:${textOn(c.accent)}">Send</span></div>` +
    `<div class="mp-top"><span style="color:${c.accent2}">● second accent</span></div></div></div>` +
    `<div class="modal-card wide"><span>Contrast: text ${ok(r.text, 7)} (needs 7 for AAA) · button text ${ok(r.button, 4.5)} (needs 4.5) · accent vs panels ${ok(r.accent, 3)} (needs 3)</span>` +
    `<div class="match-btns"><button class="confirm" data-match="yes">Yes, match</button><button class="close" data-match="no">No thanks</button>` +
    `<button class="close" data-match="always">Always</button><button class="close" data-match="never">Never</button></div>` +
    `<span>“Always” and “Never” can be changed in Customize → Background picture.</span></div>`, null, null);
  $('#modalGrid').onclick = e => {
    const b = e.target.closest('[data-match]'); if (!b) return;
    const choice = b.dataset.match;
    if (choice === 'always' || choice === 'never') { settings.matchPref = choice; saveSettings(); $('#matchPref').value = choice; }
    closeModal();
    if (choice === 'yes' || choice === 'always') applyMatch();
  };
}
function applyMatch() {
  if (!matchResult) return;
  updateTheme(t => Object.assign(t, matchResult.colours));
  toast(`Colours matched for ${M().name} mode`);
}

// app.js drew the page before this file loaded, so apply the theme once more to show any background
applyTheme();
