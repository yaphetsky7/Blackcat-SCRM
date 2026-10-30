const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {DatabaseSync}=require('node:sqlite');const lifecycle=require('./backup-account-lifecycle');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const safe=value=>String(value||'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').trim().slice(0,64);
function accountFileName(account){
  const platform={telegram:'TG',whatsapp:'WA',facebook:'FB',line:'LINE'}[account.platform]||'ACCOUNT';
  const me=account.me||{};const identity=(me.username?'@'+String(me.username).replace(/^@/,''):me.phone?'+'+String(me.phone).replace(/^\+/,''):'ID-'+String(account.id).slice(0,12));
  return [platform,safe(account.name)||'account',safe(identity)].join('_')+'.blackcat';
}
// One portable SQLite file per account. Media is stored in small BLOB chunks,
// so large videos do not require loading an entire file into memory.
async function writeAccountBundles(root,accounts=[],accountIds){
  const from=new DatabaseSync(path.join(root,'chat-archive.sqlite'),{readOnly:true});from.exec('PRAGMA query_only=ON; BEGIN');
  const directory=path.join(root,'accounts');fs.mkdirSync(directory,{recursive:true});let map={};const mapFile=path.join(directory,'accounts.json');try{map=JSON.parse(fs.readFileSync(mapFile));}catch{}
  const used=new Map(Object.entries(map).map(([id,name])=>[String(name).toLowerCase(),id]));const results=[];
  try{for(const saved of from.prepare('SELECT * FROM accounts ORDER BY name,id').iterate()){if(accountIds&&!accountIds.includes(saved.id))continue;
    const current=accounts.find(a=>a.id===saved.id);const account={id:saved.id,name:current?.name||saved.name,platform:saved.platform,me:{username:current?.me?.username||current?.self?.username||'',phone:current?.me?.phone||current?.self?.phone||''}};const deleted=lifecycle.metadata(from,saved.id);if(deleted){account.isDeleted=true;account.deletedAt=deleted.deletedAt;account.me={phone:deleted.phone||account.me.phone,username:deleted.username||account.me.username};}
    let filename=account.isDeleted?'已删除账号备份/'+lifecycle.deletedFileName(account):accountFileName(account);if(used.has(filename.toLowerCase())&&used.get(filename.toLowerCase())!==account.id)filename=filename.replace(/\.blackcat$/, '_'+crypto.createHash('sha256').update(account.id).digest('hex').slice(0,8)+'.blackcat');
    if(fs.existsSync(path.join(directory,filename))){let existing;try{existing=new DatabaseSync(path.join(directory,filename),{readOnly:true});const metadata=existing.prepare('SELECT value FROM meta WHERE key=?').get('account');if(!metadata||JSON.parse(metadata.value).id!==account.id)throw Error('different account');}catch{filename=filename.replace(/\.blackcat$/, '_'+crypto.randomUUID().slice(0,8)+'.blackcat');}finally{existing?.close();}}
    const previous=map[account.id],dest=path.join(directory,filename);if(!path.resolve(dest).startsWith(path.resolve(directory)+path.sep))throw Error('账号备份路径异常');fs.mkdirSync(path.dirname(dest),{recursive:true});
    if(previous&&previous!==filename&&path.resolve(directory,previous).startsWith(path.resolve(directory)+path.sep)&&previous.endsWith('.blackcat')&&fs.existsSync(path.join(directory,previous))&&!fs.existsSync(dest))fs.renameSync(path.join(directory,previous),dest);
    const out=new DatabaseSync(dest);try{
      out.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS deleted_accounts(account TEXT PRIMARY KEY,name TEXT,phone TEXT,username TEXT,deletedAt INTEGER);
        CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);
        CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,name TEXT,platform TEXT);
        CREATE TABLE IF NOT EXISTS chat_identities(account TEXT,chat TEXT,username TEXT,phone TEXT,PRIMARY KEY(account,chat));
        CREATE TABLE IF NOT EXISTS chats(account TEXT,key TEXT,title TEXT,coverage TEXT,error TEXT,seen INTEGER,PRIMARY KEY(account,key));
        CREATE TABLE IF NOT EXISTS messages(account TEXT,chat TEXT,id TEXT,data TEXT,firstSeen INTEGER,lastSeen INTEGER,PRIMARY KEY(account,chat,id));
        CREATE TABLE IF NOT EXISTS revisions(account TEXT,chat TEXT,id TEXT,hash TEXT,data TEXT,seen INTEGER,PRIMARY KEY(account,chat,id,hash));
        CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,account TEXT,chat TEXT,message TEXT,slot TEXT,kind TEXT,name TEXT,status TEXT,quality TEXT,path TEXT,mime TEXT,size INTEGER,error TEXT,width INTEGER,height INTEGER);
        CREATE TABLE IF NOT EXISTS bundle_files(path TEXT PRIMARY KEY,size INTEGER,mime TEXT);
        CREATE TABLE IF NOT EXISTS bundle_chunks(path TEXT,seq INTEGER,data BLOB,PRIMARY KEY(path,seq));`);
      out.exec('BEGIN');try{
        out.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run('format','blackcat-account-v1');out.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run('account',JSON.stringify(account));out.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run('exportedAt',String(Date.now()));
        out.prepare('INSERT OR REPLACE INTO accounts VALUES(?,?,?)').run(account.id,account.name,account.platform);
        for(const table of ['chats','messages','revisions','assets','chat_identities','deleted_accounts']){
          if(!from.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;out.prepare('DELETE FROM '+table+' WHERE account=?').run(account.id);const columns=from.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name);const have=new Set(out.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name));for(const c of columns)if(!have.has(c))out.exec('ALTER TABLE '+table+' ADD COLUMN "'+c.replace(/"/g,'')+'"');const put=out.prepare('INSERT OR REPLACE INTO '+table+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')');let n=0;
          for(const row of from.prepare('SELECT * FROM '+table+' WHERE account=?').iterate(account.id)){put.run(...columns.map(c=>row[c]));if(++n%300===0)await tick();}
        }
        out.exec('COMMIT');
      }catch(e){out.exec('ROLLBACK');throw e;}
      for(const file of from.prepare("SELECT DISTINCT path,size,mime FROM assets WHERE account=? AND status='saved' AND path!=''").iterate(account.id)){
        const prior=out.prepare('SELECT size FROM bundle_files WHERE path=?').get(file.path);if(prior?.size===file.size)continue;
        const full=path.resolve(root,file.path);if(!full.startsWith(path.resolve(root)+path.sep))throw Error('附件路径不正确');
        if(!fs.existsSync(full)){out.prepare("UPDATE assets SET status='unavailable',error=? WHERE path=?").run('原附件文件缺失，请重新下载补存',file.path);continue;}
        out.exec('BEGIN');try{out.prepare('DELETE FROM bundle_chunks WHERE path=?').run(file.path);const put=out.prepare('INSERT INTO bundle_chunks VALUES(?,?,?)');let seq=0,size=0;
          for await(const chunk of fs.createReadStream(full,{highWaterMark:1024*1024})){put.run(file.path,seq++,chunk);size+=chunk.length;await tick();}
          if(size!==file.size)throw Error('附件大小已变化，请重新备份');out.prepare('INSERT OR REPLACE INTO bundle_files VALUES(?,?,?)').run(file.path,size,file.mime);out.exec('COMMIT');
        }catch(e){out.exec('ROLLBACK');throw e;}
      }
      const removed=out.prepare("DELETE FROM bundle_chunks WHERE path NOT IN(SELECT path FROM assets WHERE status='saved')").run().changes;out.exec("DELETE FROM bundle_files WHERE path NOT IN(SELECT path FROM assets WHERE status='saved')");if(removed)out.exec('VACUUM');out.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run('completedAt',String(Date.now()));
    }finally{out.close();}
    map[account.id]=filename;used.set(filename.toLowerCase(),account.id);results.push({accountId:account.id,filename,path:dest});await tick();
  }from.exec('COMMIT');fs.writeFileSync(mapFile+'.tmp',JSON.stringify(map,null,2));fs.renameSync(mapFile+'.tmp',mapFile);return results;
  }finally{from.close();}
}
module.exports={writeAccountBundles,accountFileName};
