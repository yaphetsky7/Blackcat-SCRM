'use strict';
const { app, BrowserWindow, protocol } = require('electron');
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), { hash } = require('../cloud-format');
app.setPath('userData', path.join(app.getPath('temp'), 'blackcat-media-fixture-' + process.pid));
protocol.registerSchemesAsPrivileged([{ scheme: 'blackcat-cloud', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
app.whenReady().then(async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/csAAAAASUVORK5CYII=', 'base64');
  const descriptor = { size: png.length, hash: hash(png), chunks: [{ hash: hash(png), size: png.length }] };
  const cloud = { owner: () => 'isolated-fixture', request: async route => route === 'archive/prepare' ? { warnings: [] } : route === 'archive/accounts' ? [] : route.startsWith('chunks/') ? png : { id: 'a'.repeat(64), status: 'saved', mime: 'image/png', size: png.length, file: descriptor } };
  const reader = require('../cloud-reader').registerCloudReader({ app, protocol, ipcMain: { handle() {} }, dialog: {}, getWindow: () => null, cloud });
  const source = await reader.execute('open', {}), html = fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8');
  const csp = html.match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0]; assert(csp.includes('media-src file: blackcat-archive: blackcat-cloud:'));
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  try { await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html><head>' + csp + '</head><body><img id="photo" src="blackcat-cloud://' + source.token + '/' + 'a'.repeat(64) + '"></body></html>')); await new Promise(r => setTimeout(r, 150)); assert.equal(await win.webContents.executeJavaScript('document.getElementById("photo").naturalWidth'), 1); console.log('PASS: actual Electron loads cloud images through authenticated protocol under the production CSP; media scheme allowed.'); }
  finally { reader.close(); win.destroy(); app.quit(); }
}).catch(e => { console.error(e); app.exit(1); });
