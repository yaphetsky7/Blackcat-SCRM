// BlackCat SCRM license server: customer login (no sign-up), plans and points, a metered Claude relay, and the admin page.
// Environment: PORT (default 8787), DATA_DIR (default ./data), ANTHROPIC_API_KEY (your key; only ever read here),
// ANTHROPIC_UPSTREAM (default https://api.anthropic.com), ADMIN_COOKIE_SECURE=1 when served over HTTPS.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { openStore } = require('./store');
const { MODELS, costUSD } = require('./pricing');
const { createUpdates } = require('./updates');

const PORT = Number(process.env.PORT) || 8787;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const UPSTREAM = (process.env.ANTHROPIC_UPSTREAM || 'https://api.anthropic.com').replace(/\/$/, '');
const MAX_OUTPUT_TOKENS = 64000;
// Which plan feature each part of the app needs before the relay will serve it
const FEATURE_NEEDS = { translate: 'translate', assistant: 'assistant', ai: 'aiReply' };

const store = openStore(DATA_DIR);
// Installers are published from the desktop app's build folder (DIST_DIR, default ../dist)
const updates = createUpdates({ dataDir: DATA_DIR, distDir: path.resolve(process.env.DIST_DIR || path.join(__dirname, '..', 'dist')) });
const adminSessions = new Map(); // token -> expiry
const failures = new Map(); // ip|username -> { count, until }

function send(res, status, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': typeof body === 'string' && headers['content-type'] ? headers['content-type'] : 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(text);
}
const fail = (res, status, message) => send(res, status, { ok: false, error: message });
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(Error('请求内容太大'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function json(req, limit = 1e6) {
  const raw = await readBody(req, limit);
  try { return raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch { throw Object.assign(Error('请求格式不正确'), { status: 400 }); }
}
const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers['x-api-key'] || '';
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
function throttled(key) { const f = failures.get(key); return f && f.until > Date.now() && f.count >= 10; }
function noteFailure(key) { const f = failures.get(key); const fresh = !f || f.until < Date.now(); failures.set(key, { count: fresh ? 1 : f.count + 1, until: fresh ? Date.now() + 15 * 60e3 : f.until }); }

// ---------- Desktop app API ----------
async function appApi(req, res, url) {
  if (url.pathname === '/api/login' && req.method === 'POST') {
    const body = await json(req);
    const key = clientIp(req) + '|' + String(body.username || '').toLowerCase();
    if (throttled(key)) return fail(res, 429, '尝试次数太多，请 15 分钟后再试');
    try { return send(res, 200, { ok: true, ...store.login(body), catalog: store.catalog() }); }
    catch (e) { noteFailure(key); return fail(res, 401, e.message); }
  }
  const found = store.session(bearer(req), req.headers['x-blackcat-version']);
  if (!found) return fail(res, 401, '登录已失效，请重新登录');
  if (url.pathname === '/api/logout' && req.method === 'POST') { store.logout(bearer(req)); return send(res, 200, { ok: true }); }
  const problem = store.status(found.user);
  if (problem) return fail(res, 403, problem);
  if (url.pathname === '/api/me' && req.method === 'GET') return send(res, 200, { ok: true, profile: store.profile(found.user), catalog: store.catalog() });
  return fail(res, 404, '没有这个接口');
}

// The app's Claude SDK points its baseURL here and sends the login token as its API key.
// We forward to Anthropic with the owner's key, then charge points from the returned token usage.
async function relay(req, res) {
  const anthropicError = (status, message) => send(res, status, { type: 'error', error: { type: status === 402 ? 'billing_error' : status === 401 ? 'authentication_error' : 'invalid_request_error', message } });
  const found = store.session(bearer(req));
  if (!found) return anthropicError(401, '登录已失效，请重新登录黑猫SCRM');
  const user = found.user;
  const problem = store.status(user);
  if (problem) return anthropicError(403, problem);
  if (!process.env.ANTHROPIC_API_KEY) return anthropicError(503, '服务器尚未配置 Claude API Key');
  const feature = FEATURE_NEEDS[req.headers['x-blackcat-feature']] ? req.headers['x-blackcat-feature'] : 'translate';
  if (!store.limits(user).features[FEATURE_NEEDS[feature]]) return anthropicError(403, '当前配套不包含这个 AI 功能，请升级配套');
  if (!user.unlimited && user.plan_points + user.bonus_points <= 0) return anthropicError(402, '黑猫 AI 点数已用完。请充值，或在 设置 → API Key 填写自己的 Claude Key。');
  const raw = await readBody(req, 40e6);
  let body; try { body = JSON.parse(raw.toString('utf8')); } catch { return anthropicError(400, '请求格式不正确'); }
  if (!MODELS[body.model]) return anthropicError(400, `不支持的模型：${body.model}`);
  if (body.stream) return anthropicError(400, '暂不支持流式请求');
  body.max_tokens = Math.min(Number(body.max_tokens) || 4096, MAX_OUTPUT_TOKENS);
  const headers = { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': req.headers['anthropic-version'] || '2023-06-01' };
  if (req.headers['anthropic-beta']) headers['anthropic-beta'] = req.headers['anthropic-beta'];
  let upstream;
  try { upstream = await fetch(UPSTREAM + '/v1/messages', { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15 * 60e3) }); }
  catch (e) { return anthropicError(502, '连不上 Claude 服务器：' + e.message); }
  const text = await upstream.text();
  if (upstream.ok) {
    try {
      const message = JSON.parse(text);
      const cost = costUSD(body.model, message.usage);
      store.recordUsage(user, { feature, model: body.model, usage: message.usage || {}, cost });
    } catch (e) { console.error('usage record failed', e); }
  }
  res.writeHead(upstream.status, { 'content-type': 'application/json', 'request-id': upstream.headers.get('request-id') || '' });
  res.end(text);
}

// ---------- Admin ----------
function adminToken(req) { return /(?:^|;\s*)bc_admin=([^;]+)/.exec(req.headers.cookie || '')?.[1] || ''; }
function isAdmin(req) { const t = adminToken(req); const exp = adminSessions.get(t); if (!exp || exp < Date.now()) { adminSessions.delete(t); return false; } return true; }
const cookie = (value, maxAge) => `bc_admin=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${process.env.ADMIN_COOKIE_SECURE === '1' ? '; Secure' : ''}`;

async function adminApi(req, res, url) {
  const p = url.pathname.replace(/^\/admin\/api/, '');
  if (p === '/login' && req.method === 'POST') {
    const body = await json(req); const key = 'admin|' + clientIp(req);
    if (throttled(key)) return fail(res, 429, '尝试次数太多，请 15 分钟后再试');
    const hash = store.setting('admin_hash', '');
    if (!hash) return fail(res, 503, '还没有设置管理员密码，请先运行 npm run setup');
    if (!store.checkPassword(body.password, hash)) { noteFailure(key); return fail(res, 401, '密码不正确'); }
    const token = crypto.randomBytes(32).toString('base64url'); adminSessions.set(token, Date.now() + 12 * 3600e3);
    return send(res, 200, { ok: true }, { 'set-cookie': cookie(token, 12 * 3600) });
  }
  if (!isAdmin(req)) return fail(res, 401, '请先登录管理后台');
  if (p === '/logout' && req.method === 'POST') { adminSessions.delete(adminToken(req)); return send(res, 200, { ok: true }, { 'set-cookie': cookie('', 0) }); }
  if (p === '/overview' && req.method === 'GET') return send(res, 200, { ok: true, data: { ...store.overview(), multiplier: store.setting('multiplier', 1), keyConfigured: !!process.env.ANTHROPIC_API_KEY, plans: store.plans() } });
  if (p === '/customers' && req.method === 'GET') return send(res, 200, { ok: true, data: store.customers() });
  if (p === '/customers' && req.method === 'POST') { const b = await json(req); const u = store.createUser(b); return send(res, 200, { ok: true, data: { id: u.id } }); }
  const m = /^\/customers\/(\d+)(?:\/(password|points|devices))?$/.exec(p);
  if (m) {
    const id = Number(m[1]);
    if (!m[2] && req.method === 'GET') return send(res, 200, { ok: true, data: store.customerDetail(id, Number(url.searchParams.get('days')) || 30) });
    if (!m[2] && req.method === 'PUT') { store.updateUser(id, await json(req)); return send(res, 200, { ok: true }); }
    if (!m[2] && req.method === 'DELETE') { store.deleteUser(id); return send(res, 200, { ok: true }); }
    if (m[2] === 'password' && req.method === 'POST') { store.setPassword(id, (await json(req)).password); return send(res, 200, { ok: true }); }
    if (m[2] === 'points' && req.method === 'POST') { const b = await json(req); store.grantPoints(id, b.delta, b.note); return send(res, 200, { ok: true }); }
    if (m[2] === 'devices' && req.method === 'DELETE') { store.removeDevice(id, url.searchParams.get('device') || ''); return send(res, 200, { ok: true }); }
  }
  if (p === '/plans' && req.method === 'PUT') { const b = await json(req); return send(res, 200, { ok: true, data: store.savePlan(b) }); }
  if (p === '/settings' && req.method === 'PUT') {
    const b = await json(req); const mult = Number(b.multiplier);
    if (!(mult > 0 && mult <= 100)) return fail(res, 400, '倍率需在 0–100 之间');
    store.setSetting('multiplier', mult); return send(res, 200, { ok: true });
  }
  if (p === '/updates' && req.method === 'GET') return send(res, 200, { ok: true, data: { release: updates.release(), built: updates.built(), versions: store.appVersions() } });
  if (p === '/updates/publish' && req.method === 'POST') { const b = await json(req); return send(res, 200, { ok: true, data: await updates.publish({ notes: b.notes, mandatory: !!b.mandatory }) }); }
  if (p === '/updates' && req.method === 'PUT') { const b = await json(req); return send(res, 200, { ok: true, data: updates.edit({ notes: b.notes, mandatory: b.mandatory === undefined ? undefined : !!b.mandatory }) }); }
  if (p === '/admin-password' && req.method === 'POST') {
    const b = await json(req);
    if (!store.checkPassword(b.current, store.setting('admin_hash', ''))) return fail(res, 401, '当前密码不正确');
    if (String(b.next || '').length < 10) return fail(res, 400, '新密码至少 10 位');
    store.setSetting('admin_hash', store.hashPassword(b.next)); adminSessions.clear();
    return send(res, 200, { ok: true }, { 'set-cookie': cookie('', 0) });
  }
  return fail(res, 404, '没有这个接口');
}

const STATIC = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function adminStatic(res, url) {
  const name = url.pathname === '/admin' || url.pathname === '/admin/' ? 'index.html' : path.basename(url.pathname);
  const file = path.join(__dirname, 'admin', name);
  if (!STATIC[path.extname(file)] || !fs.existsSync(file)) return fail(res, 404, 'Not found');
  res.writeHead(200, { 'content-type': STATIC[path.extname(file)], 'cache-control': 'no-store', 'x-frame-options': 'DENY',
    'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'" });
  fs.createReadStream(file).pipe(res);
}

// Public: the installer is useless without a login, and the app checks for updates before signing in too.
function serveUpdate(res, url) {
  const name = decodeURIComponent(url.pathname.slice('/updates/'.length));
  if (name === 'latest.yml') { const yml = updates.latestYml(); return yml ? send(res, 200, yml, { 'content-type': 'text/yaml; charset=utf-8' }) : fail(res, 404, '还没有发布版本'); }
  const file = updates.file(name);
  if (!file) return fail(res, 404, 'Not found');
  res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': fs.statSync(file).size, 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/relay/v1/messages' && req.method === 'POST') return await relay(req, res);
    if (url.pathname.startsWith('/api/')) return await appApi(req, res, url);
    if (url.pathname.startsWith('/admin/api/')) return await adminApi(req, res, url);
    if (url.pathname === '/' ) { res.writeHead(302, { location: '/admin/' }); return res.end(); }
    if (url.pathname.startsWith('/admin')) return adminStatic(res, url);
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    if (url.pathname.startsWith('/updates/') && req.method === 'GET') return serveUpdate(res, url);
    return fail(res, 404, 'Not found');
  } catch (e) {
    if (!res.headersSent) fail(res, e.status || 400, e.message || '出错了');
  }
});
// Knowledge-base learning calls can take minutes
server.requestTimeout = 0;
server.headersTimeout = 60e3;
if (require.main === module) server.listen(PORT, () => console.log(`BlackCat server on http://localhost:${PORT}  (admin: /admin/)  data: ${DATA_DIR}`));
module.exports = { server, store };
