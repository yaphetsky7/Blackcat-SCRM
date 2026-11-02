'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
app.setPath('userData', path.join(app.getPath('temp'), 'blackcat-global-knowledge-' + process.pid));
app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '').replace(/<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*>/gi, '');
  const hub = fs.readFileSync(path.join(root, 'renderer/hub.js'), 'utf8');
  const setup = `
    const $=id=>document.getElementById(id);let accounts=[],fixtureActive=null,currentPlatform='whatsapp',accountListPlatform=null;const views={},status={},unread={};
    const PLATFORMS={whatsapp:{label:'WhatsApp',icon:''},tiktok:{label:'TikTok',icon:'',nativeOnly:true}};
    const searchEl={value:''},settingsEl={hidden:true};const findAcc=id=>accounts.find(a=>a.id===id),activeId=()=>fixtureActive,platformOf=a=>PLATFORMS[a.platform];
    const renderRail=()=>{},renderList=()=>{},renderViews=()=>{},updateViewActivity=()=>{},pushTranslate=()=>{},setSidePanel=()=>{},closeSettings=()=>{},activate=id=>fixtureActive=id;
    window.fixtureErrors=[];const toast=(s)=>window.fixtureErrors.push(s);window.I18N={locale:'zh-CN',extend(){},t:s=>s,apply(){}};window.blackcatAccountsReady=true;window.fixtureContactsOnline=0;window.onAccountOnline=()=>window.fixtureContactsOnline++;
    let fixtureAI={keySet:true,bases:[],accounts:{},jobs:[]};window.fixtureCalls=[];
    window.api=new Proxy({aiState:async()=>({ok:true,data:fixtureAI}),getSettings:async()=>({}),storeGet:async()=>null,storeSet:async()=>true,aiCreateBase:async name=>{window.fixtureCalls.push('create');fixtureAI.bases.push({id:'kb-before-login',name,status:'pending',documents:[],cardCount:0});return{ok:true,data:'kb-before-login'}}},{get:(o,p)=>p in o?o[p]:p.startsWith('on')?()=>()=>{}:async()=>({ok:true,data:{}})});
  `;
  const html = source.replace('</head>', '<style>' + fs.readFileSync(path.join(root, 'renderer/style.css'), 'utf8') + '</style></head>').replace('</body>', '<script>' + setup + '</script><script>' + hub + '</script></body>');
  const win = new BrowserWindow({ show: false, width: 1400, height: 950, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  const errors = []; win.webContents.on('console-message', event => { if (event.level === 'error' || event.level === 3) { errors.push(event.message); console.error(event.message); } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)); await new Promise(r => setTimeout(r, 150));
    if (await win.webContents.executeJavaScript('typeof window.inboxController') === 'undefined') throw Error('Hub initialization failed: ' + errors.join('; '));
    await win.webContents.executeJavaScript('$("ai-tool-btn").click();');
    let state = await win.webContents.executeJavaScript('({tab:window.inboxController.getState().tab,title:$("hub-title").textContent,disabled:document.querySelector("[data-ai-tab=ai]").disabled,hidden:$("hub-knowledge").hidden,accountFieldsDisabled:$("ai-account-fields").disabled})');
    assert.equal(state.tab, 'knowledge'); assert.equal(state.title, '知识库'); assert.equal(state.disabled, true); assert.equal(state.hidden, false); assert.equal(state.accountFieldsDisabled, true);
    await win.webContents.executeJavaScript('$("kb-new-name").value="Prepare before adding accounts";$("kb-create").click();'); await new Promise(r => setTimeout(r, 150));
    assert.equal(await win.webContents.executeJavaScript('window.inboxController.getState().aiState.bases.length'), 1);
    await win.webContents.executeJavaScript('accounts.push({id:"wa1",name:"Company",platform:"whatsapp"});fixtureActive="wa1";window.onAccountNavigate("wa1");document.querySelector("[data-ai-tab=ai]").click();');
    state = await win.webContents.executeJavaScript('({tab:window.inboxController.getState().tab,disabled:$("ai-enabled").disabled,id:window.inboxController.getState().selectedAIAccount})'); assert.equal(state.tab, 'ai'); assert.equal(state.disabled, false); assert.equal(state.id, 'wa1');
    await win.webContents.executeJavaScript('window.onAccountOnline("wa1")'); assert.equal(await win.webContents.executeJavaScript('window.fixtureContactsOnline'), 1, 'AI hub must not disable the contacts initial-online sync callback');
    await win.webContents.executeJavaScript('window.openKnowledgeSettings();accounts.push({id:"tk1",name:"Native",platform:"tiktok"});fixtureActive="tk1";window.onAccountNavigate("tk1");');
    assert.equal(await win.webContents.executeJavaScript('window.inboxController.getState().tab'), 'knowledge'); assert.equal(await win.webContents.executeJavaScript('document.querySelector("[data-ai-tab=ai]").disabled'), true);
    console.log('PASS: knowledge opens and can be created before any account; account AI stays disabled until an eligible session is selected; global knowledge remains accessible on native-only platforms.');
  } finally { win.destroy(); app.quit(); }
}).catch(e => { console.error(e); app.exit(1); });
