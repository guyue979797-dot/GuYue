import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '.demo-dist');
const files = new Set(['index.html', 'demo.js', 'demo.css', 'arco.min.js', 'arco.min.css', 'react-globals.js']);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
http.createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!files.has(name)) { res.writeHead(404); res.end('Not found'); return; }
  try { const body = await readFile(resolve(root, name)); res.writeHead(200, { 'Content-Type': types[extname(name)], 'Cache-Control': 'no-store' }); res.end(body); }
  catch { res.writeHead(500); res.end('Run npm run demo:build first'); }
}).listen(5180, '127.0.0.1', () => console.log('UI demo: http://127.0.0.1:5180/'));
