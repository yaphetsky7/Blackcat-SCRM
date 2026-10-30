// First-time setup: sets the admin password and creates the owner's unlimited-use ID.
// Usage: npm run setup -- [--username boss] [--data ./data]
// Generated passwords are written to <data>/initial-credentials.txt (not printed). Change them after first login.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { openStore } = require('../store');

const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : fallback; };
const dataDir = path.resolve(arg('data', process.env.DATA_DIR || path.join(__dirname, '..', 'data')));
const username = arg('username', 'blackcat-owner');
const password = () => crypto.randomBytes(12).toString('base64url');

const store = openStore(dataDir);
const lines = [`# BlackCat server credentials — created ${new Date().toISOString()}`, '# Keep this file private. Change both passwords after first login, then delete this file.'];
if (!store.setting('admin_hash', '')) {
  const admin = password();
  store.setSetting('admin_hash', store.hashPassword(admin));
  lines.push('', '[admin page  /admin/]', `password = ${admin}`);
} else lines.push('', '[admin page] password already set — unchanged');
if (!store.userByName(username)) {
  const pass = password();
  store.createUser({ username, password: pass, plan: 'enterprise', unlimited: true, expiresAt: Date.UTC(2099, 11, 31), note: '老板专用：无限使用' });
  lines.push('', '[unlimited app ID]', `username = ${username}`, `password = ${pass}`);
} else lines.push('', `[unlimited app ID] ${username} already exists — unchanged`);
store.close();

const file = path.join(dataDir, 'initial-credentials.txt');
fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
console.log('Setup done. Credentials written to:', file);
