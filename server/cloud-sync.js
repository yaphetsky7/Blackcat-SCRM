'use strict';
const { hash, validateManifest } = require('../cloud-format');
const { exportRows, stable, filesFor, priority } = require('../cloud-sync-data');
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
    if (body.priority === true && (!Number.isSafeInteger(body.prioritySince) || body.prioritySince < 0)) throw Error('优先资料游标不正确');
    const keys = new Set();
    for (const change of body.changes) { if (!/^(contact|account-contact|group|template|list|note|knowledge|ai-config|quick):[a-f0-9]{64}$/.test(change.key || '') || keys.has(change.key) || !Number.isSafeInteger(change.baseRevision) || change.baseRevision < 0 || typeof change.deleted !== 'boolean') throw Error('同步项目不正确'); keys.add(change.key); validate(user, change.descriptor); }
    const applied = [], conflicts = [];
    db.exec('BEGIN IMMEDIATE');
    try { for (const change of body.changes) { const old = getRow(user, change.key); if ((old?.revision || 0) !== change.baseRevision) { conflicts.push(publicRow(old)); continue; } if (change.deleted && !old) continue; applied.push(write(user, change.key, change.deleted, change.descriptor)); } db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    const rows = db.prepare('SELECT * FROM cloud_sync_records WHERE user_id=? AND revision>? ORDER BY revision LIMIT 101').all(user.id, body.since), more = rows.length > 100; rows.length = Math.min(100, rows.length);
    let priorityRows = [], priorityCursor = 0, priorityMore = false;
    if (body.priority === true) {
      priorityRows = db.prepare("SELECT * FROM cloud_sync_records WHERE user_id=? AND revision>? AND key NOT LIKE 'contact:%' AND key NOT LIKE 'account-contact:%' ORDER BY revision LIMIT 101").all(user.id, body.prioritySince);
      priorityMore = priorityRows.length > 100; priorityRows.length = Math.min(100, priorityRows.length); priorityCursor = priorityRows.at(-1)?.revision ?? body.prioritySince;
    }
    return { applied, conflicts, rows: rows.map(publicRow), cursor: rows.at(-1)?.revision ?? body.since, more, ...(body.priority ? { priorityRows: priorityRows.map(publicRow), priorityCursor, priorityMore } : {}), workspace: status(user) };
  }
  const migrations = new Map(), cache = new Map();
  const migrationState = user => migrations.get(user.id) || { running: false, more: false, done: 0, total: 0, warnings: [] };
  async function importLegacy(user) {
    requirePlan(user);
    const state = migrationState(user); if (state.running) return { migrating: true, done: state.done, total: state.total };
    state.running = true; state.more = true; state.done = 0; state.total = 0; state.warnings = []; migrations.set(user.id, state);
    // Preparation is a bounded background batch, never a multi-minute HTTP request.
    // Old and new clients can keep syncing their current records while it runs.
    const task = (async () => { try {
      const latest = new Map(); for (const point of db.prepare('SELECT * FROM cloud_snapshots WHERE user_id=? ORDER BY created DESC').all(user.id)) if (!latest.has(point.device)) latest.set(point.device, point);
      let remaining = 96;
      for (const point of latest.values()) {
        if (db.prepare('SELECT 1 FROM cloud_sync_migrated WHERE user_id=? AND id=?').get(user.id, point.id)) continue;
        try {
          const cacheKey = user.id + ':' + point.id;
          let input = cache.get(cacheKey);
          if (!input) {
            const manifest = JSON.parse(point.manifest), records = {}, descriptors = new Map(manifest.files.map(f => [f.path, f])); let size = 0;
            for (const f of manifest.files.filter(f => f.path.startsWith('records/'))) { if (f.size > 32e6) throw Error('旧资料过大，请保留原文件并联系维护人员迁移'); const bytes = Buffer.concat(await Promise.all(f.chunks.map(c => get(user, c.hash)))); if (bytes.length !== f.size || hash(bytes) !== f.hash) throw Error('旧资料校验失败'); records[f.path.slice(8)] = JSON.parse(bytes); size += bytes.length; }
            input = { rows: [...exportRows(records, point.device)].sort((a,b) => priority(a[1].kind) - priority(b[1].kind)), descriptors, size };
            // Keep a small bounded parsed-source cache; customer data stays on this server.
            if (size <= 24e6) { while (cache.size && [...cache.values()].reduce((n,v)=>n+v.size,0) + size > 24e6) cache.delete(cache.keys().next().value); cache.set(cacheKey, input); }
          }
          const needed = input.rows.filter(([key]) => !getRow(user,key)); state.total += input.rows.length; state.done += input.rows.length - needed.length;
          const batch = needed.slice(0,remaining); remaining -= batch.length; let next = 0;
          await Promise.all(Array.from({length:Math.min(6,batch.length)}, async()=>{for(;;){const i=next++;if(i>=batch.length)return;const[key,row]=batch[i];try{
            const assets=filesFor(row).map(p=>input.descriptors.get(p));if(assets.some(f=>!f))throw Error('部分旧资料附件缺失，原资料已保留');
            const bytes=Buffer.from(stable(row)),chunks=[],{CHUNK}=require('../cloud-format');for(let p=0;p<bytes.length;p+=CHUNK){const b=bytes.subarray(p,p+CHUNK),h=hash(b);await put(user,h,b);chunks.push({hash:h,size:b.length});}
            if(!getRow(user,key))write(user,key,false,{record:{hash:hash(bytes),size:bytes.length,chunks},assets});state.done++;
          }catch(e){state.warnings.push(e.message);}}}));
          if (!input.rows.some(([key])=>!getRow(user,key))) { db.prepare('INSERT OR IGNORE INTO cloud_sync_migrated VALUES(?,?)').run(user.id,point.id); cache.delete(cacheKey); }
          if (!remaining) break;
        } catch (e) { state.warnings.push(e.message); }
      }
      state.more=[...latest.values()].some(p=>!db.prepare('SELECT 1 FROM cloud_sync_migrated WHERE user_id=? AND id=?').get(user.id,p.id));
    } finally { state.running=false; state.warnings=[...new Set(state.warnings)]; }})();
    state.task=task; task.catch(e=>{state.warnings=[e.message];state.running=false;});
    return { migrating: state.running, more: state.more, done: state.done, total: state.total, warnings: state.warnings };
  }
  function references(user) { const refs = new Set(); for (const r of db.prepare('SELECT descriptor FROM cloud_sync_records WHERE user_id=?').all(user.id)) { const d = JSON.parse(r.descriptor); for (const f of [d.record, ...d.assets]) for (const c of f.chunks) refs.add(c.hash); } return refs; }
  function status(user) { const clock=db.prepare('SELECT revision,updated_at FROM cloud_sync_clock WHERE user_id=?').get(user.id),counts=Object.fromEntries(db.prepare("SELECT substr(key,1,instr(key,':')-1) AS kind,COUNT(*) AS n FROM cloud_sync_records WHERE user_id=? AND deleted=0 GROUP BY kind").all(user.id).map(r=>[r.kind,r.n]));const m=migrationState(user);return { revision:clock?.revision||0,updatedAt:clock?.updated_at||0,counts,records:Object.values(counts).reduce((a,n)=>a+n,0),migration:{running:m.running,more:m.more,done:m.done,total:m.total,warnings:m.warnings} }; }
  return { exchange, importLegacy, references, status };
}
module.exports = { createBusinessSync };
