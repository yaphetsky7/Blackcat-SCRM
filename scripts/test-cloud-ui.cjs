'use strict';
// Isolated fake-data window. Does not load the app main process or real userData.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { app, BrowserWindow } = require('electron');
app.setPath('userData', path.join(app.getPath('temp'), 'blackcat-cloud-ui-' + process.pid));
app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '..'), html = fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8');
  const section = html.slice(html.indexOf('    <section id="settings-cloud"'), html.indexOf('    <section id="settings-backup"')).replace(' hidden data-i18n-skip', ' data-i18n-skip');
  const style = fs.readFileSync(path.join(root, 'renderer/style.css'), 'utf8');
  const code = fs.readFileSync(path.join(root, 'renderer/cloud-sync-ui.js'), 'utf8');
  const state = { eligible: true, configured: true, usedBytes: 3.5e9, quotaBytes: 100e9, trial: true, automatic: true, snapshots: [{ id: '00000000-0000-4000-8000-000000000000', label: '办公室电脑 / Office PC', bytes: 3.5e9, created: Date.now() }], running: false, businessSync: { cloudCounts:{contact:83},localCounts:{contact:1251,'account-contact':3332,list:1,template:2,knowledge:3,note:5},pendingCounts:{knowledge:3,note:5,list:1,template:2},pending:4495,running:true,progress:{phase:'upload',done:12,total:100},lastRun:Date.now()-600000 } };
  const body = '<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>' + style + '\nbody{display:block;padding:24px;height:auto;overflow:auto}#app-settings-dialog{display:block;position:static;margin:auto;width:780px;max-width:100%}</style></head><body><div id="app-settings-dialog"><div class="app-settings-tabs"><button data-settings-tab="cloud">云备份</button></div>' + section + '</div><script>window.I18N={locale:"zh-CN"};window.api={cloud:async()=>({ok:true,data:' + JSON.stringify(state) + '}),onCloudChanged:()=>{}};</script><script>' + code + '</script></body></html>';
  const win = new BrowserWindow({ show: false, width: 900, height: 900, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(body));
    await win.webContents.executeJavaScript('document.querySelector("[data-settings-tab=cloud]").click();');
    await new Promise(r => setTimeout(r, 150));
    const verify = () => win.webContents.executeJavaScript('({cards:document.querySelectorAll(".cloud-category").length, quota:document.getElementById("cloud-capacity").textContent, scroll:document.documentElement.scrollWidth, width:innerWidth, buttons:[...document.querySelectorAll("#settings-cloud button")].map(b=>({label:b.textContent.trim(),width:b.getBoundingClientRect().width}))})');
    let result = await verify(); assert.equal(result.cards, 5);assert.equal(await win.webContents.executeJavaScript('document.getElementById("cloud-status").textContent.includes("已全部同步")'),false);assert(await win.webContents.executeJavaScript('[...document.querySelectorAll(".cloud-category small")].some(e=>e.textContent.includes("待同步 3"))')); assert.match(result.quota, /100.00 GB/); assert(result.scroll <= result.width); assert(result.buttons.filter(b => b.width > 0).every(b => b.label)); assert.equal(await win.webContents.executeJavaScript('document.getElementById("cloud-automatic").disabled'), false);
    const out = process.env.CLOUD_UI_OUTPUT || app.getPath('temp'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'cloud-backup-light.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript('document.documentElement.dataset.theme="dark";window.I18N.locale="en";window.dispatchEvent(new Event("blackcat:preferences"));');
    result = await verify(); assert(result.buttons.some(b => b.label === 'Sync workspace now')); assert(result.scroll <= result.width);
    fs.writeFileSync(path.join(out, 'cloud-backup-dark.png'), (await win.webContents.capturePage()).toPNG());
    win.setSize(560, 850); await new Promise(r => setTimeout(r, 150)); result = await verify(); assert(result.scroll <= result.width);
    console.log('PASS: cloud settings renders in Chinese/English, light/dark, narrow layout, readable action labels.');
  } finally { win.destroy(); app.quit(); }
}).catch(e => { console.error(e); app.exit(1); });
