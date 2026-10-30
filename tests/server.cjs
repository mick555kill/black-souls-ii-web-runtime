/* Tiny dependency-free static server for the Ruby WASM browser prototype.
 * Only serves files under this project directory, never the parent game upload.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.VXACE_PORT || 8000);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.rgss3a': 'application/octet-stream',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); res.end('Method Not Allowed'); return;
  }
  let pathname;
  try {pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);}
  catch {res.writeHead(400);res.end('Bad Request');return;}
  if (pathname.includes('\0')) {res.writeHead(400);res.end('Bad Path');return;}
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(root + path.sep)) {res.writeHead(403);res.end('Forbidden');return;}
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {res.writeHead(404);res.end('Not Found');return;}
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if(req.method==='HEAD') {res.end();return;}
    fs.createReadStream(file).on('error', ()=>res.destroy()).pipe(res);
  });
});
if(require.main === module) {
  server.listen(port, '127.0.0.1', () => {
    console.log(`BLACK SOULS II Ruby WASM prototype: http://127.0.0.1:${port}/`);
  });
}
module.exports = {server};
