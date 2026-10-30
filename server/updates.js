// App updates: the admin publishes an installer built in ../dist; the desktop app (electron-updater, generic provider)
// reads /updates/latest.yml and downloads the installer from /updates/<file>.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INSTALLER = /^BlackCat-SCRM-Setup-(\d+\.\d+\.\d+)\.exe$/;
const KEEP = 2; // installers kept on the server (current + previous)

const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
function sha512(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha512');
    fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('base64'))).on('error', reject);
  });
}

function createUpdates({ dataDir, distDir }) {
  const dir = path.join(dataDir, 'updates');
  fs.mkdirSync(dir, { recursive: true });
  const releaseFile = path.join(dir, 'release.json');
  const release = () => { try { return JSON.parse(fs.readFileSync(releaseFile, 'utf8')); } catch { return null; } };
  const save = (r) => { fs.writeFileSync(releaseFile + '.tmp', JSON.stringify(r, null, 2)); fs.renameSync(releaseFile + '.tmp', releaseFile); return r; };

  // The newest installer electron-builder left in dist, if any
  function built() {
    let best = null;
    try {
      for (const name of fs.readdirSync(distDir)) {
        const m = INSTALLER.exec(name); if (!m) continue;
        if (!best || cmp(m[1], best.version) > 0) { const st = fs.statSync(path.join(distDir, name)); best = { version: m[1], file: name, size: st.size, builtAt: st.mtimeMs }; }
      }
    } catch {}
    return best;
  }

  async function publish({ notes = '', mandatory = false } = {}) {
    const b = built();
    if (!b) throw Error('dist 文件夹里没有安装包，请先在项目里运行 npm run dist');
    const current = release();
    if (current && cmp(b.version, current.version) <= 0) throw Error(`dist 里的版本 ${b.version} 不比已发布的 ${current.version} 新。请先把 package.json 的 version 调高再打包。`);
    const tmp = path.join(dir, b.file + '.part');
    await fs.promises.copyFile(path.join(distDir, b.file), tmp);
    const hash = await sha512(tmp);
    fs.renameSync(tmp, path.join(dir, b.file));
    const next = save({ version: b.version, file: b.file, size: fs.statSync(path.join(dir, b.file)).size, sha512: hash, notes: String(notes).slice(0, 4000),
      minVersion: mandatory ? b.version : '', publishedAt: Date.now() });
    // Drop old installers beyond the newest KEEP
    const olds = fs.readdirSync(dir).filter((n) => INSTALLER.test(n)).sort((x, y) => cmp(INSTALLER.exec(y)[1], INSTALLER.exec(x)[1]));
    for (const n of olds.slice(KEEP)) fs.rmSync(path.join(dir, n), { force: true });
    return next;
  }

  function edit({ notes, mandatory }) {
    const r = release(); if (!r) throw Error('还没有发布过版本');
    if (notes !== undefined) r.notes = String(notes).slice(0, 4000);
    if (mandatory !== undefined) r.minVersion = mandatory ? r.version : '';
    return save(r);
  }

  // electron-updater's latest.yml; minVersion is our own field (forced update)
  function latestYml() {
    const r = release(); if (!r) return null;
    const q = (s) => JSON.stringify(String(s)); // JSON strings are valid YAML scalars
    return [`version: ${r.version}`, 'files:', `  - url: ${q(r.file)}`, `    sha512: ${q(r.sha512)}`, `    size: ${r.size}`,
      `path: ${q(r.file)}`, `sha512: ${q(r.sha512)}`, `releaseDate: ${q(new Date(r.publishedAt).toISOString())}`,
      `releaseNotes: ${q(r.notes || '')}`, `minVersion: ${q(r.minVersion || '')}`, ''].join('\n');
  }

  // Path of a published installer, or null (only exact installer names inside the updates folder)
  function file(name) {
    if (!INSTALLER.test(name)) return null;
    const full = path.join(dir, name);
    return fs.existsSync(full) ? full : null;
  }

  return { release, built, publish, edit, latestYml, file };
}

module.exports = { createUpdates, compareVersions: cmp };
