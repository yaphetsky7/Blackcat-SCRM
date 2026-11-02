'use strict';
const crypto = require('crypto');
const CHUNK = 4 * 1024 * 1024;
const RECORDS = ['account-index.json', 'conversation-notes.json', 'contacts.json', 'account-contacts.json', 'bulk.json', 'ai-knowledge.json', 'quick-replies.json'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function validPath(value) {
  if (typeof value !== 'string' || value.length > 1000 || /[\\\x00-\x1f:]/.test(value)) return false;
  const parts = value.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) return false;
  return parts.length === 2 && parts[0] === 'records' && RECORDS.includes(parts[1]) ||
    parts.length === 2 && ['knowledge', 'quick-media'].includes(parts[0]) ||
    value === 'archive/chat-archive.sqlite' || parts.length >= 3 && parts[0] === 'archive' && ['media', 'imports'].includes(parts[1]);
}
function validateManifest(m) {
  if (!m || m.version !== 1 || !Array.isArray(m.files) || m.files.length > 200000 || !m.files.length || !Array.isArray(m.accounts) || m.accounts.length > 10000) throw Error('云备份索引格式不正确');
  const paths = new Set(); let total = 0;
  for (const f of m.files) {
    const key = String(f.path).toLowerCase();
    if (!validPath(f.path) || paths.has(key) || !Number.isSafeInteger(f.size) || f.size < 0 || !isHash(f.hash) || !Array.isArray(f.chunks) || f.chunks.length !== Math.ceil(f.size / CHUNK)) throw Error('云备份文件索引不正确');
    paths.add(key); total += f.size;
    for (let i = 0; i < f.chunks.length; i++) {
      const c = f.chunks[i], expected = Math.min(CHUNK, f.size - i * CHUNK);
      if (!isHash(c.hash) || c.size !== expected) throw Error('云备份分块索引不正确');
    }
  }
  if (!Number.isSafeInteger(total)) throw Error('云备份大小不正确');
  return total;
}
module.exports = { CHUNK, RECORDS, hash, isHash, validPath, validateManifest };
