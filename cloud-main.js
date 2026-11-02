'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { Worker } = require('worker_threads');
const { atomic, read } = require('./cloud-data');
function registerCloud({ app, ipcMain, dialog, shell, getWindow, license, backupService }) {
  const dataDir = app.getPath('userData'), settingsFile = path.join(dataDir, 'cloud-settings.json');
  let settings = read(settingsFile, {}), current = null;
  const owner = () => license.state().profile?.username || '';
  const config = () => settings[owner()] || { automatic: false, lastRun: 0, lastError: '' };
  const save = value => { settings[owner()] = { ...config(), ...value }; atomic(settingsFile, settings); };
  const notify = () => { const w = getWindow(); if (w && !w.isDestroyed()) w.webContents.send('cloud:changed', { running: !!current, progress: current?.progress || '', action: current?.action || '' }); };
  const connection = () => {
    const c = license.cloudConnection(); if (!c) throw Error('请先登录黑猫账号');
    if (!/^https:\/\//.test(c.server)) throw Error('云备份需要 HTTPS 服务器');
    return { ...c, version: app.getVersion() };
  };
  async function request(route, method = 'GET') {
    const c = connection(), res = await fetch(c.server + '/api/cloud/' + route, { method, redirect: 'error', headers: { authorization: 'Bearer ' + c.token, 'x-blackcat-version': c.version }, signal: AbortSignal.timeout(120000) });
    const result = await res.json(); if (!res.ok || !result.ok) throw Error(result.error || '云备份请求失败'); return result.data;
  }
  async function state() { const pending = read(path.join(dataDir, 'cloud-pending-restore.json'), null); return { ...await request('state'), ...config(), pendingRestore: pending?.owner === owner(), running: !!current, progress: current?.progress || '' }; }
  function start(job) {
    if (current) throw Error('已有云备份任务正在运行');
    if (fs.existsSync(path.join(dataDir, 'cloud-pending-restore.json'))) throw Error('有下载完成的恢复点等待导入，请先重新打开软件');
    const c = connection(), user = owner();
    const worker = new Worker(path.join(__dirname, 'cloud-worker.js'), { workerData: { ...job, ...c, dataDir, label: os.hostname() } });
    const task = current = { worker, owner: user, action: job.action, progress: '正在准备 / Preparing…', done: false };
    const finish = (error, result) => {
      if (task.done) return; task.done = true;
      const old = settings[user] || {};
      settings[user] = { ...old, lastError: error || '', ...(result ? { lastRun: Date.now(), lastResult: result, ...(job.action === 'download' ? { lastDownload: result } : {}) } : {}) };
      atomic(settingsFile, settings);
      if (result && job.action === 'download' && !job.viewOnly) atomic(path.join(dataDir, 'cloud-pending-restore.json'), { ...result, owner: user });
      if (current === task) current = null; notify();
    };
    worker.on('message', m => { if (m.progress) { task.progress = m.progress; notify(); } if (m.error) finish(m.error); if (m.result) finish('', m.result); });
    worker.on('error', e => finish(e.message)); worker.on('exit', code => {
      finish(code ? '任务已停止；本机资料和已完成的恢复点保留' : '云备份任务未能完成');
      if (job.stage) { const stage = path.resolve(job.stage); if (path.dirname(stage) === path.resolve(dataDir) && path.basename(stage).startsWith('.cloud-stage-')) fs.promises.rm(stage, { recursive: true, force: true }).catch(() => {}); }
    });
    notify(); return { started: true };
  }
  function upload() {
    if (fs.existsSync(path.join(dataDir, 'cloud-pending-restore.json'))) throw Error('请先重新打开软件，完成等待中的资料导入');
    if (backupService.isBusy()) throw Error('本地备份正在整理资料，请完成后再上传云端');
    const folder = backupService.state().folder;
    const stage = fs.mkdtempSync(path.join(dataDir, '.cloud-stage-'));
    try { return start({ action: 'upload', folder, stage }); }
    catch (e) { fs.rmdirSync(stage); throw e; }
  }
  const guard = e => { if (e.sender !== getWindow()?.webContents) throw Error('无权操作云备份'); };
  const handle = (name, fn) => ipcMain.handle('cloud:' + name, async (e, r = {}) => { try { guard(e); return { ok: true, data: await fn(r) }; } catch (error) { return { ok: false, error: error.message }; } });
  handle('state', state);
  handle('configure', async r => { const s = await request('state'); if (!s.eligible) throw Error('云备份需要 Business 或 Enterprise 配套'); save({ automatic: r.automatic === true }); return state(); });
  handle('upload', upload);
  handle('stop', async () => { if (current) await current.worker.terminate(); return { stopped: true }; });
  handle('download', async r => {
    if (!/^[a-f0-9-]{36}$/.test(r.id || '')) throw Error('请选择恢复点');
    if (current) throw Error('已有云备份任务正在运行');
    const choice = await dialog.showOpenDialog(getWindow(), { title: '选择云备份下载位置 / Download cloud backup', properties: ['openDirectory', 'createDirectory'] });
    if (choice.canceled) return null;
    const folder = path.join(choice.filePaths[0], '黑猫云备份-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex'));
    fs.mkdirSync(folder, { recursive: false });
    return start({ action: 'download', folder, id: r.id, viewOnly: r.viewOnly === true });
  });
  handle('delete', async r => { if (current) throw Error('请先等待当前云备份任务结束'); if (!/^[a-f0-9-]{36}$/.test(r.id || '')) throw Error('恢复点不正确'); await request('snapshots/' + r.id, 'DELETE'); return state(); });
  handle('cleanup', async () => { if (current) throw Error('请先等待当前任务结束'); await request('cleanup', 'POST'); return state(); });
  handle('open', async () => { const folder = config().lastDownload?.folder; if (!folder) throw Error('请先下载恢复点'); const error = await shell.openPath(folder); if (error) throw Error(error); return true; });
  handle('restart', () => { if (current || backupService.isBusy()) throw Error('请先停止正在进行的备份'); app.relaunch(); app.quit(); return true; });
  const clock = setInterval(async () => {
    if (!license.loggedIn() || current || !config().automatic || Date.now() - (config().lastAttempt || config().lastRun || 0) < 3600000) return;
    // Retry once an hour; offline/full/not-configured errors never create a busy loop.
    const user = owner(); save({ lastAttempt: Date.now() });
    try { const s = await request('state'); if (owner() !== user) return; if (!s.eligible || !s.configured) throw Error(s.eligible ? '管理员尚未接通 R2 云储存' : '当前配套不包含云备份'); upload(); }
    catch (e) { if (owner() === user) save({ lastError: e.message }); notify(); }
  }, 60000); clock.unref?.();
  app.on('before-quit', () => { clearInterval(clock); current?.worker.terminate(); });
  return { state, downloadedFolder: () => config().lastDownload?.folder || '' };
}
module.exports = { registerCloud };
