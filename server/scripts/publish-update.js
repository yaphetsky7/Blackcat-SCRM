// Publishes the newest installer in ../dist as the app update (same as admin → 软件更新 → 发布).
// Notes come from BC_NOTES; BC_FORCED=1 makes it a forced update. Used by 推送更新.bat.
const path = require('path');
const { createUpdates } = require('../updates');

const root = path.join(__dirname, '..');
const updates = createUpdates({ dataDir: path.resolve(process.env.DATA_DIR || path.join(root, 'data')), distDir: path.resolve(process.env.DIST_DIR || path.join(root, '..', 'dist')) });
updates.publish({ notes: process.env.BC_NOTES || '', mandatory: process.env.BC_FORCED === '1' })
  .then((r) => console.log(`已发布 v${r.version}${r.minVersion ? '（强制更新）' : ''}。客户的软件会在 3 小时内或重开时自动下载。`))
  .catch((e) => { console.error('发布失败：' + e.message); process.exit(1); });
