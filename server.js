// Webot site + lead-capture backend.
//   - Serves the built site from ./preview
//   - POST /api/lead  → validates, stores the lead in MongoDB, optionally emails you
//
// Run:
//   node server.js                      (no DB configured → leads saved to leads.local.json)
//   node --env-file=.env server.js      (with MONGODB_URI set → leads saved to MongoDB)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { processLead } = require('./lib/lead');

const ROOT = path.join(__dirname, 'preview');
const PORT = process.env.PORT || 7777;
const MONGODB_URI = process.env.MONGODB_URI || '';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
};

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const clientIp = (req) =>
  ((req.headers['x-forwarded-for'] || '').split(',')[0].trim()) ||
  (req.socket && req.socket.remoteAddress) || '';

function secHeaders(extra) {
  return Object.assign({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), interest-cohort=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data:",
      "media-src 'self' https://d8j0ntlcm91z4.cloudfront.net https://assets.mixkit.co https://videos.pexels.com",
      "connect-src 'self' https://unpkg.com",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  }, extra || {});
}

function handleLead(req, res) {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 100000) req.destroy(); });
  req.on('end', async () => {
    let body = {};
    try { body = JSON.parse(data || '{}'); } catch (e) {}
    const json = (code, obj) => {
      res.writeHead(code, secHeaders({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': CORS_ORIGIN,
      }));
      res.end(JSON.stringify(obj));
    };
    const result = await processLead(body, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
    });
    json(result.status, result.body);
  });
}

http.createServer((req, res) => {
  if (req.url === '/api/lead') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, secHeaders({
        'Access-Control-Allow-Origin': CORS_ORIGIN,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }));
      return res.end();
    }
    if (req.method === 'POST') return handleLead(req, res);
    res.writeHead(405, secHeaders()); return res.end('method not allowed');
  }

  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  else if (!path.extname(urlPath)) urlPath += '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403, secHeaders()); return res.end('forbidden'); }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404, secHeaders()); return res.end('not found'); }
    const type = TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, secHeaders({ 'Content-Type': type, 'Cache-Control': 'no-cache' }));
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log('Webot site on http://localhost:' + PORT);
  console.log(MONGODB_URI ? '[webot] leads → MongoDB' : '[webot] no MONGODB_URI set → leads → leads.local.json');
});
