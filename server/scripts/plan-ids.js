// Creates one login per plan (demo-starter, demo-pro, demo-business, demo-enterprise), valid for one year.
// Usage: npm run plan-ids -- [--data ./data] [--prefix demo]
// Passwords are appended to <data>/plan-accounts.txt (not printed). Existing usernames are left unchanged.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { openStore } = require('../store');

const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : fallback; };
const dataDir = path.resolve(arg('data', process.env.DATA_DIR || path.join(__dirname, '..', 'data')));
const prefix = arg('prefix', 'demo');
const store = openStore(dataDir);
const lines = [`\n# Plan logins — created ${new Date().toISOString()}`];
const yearFromNow = Date.now() + 365 * 864e5;
for (const plan of store.plans()) {
  const username = `${prefix}-${plan.id}`;
  if (store.userByName(username)) { lines.push(`[${plan.name}] ${username} already exists — unchanged`); continue; }
  const password = crypto.randomBytes(9).toString('base64url');
  store.createUser({ username, password, plan: plan.id, expiresAt: yearFromNow, note: `${plan.name} 测试账号` });
  lines.push(`[${plan.name}]`, `username = ${username}`, `password = ${password}`);
}
store.close();
const file = path.join(dataDir, 'plan-accounts.txt');
fs.appendFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
console.log('Plan logins written to:', file);
