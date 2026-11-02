'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync, backup } = require('node:sqlite');
const { RECORDS, validPath } = require('./cloud-format');
const atomic = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.cloud-tmp', JSON.stringify(value, null, 2)); fs.renameSync(file + '.cloud-tmp', file); };
function read(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw Error('资料无法读取：' + path.basename(file)); } }
function safeAccount(a) { return { id: String(a.id), name: String(a.name || ''), platform: String(a.platform || ''), me: { phone: String(a.me?.phone || a.self?.phone || ''), username: String(a.me?.username || a.self?.username || '') } }; }
function knowledgeExport(value) {
  const out = structuredClone(value);
  // Connections contain machine-encrypted API credentials; source content and learned cards are portable.
  for (const b of out.bases || []) for (const d of b.documents || []) { delete d.connection; if (d.url) { try { const u = new URL(d.url); u.username = ''; u.password = ''; u.search = ''; d.url = u.href; } catch { delete d.url; } } }
  out.jobs = []; out.handled = {}; out.usage = {};
  for (const config of Object.values(out.accounts || {})) config.enabled = false;
  return out;
}
async function* walk(root, prefix) {
  if (!fs.existsSync(root)) return;
  for (const entry of await fs.promises.readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name), relative = prefix + '/' + entry.name;
    if (entry.isSymbolicLink()) throw Error('备份资料中包含链接目录，请移除链接后重试');
    if (entry.isDirectory()) yield* walk(full, relative);
    else if (entry.isFile() && !entry.name.endsWith('.tmp') && !entry.name.endsWith('.cloud-tmp')) {
      if (!validPath(relative)) throw Error('文件名无法跨电脑恢复：' + relative);
      yield { path: relative, file: full };
    }
  }
}
async function* collect({ dataDir, folder, stage }) {
  fs.mkdirSync(stage, { recursive: true });
  for (const name of RECORDS) {
    let value;
    if (name === 'account-index.json') value = read(path.join(dataDir, 'accounts.json'), []).map(safeAccount);
    else value = read(path.join(dataDir, name), null);
    if (value === null) continue;
    if (name === 'ai-knowledge.json') value = knowledgeExport(value);
    if (name === 'bulk.json') { value = { templates: value.templates || [], lists: value.lists || [], tasks: [] }; }
    const file = path.join(stage, name); atomic(file, value); yield { path: 'records/' + name, file };
  }
  yield* walk(path.join(dataDir, 'knowledge-files'), 'knowledge');
  yield* walk(path.join(dataDir, 'quick-media'), 'quick-media');
  if (folder && fs.existsSync(path.join(folder, 'chat-archive.sqlite'))) {
    const db = new DatabaseSync(path.join(folder, 'chat-archive.sqlite'), { readOnly: true });
    const file = path.join(stage, 'chat-archive.sqlite');
    try { await backup(db, file); } finally { db.close(); }
    yield { path: 'archive/chat-archive.sqlite', file };
    yield* walk(path.join(folder, 'media'), 'archive/media');
    yield* walk(path.join(folder, 'imports'), 'archive/imports');
  }
}
function accountIdentity(a) {
  const phone = String(a.me?.phone || a.self?.phone || '').replace(/\D/g, '');
  const username = String(a.me?.username || a.self?.username || '').replace(/^@/, '').toLowerCase();
  return phone ? a.platform + ':p:' + phone : username ? a.platform + ':u:' + username : '';
}
function mergeById(local, incoming) {
  if (!Array.isArray(local) || !Array.isArray(incoming)) throw Error('恢复资料结构不正确');
  const seen = new Set(local.map(r => r.id || JSON.stringify(r)));
  return local.concat(incoming.filter(r => { const k = r.id || JSON.stringify(r); if (seen.has(k)) return false; seen.add(k); return true; }));
}
// Called at app startup, before any in-memory data stores load. Existing local data wins.
function applyPending(dataDir, maxAccounts = 0, owner = '') {
  const marker = path.join(dataDir, 'cloud-pending-restore.json');
  const pending = read(marker, null); if (!pending) return null;
  if (!owner || pending.owner !== owner) return null;
  const root = path.resolve(pending.folder), records = path.join(root, 'records');
  if (!fs.existsSync(path.join(root, 'complete.json'))) throw Error('云端恢复下载尚未完成');
  const incoming = read(path.join(records, 'account-index.json'), []), local = read(path.join(dataDir, 'accounts.json'), []), mapping = new Map();
  for (const raw of incoming) {
    const a = safeAccount(raw);
    if (!/^[\w-]{1,100}$/.test(a.id) || !['whatsapp','telegram','line','facebook','tiktok','wechat','zalo','x'].includes(a.platform)) continue;
    const identity = accountIdentity(a), existing = local.find(b => b.id === a.id || identity && accountIdentity(b) === identity);
    if (existing) mapping.set(a.id, existing.id);
    else if (maxAccounts < 0 || local.length < maxAccounts) { local.push(a); mapping.set(a.id, a.id); }
  }
  const remap = value => Object.fromEntries(Object.entries(value || {}).map(([id, v]) => [mapping.get(id) || id, v]));
  const changes = new Map([['accounts.json', local]]);
  for (const name of RECORDS.filter(n => n !== 'account-index.json')) {
    let value = read(path.join(records, name), null); if (value === null) continue;
    const old = read(path.join(dataDir, name), null);
    if (name === 'conversation-notes.json') {
      const notes = [...(old?.notes || [])], keys = new Set(notes.map(n => n.accountId + '|' + n.chatKey));
      for (const n of value.notes || []) { const note = { ...n, accountId: mapping.get(n.accountId) || n.accountId }; if (!keys.has(note.accountId + '|' + note.chatKey)) { notes.push(note); keys.add(note.accountId + '|' + note.chatKey); } }
      value = { version: 1, notes };
    } else if (name === 'contacts.json') value = Object.fromEntries([...new Set([...Object.keys(value), ...Object.keys(old || {})])].map(k => [k, mergeById(old?.[k] || [], value[k] || [])]));
    else if (name === 'account-contacts.json') value = { ...remap(value), ...old };
    else if (name === 'bulk.json') value = { templates: mergeById(old?.templates || [], value.templates || []), lists: mergeById(old?.lists || [], value.lists || []), tasks: old?.tasks || [] };
    else if (name === 'ai-knowledge.json') value = { ...(old || {}), version: 1, bases: mergeById(old?.bases || [], value.bases || []), accounts: { ...remap(value.accounts), ...old?.accounts }, jobs: old?.jobs || [], handled: old?.handled || {}, usage: old?.usage || {} };
    else if (name === 'quick-replies.json') { if (Array.isArray(value)) value = mergeById(old || [], value); else value = { ...value, ...old }; }
    changes.set(name, value);
  }
  // Preserve originals before applying; retry is idempotent if the process stops mid-restore.
  const originals = path.join(dataDir, 'cloud-restore-originals', pending.id); fs.mkdirSync(originals, { recursive: true });
  for (const [name] of changes) { const src = path.join(dataDir, name), dest = path.join(originals, name); if (fs.existsSync(src) && !fs.existsSync(dest)) fs.copyFileSync(src, dest); }
  for (const [source, target] of [['knowledge', 'knowledge-files'], ['quick-media', 'quick-media']]) {
    const dir = path.join(root, source); if (!fs.existsSync(dir)) continue;
    fs.mkdirSync(path.join(dataDir, target), { recursive: true });
    for (const name of fs.readdirSync(dir)) {
      const dest = path.join(dataDir, target, name), src = path.join(dir, name);
      if (!fs.existsSync(dest) && fs.lstatSync(src).isFile()) fs.copyFileSync(src, dest);
    }
  }
  for (const [name, value] of changes) atomic(path.join(dataDir, name), value);
  // Keep the previous archive untouched. The downloaded archive is independently readable.
  if (fs.existsSync(path.join(root, 'archive', 'chat-archive.sqlite'))) {
    const file = path.join(dataDir, 'backup-settings.json');
    const config = read(file, {}); if (fs.existsSync(file) && !fs.existsSync(path.join(originals, 'backup-settings.json'))) fs.copyFileSync(file, path.join(originals, 'backup-settings.json'));
    if (!config.folder) atomic(file, { ...config, folder: path.join(root, 'archive'), enabled: false, automatic: config.automatic !== false, lastRun: 0 });
  }
  fs.unlinkSync(marker); return { imported: true, folder: root };
}
module.exports = { collect, read, atomic, safeAccount, knowledgeExport, applyPending, accountIdentity, mergeById };
