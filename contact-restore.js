(function(root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.ContactRestore = factory(); })(typeof globalThis === 'object' ? globalThis : this, function() {
  const phone = s => String(s || '').replace(/\D/g, '');
  const username = s => String(s || '').trim().replace(/^@/, '').toLowerCase();
  const key = c => phone(c.phone).length >= 6 ? 'p:' + phone(c.phone) : username(c.username) ? 'u:' + username(c.username) : c.id ? 'id:' + c.id : '';
  function merge(local = [], incoming = []) {
    const result = [], indexes = new Map();
    for (const c of [...local, ...incoming]) {
      const k = key(c); if (!k) continue;
      if (indexes.has(k)) { const i = indexes.get(k), prior = result[i]; result[i] = { ...prior, ...c, id: prior.id || c.id, name: c.name || prior.name || '' }; }
      else { indexes.set(k, result.length); result.push({ ...c }); }
    }
    return result;
  }
  const identity = a => ({ platform: a.platform, phone: phone(a.self?.phone || a.me?.phone || a.phone), username: username(a.self?.username || a.me?.username || a.username), name: a.name || '' });
  const same = (a, b) => a.platform === b.platform && (a.phone && a.phone === b.phone || a.username && a.username === b.username);
  function restoreAccountCaches(saved, local, mapping, sourceAccounts) {
    const result = { ...local };
    for (const [sourceId, incoming] of Object.entries(saved || {})) {
      const id = mapping.get(sourceId) || sourceId, prior = result[id] || {}, source = (sourceAccounts || []).find(a => a.id === sourceId);
      result[id] = { ...incoming, ...prior, list: merge(incoming.list || [], prior.list || []), at: Math.max(Number(prior.at) || 0, Number(incoming.at) || 0), restored: true, identity: source ? identity(source) : incoming.identity || prior.identity };
    }
    return result;
  }
  function rebind(saved, accounts) {
    const result = { ...saved }; let changed = false;
    for (const [id, cache] of Object.entries(saved || {})) {
      if (!cache.restored || !cache.identity) continue;
      const account = accounts.find(a => same(identity(a), cache.identity));
      if (!account || account.id === id) continue;
      const prior = result[account.id] || {};
      const value = { ...cache, ...prior, identity: identity(account), list: merge(cache.list || [], prior.list || []), restored: true };
      if (JSON.stringify(value) !== JSON.stringify(prior)) { result[account.id] = value; changed = true; }
    }
    return { value: result, changed };
  }
  return { key, merge, identity, same, restoreAccountCaches, rebind };
});
