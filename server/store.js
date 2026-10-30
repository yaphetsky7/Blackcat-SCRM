// Customers, plans, points and usage, stored in one SQLite file (Node's built-in node:sqlite).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

// Plans as the owner designed them; editable later in the admin page. -1 means unlimited.
const DEFAULT_PLANS = [
  { id: 'starter', name: '入门 Starter', price_month: 19.9, price_year: 199, included_accounts: 5, extra_allowed: 0, extra_price: 4, devices: 1, monthly_points: 8000, kb_limit: 0,
    features: { translate: true, realtime: false, quick: true, contacts: true, notes: true, bulk: true, backup: true, assistant: false, aiReply: false } },
  { id: 'pro', name: '专业 Pro', price_month: 39.9, price_year: 399, included_accounts: 5, extra_allowed: 1, extra_price: 4, devices: 1, monthly_points: 18000, kb_limit: 1,
    features: { translate: true, realtime: true, quick: true, contacts: true, notes: true, bulk: true, backup: true, assistant: true, aiReply: true } },
  { id: 'business', name: '团队 Business', price_month: 59.9, price_year: 599, included_accounts: 5, extra_allowed: 1, extra_price: 4, devices: -1, monthly_points: 28000, kb_limit: 5,
    features: { translate: true, realtime: true, quick: true, contacts: true, notes: true, bulk: true, backup: true, assistant: true, aiReply: true } },
  { id: 'enterprise', name: '企业 Enterprise', price_month: 99.9, price_year: 999, included_accounts: -1, extra_allowed: 0, extra_price: 0, devices: -1, monthly_points: 38000, kb_limit: -1,
    features: { translate: true, realtime: true, quick: true, contacts: true, notes: true, bulk: true, backup: true, assistant: true, aiReply: true } },
];
const ALL_FEATURES = { translate: true, realtime: true, quick: true, contacts: true, notes: true, bulk: true, backup: true, assistant: true, aiReply: true };
const DEVICE_ACTIVE_DAYS = 30;

const now = () => Date.now();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return 'scrypt:' + salt.toString('hex') + ':' + crypto.scryptSync(String(password), salt, 64).toString('hex');
}
function checkPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split(':');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), 64);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function addMonth(t) { const d = new Date(t); d.setMonth(d.getMonth() + 1); return d.getTime(); }

function openStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'blackcat.db'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, data TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, pass_hash TEXT NOT NULL, plan TEXT NOT NULL,
      expires_at INTEGER NOT NULL, extra_accounts INTEGER NOT NULL DEFAULT 0, unlimited INTEGER NOT NULL DEFAULT 0,
      disabled INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', plan_points REAL NOT NULL DEFAULT 0,
      bonus_points REAL NOT NULL DEFAULT 0, plan_reset_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL, device_name TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, at INTEGER NOT NULL,
      feature TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL,
      cache_read INTEGER NOT NULL, cache_write INTEGER NOT NULL, cost_usd REAL NOT NULL, points REAL NOT NULL);
    CREATE INDEX IF NOT EXISTS usage_user_at ON usage(user_id, at);
    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, at INTEGER NOT NULL,
      kind TEXT NOT NULL, delta REAL NOT NULL, note TEXT NOT NULL DEFAULT '');
    CREATE INDEX IF NOT EXISTS ledger_user_at ON ledger(user_id, at);`);
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  if (!one("SELECT 1 FROM pragma_table_info('sessions') WHERE name = 'app_version'")) db.exec("ALTER TABLE sessions ADD COLUMN app_version TEXT NOT NULL DEFAULT ''");
  const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };

  if (!one('SELECT 1 FROM plans LIMIT 1')) DEFAULT_PLANS.forEach((p, i) => run('INSERT INTO plans (id, data, sort) VALUES (?, ?, ?)', p.id, JSON.stringify(p), i));
  const setting = (key, fallback) => { const r = one('SELECT value FROM settings WHERE key = ?', key); return r ? JSON.parse(r.value) : fallback; };
  const setSetting = (key, value) => run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));

  const plans = () => all('SELECT data FROM plans ORDER BY sort').map((r) => JSON.parse(r.data));
  const plan = (id) => plans().find((p) => p.id === id) || null;
  function savePlan(input) {
    const old = plan(input.id);
    if (!old) throw Error('配套不存在');
    const num = (v, f) => (Number.isFinite(Number(v)) ? Number(v) : f);
    const next = { ...old, name: String(input.name ?? old.name).slice(0, 60), price_month: num(input.price_month, old.price_month), price_year: num(input.price_year, old.price_year),
      included_accounts: Math.trunc(num(input.included_accounts, old.included_accounts)), extra_allowed: input.extra_allowed ? 1 : 0, extra_price: num(input.extra_price, old.extra_price),
      devices: Math.trunc(num(input.devices, old.devices)), monthly_points: Math.max(0, num(input.monthly_points, old.monthly_points)), kb_limit: Math.trunc(num(input.kb_limit, old.kb_limit)),
      features: Object.fromEntries(Object.keys(ALL_FEATURES).map((k) => [k, input.features ? !!input.features[k] : !!old.features[k]])) };
    run('UPDATE plans SET data = ? WHERE id = ?', JSON.stringify(next), next.id);
    return next;
  }

  // Monthly plan points refill on each customer's own cycle; top-up/assigned (bonus) points never expire.
  function refill(u) {
    if (!u || u.unlimited || now() < u.plan_reset_at) return u;
    const p = plan(u.plan);
    let reset = u.plan_reset_at;
    while (reset <= now()) reset = addMonth(reset);
    tx(() => {
      run('UPDATE users SET plan_points = ?, plan_reset_at = ? WHERE id = ?', p ? p.monthly_points : 0, reset, u.id);
      run('INSERT INTO ledger (user_id, at, kind, delta, note) VALUES (?, ?, ?, ?, ?)', u.id, now(), 'reset', p ? p.monthly_points : 0, '每月配套点数重置');
    });
    return userById(u.id, false);
  }
  const userById = (id, doRefill = true) => { const u = one('SELECT * FROM users WHERE id = ?', id); return doRefill ? refill(u) : u; };
  const userByName = (name) => refill(one('SELECT * FROM users WHERE username = ?', String(name || '').trim()));

  function limits(u) {
    const p = plan(u.plan) || DEFAULT_PLANS[0];
    if (u.unlimited) return { accounts: -1, devices: -1, kbLimit: -1, features: { ...ALL_FEATURES } };
    return { accounts: p.included_accounts < 0 ? -1 : p.included_accounts + (p.extra_allowed ? u.extra_accounts : 0), devices: p.devices, kbLimit: p.kb_limit, features: { ...p.features } };
  }
  function monthUsage(userId, since = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()) {
    return one('SELECT COUNT(*) AS requests, COALESCE(SUM(cost_usd), 0) AS cost, COALESCE(SUM(points), 0) AS points FROM usage WHERE user_id = ? AND at >= ?', userId, since);
  }
  // What the desktop app sees about its own account
  function profile(u) {
    const p = plan(u.plan);
    return { username: u.username, plan: u.plan, planName: u.unlimited ? '无限使用' : p?.name || u.plan, expiresAt: u.expires_at, unlimited: !!u.unlimited,
      points: { plan: u.plan_points, bonus: u.bonus_points, total: u.unlimited ? -1 : u.plan_points + u.bonus_points, monthly: p?.monthly_points || 0, resetAt: u.plan_reset_at },
      limits: limits(u) };
  }
  // Customer-facing plan list and point rules, so the app (and its assistant) can compare plans
  function catalog() {
    const multiplier = setting('multiplier', 1);
    return {
      plans: plans().map((p) => ({ id: p.id, name: p.name, priceMonth: p.price_month, priceYear: p.price_year, accounts: p.included_accounts, extraAccounts: p.extra_allowed ? { allowed: true, priceEach: p.extra_price } : { allowed: false },
        devices: p.devices, monthlyPoints: p.monthly_points, knowledgeBases: p.kb_limit, features: p.features })),
      points: { perUSD: 1000 * multiplier, translateEach: [0.1 * multiplier, 0.3 * multiplier], aiReplyEach: [0.5 * multiplier, 2 * multiplier],
        rules: '按 AI 实际用量扣点；先扣每月配套点数，再扣充值点数；配套点数每月按开通日重置，充值点数不过期；Google 翻译和客户自己的 Claude Key 不扣点；点数用完时翻译自动改用 Google，AI 自动回复暂停。' },
      upgrade: '升级配套、加购账号或充值点数请联系客服，由客服在后台开通。',
    };
  }
  function status(u) {
    if (!u) return '账号或密码不正确';
    if (u.disabled) return '账号已停用，请联系客服';
    if (!u.unlimited && u.expires_at < now()) return '账号已到期，请联系客服续费';
    return '';
  }

  function createUser({ username, password, plan: planId = 'starter', expiresAt, extraAccounts = 0, unlimited = false, note = '' }) {
    username = String(username || '').trim();
    if (!/^[\w.@-]{3,40}$/.test(username)) throw Error('用户名需 3–40 位字母、数字或 . _ - @');
    if (String(password || '').length < 8) throw Error('密码至少 8 位');
    const p = plan(planId); if (!p) throw Error('配套不存在');
    if (one('SELECT 1 FROM users WHERE username = ?', username)) throw Error('用户名已存在');
    const t = now();
    const r = run(`INSERT INTO users (username, pass_hash, plan, expires_at, extra_accounts, unlimited, note, plan_points, plan_reset_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, username, hashPassword(password), p.id, Number(expiresAt) || addMonth(t), Math.max(0, Math.trunc(extraAccounts)), unlimited ? 1 : 0, String(note).slice(0, 500), p.monthly_points, addMonth(t), t);
    run('INSERT INTO ledger (user_id, at, kind, delta, note) VALUES (?, ?, ?, ?, ?)', r.lastInsertRowid, t, 'reset', p.monthly_points, '开通配套');
    return userById(r.lastInsertRowid);
  }
  function updateUser(id, input) {
    const u = userById(id); if (!u) throw Error('客户不存在');
    const planId = input.plan ?? u.plan; const p = plan(planId); if (!p) throw Error('配套不存在');
    tx(() => {
      run('UPDATE users SET plan = ?, expires_at = ?, extra_accounts = ?, unlimited = ?, disabled = ?, note = ? WHERE id = ?', planId, Number(input.expiresAt ?? u.expires_at),
        Math.max(0, Math.trunc(Number(input.extraAccounts ?? u.extra_accounts))), (input.unlimited ?? !!u.unlimited) ? 1 : 0, (input.disabled ?? !!u.disabled) ? 1 : 0, String(input.note ?? u.note).slice(0, 500), id);
      // Switching plan starts the new plan's monthly points right away
      if (planId !== u.plan) {
        run('UPDATE users SET plan_points = ?, plan_reset_at = ? WHERE id = ?', p.monthly_points, addMonth(now()), id);
        run('INSERT INTO ledger (user_id, at, kind, delta, note) VALUES (?, ?, ?, ?, ?)', id, now(), 'reset', p.monthly_points, `改为配套 ${p.name}`);
      }
      if (input.disabled) run('DELETE FROM sessions WHERE user_id = ?', id);
    });
    return userById(id);
  }
  function setPassword(id, password) {
    if (String(password || '').length < 8) throw Error('密码至少 8 位');
    tx(() => { run('UPDATE users SET pass_hash = ? WHERE id = ?', hashPassword(password), id); run('DELETE FROM sessions WHERE user_id = ?', id); });
  }
  function grantPoints(id, delta, note) {
    delta = Number(delta);
    if (!Number.isFinite(delta) || delta === 0) throw Error('请输入点数');
    const u = userById(id); if (!u) throw Error('客户不存在');
    tx(() => {
      run('UPDATE users SET bonus_points = MAX(0, bonus_points + ?) WHERE id = ?', delta, id);
      run('INSERT INTO ledger (user_id, at, kind, delta, note) VALUES (?, ?, ?, ?, ?)', id, now(), delta > 0 ? 'grant' : 'deduct', delta, String(note || '').slice(0, 200));
    });
    return userById(id);
  }
  const deleteUser = (id) => run('DELETE FROM users WHERE id = ?', id);

  // Sessions: one per device; the plan's device limit counts devices seen in the last 30 days.
  function login({ username, password, deviceId, deviceName }) {
    const u = userByName(username);
    if (!u || !checkPassword(password, u.pass_hash)) throw Error('账号或密码不正确');
    const problem = status(u); if (problem) throw Error(problem);
    deviceId = String(deviceId || '').slice(0, 80); if (!deviceId) throw Error('缺少设备标识');
    const { devices } = limits(u);
    const active = all('SELECT DISTINCT device_id FROM sessions WHERE user_id = ? AND last_seen > ? AND device_id != ?', u.id, now() - DEVICE_ACTIVE_DAYS * 864e5, deviceId);
    if (devices >= 0 && active.length >= devices) throw Error(`已在 ${active.length} 台电脑登录，这个配套最多 ${devices} 台。请先在其他电脑退出，或联系客服。`);
    const token = crypto.randomBytes(32).toString('base64url');
    tx(() => {
      run('DELETE FROM sessions WHERE user_id = ? AND device_id = ?', u.id, deviceId);
      run('INSERT INTO sessions (token_hash, user_id, device_id, device_name, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)', sha256(token), u.id, deviceId, String(deviceName || '').slice(0, 80), now(), now());
    });
    return { token, profile: profile(u) };
  }
  function session(token, appVersion) {
    if (!token) return null;
    const s = one('SELECT * FROM sessions WHERE token_hash = ?', sha256(token));
    if (!s) return null;
    run('UPDATE sessions SET last_seen = ?, app_version = COALESCE(?, app_version) WHERE token_hash = ?', now(), appVersion ? String(appVersion).slice(0, 20) : null, s.token_hash);
    return { session: s, user: userById(s.user_id) };
  }
  const logout = (token) => run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  const removeDevice = (userId, deviceId) => run('DELETE FROM sessions WHERE user_id = ? AND device_id = ?', userId, deviceId);

  // Points: usage spends plan points first, then bonus points. Unlimited IDs are recorded but never charged.
  function recordUsage(u, { feature, model, usage, cost }) {
    const multiplier = setting('multiplier', 1);
    const points = u.unlimited ? 0 : cost * 1000 * multiplier;
    tx(() => {
      run(`INSERT INTO usage (user_id, at, feature, model, input_tokens, output_tokens, cache_read, cache_write, cost_usd, points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        u.id, now(), feature, model, usage.input_tokens || 0, usage.output_tokens || 0, usage.cache_read_input_tokens || 0, usage.cache_creation_input_tokens || 0, cost, points);
      if (points > 0) {
        const fromPlan = Math.min(points, Math.max(0, u.plan_points));
        run('UPDATE users SET plan_points = plan_points - ?, bonus_points = MAX(0, bonus_points - ?) WHERE id = ?', fromPlan, points - fromPlan, u.id);
      }
    });
    return points;
  }

  function customers() {
    const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    for (const due of all('SELECT * FROM users WHERE unlimited = 0 AND plan_reset_at <= ?', now())) refill(due);
    return all(`SELECT u.*, (SELECT COUNT(DISTINCT device_id) FROM sessions s WHERE s.user_id = u.id AND s.last_seen > ?) AS devices_active,
        (SELECT COALESCE(SUM(cost_usd), 0) FROM usage g WHERE g.user_id = u.id AND g.at >= ?) AS month_cost,
        (SELECT COALESCE(SUM(points), 0) FROM usage g WHERE g.user_id = u.id AND g.at >= ?) AS month_points,
        (SELECT MAX(last_seen) FROM sessions s WHERE s.user_id = u.id) AS last_seen
      FROM users u ORDER BY u.created_at DESC`, now() - DEVICE_ACTIVE_DAYS * 864e5, since, since)
      .map(({ pass_hash, ...u }) => ({ ...u, limits: limits(u) }));
  }
  function customerDetail(id, days = 30) {
    const u = userById(id); if (!u) throw Error('客户不存在');
    const since = now() - days * 864e5;
    const { pass_hash, ...user } = u;
    return {
      user: { ...user, limits: limits(u) },
      month: monthUsage(id),
      daily: all(`SELECT strftime('%Y-%m-%d', at / 1000, 'unixepoch', 'localtime') AS day, feature, COUNT(*) AS requests, SUM(cost_usd) AS cost, SUM(points) AS points,
        SUM(input_tokens + cache_read + cache_write) AS input_tokens, SUM(output_tokens) AS output_tokens FROM usage WHERE user_id = ? AND at >= ? GROUP BY day, feature ORDER BY day DESC`, id, since),
      ledger: all('SELECT at, kind, delta, note FROM ledger WHERE user_id = ? ORDER BY at DESC LIMIT 100', id),
      devices: all('SELECT device_id, device_name, app_version, created_at, last_seen FROM sessions WHERE user_id = ? ORDER BY last_seen DESC', id),
    };
  }
  function overview() {
    const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    return {
      customers: one('SELECT COUNT(*) AS n, SUM(disabled = 0 AND (unlimited = 1 OR expires_at > ?)) AS active FROM users', now()),
      month: one('SELECT COUNT(*) AS requests, COALESCE(SUM(cost_usd), 0) AS cost, COALESCE(SUM(points), 0) AS points FROM usage WHERE at >= ?', since),
      byFeature: all('SELECT feature, COUNT(*) AS requests, SUM(cost_usd) AS cost, SUM(points) AS points FROM usage WHERE at >= ? GROUP BY feature ORDER BY cost DESC', since),
    };
  }

  // App versions on computers used in the last 30 days
  const appVersions = () => all("SELECT app_version AS version, COUNT(DISTINCT device_id) AS devices FROM sessions WHERE last_seen > ? GROUP BY app_version ORDER BY app_version DESC", now() - DEVICE_ACTIVE_DAYS * 864e5);

  return { db, plans, appVersions, plan, catalog, savePlan, setting, setSetting, userById, userByName, limits, profile, status, createUser, updateUser, setPassword, grantPoints, deleteUser,
    login, session, logout, removeDevice, recordUsage, customers, customerDetail, overview, hashPassword, checkPassword, close: () => db.close() };
}

module.exports = { openStore, DEFAULT_PLANS, ALL_FEATURES, hashPassword, checkPassword };
