'use strict';
const assert = require('assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const restore = require('../contact-restore'), { applyPending, atomic } = require('../cloud-data');
const source = { id: 'old-account', platform: 'whatsapp', name: 'Company', me: { phone: '60100000000' } };
const incoming = { 'old-account': { at: 100, list: [{ phone: '60111111111', name: 'Customer A' }, { phone: '60222222222', name: 'Customer B' }] } };
const mapping = new Map([['old-account','new-account']]);
const merged = restore.restoreAccountCaches(incoming, { 'new-account': { at: 200, list: [] } }, mapping, [source]);
assert.equal(merged['new-account'].list.length, 2, 'empty local cache must not overwrite restored customers');
assert.equal(restore.merge(merged['new-account'].list, []).length, 2, 'empty platform results must preserve restored contacts');
assert.equal(restore.merge(merged['new-account'].list, [{ phone: '+60 1111 11111', name: 'Customer A updated' }]).length, 2);
const rebound = restore.rebind(merged, [{ id: 'fresh-login', platform: 'whatsapp', self: { phone: '+60 1000 00000' } }]);
assert.equal(rebound.value['fresh-login'].list.length, 2, 'restored cache follows identity after login with another local id');
assert.equal(restore.rebind(rebound.value, [{ id: 'fresh-login', platform: 'whatsapp', self: { phone: '+60 1000 00000' } }]).changed, false, 'unchanged account identity does not repeatedly rewrite the contact cache');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blackcat-contacts-restore-'));
try {
  const downloaded = path.join(root, 'download'), target = path.join(root, 'target'); fs.mkdirSync(path.join(downloaded, 'records'), { recursive: true }); fs.mkdirSync(target);
  atomic(path.join(downloaded, 'complete.json'), {}); atomic(path.join(downloaded, 'records/account-index.json'), [source]); atomic(path.join(downloaded, 'records/account-contacts.json'), incoming);
  atomic(path.join(target, 'accounts.json'), [{ id: 'new-account', platform: 'whatsapp', self: { phone: '60100000000' } }]); atomic(path.join(target, 'account-contacts.json'), { 'new-account': { at: 200, list: [] } });
  atomic(path.join(target, 'cloud-pending-restore.json'), { id: 'fixture', folder: downloaded, owner: 'company' });
  const report = applyPending(target, 5, 'company'); assert.equal(report.contacts.whatsapp, 2); assert.equal(report.accountContacts, 2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(target, 'contacts.json'))).whatsapp.length, 2, 'restored customers available in My contacts before platform login');
  assert.equal(JSON.parse(fs.readFileSync(path.join(target, 'account-contacts.json')))['new-account'].list.length, 2);
  console.log('PASS: restored contacts survive empty cache/empty sync, match phone identity across device IDs, appear before platform sign-in, and are counted in the restore report.');
} finally { const dest = path.resolve(root); if (path.dirname(dest) === path.resolve(os.tmpdir()) && path.basename(dest).startsWith('blackcat-contacts-restore-')) fs.rmSync(dest, { recursive: true, force: true }); }
