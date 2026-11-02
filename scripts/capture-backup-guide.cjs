'use strict';
// Isolated documentation screenshots: actual UI components with synthetic data only.
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.setPath('userData',path.join(app.getPath('temp'),'blackcat-guide-capture-'+process.pid));
const root=path.resolve(__dirname,'..'),out=process.env.GUIDE_CAPTURE_OUTPUT;
if(!out)throw Error('GUIDE_CAPTURE_OUTPUT required');
app.whenReady().then(async()=>{
 fs.mkdirSync(out,{recursive:true});const source=fs.readFileSync(path.join(root,'renderer/index.html'),'utf8'),style=fs.readFileSync(path.join(root,'renderer/style.css'),'utf8'),i18n=fs.readFileSync(path.join(root,'renderer/i18n.js'),'utf8');
 const win=new BrowserWindow({show:false,frame:false,useContentSize:true,width:1040,height:1500,webPreferences:{nodeIntegration:false,contextIsolation:true}});
 try{for(const lang of ['zh','en'])for(const mode of ['local','cloud']){
  const start=source.indexOf('<section id="settings-'+(mode==='local'?'backup':'cloud')+'"'),end=source.indexOf('</section>',start)+10,section=source.slice(start,end).replace(' hidden','');
  const english=lang==='en',now=Date.parse('2026-11-03T02:00:00Z'),state={eligible:true,configured:true,usedBytes:2400000000,quotaBytes:100e9,trial:true,automatic:true,captureEnabled:true,primaryLastRun:now,pendingMessages:0,businessSync:{lastRun:now,counts:{contact:248,list:4,template:16,knowledge:2,note:38}}};
  const head='<header class="app-settings-head"><div><p class="picker-eyebrow">BLACKCAT SCRM · '+(english?'DEMO DATA':'演示资料')+'</p><h2>'+(english?'Settings':'设置')+'</h2></div></header><div class="app-settings-tabs"><button '+(mode==='local'?'class="active"':'')+' data-settings-tab="backup">'+(english?'Local backup':'本地备份')+'</button><button '+(mode==='cloud'?'class="active"':'')+' data-settings-tab="cloud">'+(english?'Cloud sync':'云备份')+'</button></div>';
  const api='window.api={cloud:async()=>({ok:true,data:'+JSON.stringify(state)+'}),onCloudChanged(){},onBusinessChanged(){},onBackupChanged(){}};';
  const localTranslations=fs.readFileSync(path.join(root,'renderer/backup.js'),'utf8').match(/window\.I18N\?\.extend\((\{.*?\})\);/s)[1];
  const code=mode==='cloud'?fs.readFileSync(path.join(root,'renderer/cloud-sync-ui.js'),'utf8'):'';
  const html='<!doctype html><html data-theme="light"><meta charset="utf-8"><style>'+style+'\nbody{display:block;height:auto;overflow:visible;padding:22px;background:#f4f6fa}#app-settings-dialog{display:block;position:static;margin:0;width:996px;max-width:none;max-height:none;overflow:visible;padding:24px;border-radius:18px}#settings-backup{padding-top:12px}.app-settings-tabs{margin-bottom:16px}#cloud-cleanup{display:none}</style><div id="app-settings-dialog">'+head+section+'</div><script>'+api+'</script><script>'+i18n+'</script><script>window.I18N.extend('+localTranslations+');window.I18N.extend({"查看备份对话":"View backed-up chats","打开账号备份文件":"Open account backup file","每个账号一个 .blackcat 文件，包含该账号全部已备份的客户对话、消息和附件，可在黑猫中打开查看。":"Each account has a .blackcat file containing its backed-up conversations, messages and attachments. Open it in BlackCat to browse."});window.I18N.setLocale("'+(english?'en':'zh-CN')+'");</script><script>'+code+'</script></html>';
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  if(mode==='cloud')await win.webContents.executeJavaScript('document.querySelector("[data-settings-tab=cloud]").click()');
  else await win.webContents.executeJavaScript(`(()=>{for(const id of ['backup-enabled','backup-auto'])document.getElementById(id).checked=true;document.getElementById('backup-idle').value='2';document.getElementById('backup-path').textContent=${JSON.stringify('D:\\BlackCat\\Backups')};document.getElementById('backup-progress').textContent=${JSON.stringify(english?'Backup complete · Demo data':'备份完成 · 演示资料')};document.getElementById('backup-counts').textContent=${JSON.stringify(english?'3 accounts · 128 conversations · 8,420 messages · 396 media files':'3 个账号 · 128 个对话 · 8,420 条消息 · 396 个媒体文件')};document.getElementById('backup-last').textContent=${JSON.stringify(english?'Last completed: 3 Nov 2026, 10:00 AM':'上次完成：2026年11月3日 10:00')};document.getElementById('backup-bundles').textContent='WA_Sales01_+60100000000.blackcat';document.getElementById('backup-accounts').textContent=${JSON.stringify(english?'Select an account to import an official history export.':'选择账号，补充平台官方历史导出。')};})()`);
  await new Promise(r=>setTimeout(r,200));const bounds=await win.webContents.executeJavaScript('({height:Math.ceil(document.getElementById("app-settings-dialog").getBoundingClientRect().bottom+22),scroll:document.documentElement.scrollWidth})');
  if(bounds.scroll>1040)throw Error('Screenshot horizontal overflow');win.setContentSize(1040,Math.max(800,bounds.height));await new Promise(r=>setTimeout(r,150));
  fs.writeFileSync(path.join(out,lang+'-'+mode+'.jpg'),(await win.webContents.capturePage()).toJPEG(92));
  if(mode==='cloud') { const boxes=await win.webContents.executeJavaScript('[...document.querySelectorAll(".cloud-primary-box")].map(e=>{const r=e.getBoundingClientRect();return{top:Math.floor(r.top),bottom:Math.ceil(r.bottom)}})');
    fs.writeFileSync(path.join(out,lang+'-cloud-chats.jpg'),(await win.webContents.capturePage({x:0,y:0,width:1040,height:boxes[0].bottom+22})).toJPEG(92));
    const top=boxes[1].top-22;fs.writeFileSync(path.join(out,lang+'-cloud-workspace.jpg'),(await win.webContents.capturePage({x:0,y:top,width:1040,height:bounds.height-top})).toJPEG(92));
  }
  console.log(lang,mode,1040,bounds.height);
 }}finally{win.destroy();app.quit();}
}).catch(e=>{console.error(e);app.exit(1);});
