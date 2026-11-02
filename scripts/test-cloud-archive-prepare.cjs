'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {openStore}=require('../server/store'),{createCloudBackup}=require('../server/cloud-backup'),{hash}=require('../cloud-format');
async function main(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blackcat-archive-prepare-')),store=openStore(root),user={id:888,plan:'business'};let release,reads=0;const gate=new Promise(r=>release=r),bytes=Buffer.from('synthetic incomplete archive'),h=hash(bytes);
 const cloud=createCloudBackup({store,storage:{configured:true,get:async()=>{reads++;await gate;return bytes;},put:async()=>{},delete:async()=>{}}});
 store.db.prepare('INSERT INTO cloud_chunks VALUES(?,?,?,?,?)').run(user.id,h,bytes.length,'ready',Date.now());
 const manifest={version:1,accounts:[],files:[{path:'archive/chat-archive.sqlite',size:bytes.length,hash:h,chunks:[{hash:h,size:bytes.length}]}]};
 store.db.prepare('INSERT INTO cloud_snapshots VALUES(?,?,?,?,?,?,?)').run('fixture-point',user.id,'old','Fixture',1,bytes.length,JSON.stringify(manifest));
 const api=async route=>{let data;await cloud.route({method:route==='archive/prepare'?'POST':'GET'},{},new URL('https://fixture/api/cloud/'+route),{user,session:{device_id:'fixture'}},{send:(_r,_s,v)=>data=v.data});return data;};
 assert.equal((await api('archive/prepare')).preparing,true,'HTTP completes before slow archive download');assert.deepEqual(await api('archive/accounts'),[],'existing browser remains available');await api('archive/prepare');for(let i=0;i<100&&!reads;i++)await new Promise(r=>setTimeout(r,2));assert.equal(reads,1,'repeated opens do not duplicate imports');release();for(let i=0;i<20;i++)await new Promise(r=>setTimeout(r,2));
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM cloud_snapshots').get().n,1,'failed historical import retains original backup');
 store.close();console.log('PASS: historical archive preparation is nonblocking, coalesces repeat opens, keeps browser usable and retains malformed originals.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
