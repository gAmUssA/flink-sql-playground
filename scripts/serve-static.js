#!/usr/bin/env node
/*
 * Serves the SPA's static files for browser tests and Lighthouse, without the backend.
 *
 * Usage: node scripts/serve-static.js [port] [root]
 *   port  default 8790
 *   root  default src/main/resources/META-INF/resources
 *
 * Unknown paths, including /f/<code>, fall back to index.html like the backend's
 * SpaResource. API calls are not served here; tests stub them with page.route().
 * Text responses are gzipped when the client accepts it, as the backend and GitHub Pages do,
 * so Lighthouse measures the transfer size users get.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
};

/**
 * True when an Accept-Encoding header accepts gzip: gzip (or x-gzip) listed with a quality above
 * 0, or, when it is not listed, * with a quality above 0. `identity, gzip;q=0` refuses gzip.
 */
function acceptsGzip(header) {
  let any = false;
  for (const entry of String(header || '').split(',')) {
    const [coding, ...params] = entry.split(';').map((s) => s.trim().toLowerCase());
    const q = params.map((p) => /^q=([0-9.]+)$/.exec(p)).find(Boolean);
    const accepted = (q ? Number(q[1]) : 1) > 0;
    if (coding === 'gzip' || coding === 'x-gzip') return accepted;
    if (coding === '*') any = accepted;
  }
  return any;
}

function createServer(root) {
  const resolvedRoot = path.resolve(root);
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(resolvedRoot, '.' + urlPath);
    if (!file.startsWith(resolvedRoot + path.sep) && file !== resolvedRoot) {
      res.writeHead(403).end();
      return;
    }
    if (urlPath.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"no backend in static server"}');
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(resolvedRoot, 'index.html');
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' };
    const gzip = /^(text\/|application\/json|image\/svg)/.test(type) && acceptsGzip(req.headers['accept-encoding']);
    if (gzip) {
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip' });
      fs.createReadStream(file).pipe(zlib.createGzip()).pipe(res);
    } else {
      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(res);
    }
  });
}

if (require.main === module) {
  const port = Number(process.argv[2] || 8790);
  const root = process.argv[3] || path.join(__dirname, '../src/main/resources/META-INF/resources');
  createServer(root).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
}

module.exports = { createServer, acceptsGzip };
