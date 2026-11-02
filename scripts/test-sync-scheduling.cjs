'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{EventEmitter}=require('events');
const {registerCloud}=require('../cloud-main');
async function main(){
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'blackcat-sync-schedule-')),app=new EventEmitter(),handlers=new Map(),sender={},calls=[];app.getPath=()=>dataDir;app.getVersion=()=> '1.18.0';
 let release,tick;const held=new Promise(r=>release=r),original=global.fetch;
 global.fetch=async url=>{const route=url.split('/api/cloud/')[1];calls.push(route);if(route==='archive/accounts-active')await held;return{ok:true,text:async()=>JSON.stringify({ok:true,data:route==='sync/exchange'?{rows:[],cursor:0,more:false,applied:[],conflicts:[]}:{}})};};
 try{
  registerCloud({app,schedule:fn=>{tick=fn;return{unref(){}};},unschedule(){},makeWorker:()=>{const worker=new EventEmitter();worker.terminate=async()=>worker.emit('exit',0);return worker;},ipcMain:{handle:(name,fn)=>handlers.set(name,fn),on(){}},getWindow:()=>({webContents:sender,isDestroyed:()=>false}),license:{state:()=>({profile:{username:'fixture',plan:'business'}}),limits:()=>({cloudBytes:100e9}),cloudConnection:()=>({server:'https://synthetic.invalid',token:'synthetic'}),loggedIn:()=>true},backupService:{state:()=>({storageMode:'cloud',counts:{messages:1},folder:dataDir}),setCloudRecent(){},useCloud(){},cloudOwner:()=> 'fixture',isBusy:()=>false,localFolder:()=>'',setCloudSyncing(){}}});
  sender.send=()=>{};const first=handlers.get('cloud:business-sync')({sender});await new Promise(r=>setImmediate(r));
  const second=await handlers.get('cloud:business-sync')({sender});assert.equal(second.data.running,true);assert.equal(calls.filter(r=>r==='archive/accounts-active').length,1,'slow reconciliation must not queue duplicate requests');release();assert.equal((await first).ok,true);assert.equal(calls.filter(r=>r==='sync/prepare').length,1);
  assert.equal((await handlers.get('cloud:sync')({sender})).data.started,true);await tick();assert.equal(calls.filter(r=>r==='sync/prepare').length,2,'workspace sync continues while a long chat upload is running');
  console.log('PASS: sync requests coalesce on slow networks, and workspace sync is not blocked by long chat/media uploads; no network or messages.');
 }finally{release();global.fetch=original;app.emit('before-quit');}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
