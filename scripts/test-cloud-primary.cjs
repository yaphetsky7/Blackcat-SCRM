'use strict';
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), http = require('http');
const { Worker } = require('worker_threads');
const { openStore } = require('../server/store'), { createCloudBackup } = require('../server/cloud-backup');
const { createArchive } = require('../backup-archive'), { hash, CHUNK } = require('../cloud-format');
const { atomic } = require('../cloud-data');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blackcat-primary-test-'));
async function main() {
  const store = openStore(path.join(root, 'server')), objects = new Map();
  const storage = { configured: true, put: async (k, v) => objects.set(k, Buffer.from(v)), get: async k => { if (!objects.has(k)) throw Error('Missing object'); return objects.get(k); }, delete: async k => objects.delete(k) };
  const cloud = createCloudBackup({ store, storage, env: { R2_TOTAL_LIMIT_BYTES: '50000000' } });
  const user = store.createUser({ username: 'cloud-company', password: 'test-password', plan: 'business' }), other = store.createUser({ username: 'other-company', password: 'test-password', plan: 'enterprise' });
  const server = http.createServer(async (req, res) => {
    const isOther = req.headers.authorization === 'Bearer other';
    const readBody = async (r, limit = 1e6) => { const list = []; let n = 0; for await (const c of r) { n += c.length; if (n > limit) throw Error('Too large'); list.push(c); } return Buffer.concat(list); };
    const send = (r, status, body) => { r.writeHead(status, { 'content-type': 'application/json' }); r.end(JSON.stringify(body)); };
    try { await cloud.route(req, res, new URL(req.url, 'http://localhost'), { user: isOther ? other : user, session: { device_id: req.headers['x-device'] || 'PC1', device_name: 'Fixture PC' } }, { readBody, json: async (r, l) => JSON.parse((await readBody(r, l)).toString()), send }); }
    catch (e) { send(res, e.status || 400, { ok: false, error: e.message }); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const origin = 'http://127.0.0.1:' + server.address().port;
  async function api(route, method = 'GET', body, binary = false, token = 'fixture', signal) { const res = await fetch(origin + '/api/cloud/' + route, { method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal }); if (binary && res.ok) return Buffer.from(await res.arrayBuffer()); const result = await res.json(); if (!res.ok || !result.ok) throw Error(result.error); return result.data; }
  function worker(dataDir, folder, extra = {}) { return new Promise((resolve, reject) => { const stage = fs.mkdtempSync(path.join(dataDir, '.cloud-stage-')); const w = new Worker(process.env.CLOUD_TEST_ASAR ? path.join(process.env.CLOUD_TEST_ASAR, 'cloud-worker.js') : path.resolve(__dirname, '../cloud-worker.js'), { workerData: { action: 'upload', primary: true, archiveOnly: true, acknowledge: true, dataDir, folder, stage, server: origin, token: 'fixture', version: 'test', label: 'PC1', ...extra } }); let result, error; w.on('message', m => { if (m.result) result = m.result; if (m.error) error = Error(m.error); }); w.on('error', reject); w.on('exit', code => error ? reject(error) : code || !result ? reject(Error('Worker failed')) : resolve(result)); }); }
  const dataDir = path.join(root, 'computer'); fs.mkdirSync(dataDir);
  const folder = path.join(dataDir, 'cloud-outbox', hash('cloud-company')); const account = { id: 'local1', platform: 'whatsapp', name: 'MH', self: { phone: '60100000000' } };
  atomic(path.join(dataDir, 'accounts.json'), [account]);
  const outbox = createArchive(folder, { cloudOutbox: true });
  const first = { chat: { key: 'whatsapp:customer', title: 'Amy', phone: '60111111111' }, messages: [{ id: '1', text: 'Cloud first', direction: 'incoming' }, { id: '2', text: 'Video caption', direction: 'outgoing', assets: [{ kind: 'video', name: 'test.mp4', quality: 'download-link', source: 'fixture-local-bytes' }] }] };
  const wanted = outbox.ingest(account, first); assert.equal(wanted.length, 1);
  const video = crypto.randomBytes(CHUNK + 80);video.writeUInt32BE(24,0);video.write('ftyp',4);video.write('isom',8);const sink = outbox.startAsset(wanted[0].id); sink.write(video); const saved = sink.finish('video/mp4', 'download-link');
  try {
    const result = await worker(dataDir, folder); assert.equal(result.primary, true); assert.equal(result.acknowledged, 2);
    assert.equal(outbox.db.prepare('SELECT COUNT(*) n FROM messages').get().n, 0); assert.equal(outbox.db.prepare('SELECT COUNT(*) n FROM cloud_ack').get().n, 2); assert(!fs.existsSync(path.join(folder, saved.path)));
    const accounts = await api('archive/accounts'); assert.equal(accounts.length, 1); assert.equal(accounts[0].messages, 2); assert.equal(accounts[0].identity, '+60100000000');
    assert.equal((await api('archive/accounts', 'GET', undefined, false, 'other')).length, 0);
    const remoteId = accounts[0].id, chats = await api('archive/chats?accountId=' + remoteId); assert.equal(chats[0].phone, '60111111111');assert.equal(chats[0].missingDates,2);assert.equal(chats[0].unverifiedMessages,0);
    const headers=require('../cloud-outbox');
    assert.equal(headers.dirtyChatRows(outbox.db).length,0,'confirmed headers should not upload repeatedly');
    outbox.discover(account,[{key:'unread',title:'Unread customer',phone:'60122222222'},{key:'ambiguous',title:'Shared name',ambiguous:true}]);
    assert.equal(headers.dirtyChatRows(outbox.db).length,2);
    await worker(dataDir,folder);
    let listed=await api('archive/chats?accountId='+remoteId);
    assert.equal(listed.find(c=>c.key==='whatsapp:unread').messages,0,'discovered customers remain visible before reading messages');
    assert.equal(listed.find(c=>c.key==='whatsapp:unread').phone,'60122222222');
    assert.match(listed.find(c=>c.key==='whatsapp:ambiguous').error,/身份/,'ambiguous identity is pending rather than silently omitted');
    assert.equal(headers.dirtyChatRows(outbox.db).length,0);
    outbox.coverage(account.id,'whatsapp:unread','partial','History still loading');await worker(dataDir,folder);
    assert.equal((await api('archive/chats?accountId='+remoteId)).find(c=>c.key==='whatsapp:unread').error,'History still loading','coverage-only changes sync after message acknowledgement');
    outbox.ingest(account,{chat:{key:'whatsapp:exact',listKey:'whatsapp:unread',title:'Unread customer'},messages:[]});await worker(dataDir,folder);
    listed=await api('archive/chats?accountId='+remoteId);
    assert(!listed.some(c=>c.key==='whatsapp:unread'),'only confirmed empty aliases are removed');assert(listed.some(c=>c.key==='whatsapp:exact'));
    await api('archive/delete','POST',{scope:'chat',accountId:remoteId,chatKey:'whatsapp:exact'});
    outbox.coverage(account.id,'whatsapp:exact','partial','Metadata retry');await worker(dataDir,folder);
    assert(!(await api('archive/chats?accountId='+remoteId)).some(c=>c.key==='whatsapp:exact'),'header retries must not resurrect deleted backups');
    const emptyAccount={id:'empty',platform:'telegram',name:'Metadata only',self:{username:'fixture_empty'}};
    atomic(path.join(dataDir,'accounts.json'),[account,emptyAccount]);outbox.discover(emptyAccount,[{key:'#1000',title:'Awaiting scan'}]);await worker(dataDir,folder);
    assert((await api('archive/accounts')).some(a=>a.name==='Metadata only'&&a.messages===0&&a.chats===1),'metadata-only accounts remain visible');
    assert.equal((await api('archive/accounts','GET',undefined,false,'other')).length,0);
    const page = await api('archive/messages?' + new URLSearchParams({ accountId: remoteId, chatKey: first.chat.key })); assert.equal(page.total, 2); assert.equal(page.messages[0].text, 'Cloud first');
    const media = page.messages[1].assets[0]; assert.equal(media.status, 'saved'); const asset = await api('archive/asset?id=' + media.id);
    const restored = Buffer.concat(await Promise.all(asset.file.chunks.map(c => api('chunks/' + c.hash, 'GET', undefined, true)))); assert(restored.equals(video));
    await assert.rejects(api('archive/asset?id=' + media.id, 'GET', undefined, false, 'other'), /找不到/);
    outbox.ingest(account, first); assert.equal(outbox.db.prepare('SELECT COUNT(*) n FROM messages').get().n, 0, 'unchanged messages must not re-enter local storage');
    outbox.ingest(account, { chat: first.chat, messages: [{ id: '3', text: 'Cloud second segment', direction: 'incoming' }] }); await worker(dataDir, folder);
    assert.equal((await api('archive/messages?' + new URLSearchParams({ accountId: remoteId, chatKey: first.chat.key }))).total, 3, 'previous cloud history survives clearing the local buffer');
    store.db.prepare('UPDATE cloud_chunks SET created=0').run(); store.db.prepare('UPDATE cloud_manifests SET created=0').run(); await cloud.clean(user);
    assert((await api('chunks/' + asset.file.chunks[0].hash, 'GET', undefined, true)).equals(video.subarray(0, CHUNK)), 'primary data must survive snapshot GC');
    outbox.ingest(account, { chat: first.chat, messages: [{ id: '6', text: 'Text kept in cloud while original media is missing', direction: 'incoming', assets: [{ kind: 'image', name: 'pending.jpg' }] }] }); await worker(dataDir, folder);
    const stub = JSON.parse(outbox.db.prepare('SELECT data FROM messages WHERE id=?').get('6').data); assert.equal(stub.text, ''); assert.equal(stub.cloudTextSynced, true);
    await worker(dataDir, folder); assert((await api('archive/messages?' + new URLSearchParams({ accountId: remoteId, chatKey: first.chat.key }))).messages.some(m => m.id === '6' && m.text.includes('Text kept in cloud')));
    const protocol = new Map(), handlers = new Map();
    const reader = require('../cloud-reader').registerCloudReader({ app: { whenReady: () => Promise.resolve(), on() {} }, ipcMain: { handle: (k, f) => handlers.set(k, f) }, protocol: { handle: (k, f) => protocol.set(k, f) }, dialog: {}, getWindow: () => null, cloud: { owner: () => 'cloud-company', request: api } });
    const source = await reader.execute('open', {}); const online = await reader.execute('messages', { token: source.token, accountId: remoteId, chatKey: first.chat.key });
    assert(online.messages.find(m => m.id === '2').assets[0].url.startsWith('blackcat-cloud://'));
    const start = CHUNK - 10, end = CHUNK + 10; const ranged = await protocol.get('blackcat-cloud')(new Request('blackcat-cloud://' + source.token + '/' + media.id, { headers: { range: 'bytes=' + start + '-' + end } }));
    assert.equal(ranged.status, 206); assert(Buffer.from(await ranged.arrayBuffer()).equals(video.subarray(start, end + 1))); reader.close();
    const emojiMessage={id:'7',text:'Preview',assets:[{slot:'photo:0',kind:'image',source:'fixture',quality:'page'}]},emojiAsset=outbox.ingest(account,{chat:first.chat,messages:[emojiMessage]})[0],emojiSink=outbox.startAsset(emojiAsset.id);emojiSink.write(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/csAAAAASUVORK5CYII=','base64'));emojiSink.finish('image/png','page');await worker(dataDir,folder);outbox.ingest(account,{chat:first.chat,messages:[{id:'7',text:'👍',sourceConfidence:'telegram-cache',sourceEmoji:true,sourceMediaComplete:true,sourceMediaKinds:[],assets:[]}]});await worker(dataDir,folder);const repairedEmoji=(await api('archive/messages?'+new URLSearchParams({accountId:remoteId,chatKey:first.chat.key}))).messages.find(m=>m.id==='7');assert.equal(repairedEmoji.text,'👍');assert.deepEqual(repairedEmoji.assets,[],'Reclassified emoji images must disappear from cloud history');
    const portrait=outbox.ingest(account,{chat:first.chat,messages:[{id:'avatar-repair',text:'Text message',assets:[{slot:'0',kind:'image',source:'fixture',quality:'page'}]}]})[0],portraitSink=outbox.startAsset(portrait.id);portraitSink.write(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/csAAAAASUVORK5CYII=','base64'));portraitSink.finish('image/png','page');await worker(dataDir,folder);outbox.ingest(account,{chat:first.chat,messages:[{id:'avatar-repair',text:'Text message',sentAt:1793794025000,sourceConfidence:'whatsapp-cache',sourceMediaComplete:true,sourceMediaKinds:[],assets:[]}]});await worker(dataDir,folder);const corrected=(await api('archive/messages?'+new URLSearchParams({accountId:remoteId,chatKey:first.chat.key}))).messages.find(m=>m.id==='avatar-repair');assert.equal(corrected.sentAt,1793794025000);assert.deepEqual(corrected.assets,[],'An authoritative text-only rescan removes old false avatar attachments from cloud rendering');
    await api('archive/delete', 'POST', { scope: 'chat', accountId: remoteId, chatKey: first.chat.key });
    outbox.ingest(account, { chat: first.chat, messages: [{ id: '1', text: 'Old message edited after deletion', direction: 'incoming' }, { id: '4', text: 'New after deletion', direction: 'incoming' }] }); await worker(dataDir, folder);
    const after = await api('archive/messages?' + new URLSearchParams({ accountId: remoteId, chatKey: first.chat.key })); assert.deepEqual(after.messages.map(m => m.id), ['4']);
    outbox.ingest(account, { chat: first.chat, messages: [{ id: '5', text: 'Quota failure must stay pending', direction: 'incoming' }] });
    const originalPut = storage.put; storage.put = async () => { throw Object.assign(Error('Storage full'), { status: 507 }); };
    await assert.rejects(worker(dataDir, folder), /Storage full/); assert(outbox.db.prepare('SELECT 1 FROM messages WHERE id=?').get('5')); storage.put = originalPut;
    await worker(dataDir,folder);await api('archive/delete','POST',{scope:'account',accountId:remoteId});
    outbox.ingest(account,{chat:first.chat,messages:[{id:'4',text:'Old edited replay',direction:'incoming'}]});await worker(dataDir,folder);
    assert(!(await api('archive/accounts')).some(a=>a.id===remoteId),'deleting an account backup preserves hidden identity and prevents replay');
    outbox.ingest(account,{chat:first.chat,messages:[{id:'9',text:'A new capture',direction:'incoming'}]});await worker(dataDir,folder);
    assert.deepEqual((await api('archive/messages?'+new URLSearchParams({accountId:remoteId,chatKey:first.chat.key}))).messages.map(m=>m.id),['9']);
    console.log('PASS: cloud-primary capture, acknowledged buffer removal, no replay, permanent history across segments, cloud viewer/video range streaming, tenant isolation, deletion tombstones, quota/offline retention.');
  } finally { outbox.close(); await new Promise(r => server.close(r)); store.close(); }
}
const completion = main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { const target = path.resolve(root); if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('blackcat-primary-test-')) fs.rmSync(target, { recursive: true, force: true }); });
module.exports = completion;
