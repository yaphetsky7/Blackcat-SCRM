'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { hash } = require('../cloud-format');const Timeline=require('../backup-timeline');
function createCloudArchive({ db, getChunk, importDir = os.tmpdir() }) {
  db.exec(`CREATE TABLE IF NOT EXISTS cloud_archive_accounts(user_id INTEGER,id TEXT,name TEXT,platform TEXT,phone TEXT,username TEXT,deleted_at INTEGER DEFAULT 0,PRIMARY KEY(user_id,id));
    CREATE TABLE IF NOT EXISTS cloud_archive_aliases(user_id INTEGER,device TEXT,local_id TEXT,account TEXT,PRIMARY KEY(user_id,device,local_id));
    CREATE TABLE IF NOT EXISTS cloud_archive_chats(user_id INTEGER,account TEXT,key TEXT,title TEXT,phone TEXT,username TEXT,coverage TEXT,PRIMARY KEY(user_id,account,key));
    CREATE TABLE IF NOT EXISTS cloud_archive_messages(user_id INTEGER,account TEXT,chat TEXT,id TEXT,data TEXT,first_seen INTEGER,source_seen INTEGER,point TEXT,PRIMARY KEY(user_id,account,chat,id));
    CREATE INDEX IF NOT EXISTS cloud_archive_message_chat ON cloud_archive_messages(user_id,account,chat,first_seen);
    CREATE TABLE IF NOT EXISTS cloud_archive_assets(user_id INTEGER,id TEXT,account TEXT,chat TEXT,message TEXT,slot TEXT,data TEXT,point TEXT,PRIMARY KEY(user_id,id));
    CREATE INDEX IF NOT EXISTS cloud_archive_asset_message ON cloud_archive_assets(user_id,account,chat,message);
    CREATE TABLE IF NOT EXISTS cloud_archive_deleted(user_id INTEGER,account TEXT,chat TEXT,id TEXT,PRIMARY KEY(user_id,account,chat,id));
    CREATE TABLE IF NOT EXISTS cloud_archive_chat_status(user_id INTEGER,account TEXT,chat TEXT,error TEXT,seen INTEGER,PRIMARY KEY(user_id,account,chat));
    CREATE TABLE IF NOT EXISTS cloud_archive_chat_deleted(user_id INTEGER,account TEXT,chat TEXT,PRIMARY KEY(user_id,account,chat));`);
  const one = (s, ...p) => db.prepare(s).get(...p), run = (s, ...p) => db.prepare(s).run(...p), all = (s, ...p) => db.prepare(s).all(...p);
  const imports = new Map();
  function accountId(user, device, a) {
    const phone = String(a.me?.phone || a.phone || '').replace(/\D/g, ''), username = String(a.me?.username || a.username || '').replace(/^@/, '');
    const alias = one('SELECT account FROM cloud_archive_aliases WHERE user_id=? AND device=? AND local_id=?', user.id, device, a.id);
    const matched = phone || username ? one("SELECT id FROM cloud_archive_accounts WHERE user_id=? AND platform=? AND ((phone!='' AND phone=?) OR (username!='' AND lower(username)=lower(?) AND (?='' OR phone=''))) ORDER BY CASE WHEN phone=? AND phone!='' THEN 0 ELSE 1 END LIMIT 1", user.id, a.platform, phone, username, phone, phone) : null;
    const prior = alias && one('SELECT * FROM cloud_archive_accounts WHERE user_id=? AND id=?', user.id, alias.account);
    const compatible = prior && prior.platform === a.platform && (!phone || !prior.phone || phone === prior.phone) && (phone || !username || !prior.username || username.toLowerCase() === prior.username.toLowerCase());
    const id = matched?.id || (compatible ? alias.account : null) || crypto.randomUUID();
    // Old chat segments cannot overwrite a newer live account lifecycle decision.
    run(`INSERT INTO cloud_archive_accounts VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,phone=CASE WHEN excluded.phone!='' THEN excluded.phone ELSE phone END,username=CASE WHEN excluded.username!='' THEN excluded.username ELSE username END`, user.id, id, String(a.name || a.id), a.platform, phone, username, Number(a.deletedAt) || 0);
    run('INSERT OR REPLACE INTO cloud_archive_aliases VALUES(?,?,?,?)', user.id, device, a.id, id);
    return id;
  }
  function importPoint(user, point) {
    const key = JSON.stringify([user.id, point.id]);
    if (imports.has(key)) return imports.get(key);
    // Downloads may overlap. The database transaction below has no awaits,
    // so commits stay serial without blocking fresh chats behind old R2 reads.
    const pending = performImport(user, point).finally(() => { if (imports.get(key) === pending) imports.delete(key); });
    imports.set(key, pending);
    return pending;
  }
  async function performImport(user, point) {
    if (one('SELECT status FROM cloud_primary_points WHERE user_id=? AND id=?', user.id, point.id)?.status === 'ready') return { imported: true };
    const m = typeof point.manifest === 'string' ? JSON.parse(point.manifest) : point.manifest;
    const file = m.files.find(f => f.path === 'archive/chat-archive.sqlite');
    if (!file) return { imported: false };
    if (file.size > 128e6) throw Error('历史归档超过单次云端整理大小，请分账号迁移；原备份已保留');
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
            const existing=one('SELECT coverage FROM cloud_archive_chats WHERE user_id=? AND account=? AND key=?',user.id,target,c.key);
            if(!messages.length&&!existing&&one("SELECT 1 FROM cloud_archive_chat_deleted WHERE user_id=? AND account=? AND chat IN (?, '*')",user.id,target,c.key))continue;
            const identity = has('chat_identities') ? from.prepare('SELECT * FROM chat_identities WHERE account=? AND chat=?').get(a.id, c.key) : {};
            run(`INSERT INTO cloud_archive_chats VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,account,key) DO UPDATE SET title=excluded.title,phone=CASE WHEN excluded.phone!='' THEN excluded.phone ELSE phone END,username=CASE WHEN excluded.username!='' THEN excluded.username ELSE username END,coverage=CASE WHEN excluded.coverage='listed' THEN coverage ELSE excluded.coverage END`, user.id, target, c.key, c.title, identity?.phone || '', identity?.username || '', c.coverage || 'observed');
            if(!existing||c.coverage!=='listed')run('INSERT INTO cloud_archive_chat_status VALUES(?,?,?,?,?) ON CONFLICT(user_id,account,chat) DO UPDATE SET error=CASE WHEN excluded.seen>=seen THEN excluded.error ELSE error END,seen=MAX(seen,excluded.seen)',user.id,target,c.key,c.error||'',Number(c.seen)||point.created||0);
            // Only exact aliases confirmed by the source may remove empty list placeholders.
            // Never move message bodies based on a matching customer title.
            if(has('chat_aliases'))for(const alias of from.prepare('SELECT listKey FROM chat_aliases WHERE account=? AND chatKey=?').all(a.id,c.key)){if(alias.listKey===c.key)continue;const empty=!one('SELECT 1 FROM cloud_archive_messages WHERE user_id=? AND account=? AND chat=?',user.id,target,alias.listKey)&&!one('SELECT 1 FROM cloud_archive_assets WHERE user_id=? AND account=? AND chat=?',user.id,target,alias.listKey);if(empty){run('DELETE FROM cloud_archive_chats WHERE user_id=? AND account=? AND key=?',user.id,target,alias.listKey);run('DELETE FROM cloud_archive_chat_status WHERE user_id=? AND account=? AND chat=?',user.id,target,alias.listKey);}}
            for (const r of messages) {
              const content = JSON.parse(r.data); // Corrupt content must never be acknowledged as uploaded.
              // A retry may contain only a local media placeholder: retain the full text's R2 point.
              if (content.cloudTextSynced) {
                if (one('SELECT 1 FROM cloud_archive_messages WHERE user_id=? AND account=? AND chat=? AND id=?', user.id, target, c.key, r.id)) continue;
                throw Error('聊天正文尚未确认存入云端，不能只同步媒体占位记录');
              }
              const prior=one('SELECT data,point,source_seen FROM cloud_archive_messages WHERE user_id=? AND account=? AND chat=? AND id=?',user.id,target,c.key,r.id),priorData=prior?JSON.parse(prior.data):null,merged=Timeline.mergeMessage(priorData,content),qualityUpgrade=merged.sourceConfidence==='telegram-cache'&&priorData?.sourceConfidence!=='telegram-cache',keptBody=priorData&&merged.text!==content.text,bodyPoint=keptBody?prior.point:point.id;run(`INSERT INTO cloud_archive_messages VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,account,chat,id) DO UPDATE SET data=CASE WHEN ? OR excluded.source_seen>=source_seen THEN excluded.data ELSE data END,source_seen=MAX(source_seen,excluded.source_seen),point=CASE WHEN ? OR excluded.source_seen>=source_seen THEN excluded.point ELSE point END`,user.id,target,c.key,r.id,JSON.stringify(merged),r.firstSeen,r.lastSeen,bodyPoint,qualityUpgrade?1:0,qualityUpgrade?1:0);
              const saved=one('SELECT data FROM cloud_archive_messages WHERE user_id=? AND account=? AND chat=? AND id=?',user.id,target,c.key,r.id),canonical=JSON.parse(saved.data);for(const asset of all('SELECT id,data FROM cloud_archive_assets WHERE user_id=? AND account=? AND chat=? AND message=?',user.id,target,c.key,r.id)){const data=JSON.parse(asset.data);if(!Timeline.assetMismatch(canonical,data,priorData))continue;const next={...data,status:'unavailable',error:'原附件与源消息对应关系待重新确认'};delete next.file;run('UPDATE cloud_archive_assets SET data=?,point=? WHERE user_id=? AND id=?',JSON.stringify(next),point.id,user.id,asset.id);}

            }
            const ids = new Set(messages.map(r => r.id));
            for (const asset of (assetsByChat.get(key) || []).filter(s => ids.has(s.message)).sort((a,b)=>(a.status==='superseded'?0:1)-(b.status==='superseded'?0:1))) {
              const id = hash(JSON.stringify([target, c.key, asset.message, asset.slot])), descriptor = descriptors.get('archive/' + asset.path);
              const data = { id, slot:asset.slot,kind: asset.kind, name: asset.name, status: asset.status, quality: asset.quality, mime: asset.mime, size: asset.size, error: asset.error, ...(descriptor&&asset.status!=='superseded' ? { file: descriptor } : {}) };
              const canonicalMessage=one('SELECT data FROM cloud_archive_messages WHERE user_id=? AND account=? AND chat=? AND id=?',user.id,target,c.key,asset.message),source=JSON.parse(canonicalMessage?.data||'{}'),infoList=(source.mediaManifest||[]).filter(m=>m.kind===asset.kind),info=infoList.find(m=>String(m.slot)===String(asset.slot))||(infoList.length===1?infoList[0]:null);if(info?.sourceMediaId&&data.status==='saved'&&data.quality==='download-link')data.sourceMediaId=info.sourceMediaId;
              if (data.status === 'saved' && (!descriptor || descriptor.size !== asset.size)) { data.status = 'unavailable'; data.error = '原附件尚未同步到云端'; }
              const old = one('SELECT data FROM cloud_archive_assets WHERE user_id=? AND id=?', user.id, id);
              if (old) { const prior = JSON.parse(old.data); if (data.status!=='superseded'&&prior.status === 'saved' && (data.status !== 'saved' || prior.quality === 'download-link' && data.quality !== 'download-link')) continue; }
              run('INSERT OR REPLACE INTO cloud_archive_assets VALUES(?,?,?,?,?,?,?,?)', user.id, id, target, c.key, asset.message, asset.slot, JSON.stringify(data), point.id);
            }
            for(const row of messages){const canonical=one('SELECT data FROM cloud_archive_messages WHERE user_id=? AND account=? AND chat=? AND id=?',user.id,target,c.key,row.id),source=JSON.parse(canonical?.data||row.data);if(!source.sourceMediaComplete)continue;const expected=source.sourceMediaKinds||[],imported=(assetsByChat.get(key)||[]).filter(a=>a.message===row.id&&a.status!=='superseded');for(const kind of ['image','video','audio','file','sticker','emoji','link-preview']){const count=expected.filter(k=>k===kind).length,originals=imported.filter(a=>a.kind===kind&&a.status==='saved'&&(a.quality==='download-link'||['emoji','link-preview'].includes(kind))&&!Timeline.assetMismatch(source,a));if(count&&originals.length!==count)continue;const keep=new Set(originals.map(a=>hash(JSON.stringify([target,c.key,a.message,a.slot]))));for(const asset of all('SELECT id,data FROM cloud_archive_assets WHERE user_id=? AND account=? AND chat=? AND message=?',user.id,target,c.key,row.id)){const data=JSON.parse(asset.data);if(data.kind!==kind||keep.has(asset.id)||data.status==='superseded')continue;const next={...data,status:'superseded',error:'已按源消息清单重新核对'};delete next.file;run('UPDATE cloud_archive_assets SET data=?,point=? WHERE user_id=? AND id=?',JSON.stringify(next),point.id,user.id,asset.id);}}}
            for(const row of messages){const canonical=one('SELECT data FROM cloud_archive_messages WHERE user_id=? AND account=? AND chat=? AND id=?',user.id,target,c.key,row.id),message=JSON.parse(canonical?.data||row.data);for(const asset of all('SELECT id,data FROM cloud_archive_assets WHERE user_id=? AND account=? AND chat=? AND message=?',user.id,target,c.key,row.id)){const data=JSON.parse(asset.data);if(!Timeline.assetMismatch(message,data))continue;const next={...data,status:'unavailable',error:'原附件与源消息对应关系待重新确认'};delete next.file;run('UPDATE cloud_archive_assets SET data=?,point=? WHERE user_id=? AND id=?',JSON.stringify(next),point.id,user.id,asset.id);}}


          }
        }
        run(`INSERT INTO cloud_primary_points VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status='ready'`, point.id, user.id, point.device, point.label || '', point.created || Date.now(), point.bytes || file.size, JSON.stringify({ ...m, files: m.files.filter(f => f.path.startsWith('archive/') || f.path === 'records/account-index.json') }), 'ready');
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      prune(user); return { imported: true, messages: rows.length };
    } finally { from?.close(); try { await fs.promises.unlink(temp); } catch {} }
  }
  function prune(user) {
    // A migrated legacy snapshot still needs its ready receipt after newer
    // segments replace its last message, or opening the viewer imports it again.
    const legacy = one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='cloud_snapshots'");
    run("DELETE FROM cloud_primary_points WHERE user_id=? AND status='ready' AND id NOT IN(SELECT point FROM cloud_archive_messages WHERE user_id=? UNION SELECT point FROM cloud_archive_assets WHERE user_id=?)" + (legacy ? ' AND id NOT IN(SELECT id FROM cloud_snapshots WHERE user_id=?)' : ''), ...[user.id, user.id, user.id, ...(legacy ? [user.id] : [])]);
  }
  function reactivate(user, device, accounts) {
    let restored = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const a of accounts) {
        if (!a || typeof a.id !== 'string' || !['whatsapp','telegram','line','facebook','tiktok','wechat','zalo','x'].includes(a.platform)) continue;
        const phone = String(a.me?.phone || a.self?.phone || '').replace(/\D/g, ''), username = String(a.me?.username || a.self?.username || '').replace(/^@/, '').toLowerCase();
        if (!phone && !username) continue;
        const target = accountId(user, device, { ...a, me: { phone, username } });
        const duplicates = all("SELECT id FROM cloud_archive_accounts WHERE user_id=? AND platform=? AND id!=? AND ((phone!='' AND phone=?) OR (username!='' AND lower(username)=? AND (?='' OR phone='')))", user.id, a.platform, target, phone, username, phone);
        for (const duplicate of duplicates) {
          for (const c of all('SELECT * FROM cloud_archive_chats WHERE user_id=? AND account=?', user.id, duplicate.id)) run('INSERT OR IGNORE INTO cloud_archive_chats VALUES(?,?,?,?,?,?,?)', user.id, target, c.key, c.title, c.phone, c.username, c.coverage);
          for (const m of all('SELECT * FROM cloud_archive_messages WHERE user_id=? AND account=?', user.id, duplicate.id)) run(`INSERT INTO cloud_archive_messages VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,account,chat,id) DO UPDATE SET data=CASE WHEN excluded.source_seen>source_seen THEN excluded.data ELSE data END,point=CASE WHEN excluded.source_seen>source_seen THEN excluded.point ELSE point END,source_seen=MAX(source_seen,excluded.source_seen)`, user.id, target, m.chat, m.id, m.data, m.first_seen, m.source_seen, m.point);
          for (const asset of all('SELECT * FROM cloud_archive_assets WHERE user_id=? AND account=?', user.id, duplicate.id)) { const id = hash(JSON.stringify([target, asset.chat, asset.message, asset.slot])), data = { ...JSON.parse(asset.data), id }; run('INSERT OR IGNORE INTO cloud_archive_assets VALUES(?,?,?,?,?,?,?,?)', user.id, id, target, asset.chat, asset.message, asset.slot, JSON.stringify(data), asset.point); }
          run('INSERT OR IGNORE INTO cloud_archive_deleted SELECT user_id,?,chat,id FROM cloud_archive_deleted WHERE user_id=? AND account=?', target, user.id, duplicate.id);
          run('INSERT OR IGNORE INTO cloud_archive_chat_status SELECT user_id,?,chat,error,seen FROM cloud_archive_chat_status WHERE user_id=? AND account=?',target,user.id,duplicate.id);
          run('INSERT OR IGNORE INTO cloud_archive_chat_deleted SELECT user_id,?,chat FROM cloud_archive_chat_deleted WHERE user_id=? AND account=?',target,user.id,duplicate.id);
          for (const table of ['cloud_archive_messages','cloud_archive_assets','cloud_archive_chats','cloud_archive_deleted','cloud_archive_chat_status','cloud_archive_chat_deleted']) run('DELETE FROM ' + table + ' WHERE user_id=? AND account=?', user.id, duplicate.id);
          run('UPDATE cloud_archive_aliases SET account=? WHERE user_id=? AND account=?', target, user.id, duplicate.id);
          run('DELETE FROM cloud_archive_accounts WHERE user_id=? AND id=?', user.id, duplicate.id);
        }
        run('UPDATE cloud_archive_accounts SET deleted_at=0 WHERE user_id=? AND id=?', user.id, target); restored++;
      }
      db.exec('COMMIT'); return { restored };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  function accounts(user) { return all(`SELECT a.*,a.deleted_at AS deletedAt,(SELECT COUNT(*) FROM cloud_archive_chats c WHERE c.user_id=a.user_id AND c.account=a.id) chats,(SELECT COUNT(*) FROM cloud_archive_messages m WHERE m.user_id=a.user_id AND m.account=a.id) messages FROM cloud_archive_accounts a WHERE user_id=? AND EXISTS(SELECT 1 FROM cloud_archive_chats c WHERE c.user_id=a.user_id AND c.account=a.id) ORDER BY name,id`, user.id).map(a => ({ ...a, isDeleted: !!a.deletedAt, identity: a.phone ? '+' + a.phone : a.username ? '@' + a.username : '', ...(a.deletedAt ? { displayName: (a.phone || a.username || a.name) + ' · ' + new Date(a.deletedAt).toISOString() } : {}) })); }
  function listChats(user, account) { return all(`SELECT c.*,(SELECT s.error FROM cloud_archive_chat_status s WHERE s.user_id=c.user_id AND s.account=c.account AND s.chat=c.key) error,(SELECT MAX(json_extract(m.data,'$.sourceExpectedMessages')) FROM cloud_archive_messages m WHERE m.user_id=c.user_id AND m.account=c.account AND m.chat=c.key) sourceExpectedMessages,(SELECT COUNT(*) FROM cloud_archive_messages m WHERE m.user_id=c.user_id AND m.account=c.account AND m.chat=c.key) messages,(SELECT COUNT(*) FROM cloud_archive_assets a WHERE a.user_id=c.user_id AND a.account=c.account AND a.chat=c.key AND json_extract(a.data,'$.status')='saved' AND json_extract(a.data,'$.quality')='download-link') originals,(SELECT COUNT(*) FROM cloud_archive_assets a WHERE a.user_id=c.user_id AND a.account=c.account AND a.chat=c.key AND json_extract(a.data,'$.status')='saved' AND json_extract(a.data,'$.kind') NOT IN ('emoji','link-preview') AND json_extract(a.data,'$.quality')='page') previews,(SELECT COUNT(*) FROM cloud_archive_assets a WHERE a.user_id=c.user_id AND a.account=c.account AND a.chat=c.key AND json_extract(a.data,'$.status') NOT IN ('saved','superseded')) pendingAssets FROM cloud_archive_chats c WHERE user_id=? AND account=? ORDER BY title,key`, user.id, account); }
  function messages(user, r) {
    const offset = Math.max(0, Math.trunc(Number(r.offset) || 0)), account = String(r.accountId || ''), chat = String(r.chatKey || '');
    const order=Timeline.storedOrder(db,'cloud_archive_messages','user_id=? AND account=? AND chat=?',[user.id,account,chat],'first_seen'),end=Math.max(0,order.ids.length-offset),ids=order.ids.slice(Math.max(0,end-200),end);
    const rows=ids.map(id=>one('SELECT * FROM cloud_archive_messages WHERE user_id=? AND account=? AND chat=? AND id=?',user.id,account,chat,id));
    const total = one('SELECT COUNT(*) n FROM cloud_archive_messages WHERE user_id=? AND account=? AND chat=?', user.id, account, chat).n;
    return { messages: rows.map(r => ({ ...JSON.parse(r.data), assets: all("SELECT data FROM cloud_archive_assets WHERE user_id=? AND account=? AND chat=? AND message=? AND json_extract(data,'$.status')!='superseded' ORDER BY slot", user.id, account, chat, r.id).map(a => { const { file, ...info } = JSON.parse(a.data); return info; }) })), total, hasMore: total > offset + rows.length, orderVerified:order.verified,orderConflicts:order.conflicts };
  }
  function asset(user, id) { const row = one('SELECT data FROM cloud_archive_assets WHERE user_id=? AND id=?', user.id, id); if (!row) throw Object.assign(Error('找不到云端附件'), { status: 404 }); return JSON.parse(row.data); }
  function remove(user, r) {
    if (!['account','chat'].includes(r.scope)) throw Error('请选择云端账号或客户');
    const account = String(r.accountId), params = r.scope === 'chat' ? [user.id, account, String(r.chatKey)] : [user.id, account], where = r.scope === 'chat' ? 'user_id=? AND account=? AND chat=?' : 'user_id=? AND account=?';
    db.exec('BEGIN'); try {
      run('INSERT OR IGNORE INTO cloud_archive_deleted SELECT user_id,account,chat,id FROM cloud_archive_messages WHERE ' + where, ...params);
      for (const table of ['cloud_archive_messages','cloud_archive_assets']) run('DELETE FROM ' + table + ' WHERE ' + where, ...params);
      run('DELETE FROM cloud_archive_chats WHERE ' + (r.scope === 'chat' ? 'user_id=? AND account=? AND key=?' : 'user_id=? AND account=?'), ...params);
      run('INSERT OR IGNORE INTO cloud_archive_chat_deleted VALUES(?,?,?)',user.id,account,r.scope==='chat'?String(r.chatKey):'*');
      run('DELETE FROM cloud_archive_chat_status WHERE '+where,...params);
      // Keep the hidden account identity so old segments still hit its deletion receipts.
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    prune(user); return { removed: true };
  }
  return { importPoint, accounts, listChats, messages, asset, remove, reactivate, markDeleted: (user, id) => run('UPDATE cloud_archive_accounts SET deleted_at=? WHERE user_id=? AND id=?', Date.now(), user.id, id), alias: (user, device, id) => one('SELECT account FROM cloud_archive_aliases WHERE user_id=? AND device=? AND local_id=?', user.id, device, id)?.account };
}
module.exports = { createCloudArchive };
