'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { hash } = require('../cloud-format');
function createCloudArchive({ db, getChunk, importDir = os.tmpdir() }) {
  db.exec(`CREATE TABLE IF NOT EXISTS cloud_archive_accounts(user_id INTEGER,id TEXT,name TEXT,platform TEXT,phone TEXT,username TEXT,deleted_at INTEGER DEFAULT 0,PRIMARY KEY(user_id,id));
    CREATE TABLE IF NOT EXISTS cloud_archive_aliases(user_id INTEGER,device TEXT,local_id TEXT,account TEXT,PRIMARY KEY(user_id,device,local_id));
    CREATE TABLE IF NOT EXISTS cloud_archive_chats(user_id INTEGER,account TEXT,key TEXT,title TEXT,phone TEXT,username TEXT,coverage TEXT,PRIMARY KEY(user_id,account,key));
    CREATE TABLE IF NOT EXISTS cloud_archive_messages(user_id INTEGER,account TEXT,chat TEXT,id TEXT,data TEXT,first_seen INTEGER,source_seen INTEGER,point TEXT,PRIMARY KEY(user_id,account,chat,id));
    CREATE INDEX IF NOT EXISTS cloud_archive_message_chat ON cloud_archive_messages(user_id,account,chat,first_seen);
    CREATE TABLE IF NOT EXISTS cloud_archive_assets(user_id INTEGER,id TEXT,account TEXT,chat TEXT,message TEXT,slot TEXT,data TEXT,point TEXT,PRIMARY KEY(user_id,id));
    CREATE INDEX IF NOT EXISTS cloud_archive_asset_message ON cloud_archive_assets(user_id,account,chat,message);
    CREATE TABLE IF NOT EXISTS cloud_archive_deleted(user_id INTEGER,account TEXT,chat TEXT,id TEXT,PRIMARY KEY(user_id,account,chat,id));`);
  const one = (s, ...p) => db.prepare(s).get(...p), run = (s, ...p) => db.prepare(s).run(...p), all = (s, ...p) => db.prepare(s).all(...p);
  let importing = false;
  function accountId(user, device, a) {
    const phone = String(a.me?.phone || a.phone || '').replace(/\D/g, ''), username = String(a.me?.username || a.username || '').replace(/^@/, '');
    const alias = one('SELECT account FROM cloud_archive_aliases WHERE user_id=? AND device=? AND local_id=?', user.id, device, a.id);
    const matched = phone || username ? one('SELECT id FROM cloud_archive_accounts WHERE user_id=? AND platform=? AND ((phone!=\'\' AND phone=?) OR (username!=\'\' AND lower(username)=lower(?)))', user.id, a.platform, phone, username) : null;
    const id = alias?.account || matched?.id || crypto.randomUUID();
    run(`INSERT INTO cloud_archive_accounts VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,phone=CASE WHEN excluded.phone!='' THEN excluded.phone ELSE phone END,username=CASE WHEN excluded.username!='' THEN excluded.username ELSE username END,deleted_at=excluded.deleted_at`, user.id, id, String(a.name || a.id), a.platform, phone, username, Number(a.deletedAt) || 0);
    run('INSERT OR REPLACE INTO cloud_archive_aliases VALUES(?,?,?,?)', user.id, device, a.id, id);
    return id;
  }
  async function importPoint(user, point) {
    if (one('SELECT status FROM cloud_primary_points WHERE user_id=? AND id=?', user.id, point.id)?.status === 'ready') return { imported: true };
    const m = typeof point.manifest === 'string' ? JSON.parse(point.manifest) : point.manifest;
    const file = m.files.find(f => f.path === 'archive/chat-archive.sqlite');
    if (!file) return { imported: false };
    if (file.size > 128e6) throw Error('历史归档超过单次云端整理大小，请分账号迁移；原备份已保留');
    if (importing) throw Object.assign(Error('云端正在整理另一份聊天，请稍后重试'), { status: 409 });
    importing = true;
    const temp = path.join(importDir, '.cloud-import-' + crypto.randomUUID() + '.sqlite'); let from;
    try {
      const fd = await fs.promises.open(temp, 'wx'); const digest = crypto.createHash('sha256'); let size = 0;
      try { for (const c of file.chunks) { const bytes = await getChunk(user, c.hash); if (bytes.length !== c.size) throw Error('归档分块大小不正确'); digest.update(bytes); let pos = 0; while (pos < bytes.length) pos += (await fd.write(bytes, pos, bytes.length - pos)).bytesWritten; size += bytes.length; } } finally { await fd.close(); }
      if (size !== file.size || digest.digest('hex') !== file.hash) throw Error('聊天归档校验失败');
      from = new DatabaseSync(temp, { readOnly: true }); from.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
      const has = name => !!from.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
      for (const table of ['accounts','chats','messages','assets']) if (!has(table)) throw Error('聊天归档格式不正确');
      const descriptors = new Map(m.files.map(f => [f.path, f])), input = new Map((m.accounts || []).map(a => [a.id, a]));
      const rows = from.prepare('SELECT * FROM messages').all();
      const assets = from.prepare('SELECT * FROM assets').all();
      const chats = from.prepare('SELECT * FROM chats').all();
      const grouped = list => { const result = new Map(); for (const row of list) { const key = JSON.stringify([row.account, row.chat]); if (!result.has(key)) result.set(key, []); result.get(key).push(row); } return result; };
      const byChat = grouped(rows), assetsByChat = grouped(assets);
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const a of from.prepare('SELECT * FROM accounts').all()) {
          const deleted = has('deleted_accounts') ? from.prepare('SELECT * FROM deleted_accounts WHERE account=?').get(a.id) : null;
          const meta = { ...a, ...input.get(a.id), ...(deleted ? { deletedAt: deleted.deletedAt, phone: deleted.phone, username: deleted.username } : {}) };
          const target = accountId(user, point.device, meta);
          for (const c of chats.filter(c => c.account === a.id)) {
            const key = JSON.stringify([a.id, c.key]);
            const messages = (byChat.get(key) || []).filter(r => !one('SELECT 1 FROM cloud_archive_deleted WHERE user_id=? AND account=? AND chat=? AND id=?', user.id, target, c.key, r.id));
            if (!messages.length) continue;
            const identity = has('chat_identities') ? from.prepare('SELECT * FROM chat_identities WHERE account=? AND chat=?').get(a.id, c.key) : {};
            run(`INSERT INTO cloud_archive_chats VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,account,key) DO UPDATE SET title=excluded.title,phone=CASE WHEN excluded.phone!='' THEN excluded.phone ELSE phone END,username=CASE WHEN excluded.username!='' THEN excluded.username ELSE username END,coverage=excluded.coverage`, user.id, target, c.key, c.title, identity?.phone || '', identity?.username || '', c.coverage || 'observed');
            for (const r of messages) {
              const content = JSON.parse(r.data); // Corrupt content must never be acknowledged as uploaded.
              // A retry may contain only a local media placeholder: retain the full text's R2 point.
              if (content.cloudTextSynced) {
                if (one('SELECT 1 FROM cloud_archive_messages WHERE user_id=? AND account=? AND chat=? AND id=?', user.id, target, c.key, r.id)) continue;
                throw Error('聊天正文尚未确认存入云端，不能只同步媒体占位记录');
              }
              run(`INSERT INTO cloud_archive_messages VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,account,chat,id) DO UPDATE SET data=CASE WHEN excluded.source_seen>=source_seen THEN excluded.data ELSE data END,source_seen=MAX(source_seen,excluded.source_seen),point=CASE WHEN excluded.source_seen>=source_seen THEN excluded.point ELSE point END`, user.id, target, c.key, r.id, r.data, r.firstSeen, r.lastSeen, point.id);
            }
            const ids = new Set(messages.map(r => r.id));
            for (const asset of (assetsByChat.get(key) || []).filter(s => ids.has(s.message) && s.status !== 'superseded')) {
              const id = hash(JSON.stringify([target, c.key, asset.message, asset.slot])), descriptor = descriptors.get('archive/' + asset.path);
              const data = { id, kind: asset.kind, name: asset.name, status: asset.status, quality: asset.quality, mime: asset.mime, size: asset.size, error: asset.error, ...(descriptor ? { file: descriptor } : {}) };
              if (data.status === 'saved' && (!descriptor || descriptor.size !== asset.size)) { data.status = 'unavailable'; data.error = '原附件尚未同步到云端'; }
              const old = one('SELECT data FROM cloud_archive_assets WHERE user_id=? AND id=?', user.id, id);
              if (old) { const prior = JSON.parse(old.data); if (prior.status === 'saved' && (data.status !== 'saved' || prior.quality === 'download-link' && data.quality !== 'download-link')) continue; }
              run('INSERT OR REPLACE INTO cloud_archive_assets VALUES(?,?,?,?,?,?,?,?)', user.id, id, target, c.key, asset.message, asset.slot, JSON.stringify(data), point.id);
            }
          }
        }
        run(`INSERT INTO cloud_primary_points VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status='ready'`, point.id, user.id, point.device, point.label || '', point.created || Date.now(), point.bytes || file.size, JSON.stringify({ ...m, files: m.files.filter(f => f.path.startsWith('archive/') || f.path === 'records/account-index.json') }), 'ready');
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      prune(user); return { imported: true, messages: rows.length };
    } finally { from?.close(); try { await fs.promises.unlink(temp); } catch {} importing = false; }
  }
  function prune(user) {
    run("DELETE FROM cloud_primary_points WHERE user_id=? AND status='ready' AND id NOT IN(SELECT point FROM cloud_archive_messages WHERE user_id=? UNION SELECT point FROM cloud_archive_assets WHERE user_id=?)", user.id, user.id, user.id);
  }
  function accounts(user) { return all(`SELECT a.*,a.deleted_at AS deletedAt,(SELECT COUNT(*) FROM cloud_archive_chats c WHERE c.user_id=a.user_id AND c.account=a.id) chats,(SELECT COUNT(*) FROM cloud_archive_messages m WHERE m.user_id=a.user_id AND m.account=a.id) messages FROM cloud_archive_accounts a WHERE user_id=? AND EXISTS(SELECT 1 FROM cloud_archive_messages m WHERE m.user_id=a.user_id AND m.account=a.id) ORDER BY name,id`, user.id).map(a => ({ ...a, isDeleted: !!a.deletedAt, identity: a.phone ? '+' + a.phone : a.username ? '@' + a.username : '', ...(a.deletedAt ? { displayName: (a.phone || a.username || a.name) + ' · ' + new Date(a.deletedAt).toISOString() } : {}) })); }
  function listChats(user, account) { return all('SELECT c.*,(SELECT COUNT(*) FROM cloud_archive_messages m WHERE m.user_id=c.user_id AND m.account=c.account AND m.chat=c.key) messages FROM cloud_archive_chats c WHERE user_id=? AND account=? ORDER BY title,key', user.id, account); }
  function messages(user, r) {
    const offset = Math.max(0, Math.trunc(Number(r.offset) || 0)), account = String(r.accountId || ''), chat = String(r.chatKey || '');
    const numeric = one("SELECT COUNT(*) n FROM cloud_archive_messages WHERE user_id=? AND account=? AND chat=? AND (id='' OR id GLOB '*[^0-9]*')", user.id, account, chat).n === 0;
    const rows = all('SELECT * FROM cloud_archive_messages WHERE user_id=? AND account=? AND chat=? ORDER BY ' + (numeric ? 'CAST(id AS INTEGER)' : 'first_seen') + ' DESC,id DESC LIMIT 200 OFFSET ?', user.id, account, chat, offset);
    const total = one('SELECT COUNT(*) n FROM cloud_archive_messages WHERE user_id=? AND account=? AND chat=?', user.id, account, chat).n;
    return { messages: rows.reverse().map(r => ({ ...JSON.parse(r.data), assets: all('SELECT data FROM cloud_archive_assets WHERE user_id=? AND account=? AND chat=? AND message=? ORDER BY slot', user.id, account, chat, r.id).map(a => { const { file, ...info } = JSON.parse(a.data); return info; }) })), total, hasMore: total > offset + rows.length };
  }
  function asset(user, id) { const row = one('SELECT data FROM cloud_archive_assets WHERE user_id=? AND id=?', user.id, id); if (!row) throw Object.assign(Error('找不到云端附件'), { status: 404 }); return JSON.parse(row.data); }
  function remove(user, r) {
    if (!['account','chat'].includes(r.scope)) throw Error('请选择云端账号或客户');
    const account = String(r.accountId), params = r.scope === 'chat' ? [user.id, account, String(r.chatKey)] : [user.id, account], where = r.scope === 'chat' ? 'user_id=? AND account=? AND chat=?' : 'user_id=? AND account=?';
    db.exec('BEGIN'); try {
      run('INSERT OR IGNORE INTO cloud_archive_deleted SELECT user_id,account,chat,id FROM cloud_archive_messages WHERE ' + where, ...params);
      for (const table of ['cloud_archive_messages','cloud_archive_assets']) run('DELETE FROM ' + table + ' WHERE ' + where, ...params);
      run('DELETE FROM cloud_archive_chats WHERE ' + (r.scope === 'chat' ? 'user_id=? AND account=? AND key=?' : 'user_id=? AND account=?'), ...params);
      if (r.scope === 'account') run('DELETE FROM cloud_archive_accounts WHERE user_id=? AND id=?', user.id, account);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    prune(user); return { removed: true };
  }
  return { importPoint, accounts, listChats, messages, asset, remove, markDeleted: (user, id) => run('UPDATE cloud_archive_accounts SET deleted_at=? WHERE user_id=? AND id=?', Date.now(), user.id, id), alias: (user, device, id) => one('SELECT account FROM cloud_archive_aliases WHERE user_id=? AND device=? AND local_id=?', user.id, device, id)?.account };
}
module.exports = { createCloudArchive };
