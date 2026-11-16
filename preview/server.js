'use strict';
// Веб-превью интерфейса Tessera: node preview/server.js [порт]
// Открывается в обычном браузере телефона. Сайты — макет, настоящий браузинг только в Electron.
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8780);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/preview/preview.html';
  const file = path.normalize(path.join(ROOT, p));
  const ok = file.startsWith(path.join(ROOT, 'ui') + path.sep) || file.startsWith(path.join(ROOT, 'preview') + path.sep);
  if (!ok || !fs.existsSync(file) || !fs.statSync(file).isFile() || file.endsWith('server.js')) { res.writeHead(404); res.end('not found'); return; }
  let body = fs.readFileSync(file);
  if (p === '/ui/index.html') body = Buffer.from(body.toString().replace('<script src="ui.js">', '<script src="/preview/shim.js"></script>\n<script src="ui.js">'));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
}).listen(PORT, '0.0.0.0', () => {
  console.log('Tessera Browser — превью интерфейса');
  console.log('Открой в браузере: http://127.0.0.1:' + PORT);
  console.log('Остановить: Ctrl+C');
});
