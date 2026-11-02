'use strict';
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {createStorageRetry}=require('../server/storage-retry'),{createR2}=require('../server/r2'),{createCloudBackup}=require('../server/cloud-backup'),{openStore}=require('../server/store'),{hash}=require('../cloud-format');
async function main(){
 let calls=0,charges=0;const delays=[];
 const retry=createStorageRetry({beforeAttempt:()=>charges++,wait:async ms=>delays.push(ms)});
 const r2=createR2({R2_GATEWAY_URL:'https://fixture.invalid/api/private-backup',R2_GATEWAY_SECRET:'a'.repeat(64)},async()=>{calls++;return calls<3?new Response('unavailable',{status:503,headers:{'cf-ray':'synthetic-ray'}}):new Response(null,{status:204});});
 await retry('A',()=>r2.put('connection-check/fixture',Buffer.from('data')));assert.equal(calls,3);assert.equal(charges,3);assert.deepEqual(delays,[400,1200]);
 let failures=0;await assert.rejects(retry('B',async()=>{failures++;throw Object.assign(Error('missing'),{upstreamStatus:404});}),/missing/);assert.equal(failures,1,'missing data and credentials never retry');
 let budgetCalls=0;const budget=createStorageRetry({beforeAttempt:()=>{throw Object.assign(Error('trial limit'),{status:429});},wait:async()=>{}});await assert.rejects(budget('A',async()=>budgetCalls++),/trial limit/);assert.equal(budgetCalls,0);
 await assert.rejects(retry('B',async()=>{throw Object.assign(Error('socket'),{cause:{code:'ECONNRESET'}});}),e=>e.status===503&&e.message.includes('待传资料仍保留'));
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blackcat-r2-retry-')),store=openStore(root),objects=new Map(),user={id:820,plan:'business'};let writeCalls=0,readCalls=0,deleteCalls=0;
 const storage={configured:true,put:async(k,b)=>{if(++writeCalls===1)throw Object.assign(Error('gateway 503'),{upstreamStatus:503});objects.set(k,Buffer.from(b));},get:async k=>{if(++readCalls===1)throw Object.assign(Error('gateway 503'),{upstreamStatus:503});return objects.get(k);},delete:async k=>{if(++deleteCalls===1)throw Object.assign(Error('gateway 503'),{upstreamStatus:503});objects.delete(k);}};
 const cloud=createCloudBackup({store,storage}),bytes=Buffer.from('pending customer data'),h=hash(bytes);await cloud.put(user,h,bytes);assert.equal(writeCalls,2);assert((await cloud.get(user,h)).equals(bytes));assert.equal(readCalls,2);
 const counts=Object.fromEntries(store.db.prepare('SELECT kind,count FROM cloud_operations').all().map(r=>[r.kind,r.count]));assert.equal(counts.A,2);assert.equal(counts.B,2,'physical retries count towards free-tier protection');
 store.db.prepare('UPDATE cloud_chunks SET created=0').run();await cloud.clean(user);assert.equal(deleteCalls,2);
 const capped=createCloudBackup({store,storage,env:{R2_MONTHLY_A_LIMIT:'2'}});const extra=Buffer.from('quota must reject before reservation');await assert.rejects(capped.put(user,hash(extra),extra),/保护上限/);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM cloud_chunks').get().n,0);
 store.close();console.log('PASS: 503 retry and eventual success, bounded network retry, permanent errors not retried, per-attempt budget accounting, read/write/delete recovery, reservations retained safely and no reservation on budget rejection.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
