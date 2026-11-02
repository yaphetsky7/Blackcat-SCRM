'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {openStore}=require('../server/store'),{createCloudBackup}=require('../server/cloud-backup');
const {exportRows,applyRows,rowKey,stable}=require('../cloud-sync-data'),{createSyncClient}=require('../cloud-sync-client'),{atomic,read}=require('../cloud-data'),{hash}=require('../cloud-format');
async function main(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blackcat-my-contacts-')),store=openStore(path.join(root,'server')),objects=new Map(),cloud=createCloudBackup({store,storage:{configured:true,put:async(k,b)=>objects.set(k,Buffer.from(b)),get:async k=>objects.get(k),delete:async k=>objects.delete(k)}}),user={id:881,plan:'business'};
 const api=async(route,method='GET',body,binary=false)=>{let data,bytes;await cloud.route({method},{writeHead(){},end:b=>bytes=b},new URL('https://fixture/api/cloud/'+route),{user,session:{device_id:'fixture'}},{json:async()=>body,readBody:async()=>body,send:(_r,_s,v)=>data=v.data});return binary?bytes:data;};
 const records={'accounts.json':[{id:'wa-a',platform:'whatsapp'},{id:'wa-b',platform:'whatsapp'},{id:'tg-a',platform:'telegram'},{id:'tg-b',platform:'telegram'}],'contacts.json':{whatsapp:[{id:'wa',phone:'60112345678',name:'WA common'}],telegram:[{id:'tg',username:'common',name:'TG common'}]},'account-contacts.json':{'wa-a':{list:[{phone:'60987654321',name:'local cache'}]}}};
 const rows=exportRows(records,'fixture');assert.equal(rows.size,2);assert.deepEqual([...rows.values()].map(r=>r.key[0]).sort(),['telegram','whatsapp']);assert([...rows.values()].every(r=>!r.account));
 const excluded={kind:'account-contact',key:['old-account','p:60987654321'],account:{key:'old-account',platform:'whatsapp'},value:{phone:'60987654321'}};
 const cache=JSON.stringify(records['account-contacts.json']);assert.equal(applyRows(records,[{row:excluded,deleted:false}],{}).size,0);assert.equal(JSON.stringify(records['account-contacts.json']),cache);
 const baseline={cursor:0,rows:{[rowKey(excluded)]:{revision:1,hash:hash(stable(excluded)),row:excluded,deleted:false}}};
 const a=path.join(root,'a'),b=path.join(root,'b');fs.mkdirSync(a);fs.mkdirSync(b);for(const[n,v]of Object.entries(records))atomic(path.join(a,n),v);atomic(path.join(a,'cloud-sync-'+hash('company')+'.json'),baseline);
 const client=createSyncClient({dataDir:a,owner:'company',device:'a',request:api});assert.equal(client.status().pending,2,'old account cache baseline is pruned without tombstones');await client.cycle();assert.equal(client.status().pending,0);assert.equal(JSON.stringify(read(path.join(a,'account-contacts.json'),{})),cache);
 const receiver=createSyncClient({dataDir:b,owner:'company',device:'b',request:api});await receiver.cycle();assert.deepEqual(read(path.join(b,'contacts.json'),{}),records['contacts.json']);assert.deepEqual(read(path.join(b,'account-contacts.json'),{}),{});
 // A still-running older client cannot put an account cache back into sync.
 const oldChange={key:rowKey(excluded),baseRevision:0,deleted:false,descriptor:{invalid:'must be ignored before validation'}};assert.equal((await api('sync/exchange','POST',{since:0,changes:[oldChange]})).applied.length,0);
 assert.equal(store.db.prepare("SELECT COUNT(*) n FROM cloud_sync_records WHERE key LIKE 'account-contact:%'").get().n,0);
 // Legacy snapshots keep their original file, but do not migrate account caches.
 const bytes=Buffer.from(JSON.stringify(records['account-contacts.json'])),h=hash(bytes);await cloud.put(user,h,bytes);await cloud.snapshot(user,{device_id:'old'},{manifest:{version:1,accounts:[],files:[{path:'records/account-contacts.json',size:bytes.length,hash:h,chunks:[{hash:h,size:bytes.length}]}]}});await api('sync/prepare','POST',{});for(let i=0;i<50&&(await api('sync/status')).migration.running;i++)await new Promise(r=>setImmediate(r));assert.equal((await api('sync/status')).migration.more,false);assert.equal(store.db.prepare("SELECT COUNT(*) n FROM cloud_sync_records WHERE key LIKE 'account-contact:%'").get().n,0);
 store.close();console.log('PASS: per-platform shared My contacts, account caches stay local, old baseline pruned, older client fenced, legacy import excludes account caches.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
