'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict'), crypto = require('crypto');
const { openStore } = require('../server/store');
const { createCloudBackup } = require('../server/cloud-backup');
const { createSyncClient } = process.env.BUSINESS_SYNC_ASAR ? require(path.join(process.env.BUSINESS_SYNC_ASAR, 'cloud-sync-client.js')) : require('../cloud-sync-client');
const { atomic, read } = require('../cloud-data');
const { CHUNK, hash } = require('../cloud-format');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blackcat-business-sync-'));
async function main() {
  const store = openStore(path.join(root, 'server')), objects = new Map();
  const storage = { configured: true, put: async (k,b) => objects.set(k,Buffer.from(b)), get: async k => { if (!objects.has(k)) throw Error('missing'); return objects.get(k); }, delete: async k => objects.delete(k) };
  const cloud = createCloudBackup({ store, storage }), user = { id: 701, plan: 'business' }, other = { id: 702, plan: 'enterprise' };
  let offline = false, duringRead = null;
  function api(device, tenant = user) { return async (route, method = 'GET', body, binary = false) => {
    if (offline) throw Error('offline'); if (duringRead && route === 'sync/exchange') { const fn = duringRead; duringRead = null; fn(); }
    let result, bytes;
    const res = { writeHead() {}, end(b) { bytes = b; } };
    await cloud.route({method},res,new URL('https://fake/api/cloud/'+route),{user:tenant,session:{device_id:device}}, {json:async()=>body,readBody:async()=>body,send:(_r,_status,v)=>{result=v.data;}});
    return binary ? Buffer.from(bytes) : result;
  }; }
  const a = path.join(root, 'a'), b = path.join(root, 'b'); fs.mkdirSync(a); fs.mkdirSync(b);
  const account = { id:'old-wa',name:'MH',platform:'whatsapp',self:{phone:'+60 111 000 222'} };
  atomic(path.join(a,'accounts.json'),[account]); atomic(path.join(b,'accounts.json'),[]);
  atomic(path.join(a,'contacts.json'),{whatsapp:Array.from({length:125},(_,i)=>({id:'c'+i,name:'Customer '+i,phone:'601000'+String(i).padStart(6,'0')}))});
  atomic(path.join(a,'account-contacts.json'),{'old-wa':{at:123,identity:{platform:'whatsapp',phone:'60111000222'},list:[{phone:'60999999999',name:'Account customer'}]}});
  atomic(path.join(a,'bulk.json'),{templates:[{id:'g1',name:'Welcome',items:[{id:'t1',text:'Hello',files:[{file:'hello.mp4',name:'Video'}]}]}],lists:[{id:'l1',platform:'whatsapp',name:'Customers',rows:[['60112222']],columns:['phone']}],tasks:[{id:'running-job',state:'running'}]});
  atomic(path.join(a,'conversation-notes.json'),{version:1,notes:[{accountId:'old-wa',chatKey:'wa:customer',title:'Amy',text:'original',updatedAt:1}]});
  atomic(path.join(a,'ai-knowledge.json'),{version:1,bases:[{id:'kb1',name:'FAQ',status:'ready',documents:[{id:'doc1',file:'doc.txt',status:'ready',cards:[{topic:'Hours',content:'9 to 5'}],connection:'private-machine-secret'}]}],accounts:{'old-wa':{enabled:true,knowledgeBaseIds:['kb1'],instructions:'Be concise'}},jobs:[{id:'private-job'}],handled:{},usage:{}});
  fs.mkdirSync(path.join(a,'knowledge-files'));fs.writeFileSync(path.join(a,'knowledge-files','doc.txt'),'learned content');fs.mkdirSync(path.join(a,'quick-media')); const video=crypto.randomBytes(CHUNK+75);fs.writeFileSync(path.join(a,'quick-media','hello.mp4'),video);
  const changed=[]; const clientA=createSyncClient({dataDir:a,owner:'company',device:'device-a',request:api('device-a')});
  const clientB=createSyncClient({dataDir:b,owner:'company',device:'device-b',request:api('device-b'),onApplied:files=>changed.push(...files)});
  for(let i=0;i<4;i++)await clientA.cycle(); await clientB.cycle(); assert.equal(read(path.join(b,'bulk.json'),{}).lists[0].id,'l1','critical data loads before all contacts'); for(let i=0;i<5&&clientB.status().more;i++)await clientB.cycle();
  assert.equal(read(path.join(b,'contacts.json'),{}).whatsapp.length,125,'pagination loads every contact');
  assert.equal(read(path.join(b,'accounts.json'),[]).length,0,'sync does not create platform sessions');
  assert.equal(read(path.join(b,'bulk.json'),{}).templates[0].items[0].text,'Hello');assert.deepEqual(read(path.join(b,'bulk.json'),{}).tasks,[],'no sending jobs migrate');
  assert(fs.readFileSync(path.join(b,'quick-media','hello.mp4')).equals(video));
  let knowledge=read(path.join(b,'ai-knowledge.json'),{});assert.equal(knowledge.bases[0].documents[0].connection,undefined);assert.equal(knowledge.bases[0].documents[0].cards[0].content,'9 to 5');assert.equal(Object.values(knowledge.accounts)[0].enabled,false,'new computer never auto enables AI');
  assert.equal(read(path.join(b,'conversation-notes.json'),{}).notes[0].text,'original');
  atomic(path.join(b,'accounts.json'),[{...account,id:'new-wa',name:'Other display name'}]);await clientB.cycle();await clientA.cycle();await clientB.cycle();
  assert.equal(read(path.join(b,'conversation-notes.json'),{}).notes[0].accountId,'new-wa','notes follow account identity after relogin');
  assert.deepEqual(read(path.join(b,'account-contacts.json'),{}),{},'account contacts never travel');assert.equal(read(path.join(a,'account-contacts.json'),{})['old-wa'].list.length,1,'local account cache preserved');assert.equal(read(path.join(b,'ai-knowledge.json'),{}).accounts['new-wa'].enabled,false);
  assert.equal((await clientA.cycle()).sent,0,'no per-device naming echo');assert.equal((await clientB.cycle()).sent,0);
  // Unrelated edits made offline merge instead of replacing an entire JSON file.
  let ca=read(path.join(a,'contacts.json'),{});ca.whatsapp[0].name='Edited A';atomic(path.join(a,'contacts.json'),ca);
  let bulk=read(path.join(b,'bulk.json'),{});bulk.lists[0].name='Edited B';atomic(path.join(b,'bulk.json'),bulk);
  offline=true;await assert.rejects(clientA.cycle(),/offline/);offline=false;await clientA.cycle();await clientB.cycle();await clientA.cycle();
  assert.equal(read(path.join(b,'contacts.json'),{}).whatsapp.find(c=>c.id==='c0').name,'Edited A');assert.equal(read(path.join(a,'bulk.json'),{}).lists[0].name,'Edited B');
  // Deletions propagate, and unchanged old records never resurrect.
  ca=read(path.join(a,'contacts.json'),{});ca.whatsapp=ca.whatsapp.filter(c=>c.id!=='c1');atomic(path.join(a,'contacts.json'),ca);await clientA.cycle();await clientB.cycle();assert(!read(path.join(b,'contacts.json'),{}).whatsapp.some(c=>c.id==='c1'));
  const c=path.join(root,'c');fs.mkdirSync(c);atomic(path.join(c,'contacts.json'),{whatsapp:[{id:'c1',phone:'601000000001',name:'stale copy'}]});await createSyncClient({dataDir:c,owner:'company',device:'device-c',request:api('device-c')}).cycle();assert(!read(path.join(c,'contacts.json'),{}).whatsapp.some(c=>c.id==='c1'));
  // Saving during a network wait must win locally, then upload on the next pass.
  ca=read(path.join(a,'contacts.json'),{});ca.whatsapp.find(c=>c.id==='c2').name='Remote A';atomic(path.join(a,'contacts.json'),ca);await clientA.cycle();
  duringRead=()=>{const x=read(path.join(b,'contacts.json'),{});x.whatsapp.find(c=>c.id==='c2').name='Local edit during download';atomic(path.join(b,'contacts.json'),x);};await clientB.cycle();assert.equal(read(path.join(b,'contacts.json'),{}).whatsapp.find(c=>c.id==='c2').name,'Local edit during download');assert(clientB.status().pending>0);await clientB.cycle();await clientA.cycle();assert.equal(read(path.join(a,'contacts.json'),{}).whatsapp.find(c=>c.id==='c2').name,'Local edit during download');
  assert.equal((await api('x',other)('sync/exchange','POST',{since:0,changes:[]})).rows.length,0,'tenant isolation');
  await assert.rejects(api('x',{id:703,plan:'pro'})('sync/exchange','POST',{since:0,changes:[]}),/Business/);
  store.db.prepare('UPDATE cloud_chunks SET created=0').run();await cloud.clean(user);assert([...objects.values()].some(v=>v.equals(video.subarray(0,CHUNK))),'current sync media survives GC');
  // A deleted platform account is reattached by phone on a different computer.
  const db=store.db;db.prepare('INSERT INTO cloud_archive_accounts VALUES(?,?,?,?,?,?,?)').run(user.id,'archived-wa','Old MH','whatsapp','60111000222','',123);
  db.prepare('INSERT INTO cloud_archive_chats VALUES(?,?,?,?,?,?,?)').run(user.id,'archived-wa','chat1','Amy','','','observed');db.prepare('INSERT INTO cloud_archive_messages VALUES(?,?,?,?,?,?,?,?)').run(user.id,'archived-wa','chat1','m1',JSON.stringify({id:'m1',text:'history'}),1,1,'old-point');
  await api('device-b')('archive/accounts-active','POST',{accounts:[{id:'new-wa',platform:'whatsapp',name:'MH',me:{phone:'60111000222'}}]});
  const archived=(await api('device-b')('archive/accounts'))[0];assert.equal(archived.isDeleted,false);assert.equal(archived.messages,1);assert.equal(archived.id,'archived-wa');
  await api('device-b')('archive/accounts-active','POST',{accounts:[{id:'new-wa',platform:'whatsapp',name:'Another actual WA account',me:{phone:'60155556666'}}]});
  const reassigned=store.db.prepare('SELECT account FROM cloud_archive_aliases WHERE user_id=? AND device=? AND local_id=?').get(user.id,'device-b','new-wa');assert.notEqual(reassigned.account,'archived-wa','another phone in a reused session must never inherit the old account history');
  assert(changed.includes('conversation-notes.json'));assert.equal((await api('device-a')('state')).snapshots.length,0,'continuous sync creates no recovery points');
  // Existing recovery data migrates automatically, without downloading/importing on the PC.
  const legacyUser = { id:704,plan:'business' }, legacyAPI=api('legacy-device',legacyUser), legacyAccount={...account,id:'legacy-wa',me:{phone:'60111000222'}};
  const legacyRecords = {
    'account-index.json':[legacyAccount],
    'contacts.json':{whatsapp:[{id:'old-contact',phone:'60188889999',name:'Legacy customer'}]},
    'conversation-notes.json':{version:1,notes:[{accountId:'legacy-wa',chatKey:'wa:customer',text:'legacy note',updatedAt:1}]},
    'ai-knowledge.json':{version:1,bases:[{id:'legacy-base',name:'Already learned',status:'ready',documents:[{id:'legacy-doc',file:'old.txt',cards:[{content:'known answer'}],status:'ready'}]}],accounts:{},jobs:[]}
  };
  const manifest={version:1,accounts:[legacyAccount],files:[]};
  for(const [name,value]of Object.entries(legacyRecords).concat([['knowledge/old.txt','original source']])){const bytes=Buffer.from(name.startsWith('knowledge/')?value:JSON.stringify(value)),h=hash(bytes);await cloud.put(legacyUser,h,bytes);manifest.files.push({path:name.startsWith('knowledge/')?name:'records/'+name,size:bytes.length,hash:h,chunks:[{hash:h,size:bytes.length}]});}
  await cloud.snapshot(legacyUser,{device_id:'legacy-device'},{manifest,label:'Old PC'});
  const migrated=path.join(root,'migrated');fs.mkdirSync(migrated);atomic(path.join(migrated,'accounts.json'),[{...legacyAccount,id:'new-legacy',self:legacyAccount.me}]);atomic(path.join(migrated,'conversation-notes.json'),{version:1,notes:[{accountId:'new-legacy',chatKey:'wa:customer',text:'newer local note',updatedAt:2}]});
  const migrationClient=createSyncClient({dataDir:migrated,owner:'legacy',device:'new-device',request:legacyAPI});for(let i=0;i<5;i++){await migrationClient.cycle();await new Promise(r=>setImmediate(r));}
  assert.equal(read(path.join(migrated,'contacts.json'),{}).whatsapp[0].name,'Legacy customer');assert.equal(fs.readFileSync(path.join(migrated,'knowledge-files','old.txt'),'utf8'),'original source');assert.equal(read(path.join(migrated,'conversation-notes.json'),{}).notes[0].text,'newer local note','initial migration preserves unsynced newer local work');
  assert.equal((await legacyAPI('sync/prepare','POST',{})).migrating,false,'completed legacy migration is idempotent');
  console.log('PASS: two-computer live sync, pagination, contacts/lists/templates/knowledge/notes, media integrity, relogin identity remapping, local edits during download, offline retry, tombstones, tenant isolation, no tasks/secrets/AI enablement migration, no recovery points.');
  store.close();
}
module.exports = main().catch(e=>{console.error(e);process.exitCode=1;});
