// Windows labels toasts with a name it caches per app ID (it had cached "Electron"); registering the ID's
// DisplayName and icon makes every toast say 黑猫SCRM, with or without a Start Menu shortcut.
// The source build (npm start) gets its own ID so its electron.exe name never sticks to the installed app
const APP_ID=app=>app.isPackaged?'local.blackcat-crm':'local.blackcat-crm.dev';
function nameForWindows(app){
 try{const path=require('path'),fs=require('fs');const icon=path.join(app.getPath('userData'),'notification-icon.png');
  if(!fs.existsSync(icon))fs.copyFileSync(path.join(__dirname,'assets','blackcat.png'),icon);
  const key='HKCU\\Software\\Classes\\AppUserModelId\\'+APP_ID(app),reg=(v,d)=>require('child_process').execFile('reg',['add',key,'/v',v,'/t','REG_SZ','/d',d,'/f'],{windowsHide:true},()=>{});
  reg('DisplayName',app.isPackaged?'黑猫SCRM':'黑猫SCRM（本地版）');reg('IconUri',icon);}catch{}
}
// Why each message sound played: one line per sound in message-sound-log.txt, with no message content
const SOUND_REASONS={'unread-up':'网页标题的未读数增加','page-notification':'网页发出新消息通知','title-flash':'Telegram 标题闪烁','chat-list':'对话列表显示未读增加','telegram-notification':'Telegram 发出通知（新消息或回应）'};
const SOUND_LOG_LIMIT=256*1024;
const POPUP_PLATFORMS={telegram:'Telegram',facebook:'Messenger',line:'LINE',tiktok:'TikTok',zalo:'Zalo',x:'X'};
function registerDesktopNotifications({app,ipcMain,BrowserWindow,getWindow,getPolicy,loadAccounts,now=Date.now}){
 const last=new Map();
 if(process.platform==='win32'){app.setAppUserModelId(APP_ID(app));nameForWindows(app);}
 const openAccount=(id,chat)=>{const w=getWindow();if(!w||w.isDestroyed())return;if(w.isMinimized())w.restore();w.show();w.focus();w.webContents.send('messages:open-account',id,chat||'');};
 const popups=require('./notification-popups').createPopups({BrowserWindow,ipcMain,onClick:openAccount});
 ipcMain.handle('messages:notify',async(e,r={})=>{
  if(e.sender!==getWindow()?.webContents)return{ok:false};
  // WhatsApp Web shows its own notifications; the other platforms' pages don't, so the app pops up for them
  const account=loadAccounts().find(a=>a.id===r.accountId&&POPUP_PLATFORMS[a.platform]);
  if(!account||getPolicy().notifications===false)return{ok:true,data:false};
  if(!r.id){if(now()-(last.get(account.id)??-Infinity)<300)return{ok:true,data:false};last.set(account.id,now());}
  // Message previews only when the user keeps 提示显示消息内容 on; never attachment URLs
  const clip=(v,n)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,n),text=getPolicy().notificationPreview!==false?clip(r.text,200):'',from=clip(r.from,60),label=POPUP_PLATFORMS[account.platform];
  await popups.show({accountId:account.id,chat:String(r.chat||'').slice(0,40),source:'黑猫SCRM · '+label,title:text?(from?from+' · ':'')+account.name:account.name,body:text||label+' 收到新消息 / New '+label+' message'});
  return{ok:true,data:true};
 });
 ipcMain.handle('messages:sound-log',async(e,r={})=>{
  if(e.sender!==getWindow()?.webContents)return{ok:false};
  const account=loadAccounts().find(a=>a.id===r.accountId);
  if(!account||!SOUND_REASONS[r.reason])return{ok:false};
  const fs=require('fs/promises'),path=require('path'),file=path.join(app.getPath('userData'),'message-sound-log.txt');
  const at=new Date(now()),pad=n=>String(n).padStart(2,'0'),stamp=at.getFullYear()+'-'+pad(at.getMonth()+1)+'-'+pad(at.getDate())+' '+pad(at.getHours())+':'+pad(at.getMinutes())+':'+pad(at.getSeconds());
  const detail=/^[\d→]{1,24}$/.test(String(r.detail||''))?' ('+r.detail+')':'',tone=/^[a-z]{1,12}$/.test(String(r.tone||''))?r.tone:'';
  const line=[stamp,(POPUP_PLATFORMS[account.platform]||'WhatsApp')+' · '+account.name,SOUND_REASONS[r.reason]+detail,tone].join(' | ')+'\n';
  try{
   await fs.appendFile(file,line,'utf8');
   // Keep the newest half once the file passes the limit, starting at a whole line
   const{size}=await fs.stat(file);
   if(size>SOUND_LOG_LIMIT){const text=await fs.readFile(file,'utf8'),rest=text.slice(Math.floor(text.length/2));await fs.writeFile(file,rest.slice(rest.indexOf('\n')+1),'utf8');}
   return{ok:true};
  }catch{return{ok:false};}
 });
 app.on('before-quit',()=>popups.close());
}
module.exports={registerDesktopNotifications,APP_ID};
