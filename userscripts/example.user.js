// ==UserScript==
// @name         Пример: счётчик заходов
// @namespace    tessera
// @version      1.0
// @description  Показывает, как работают GM_* и пункты меню скрипта. Можно удалить.
// @match        https://example.org/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

const n = (GM_getValue('visits', 0) || 0) + 1;
GM_setValue('visits', n);
GM_addStyle('#tessera-visits{position:fixed;top:8px;right:8px;z-index:99999;background:#222;color:#fff;padding:6px 10px;border-radius:10px;font:14px system-ui}');
const el = document.createElement('div');
el.id = 'tessera-visits';
el.textContent = 'Заходов: ' + n;
document.body.appendChild(el);
GM_registerMenuCommand('Сбросить счётчик', () => { GM_setValue('visits', 0); el.textContent = 'Заходов: 0'; });
