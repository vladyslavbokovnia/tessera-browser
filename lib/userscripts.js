'use strict';
// Разбор и сопоставление юзерскриптов (Tampermonkey-формат).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseMeta(src) {
  const m = src.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
  if (!m) return null;
  const meta = {
    name: '', namespace: '', version: '', description: '',
    match: [], include: [], exclude: [], excludeMatch: [],
    grant: [], require: [], runAt: 'document-idle', inject: 'auto', noframes: false,
  };
  for (const line of m[1].split(/\r?\n/)) {
    const r = line.match(/^\s*\/\/\s*@([\w:-]+)\s*(.*?)\s*$/);
    if (!r) continue;
    const key = r[1];
    const val = r[2];
    switch (key) {
      case 'name': if (!meta.name) meta.name = val; break;
      case 'namespace': meta.namespace = val; break;
      case 'version': meta.version = val; break;
      case 'description': if (!meta.description) meta.description = val; break;
      case 'match': meta.match.push(val); break;
      case 'include': meta.include.push(val); break;
      case 'exclude': case 'exclude-match': meta.exclude.push(val); break;
      case 'grant': meta.grant.push(val); break;
      case 'require': meta.require.push(val); break;
      case 'run-at': meta.runAt = val; break;
      case 'inject-into': meta.inject = val; break;
      case 'noframes': meta.noframes = true; break;
      default: break;
    }
  }
  return meta;
}

function globToRegex(g) {
  return new RegExp('^' + g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
}

function includeToRegex(s) {
  const m = s.match(/^\/(.+)\/([gimsuy]*)$/);
  if (m) {
    try { return new RegExp(m[1], m[2].replace('g', '')); } catch { return null; }
  }
  return globToRegex(s);
}

function matchPattern(p, url) {
  if (p === '<all_urls>') return /^(https?|file):$/.test(url.protocol);
  const m = p.match(/^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)?$/);
  if (!m) return false;
  const scheme = m[1];
  const host = m[2];
  const pth = m[3] || '/*';
  if (scheme === '*') {
    if (!/^https?:$/.test(url.protocol)) return false;
  } else if (url.protocol !== scheme + ':') return false;
  if (scheme !== 'file' && host !== '*') {
    const h = host.toLowerCase();
    const target = h.includes(':') ? url.host.toLowerCase() : url.hostname.toLowerCase();
    if (h.startsWith('*.')) {
      const base = h.slice(2);
      if (!(target === base || target.endsWith('.' + base))) return false;
    } else if (h !== target) return false;
  }
  return globToRegex(pth).test(url.pathname + url.search);
}

function testEntry(entry, url, urlStr) {
  if (entry.t === 'm') return matchPattern(entry.p, url);
  const re = includeToRegex(entry.p);
  return re ? re.test(urlStr) : false;
}

function matches(script, urlStr) {
  let url;
  try { url = new URL(urlStr); } catch { return false; }
  if (!/^(https?|file):$/.test(url.protocol)) return false;
  const inc = [
    ...script.meta.match.map((p) => ({ t: 'm', p })),
    ...script.meta.include.map((p) => ({ t: 'i', p })),
  ];
  const exc = script.meta.exclude.map((p) => ({ t: /^(\*|https?|file):\/\//.test(p) || p === '<all_urls>' ? 'm' : 'i', p }));
  if (exc.some((e) => testEntry(e, url, urlStr))) return false;
  if (!inc.length) return /^https?:$/.test(url.protocol);
  return inc.some((e) => testEntry(e, url, urlStr));
}

function worldOf(meta) {
  if (meta.inject === 'page') return 'page';
  const g = meta.grant.filter((x) => x !== 'none');
  if (!g.length) return 'page';
  return 'isolated';
}

function loadAll(dir, requiresDir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(requiresDir, { recursive: true });
  const out = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.js')) continue;
    let src;
    try { src = fs.readFileSync(path.join(dir, file), 'utf8'); } catch { continue; }
    const meta = parseMeta(src);
    if (!meta) continue;
    const id = file.replace(/\.user\.js$/, '').replace(/\.js$/, '');
    out.push({
      id,
      file,
      meta,
      name: meta.name || id,
      namespace: meta.namespace,
      version: meta.version,
      description: meta.description,
      runAt: meta.runAt,
      world: worldOf(meta),
      grants: meta.grant,
      src,
      requires: meta.require.map((u) => ({
        url: u,
        file: path.join(requiresDir, crypto.createHash('sha1').update(u).digest('hex') + '.js'),
      })),
    });
  }
  return out;
}

// Код скрипта вместе с кэшированными @require.
function fullCode(script) {
  let pre = '';
  for (const r of script.requires) {
    try { pre += fs.readFileSync(r.file, 'utf8') + '\n;\n'; } catch { /* ещё не скачан */ }
  }
  return pre + script.src;
}

module.exports = { parseMeta, matches, loadAll, fullCode };
