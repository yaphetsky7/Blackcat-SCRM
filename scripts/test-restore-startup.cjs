'use strict';
// A real cold start using an isolated, synthetic appData directory and a local fake license server.
// No existing BlackCat profile, platform account, customer record or remote service is opened.
const realElectron = require('electron'), { app, safeStorage } = realElectron;
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const stateFile = process.env.CLOUD_STARTUP_STATE_FILE;
if (!stateFile) throw Error('CLOUD_STARTUP_STATE_FILE required');
const preparing = process.argv.includes('--prepare');
const root = preparing ? fs.mkdtempSync(path.join(os.tmpdir(), 'blackcat-cold-restore-')) : JSON.parse(fs.readFileSync(stateFile)).root;
if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('blackcat-cold-restore-')) throw Error('Unsafe fixture directory');
const dataDir = path.join(root, 'BlackCat CRM'); fs.mkdirSync(dataDir, { recursive: true }); app.setPath('appData', root); app.setPath('userData', dataDir);
if (preparing) {
  app.whenReady().then(async () => {
    const server = require('net').createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port; await new Promise(r => server.close(r));
    const profile = { username: 'fixture-owner', plan: 'starter', planName: 'Fixture', expiresAt: Date.now() + 864e5, unlimited: false, points: { total: 8000, plan: 8000, bonus: 0, monthly: 8000, resetAt: Date.now() + 864e5 }, limits: { accounts: 5, devices: 1, kbLimit: 0, features: { translate: true, contacts: true, notes: true, quick: true, bulk: true, backup: true } } };
    const encrypted = safeStorage.isEncryptionAvailable(); const token = encrypted ? 'enc:' + safeStorage.encryptString('fixture-only-token').toString('base64') : 'fixture-only-token';
    fs.writeFileSync(path.join(dataDir, 'license.json'), JSON.stringify({ server: 'http://127.0.0.1:' + port, token, profile, checkedAt: Date.now(), lastUser: profile.username, deviceId: 'fixture' }));
    fs.writeFileSync(path.join(dataDir, 'accounts.json'), '[]');
    const downloaded = path.join(root, 'downloaded'), records = path.join(downloaded, 'records'); fs.mkdirSync(records, { recursive: true });
    fs.writeFileSync(path.join(downloaded, 'complete.json'), '{}'); fs.writeFileSync(path.join(records, 'account-index.json'), '[]');
    fs.writeFileSync(path.join(records, 'contacts.json'), JSON.stringify({ whatsapp: [{ id: 'c1', name: 'Synthetic customer', phone: '60100000000' }] }));
    fs.writeFileSync(path.join(records, 'ai-knowledge.json'), JSON.stringify({ version: 1, bases: [{ id: 'fixture-kb', name: 'Restored fixture knowledge', documents: [], status: 'ready' }], accounts: {}, jobs: [], handled: {}, usage: {} }));
    fs.writeFileSync(path.join(dataDir, 'cloud-pending-restore.json'), JSON.stringify({ id: 'cold-start-fixture', owner: profile.username, folder: downloaded }));
    fs.writeFileSync(stateFile, JSON.stringify({ root, port, profile, encrypted })); console.log('Prepared isolated cold-start restore fixture; encrypted login=' + encrypted); app.quit();
  });
} else {
  const state = JSON.parse(fs.readFileSync(stateFile));
  const server = require('http').createServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, profile: state.profile, catalog: { plans: [] } })); }); server.listen(state.port, '127.0.0.1');
  let done = false; const timeout = setTimeout(() => { if (!done) { console.error('Cold-start test timed out'); app.exit(1); } }, 15000);
  class HiddenWindow extends realElectron.BrowserWindow {
    constructor(options) {
      super({ ...options, show: false });
      this.webContents.once('did-finish-load', async () => {
        if (done) return; done = true;
        try {
          assert(!fs.existsSync(path.join(dataDir, 'cloud-pending-restore.json')), 'the pending restore must be applied on this first cold start');
          assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'contacts.json'))).whatsapp.length, 1);
          const result = await this.webContents.executeJavaScript('Promise.all([window.api.storeGet("contacts"), window.api.aiState()]).then(([contacts,ai])=>({contacts:contacts.whatsapp.length,bases:ai.data.bases.length}))');
          assert.equal(result.contacts, 1); assert.equal(result.bases, 1, 'AI store must load after restore, not cache the empty state before restore');
          console.log('PASS: actual isolated app cold-start decrypts cached login, applies pending restore, and exposes restored contacts and knowledge on the first launch.');
          clearTimeout(timeout); server.close(); app.exit(0);
        } catch (e) { console.error(e); clearTimeout(timeout); server.close(); app.exit(1); }
      });
    }
  }
  const Module = require('module'), load = Module._load; const mocked = new Proxy(realElectron, { get: (target, property) => property === 'BrowserWindow' ? HiddenWindow : Reflect.get(target, property) });
  Module._load = function(name, parent, main) { return name === 'electron' ? mocked : load.call(this, name, parent, main); };
  require(path.resolve(__dirname, '../main.js'));
}
