'use strict';
// Tessera Browser — главный процесс.
// Одно окно: интерфейс (WebContentsView) поверх вкладок (WebContentsView на каждую вкладку).
const {
  app, BaseWindow, WebContentsView, session, ipcMain, clipboard, Notification, shell,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { loadAll, matches, fullCode } = require('./lib/userscripts');

app.setName('tessera-browser');
if (process.env.TB_DATA) app.setPath('userData', process.env.TB_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ---------- хранилище ----------
const DATA = app.getPath('userData');
const F = {
  config: path.join(DATA, 'config.json'),
  session: path.join(DATA, 'session.json'),
  bookmarks: path.join(DATA, 'bookmarks.json'),
  history: path.join(DATA, 'history.json'),
  scripts: path.join(DATA, 'userscripts'),
  requires: path.join(DATA, 'requires'),
  values: path.join(DATA, 'values'),
};

function readJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; }
}
function writeJSON(file, obj) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(obj));
    fs.renameSync(file + '.tmp', file);
  } catch (e) { console.error('write', file, e.message); }
}
function debounce(fn, ms) {
  let t = null;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const PALETTE = ['#7aa2ff', '#f5a97f', '#a6da95', '#f5bde6', '#eed49f', '#8bd5ca', '#ed8796'];
const defaultConfig = {
  searchEngine: 'https://www.google.com/search?q=%s',
  mobileUA: true,
  doubleTapMs: 300,
  profiles: [
    { id: 'default', name: 'Основной', color: PALETTE[0] },
    { id: 'second', name: 'Второй', color: PALETTE[1] },
  ],
  disabledScripts: [],
  voice: 2,       // 0 выкл, 1 тап озвучивает / долгое нажатие действует, 2 действие + голос
  ttsRate: 170,   // слов в минуту для espeak
  hub: { fx: 0.5, fy: 0.5 }, // центр плавающей кнопки в долях окна (по умолчанию в центре экрана)
};
const cfg = Object.assign({}, defaultConfig, readJSON(F.config, {}));
if (!Array.isArray(cfg.profiles) || !cfg.profiles.length) cfg.profiles = defaultConfig.profiles;
const saveCfg = debounce(() => writeJSON(F.config, cfg), 300);

let bookmarks = readJSON(F.bookmarks, []);
let history = readJSON(F.history, []);
const saveBookmarks = debounce(() => writeJSON(F.bookmarks, bookmarks), 300);
const saveHistory = debounce(() => writeJSON(F.history, history), 2000);

// ---------- состояние ----------
const HUB = 78;          // сторона окна интерфейса вокруг плавающей кнопки
let uiExtra = 0;        // временный запас рядом с кнопкой под подсказку
let hubHidden = false;  // кнопка спрятана прокруткой страницы
let hubDrag = null;     // центр кнопки в начале перетаскивания
let hubTimer = null;
// Следит за прокруткой страницы: вниз прячет кнопку, вверх возвращает. Сообщает через console.log с меткой.
const SCROLL_JS = `(() => {
  if (window.__tsHub) return;
  window.__tsHub = 1;
  const last = new WeakMap();
  let acc = 0, sent = 0;
  const say = (v) => { const n = Date.now(); if (v === '0' || n - sent > 300) { sent = n; console.log('__ts_hub__' + v); } };
  addEventListener('scroll', (e) => {
    const t = e.target === document ? document.scrollingElement : e.target;
    if (!t || typeof t.scrollTop !== 'number') return;
    const y = t.scrollTop;
    const d = y - (last.has(t) ? last.get(t) : y);
    last.set(t, y);
    if (!d) return;
    if ((d > 0) !== (acc > 0)) acc = 0;
    acc += d;
    if (t === document.scrollingElement && y <= 8) { acc = 0; say('0'); }
    else if (acc > 24) say('1');
    else if (acc < -24) say('0');
  }, true);
})();`;
const ERR_PREFIX = 'data:text/html;charset=utf-8,' + encodeURIComponent('<!--tessera-error-->').slice(0, 40);

let win = null;
let ui = null;
let mode = 'browse'; // browse | sheet | panel | omnibox | scripts | bookmarks | closed
let omniNewTab = false;
let ctxData = null;
let htmlFull = false;
let tabSeq = 1;
let activeId = null;
const tabs = [];
const closedTabs = [];
const sessions = new Map();

const tabById = (id) => tabs.find((t) => t.id === id) || null;
const tabByContents = (wc) => tabs.find((t) => t.view && t.view.webContents === wc) || null;
const profileById = (id) => cfg.profiles.find((p) => p.id === id) || cfg.profiles[0];

// ---------- юзерскрипты ----------
let scripts = [];
const valuesCache = new Map();

function loadScripts() {
  scripts = loadAll(F.scripts, F.requires);
  for (const s of scripts) {
    for (const r of s.requires) {
      if (fs.existsSync(r.file)) continue;
      fetchText(r.url).then((txt) => {
        if (txt) { fs.writeFileSync(r.file, txt); push(); }
      }).catch(() => {});
    }
  }
}
async function fetchText(url) {
  const { net } = require('electron');
  const res = await net.fetch(url);
  if (!res.ok) return null;
  return res.text();
}
function valuesOf(id) {
  if (!valuesCache.has(id)) {
    valuesCache.set(id, { data: readJSON(path.join(F.values, id + '.json'), {}), save: debounce(() => {
      writeJSON(path.join(F.values, id + '.json'), valuesCache.get(id).data);
    }, 400) });
  }
  return valuesCache.get(id);
}
const safeId = (s) => String(s).replace(/[^\w.-]/g, '_');

ipcMain.on('ts:match', (e, url) => {
  const tab = tabByContents(e.sender);
  if (!tab) { e.returnValue = []; return; }
  e.returnValue = scripts
    .filter((s) => !cfg.disabledScripts.includes(s.id) && matches(s, url))
    .map((s) => ({
      id: s.id, name: s.name, namespace: s.namespace, version: s.version, description: s.description,
      matches: s.meta.match, runAt: s.runAt, world: s.world, code: fullCode(s),
    }));
});
ipcMain.on('ts:commands', (e, list) => {
  const tab = tabByContents(e.sender);
  if (!tab) return;
  tab.commands = (Array.isArray(list) ? list : []).slice(0, 50).map((c) => ({
    sid: String(c.sid), id: c.id | 0, name: String(c.name).slice(0, 80),
  }));
  push();
});
ipcMain.on('gm:get', (e, sid, key) => {
  const v = valuesOf(safeId(sid)).data;
  e.returnValue = Object.prototype.hasOwnProperty.call(v, key) ? { h: true, v: v[key] } : { h: false };
});
ipcMain.on('gm:set', (e, sid, key, value) => {
  const o = valuesOf(safeId(sid)); o.data[key] = value; o.save();
});
ipcMain.on('gm:del', (e, sid, key) => {
  const o = valuesOf(safeId(sid)); delete o.data[key]; o.save();
});
ipcMain.on('gm:list', (e, sid) => { e.returnValue = Object.keys(valuesOf(safeId(sid)).data); });

const xhrCtl = new Map();
ipcMain.handle('gm:xhr', async (e, d) => {
  const tab = tabByContents(e.sender);
  if (!tab) return { error: 'no tab' };
  const ses = getSession(tab.profile);
  const ctrl = new AbortController();
  const key = e.sender.id + ':' + d.id;
  xhrCtl.set(key, ctrl);
  let timedOut = false;
  let timer = null;
  if (d.timeout > 0) timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, d.timeout);
  try {
    const method = String(d.method || 'GET').toUpperCase();
    const res = await ses.fetch(d.url, {
      method,
      headers: d.headers || {},
      body: method === 'GET' || method === 'HEAD' ? undefined : d.data,
      credentials: d.anonymous ? 'omit' : 'include',
      signal: ctrl.signal,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    let headers = '';
    res.headers.forEach((v, k) => { headers += k + ': ' + v + '\r\n'; });
    const out = {
      status: res.status, statusText: res.statusText, headers, url: res.url || d.url,
      contentType: res.headers.get('content-type') || '',
    };
    if (d.responseType === 'arraybuffer' || d.responseType === 'blob') out.body = buf;
    else out.text = buf.toString('utf8');
    return out;
  } catch (err) {
    return { error: String(err && err.message || err), timeout: timedOut };
  } finally {
    clearTimeout(timer);
    xhrCtl.delete(key);
  }
});
ipcMain.on('gm:xhr-abort', (e, id) => {
  const c = xhrCtl.get(e.sender.id + ':' + id);
  if (c) c.abort();
});
ipcMain.on('gm:open', (e, url, background) => {
  const tab = tabByContents(e.sender);
  if (!tab || !/^(https?|file):/i.test(url)) return;
  createTab({ url, profile: tab.profile, after: tab.id, background });
});
ipcMain.on('gm:clip', (e, text) => { if (tabByContents(e.sender)) clipboard.writeText(text); });
ipcMain.on('gm:notify', (e, n) => {
  if (!tabByContents(e.sender) || !Notification.isSupported()) return;
  new Notification({ title: n.title || 'Tessera', body: n.text }).show();
});
const pendingNames = new Map();
ipcMain.on('gm:download', (e, url, name) => {
  const tab = tabByContents(e.sender);
  if (!tab || !tab.view || !/^https?:/i.test(url)) return;
  if (name) pendingNames.set(url, name);
  tab.view.webContents.downloadURL(url);
});

// ---------- сессии профилей ----------
function mobileUA() {
  return `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Mobile Safari/537.36`;
}
function desktopUA() {
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
}
function uaFor(tab) {
  return cfg.mobileUA && !tab.desktop ? mobileUA() : desktopUA();
}

function getSession(profile) {
  if (sessions.has(profile)) return sessions.get(profile);
  const ses = session.fromPartition('persist:profile-' + profile);
  const allowed = ['fullscreen', 'clipboard-sanitized-write', 'notifications', 'media', 'mediaKeySystem', 'pointerLock'];
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(allowed.includes(perm)));
  ses.setPermissionCheckHandler((wc, perm) => allowed.includes(perm));
  ses.on('will-download', (e, item) => {
    const dir = app.getPath('downloads');
    const want = pendingNames.get(item.getURL());
    pendingNames.delete(item.getURL());
    const base = path.basename(want || item.getFilename() || 'download');
    let target = path.join(dir, base);
    const ext = path.extname(base);
    const stem = path.basename(base, ext);
    for (let i = 1; fs.existsSync(target); i++) target = path.join(dir, `${stem} (${i})${ext}`);
    item.setSavePath(target);
    toast('Загрузка: ' + base);
    item.once('done', (_ev, state) => toast(state === 'completed' ? 'Скачано: ' + base : 'Не скачано: ' + base));
  });
  sessions.set(profile, ses);
  return ses;
}

// ---------- вкладки ----------
function resolveInput(t) {
  t = String(t || '').trim();
  if (!t) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^(about|data|file|view-source):/i.test(t)) return t;
  if (t.startsWith('/')) return 'file://' + t;
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#].*)?$/i.test(t)) return 'http://' + t;
  if (!/\s/.test(t) && /^[^\s/]+\.[a-z]{2,}([:/?#].*)?$/i.test(t)) return 'https://' + t;
  return cfg.searchEngine.replace('%s', encodeURIComponent(t));
}

function errorPage(url, desc) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = '<!--tessera-error--><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
    + '<body style="font:16px system-ui;background:#101114;color:#e6e6e6;padding:28px;line-height:1.5">'
    + '<h2 style="margin:0 0 12px">Страница недоступна</h2>'
    + `<p style="color:#9aa0a6;word-break:break-all">${esc(url)}</p><p>${esc(desc)}</p>`
    + `<p><a style="color:#7aa2ff" href="${esc(url)}">Повторить</a></p></body>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

function createTab({ url = 'about:blank', profile, after, background = false, id, title = '', favicon = '', restored = false }) {
  const tab = {
    id: id || tabSeq++,
    profile: profileById(profile || (tabById(activeId) && tabById(activeId).profile) || cfg.profiles[0].id).id,
    url, title, favicon, thumb: null, loading: false, view: null,
    desktop: false, zoom: 1, commands: [], canBack: false, canFwd: false, crashed: false,
  };
  if (id && id >= tabSeq) tabSeq = id + 1;
  let idx = tabs.length;
  if (after != null) { const i = tabs.findIndex((t) => t.id === after); if (i >= 0) idx = i + 1; }
  tabs.splice(idx, 0, tab);
  if (!restored && !background) {
    selectTab(tab.id);
  } else if (!restored && background) {
    ensureView(tab);
    layout();
  }
  push();
  saveSoon();
  return tab;
}

function navHistory(wc) { return wc.navigationHistory || wc; }
function updateNav(tab) {
  if (!tab.view) return;
  const h = navHistory(tab.view.webContents);
  tab.canBack = h.canGoBack();
  tab.canFwd = h.canGoForward();
}

function addHistory(tab) {
  if (!/^https?:/i.test(tab.url)) return;
  history = history.filter((h) => h.url !== tab.url);
  history.unshift({ url: tab.url, title: tab.title || tab.url, ts: Date.now() });
  if (history.length > 1000) history.length = 1000;
  saveHistory();
}

function ensureView(tab) {
  if (tab.view || !win) return;
  const ses = getSession(tab.profile);
  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      preload: path.join(__dirname, 'preload-tab.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  view.setBackgroundColor('#ffffff');
  view.setVisible(false);
  tab.view = view;
  win.contentView.addChildView(view);
  win.contentView.addChildView(ui); // интерфейс всегда сверху
  wire(tab);
  const wc = view.webContents;
  wc.setUserAgent(uaFor(tab));
  wc.setZoomFactor(tab.zoom);
  if (tab.url && tab.url !== 'about:blank') wc.loadURL(tab.url).catch(() => {});
}

function destroyView(tab) {
  if (!tab.view) return;
  try { win.contentView.removeChildView(tab.view); } catch { /* ignore */ }
  try { tab.view.webContents.close(); } catch { /* ignore */ }
  tab.view = null;
  tab.loading = false;
  tab.commands = [];
  tab.canBack = false;
  tab.canFwd = false;
}

function wire(tab) {
  const wc = tab.view.webContents;
  wc.on('page-title-updated', (_e, t) => { tab.title = t; push(); saveSoon(); });
  wc.on('page-favicon-updated', (_e, f) => { tab.favicon = f[0] || ''; push(); });
  wc.on('did-start-loading', () => { tab.loading = true; tab.commands = []; push(); });
  wc.on('did-stop-loading', () => { tab.loading = false; updateNav(tab); push(); scheduleThumb(tab); });
  wc.on('did-navigate', (_e, url) => {
    if (url.startsWith(ERR_PREFIX)) return;
    tab.url = url; updateNav(tab); addHistory(tab); push(); saveSoon();
  });
  wc.on('did-navigate-in-page', (_e, url, isMain) => {
    if (!isMain) return;
    tab.url = url; updateNav(tab); push(); saveSoon();
  });
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;
    tab.url = url;
    wc.loadURL(errorPage(url, desc + ' (' + code + ')')).catch(() => {});
  });
  wc.on('dom-ready', () => { wc.executeJavaScript(SCROLL_JS).catch(() => {}); });
  wc.on('console-message', (_e, _level, message) => {
    if (tab.id !== activeId || mode !== 'browse' || typeof message !== 'string' || !message.startsWith('__ts_hub__')) return;
    setHubHidden(message.endsWith('1'));
  });
  wc.on('did-navigate', () => { if (tab.id === activeId && hubHidden) setHubHidden(false); });
  wc.on('render-process-gone', () => { tab.crashed = true; tab.loading = false; push(); });
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (/^(https?|file):/i.test(url)) {
      createTab({ url, profile: tab.profile, after: tab.id, background: disposition === 'background-tab' });
    }
    return { action: 'deny' };
  });
  wc.on('context-menu', (_e, p) => {
    if (!(p.linkURL || p.srcURL || p.selectionText || p.isEditable)) return;
    ctxData = {
      tabId: tab.id, linkURL: p.linkURL || '', srcURL: p.mediaType === 'image' ? p.srcURL : '',
      selectionText: (p.selectionText || '').slice(0, 200), isEditable: !!p.isEditable,
    };
    setMode('sheet');
  });
  wc.on('enter-html-full-screen', () => { htmlFull = true; layout(); });
  wc.on('leave-html-full-screen', () => { htmlFull = false; layout(); });
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const k = String(input.key).toLowerCase();
    if (ctrl && k === 'l') { e.preventDefault(); setMode('omnibox', { newTab: false }); }
    else if (ctrl && k === 't') { e.preventDefault(); setMode('omnibox', { newTab: true }); }
    else if (ctrl && k === 'w') { e.preventDefault(); closeTab(tab.id); }
    else if ((ctrl && k === 'r') || k === 'f5') { e.preventDefault(); wc.reload(); }
    else if (input.alt && k === 'arrowleft') { e.preventDefault(); doNav('back'); }
    else if (input.alt && k === 'arrowright') { e.preventDefault(); doNav('forward'); }
    else if (ctrl && k === 'tab') { e.preventDefault(); cycleTab(input.shift ? -1 : 1); }
  });
}

function cycleTab(dir) {
  if (tabs.length < 2) return;
  const i = tabs.findIndex((t) => t.id === activeId);
  selectTab(tabs[(i + dir + tabs.length) % tabs.length].id);
}

const timeout = (ms) => new Promise((r) => setTimeout(() => r(null), ms));
async function captureThumb(tab) {
  if (!tab.view) return;
  try {
    const img = await Promise.race([tab.view.webContents.capturePage(), timeout(700)]);
    if (!img || img.isEmpty()) return;
    const r = img.resize({ width: 360, quality: 'good' });
    tab.thumb = 'data:image/jpeg;base64,' + r.toJPEG(70).toString('base64');
    if (ui && !ui.webContents.isDestroyed()) ui.webContents.send('thumb', tab.id, tab.thumb);
  } catch { /* вкладка скрыта или закрыта */ }
}
const thumbTimers = new Map();
function scheduleThumb(tab) {
  clearTimeout(thumbTimers.get(tab.id));
  thumbTimers.set(tab.id, setTimeout(() => { if (tab.id === activeId && mode === 'browse') captureThumb(tab); }, 1500));
}

async function selectTab(id) {
  const tab = tabById(id);
  if (!tab) return;
  const prev = tabById(activeId);
  // скрытую вкладку снимать бесполезно: снимок делается только пока она видна
  if (prev && prev.id !== id && (mode === 'browse' || mode === 'sheet')) await captureThumb(prev);
  activeId = id;
  hubHidden = false;
  clearTimeout(hubTimer);
  tab.crashed = false;
  ensureView(tab);
  if (tab.view && tab.crashed === false && tab.view.webContents.isCrashed()) tab.view.webContents.reload();
  layout();
  push();
  saveSoon();
}

function closeTab(id, { remember = true } = {}) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const tab = tabs[i];
  if (remember && /^https?:|^file:/i.test(tab.url)) {
    closedTabs.unshift({ url: tab.url, title: tab.title, profile: tab.profile, favicon: tab.favicon });
    if (closedTabs.length > 30) closedTabs.length = 30;
  }
  destroyView(tab);
  tabs.splice(i, 1);
  if (activeId === id) {
    activeId = null;
    if (tabs.length) selectTab(tabs[Math.min(i, tabs.length - 1)].id);
  }
  if (!tabs.length) createTab({ url: 'about:blank' });
  layout();
  push();
  saveSoon();
}

function unloadTab(id) {
  const tab = tabById(id);
  if (!tab || !tab.view) return;
  const doIt = () => { destroyView(tab); layout(); push(); };
  captureThumb(tab).then(() => {
    if (id === activeId) { /* активную не выгружаем */ return; }
    doIt();
  });
}

function setTabProfile(id, profile) {
  const tab = tabById(id);
  if (!tab || tab.profile === profile) return;
  destroyView(tab);
  tab.profile = profileById(profile).id;
  if (id === activeId) { ensureView(tab); layout(); }
  push();
  saveSoon();
}

function doNav(action) {
  const tab = tabById(activeId);
  if (!tab || !tab.view) return;
  const wc = tab.view.webContents;
  const h = navHistory(wc);
  if (action === 'back') { if (h.canGoBack()) h.goBack(); }
  else if (action === 'forward') { if (h.canGoForward()) h.goForward(); }
  else if (action === 'reload') { if (tab.loading) wc.stop(); else wc.reload(); }
  else if (action === 'stop') wc.stop();
}

// ---------- раскладка ----------
// Центр плавающей кнопки хранится в долях окна, чтобы переживать смену размера.
function hubCenter(w, h) {
  const p = cfg.hub || { fx: 0.5, fy: 0.5 };
  const cx = Math.round(Math.min(w - HUB / 2, Math.max(HUB / 2, p.fx * w)));
  const cy = Math.round(Math.min(h - HUB / 2, Math.max(HUB / 2, p.fy * h)));
  return { cx, cy };
}
// На странице интерфейс занимает только квадрат вокруг кнопки (плюс место под подсказку), остальное отдано странице.
function hubBounds(w, h) {
  const { cx, cy } = hubCenter(w, h);
  const top = cy - HUB / 2;
  let bw = HUB, bh = HUB, x = cx - HUB / 2, y = top, below = false;
  if (uiExtra > 0) {
    bw = Math.min(w, 300);
    bh = HUB + uiExtra;
    below = top < uiExtra + 4;
    x = Math.min(Math.max(0, cx - bw / 2), w - bw);
    y = Math.min(Math.max(0, below ? top : top - uiExtra), h - bh);
  }
  return {
    x: Math.round(x), y: Math.round(y), width: Math.round(bw), height: Math.round(bh), below,
    ox: Math.round(cx - HUB / 2 - x), oy: Math.round(top - y),
  };
}
function hubInfo() {
  if (!win) return null;
  const [w, h] = win.getContentSize();
  const { cx, cy } = hubCenter(w, h);
  if (mode === 'browse') {
    const b = hubBounds(w, h);
    return { cx, cy, ox: b.ox, oy: b.oy, below: b.below };
  }
  return { cx, cy, ox: cx - HUB / 2, oy: cy - HUB / 2, below: false };
}
function setHubHidden(v) {
  clearTimeout(hubTimer);
  if (v) hubTimer = setTimeout(() => setHubHidden(false), 2500); // перестали листать: кнопка возвращается
  if (hubHidden === v) return;
  hubHidden = v;
  push();
  if (v) setTimeout(layout, 170); else layout();
}

function layout() {
  if (!win || !ui) return;
  const [w, h] = win.getContentSize();
  const active = tabById(activeId);
  const visibleTabs = (mode === 'browse' || mode === 'sheet');
  for (const t of tabs) {
    if (!t.view) continue;
    const show = visibleTabs && t.id === activeId;
    t.view.setVisible(show);
    t.view.setBounds({ x: 0, y: 0, width: w, height: h });
  }
  if (htmlFull && visibleTabs && active && active.view) {
    ui.setVisible(false);
  } else if (mode === 'browse') {
    const b = hubBounds(w, h);
    ui.setVisible(!hubHidden);
    ui.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
  } else {
    ui.setVisible(true);
    ui.setBounds({ x: 0, y: 0, width: w, height: h });
  }
}

async function setMode(m, opts = {}) {
  if (m === 'panel') {
    const tab = tabById(activeId);
    if (tab) await captureThumb(tab);
  }
  if (m === 'omnibox') omniNewTab = !!opts.newTab;
  if (m !== 'sheet') ctxData = null;
  hubHidden = false;
  clearTimeout(hubTimer);
  mode = m;
  layout();
  push();
  const tab = tabById(activeId);
  if (m === 'browse' && tab && tab.view) tab.view.webContents.focus();
  else if (m !== 'browse' && ui) ui.webContents.focus();
}

// ---------- состояние для интерфейса ----------
function scriptsInfo() {
  return scripts.map((s) => ({
    id: s.id, name: s.name, version: s.version, description: s.description,
    enabled: !cfg.disabledScripts.includes(s.id), matches: s.meta.match.length + s.meta.include.length,
  }));
}

function snapshot() {
  const a = tabById(activeId);
  return {
    mode,
    tabs: tabs.map((t) => ({
      id: t.id, title: t.title, url: t.url, favicon: t.favicon, profile: t.profile,
      loading: t.loading, loaded: !!t.view, desktop: t.desktop,
    })),
    active: activeId,
    profiles: cfg.profiles,
    canBack: a ? a.canBack : false,
    canFwd: a ? a.canFwd : false,
    loading: a ? a.loading : false,
    bookmarked: !!(a && bookmarks.some((b) => b.url === a.url)),
    commands: a ? a.commands : [],
    scripts: scriptsInfo(),
    closedCount: closedTabs.length,
    newTab: omniNewTab,
    ctx: ctxData,
    desktop: a ? a.desktop : false,
    zoom: a ? a.zoom : 1,
    doubleTapMs: cfg.doubleTapMs,
    hub: hubInfo(),
    hubHidden,
    voice: cfg.voice,
    speaking: reading && !!ttsProc,
    tts: !!ttsCmd,
  };
}

let pushQueued = false;
function push() {
  if (pushQueued) return;
  pushQueued = true;
  setImmediate(() => {
    pushQueued = false;
    if (ui && !ui.webContents.isDestroyed()) ui.webContents.send('state', snapshot());
  });
}
function toast(text) {
  if (ui && !ui.webContents.isDestroyed()) ui.webContents.send('toast', text);
}

const saveSoon = debounce(() => {
  writeJSON(F.session, {
    active: activeId,
    tabs: tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, profile: t.profile, favicon: t.favicon })),
  });
}, 500);

// ---------- озвучка ----------
let ttsProc = null;
let reading = false;
let ttsCmd = null;
function hasBin(b) { return (process.env.PATH || '').split(':').some((d) => d && fs.existsSync(path.join(d, b))); }
function detectTTS() {
  const rate = String(cfg.ttsRate || 170);
  if (hasBin('espeak-ng')) return (ru) => ['espeak-ng', ['-v', ru ? 'ru' : 'en', '-s', rate, '--stdin']];
  if (hasBin('espeak')) return (ru) => ['espeak', ['-v', ru ? 'ru' : 'en', '-s', rate, '--stdin']];
  if (hasBin('spd-say')) return (ru) => ['spd-say', ['-l', ru ? 'ru' : 'en', '-w', '-e']];
  return null;
}
function stopSpeak() {
  if (ttsProc) { try { ttsProc.kill(); } catch { /* уже завершён */ } ttsProc = null; }
  const was = reading;
  reading = false;
  if (was) push();
}
function speak(text, { read = false } = {}) {
  stopSpeak();
  text = String(text || '').trim();
  if (!text) return;
  if (!ttsCmd) { toast('Нет движка речи: sudo apt install espeak-ng'); return; }
  const [bin, args] = ttsCmd(/[Ѐ-ӿ]/.test(text));
  let me;
  try { me = spawn(bin, args, { stdio: ['pipe', 'ignore', 'ignore'] }); } catch { return; }
  ttsProc = me;
  reading = read;
  me.on('error', () => { if (ttsProc === me) { ttsProc = null; reading = false; push(); } });
  me.on('exit', () => { if (ttsProc === me) { ttsProc = null; reading = false; push(); } });
  me.stdin.on('error', () => {});
  me.stdin.end(text);
  if (read) push();
}

// ---------- IPC интерфейса ----------
function uiHandle(name, fn) {
  ipcMain.handle('ui:' + name, (e, ...args) => {
    if (!ui || e.sender !== ui.webContents) return null;
    return fn(...args);
  });
}

uiHandle('speak', (text) => speak(String(text || '').slice(0, 600)));
uiHandle('stopSpeak', () => stopSpeak());
uiHandle('voice', (v) => { cfg.voice = [0, 1, 2].includes(v) ? v : 2; saveCfg(); push(); });
uiHandle('extra', (px) => { uiExtra = Math.max(0, Math.min(120, px | 0)); layout(); push(); });
uiHandle('hubDragStart', () => {
  if (!win) return;
  const [w, h] = win.getContentSize();
  hubDrag = hubCenter(w, h);
});
uiHandle('hubDrag', (dx, dy) => {
  if (!win || !hubDrag) return;
  const [w, h] = win.getContentSize();
  cfg.hub = {
    fx: Math.min(1, Math.max(0, (hubDrag.cx + Number(dx || 0)) / w)),
    fy: Math.min(1, Math.max(0, (hubDrag.cy + Number(dy || 0)) / h)),
  };
  layout();
});
uiHandle('hubDrop', () => { hubDrag = null; saveCfg(); push(); });
uiHandle('readPage', async () => {
  if (reading) { stopSpeak(); return; }
  const a = tabById(activeId);
  if (!a || !a.view) return;
  let text = '';
  try {
    text = await a.view.webContents.executeJavaScript(
      "(() => { const s = String(getSelection()).trim(); return (s || document.body.innerText || '').slice(0, 40000); })()");
  } catch { /* страница недоступна */ }
  if (text && text.trim()) speak(text, { read: true });
  else toast('Нечего читать');
});
uiHandle('state', () => snapshot());
uiHandle('thumbs', () => Object.fromEntries(tabs.filter((t) => t.thumb).map((t) => [t.id, t.thumb])));
uiHandle('mode', (m, opts) => setMode(m, opts || {}));
uiHandle('select', async (id) => { await selectTab(id); await setMode('browse'); });
uiHandle('close', (id) => closeTab(id));
uiHandle('unload', (id) => { if (id !== activeId) unloadTab(id); });
uiHandle('dup', (id) => {
  const t = tabById(id);
  if (t) createTab({ url: t.url, profile: t.profile, after: t.id, background: true });
});
uiHandle('setProfile', (id, p) => setTabProfile(id, p));
uiHandle('reopen', async (i) => {
  const c = closedTabs.splice(i, 1)[0];
  if (!c) return;
  createTab({ url: c.url, title: c.title, favicon: c.favicon, profile: c.profile });
  await setMode('browse');
});
uiHandle('closed', () => closedTabs.slice());
uiHandle('nav', (a) => doNav(a));
uiHandle('go', async ({ text, profile, newTab }) => {
  const url = resolveInput(text);
  if (!url) return;
  const cur = tabById(activeId);
  if (newTab || !cur) {
    createTab({ url, profile: profile || (cur && cur.profile), after: activeId });
  } else {
    const changed = profile && profile !== cur.profile;
    if (changed) setTabProfile(cur.id, profile);
    if (!(changed && cur.url === url)) {
      cur.url = url;
      ensureView(cur);
      cur.view.webContents.loadURL(url).catch(() => {});
    }
  }
  await setMode('browse');
});
uiHandle('suggest', (q) => {
  q = String(q || '').trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const ok = (x) => terms.every((t) => (x.url + ' ' + (x.title || '')).toLowerCase().includes(t));
  const out = [];
  const seen = new Set();
  for (const b of bookmarks) if (ok(b) && !seen.has(b.url)) { seen.add(b.url); out.push({ url: b.url, title: b.title, kind: 'bm' }); }
  for (const h of history) { if (out.length >= 8) break; if (ok(h) && !seen.has(h.url)) { seen.add(h.url); out.push({ url: h.url, title: h.title, kind: 'hist' }); } }
  return out.slice(0, 8);
});
uiHandle('bookmarks', () => bookmarks);
uiHandle('bmToggle', () => {
  const a = tabById(activeId);
  if (!a || !/^https?:/i.test(a.url)) return;
  const i = bookmarks.findIndex((b) => b.url === a.url);
  if (i >= 0) { bookmarks.splice(i, 1); toast('Закладка удалена'); }
  else { bookmarks.push({ url: a.url, title: a.title || a.url, favicon: a.favicon }); toast('Добавлено в закладки'); }
  saveBookmarks();
  push();
});
uiHandle('bmRemove', (url) => { bookmarks = bookmarks.filter((b) => b.url !== url); saveBookmarks(); push(); });
uiHandle('scriptToggle', (id, on) => {
  const i = cfg.disabledScripts.indexOf(id);
  if (on && i >= 0) cfg.disabledScripts.splice(i, 1);
  if (!on && i < 0) cfg.disabledScripts.push(id);
  saveCfg();
  push();
  toast('Применится при следующей загрузке страницы');
});
uiHandle('scriptsReload', () => { loadScripts(); push(); toast('Скрипты перечитаны'); });
uiHandle('scriptsDir', () => { shell.openPath(F.scripts); return F.scripts; });
uiHandle('cmdRun', ({ sid, id }) => {
  const a = tabById(activeId);
  if (a && a.view) a.view.webContents.send('ts:run-cmd', { sid, id });
  return setMode('browse');
});
uiHandle('profileAdd', (name) => {
  name = String(name || '').trim().slice(0, 24);
  if (!name) return;
  let id = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'p';
  while (cfg.profiles.some((p) => p.id === id)) id += '-' + (cfg.profiles.length + 1);
  cfg.profiles.push({ id, name, color: PALETTE[cfg.profiles.length % PALETTE.length] });
  saveCfg();
  push();
});
uiHandle('zoom', (d) => {
  const a = tabById(activeId);
  if (!a || !a.view) return;
  a.zoom = Math.min(3, Math.max(0.3, Math.round((a.zoom + d) * 10) / 10));
  a.view.webContents.setZoomFactor(a.zoom);
  push();
});
uiHandle('desktop', () => {
  const a = tabById(activeId);
  if (!a || !a.view) return;
  a.desktop = !a.desktop;
  a.view.webContents.setUserAgent(uaFor(a));
  a.view.webContents.reload();
  push();
});
uiHandle('copyUrl', () => {
  const a = tabById(activeId);
  if (a) { clipboard.writeText(a.url); toast('Ссылка скопирована'); }
});
uiHandle('ctx', async ({ action, profile }) => {
  const c = ctxData;
  if (!c) return setMode('browse');
  const tab = tabById(c.tabId);
  const base = { profile: tab && tab.profile, after: c.tabId };
  switch (action) {
    case 'link-new': createTab({ url: c.linkURL, ...base }); break;
    case 'link-bg': createTab({ url: c.linkURL, ...base, background: true }); toast('Открыто в фоне'); break;
    case 'link-profile': createTab({ url: c.linkURL, ...base, profile }); break;
    case 'link-copy': clipboard.writeText(c.linkURL); toast('Ссылка скопирована'); break;
    case 'img-new': createTab({ url: c.srcURL, ...base }); break;
    case 'img-copy': clipboard.writeText(c.srcURL); toast('Адрес скопирован'); break;
    case 'sel-copy': clipboard.writeText(c.selectionText); break;
    case 'sel-search': createTab({ url: cfg.searchEngine.replace('%s', encodeURIComponent(c.selectionText)), ...base }); break;
    case 'paste': if (tab && tab.view) tab.view.webContents.paste(); break;
    default: break;
  }
  ctxData = null;
  if (mode !== 'browse') await setMode('browse');
});

// ---------- окно ----------
function createWindow() {
  win = new BaseWindow({
    width: 460,
    height: 880,
    minWidth: 300,
    minHeight: 420,
    backgroundColor: '#101114',
    title: 'Tessera Browser',
    frame: process.env.TB_FRAMELESS !== '1',
  });
  ui = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload-ui.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  ui.setBackgroundColor('#00000000');
  win.contentView.addChildView(ui);
  ui.webContents.loadFile(path.join(__dirname, 'ui', 'index.html'));
  ui.webContents.on('did-finish-load', push);
  ui.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ui.webContents.on('will-navigate', (e) => e.preventDefault());

  win.on('resize', () => { layout(); push(); });
  win.on('maximize', layout);
  win.on('unmaximize', layout);
  win.on('enter-full-screen', layout);
  win.on('leave-full-screen', layout);
  win.on('closed', () => { win = null; });
  if (process.env.TB_MAXIMIZE === '1') win.maximize();
  if (process.env.TB_FULLSCREEN === '1') win.setFullScreen(true);

  // восстановление сессии: открыта только активная вкладка, остальные выгружены
  const startUrl = process.argv.slice(1).find((a) => /^https?:\/\//i.test(a));
  const saved = readJSON(F.session, null);
  let needOmni = false;
  if (saved && Array.isArray(saved.tabs) && saved.tabs.length) {
    for (const t of saved.tabs) createTab({ ...t, id: t.id, restored: true });
    activeId = tabById(saved.active) ? saved.active : tabs[0].id;
    ensureView(tabById(activeId));
    if (startUrl) createTab({ url: startUrl });
    else { const a = tabById(activeId); needOmni = !a.url || a.url === 'about:blank'; }
  } else if (startUrl) {
    createTab({ url: startUrl });
  } else {
    createTab({ url: 'about:blank' });
    needOmni = true;
  }
  layout();
  if (needOmni) setMode('omnibox', { newTab: false });
  push();
}

app.on('second-instance', (_e, argv) => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  const u = argv.slice(1).find((a) => /^https?:\/\//i.test(a));
  if (u) createTab({ url: u });
});

app.whenReady().then(() => {
  fs.mkdirSync(F.scripts, { recursive: true });
  ttsCmd = detectTTS();
  loadScripts();
  try {
    fs.watch(F.scripts, debounce(() => { loadScripts(); push(); }, 400));
  } catch { /* наблюдение необязательно */ }
  createWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  stopSpeak();
  writeJSON(F.session, {
    active: activeId,
    tabs: tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, profile: t.profile, favicon: t.favicon })),
  });
  writeJSON(F.config, cfg);
  writeJSON(F.bookmarks, bookmarks);
  writeJSON(F.history, history);
});
