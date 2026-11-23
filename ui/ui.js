(() => {
'use strict';
const T = window.tessera;
const app = document.getElementById('app');
const tipEl = document.getElementById('tip');

let S = null;             // состояние от главного процесса
const thumbs = {};        // id вкладки -> миниатюра
let rendered = '';
let ringOpen = false;     // открыт веер от центральной кнопки
let ringFresh = false;
let overlay = null;       // { type:'actions'|'ask', ... }
let omni = { q: '', profile: null, newTab: false };
let sugTimer = null;
let tipTimer = null;
let extraOn = false;
let hubDragging = false;  // кнопку тащат: интерфейс не перерисовываем
let hubLast = 0;          // прошлое касание кнопки (озвучка 1: двойное касание открывает веер)

// ---------- иконки (Material, 24x24) ----------
const P = {
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  fwd: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
  down: 'M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z',
  reload: 'M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  star: 'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  search: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  bms: 'M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z',
  code: 'M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
  copy: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
  zoomIn: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm2.5-4h-2v2H9v-2H7V9h2V7h1v2h2v1z',
  zoomOut: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zM7 9h5v1H7z',
  desktop: 'M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z',
  history: 'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8z',
  play: 'M8 5v14l11-7z',
  stop: 'M6 6h12v12H6z',
  volOn: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
  volOff: 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z',
  check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  folder: 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
  openNew: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
  image: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
  paste: 'M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z',
  unload: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
};
const I = {};
for (const k of Object.keys(P)) I[k] = `<svg viewBox="0 0 24 24"><path d="${P[k]}"/></svg>`;
const HUB = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2.2"/><rect x="13" y="3" width="8" height="8" rx="2.2" opacity=".55"/><rect x="3" y="13" width="8" height="8" rx="2.2" opacity=".55"/><rect x="13" y="13" width="8" height="8" rx="2.2"/></svg>';
const NEWTAB = I.search + `<span class="plus">${I.add}</span>`;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const letter = (s) => (String(s || '?').trim()[0] || '?').toUpperCase();
const hue = (s) => { let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const profile = (id) => (S && S.profiles.find((p) => p.id === id)) || (S && S.profiles[0]) || { name: '?', color: '#7aa2ff', id: '' };
function hostOf(url) {
  if (!url || url === 'about:blank') return 'Новая вкладка';
  try { const u = new URL(url); return u.protocol === 'file:' ? 'Файл' : u.hostname.replace(/^www\./, ''); } catch { return url; }
}
const activeTab = () => S && S.tabs.find((t) => t.id === S.active);
const titleOf = (t) => (t ? (t.title || hostOf(t.url)) : '');

const VOICE_SAY = ['Озвучка выключена', 'Озвучка: касание говорит, долгое нажатие действует', 'Озвучка: действие и голос'];

// ---------- лицо сайта: буква под иконкой, иконка скрывает букву, когда реально загрузилась ----------
const okFav = new Set();
const badFav = new Set();
function face(cls, favicon, name) {
  const use = favicon && !badFav.has(favicon);
  return `<span class="${cls}${use && okFav.has(favicon) ? ' ok' : ''}" style="--h:${hue(name)}"><b>${esc(letter(name))}</b>${use ? `<img src="${esc(favicon)}" alt="">` : ''}</span>`;
}
app.addEventListener('load', (e) => {
  const im = e.target;
  if (!im || im.tagName !== 'IMG') return;
  okFav.add(im.getAttribute('src'));
  if (im.parentElement) im.parentElement.classList.add('ok');
}, true);
app.addEventListener('error', (e) => {
  const im = e.target;
  if (!im || im.tagName !== 'IMG') return;
  badFav.add(im.getAttribute('src'));
  im.remove();
}, true);

// ---------- кнопки ----------
function ibtn(a, icon, say, { cls = '', extra = '' } = {}) {
  return `<button class="ib ${cls}" data-a="${a}" data-say="${esc(say)}" ${extra}>${icon}</button>`;
}
function voiceBtnCls() { return S.voice === 1 ? 'm1' : (S.voice === 0 ? 'off-voice' : ''); }
const voiceIcon = () => (S.voice === 0 ? I.volOff : I.volOn);

// ---------- нижняя панель: только на панели вкладок ----------
function barHTML() {
  const hub = `<button class="hub${ringOpen ? ' open' : ''}" data-a="hub" data-say="Меню">${HUB}</button>`;
  return `<div class="bar">
    ${ibtn('newtab', NEWTAB, 'Новая вкладка')}
    ${ibtn('closed', I.history, 'Закрытые вкладки')}
    ${hub}
    ${ibtn('voice', voiceIcon(), VOICE_SAY[S.voice], { cls: voiceBtnCls() })}
    ${ibtn('close', I.down, 'К странице')}
  </div>`;
}

// ---------- плавающая кнопка на странице (как в браузере универсального приложения) ----------
// Нажатие открывает вкладки, долгое нажатие открывает веер, перетаскивание двигает кнопку, при прокрутке она гаснет.
function hubG() {
  if (S.hub) return S.hub;
  const W = window.innerWidth || 460, H = window.innerHeight || 880;      // превью без главного процесса: кнопка внизу по центру
  return { cx: W / 2, cy: H - 40, ox: W / 2 - 39, oy: H - 78, below: false };
}
function hubFloatHTML() {
  const g = hubG();
  const a = activeTab();
  const p = profile(a && a.profile);
  return `<button class="hub float${S.hubHidden ? ' hidden' : ''}" style="left:${g.ox + 5}px;top:${g.oy + 5}px" data-a="hubf" data-say="Вкладки">${HUB}${S.loading ? '<i class="hring"></i>' : ''}<i class="pdot" style="background:${esc(p.color)}"></i></button>`;
}
function hubRingHTML() {
  const g = hubG();
  return `<button class="hub float open" style="left:${g.ox + 5}px;top:${g.oy + 5}px" data-a="hub" data-say="Меню">${HUB}</button>`;
}
function updateHub(hb) {
  const g = hubG();
  hb.style.left = (g.ox + 5) + 'px';
  hb.style.top = (g.oy + 5) + 'px';
  hb.classList.toggle('hidden', !!S.hubHidden);
  const r = hb.querySelector('.hring');
  if (S.loading && !r) hb.insertAdjacentHTML('beforeend', '<i class="hring"></i>');
  else if (!S.loading && r) r.remove();
  const a = activeTab();
  const dot = hb.querySelector('.pdot');
  if (dot && a) dot.style.background = profile(a.profile).color;
}

// ---------- веер вокруг кнопки ----------
function ringItems() {
  const cmds = S.commands || [];
  const voice = ['voice', voiceIcon(), VOICE_SAY[S.voice], { cls: voiceBtnCls() }];
  if (S.mode === 'panel') {
    return [['newtab', NEWTAB, 'Новая вкладка'], ['closed', I.history, 'Закрытые вкладки'], ['m-bms', I.bms, 'Закладки'], ['m-scripts', I.code, 'Скрипты'], voice];
  }
  return [
    S.loading ? ['m-reload', I.close, 'Остановить'] : ['m-reload', I.reload, 'Обновить'],
    ['back', I.back, 'Назад', { cls: S.canBack ? '' : 'off' }],
    ['m-forward', I.fwd, 'Вперёд', { cls: S.canFwd ? '' : 'off' }],
    ['omni', I.search, 'Адрес и поиск'],
    ['newtab', NEWTAB, 'Новая вкладка'],
    ['m-bm', I.star, S.bookmarked ? 'Убрать из закладок' : 'В закладки', { cls: S.bookmarked ? 'on' : '' }],
    ['tabs', `<span class="cnt">${S.tabs.length}</span>`, 'Вкладки: ' + S.tabs.length],
    ['m-read', S.speaking ? I.stop : I.play, S.speaking ? 'Остановить чтение' : 'Читать страницу', { cls: S.speaking ? 'on' : '' }],
    voice,
    ['m-bms', I.bms, 'Закладки'],
    ['m-scripts', I.code, 'Скрипты' + (cmds.length ? ', команд: ' + cmds.length : '')],
    ['m-desktop', I.desktop, S.desktop ? 'Мобильная версия' : 'Версия для компьютера', { cls: S.desktop ? 'on' : '' }],
    ['m-zoomout', I.zoomOut, 'Масштаб меньше'],
    ['m-zoomin', I.zoomIn, 'Масштаб больше'],
    ['m-copy', I.copy, 'Копировать ссылку'],
  ];
}

// Кольца значков вокруг кнопки. Где кольцо уходит за край экрана, значки ложатся на самую длинную дугу в пределах экрана.
function ringLayout(count, cx, cy, W, H) {
  const M = 32, STEP = 4, GAP = 60;
  const out = [];
  let left = count;
  for (let k = 0; left > 0 && k < 5; k++) {
    const r = 92 + 68 * k;
    const cap = k === 0 ? 6 : 10;
    const ok = [];
    for (let a = 0; a < 360; a += STEP) {
      const x = cx + r * Math.cos(a * Math.PI / 180);
      const y = cy - r * Math.sin(a * Math.PI / 180);
      ok.push(x >= M && x <= W - M && y >= M && y <= H - M);
    }
    const n = ok.length;
    const angles = [];                                   // градусы, от большего к меньшему (слева направо вверху)
    if (ok.every(Boolean)) {
      const m = Math.min(left, cap);
      const start = 90 + (k % 2 ? 180 / m : 0);
      for (let i = 0; i < m; i++) angles.push(start - i * 360 / m);
    } else {
      let bestStart = -1, bestLen = 0;
      for (let s0 = 0; s0 < n; s0++) {
        if (!ok[s0] || ok[(s0 - 1 + n) % n]) continue;   // начало дуги (дуга может переходить через 0)
        let len = 0;
        while (len < n && ok[(s0 + len) % n]) len++;
        if (len > bestLen) { bestLen = len; bestStart = s0; }
      }
      if (bestStart >= 0) {
        const span = (bestLen - 1) * STEP;
        const arcLen = r * span * Math.PI / 180;
        const m = Math.min(left, cap, Math.floor(arcLen / GAP) + 1);
        if (m > 0) {
          const mid = bestStart * STEP + span / 2;
          const stepA = m > 1 ? Math.min(span / (m - 1), GAP * 1.4 / r * 180 / Math.PI) : 0;
          const first = mid + stepA * (m - 1) / 2;
          for (let i = 0; i < m; i++) angles.push(first - i * stepA);
        }
      }
    }
    for (const a of angles) {
      out.push({ dx: Math.round(r * Math.cos(a * Math.PI / 180)), dy: Math.round(-r * Math.sin(a * Math.PI / 180)), k });
    }
    left -= angles.length;
  }
  return out;
}

function ringHTML() {
  const list = ringItems();
  const W = window.innerWidth || 460;
  const H = window.innerHeight || 880;
  const c = S.mode === 'panel' ? { x: W / 2, y: H - 40 } : { x: hubG().cx, y: hubG().cy };
  const pos = ringLayout(list.length, c.x, c.y, W, H);
  const btns = pos.map((p, i) => {
    const x = list[i];
    const opt = x[3] || {};
    return `<button class="ri gl${ringFresh ? ' pre' : ''} ${opt.cls || ''}" style="left:${c.x}px;top:${c.y}px;--x:${p.dx}px;--y:${p.dy}px;--d:${p.k * 50 + (i % 6) * 18}ms" data-a="${x[0]}" data-say="${esc(x[2])}">${x[1]}</button>`;
  }).join('');
  return `<div class="backdrop" data-a="close-ring" data-direct="1"></div><div class="glow" style="left:${c.x}px;top:${c.y}px"></div>` + btns;
}

// ---------- вкладки ----------
function cardHTML(t) {
  const p = profile(t.profile);
  const th = thumbs[t.id];
  const host = hostOf(t.url);
  const logo = face('logo', t.favicon, host);
  return `<div class="card${t.id === S.active ? ' active' : ''}${t.loaded ? '' : ' unloaded'}" data-tab="${t.id}"${th ? ` style="background-image:url('${th}')"` : ''}>
    ${th ? '' : `<div class="ph">${esc(letter(host))}</div>`}
    <div class="fade"></div>
    <span class="badge" style="--c:${esc(p.color)}">${esc(letter(p.name))}</span>
    ${t.loading ? '<div class="ld"></div>' : ''}
    ${logo}
  </div>`;
}

function panelBody() {
  return `<div class="screen panel"><div class="body"><div class="grid">${S.tabs.map(cardHTML).join('')}</div></div>`;
}

// ---------- адресная строка ----------
function chipsHTML() {
  return `<span class="mk">${omni.newTab ? NEWTAB : I.fwd}</span>`
    + S.profiles.map((p) => `<button class="chip${p.id === omni.profile ? ' sel' : ''}" style="--c:${esc(p.color)}" data-a="chip" data-id="${esc(p.id)}" data-say="${esc(p.name)}"><span class="badge" style="--c:${esc(p.color)}">${esc(letter(p.name))}</span></button>`).join('')
    + `<button class="chip add" data-a="chip-add" data-say="Новый профиль">${I.add}</button>`;
}

function omniHTML() {
  return `<div class="screen">
    <div class="omnirow">
      <input id="q" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Поиск или адрес">
      ${ibtn('close', I.close, 'Закрыть', { extra: 'data-direct="1"' })}
    </div>
    <div class="chips" id="chips"></div>
    <div class="body" id="sg"></div>
  </div>`;
}

function logoHTML(url, title, favicon) {
  return face('lg', favicon, title || hostOf(url));
}
function bmTile(b) {
  return `<button class="lt" data-bm="${encodeURIComponent(b.url)}" data-t="${esc(b.title || hostOf(b.url))}">${logoHTML(b.url, b.title, b.favicon)}</button>`;
}

// ---------- шторки действий ----------
function actBtn(a, icon, say, extra = '', cls = '') {
  return `<button class="act gl ${cls}" data-a="${a}" data-say="${esc(say)}" ${extra}>${icon}</button>`;
}

function ctxHTML() {
  const c = S.ctx;
  const cur = activeTab();
  const others = S.profiles.filter((p) => !cur || p.id !== cur.profile);
  let h = '';
  if (c.linkURL) {
    h += `<div class="hd">${esc(c.linkURL)}</div><div class="acts">`
      + actBtn('c-link-new', I.openNew, 'Открыть в новой вкладке')
      + actBtn('c-link-bg', I.add, 'Открыть в фоне')
      + actBtn('c-link-copy', I.copy, 'Копировать ссылку')
      + others.map((p) => `<button class="act gl" data-a="c-link-profile" data-id="${esc(p.id)}" data-say="Открыть в профиле ${esc(p.name)}"><span class="badge" style="--c:${esc(p.color)}">${esc(letter(p.name))}</span></button>`).join('')
      + '</div>';
  }
  if (c.srcURL) h += `<div class="acts">${actBtn('c-img-new', I.image, 'Открыть картинку')}${actBtn('c-img-copy', I.copy, 'Копировать адрес картинки')}</div>`;
  if (c.selectionText) h += `<div class="acts">${actBtn('c-sel-copy', I.copy, 'Копировать текст')}${actBtn('c-sel-search', I.search, 'Искать в сети')}</div>`;
  if (c.isEditable) h += `<div class="acts">${actBtn('c-paste', I.paste, 'Вставить')}</div>`;
  return `<div class="backdrop" data-a="close-ring" data-direct="1"></div><div class="sheet" style="bottom:28px">${h}</div>`;
}

function scriptsHTML() {
  const cmds = S.commands || [];
  const tiles = S.scripts.map((s) => {
    const mine = cmds.filter((c) => c.sid === s.id);
    return `<div class="lt${s.enabled ? '' : ' dim'}">
      <button class="lg" style="--h:${hue(s.name)}" data-a="sw" data-id="${esc(s.id)}" data-on="${s.enabled ? 1 : 0}" data-say="${esc(s.name + (s.enabled ? ', включён' : ', выключен'))}">${esc(letter(s.name))}${s.enabled ? `<i class="ck">${I.check}</i>` : ''}</button>
      ${mine.length ? `<div class="cmds">${mine.map((c) => `<button class="cmd gl" data-a="cmd" data-sid="${esc(c.sid)}" data-id="${c.id}" data-say="${esc(c.name)}">${I.play}</button>`).join('')}</div>` : ''}
    </div>`;
  }).join('');
  return `<div class="screen">
    <div class="top">${ibtn('sc-reload', I.reload, 'Перечитать скрипты')}${ibtn('sc-dir', I.folder, 'Папка со скриптами')}</div>
    <div class="body" style="padding-top:64px">${S.scripts.length ? `<div class="scripts">${tiles}</div>` : '<div class="empty">Скриптов нет.<br>Положите файлы *.user.js в папку скриптов.</div>'}</div>
    <div class="foot">${ibtn('close', I.down, 'К странице')}</div></div>`;
}

function bookmarksHTML(items) {
  return `<div class="screen"><div class="body" style="padding-top:22px">${items.length ? `<div class="logos">${items.map(bmTile).join('')}</div>` : '<div class="empty">Закладок нет.<br>Звезда в меню добавляет страницу.</div>'}</div>
    <div class="foot">${ibtn('close', I.down, 'К странице')}</div></div>`;
}

function closedHTML(items) {
  const rows = items.map((c, i) => `<button class="sugg" data-a="reopen" data-i="${i}" data-direct="1">
      <span class="badge" style="--c:${esc(profile(c.profile).color)}">${esc(letter(profile(c.profile).name))}</span>
      <span class="st"><div class="t1">${esc(c.title || hostOf(c.url))}</div><div class="t2">${esc(c.url)}</div></span></button>`).join('');
  return `<div class="screen"><div class="body" style="padding-top:20px">${rows || '<div class="empty">Закрытых вкладок нет</div>'}</div>
    <div class="foot">${ibtn('panel', I.down, 'К вкладкам')}</div></div>`;
}

function overlayHTML() {
  if (!overlay) return '';
  if (overlay.type === 'ask') {
    return `<div class="dlg"><div class="box"><input id="askq" type="text" autocomplete="off" spellcheck="false" placeholder="${esc(overlay.title)}">
      <div class="act2">${actBtn('ov-cancel', I.close, 'Отмена', 'data-direct="1"')}${actBtn('ov-ok', I.check, 'Готово', 'data-direct="1"')}</div></div></div>`;
  }
  return `<div class="backdrop" data-a="ov-cancel" data-direct="1"></div><div class="sheet" style="bottom:100px">
    ${overlay.title ? `<div class="hd">${esc(overlay.title)}</div>` : ''}
    <div class="acts">${overlay.items.map((it, i) => `<button class="act gl${it.danger ? ' danger' : ''}" data-a="ov-item" data-i="${i}" data-say="${esc(it.label)}" data-direct="1">${it.badge ? `<span class="badge" style="--c:${esc(it.badge.color)}">${esc(it.badge.letter)}</span>` : it.icon}</button>`).join('')}</div></div>`;
}

// ---------- отрисовка ----------
function kindOf() {
  if (S.mode === 'sheet') return S.ctx ? 'ctx' : 'ring';
  return S.mode;
}

function render(force) {
  if (!S || hubDragging) return;
  const kind = kindOf();
  if (kind === 'ring') ringOpen = true;
  else if (kind !== 'panel') ringOpen = false;
  if (!force && kind === 'browse' && rendered === 'browse' && !overlay) {
    const hb = app.querySelector('.hub.float');
    if (hb) { updateHub(hb); return; }
  }
  if (!force && overlay && overlay.type === 'ask' && rendered === kind) return;
  if (!force && kind === 'omnibox' && rendered === 'omnibox' && !overlay) {
    const c = document.getElementById('chips');
    if (c) c.innerHTML = chipsHTML();
    return;
  }
  const prevBody = app.querySelector('.body');
  const keepScroll = prevBody && rendered === kind ? prevBody.scrollTop : 0;
  const enteringOmni = kind === 'omnibox' && rendered !== 'omnibox';
  rendered = kind;
  const ring = ringOpen && (kind === 'ring' || kind === 'panel') ? ringHTML() : '';

  switch (kind) {
    case 'browse': app.innerHTML = hubFloatHTML(); break;
    case 'ring': app.innerHTML = ring + hubRingHTML(); break;
    case 'ctx': app.innerHTML = ctxHTML(); break;
    case 'panel': app.innerHTML = panelBody() + ring + barHTML('panel') + '</div>'; break;
    case 'omnibox': {
      if (enteringOmni) {
        const a = activeTab();
        omni = {
          q: S.newTab || !a || a.url === 'about:blank' ? '' : a.url,
          profile: (a && a.profile) || S.profiles[0].id,
          newTab: S.newTab,
        };
      }
      app.innerHTML = omniHTML();
      const q = document.getElementById('q');
      q.value = omni.q;
      document.getElementById('chips').innerHTML = chipsHTML();
      setTimeout(() => { q.focus(); q.select(); }, 30);
      refreshSuggestions();
      break;
    }
    case 'scripts': app.innerHTML = scriptsHTML(); break;
    case 'bookmarks':
      app.innerHTML = bookmarksHTML([]);
      T.invoke('bookmarks').then((items) => { if (rendered === 'bookmarks') { app.innerHTML = bookmarksHTML(items || []) + overlayHTML(); } });
      break;
    case 'closed':
      app.innerHTML = closedHTML([]);
      T.invoke('closed').then((items) => { if (rendered === 'closed') app.innerHTML = closedHTML(items || []) + overlayHTML(); });
      break;
    default: app.innerHTML = '';
  }
  if (overlay) app.insertAdjacentHTML('beforeend', overlayHTML());
  if (ringFresh) {
    requestAnimationFrame(() => requestAnimationFrame(() => { app.querySelectorAll('.ri.pre').forEach((el) => el.classList.remove('pre')); }));
    ringFresh = false;
  }
  const body = app.querySelector('.body');
  if (body && keepScroll) body.scrollTop = keepScroll;
  if (overlay && overlay.type === 'ask') { const i = document.getElementById('askq'); if (i) i.focus(); }
}

async function refreshSuggestions() {
  const box = document.getElementById('sg');
  if (!box) return;
  const q = omni.q.trim();
  const a = activeTab();
  if (!q || (a && q === a.url)) {
    const bms = (await T.invoke('bookmarks')) || [];
    if (document.getElementById('sg') === box) box.innerHTML = bms.length ? `<div class="logos">${bms.map(bmTile).join('')}</div>` : '<div class="empty">Введите адрес или запрос</div>';
    return;
  }
  const items = (await T.invoke('suggest', q)) || [];
  if (document.getElementById('sg') !== box) return;
  box.innerHTML = `<button class="sugg" data-a="go" data-text="${esc(q)}" data-direct="1">${I.search}<span class="st"><div class="t1">${esc(q)}</div><div class="t2">Перейти или искать</div></span></button>`
    + items.map((it) => `<button class="sugg" data-a="go" data-text="${esc(it.url)}" data-direct="1">${it.kind === 'bm' ? I.bms : I.history}
    <span class="st"><div class="t1">${esc(it.title || it.url)}</div><div class="t2">${esc(it.url)}</div></span></button>`).join('');
}

// ---------- подсказки и голос ----------
function hideTip() {
  tipEl.classList.remove('show');
  if (extraOn) { extraOn = false; T.invoke('extra', 0); }
}
function placeTip(rect) {
  const W = window.innerWidth || 460;
  if (S && S.mode === 'browse') {
    const g = hubG();
    tipEl.style.left = (g.ox + 39) + 'px';
    if (g.below) { tipEl.style.bottom = 'auto'; tipEl.style.top = (g.oy + 86) + 'px'; }
    else { tipEl.style.top = 'auto'; tipEl.style.bottom = '86px'; }
  } else if (rect) {
    const y = rect.top - 52;
    tipEl.style.bottom = 'auto';
    tipEl.style.top = (y < 8 ? rect.bottom + 10 : y) + 'px';
    tipEl.style.left = Math.min(Math.max(rect.left + rect.width / 2, 100), W - 100) + 'px';
  } else {
    tipEl.style.top = 'auto'; tipEl.style.bottom = '100px'; tipEl.style.left = (W / 2) + 'px';
  }
  tipEl.classList.add('show');
  clearTimeout(tipTimer);
  tipTimer = setTimeout(hideTip, 1900);
}
function showTip(text, rect) {
  if (!text) return;
  tipEl.textContent = text;
  if (S && S.mode === 'browse' && !extraOn) {
    // на странице окно интерфейса только размером с кнопку: сначала просим место под подсказку
    extraOn = true;
    T.invoke('extra', 64).then(() => T.invoke('state')).then((st) => { if (st) S = st; placeTip(rect); });
    return;
  }
  placeTip(rect);
}
function sayLabel(text, rect, withTip) {
  if (withTip) showTip(text, rect);
  if (S && S.voice > 0 && text) T.invoke('speak', text);
}

function askText(title, cb) { overlay = { type: 'ask', title, cb }; render(true); }
function showActions(title, items) { overlay = { type: 'actions', title, items }; render(true); }
function closeOverlay() { overlay = null; render(true); }

// ---------- жесты ----------
let press = null;
let lastTap = null;
const LONG = 450;

app.addEventListener('pointerdown', (e) => {
  if (e.target.closest('input')) return;
  const el = e.target.closest('[data-a],[data-tab],[data-bm]');
  if (!el) return;
  const kind = el.dataset.tab !== undefined ? 'tab' : (el.dataset.bm !== undefined ? 'bm' : (el.dataset.a === 'hubf' ? 'hubf' : 'a'));
  press = {
    kind, d: Object.assign({}, el.dataset), rect: el.getBoundingClientRect(), x: e.clientX, y: e.clientY,
    sx: e.screenX, sy: e.screenY, long: false, drag: false,
    timer: setTimeout(() => { if (press) { press.long = true; onLong(press); } }, LONG),
  };
  if (kind === 'hubf') { try { el.setPointerCapture(e.pointerId); } catch (err) { /* без захвата */ } }
  el.classList.add('down');
});
app.addEventListener('pointermove', (e) => {
  if (!press) return;
  if (press.kind === 'hubf') {
    // кнопку двигаем по экранным координатам: окно интерфейса само движется вместе с кнопкой
    const dx = e.screenX - press.sx, dy = e.screenY - press.sy;
    if (!press.drag && Math.hypot(dx, dy) > 12) {
      press.drag = true; hubDragging = true;
      clearTimeout(press.timer); clearDown();
      T.invoke('hubDragStart');
    }
    if (press.drag) T.invoke('hubDrag', dx, dy);
    return;
  }
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) { clearTimeout(press.timer); press = null; clearDown(); }
});
function endHubDrag() { hubDragging = false; T.invoke('hubDrop'); }
app.addEventListener('pointercancel', () => {
  if (press) { clearTimeout(press.timer); if (press.drag) endHubDrag(); }
  press = null; clearDown();
});
app.addEventListener('pointerup', () => {
  clearDown();
  if (!press) return;
  clearTimeout(press.timer);
  const p = press;
  press = null;
  if (p.drag) { endHubDrag(); return; }
  if (!p.long) onTap(p);
});
function clearDown() { app.querySelectorAll('.down').forEach((x) => x.classList.remove('down')); }

function onTap(p) {
  const d = p.d;
  if (p.kind === 'hubf') return hubTap(p);
  if (p.kind === 'tab') return tabTap(Number(d.tab));
  if (p.kind === 'bm') {
    const url = decodeURIComponent(d.bm);
    sayLabel(d.t, p.rect, false);
    T.invoke('go', { text: url, profile: omni.profile, newTab: rendered === 'omnibox' ? omni.newTab : true });
    return;
  }
  if (d.direct === '1' || !d.say) return act(d.a, d);
  if (S.voice === 1) { sayLabel(d.say, p.rect, true); return; }   // тап озвучивает
  act(d.a, d);
  if (S.voice === 2) sayLabel(d.say, p.rect, false);
}

function onLong(p) {
  const d = p.d;
  if (p.kind === 'hubf') return hubLong(p);
  if (p.kind === 'tab') return cardMenu(Number(d.tab));
  if (p.kind === 'bm') {
    return showActions(d.t, [{ icon: I.close, label: 'Удалить закладку', danger: true, fn: () => { T.invoke('bmRemove', decodeURIComponent(d.bm)).then(() => { rendered = ''; render(); }); } }]);
  }
  if (d.direct === '1' || !d.say) return;
  if (S.voice === 1) { act(d.a, d); return; }                      // долгое нажатие выполняет
  sayLabel(d.say, p.rect, true);                                    // иначе подсказка с названием
}

function hubTap(p) {
  if (S.voice === 1) {                                // тап озвучивает, двойной тап открывает веер
    const now = Date.now();
    if (hubLast && now - hubLast < 600) { hubLast = 0; openRing(); return; }
    hubLast = now;
    sayLabel('Вкладки', p.rect, true);
    return;
  }
  act('tabs', {});
  if (S.voice === 2) sayLabel('Вкладки', p.rect, false);
}
function hubLong(p) {
  if (S.voice === 1) { act('tabs', {}); return; }     // озвучка 1: долгое нажатие выполняет основное действие
  openRing();
  if (S.voice === 2) sayLabel('Меню', p.rect, false);
}

function tabTap(id) {
  const t = S.tabs.find((x) => x.id === id);
  const ms = S.doubleTapMs || 300;
  const now = Date.now();
  if (lastTap && lastTap.id === id && now - lastTap.t < ms) {
    clearTimeout(lastTap.timer);
    lastTap = null;
    T.invoke('close', id);                       // двойной тап закрывает вкладку
    return;
  }
  lastTap = { id, t: now, timer: setTimeout(() => {
    lastTap = null;
    if (S.voice > 0 && t) T.invoke('speak', titleOf(t));
    T.invoke('select', id);
  }, ms) };
}

function cardMenu(id) {
  const t = S.tabs.find((x) => x.id === id);
  if (!t) return;
  const items = [];
  if (t.loaded && t.id !== S.active) items.push({ icon: I.unload, label: 'Выгрузить из памяти', fn: () => T.invoke('unload', t.id) });
  items.push({ icon: I.copy, label: 'Дублировать', fn: () => T.invoke('dup', t.id) });
  for (const pr of S.profiles) {
    if (pr.id !== t.profile) items.push({ badge: { color: pr.color, letter: letter(pr.name) }, label: 'Профиль: ' + pr.name, fn: () => T.invoke('setProfile', t.id, pr.id) });
  }
  items.push({ icon: I.close, label: 'Закрыть', danger: true, fn: () => T.invoke('close', t.id) });
  showActions(titleOf(t), items);
}

// ---------- действия ----------
function openRing() {
  ringOpen = true; ringFresh = true;
  if (S.mode === 'browse') T.invoke('mode', 'sheet'); else render(true);
}
function closeRing() {
  ringOpen = false;
  if (S.mode === 'sheet' && !S.ctx) T.invoke('mode', 'browse'); else render(true);
}
function go(text) {
  const q = String(text || '').trim();
  if (q) T.invoke('go', { text: q, profile: omni.profile, newTab: omni.newTab });
}

function act(a, d) {
  switch (a) {
    case 'hub': if (ringOpen) closeRing(); else openRing(); break;
    case 'close-ring': ringOpen = false; if (S.ctx) T.invoke('mode', 'browse'); else closeRing(); break;
    case 'back': ringOpen = false; T.invoke('nav', 'back'); T.invoke('mode', 'browse'); break;
    case 'm-forward': ringOpen = false; T.invoke('nav', 'forward'); T.invoke('mode', 'browse'); break;
    case 'omni': T.invoke('mode', 'omnibox', { newTab: false }); break;
    case 'tabs': ringOpen = false; T.invoke('thumbs').then((m) => { Object.assign(thumbs, m || {}); T.invoke('mode', 'panel'); }); break;
    case 'close': ringOpen = false; T.invoke('mode', 'browse'); break;
    case 'panel': T.invoke('mode', 'panel'); break;
    case 'newtab': ringOpen = false; T.invoke('mode', 'omnibox', { newTab: true }); break;
    case 'closed': ringOpen = false; T.invoke('mode', 'closed'); break;
    case 'reopen': T.invoke('reopen', Number(d.i)); break;
    case 'go': go(d.text); break;
    case 'chip': omni.profile = d.id; { const c = document.getElementById('chips'); if (c) c.innerHTML = chipsHTML(); } break;
    case 'chip-add': askText('Название профиля', (name) => T.invoke('profileAdd', name)); break;
    case 'm-reload': ringOpen = false; T.invoke('nav', 'reload'); T.invoke('mode', 'browse'); break;
    case 'm-bm': T.invoke('bmToggle'); break;
    case 'm-bms': ringOpen = false; T.invoke('mode', 'bookmarks'); break;
    case 'm-scripts': ringOpen = false; T.invoke('mode', 'scripts'); break;
    case 'm-desktop': ringOpen = false; T.invoke('desktop'); T.invoke('mode', 'browse'); break;
    case 'm-copy': ringOpen = false; T.invoke('copyUrl'); T.invoke('mode', 'browse'); break;
    case 'm-zoomin': T.invoke('zoom', 0.1); break;
    case 'm-zoomout': T.invoke('zoom', -0.1); break;
    case 'm-read': ringOpen = false; T.invoke('readPage'); T.invoke('mode', 'browse'); break;
    case 'voice': {
      const nv = ((S.voice | 0) + 1) % 3;
      T.invoke('voice', nv).then(() => { showTip(VOICE_SAY[nv], null); if (nv > 0) T.invoke('speak', VOICE_SAY[nv]); else T.invoke('stopSpeak'); });
      break;
    }
    case 'sw': T.invoke('scriptToggle', d.id, d.on !== '1'); break;
    case 'cmd': T.invoke('cmdRun', { sid: d.sid, id: Number(d.id) }); break;
    case 'sc-reload': T.invoke('scriptsReload'); break;
    case 'sc-dir': T.invoke('scriptsDir'); break;
    case 'ov-cancel': closeOverlay(); break;
    case 'ov-item': { const it = overlay && overlay.items[Number(d.i)]; closeOverlay(); if (it) it.fn(); break; }
    case 'ov-ok': { const v = (document.getElementById('askq') || {}).value; const cb = overlay && overlay.cb; closeOverlay(); if (cb && v) cb(v); break; }
    default:
      if (a && a.startsWith('c-')) T.invoke('ctx', { action: a.slice(2), profile: d.id });
  }
}

app.addEventListener('input', (e) => {
  if (e.target.id !== 'q') return;
  omni.q = e.target.value;
  clearTimeout(sugTimer);
  sugTimer = setTimeout(refreshSuggestions, 120);
});
app.addEventListener('keydown', (e) => {
  if (e.target.id === 'q') {
    if (e.key === 'Enter') { e.preventDefault(); go(e.target.value); }
    else if (e.key === 'Escape') T.invoke('mode', 'browse');
  } else if (e.target.id === 'askq') {
    if (e.key === 'Enter') act('ov-ok', {});
    else if (e.key === 'Escape') act('ov-cancel', {});
  }
});

// ---------- связь с главным процессом ----------
T.on('state', (s) => { S = s; render(); });
T.on('toast', (t) => showTip(t, null));
T.on('thumb', (id, data) => {
  thumbs[id] = data;
  const el = app.querySelector(`[data-tab="${id}"]`);
  if (el) { el.style.backgroundImage = `url('${data}')`; const ph = el.querySelector('.ph'); if (ph) ph.remove(); }
});
T.invoke('state').then((s) => { if (s) { S = s; render(); } });
})();
