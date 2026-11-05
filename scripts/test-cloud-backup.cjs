'use strict';
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { Worker } = require('worker_threads');
const { openStore } = require('../server/store');
const { createCloudBackup } = require('../server/cloud-backup');
const { CHUNK, hash, validateManifest, validPath } = require('../cloud-format');
const { collect, atomic, applyPending } = require('../cloud-data');
const { createArchive } = require('../backup-archive');
const { openReader, readerAccounts } = require('../backup-reader');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blackcat-cloud-test-'));
async function main() {
  const store = openStore(path.join(root, 'server')), objects = new Map(); let puts = 0;
  const storage = { configured: true, put: async (key, data) => { puts++; objects.set(key, Buffer.from(data)); }, get: async key => { if (!objects.has(key)) throw Error('missing'); return objects.get(key); }, delete: async key => { objects.delete(key); } };
  const cloud = createCloudBackup({ store, storage, env: { R2_TOTAL_LIMIT_BYTES: '50000000' } });
  const a = store.createUser({ username: 'company-a', password: 'password-A', plan: 'business' });
  const b = store.createUser({ username: 'company-b', password: 'password-B', plan: 'enterprise' });
  const pro = store.createUser({ username: 'company-pro', password: 'password-C', plan: 'pro' });
  assert.equal(store.profile(a).limits.cloudBytes, 100e9); assert.equal(store.profile(b).limits.cloudBytes, 500e9); assert.equal(store.profile(pro).limits.cloudBytes, 0);
  for (const p of ['/tmp', '../secret', 'archive/media/../../settings.json', 'records/license.json', 'knowledge/CON.txt', 'knowledge/test:bad', 'archive/media/foo\\bar']) assert.equal(validPath(p), false, p);
  const dataDir = path.join(root, 'source'); fs.mkdirSync(dataDir);
  const account = { id: 'wa-1', name: 'MH', platform: 'whatsapp', me: { phone: '60100000000' }, proxy: { password: 'DO-NOT-UPLOAD' } };
  atomic(path.join(dataDir, 'accounts.json'), [account]);
  atomic(path.join(dataDir, 'license.json'), { token: 'DO-NOT-UPLOAD' }); atomic(path.join(dataDir, 'settings.json'), { claudeKey: 'DO-NOT-UPLOAD' });
  atomic(path.join(dataDir, 'conversation-notes.json'), { notes: [{ accountId: 'wa-1', chatKey: 'whatsapp:customer-1', text: 'VIP 客户', title: 'Amy' }] });
  atomic(path.join(dataDir, 'contacts.json'), { whatsapp: [{ id: 'c1', phone: '60111111111', name: 'Amy' }] });
  atomic(path.join(dataDir, 'bulk.json'), { templates: [{ id: 't1', name: 'Promo', items: [{ id: 'ti1', text: 'Hello' }] }], lists: [{ id: 'l1', rows: [{ phone: '60111111111' }] }], tasks: [{ id: 'NEVER-RESUME', status: 'sending' }] });
  atomic(path.join(dataDir, 'ai-knowledge.json'), { version: 1, bases: [{ id: 'kb1', documents: [{ id: 'doc1', file: 'source.txt', connection: 'DO-NOT-UPLOAD', cards: [{ content: 'Product facts' }] }] }], accounts: { 'wa-1': { enabled: true, knowledgeBaseIds: ['kb1'] } } });
  fs.mkdirSync(path.join(dataDir, 'knowledge-files')); fs.writeFileSync(path.join(dataDir, 'knowledge-files', 'source.txt'), 'Product reference');
  const folder = path.join(root, 'archive'), archive = createArchive(folder); archive.db.prepare('INSERT INTO accounts(id,name,platform) VALUES(?,?,?)').run('wa-1', 'MH', 'whatsapp'); archive.close();
  const video = crypto.randomBytes(CHUNK + 1024); fs.writeFileSync(path.join(folder, 'media', 'test.mp4'), video);
  const owned=createArchive(folder);try{owned.ingest(account,{chat:{key:'whatsapp:customer-1',title:'Amy'},messages:[{id:'video-1',text:'Video fixture',assets:[{kind:'video',name:'test.mp4'}]}]});owned.db.prepare("UPDATE assets SET path='media/test.mp4',status='saved',quality='download-link',mime='video/mp4',size=? WHERE account=?").run(video.length,account.id);}finally{owned.close();}
  const http = require('http');
  const server = http.createServer(async (req, res) => {
    const token = req.headers.authorization; const user = token === 'Bearer a' ? a : token === 'Bearer b' ? b : null;
    if (!user) { res.writeHead(401); return res.end('{}'); }
    const readBody = async (r, limit) => { const chunks = []; let n = 0; for await (const c of r) { n += c.length; if (n > limit) throw Error('too large'); chunks.push(c); } return Buffer.concat(chunks); };
    const send = (r, status, body) => { r.writeHead(status, { 'content-type': 'application/json' }); r.end(JSON.stringify(body)); };
    try { await cloud.route(req, res, new URL(req.url, 'http://localhost'), { user, session: { device_id: token, device_name: token } }, { readBody, json: async (r, limit = 1e6) => JSON.parse((await readBody(r, limit)).toString()), send }); }
    catch (e) { send(res, e.status || 400, { ok: false, error: e.message }); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const url = 'http://127.0.0.1:' + server.address().port;
  function worker(job) { return new Promise((resolve, reject) => { const w = new Worker(path.resolve(__dirname, '../cloud-worker.js'), { workerData: { server: url, token: 'a', version: 'test', dataDir, label: 'PC1', ...job } }); w.on('message', m => { if (m.error) reject(Error(m.error)); if (m.result) resolve(m.result); }); w.on('error', reject); w.on('exit', code => { if (code) reject(Error('worker exited')); }); }); }
  try {
    const stage = fs.mkdtempSync(path.join(dataDir, '.cloud-stage-'));
    const first = await worker({ action: 'upload', folder, stage }); assert(first.sent >= video.length); assert(first.files >= 8);
    const firstPuts = puts, m = cloud.getSnapshot(a, first.id).manifest;
    assert(!JSON.stringify(m).includes('DO-NOT-UPLOAD')); assert(m.files.some(f => f.path === 'archive/media/test.mp4' && f.chunks.length === 2));
    await assert.rejects(cloud.get(b, m.files[0].chunks[0].hash), /找不到/); assert.throws(() => cloud.getSnapshot(b, first.id), /找不到/);
    await assert.rejects(cloud.put(pro, hash(Buffer.from('x')), Buffer.from('x')), /Business/);
    await assert.rejects(cloud.put(a, '0'.repeat(64), Buffer.from('bad')), /校验/);
    const second = await worker({ action: 'upload', folder, stage: fs.mkdtempSync(path.join(dataDir, '.cloud-stage-')) }); assert.equal(puts, firstPuts + 1); assert.equal(second.sent, 0);
    const dest = path.join(root, 'download'); fs.mkdirSync(dest);
    await worker({ action: 'download', id: first.id, folder: dest });
    assert(fs.readFileSync(path.join(dest, 'archive/media/test.mp4')).equals(video));
    const exported = JSON.stringify(JSON.parse(fs.readFileSync(path.join(dest, 'records/ai-knowledge.json')))); assert(!exported.includes('DO-NOT-UPLOAD')); assert(!JSON.stringify(JSON.parse(fs.readFileSync(path.join(dest, 'records/bulk.json')))).includes('NEVER-RESUME'));
    const target = path.join(root, 'new-computer'); fs.mkdirSync(target);
    atomic(path.join(target, 'accounts.json'), [{ id: 'local-wa', name: 'Local', platform: 'whatsapp', me: { phone: '60100000000' } }]);
    atomic(path.join(target, 'contacts.json'), { whatsapp: [{ id: 'existing', name: 'Local customer' }] });
    atomic(path.join(target, 'cloud-pending-restore.json'), { id: first.id, folder: dest, owner: 'company-a' });
    assert.equal(applyPending(target, 5, 'company-b'), null); assert.equal(applyPending(target, 5, 'company-a').imported, true);
    const note = JSON.parse(fs.readFileSync(path.join(target, 'conversation-notes.json'))).notes[0]; assert.equal(note.accountId, 'local-wa'); assert.equal(note.text, 'VIP 客户');
    const restored = JSON.parse(fs.readFileSync(path.join(target, 'ai-knowledge.json'))); assert.equal(restored.accounts['local-wa'].enabled, false); assert.equal(restored.bases[0].id, 'kb1');
    assert.equal(JSON.parse(fs.readFileSync(path.join(target, 'contacts.json'))).whatsapp.length, 2);
    assert.equal(JSON.parse(fs.readFileSync(path.join(target, 'bulk.json'))).tasks.length, 0);
    const reader = openReader(path.join(dest, 'archive/chat-archive.sqlite')); assert.equal(readerAccounts(reader).length, 1); reader.close();
    assert.equal(applyPending(target, 5, 'company-a'), null);
    const tiny = createCloudBackup({ store, storage, env: { R2_TOTAL_LIMIT_BYTES: '1' } }); await assert.rejects(tiny.put(b, hash(Buffer.from('limit')), Buffer.from('limit')), /上限/);
    let pending; const waiting = { configured: true, put: () => new Promise(r => { pending = r; }) };
    const concurrent = createCloudBackup({ store, storage: waiting, env: { R2_TOTAL_LIMIT_BYTES: String(cloud.state(a).sharedUsedBytes + 4) } });
    const p = concurrent.put(a, hash(Buffer.from('aaaa')), Buffer.from('aaaa')); await assert.rejects(concurrent.put(b, hash(Buffer.from('bbbb')), Buffer.from('bbbb')), /上限/); pending(); await p;
    assert.throws(() => validateManifest({ version: 1, accounts: [], files: [{ path: 'records/license.json', hash: '0'.repeat(64), size: 0, chunks: [] }] }), /索引/);
    console.log('PASS: plan entitlements, tenant isolation, resumable video chunks, incremental dedup, full download, notes/account mapping, safe import, no secrets/jobs, quota reservations, archive reader.');
  } finally { await new Promise(r => server.close(r)); store.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => {
  const target = path.resolve(root); if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('blackcat-cloud-test-')) fs.rmSync(target, { recursive: true, force: true });
});
