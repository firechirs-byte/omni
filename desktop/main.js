/* Omni desktop window.
   Loads the same HTML/CSS/JS as the website, from a private omni://app
   origin. The page does not get Node. Other websites open in the system
   browser. Camera and microphone stay on this window, not on mini-browser
   frames. There is no auto-updater: a new version is a new installer. */
const { app, BrowserWindow, Menu, desktopCapturer, ipcMain, protocol, session, shell, webContents } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const policy = require('./policy');
const updates = require('./updates');

const version = require('../package.json').version;
const selfTest = process.argv.includes('--omni-self-test');
const opened = [];

if (selfTest) {
  app.setPath('userData', path.join(app.getPath('temp'), 'omni-desktop-self-test'));
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}

app.userAgentFallback = `${app.userAgentFallback} OmniDesktop/${version}`;
app.setAppUserModelId('io.github.firechirs-byte.omni');
app.enableSandbox();

protocol.registerSchemesAsPrivileged([{
  scheme: 'omni',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
    allowServiceWorkers: false
  }
}]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

const CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "worker-src 'none'",
  "script-src 'self' https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "media-src 'self' blob: data:",
  "connect-src 'self' https://www.gstatic.com https://*.googleapis.com https://*.gstatic.com https://*.firebaseio.com https://*.giphy.com wss://*.firebaseio.com",
  "frame-src https: http:"
].join('; ');

function openSafe(url) {
  const safe = policy.safeExternalUrl(url);
  if (!safe) return false;
  if (selfTest) {
    opened.push(safe);
    return true;
  }
  shell.openExternal(safe);
  return true;
}

async function readAppFile(requestUrl) {
  const target = policy.resolveAppFile(app.getAppPath(), requestUrl);
  if (!target) return null;
  const ext = path.extname(target).toLowerCase();
  const inAsar = target.includes('.asar');
  try {
    if (!inAsar) {
      const baseReal = await fs.realpath(app.getAppPath());
      const targetReal = await fs.realpath(target);
      const rel = path.relative(baseReal, targetReal);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
      return { data: await fs.readFile(targetReal), ext };
    }
    return { data: await fs.readFile(target), ext };
  } catch {
    return null;
  }
}

let creatingPicker = false;
let capturingPage = false;

function attachGuards(contents) {
  const picker = creatingPicker;
  const allowFile = capturingPage;
  contents.setWindowOpenHandler(({ url }) => {
    openSafe(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (policy.isAppUrl(url)) return;
    if (picker && url.startsWith('data:text/html')) return;
    if (allowFile && url.startsWith('file:')) return;
    event.preventDefault();
    openSafe(url);
  });
  contents.on('will-redirect', (event, url) => {
    if (policy.isAppUrl(url)) return;
    event.preventDefault();
    openSafe(url);
  });
  contents.on('will-attach-webview', event => event.preventDefault());
}

app.on('web-contents-created', (_event, contents) => attachGuards(contents));

const PICKER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Share with Omni</title>
<style>
  body { margin: 0; font: 14px/1.4 sans-serif; background: #14181b; color: #eef2f4; }
  header, footer { padding: 14px 16px; }
  p { margin: 4px 0 0; color: #b7c0c6; }
  ul { list-style: none; margin: 0; padding: 0 16px 8px; display: grid; gap: 8px; max-height: 320px; overflow: auto; }
  button { font: inherit; color: inherit; }
  button.row { display: flex; gap: 10px; align-items: center; width: 100%; text-align: left; background: #22282c; border: 1px solid #3a4348; border-radius: 8px; padding: 8px; }
  button.row img { width: 120px; height: 68px; object-fit: cover; background: #000; }
  button.cancel { background: transparent; border: 1px solid #3a4348; border-radius: 8px; padding: 8px 12px; }
</style></head><body>
<header><b>Share your screen</b><p>Choose what this window may capture. Nothing is shared until you pick it.</p></header>
<ul id="list"></ul>
<footer><button class="cancel" id="cancel" type="button">Cancel</button></footer>
<script>
  const list = document.getElementById('list');
  document.getElementById('cancel').onclick = () => omniPicker.choose('');
  omniPicker.onSources((sources) => {
    if (!sources.length) {
      const li = document.createElement('li');
      li.textContent = 'No screen was found.';
      list.appendChild(li);
      return;
    }
    sources.forEach((source) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'row';
      if (typeof source.thumb === 'string' && source.thumb.startsWith('data:image/')) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = source.thumb;
        btn.appendChild(img);
      }
      const name = document.createElement('span');
      name.textContent = source.name || 'Screen';
      btn.appendChild(name);
      btn.onclick = () => omniPicker.choose(source.id);
      li.appendChild(btn);
      list.appendChild(li);
    });
  });
</script></body></html>`;

let pickerWindow = null;
let pickerSettle = null;

function presentSharePicker(parent, sources) {
  if (pickerWindow) return Promise.resolve('');
  return new Promise(resolve => {
    let settled = false;
    const finish = (id) => {
      if (settled) return;
      settled = true;
      pickerSettle = null;
      resolve(id || '');
    };
    pickerSettle = finish;
    const list = sources.map(source => {
      let thumb = '';
      try {
        if (source.thumbnail && !source.thumbnail.isEmpty()) thumb = source.thumbnail.toDataURL();
      } catch { thumb = ''; }
      return { id: source.id, name: source.name, thumb };
    });
    creatingPicker = true;
    try {
      pickerWindow = new BrowserWindow({
        parent: parent || undefined,
        modal: !!parent,
        width: 520,
        height: 480,
        title: 'Share with Omni',
        backgroundColor: '#14181b',
        autoHideMenuBar: true,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        webPreferences: {
          preload: path.join(__dirname, 'picker-preload.js'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          webviewTag: false,
          nodeIntegrationInWorker: false,
          nodeIntegrationInSubFrames: false
        }
      });
    } catch {
      creatingPicker = false;
      finish('');
      return;
    } finally {
      creatingPicker = false;
    }
    pickerWindow.removeMenu();
    pickerWindow.on('closed', () => {
      pickerWindow = null;
      finish('');
    });
    pickerWindow.webContents.once('did-finish-load', () => {
      if (pickerWindow && !pickerWindow.isDestroyed()) {
        pickerWindow.webContents.send('omni-desktop-picker-sources', list);
      }
    });
    pickerWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PICKER_HTML));
  });
}

ipcMain.on('omni-desktop-picker-choice', (event, id) => {
  if (!pickerWindow || event.sender !== pickerWindow.webContents || !pickerSettle) return;
  const chosen = typeof id === 'string' ? id : '';
  const done = pickerSettle;
  done(chosen);
  if (pickerWindow && !pickerWindow.isDestroyed()) pickerWindow.close();
});

function wirePermissions() {
  const ses = session.defaultSession;
  const decide = (permission, details) => policy.mediaAllowed({
    permission,
    requestingUrl: details.requestingUrl || details.securityOrigin || details.requestingOrigin || '',
    isMainFrame: details.isMainFrame
  });
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(decide(permission, details || { requestingUrl: webContents && webContents.getURL() }));
  });
  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    return decide(permission, Object.assign({ requestingUrl: requestingOrigin }, details || {}));
  });
  // useSystemPicker is macOS-only in this Electron. On Windows the handler runs
  // and Omni shows its own picker. Nothing is captured until a source is chosen.
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    const finish = streams => {
      try { callback(streams); } catch { /* the request already ended */ }
    };
    try {
      const frame = request.frame;
      const frameUrl = frame && frame.url;
      if (!request.userGesture || !request.videoRequested || !frame || frame.parent ||
          !policy.isAppUrl(request.securityOrigin) || !policy.isAppUrl(frameUrl)) {
        finish(null);
        return;
      }
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: false
      });
      const owner = webContents.fromFrame(frame);
      const parent = owner && BrowserWindow.fromWebContents(owner);
      const chosen = await presentSharePicker(parent, sources);
      const source = sources.find(item => item.id === chosen);
      finish(source ? { video: { id: source.id, name: source.name } } : null);
    } catch {
      finish(null);
    }
  }, { useSystemPicker: true });
  ses.on('will-download', (event, _item, webContents) => {
    if (!webContents || !policy.isAppUrl(webContents.getURL())) event.preventDefault();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'Omni',
    backgroundColor: '#0c0f11',
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), 'icons', 'icon-512.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      navigateOnDragDrop: false
    }
  });
  win.removeMenu();
  win.on('page-title-updated', event => {
    event.preventDefault();
    win.setTitle('Omni');
  });
  return win;
}

async function runSelfTest(win) {
  const errors = [];
  win.webContents.on('console-message', event => {
    const text = event && event.message ? event.message : '';
    if (event && (event.level === 'warning' || event.level === 'error')) errors.push(String(text));
  });
  const info = await win.webContents.executeJavaScript(`(() => ({
    title: document.title,
    protocol: location.protocol,
    host: location.host,
    href: location.href,
    ua: navigator.userAgent,
    processType: typeof process,
    requireType: typeof require,
    hasChip: !!document.getElementById('onlineChip'),
    hasMeeting: !!document.getElementById('meetingPanel'),
    hasComposer: !!document.getElementById('composer')
  }))()`);
  await win.webContents.executeJavaScript(`window.open('https://example.com/omni-test', '_blank', 'noopener')`);
  await win.webContents.executeJavaScript(`window.open('file:///etc/passwd')`);
  await win.webContents.executeJavaScript(`window.open('javascript:alert(1)')`);
  await win.webContents.executeJavaScript(`location.assign('https://example.com/hijack')`).catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 300));
  const still = await win.webContents.executeJavaScript('location.href');
  const problems = [];
  if (!String(info.title).includes('Omni')) problems.push('title: ' + info.title);
  if (info.protocol !== 'omni:' || info.host !== 'app') problems.push('origin: ' + info.href);
  if (!String(info.ua).includes('OmniDesktop/' + version)) problems.push('user agent: ' + info.ua);
  if (info.processType !== 'undefined' || info.requireType !== 'undefined') problems.push('node leaked into the page');
  if (!info.hasChip || !info.hasMeeting || !info.hasComposer) problems.push('page did not render');
  if (!policy.isAppUrl(still)) problems.push('navigated away to ' + still);
  if (!opened.some(url => url.startsWith('https://example.com/omni-test'))) problems.push('https link was not handed off');
  if (opened.some(url => !url.startsWith('https://example.com/'))) problems.push('unexpected external url ' + opened.join(','));
  const csp = errors.filter(message => /Content Security Policy/i.test(message) && /Refused/i.test(message));
  if (csp.length) problems.push(csp.join(' | '));
  if (problems.length) {
    console.error(problems.join('\n'));
    app.exit(1);
    return;
  }
  const authReport = await win.webContents.executeJavaScript(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const problems = [];
    if (!document.body.classList.contains('desktop-locked')) problems.push('app was not locked while sign-in restores');
    const welcome = document.getElementById('welcome');
    if (welcome && welcome.classList.contains('show')) problems.push('guest welcome was the entry');
    let screen = '';
    for (let i = 0; i < 40; i++) {
      const gate = document.getElementById('desktopGate');
      screen = gate ? gate.dataset.screen || '' : '';
      if (screen === 'login' || screen === 'offline') break;
      if (!document.body.classList.contains('desktop-locked')) { problems.push('gate opened before a signed-in session'); break; }
      await sleep(250);
    }
    if (document.body.classList.contains('desktop-locked') && screen !== 'login' && screen !== 'offline') problems.push('gate stayed on ' + (screen || 'missing'));
    const storedPassword = Object.keys(localStorage).some(key => /password/i.test(key));
    if (storedPassword) problems.push('a password was written to local storage');
    return { problems, screen, locked: document.body.classList.contains('desktop-locked') };
  })()`);
  if (!authReport || authReport.problems.length || !authReport.locked) {
    console.error(authReport && authReport.problems.length ? authReport.problems.join('\n') : 'auth gate did not stay locked');
    app.exit(1);
    return;
  }
  console.log('OMNI_AUTH_TEST_OK ' + authReport.screen);
  await win.webContents.executeJavaScript(`document.body.classList.remove('desktop-locked'); const g = document.getElementById('desktopGate'); if (g) g.remove(); showLobby();`);
  const lobby = await win.webContents.executeJavaScript(`(() => ({
    shown: document.body.classList.contains('show-lobby'),
    update: (document.getElementById('lobbyUpdate') || {}).textContent || '',
    note: (document.getElementById('lobbyUnverified') || {}).textContent || '',
    games: [...document.querySelectorAll('#lobby [data-game]')].map(el => el.dataset.game)
  }))()`);
  if (!lobby.shown || lobby.update !== "Updates aren't set up" || !lobby.note.includes('Not verified') || lobby.games.join() !== 'minecraft,roblox') {
    console.error('lobby ' + JSON.stringify(lobby));
    app.exit(1);
    return;
  }
  console.log('OMNI_LOBBY_DOM ' + JSON.stringify(lobby));
  const shot = async (name) => {
    const image = await win.capturePage();
    await fs.writeFile('/tmp/omni-' + name + '.png', image.toPNG());
  };
  await shot('lobby');
  await win.webContents.executeJavaScript('hideLobby()');
  const viewState = `(() => {
    const shown = (el) => !!(el && getComputedStyle(el).display !== 'none');
    return {
      channel: document.getElementById('channelName').textContent,
      meeting: document.getElementById('meetingTitle').textContent,
      inCall: document.getElementById('meetingPanel').classList.contains('in-call'),
      grid: shown(document.querySelector('.video-grid')),
      controls: shown(document.querySelector('.meeting-controls')),
      join: shown(document.getElementById('callIdle')) ? document.getElementById('joinCallBtn').textContent : '',
      pill: document.getElementById('livePill').textContent,
      count: document.getElementById('meetingCount').textContent,
      mic: document.querySelector('#micBtn .label').textContent,
      micEmph: document.getElementById('micBtn').classList.contains('emph'),
      leave: document.querySelector('#leaveBtn .label').textContent
    };
  })()`;
  await win.webContents.executeJavaScript(`document.querySelector('[data-channel="voice-lounge"]').click()`);
  const idle = await win.webContents.executeJavaScript(viewState);
  await shot('voice-idle');
  const idleProblems = [];
  if (idle.channel !== 'voice-lounge') idleProblems.push('channel ' + idle.channel);
  if (idle.meeting !== 'Voice Lounge') idleProblems.push('meeting title ' + idle.meeting);
  if (idle.inCall || idle.grid || idle.controls) idleProblems.push('opening the lounge already showed the call ' + JSON.stringify(idle));
  if (idle.join !== 'Join Call') idleProblems.push('missing Join Call, saw ' + idle.join);
  if (idle.pill !== 'READY') idleProblems.push('idle pill ' + idle.pill);
  if (idle.micEmph) idleProblems.push('Mute was highlighted before Join Call');
  if (idleProblems.length) { console.error(idleProblems.join('\n')); app.exit(1); return; }
  console.log('OMNI_IDLE_DOM ' + JSON.stringify(idle));
  const callProblems = await win.webContents.executeJavaScript(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const shown = (el) => !!(el && getComputedStyle(el).display !== 'none');
    const problems = [];
    document.querySelector('[data-room="0"]').click();
    await sleep(200);
    if (document.getElementById('meetingPanel').classList.contains('in-call') || document.getElementById('livePill').textContent === 'LIVE') problems.push('picking a squad room started the call');
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    document.getElementById('joinCallBtn').click();
    await sleep(300);
    if (document.getElementById('meetingPanel').classList.contains('in-call') || shown(document.querySelector('.video-grid'))) problems.push('failed Join Call showed the grid');
    navigator.mediaDevices.getUserMedia = real;
    document.getElementById('joinCallBtn').click();
    await sleep(200);
    document.getElementById('leaveBtn').click();
    await sleep(400);
    if (document.getElementById('meetingPanel').classList.contains('in-call') || shown(document.querySelector('.video-grid'))) problems.push('leaving during join left the grid up');
    document.getElementById('joinCallBtn').click();
    await sleep(1200);
    if (!document.getElementById('meetingPanel').classList.contains('in-call')) problems.push('Join Call did not mark the meeting in-call');
    if (!shown(document.querySelector('.video-grid')) || !shown(document.querySelector('.meeting-controls'))) problems.push('connected controls stayed hidden');
    if (shown(document.getElementById('callIdle'))) problems.push('Join Call stayed visible after connecting');
    if (document.getElementById('livePill').textContent !== 'LIVE') problems.push('pill ' + document.getElementById('livePill').textContent);
    if (!document.getElementById('micBtn').classList.contains('emph')) problems.push('connected Mute was not highlighted');
    document.querySelector('[data-channel="lfg"]').click();
    await sleep(200);
    if (!document.getElementById('meetingPanel').classList.contains('in-call')) problems.push('changing channel dropped or restarted the call view');
    document.querySelector('[data-channel="voice-lounge"]').click();
    return problems;
  })()`, true);
  if (!Array.isArray(callProblems) || callProblems.length) {
    console.error(Array.isArray(callProblems) ? callProblems.join('\n') : 'call check failed');
    app.exit(1);
    return;
  }
  const joined = await win.webContents.executeJavaScript(viewState);
  await shot('voice-joined');
  await win.webContents.executeJavaScript(`document.getElementById('leaveBtn').click()`, true);
  await new Promise(resolve => setTimeout(resolve, 300));
  const left = await win.webContents.executeJavaScript(viewState);
  await shot('voice-left');
  const leftProblems = [];
  if (left.inCall || left.grid || left.controls) leftProblems.push('Leave left the call grid up ' + JSON.stringify(left));
  if (left.join !== 'Join Call') leftProblems.push('Join Call was not shown after Leave');
  if (left.pill !== 'READY' || left.count !== 'Not in a call') leftProblems.push('status after Leave ' + left.pill + ' ' + left.count);
  if (left.micEmph) leftProblems.push('Mute stayed highlighted after Leave');
  if (left.channel !== 'voice-lounge') leftProblems.push('Leave left the channel ' + left.channel);
  if (!joined.inCall || joined.pill !== 'LIVE' || !joined.grid) leftProblems.push('join snapshot was not connected ' + JSON.stringify(joined));
  if (leftProblems.length) { console.error(leftProblems.join('\n')); app.exit(1); return; }
  await win.webContents.executeJavaScript(`document.querySelector('[data-mode="school"]').click()`);
  await win.webContents.executeJavaScript(`document.querySelector('[data-mode="gaming"]').click(); document.querySelector('[data-channel="voice-lounge"]').click()`);
  const returned = await win.webContents.executeJavaScript(viewState);
  if (returned.inCall || returned.join !== 'Join Call') {
    console.error('mode switch rejoined the call ' + JSON.stringify(returned));
    app.exit(1);
    return;
  }
  console.log('OMNI_JOINED_DOM ' + JSON.stringify(joined));
  console.log('OMNI_LEFT_DOM ' + JSON.stringify(left));
  capturingPage = true;
  let page;
  try {
    page = new BrowserWindow({
      show: false, width: 1100, height: 800,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false }
    });
  } finally { capturingPage = false; }
  await page.loadFile(path.join(app.getAppPath(), 'download.html'));
  await new Promise(resolve => setTimeout(resolve, 400));
  const downloadShot = await page.capturePage();
  await fs.writeFile('/tmp/omni-download.png', downloadShot.toPNG());
  const downloadLabel = await page.webContents.executeJavaScript(`document.getElementById('downloadStatus').textContent`);
  page.destroy();
  if (!String(downloadLabel).includes('not published')) {
    console.error('download page ' + downloadLabel);
    app.exit(1);
    return;
  }
  console.log('OMNI_DOWNLOAD_PAGE ' + downloadLabel);
  console.log('OMNI_SELF_TEST_OK');
  console.log('OMNI_CALL_TEST_OK');
  app.exit(0);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(async () => {
    const updateStatus = updates.checkOnLaunch();
    if (updateStatus.willDownload) console.error('Omni refused an update download.');
    Menu.setApplicationMenu(null);
    protocol.handle('omni', async request => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405 });
      }
      const file = await readAppFile(request.url);
      if (!file) return new Response('Not found', { status: 404 });
      const headers = {
        'Content-Type': MIME[file.ext] || 'application/octet-stream',
        'Content-Security-Policy': CSP,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store'
      };
      if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
      return new Response(file.data, { status: 200, headers });
    });
    wirePermissions();
    const win = createWindow();
    win.webContents.on('did-fail-load', (_event, code, description, url) => {
      console.error('Failed to load', url, code, description);
      if (selfTest) app.exit(1);
    });
    await win.loadURL('omni://app/index.html');
    if (selfTest) {
      const timer = setTimeout(() => {
        console.error('self-test timed out');
        app.exit(1);
      }, 45000);
      timer.unref?.();
      try {
        await runSelfTest(win);
      } catch (err) {
        console.error(err);
        app.exit(1);
      }
    }
  }).catch(err => {
    console.error(err);
    app.exit(1);
  });
  app.on('window-all-closed', () => app.quit());
}
