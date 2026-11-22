// Three listeners, all on 127.0.0.1:
//   3000  Talk page for this Mac. No code, not counted, never tunnelled.
//   3002  The same page for the public tunnel. Needs the code from the QR link, and calls are limited.
//   3001  The three agent tools. cloudflared points here and only Sarvam's IPs may call it.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ROOT, agentId } from './config.js';
import { answerQuestion } from './answer.js';
import { bookTestRide, findShowroom } from './booking.js';
import { COOKIE, createGuard } from './guard.js';

const { SARVAM_API_KEY, SARVAM_ORG_ID, SARVAM_WORKSPACE_ID } = process.env;
const PAGE_PORT = Number(process.env.PAGE_PORT ?? 3000);
const TOOLS_PORT = Number(process.env.TOOLS_PORT ?? 3001);
const PUBLIC_PORT = Number(process.env.PUBLIC_PORT ?? 3002);
// Published in Sarvam's API tool docs.
const SARVAM_IPS = new Set(['4.213.167.70', '35.154.84.150']);
const SDK_DIR = path.join(ROOT, 'node_modules/sarvam-conv-ai-sdk/dist');
const MAX_BODY = 8192;
const MAX_SESSIONS = 200;
const SESSION_ID = /^[a-f0-9]{32}$/;

const TOOLS = {
  '/tools/find-showroom': ['showroom', findShowroom],
  '/tools/book-test-ride': ['booking', bookOnce],
  '/tools/ask': ['answer', answerWithinLimit],
};
const PAGE_FILES = {
  '/': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/style.css': ['style.css', 'text/css'],
};

const guard = createGuard();
const sessions = new Map();

function answerWithinLimit(body) {
  if (guard.takeAnswer()) return answerQuestion(body);
  const english = /^en/i.test(String(body.language ?? ''));
  return {
    ok: false,
    reason: 'limit',
    say: english ? "Sorry, this demo's question limit is used up." : 'माफ़ कीजिए, इस डेमो में सवालों की सीमा पूरी हो गई है।',
  };
}
const booked = new Map();

// Speech recognition can deliver one "yes" in two parts, and the agent then books twice.
function bookOnce(body) {
  if (!SESSION_ID.test(body.session_id ?? '')) return bookTestRide(body);
  const slot = JSON.stringify(['session_id', 'showroom', 'vehicle', 'date', 'time'].map((k) => body[k]));
  if (booked.has(slot)) return { ...booked.get(slot), repeat: true };
  const result = bookTestRide(body);
  if (result.ok) booked.set(slot, result);
  return result;
}

function record(id, type, result) {
  if (!SESSION_ID.test(id ?? '')) return;
  if (!sessions.has(id) && sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  sessions.set(id, [...(sessions.get(id) ?? []), { type, result }].slice(-30));
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, {
    'content-type': `${type}; charset=utf-8`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
  });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    if ((size += chunk.length) > MAX_BODY) throw Object.assign(new Error('Body too large'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body && typeof body === 'object') return body;
  } catch { /* reported below */ }
  throw Object.assign(new Error('Expected a JSON object'), { status: 400 });
}

async function tools(req, res, url) {
  // cloudflared connects from localhost, and Cloudflare sets this header itself.
  // With no header, the request came from this machine (tests).
  const ip = req.headers['cf-connecting-ip'];
  if (ip && !SARVAM_IPS.has(ip)) {
    console.warn(`[tools] refused ${ip} ${url.pathname}`);
    return send(res, 403, { error: 'forbidden' });
  }
  if (req.method !== 'POST' || !Object.hasOwn(TOOLS, url.pathname)) return send(res, 404, { error: 'not found' });

  const [type, run] = TOOLS[url.pathname];
  const body = await readBody(req);
  const started = Date.now();
  const result = await run(body);
  if (!result.repeat) record(body.session_id, type, result);
  console.log(`[tool] ${type} ok=${result.ok} ${result.reason ?? ''} ${Date.now() - started}ms session=${SESSION_ID.test(body.session_id ?? '')}`);
  send(res, 200, result);
}

async function signedUrl(res, search, limited) {
  const id = agentId();
  if (!id) return send(res, 503, { error: 'Agent not created yet' });
  // The upstream path comes from our own config. Nothing in the browser's path is forwarded.
  const target = new URL(`https://apps.sarvam.ai/api/app-runtime/orgs/${SARVAM_ORG_ID}/workspaces/${SARVAM_WORKSPACE_ID}/apps/${id}/url`);
  if (search.get('interaction_type') === 'call') target.searchParams.set('interaction_type', 'call');
  // Each signed URL starts one call at most, so counting URLs counts calls.
  if (limited && !guard.takeCall()) return send(res, 429, { error: 'Call limit reached' });

  let upstream, text;
  try {
    upstream = await fetch(target, { headers: { 'X-API-Key': SARVAM_API_KEY }, signal: AbortSignal.timeout(10_000) });
    text = await upstream.text();
  } catch (error) {
    if (limited) guard.refundCall();
    throw error;
  }
  if (!upstream.ok) {
    if (limited) guard.refundCall();
    console.error(`[sarvam] signed URL ${upstream.status}: ${text.slice(0, 300)}`);
    return send(res, upstream.status, { error: 'Could not start the call' });
  }
  send(res, 200, JSON.parse(text));
}

function sdkFile(res, pathname) {
  let file = path.resolve(SDK_DIR, `.${pathname.slice('/sdk'.length)}`);
  if (!file.startsWith(SDK_DIR + path.sep)) return send(res, 404, { error: 'not found' });
  // The SDK uses bundler-style imports with no file extension.
  if (!file.endsWith('.js')) {
    if (fs.existsSync(`${file}.js`)) {
      file += '.js';
    } else if (fs.existsSync(path.join(file, 'index.js'))) {
      res.writeHead(302, { location: `${pathname}/index.js` });
      return res.end();
    }
  }
  if (!file.endsWith('.js') || !fs.existsSync(file)) return send(res, 404, { error: 'not found' });
  send(res, 200, fs.readFileSync(file), 'text/javascript');
}

function localPage(req, res, url) {
  if (![`localhost:${PAGE_PORT}`, `127.0.0.1:${PAGE_PORT}`].includes(req.headers.host)) {
    return send(res, 403, { error: 'local only' });
  }
  return page(req, res, url, false);
}

function publicPage(req, res, url) {
  const join = url.pathname.match(/^\/j\/([\w-]+)$/);
  if (join && guard.validCode(join[1])) {
    res.writeHead(302, {
      location: '/',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'set-cookie': `${COOKIE}=${join[1]}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`,
    });
    return res.end();
  }
  if (!guard.validCode(guard.codeFromCookie(req.headers.cookie))) {
    return send(res, 403, 'Please scan the QR code to open Bolo.', 'text/plain');
  }
  return page(req, res, url, true);
}

async function page(req, res, url, limited) {
  if (req.method !== 'GET') return send(res, 404, { error: 'not found' });
  const p = url.pathname;

  if (Object.hasOwn(PAGE_FILES, p)) {
    const [file, type] = PAGE_FILES[p];
    return send(res, 200, fs.readFileSync(path.join(ROOT, 'public', file)), type);
  }
  if (p.startsWith('/sdk/')) return sdkFile(res, p);
  if (p === '/api/config') {
    // Org and workspace IDs stay on the server: the signed-URL route fills them in.
    return send(res, 200, { ready: Boolean(agentId()) });
  }
  if (/^\/api\/sarvam\/orgs\/[^/]+\/workspaces\/[^/]+\/apps\/[^/]+\/url$/.test(p)) return signedUrl(res, url.searchParams, limited);

  const session = p.match(/^\/api\/session\/([a-f0-9]{32})$/);
  if (session) return send(res, 200, sessions.get(session[1]) ?? []);
  send(res, 404, { error: 'not found' });
}

function listen(port, handler) {
  http.createServer(async (req, res) => {
    try {
      await handler(req, res, new URL(req.url, 'http://localhost'));
    } catch (error) {
      console.error(`[error] ${error.message}`);
      if (!res.headersSent) send(res, error.status ?? 500, { error: 'request failed' });
    }
  }).listen(port, '127.0.0.1', () => console.log(`listening on http://localhost:${port}`));
}

listen(PAGE_PORT, localPage);
listen(PUBLIC_PORT, publicPage);
listen(TOOLS_PORT, tools);
