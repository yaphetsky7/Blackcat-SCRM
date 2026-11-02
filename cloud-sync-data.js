'use strict';
// Portable business records. Platform sessions, API secrets and live send jobs never travel.
const { hash } = require('./cloud-format');
const { identity, same, key: contactKey } = require('./contact-restore');
const stable = value => JSON.stringify(sort(value));
function sort(value) { if (Array.isArray(value)) return value.map(sort); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, sort(value[k])])); return value; }
const identityKey = a => { const i = identity(a); return i.phone ? i.platform + ':p:' + i.phone : i.username ? i.platform + ':u:' + i.username : ''; };
const rowKey = row => row.kind + ':' + hash(stable(row.key));
function portableBase(base) {
  const b = structuredClone(base);
  for (const d of b.documents || []) { delete d.connection; delete d.learningProgress; if (d.url) { try { const u = new URL(d.url); u.username = ''; u.password = ''; u.search = ''; d.url = u.href; } catch { delete d.url; } } }
  return b;
}
function filesFor(row) {
  const files = new Set();
  if (row.kind === 'knowledge') for (const d of row.value.documents || []) if (d.file) files.add('knowledge/' + d.file);
  if (['template','quick'].includes(row.kind)) {
    const scan = v => { if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v === 'object') { if (typeof v.file === 'string') files.add('quick-media/' + v.file); Object.values(v).forEach(scan); } }; scan(row.value);
  }
  return [...files];
}
function exportRows(records, device, linked = {}) {
  const rows = new Map(), accounts = records['accounts.json'] || records['account-index.json'] || [];
  const add = row => { const key = rowKey(row), prior = rows.get(key); if (row.kind !== 'note' || !prior || Number(row.value.updatedAt || 0) >= Number(prior.value.updatedAt || 0)) rows.set(key, row); };
  const account = id => accounts.find(a => a.id === id) || linked[id] || { id, platform: 'unknown' };
  const ref = id => { const a = account(id), i = identity(a); return { platform: i.platform, phone: i.phone, username: i.username, key: a.cloudKey || identityKey(a) || 'device:' + device + ':' + id }; };
  for (const [platform, list] of Object.entries(records['contacts.json'] || {})) for (const c of list) {
    const key = contactKey(c); if (key) add({ kind: 'contact', key: [platform, key], platform, value: c });
  }
  for (const [id, cache] of Object.entries(records['account-contacts.json'] || {})) {
    const a = accounts.find(a => a.id === id), i = cache.identity && identity(cache.identity), r = a ? ref(id) : i ? { platform: i.platform, phone: i.phone, username: i.username, key: identityKey(i) || ref(id).key } : ref(id);
    for (const c of cache.list || []) { const key = contactKey(c); if (key) add({ kind: 'account-contact', key: [r.key, key], account: r, value: c }); }
  }
  const bulk = records['bulk.json'] || {};
  for (const group of bulk.templates || []) {
    add({ kind: 'group', key: group.id, value: { ...group, items: undefined } });
    for (const item of group.items || []) add({ kind: 'template', key: item.id, groupId: group.id, value: item });
  }
  for (const list of bulk.lists || []) add({ kind: 'list', key: list.id, value: list });
  for (const note of records['conversation-notes.json']?.notes || []) { const a = ref(note.accountId); add({ kind: 'note', key: [a.key, note.chatKey], account: a, value: { ...note, accountId: undefined } }); }
  const ai = records['ai-knowledge.json'] || {};
  for (const base of ai.bases || []) if (base.status !== 'studying') add({ kind: 'knowledge', key: base.id, value: portableBase(base) });
  for (const [id, config] of Object.entries(ai.accounts || {})) { const a = ref(id); const value = { ...config }; delete value.enabled; add({ kind: 'ai-config', key: a.key, account: a, value }); }
  const quick = records['quick-replies.json'];
  if (quick) { add({ kind: 'quick', key: 'public', value: { mode: quick.mode || 'direct', public: quick.public || [] } }); for (const [id, list] of Object.entries(quick.personal || {})) { const a = ref(id); add({ kind: 'quick', key: a.key, account: a, value: list }); } }
  return rows;
}
function applyRows(records, changes, linked) {
  const touched = new Set(), accounts = records['accounts.json'] || [];
  const list = (name, empty) => records[name] || (records[name] = empty);
  const resolve = r => {
    const account = accounts.find(a => same(identity(a), r));
    const id = account?.id || Object.keys(linked).find(id => linked[id].cloudKey === r.key && !accounts.some(a => a.id === id)) || 'cloud-' + hash(r.key).slice(0, 32);
    linked[id] = { ...r, cloudKey: r.key, id }; return id;
  };
  const replace = (array, predicate, value, deleted) => { const index = array.findIndex(predicate); if (index >= 0) array.splice(index, 1); if (!deleted) array.push(value); };
  for (const { row, deleted } of changes) {
    const { kind, value } = row;
    if (kind === 'contact') { const contacts = list('contacts.json', {}); const array = contacts[row.platform] || (contacts[row.platform] = []); replace(array, c => contactKey(c) === row.key[1], value, deleted); touched.add('contacts.json'); }
    if (kind === 'account-contact') { const cache = list('account-contacts.json', {}), id = resolve(row.account), c = cache[id] || (cache[id] = { list: [], identity: row.account, restored: true, at: 0 }); replace(c.list, v => contactKey(v) === row.key[1], value, deleted); touched.add('account-contacts.json'); }
    if (['group','template','list'].includes(kind)) {
      const bulk = list('bulk.json', { templates: [], lists: [], tasks: [] });
      if (kind === 'list') replace(bulk.lists, v => v.id === row.key, value, deleted);
      if (kind === 'group') { const prior = bulk.templates.find(g => g.id === row.key); replace(bulk.templates, v => v.id === row.key, { ...value, items: prior?.items || [] }, deleted); }
      if (kind === 'template') { for (const g of bulk.templates) g.items = g.items.filter(t => t.id !== row.key); if (!deleted) { let group = bulk.templates.find(g => g.id === row.groupId); if (!group) { group = { id: row.groupId, name: '默认分组', items: [] }; bulk.templates.push(group); } group.items.push(value); } }
      touched.add('bulk.json');
    }
    if (kind === 'note') { const notes = list('conversation-notes.json', { version: 1, notes: [] }); const id = resolve(row.account); replace(notes.notes, n => n.accountId === id && n.chatKey === row.key[1], { ...value, accountId: id }, deleted); touched.add('conversation-notes.json'); }
    if (kind === 'knowledge' || kind === 'ai-config') {
      const ai = list('ai-knowledge.json', { version: 1, bases: [], accounts: {}, jobs: [], handled: {}, usage: {} });
      if (kind === 'knowledge') { const prior = ai.bases.find(b => b.id === row.key); const base = structuredClone(value); for (const doc of base.documents || []) { const local = prior?.documents.find(d => d.id === doc.id); if (local?.connection) doc.connection = local.connection; } replace(ai.bases, b => b.id === row.key, base, deleted); }
      else { const id = resolve(row.account), prior = ai.accounts[id]; if (deleted) delete ai.accounts[id]; else ai.accounts[id] = { ...value, enabled: prior?.enabled === true }; }
      touched.add('ai-knowledge.json');
    }
    if (kind === 'quick') { const quick = list('quick-replies.json', { mode: 'direct', public: [], personal: {} }); if (row.account) { const id = resolve(row.account); if (deleted) delete quick.personal[id]; else quick.personal[id] = value; } else if (!deleted) Object.assign(quick, value); touched.add('quick-replies.json'); }
  }
  return touched;
}
module.exports = { stable, rowKey, exportRows, applyRows, filesFor, identityKey };
