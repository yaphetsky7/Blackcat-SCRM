'use strict';
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), os = require('os'), { EventEmitter } = require('events');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blackcat-cloud-mode-'));
const handlers = new Map(), app = new EventEmitter(); app.getPath = () => root;
const legacy = path.join(root, 'original-local-backup'); fs.writeFileSync(path.join(root, 'backup-settings.json'), JSON.stringify({ folder: legacy, enabled: false, automatic: false }));
let owner = 'company-a'; const window = { webContents: { send() {} }, isDestroyed: () => false };
const service = require('../backup-main').registerBackup({ app, ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} }, dialog: {}, shell: {}, session: {}, managedGuests: new Map(), getWindow: () => window, loadAccounts: () => [], getCloudOwner: () => owner, schedule: () => ({ unref() {} }), unschedule() {} });
try {
  const state = service.state(); assert.equal(state.storageMode, 'cloud'); assert.equal(state.enabled, true); assert(state.folder.startsWith(path.join(root, 'cloud-outbox'))); assert.equal(service.localFolder(), legacy);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'backup-settings.json'))).folder, legacy, 'original local backup preferences stay untouched');
  const a = state.folder; owner = 'company-b'; const b = service.state().folder; assert.notEqual(a, b, 'different companies never share pending chat buffers');
  owner = ''; const local = service.state(); assert.equal(local.storageMode, 'local'); assert.equal(local.folder, legacy); assert.equal(local.enabled, false);
  console.log('PASS: Business/Enterprise use automatic cloud buffers without folder selection; companies isolated; Starter/Pro retain original local backup preferences.');
} finally { app.emit('before-quit'); const target = path.resolve(root); if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('blackcat-cloud-mode-')) fs.rmSync(target, { recursive: true, force: true }); }
