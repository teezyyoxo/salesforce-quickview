const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
function createServer() {
  return http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if ((pathname.startsWith('/sfc/servlet.shepherd/') || pathname === '/servlet/servlet.FileDownload')) {
      if (pathname.includes('069000000000003')) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(fs.readFileSync(path.join(root, 'demo/sample.svg'))); return;
    }
    const filename = path.resolve(root, `.${decodeURIComponent(pathname === '/' ? '/demo/index.html' : pathname)}`);
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(filename, (error, data) => {
      if (error) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' }); res.end(data);
    });
  });
}
module.exports = { createServer };
if (require.main === module) createServer().listen(4173, '127.0.0.1', () => console.log('Demo: http://127.0.0.1:4173 · Settings: http://127.0.0.1:4173/extension/settings.html'));
