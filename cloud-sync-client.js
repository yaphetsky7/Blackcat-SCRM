'use strict';
const fs = require('fs'), path = require('path');
const { CHUNK, hash, validPath } = require('./cloud-format');
const { atomic, read } = require('./cloud-data');
const { stable, rowKey, exportRows, applyRows, filesFor } = require('./cloud-sync-data');
const RECORDS = ['accounts.json','contacts.json','account-contacts.json','bulk.json','conversation-notes.json','ai-knowledge.json','quick-replies.json'];
function createSyncClient({ dataDir, owner, device, request, canApply = () => true, onApplied = () => {}, now = Date.now }) {
  const stateFile = path.join(dataDir, 'cloud-sync-' + hash(owner) + '.json'), linkedFile = path.join(dataDir, 'cloud-linked-accounts.json');
  let state = read(stateFile, { cursor: 0, rows: {}, lastRun: 0 }), running = false, lastError = '';
  let linked = read(linkedFile, {});
  const readRecords = () => Object.fromEntries(RECORDS.map(n => [n, read(path.join(dataDir, n), n === 'accounts.json' ? [] : null)]));
  function capture() { linked = { ...linked, ...read(linkedFile, {}) }; const records = readRecords(); for (const a of records['accounts.json']) if (a.self || a.me) linked[a.id] = require('./cloud-data').safeAccount(a); return { records, rows: exportRows(records, device, linked) }; }
  const localPath = p => { if (!validPath(p) || !/^(knowledge|quick-media)\//.test(p)) throw Error('同步附件路径不正确'); return path.join(dataDir, p.startsWith('knowledge/') ? 'knowledge-files' : 'quick-media', p.split('/')[1]); };
  async function uploadBytes(bytes) {
    const chunks = []; for (let i = 0; i < bytes.length; i += CHUNK) { const b = bytes.subarray(i, i + CHUNK); chunks.push({ hash: hash(b), size: b.length }); }
    const needed = new Set(await request('missing', 'POST', { hashes: chunks.map(c => c.hash) }));
    for (let i = 0; i < chunks.length; i++) if (needed.has(chunks[i].hash)) await request('chunks/' + chunks[i].hash, 'PUT', bytes.subarray(i * CHUNK, (i + 1) * CHUNK));
    return { size: bytes.length, hash: hash(bytes), chunks };
  }
  async function uploadFile(logical) {
    const file = localPath(logical), before = await fs.promises.stat(file), chunks = [], digest = require('crypto').createHash('sha256');
    for await (const bytes of fs.createReadStream(file, { highWaterMark: CHUNK })) { chunks.push({ hash: hash(bytes), size: bytes.length }); digest.update(bytes); }
    const needed = new Set(await request('missing', 'POST', { hashes: chunks.map(c => c.hash) })); let index = 0;
    if (needed.size) for await (const bytes of fs.createReadStream(file, { highWaterMark: CHUNK })) { const c = chunks[index++]; if (!c || hash(bytes) !== c.hash) throw Error('资料正在修改，稍后自动重试'); if (needed.has(c.hash)) await request('chunks/' + c.hash, 'PUT', bytes); }
    const after = await fs.promises.stat(file); if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw Error('资料正在修改，稍后自动重试');
    return { path: logical, size: before.size, hash: digest.digest('hex'), chunks };
  }
  async function getBytes(descriptor) { const chunks = []; for (const c of descriptor.chunks) { const b = await request('chunks/' + c.hash, 'GET', undefined, true); if (b.length !== c.size || hash(b) !== c.hash) throw Error('同步资料校验失败'); chunks.push(b); } const bytes = Buffer.concat(chunks); if (bytes.length !== descriptor.size || hash(bytes) !== descriptor.hash) throw Error('同步资料校验失败'); return bytes; }
  async function getFile(descriptor) {
    const dest = localPath(descriptor.path);
    if (fs.existsSync(dest)) { const h = require('crypto').createHash('sha256'); for await (const b of fs.createReadStream(dest)) h.update(b); if (h.digest('hex') === descriptor.hash) return; }
    fs.mkdirSync(path.dirname(dest), { recursive: true }); const temp = dest + '.sync-partial', digest = require('crypto').createHash('sha256'); let length = 0;
    const handle = await fs.promises.open(temp, 'w'); try { for (const c of descriptor.chunks) { const b = await request('chunks/' + c.hash, 'GET', undefined, true); if (b.length !== c.size || hash(b) !== c.hash) throw Error('同步附件校验失败'); digest.update(b); let offset = 0; while (offset < b.length) offset += (await handle.write(b, offset, b.length - offset)).bytesWritten; length += b.length; } } finally { await handle.close(); }
    if (length !== descriptor.size || digest.digest('hex') !== descriptor.hash) throw Error('同步附件校验失败'); await fs.promises.rename(temp, dest);
  }
  async function cycle() {
    if (running) return { running: true }; if (!canApply()) return { deferred: true };
    running = true; lastError = '';
    try {
      const migration = await request('sync/prepare', 'POST', {}); if (migration.pending) return { deferred: true }; if (migration.warnings?.length) lastError = migration.warnings.join('；');
      // Pull first on every run, before constructing outgoing edits. Unrelated records merge.
      let turns = 0;
      for (;;) {
        const before = capture(), result = await request('sync/exchange', 'POST', { since: state.cursor, changes: [] });
        await receive(result.rows, before); state.cursor = result.cursor; atomic(stateFile, state);
        if (!result.more) break; if (++turns >= 100) return { more: true };
      }
      if (!canApply()) return { deferred: true };
      const snapshot = capture(), changes = [], itemErrors = [];
      for (const [key, row] of snapshot.rows) if (state.rows[key]?.hash !== hash(stable(row))) {
        if (changes.length >= 50) break;
        try {
          const assets = []; for (const p of filesFor(row)) assets.push(await uploadFile(p));
          changes.push({ key, baseRevision: state.rows[key]?.revision || 0, deleted: false, descriptor: { record: await uploadBytes(Buffer.from(stable(row))), assets }, row });
        } catch (e) { if (!['ENOENT','EACCES','EBUSY'].includes(e.code) && !/资料正在修改/.test(e.message)) throw e; itemErrors.push('部分知识库或文案的原文件暂不可读取，其他资料继续同步'); }
      }
      for (const [key, baseline] of Object.entries(state.rows)) if (!baseline.deleted && !snapshot.rows.has(key) && changes.length < 50) {
        const row = { ...baseline.row, value: {} };
        changes.push({ key, baseRevision: baseline.revision, deleted: true, descriptor: { record: await uploadBytes(Buffer.from(stable(row))), assets: [] }, row });
      }
      if (changes.length) {
        const result = await request('sync/exchange', 'POST', { since: state.cursor, changes: changes.map(({ row, ...c }) => c) });
        for (const ack of result.applied) { const sent = changes.find(c => c.key === ack.key); state.rows[ack.key] = { revision: ack.revision, hash: sent.deleted ? null : hash(stable(sent.row)), row: sent.row, deleted: ack.deleted }; }
        // Do not advance the read cursor here: every accepted/conflicting remote record is
        // pulled in revision order next run, even when a response spans several pages.
        atomic(stateFile, state);
      }
      if (itemErrors.length) lastError = [lastError, ...new Set(itemErrors)].filter(Boolean).join('；');
      state.lastRun = now(); atomic(linkedFile, linked); atomic(stateFile, state);
      return { synced: true, sent: changes.length };
    } catch (e) { lastError = e.message; throw e; } finally { running = false; }
  }
  async function receive(remote, before) {
    const pending = [], baselines = {};
    for (const entry of remote) {
      if (state.rows[entry.key]?.revision >= entry.revision) continue;
      const row = JSON.parse((await getBytes(entry.descriptor.record)).toString('utf8')); if (rowKey(row) !== entry.key) throw Error('云端同步项目校验失败');
      for (const f of entry.deleted ? [] : entry.descriptor.assets) await getFile(f);
      pending.push({ ...entry, row });
    }
    if (!canApply()) throw Error('正在保存编辑或学习资料，稍后继续同步');
    // Re-read after network waits. Never overwrite a local edit made during a download.
    const latest = capture(), applying = [];
    for (const entry of pending) {
      const local = latest.rows.get(entry.key), baseline = state.rows[entry.key];
      // First upgrade keeps newer local work over a legacy backup, but an existing
      // cloud deletion still wins over an unchanged stale copy on a joining PC.
      const clean = baseline ? (local ? hash(stable(local)) : null) === (baseline.deleted ? null : baseline.hash) : (!local || entry.deleted) && stable(local) === stable(before.rows.get(entry.key));
      if (clean) applying.push({ row: entry.row, deleted: entry.deleted });
      // Local edits win on this device and are retried against the latest revision.
      baselines[entry.key] = { revision: entry.revision, hash: entry.deleted ? null : hash(stable(entry.row)), row: entry.row, deleted: entry.deleted };
    }
    const touched = applyRows(latest.records, applying, linked);
    // Identity remapping is applied without creating a messaging session or switching UI.
    const virtual = new Map(Object.entries(linked));
    for (const [oldId, a] of virtual) { const found = latest.records['accounts.json'].find(v => require('./contact-restore').same(require('./contact-restore').identity(v), require('./contact-restore').identity(a))); if (!found || found.id === oldId) continue;
      const notes = latest.records['conversation-notes.json']; for (const n of notes?.notes || []) if (n.accountId === oldId) { n.accountId = found.id; touched.add('conversation-notes.json'); }
      for (const name of ['account-contacts.json']) { const v = latest.records[name]; if (v?.[oldId]) { v[found.id] = { ...v[oldId], ...v[found.id], list: require('./contact-restore').merge(v[oldId].list, v[found.id]?.list || []) }; delete v[oldId]; touched.add(name); } }
      const ai = latest.records['ai-knowledge.json']; if (ai?.accounts?.[oldId]) { ai.accounts[found.id] ||= ai.accounts[oldId]; delete ai.accounts[oldId]; touched.add('ai-knowledge.json'); }
      const quick = latest.records['quick-replies.json']; if (quick?.personal?.[oldId]) { quick.personal[found.id] ||= quick.personal[oldId]; delete quick.personal[oldId]; touched.add('quick-replies.json'); }
    }
    if (touched.has('conversation-notes.json')) { const notes = new Map(); for (const n of latest.records['conversation-notes.json'].notes) { const key = JSON.stringify([n.accountId,n.chatKey]), prior = notes.get(key); if (!prior || Number(n.updatedAt || 0) >= Number(prior.updatedAt || 0)) notes.set(key,n); } latest.records['conversation-notes.json'].notes = [...notes.values()]; }
    for (const name of touched) atomic(path.join(dataDir, name), latest.records[name]);
    atomic(linkedFile, linked); if (touched.size) onApplied([...touched]); Object.assign(state.rows, baselines);
  }
  return { cycle, status: () => { const counts = {}; for (const r of Object.values(state.rows)) if (!r.deleted) counts[r.row.kind] = (counts[r.row.kind] || 0) + 1; return { running, lastRun: state.lastRun, error: lastError, counts, items: Object.values(state.rows).filter(r => !r.deleted).length }; } };
}
module.exports = { createSyncClient };
