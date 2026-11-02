/* TopoLab dev server — no build step, sirf files serve karta hai.
   Python ke http.server ke bajaye ye isliye hai kyunki wo caching headers
   bhejta hai aur browser purani JS pakad ke baith jaata hai. Ye har
   response ko no-cache marta hai, to refresh karte hi naya code milta hai.

   Chalao:  node serve.js        (phir http://127.0.0.1:5180 kholo) */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5180;
const ROOT = __dirname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  /* Chrome manifest ko tabhi maanta hai jab wo sahi MIME type se aaye —
     application/octet-stream par wo chupchaap ignore kar deta hai aur
     "Add to Home screen" standalone me nahi khulta. */
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

http.createServer((req, res) => {
  // query string (?v=6) hatao, aur path ko ROOT ke andar hi rakho
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);

  if (!file.startsWith(ROOT)) {           // ../.. se bahar nikalne ki koshish
    res.writeHead(403); return res.end('Forbidden');
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found: ' + rel);
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`TopoLab chal raha hai:  http://127.0.0.1:${PORT}`);
});
