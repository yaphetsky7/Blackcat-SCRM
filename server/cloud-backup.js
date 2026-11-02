'use strict';
const crypto = require('crypto');
const { createR2 } = require('./r2');
const { CHUNK, hash, isHash, validateManifest } = require('../cloud-format');
const quotaFor = id => ({ business: 100e9, enterprise: 500e9, test: 5e9 }[id] || 0);
function createCloudBackup({ store, storage = createR2(), env = process.env }) {
  const db = store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS cloud_chunks(user_id INTEGER NOT NULL, hash TEXT NOT NULL, size INTEGER NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(user_id,hash));
    CREATE TABLE IF NOT EXISTS cloud_snapshots(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,device TEXT NOT NULL,label TEXT NOT NULL,created INTEGER NOT NULL,bytes INTEGER NOT NULL,manifest TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS cloud_snapshots_user ON cloud_snapshots(user_id,created);
    CREATE TABLE IF NOT EXISTS cloud_manifests(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,size INTEGER NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS cloud_primary_points(id TEXT PRIMARY KEY,user_id INTEGER,device TEXT,label TEXT,created INTEGER,bytes INTEGER,manifest TEXT,status TEXT);
    CREATE TABLE IF NOT EXISTS cloud_operations(month TEXT NOT NULL,kind TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(month,kind));`);
  const one = (s, ...p) => db.prepare(s).get(...p), run = (s, ...p) => db.prepare(s).run(...p);
  const settingLimit = (name, fallback) => { const n = Number(env[name]); return Number.isSafeInteger(n) && n > 0 ? n : fallback; };
  const globalLimit = settingLimit('R2_TOTAL_LIMIT_BYTES', 9e9);
  const usage = user => one('SELECT COALESCE(SUM(size),0) bytes FROM cloud_chunks WHERE user_id=?', user.id).bytes + one('SELECT COALESCE(SUM(size),0) bytes FROM cloud_manifests WHERE user_id=?', user.id).bytes;
  const usedAll = () => one('SELECT COALESCE(SUM(size),0) bytes FROM cloud_chunks').bytes + one('SELECT COALESCE(SUM(size),0) bytes FROM cloud_manifests').bytes;
  const quota = user => quotaFor(user.plan); // Storage is bounded even for AI-unlimited accounts.
  function requirePlan(user) { if (!quota(user)) throw Object.assign(Error('云备份包含在 Business 和 Enterprise 配套中'), { status: 403 }); }
  function operation(kind) {
    const month = new Date().toISOString().slice(0, 7), limit = kind === 'A' ? settingLimit('R2_MONTHLY_A_LIMIT', 800000) : settingLimit('R2_MONTHLY_B_LIMIT', 8000000);
    run('INSERT INTO cloud_operations VALUES(?,?,1) ON CONFLICT(month,kind) DO UPDATE SET count=count+1', month, kind);
    if (one('SELECT count FROM cloud_operations WHERE month=? AND kind=?', month, kind).count > limit) throw Object.assign(Error('R2 试用请求额度已达保护上限，本地资料保留，云端操作暂时暂停'), { status: 429 });
  }
  function state(user) {
    return { configured: storage.configured, eligible: !!quota(user), quotaBytes: quota(user), usedBytes: usage(user), trial: globalLimit <= 10e9, sharedLimitBytes: globalLimit, sharedUsedBytes: usedAll(), snapshots: db.prepare('SELECT id,device,label,created,bytes FROM cloud_snapshots WHERE user_id=? ORDER BY created DESC').all(user.id) };
  }
  const key = (user, h) => 'v1/' + user.id + '/' + h;
  const busy = new Set();
  const archive = require('./cloud-archive').createCloudArchive({ db, getChunk: (user, h) => get(user, h) });
  async function put(user, h, bytes) {
    requirePlan(user);
    if (!isHash(h) || !bytes.length || bytes.length > CHUNK || hash(bytes) !== h) throw Error('备份分块校验失败');
    const lock = user.id + ':' + h;
    if (busy.has(lock)) throw Object.assign(Error('同一分块正在上传，请重试'), { status: 409 });
    const old = one('SELECT * FROM cloud_chunks WHERE user_id=? AND hash=?', user.id, h);
    if (old?.status === 'ready') return { exists: true };
    if (!storage.configured) throw Object.assign(Error('云储存尚未接通，请联系管理员完成 R2 配置'), { status: 503 });
    // Reservation is persisted before awaiting R2; interrupted uploads still count until cleaned.
    if (!old && (usage(user) + bytes.length > quota(user) || usedAll() + bytes.length > globalLimit)) throw Object.assign(Error('云空间已达配套或 R2 试用总量保护上限。资料仍保留在本机'), { status: 507 });
    if (old && old.size !== bytes.length) throw Error('分块大小不一致');
    busy.add(lock);
    try {
      operation('A');
      if (!old) run('INSERT INTO cloud_chunks VALUES(?,?,?,?,?)', user.id, h, bytes.length, 'pending', Date.now());
      await storage.put(key(user, h), bytes);
      run("UPDATE cloud_chunks SET status='ready' WHERE user_id=? AND hash=?", user.id, h);
      return { exists: false };
    } finally { busy.delete(lock); }
  }
  async function snapshot(user, session, body) {
    requirePlan(user); const m = body.manifest, bytes = validateManifest(m);
    if (body.primary && !m.files.some(f => f.path === 'archive/chat-archive.sqlite')) throw Error('缺少待同步聊天归档');
    if (body.requestId !== undefined && !/^[a-f0-9-]{36}$/.test(body.requestId)) throw Error('恢复点标识不正确');
    if (body.requestId) { const prior = one('SELECT * FROM cloud_snapshots WHERE id=?', body.requestId) || one('SELECT * FROM cloud_primary_points WHERE id=?', body.requestId); if (prior) { if (prior.user_id !== user.id || prior.device !== session.device_id || prior.manifest !== JSON.stringify(m)) throw Error('恢复点标识重复'); return { id: prior.id }; } }
    if (!body.primary && one('SELECT COUNT(*) n FROM cloud_snapshots WHERE user_id=?', user.id).n >= 100 && one('SELECT COUNT(*) n FROM cloud_snapshots WHERE user_id=? AND device=?', user.id, session.device_id).n < 24) throw Error('已保存 100 个恢复点，请删除不再需要的恢复点后重试');
    for (const f of m.files) for (const c of f.chunks) {
      const row = one('SELECT size,status FROM cloud_chunks WHERE user_id=? AND hash=?', user.id, c.hash);
      if (!row || row.status !== 'ready' || row.size !== c.size || busy.has(user.id + ':' + c.hash)) throw Error('部分备份内容尚未上传完成，请重试');
    }
    const id = body.requestId || crypto.randomUUID(), created = Date.now(), label = String(body.label || session.device_name || '电脑').slice(0, 80);
    const portable = Buffer.from(JSON.stringify({ id, userId: user.id, device: session.device_id, label, created, bytes, manifest: m, kind: body.primary ? 'cloud-chat-segment' : 'backup' }));
    if (usage(user) + portable.length > quota(user) || usedAll() + portable.length > globalLimit) throw Object.assign(Error('恢复点索引超过云空间保护上限，本机资料保留'), { status: 507 });
    const locks = [...new Set(m.files.flatMap(f => f.chunks.map(c => user.id + ':' + c.hash)))];
    locks.forEach(k => busy.add(k));
    try {
      operation('A');
      run('INSERT INTO cloud_manifests VALUES(?,?,?,?)', id, user.id, portable.length, created);
      await storage.put('v1/' + user.id + '/snapshots/' + id + '.json', portable);
      if (body.primary) run('INSERT INTO cloud_primary_points VALUES(?,?,?,?,?,?,?,?)', id, user.id, session.device_id, label, created, bytes, JSON.stringify(m), 'pending');
      else run('INSERT INTO cloud_snapshots VALUES(?,?,?,?,?,?,?)', id, user.id, session.device_id, label, created, bytes, JSON.stringify(m));
      // Daily recovery history per computer. Other computers' recovery points are not replaced.
      if (!body.primary) run('DELETE FROM cloud_snapshots WHERE user_id=? AND device=? AND id NOT IN(SELECT id FROM cloud_snapshots WHERE user_id=? AND device=? ORDER BY created DESC LIMIT 24)', user.id, session.device_id, user.id, session.device_id);
      return { id };
    } finally { locks.forEach(k => busy.delete(k)); }
  }
  function getSnapshot(user, id) {
    const row = one('SELECT * FROM cloud_snapshots WHERE user_id=? AND id=?', user.id, id);
    if (!row) throw Object.assign(Error('找不到这个恢复点'), { status: 404 });
    return { ...row, manifest: JSON.parse(row.manifest) };
  }
  async function get(user, h) {
    if (!isHash(h) || !one("SELECT 1 FROM cloud_chunks WHERE user_id=? AND hash=? AND status='ready'", user.id, h)) throw Object.assign(Error('找不到备份分块'), { status: 404 });
    operation('B'); const bytes = await storage.get(key(user, h));
    if (bytes.length > CHUNK || hash(bytes) !== h) throw Error('云端分块校验失败，请联系管理员');
    return bytes;
  }
  async function clean(user) {
    run("DELETE FROM cloud_primary_points WHERE user_id=? AND status='pending' AND created<? AND id NOT IN(SELECT point FROM cloud_archive_messages WHERE user_id=? UNION SELECT point FROM cloud_archive_assets WHERE user_id=?)", user.id, Date.now() - 864e5, user.id, user.id);
    const refs = new Set();
    for (const row of db.prepare('SELECT manifest FROM cloud_snapshots WHERE user_id=?').all(user.id)) for (const f of JSON.parse(row.manifest).files) for (const c of f.chunks) refs.add(c.hash);
    for (const row of db.prepare('SELECT manifest FROM cloud_primary_points WHERE user_id=?').all(user.id)) for (const f of JSON.parse(row.manifest).files) for (const c of f.chunks) refs.add(c.hash);
    let removed = 0;
    for (const row of db.prepare('SELECT * FROM cloud_chunks WHERE user_id=?').all(user.id)) {
      // A day protects uploads from another computer that has not committed its snapshot yet.
      if (refs.has(row.hash) || busy.has(user.id + ':' + row.hash) || Date.now() - row.created < 864e5) continue;
      busy.add(user.id + ':' + row.hash);
      try { await storage.delete(key(user, row.hash)); run('DELETE FROM cloud_chunks WHERE user_id=? AND hash=?', user.id, row.hash); removed++; }
      finally { busy.delete(user.id + ':' + row.hash); }
    }
    for (const row of db.prepare('SELECT * FROM cloud_manifests WHERE user_id=? AND created<?').all(user.id, Date.now() - 864e5)) {
      if (one('SELECT 1 FROM cloud_snapshots WHERE id=?', row.id) || one('SELECT 1 FROM cloud_primary_points WHERE id=?', row.id)) continue;
      await storage.delete('v1/' + user.id + '/snapshots/' + row.id + '.json');
      run('DELETE FROM cloud_manifests WHERE id=? AND user_id=?', row.id, user.id); removed++;
    }
    return { removed };
  }
  async function route(req, res, url, found, { json, readBody, send }) {
    const user = found.user, suffix = url.pathname.slice('/api/cloud/'.length);
    if (suffix === 'state' && req.method === 'GET') return send(res, 200, { ok: true, data: state(user) });
    if (suffix === 'missing' && req.method === 'POST') { requirePlan(user); const body = await json(req, 2e6); if (!Array.isArray(body.hashes) || body.hashes.length > 10000 || body.hashes.some(h => !isHash(h))) throw Error('分块列表不正确'); return send(res, 200, { ok: true, data: body.hashes.filter(h => !one("SELECT 1 FROM cloud_chunks WHERE user_id=? AND hash=? AND status='ready'", user.id, h)) }); }
    if (suffix.startsWith('chunks/') && req.method === 'PUT') return send(res, 200, { ok: true, data: await put(user, suffix.slice(7), await readBody(req, CHUNK)) });
    if (suffix.startsWith('chunks/') && req.method === 'GET') { const bytes = await get(user, suffix.slice(7)); res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': bytes.length, 'cache-control': 'no-store' }); return res.end(bytes); }
    if (suffix === 'snapshots' && req.method === 'POST') { const body = await json(req, 32e6), result = await snapshot(user, found.session, body); if (body.primary) { const point = one('SELECT * FROM cloud_primary_points WHERE user_id=? AND id=?', user.id, result.id); if (!point) throw Error('聊天云端索引尚未准备好'); await archive.importPoint(user, point); result.primary = true; } return send(res, 200, { ok: true, data: result }); }
    if (suffix === 'archive/prepare' && req.method === 'POST') {
      const latest = new Map(); for (const row of db.prepare('SELECT * FROM cloud_snapshots WHERE user_id=? ORDER BY created DESC').all(user.id)) { if (latest.has(row.device) || !JSON.parse(row.manifest).files.some(f => f.path === 'archive/chat-archive.sqlite')) continue; latest.set(row.device, row); }
      const warnings = []; for (const point of latest.values()) { try { await archive.importPoint(user, point); } catch (e) { warnings.push(e.message); } }
      return send(res, 200, { ok: true, data: { ready: true, warnings } });
    }
    if (suffix === 'archive/accounts' && req.method === 'GET') return send(res, 200, { ok: true, data: archive.accounts(user) });
    if (suffix === 'archive/chats' && req.method === 'GET') return send(res, 200, { ok: true, data: archive.listChats(user, url.searchParams.get('accountId') || '') });
    if (suffix === 'archive/messages' && req.method === 'GET') return send(res, 200, { ok: true, data: archive.messages(user, Object.fromEntries(url.searchParams)) });
    if (suffix === 'archive/asset' && req.method === 'GET') return send(res, 200, { ok: true, data: archive.asset(user, url.searchParams.get('id') || '') });
    if (suffix === 'archive/recent' && req.method === 'POST') { const r = await json(req), id = archive.alias(user, found.session.device_id, String(r.accountId)), data = id ? archive.messages(user, { accountId: id, chatKey: r.chatKey }) : { messages: [] }, skip = new Set(r.skip || []); return send(res, 200, { ok: true, data: { messages: data.messages.filter(m => !skip.has(m.id)).slice(-Math.min(80, Math.max(1, Number(r.limit) || 30))) } }); }
    if (suffix === 'archive/delete' && req.method === 'POST') return send(res, 200, { ok: true, data: archive.remove(user, await json(req)) });
    if (suffix === 'archive/account-deleted' && req.method === 'POST') { const r = await json(req), id = archive.alias(user, found.session.device_id, String(r.localId)); if (id) archive.markDeleted(user, id); return send(res, 200, { ok: true, data: { saved: true } }); }
    if (/^snapshots\/[a-f0-9-]{36}$/.test(suffix)) { const id = suffix.slice(10), row = getSnapshot(user, id); if (req.method === 'GET') return send(res, 200, { ok: true, data: row }); if (req.method === 'DELETE') { run('DELETE FROM cloud_snapshots WHERE user_id=? AND id=?', user.id, id); return send(res, 200, { ok: true, data: { deleted: true } }); } }
    if (suffix === 'cleanup' && req.method === 'POST') return send(res, 200, { ok: true, data: await clean(user) });
    throw Object.assign(Error('没有这个云备份接口'), { status: 404 });
  }
  return { route, state, put, get, snapshot, getSnapshot, clean, quota };
}
module.exports = { createCloudBackup, quotaFor };
