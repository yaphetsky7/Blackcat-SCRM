'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const {normalizeLinks}=require('./backup-content');
function messageSignature(m) {
  const metadata=require('./backup-timeline').normalize(m);delete metadata.sourceExpectedMessages;const links=normalizeLinks(m.links);return digest(JSON.stringify({ text: String(m.text || ''), ...(m.service?{service:true}:{}), ...(links.length?{links}:{}), direction: m.direction, author: String(m.author || ''), time: String(m.time || ''), ...metadata, reactions: m.reactions || [], ignored: m.ignoredAssetSlots || [], ignoredImages: m.ignoredImageSlots || [], assets: (m.assets || []).map((a, i) => [a.slot ?? i, a.kind, a.name || '', a.quality || '', Number(a.width) || 0, Number(a.height) || 0]) }));
}
function chatRows(db) {
  return db.prepare(`SELECT c.*,a.name AS accountName,a.platform,i.phone,i.username FROM chats c JOIN accounts a ON a.id=c.account LEFT JOIN chat_identities i ON i.account=c.account AND i.chat=c.key`).all();
}
function headerSignature(c) {
  return digest(JSON.stringify([c.title||'',c.coverage||'',c.error||'',c.phone||'',c.username||'',c.accountName||'',c.platform||'']));
}
function dirtyChatRows(db) {
  const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cloud_chat_ack'").get();
  const receipts=exists?new Map(db.prepare('SELECT * FROM cloud_chat_ack').all().map(c=>[JSON.stringify([c.account,c.chat]),c.hash])):new Map();
  return chatRows(db).filter(c=>require('./backup-platforms').supports(c)&&receipts.get(JSON.stringify([c.account,c.key]))!==headerSignature(c));
}
function pending(root) {
  if (!root || !fs.existsSync(path.join(root, 'chat-archive.sqlite'))) return 0;
  const db = new DatabaseSync(path.join(root, 'chat-archive.sqlite'), { readOnly: true });
  try { return db.prepare("SELECT COUNT(*) n FROM messages m JOIN accounts a ON a.id=m.account WHERE a.platform IN ('whatsapp','telegram')").get().n+dirtyChatRows(db).length; } finally { db.close(); }
}
async function acknowledge({ root, snapshot, dataDir }) {
  const target = path.resolve(root), parent = path.resolve(dataDir, 'cloud-outbox');
  if (path.dirname(target) !== parent || !/^[a-f0-9]{64}$/.test(path.basename(target))) throw Error('待上传缓冲路径不正确');
  const old = new DatabaseSync(snapshot, { readOnly: true }), live = new DatabaseSync(path.join(root, 'chat-archive.sqlite'));
  const assetsSignature = rows => digest(JSON.stringify(rows.map(a => [a.id, a.status, a.path, a.mime, a.size, a.quality]).sort((a, b) => a[0].localeCompare(b[0]))));
  const files = new Set(); let count = 0;
  try {
    live.exec('PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS cloud_ack(account TEXT,chat TEXT,id TEXT,hash TEXT,PRIMARY KEY(account,chat,id)); CREATE TABLE IF NOT EXISTS cloud_chat_ack(account TEXT,chat TEXT,hash TEXT,PRIMARY KEY(account,chat)); CREATE TABLE IF NOT EXISTS cloud_media_ack(account TEXT,chat TEXT,message TEXT,slot TEXT,kind TEXT,data TEXT,PRIMARY KEY(account,chat,message,slot,kind)); BEGIN IMMEDIATE;');
    try {
      const captured = old.prepare('SELECT * FROM messages').all();
      for (const row of captured) {
        const current = live.prepare('SELECT cloud_hash FROM messages WHERE account=? AND chat=? AND id=?').get(row.account, row.chat, row.id);
        if (!current || !row.cloud_hash || current.cloud_hash !== row.cloud_hash) continue;
        const before = old.prepare('SELECT * FROM assets WHERE account=? AND chat=? AND message=?').all(row.account, row.chat, row.id);
        const after = live.prepare('SELECT * FROM assets WHERE account=? AND chat=? AND message=?').all(row.account, row.chat, row.id);
        if (assetsSignature(before) !== assetsSignature(after)) continue;
        live.prepare('INSERT OR REPLACE INTO cloud_ack VALUES(?,?,?,?)').run(row.account, row.chat, row.id, row.cloud_hash);
        const source=JSON.parse(row.data);for(const a of before.filter(a=>a.status==='saved'&&a.quality==='download-link')){const list=(source.mediaManifest||[]).filter(m=>m.kind===a.kind),info=list.find(m=>String(m.slot)===String(a.slot))||(list.length===1?list[0]:null),fileHash=String(a.path||'').match(/([a-f0-9]{64})(?:\.[a-z0-9]+)?$/i)?.[1];if(!info||!fileHash||require('./backup-timeline').assetMismatch(source,a))continue;live.prepare('INSERT OR REPLACE INTO cloud_media_ack VALUES(?,?,?,?,?,?)').run(row.account,row.chat,row.id,String(a.slot),a.kind,JSON.stringify({sourceMediaId:info.sourceMediaId||'',hash:fileHash,size:a.size,name:a.name,mime:a.mime}));}

        if (before.some(a => !['saved','superseded'].includes(a.status) || a.status==='saved'&&!['emoji','link-preview'].includes(a.kind)&&a.quality!=='download-link')) {
          const stub = { ...JSON.parse(row.data), text: '', cloudTextSynced: true };
          live.prepare('UPDATE messages SET data=? WHERE account=? AND chat=? AND id=?').run(JSON.stringify(stub), row.account, row.chat, row.id);
          live.prepare('DELETE FROM revisions WHERE account=? AND chat=? AND id=?').run(row.account, row.chat, row.id);
          continue;
        }
        for (const a of before) if (a.path) files.add(a.path);
        live.prepare('DELETE FROM assets WHERE account=? AND chat=? AND message=?').run(row.account, row.chat, row.id);
        for (const table of ['messages','revisions']) live.prepare('DELETE FROM ' + table + ' WHERE account=? AND chat=? AND id=?').run(row.account, row.chat, row.id);
        count++;
      }
      const currentHeaders=new Map(chatRows(live).map(c=>[JSON.stringify([c.account,c.key]),headerSignature(c)]));
      for(const c of chatRows(old)){const signature=headerSignature(c);if(currentHeaders.get(JSON.stringify([c.account,c.key]))===signature)live.prepare('INSERT OR REPLACE INTO cloud_chat_ack VALUES(?,?,?)').run(c.account,c.key,signature);}
      live.exec('COMMIT');
    } catch (e) { live.exec('ROLLBACK'); throw e; }
    for (const rel of files) {
      if (live.prepare('SELECT 1 FROM assets WHERE path=?').get(rel)) continue;
      const file = path.resolve(root, rel), mediaRoot = path.resolve(root, 'media') + path.sep;
      if (!file.startsWith(mediaRoot)) continue;
      try { await fs.promises.unlink(file); } catch (e) { if (e.code !== 'ENOENT') continue; }
      live.prepare('DELETE FROM files WHERE path=?').run(rel);
    }
    try { live.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch {}
  } finally { old.close(); live.close(); }
  return count;
}
module.exports = { messageSignature, pending, acknowledge, chatRows, headerSignature, dirtyChatRows };
