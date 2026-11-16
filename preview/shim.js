// Подставляет window.tessera вместо главного процесса Electron: всё состояние хранится здесь.
(() => {
'use strict';
const PAL = ['#7aa2ff', '#f5a97f', '#a6da95', '#f5bde6', '#eed49f', '#8bd5ca', '#ed8796'];
const profiles = [{ id: 'default', name: 'Основной', color: PAL[0] }, { id: 'second', name: 'Второй', color: PAL[1] }];
let seq = 1;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const mkTab = (url, profile) => ({ id: seq++, url, title: host(url), favicon: '', profile: profile || 'default', loading: false, loaded: true, desktop: false, zoom: 1, hist: [url], idx: 0 });
const tabs = [mkTab('https://example.org/', 'default'), mkTab('https://ru.wikipedia.org/', 'default'), mkTab('https://github.com/', 'second')];
tabs[1].title = 'Википедия'; tabs[2].title = 'GitHub'; tabs[0].title = 'Example Domain';
let active = tabs[0].id, mode = 'browse', newTab = false, ctx = null, voice = 2, extra = 0, speaking = false;
let bookmarks = [{ url: 'https://example.org/', title: 'Example Domain', favicon: '' }, { url: 'https://ru.wikipedia.org/', title: 'Википедия', favicon: '' }];
const closed = [];
const scripts = [
  { id: 'example', name: 'Пример: счётчик заходов', version: '1.0', description: '', enabled: true, matches: 1 },
  { id: 'ux', name: 'Browser UX Enhancer', version: '2.0', description: '', enabled: true, matches: 1 },
  { id: 'yt', name: 'YouTube TTS', version: '1.2', description: '', enabled: false, matches: 1 },
];
const L = { state: [], toast: [], thumb: [] };
const emit = (ch, ...a) => (L[ch] || []).forEach((f) => f(...a));
const tab = (id) => tabs.find((t) => t.id === id);
const cur = () => tab(active);
function snap() {
  const a = cur();
  return {
    mode, tabs: tabs.map((t) => ({ id: t.id, title: t.title, url: t.url, favicon: t.favicon, profile: t.profile, loading: t.loading, loaded: t.loaded, desktop: t.desktop })),
    active, profiles, canBack: !!a && a.idx > 0, canFwd: !!a && a.idx < a.hist.length - 1, loading: !!a && a.loading,
    bookmarked: !!a && bookmarks.some((b) => b.url === a.url), commands: [{ sid: 'example', id: 1, name: 'Сбросить счётчик' }],
    scripts, closedCount: closed.length, newTab, ctx, desktop: !!a && a.desktop, zoom: a ? a.zoom : 1, doubleTapMs: 300, voice, speaking, tts: true,
  };
}
let queued = false;
function push() {
  if (queued) return; queued = true;
  setTimeout(() => {
    queued = false; emit('state', snap());
    const a = cur();
    parent.postMessage({ type: 'layout', mode: mode === 'sheet' ? 'sheet' : mode, extra, title: a && a.title, url: a && a.url }, '*');
  }, 0);
}
const resolve = (t) => {
  t = String(t || '').trim(); if (!t) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
  if (!/\s/.test(t) && /^[^\s/]+\.[a-z]{2,}([:/?#].*)?$/i.test(t)) return 'https://' + t;
  return 'https://www.google.com/search?q=' + encodeURIComponent(t);
};
function say(text, read) {
  try {
    speechSynthesis.cancel(); if (!text) return;
    const u = new SpeechSynthesisUtterance(text); u.lang = /[Ѐ-ӿ]/.test(text) ? 'ru-RU' : 'en-US';
    if (read) { speaking = true; u.onend = u.onerror = () => { speaking = false; push(); }; }
    speechSynthesis.speak(u);
  } catch (e) { /* нет синтеза речи */ }
}
function navTo(t, url) {
  t.hist = t.hist.slice(0, t.idx + 1); t.hist.push(url); t.idx++; t.url = url; t.title = host(url); t.loading = true;
  setTimeout(() => { t.loading = false; push(); }, 700);
}
function open(url, profile, after, bg) {
  const t = mkTab(url, profile); const i = tabs.findIndex((x) => x.id === after);
  tabs.splice(i >= 0 ? i + 1 : tabs.length, 0, t); if (!bg) active = t.id; return t;
}
function thumb(t) {
  const h = [...t.url].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 360, 0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480"><rect width="360" height="480" fill="#fff"/><rect width="360" height="90" fill="hsl(${h} 55% 45%)"/><text x="76" y="56" font-size="26" fill="#fff" font-family="sans-serif">${(t.title || '').replace(/[<&]/g, '')}</text><g fill="#dde"><rect x="18" y="120" width="320" height="14"/><rect x="18" y="148" width="260" height="14"/><rect x="18" y="176" width="300" height="14"/><rect x="18" y="230" width="320" height="120" rx="10"/></g></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const H = {
  speak: (t) => say(String(t || ''), false),
  stopSpeak: () => { try { speechSynthesis.cancel(); } catch (e) { /* */ } speaking = false; push(); },
  voice: (v) => { voice = [0, 1, 2].includes(v) ? v : 2; push(); },
  extra: (px) => { extra = Math.max(0, Math.min(120, px | 0)); push(); },
  readPage: () => { if (speaking) return H.stopSpeak(); const s = String(getSelection && parent.getSelection ? parent.getSelection() : '').trim(); say(s || 'Это демонстрационная страница. Здесь был бы текст сайта.', true); push(); },
  state: () => snap(),
  thumbs: () => Object.fromEntries(tabs.map((t) => [t.id, thumb(t)])),
  mode: (m, o) => { mode = m; if (m === 'omnibox') newTab = !!(o && o.newTab); if (m !== 'sheet') ctx = null; push(); },
  select: (id) => { if (tab(id)) active = id; mode = 'browse'; ctx = null; push(); },
  close: (id) => { const i = tabs.findIndex((t) => t.id === id); if (i < 0) return; const t = tabs[i]; closed.unshift({ url: t.url, title: t.title, profile: t.profile, favicon: '' }); tabs.splice(i, 1); if (!tabs.length) tabs.push(mkTab('about:blank')); if (active === id) active = tabs[Math.min(i, tabs.length - 1)].id; push(); },
  unload: (id) => { const t = tab(id); if (t && id !== active) { t.loaded = false; push(); } },
  dup: (id) => { const t = tab(id); if (t) open(t.url, t.profile, t.id, true); active = active; push(); },
  setProfile: (id, p) => { const t = tab(id); if (t) t.profile = p; push(); },
  reopen: (i) => { const c = closed.splice(i, 1)[0]; if (c) open(c.url, c.profile, active, false); mode = 'browse'; push(); },
  closed: () => closed.slice(),
  nav: (a) => { const t = cur(); if (!t) return; if (a === 'back' && t.idx > 0) { t.idx--; t.url = t.hist[t.idx]; t.title = host(t.url); } else if (a === 'forward' && t.idx < t.hist.length - 1) { t.idx++; t.url = t.hist[t.idx]; t.title = host(t.url); } else if (a === 'reload') { t.loading = true; setTimeout(() => { t.loading = false; push(); }, 700); } push(); },
  go: ({ text, profile, newTab: nt }) => { const url = resolve(text); if (!url) return; const t = cur(); if (nt || !t) open(url, profile || (t && t.profile), active, false); else { if (profile) t.profile = profile; navTo(t, url); } mode = 'browse'; push(); },
  suggest: (q) => { q = String(q || '').toLowerCase(); return bookmarks.filter((b) => (b.url + b.title).toLowerCase().includes(q)).map((b) => ({ url: b.url, title: b.title, kind: 'bm' })); },
  bookmarks: () => bookmarks,
  bmToggle: () => { const a = cur(); const i = bookmarks.findIndex((b) => b.url === a.url); if (i >= 0) { bookmarks.splice(i, 1); emit('toast', 'Закладка удалена'); } else { bookmarks.push({ url: a.url, title: a.title, favicon: '' }); emit('toast', 'Добавлено в закладки'); } push(); },
  bmRemove: (url) => { bookmarks = bookmarks.filter((b) => b.url !== url); push(); },
  scriptToggle: (id, on) => { const s = scripts.find((x) => x.id === id); if (s) s.enabled = !!on; emit('toast', 'Применится при следующей загрузке страницы'); push(); },
  scriptsReload: () => emit('toast', 'Скрипты перечитаны'),
  scriptsDir: () => emit('toast', 'Папка скриптов (в превью недоступна)'),
  cmdRun: () => { mode = 'browse'; emit('toast', 'Команда скрипта выполнена'); push(); },
  profileAdd: (name) => { name = String(name || '').trim(); if (!name) return; profiles.push({ id: 'p' + profiles.length, name, color: PAL[profiles.length % PAL.length] }); push(); },
  zoom: (d) => { const t = cur(); t.zoom = Math.min(3, Math.max(0.3, Math.round((t.zoom + d) * 10) / 10)); emit('toast', 'Масштаб ' + Math.round(t.zoom * 100) + '%'); push(); },
  desktop: () => { const t = cur(); t.desktop = !t.desktop; push(); },
  copyUrl: () => { try { navigator.clipboard.writeText(cur().url); } catch (e) { /* */ } emit('toast', 'Ссылка скопирована'); },
  ctx: ({ action, profile }) => {
    const c = ctx; if (!c) { mode = 'browse'; return push(); }
    if (action === 'link-new') open(c.linkURL, cur().profile, active, false);
    else if (action === 'link-bg') { open(c.linkURL, cur().profile, active, true); emit('toast', 'Открыто в фоне'); }
    else if (action === 'link-profile') open(c.linkURL, profile, active, false);
    else if (action === 'link-copy') emit('toast', 'Ссылка скопирована');
    ctx = null; mode = 'browse'; push();
  },
};
window.tessera = {
  invoke: (name, ...args) => Promise.resolve(H[name] ? H[name](...args) : null),
  on: (ch, cb) => { if (L[ch]) L[ch].push(cb); },
};
addEventListener('message', (e) => {
  if (e.data && e.data.type === 'ctx') { ctx = { tabId: active, linkURL: 'https://example.org/', srcURL: '', selectionText: '', isEditable: false }; mode = 'sheet'; push(); }
});
push();
})();
