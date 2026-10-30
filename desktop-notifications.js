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
function registerDesktopNotifications({app,ipcMain,Notification,getWindow,getPolicy,loadAccounts,now=Date.now}){
 const last=new Map(),open=new Set();
 if(process.platform==='win32'){app.setAppUserModelId(APP_ID(app));nameForWindows(app);}
 ipcMain.handle('messages:notify',(e,r={})=>{
  if(e.sender!==getWindow()?.webContents)return{ok:false};
  const account=loadAccounts().find(a=>a.id===r.accountId&&a.platform==='telegram');
  if(!account||getPolicy().notifications===false||!Notification.isSupported())return{ok:true,data:false};
  if(now()-(last.get(account.id)??-Infinity)<2500)return{ok:true,data:false};last.set(account.id,now());
  // Do not put customer content or private attachment URLs on the lock screen.
  const n=new Notification({title:'黑猫SCRM · '+account.name,body:'Telegram 收到新消息 / New Telegram message',icon:require('path').join(__dirname,'assets/blackcat.ico'),silent:true});open.add(n);
  n.once('close',()=>open.delete(n));n.once('click',()=>{const w=getWindow();if(!w||w.isDestroyed())return;if(w.isMinimized())w.restore();w.show();w.focus();w.webContents.send('messages:open-account',account.id);});n.show();return{ok:true,data:true};
 });
 app.on('before-quit',()=>{for(const n of open)n.close();open.clear();});
}
module.exports={registerDesktopNotifications,APP_ID};
