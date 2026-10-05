// Full-stack preview: serves the built PWA and proxies /fn/* → local Supabase Edge Function (/functions/v1/*).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const PORT = +(process.env.PORT ?? 8080); const DIST = process.env.DIST ?? path.resolve('apps/web/dist');
const UP = process.env.SUPABASE_FN ?? 'http://127.0.0.1:54321/functions/v1';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.json': 'application/json' };
async function ready() { try { const r = await fetch(`${UP}/api/v1/health`, { signal: AbortSignal.timeout(4000) }); return r.ok; } catch { return false; } }
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/readyz') { res.writeHead((await ready()) ? 204 : 503).end(); return; }
  if (url.pathname.startsWith('/fn/')) {
    const body = await new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
    try {
      const h = { ...req.headers }; delete h.host; delete h['content-length'];
      const up = await fetch(UP + url.pathname.slice(3) + url.search, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
      const out = Buffer.from(await up.arrayBuffer()); const oh = {}; up.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) oh[k] = v; });
      res.writeHead(up.status, oh).end(out);
    } catch (e) { res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'backend_unavailable' })); }
    return;
  }
  let f = path.join(DIST, decodeURIComponent(url.pathname)); if (!f.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  const ext = path.extname(f); const cache = url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store';
  res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': cache }); fs.createReadStream(f).pipe(res);
}).listen(PORT, '0.0.0.0', () => console.log(`Duka preview on :${PORT} → ${UP}`));
