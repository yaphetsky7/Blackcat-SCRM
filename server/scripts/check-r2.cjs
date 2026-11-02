'use strict';
const fs = require('fs'), crypto = require('crypto');
const { createR2 } = require('../r2');
async function main() {
  const env = { ...process.env };
  if (env.R2_CHECK_ENV) for (const line of fs.readFileSync(env.R2_CHECK_ENV, 'utf8').split('\n')) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i)] = line.slice(i + 1); }
  const r2 = createR2(env); if (!r2.configured) throw Error('R2 configuration is incomplete');
  const bytes = crypto.randomBytes(32), key = 'connection-check/' + crypto.randomUUID();
  try { await r2.put(key, bytes); if (!(await r2.get(key)).equals(bytes)) throw Error('R2 read-back validation failed'); }
  finally { await r2.delete(key); }
  console.log('PASS: private R2 write, read-back checksum, delete. No customer data uploaded.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
