const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
// SQLite deletes, file collection and portable media bundles must never block
// Electron's window/IPC thread. Only one maintenance job is admitted by the host.
function runBackupTask(data){return new Promise((resolve,reject)=>{const worker=new Worker(__filename,{workerData:data});let result,error;worker.on('message',m=>{if(m.error)error=new Error(m.error);else result=m.result;});worker.once('error',reject);worker.once('exit',code=>{if(error)reject(error);else if(code!==0)reject(Error('备份后台处理未完成，请重试'));else resolve(result);});});}
async function execute(r){
 const fs=require('fs'),path=require('path'),{DatabaseSync}=require('node:sqlite'),del=require('./backup-delete');
 if(r.action==='delete-bundle'){const db=new DatabaseSync(r.file);try{const result=del.deleteRecords(db,r.request,true);db.exec('VACUUM');return result;}finally{db.close();}}
 const store=require('./backup-archive').createArchive(r.root);
 try{
  let result;
  if(r.action==='delete'){
   result=del.deleteRecords(store.db,r.request);del.removeGeneratedChats(r.root,result);del.removeImportedCopies(r.root,result.imports);result.freedBytes=del.collectUnusedMedia(store);
   if(r.request.scope==='account')del.deleteAccountBundle(r.root,r.request.accountId);
  }
  // Repair known customer identities in old archives as well as future exports.
  if(r.userData){let scoped={},personal={};try{scoped=JSON.parse(fs.readFileSync(path.join(r.userData,'account-contacts.json')));}catch{}try{personal=JSON.parse(fs.readFileSync(path.join(r.userData,'contacts.json')));}catch{}
   const resolve=require('./backup-identities').resolveChatIdentity;
   for(const c of store.db.prepare('SELECT c.*,a.platform FROM chats c JOIN accounts a ON a.id=c.account').all()){
    const old=store.db.prepare('SELECT phone,username FROM chat_identities WHERE account=? AND chat=?').get(c.account,c.key)||{},v=resolve(c.platform,{...c,...old},scoped[c.account]?.list||[],personal[c.platform]||[]);
    if(v.phone||v.username)store.db.prepare('INSERT OR REPLACE INTO chat_identities VALUES(?,?,?,?)').run(c.account,c.key,v.username,v.phone);
   }
  }
  if(r.action!=='bundles')await store.exportFiles(r.notesFile);
  const bundles=await require('./backup-bundle').writeAccountBundles(r.root,r.accounts||[],r.action==='delete'?[r.request.accountId]:undefined);
  return{...result,counts:store.stats(),bundles:bundles.map(b=>({accountId:b.accountId,filename:b.filename}))};
 }finally{store.close();}
}
if(!isMainThread)execute(workerData).then(result=>parentPort.postMessage({result}),e=>parentPort.postMessage({error:String(e.stack||e.message||e)}));
module.exports={runBackupTask};
