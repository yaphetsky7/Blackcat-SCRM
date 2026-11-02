'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{EventEmitter}=require('events');
const {registerCloud}=require('../cloud-main');
async function main(){
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'blackcat-sync-schedule-')),app=new EventEmitter(),handlers=new Map(),sender={},calls=[];app.getPath=()=>dataDir;app.getVersion=()=> '1.18.0';
 let release;const held=new Promise(r=>release=r),original=global.fetch;
 global.fetch=async url=>{const route=url.split('/api/cloud/')[1];calls.push(route);if(route==='archive/accounts-active')await held;return{ok:true,json:async()=>({ok:true,data:route==='sync/exchange'?{rows:[],cursor:0,more:false,applied:[],conflicts:[]}:{}})};};
 try{
  registerCloud({app,ipcMain:{handle:(name,fn)=>handlers.set(name,fn),on(){}},getWindow:()=>({webContents:sender,isDestroyed:()=>false}),license:{state:()=>({profile:{username:'fixture',plan:'business'}}),limits:()=>({cloudBytes:100e9}),cloudConnection:()=>({server:'https://synthetic.invalid',token:'synthetic'}),loggedIn:()=>false},backupService:{state:()=>({storageMode:'cloud',counts:{messages:0}}),setCloudRecent(){}}});
  sender.send=()=>{};const first=handlers.get('cloud:business-sync')({sender});await new Promise(r=>setImmediate(r));
  const second=await handlers.get('cloud:business-sync')({sender});assert.equal(second.data.running,true);assert.equal(calls.filter(r=>r==='archive/accounts-active').length,1,'slow reconciliation must not queue duplicate requests');release();assert.equal((await first).ok,true);assert.equal(calls.filter(r=>r==='sync/prepare').length,1);
  console.log('PASS: overlapping manual/automatic sync coalesces while slow account reconciliation is pending; no network or messages.');
 }finally{release();global.fetch=original;app.emit('before-quit');}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
