// Customer login against the BlackCat server. The session token is kept encrypted (safeStorage); the plan/points
// profile is cached so the app keeps working offline for a grace period, then asks to log in again.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const GRACE_MS = 72 * 3600e3;
const REFRESH_MS = 10 * 60e3;

function createLicense({ dataDir, safeStorage, defaultServer = '', appVersion = '', onChange = () => {} }) {
  const file = path.join(dataDir, 'license.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  // Temporary trycloudflare.com addresses stop working when the tunnel restarts; move them to the permanent default
  if (/\.trycloudflare\.com\/?$/i.test(saved.server || '') && defaultServer && !/\.trycloudflare\.com/i.test(defaultServer)) delete saved.server;
  if (!saved.deviceId) saved.deviceId = crypto.randomUUID();
  let reason = '';
  const write = () => fs.writeFileSync(file, JSON.stringify(saved, null, 2));
  write();

  const encrypt = (s) => (safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(s).toString('base64') : s);
  const decrypt = (s) => { if (!s) return ''; if (!s.startsWith('enc:')) return s; try { return safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')); } catch { return ''; } };
  const server = () => String(saved.server || defaultServer || '').replace(/\/+$/, '');
  const token = () => decrypt(saved.token);
  const loggedIn = () => !!token() && !!saved.profile && Date.now() - (saved.checkedAt || 0) < GRACE_MS;

  async function request(p, { method = 'GET', body, auth = true } = {}) {
    const base = server();
    if (!/^https?:\/\//.test(base)) throw Error('请填写服务器地址');
    let res;
    try {
      res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', 'x-blackcat-version': appVersion, ...(auth ? { authorization: 'Bearer ' + token() } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    } catch { throw Object.assign(Error('连不上黑猫服务器，请检查网络'), { offline: true }); }
    const data = await res.json().catch(() => ({ ok: false, error: '服务器没有正确回应' }));
    if (!res.ok || !data.ok) throw Object.assign(Error(data.error || `服务器错误 ${res.status}`), { status: res.status });
    return data;
  }
  function signOut(why) { delete saved.token; delete saved.profile; delete saved.catalog; delete saved.checkedAt; reason = why || ''; write(); onChange(); }

  async function login({ server: base, username, password }) {
    if (base !== undefined) saved.server = String(base).trim().replace(/\/+$/, '');
    const data = await request('/api/login', { method: 'POST', auth: false, body: { username: String(username || '').trim(), password, deviceId: saved.deviceId, deviceName: os.hostname() } });
    saved.token = encrypt(data.token); saved.profile = data.profile; saved.catalog = data.catalog || null; saved.checkedAt = Date.now(); saved.lastUser = data.profile.username; reason = '';
    write(); onChange();
    return state();
  }
  async function refresh() {
    if (!token()) return state();
    try {
      const data = await request('/api/me');
      saved.profile = data.profile; saved.catalog = data.catalog || saved.catalog || null; saved.checkedAt = Date.now(); reason = ''; write(); onChange();
    } catch (e) {
      if (e.status === 401 || e.status === 403) signOut(e.message);
      else if (!loggedIn()) signOut('超过 3 天没有连上黑猫服务器，请联网后重新登录');
    }
    return state();
  }
  async function logout() {
    try { if (token()) await request('/api/logout', { method: 'POST' }); } catch {}
    signOut('');
    return state();
  }
  function state() {
    return { loggedIn: loggedIn(), server: server(), lastUser: saved.lastUser || '', reason, profile: loggedIn() ? saved.profile : null, catalog: loggedIn() ? saved.catalog || null : null,
      offline: loggedIn() && Date.now() - saved.checkedAt > REFRESH_MS * 2 };
  }
  // The Claude SDK talks to the relay with the login token as its API key
  const relay = () => (loggedIn() ? { apiKey: token(), baseURL: server() + '/relay' } : null);
  const limits = () => (loggedIn() ? saved.profile.limits : null);

  setInterval(() => { refresh(); }, REFRESH_MS).unref?.();
  return { login, logout, refresh, state, relay, limits, loggedIn };
}

module.exports = { createLicense };
