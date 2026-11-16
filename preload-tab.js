'use strict';
// Прелоад страницы: запускает юзерскрипты и даёт им GM_* API.
// Выполняется в изолированном мире Electron; скрипты с @grant — в мире 1001, @grant none — в мире страницы.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

const WORLD = 1001;

function init() {
  let scripts = [];
  try { scripts = ipcRenderer.sendSync('ts:match', location.href) || []; } catch (e) { scripts = []; }
  if (!scripts.length) return;

  const cmds = [];
  let cmdSeq = 0;
  let xhrSeq = 0;
  let cmdTimer = null;

  function sendCmds() {
    clearTimeout(cmdTimer);
    cmdTimer = setTimeout(() => {
      ipcRenderer.send('ts:commands', cmds.map((c) => ({ sid: c.sid, id: c.id, name: c.name })));
    }, 50);
  }

  function safeCall(fn, arg) {
    if (typeof fn !== 'function') return;
    try { fn(arg); } catch (e) { console.error('[Tessera] ошибка в обработчике скрипта:', e); }
  }

  const api = {
    getValue(sid, key) {
      const r = ipcRenderer.sendSync('gm:get', sid, String(key));
      return r;
    },
    setValue(sid, key, value) {
      ipcRenderer.send('gm:set', sid, String(key), value === undefined ? null : value);
    },
    deleteValue(sid, key) { ipcRenderer.send('gm:del', sid, String(key)); },
    listValues(sid) { return ipcRenderer.sendSync('gm:list', sid); },

    xhr(sid, d) {
      const id = ++xhrSeq;
      let aborted = false;
      const plain = {
        id,
        url: String(d.url),
        method: d.method || 'GET',
        headers: d.headers ? Object.assign({}, d.headers) : {},
        data: d.data == null ? undefined : (typeof d.data === 'string' ? d.data : String(d.data)),
        timeout: d.timeout | 0,
        anonymous: !!d.anonymous,
        responseType: d.responseType || '',
      };
      ipcRenderer.invoke('gm:xhr', plain).then((r) => {
        if (aborted) return;
        if (r.error) {
          safeCall(r.timeout ? d.ontimeout : d.onerror, {
            error: r.error, status: 0, readyState: 4, responseText: '', finalUrl: plain.url, context: d.context,
          });
          return;
        }
        const resp = {
          readyState: 4,
          status: r.status,
          statusText: r.statusText,
          responseHeaders: r.headers,
          finalUrl: r.url,
          context: d.context,
          responseText: '',
          response: null,
        };
        const t = plain.responseType;
        if (t === 'arraybuffer') {
          const u8 = new Uint8Array(r.body);
          resp.response = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
        } else if (t === 'blob') {
          resp.response = new Blob([new Uint8Array(r.body)], { type: r.contentType || '' });
        } else {
          resp.responseText = r.text;
          if (t === 'json') { try { resp.response = JSON.parse(r.text); } catch { resp.response = null; } } else resp.response = r.text;
        }
        safeCall(d.onreadystatechange, resp);
        safeCall(d.onload, resp);
        safeCall(d.onloadend, resp);
      }).catch((e) => {
        if (!aborted) safeCall(d.onerror, { error: String(e), status: 0, readyState: 4, responseText: '' });
      });
      return {
        abort() {
          aborted = true;
          ipcRenderer.send('gm:xhr-abort', id);
          safeCall(d.onabort, {});
        },
      };
    },

    openInTab(url, opts) {
      const background = typeof opts === 'boolean' ? opts : !!(opts && (opts.active === false || opts.background));
      ipcRenderer.send('gm:open', String(url), background);
    },
    setClipboard(text) { ipcRenderer.send('gm:clip', String(text)); },
    notification(sid, d, title, image, onclick) {
      const o = typeof d === 'object' && d ? d : { text: d, title, image, onclick };
      ipcRenderer.send('gm:notify', { title: String(o.title || ''), text: String(o.text || '') });
      if (typeof o.onclick === 'function') { /* клик по уведомлению не пробрасывается */ }
    },
    download(sid, d, name) {
      const o = typeof d === 'object' && d ? d : { url: d, name };
      ipcRenderer.send('gm:download', String(o.url), o.name ? String(o.name) : '');
    },
    registerMenuCommand(sid, name, fn) {
      const id = ++cmdSeq;
      cmds.push({ sid, id, name: String(name), fn });
      sendCmds();
      return id;
    },
    unregisterMenuCommand(id) {
      const i = cmds.findIndex((c) => c.id === id);
      if (i >= 0) { cmds.splice(i, 1); sendCmds(); }
    },
  };

  try { contextBridge.exposeInIsolatedWorld(WORLD, '__tsGM', api); } catch (e) { console.error('[Tessera] bridge:', e); }

  ipcRenderer.on('ts:run-cmd', (_e, { sid, id }) => {
    const c = cmds.find((x) => x.sid === sid && x.id === id);
    if (c) safeCall(c.fn);
  });

  function build(s) {
    const sid = JSON.stringify(s.id);
    const info = JSON.stringify({
      script: { name: s.name, namespace: s.namespace, version: s.version, description: s.description, matches: s.matches },
      scriptHandler: 'Tessera',
      version: '0.1.0',
    });
    let head;
    if (s.world === 'page') {
      head = 'var unsafeWindow = window;\n';
    } else {
      head = `
const __G = window.__tsGM, __S = ${sid};
const unsafeWindow = window;
const GM_info = ${info};
const GM_getValue = (k, d) => { const r = __G.getValue(__S, k); return r && r.h ? r.v : d; };
const GM_setValue = (k, v) => __G.setValue(__S, k, v);
const GM_deleteValue = (k) => __G.deleteValue(__S, k);
const GM_listValues = () => __G.listValues(__S);
const GM_addStyle = (css) => {
  const st = document.createElement('style'); st.textContent = css;
  (document.head || document.documentElement).appendChild(st); return st;
};
const GM_xmlhttpRequest = (d) => __G.xhr(__S, d);
const GM_openInTab = (u, o) => __G.openInTab(u, o);
const GM_setClipboard = (t) => __G.setClipboard(t);
const GM_notification = (d, t, i, c) => __G.notification(__S, d, t, i, c);
const GM_download = (d, n) => __G.download(__S, d, n);
const GM_registerMenuCommand = (n, f) => __G.registerMenuCommand(__S, n, f);
const GM_unregisterMenuCommand = (id) => __G.unregisterMenuCommand(id);
const GM_log = (...a) => console.log('[' + GM_info.script.name + ']', ...a);
const GM = {
  info: GM_info,
  getValue: async (k, d) => GM_getValue(k, d),
  setValue: async (k, v) => GM_setValue(k, v),
  deleteValue: async (k) => GM_deleteValue(k),
  listValues: async () => GM_listValues(),
  addStyle: async (c) => GM_addStyle(c),
  openInTab: GM_openInTab,
  setClipboard: async (t) => GM_setClipboard(t),
  notification: GM_notification,
  registerMenuCommand: GM_registerMenuCommand,
  xmlHttpRequest: (d) => new Promise((res, rej) => {
    GM_xmlhttpRequest(Object.assign({}, d, {
      onload: (r) => { if (d.onload) d.onload(r); res(r); },
      onerror: (e) => { if (d.onerror) d.onerror(e); rej(e); },
      ontimeout: (e) => { if (d.ontimeout) d.ontimeout(e); rej(e); },
    }));
  }),
};
`;
    }
    return `(function () {\n${head}try {\n${s.code}\n} catch (e) { console.error(${JSON.stringify('[Tessera] ' + s.name + ':')}, e); }\n})();\n//# sourceURL=tessera-userscript/${encodeURIComponent(s.id)}.js`;
  }

  function run(s) {
    const code = build(s);
    if (s.world === 'page') {
      webFrame.executeJavaScript(code).catch((e) => console.error('[Tessera]', e));
    } else {
      webFrame.executeJavaScriptInIsolatedWorld(WORLD, [{ code, url: 'tessera://userscript/' + s.id }])
        .catch((e) => console.error('[Tessera]', e));
    }
  }

  const ready = () => document.readyState !== 'loading';

  function schedule(s) {
    switch (s.runAt) {
      case 'document-start':
        run(s);
        break;
      case 'document-body':
        if (document.body) run(s);
        else {
          const mo = new MutationObserver(() => { if (document.body) { mo.disconnect(); run(s); } });
          mo.observe(document, { childList: true, subtree: true });
        }
        break;
      case 'document-end':
        if (ready()) run(s); else document.addEventListener('DOMContentLoaded', () => run(s), { once: true });
        break;
      default:
        if (ready()) setTimeout(() => run(s), 0);
        else document.addEventListener('DOMContentLoaded', () => setTimeout(() => run(s), 0), { once: true });
    }
  }

  for (const s of scripts) schedule(s);
}

if (/^(https?|file):$/.test(location.protocol)) init();
