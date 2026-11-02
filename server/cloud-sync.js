'use strict';
const { hash, validateManifest } = require('../cloud-format');
const { exportRows, stable, filesFor } = require('../cloud-sync-data');
function createBusinessSync({ db, get, put, requirePlan }) {
  db.exec(`CREATE TABLE IF NOT EXISTS cloud_sync_records(user_id INTEGER,key TEXT,revision INTEGER,deleted INTEGER,descriptor TEXT,PRIMARY KEY(user_id,key));
    CREATE INDEX IF NOT EXISTS cloud_sync_revision ON cloud_sync_records(user_id,revision);
    CREATE TABLE IF NOT EXISTS cloud_sync_clock(user_id INTEGER PRIMARY KEY,revision INTEGER);
    CREATE TABLE IF NOT EXISTS cloud_sync_migrated(user_id INTEGER,id TEXT,PRIMARY KEY(user_id,id));`);
  if (!db.prepare('PRAGMA table_info(cloud_sync_clock)').all().some(c => c.name === 'updated_at')) db.exec('ALTER TABLE cloud_sync_clock ADD COLUMN updated_at INTEGER DEFAULT 0');
  const getRow = (user, key) => db.prepare('SELECT * FROM cloud_sync_records WHERE user_id=? AND key=?').get(user.id, key);
  const publicRow = r => r && ({ key: r.key, revision: r.revision, deleted: !!r.deleted, descriptor: JSON.parse(r.descriptor) });
  function validate(user, descriptor) {
    if (!descriptor || !descriptor.record || !Array.isArray(descriptor.assets) || descriptor.assets.length > 1000) throw Error('同步资料格式不正确');
    const files = [descriptor.record, ...descriptor.assets];
    validateManifest({ version: 1, accounts: [], files: files.map((f, i) => ({ ...f, path: i ? 'knowledge/' + i : 'records/contacts.json' })) });
    if (descriptor.record.size > 32e6) throw Error('单项同步资料超过 32 MB');
    for (const f of files) for (const c of f.chunks) { const found = db.prepare('SELECT size,status FROM cloud_chunks WHERE user_id=? AND hash=?').get(user.id, c.hash); if (found?.status !== 'ready' || found.size !== c.size) throw Error('同步文件尚未上传完成'); }
  }
  function write(user, key, deleted, descriptor) {
    const revision = db.prepare('INSERT INTO cloud_sync_clock(user_id,revision,updated_at) VALUES(?,1,?) ON CONFLICT(user_id) DO UPDATE SET revision=revision+1,updated_at=excluded.updated_at RETURNING revision').get(user.id, Date.now()).revision;
    db.prepare('INSERT INTO cloud_sync_records VALUES(?,?,?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET revision=excluded.revision,deleted=excluded.deleted,descriptor=excluded.descriptor').run(user.id, key, revision, deleted ? 1 : 0, JSON.stringify(descriptor));
    return publicRow(getRow(user, key));
  }
  function exchange(user, body) {
    requirePlan(user);
    if (!Number.isSafeInteger(body.since) || body.since < 0 || !Array.isArray(body.changes) || body.changes.length > 100) throw Error('同步请求不正确');
    const keys = new Set();
    for (const change of body.changes) { if (!/^(contact|account-contact|group|template|list|note|knowledge|ai-config|quick):[a-f0-9]{64}$/.test(change.key || '') || keys.has(change.key) || !Number.isSafeInteger(change.baseRevision) || change.baseRevision < 0 || typeof change.deleted !== 'boolean') throw Error('同步项目不正确'); keys.add(change.key); validate(user, change.descriptor); }
    const applied = [], conflicts = [];
    db.exec('BEGIN IMMEDIATE');
    try { for (const change of body.changes) { const old = getRow(user, change.key); if ((old?.revision || 0) !== change.baseRevision) { conflicts.push(publicRow(old)); continue; } if (change.deleted && !old) continue; applied.push(write(user, change.key, change.deleted, change.descriptor)); } db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    const rows = db.prepare('SELECT * FROM cloud_sync_records WHERE user_id=? AND revision>? ORDER BY revision LIMIT 101').all(user.id, body.since), more = rows.length > 100; rows.length = Math.min(100, rows.length);
    return { applied, conflicts, rows: rows.map(publicRow), cursor: rows.at(-1)?.revision ?? body.since, more };
  }
  let migrating = false;
  async function importLegacy(user) {
    requirePlan(user); if (migrating) return { pending: true }; migrating = true;
    const warnings = []; let imported = 0;
    try {
      const latest = new Map(); for (const point of db.prepare('SELECT * FROM cloud_snapshots WHERE user_id=? ORDER BY created DESC').all(user.id)) if (!latest.has(point.device)) latest.set(point.device, point);
      for (const point of latest.values()) {
        if (db.prepare('SELECT 1 FROM cloud_sync_migrated WHERE user_id=? AND id=?').get(user.id, point.id)) continue;
        try {
          const manifest = JSON.parse(point.manifest), records = {}, descriptors = new Map(manifest.files.map(f => [f.path, f]));
          for (const f of manifest.files.filter(f => f.path.startsWith('records/'))) { if (f.size > 32e6) throw Error('旧资料过大，请保留原文件并联系维护人员迁移'); const bytes = Buffer.concat(await Promise.all(f.chunks.map(c => get(user, c.hash)))); if (bytes.length !== f.size || hash(bytes) !== f.hash) throw Error('旧资料校验失败'); records[f.path.slice(8)] = JSON.parse(bytes); }
          for (const [key, row] of exportRows(records, point.device)) {
            if (getRow(user, key)) continue; // Current edits and deletions always win over legacy backups.
            const assets = filesFor(row).map(p => descriptors.get(p)); if (assets.some(f => !f)) { warnings.push('部分旧资料附件缺失，已保留原恢复点'); continue; }
            const bytes = Buffer.from(stable(row)), chunks = []; const { CHUNK } = require('../cloud-format');
            for (let i = 0; i < bytes.length; i += CHUNK) { const b = bytes.subarray(i, i + CHUNK), h = hash(b); await put(user, h, b); chunks.push({ hash: h, size: b.length }); }
            // Another device may have saved this row while its immutable bytes were uploaded.
            if (!getRow(user, key)) { write(user, key, false, { record: { hash: hash(bytes), size: bytes.length, chunks }, assets }); imported++; }
          }
          db.prepare('INSERT OR IGNORE INTO cloud_sync_migrated VALUES(?,?)').run(user.id, point.id);
        } catch (e) { warnings.push(e.message); }
      }
      return { imported, warnings: [...new Set(warnings)] };
    } finally { migrating = false; }
  }
  function references(user) { const refs = new Set(); for (const r of db.prepare('SELECT descriptor FROM cloud_sync_records WHERE user_id=?').all(user.id)) { const d = JSON.parse(r.descriptor); for (const f of [d.record, ...d.assets]) for (const c of f.chunks) refs.add(c.hash); } return refs; }
  const status = user => ({ revision: db.prepare('SELECT revision FROM cloud_sync_clock WHERE user_id=?').get(user.id)?.revision || 0, records: db.prepare('SELECT COUNT(*) n FROM cloud_sync_records WHERE user_id=? AND deleted=0').get(user.id).n });
  return { exchange, importLegacy, references, status };
}
module.exports = { createBusinessSync };
