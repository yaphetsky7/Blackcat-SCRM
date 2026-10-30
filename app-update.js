// Software updates from the BlackCat server: electron-updater (generic provider) reads <server>/updates/latest.yml,
// downloads in the background and installs on restart. minVersion in latest.yml marks a forced update.
const { autoUpdater } = require('electron-updater');

const EVERY_MS = 3 * 3600e3;
const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
const notesOf = (info) => (Array.isArray(info.releaseNotes) ? info.releaseNotes.map((n) => n.note).join('\n') : String(info.releaseNotes || '')).trim();

function registerUpdates({ app, ipcMain, getWindow, getServer, fromWindow }) {
  let state = { status: 'idle', current: app.getVersion() };
  const set = (patch) => { state = { ...state, ...patch }; getWindow()?.webContents.send('update:state', state); };
  const forced = (info) => !!info.minVersion && newer(info.minVersion, app.getVersion());
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableDifferentialDownload = true; // the server sends whole installers only
  autoUpdater.logger = null;

  let feed = '';
  function point() {
    const s = String(getServer() || '').replace(/\/+$/, '');
    if (!/^https?:\/\//.test(s)) return false;
    if (s !== feed) { autoUpdater.setFeedURL({ provider: 'generic', url: s + '/updates' }); feed = s; }
    return true;
  }
  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: '' }));
  autoUpdater.on('update-available', (info) => set({ status: 'downloading', version: info.version, notes: notesOf(info), mandatory: forced(info), percent: 0 }));
  autoUpdater.on('update-not-available', () => set({ status: 'latest', checkedAt: Date.now() }));
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.floor(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version, notes: notesOf(info), mandatory: forced(info) }));
  autoUpdater.on('error', (e) => {
    const m = String(e?.message || e);
    // Nothing published yet is not an error for the customer
    if (/\b404\b/.test(m)) return set({ status: 'latest', checkedAt: Date.now() });
    if (state.status === 'ready') return; // a later check failing doesn't undo a finished download
    set({ status: 'error', error: /net::|ENOTFOUND|ECONN|ETIMEDOUT|fetch failed/i.test(m) ? '连不上更新服务器，请检查网络' : '更新失败：' + m.split('\n')[0].slice(0, 200) });
  });

  async function check() {
    if (!app.isPackaged) return set({ status: 'error', error: '开发版本不检查更新' });
    if (state.status === 'downloading' || state.status === 'ready') return;
    if (!point()) return set({ status: 'error', error: '还没有设置服务器地址' });
    await autoUpdater.checkForUpdates().catch(() => {}); // failures arrive through the 'error' event
  }
  setTimeout(check, 20e3);
  setInterval(check, EVERY_MS).unref?.();

  ipcMain.handle('update:state', (e) => { fromWindow(e); return state; });
  ipcMain.handle('update:check', async (e) => { fromWindow(e); await check(); return state; });
  ipcMain.handle('update:install', (e) => {
    fromWindow(e);
    if (state.status !== 'ready') throw Error('更新还没有下载好');
    setImmediate(() => autoUpdater.quitAndInstall(true, true)); // silent install, reopen the app afterwards
    return true;
  });
}

module.exports = { registerUpdates };
