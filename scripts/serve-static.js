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
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
};

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
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

if (require.main === module) {
  const port = Number(process.argv[2] || 8790);
  const root = process.argv[3] || path.join(__dirname, '../src/main/resources/META-INF/resources');
  createServer(root).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
}

module.exports = { createServer };
