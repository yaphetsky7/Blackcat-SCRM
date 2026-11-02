'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const {openStore}=require('../server/store'),{createCloudBackup}=require('../server/cloud-backup'),{atomic,read}=require('../cloud-data'),{hash}=require('../cloud-format');
const {createSyncClient}=process.env.BUSINESS_SYNC_ASAR?require(path.join(process.env.BUSINESS_SYNC_ASAR,'cloud-sync-client.js')):require('../cloud-sync-client');
async function main(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blackcat-backlog-')),store=openStore(path.join(root,'server')),objects=new Map();let active=0,peak=0,held=false,release;
 const gate=new Promise(r=>release=r),storage={configured:true,put:async(k,v)=>{active++;peak=Math.max(peak,active);try{if(held)await gate;await new Promise(r=>setImmediate(r));objects.set(k,Buffer.from(v));}finally{active--; }},get:async k=>objects.get(k),delete:async k=>objects.delete(k)};
 const cloud=createCloudBackup({store,storage}),user={id:980,plan:'business'};
 const api=(device,tenant=user)=>async(route,method='GET',body,binary=false)=>{let data,bytes;await cloud.route({method},{writeHead(){},end:b=>bytes=b},new URL('https://fixture/api/cloud/'+route),{user:tenant,session:{device_id:device}},{json:async()=>body,readBody:async()=>body,send:(_r,_s,v)=>data=v.data});return binary?Buffer.from(bytes):data;};
 const a=path.join(root,'a'),b=path.join(root,'b');fs.mkdirSync(a);fs.mkdirSync(b);const account={id:'wa-a',platform:'whatsapp',name:'Synthetic company',self:{phone:'60100000000'}};
 atomic(path.join(a,'accounts.json'),[account]);atomic(path.join(b,'accounts.json'),[]);
 atomic(path.join(a,'contacts.json'),{telegram:Array.from({length:1251},(_,i)=>({id:'p'+i,username:'synthetic_'+i,name:'Demo '+i}))});
 atomic(path.join(a,'account-contacts.json'),{'wa-a':{identity:{platform:'whatsapp',phone:'60100000000'},list:Array.from({length:3332},(_,i)=>({phone:'601111'+String(i).padStart(6,'0'),name:'Account demo '+i}))}});
 atomic(path.join(a,'bulk.json'),{templates:[{id:'g',name:'Demo group',items:[{id:'t1',text:'Demo one'},{id:'t2',text:'Demo two'}]}],lists:[{id:'l',name:'Demo list',rows:[['60111111111']],columns:['phone']}],tasks:[]});
 atomic(path.join(a,'conversation-notes.json'),{version:1,notes:Array.from({length:5},(_,i)=>({accountId:'wa-a',chatKey:'customer'+i,text:'Demo note '+i,updatedAt:i+1}))});
 atomic(path.join(a,'ai-knowledge.json'),{version:1,bases:Array.from({length:3},(_,i)=>({id:'kb'+i,name:'Demo knowledge '+i,status:'ready',documents:[]})),accounts:{},jobs:[],handled:{},usage:{}});
 const progress=[],ca=createSyncClient({dataDir:a,owner:'company',device:'a',request:api('a'),onProgress:p=>{if(p)progress.push(p);}}),cb=createSyncClient({dataDir:b,owner:'company',device:'b',request:api('b')});
 await ca.cycle();let s=(await api('a')('state')).workspace;
 assert.equal(s.counts.note,5);assert.equal(s.counts.knowledge,3);assert.equal(s.counts.template,2);assert.equal(s.counts.list,1);assert(s.counts.contact<1251,'critical data commits before all contacts');assert(ca.status().pending>1100);assert.equal(ca.status().lastRun,0,'partial batch never reports all synced');assert(progress.some(p=>p.phase==='confirm'));assert(peak>1,'record uploads run concurrently');
 await cb.cycle();assert.equal(read(path.join(b,'bulk.json'),{}).templates[0].items.length,2);assert.equal(read(path.join(b,'bulk.json'),{}).lists.length,1);assert.equal(read(path.join(b,'ai-knowledge.json'),{}).bases.length,3);assert.equal(read(path.join(b,'conversation-notes.json'),{}).notes.length,5,'new PC loads notes immediately while contact pages remain');
 // A hanging historical upload must not hold the prepare HTTP response or current writes.
 const legacy={id:981,plan:'business'},manifest={version:1,accounts:[],files:[]};for(const[name,value]of Object.entries({'contacts.json':{telegram:Array.from({length:500},(_,i)=>({id:'old'+i,username:'old_demo_'+i}))},'bulk.json':{templates:[],lists:[{id:'old-list',name:'Legacy demo',rows:[]}]}})){const bytes=Buffer.from(JSON.stringify(value)),h=hash(bytes);await cloud.put(legacy,h,bytes);manifest.files.push({path:'records/'+name,size:bytes.length,hash:h,chunks:[{hash:h,size:bytes.length}]});}await cloud.snapshot(legacy,{device_id:'old'},{manifest});held=true;
 const prepared=await api('old',legacy)('sync/prepare','POST',{});assert.equal(prepared.migrating,true);await api('other',legacy)('sync/exchange','POST',{since:0,changes:[],priority:true,prioritySince:0});release();held=false;
 for(let i=0;i<1000&&(await api('old',legacy)('sync/status')).migration.running;i++)await new Promise(r=>setImmediate(r));s=await api('old',legacy)('sync/status');assert.equal(s.counts.list,1,'legacy business data also goes before hundreds of contacts');assert(s.counts.contact<=96);assert(s.migration.more,'bounded migration resumes in future batches');
 const before=store.db.prepare('SELECT COUNT(*) n FROM cloud_sync_records').get().n;await assert.rejects(api('a')('sync/exchange','POST',{since:0,changes:[],priority:true,prioritySince:-1}),/游标/);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM cloud_sync_records').get().n,before);
 store.close();console.log('PASS: 1,251 My contacts backlog (3,332 local account contacts excluded) does not starve 3 knowledge bases, 5 notes, 2 templates or 1 list; new PC receives critical records immediately; parallel transport, honest pending counts and bounded nonblocking legacy migration.');
}
module.exports=main().catch(e=>{console.error(e);process.exitCode=1;});
