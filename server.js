#!/usr/bin/env node
/**
 * Local dashboard server for the Dolj admission simulation.
 *
 * Serves the static UI from ./public and two API endpoints:
 *   GET /api/data     -> { updatedAt, rows: [{position, code, media, bucket, track, school}] }
 *   GET /api/refresh  -> Server-Sent Events stream; re-scrapes evaluare.edu.ro
 *                        (events: progress {page,maxPage,rowsTotal}, done, error)
 *
 * Zero dependencies, Node 18+. Start with:  node server.js  (or npm start)
 * then open http://localhost:7788
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scrapeHierarchy,
  enrichRows,
  writeCsv,
  writeDataJson,
  readCsv,
} from './scrape-dolj-hierarchy.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 7788;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'docs'); // also the GitHub Pages source
const DEFAULT_MAX_PAGE = 75;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

let cache = null; // { updatedAt, rows }
let scrapeInProgress = false;

function loadCache() {
  const csv = readCsv();
  if (csv) cache = { updatedAt: csv.updatedAt, rows: enrichRows(csv.rows) };
  return cache;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function handleRefresh(req, res, url) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  });

  if (scrapeInProgress) {
    sendSse(res, 'error', { message: 'O actualizare este deja în curs.' });
    res.end();
    return;
  }

  const maxPage = Math.min(
    Math.max(parseInt(url.searchParams.get('pages') || `${DEFAULT_MAX_PAGE}`, 10) || DEFAULT_MAX_PAGE, 5),
    230
  );

  scrapeInProgress = true;
  try {
    const rows = await scrapeHierarchy({
      maxPage,
      onProgress: (progress) => sendSse(res, 'progress', progress),
    });
    if (rows.length === 0) throw new Error('Sursa nu a returnat niciun rând (site indisponibil?)');
    writeCsv(rows);
    writeDataJson(rows); // keep the GitHub Pages snapshot in sync
    cache = { updatedAt: new Date().toISOString(), rows: enrichRows(rows) };
    sendSse(res, 'done', cache);
  } catch (error) {
    sendSse(res, 'error', { message: error.message });
  } finally {
    scrapeInProgress = false;
    res.end();
  }
}

function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/data') {
    const data = cache || loadCache();
    if (!data) {
      sendJson(res, 404, { message: 'Nu există date încă. Apasă „Actualizează datele”.' });
      return;
    }
    sendJson(res, 200, data);
    return;
  }

  if (url.pathname === '/api/refresh') {
    handleRefresh(req, res, url);
    return;
  }

  serveStatic(res, url.pathname);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — the dashboard is probably already running.`);
    console.error(`Open http://localhost:${PORT} directly, or stop the other instance first.`);
    process.exit(1);
  }
  throw error;
});

loadCache();
server.listen(PORT, () => {
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(cache ? `Loaded ${cache.rows.length} rows from CSV (${cache.updatedAt})` : 'No CSV yet.');
});
