'use strict';
const { parentPort, workerData: job } = require('worker_threads');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { CHUNK, hash, validateManifest, validPath } = require('./cloud-format');
const { collect, read, atomic } = require('./cloud-data');
const progress = message => parentPort.postMessage({ progress: message });
async function request(route, method = 'GET', body, binary = false) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(job.server + '/api/cloud/' + route, { method, redirect: 'error', headers: { authorization: 'Bearer ' + job.token, 'content-type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json', 'x-blackcat-version': job.version }, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body), signal: AbortSignal.timeout(120000) });
      if (binary && res.ok) return Buffer.from(await res.arrayBuffer());
      const data = await res.json();
      if (!res.ok || !data.ok) throw Object.assign(Error(data.error || '云备份请求失败'), { status: res.status });
      return data.data;
    } catch (e) {
      if (attempt >= 2 || e.status && ![409, 502, 503, 504].includes(e.status)) throw e;
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1500));
    }
  }
}
async function upload() {
  const state = await request('state');
  if (!state.eligible) throw Error('云备份需要 Business 或 Enterprise 配套');
  if (!state.configured) throw Error('管理员尚未接通 R2 云储存');
  await request('cleanup', 'POST');
  const manifest = { version: 1, accounts: [], files: [] };
  let sent = 0, reused = 0;
  const fileCache = read(path.join(job.dataDir, 'cloud-file-cache.json'), {});
  const nextCache = {};
  for await (const entry of collect(job)) {
    progress('正在准备 / Preparing: ' + entry.path);
    if (entry.path === 'records/account-index.json') manifest.accounts = read(entry.file, []);
    const before = await fs.promises.stat(entry.file), stamp = before.size + ':' + before.mtimeMs;
    let descriptor = fileCache[entry.path]?.stamp === stamp ? fileCache[entry.path].descriptor : null;
    if (!descriptor) {
      const chunks = [], digest = crypto.createHash('sha256');
      for await (const bytes of fs.createReadStream(entry.file, { highWaterMark: CHUNK })) { chunks.push({ hash: hash(bytes), size: bytes.length }); digest.update(bytes); }
      descriptor = { path: entry.path, size: before.size, hash: digest.digest('hex'), chunks };
    }
    const needed = new Set();
    for (let i = 0; i < descriptor.chunks.length; i += 10000) for (const h of await request('missing', 'POST', { hashes: descriptor.chunks.slice(i, i + 10000).map(c => c.hash) })) needed.add(h);
    let index = 0;
    if (needed.size) for await (const bytes of fs.createReadStream(entry.file, { highWaterMark: CHUNK })) {
      const c = descriptor.chunks[index++];
      if (!c || c.hash !== hash(bytes)) throw Error('文件在备份期间有变动，请重新备份：' + entry.path);
      if (needed.has(c.hash)) { await request('chunks/' + c.hash, 'PUT', bytes); sent += bytes.length; needed.delete(c.hash); progress('正在上传 / Uploading: ' + entry.path + ' · ' + Math.round(sent / 1048576) + ' MB'); }
      else reused += bytes.length;
    } else reused += before.size;
    const after = await fs.promises.stat(entry.file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw Error('文件正在更改，本次未创建恢复点，请重试：' + entry.path);
    manifest.files.push(descriptor); nextCache[entry.path] = { stamp, descriptor };
  }
  validateManifest(manifest);
  const result = await request('snapshots', 'POST', { label: job.label, manifest, requestId: crypto.randomUUID() });
  atomic(path.join(job.dataDir, 'cloud-file-cache.json'), nextCache);
  return { ...result, sent, reused, files: manifest.files.length };
}
async function download() {
  const snapshot = await request('snapshots/' + job.id), m = snapshot.manifest;
  const required = validateManifest(m); const disk = await fs.promises.statfs(job.folder);
  if (Number(disk.bavail) * Number(disk.bsize) < required + 200e6) throw Error('本机空间不足，无法下载这个恢复点');
  let done = 0;
  for (const f of m.files) {
    if (!validPath(f.path)) throw Error('恢复路径无效');
    const dest = path.join(job.folder, ...f.path.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    // The destination is a newly created private folder, never an existing user folder.
    const handle = await fs.promises.open(dest + '.partial', 'wx');
    const digest = crypto.createHash('sha256'); let size = 0;
    try {
      for (const c of f.chunks) {
        const bytes = await request('chunks/' + c.hash, 'GET', undefined, true);
        if (bytes.length !== c.size || hash(bytes) !== c.hash) throw Error('下载分块校验失败');
        digest.update(bytes); let offset = 0;
        while (offset < bytes.length) offset += (await handle.write(bytes, offset, bytes.length - offset)).bytesWritten;
        size += bytes.length; done += bytes.length;
        progress('正在下载 / Downloading: ' + f.path + ' · ' + Math.round(done / 1048576) + ' MB');
      }
    } finally { await handle.close(); }
    if (size !== f.size || digest.digest('hex') !== f.hash) throw Error('文件校验失败：' + f.path);
    await fs.promises.rename(dest + '.partial', dest);
  }
  atomic(path.join(job.folder, 'complete.json'), { id: job.id, at: Date.now(), files: m.files.length });
  return { folder: job.folder, id: job.id };
}
(async () => {
  try { parentPort.postMessage({ result: job.action === 'upload' ? await upload() : await download() }); }
  catch (e) { parentPort.postMessage({ error: e.message }); }
  finally { if (job.stage) { const stage = path.resolve(job.stage), parent = path.resolve(job.dataDir); if (path.dirname(stage) === parent && path.basename(stage).startsWith('.cloud-stage-')) await fs.promises.rm(stage, { recursive: true, force: true }); } }
})();
