'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { hash } = require('./cloud-format');
function registerCloudReader({ app, ipcMain, protocol, dialog, getWindow, cloud }) {
  let current = null; const requests = new Set(), assets = new Map();
  function close() { for (const c of requests) c.abort(); requests.clear(); assets.clear(); current = null; }
  const active = token => { if (!current || token !== current.token || current.owner !== cloud.owner()) throw Error('云端浏览已关闭，请重新打开'); return current; };
  async function open() {
    const owner = cloud.owner(), migration = await cloud.request('archive/prepare', 'POST'); if (cloud.owner() !== owner) throw Error('黑猫账号已改变');
    const accounts = await cloud.request('archive/accounts'); if (cloud.owner() !== owner) throw Error('黑猫账号已改变'); close();
    current = { token: crypto.randomUUID(), owner };
    return { token: current.token, accounts, remoteCloud: true, standalone: true, filename: '云端聊天记录 / Cloud chat history' + (migration.warnings?.length ? ' · ' + migration.warnings.join('；') : '') };
  }
  async function asset(token, id) {
    active(token); if (assets.has(id)) return assets.get(id);
    const value = await cloud.request('archive/asset?id=' + encodeURIComponent(id)); active(token);
    if (value.status !== 'saved' || !value.file) throw Error('原附件尚未同步到云端');
    if (assets.size >= 64) assets.delete(assets.keys().next().value); assets.set(id, value); return value;
  }
  async function* bytes(token, a, start = 0, end = a.size - 1, signal) {
    let offset = 0;
    for (const c of a.file.chunks) {
      const next = offset + c.size; if (next <= start) { offset = next; continue; } if (offset > end) break;
      active(token); if (signal?.aborted) throw Error('浏览已关闭');
      const body = await cloud.request('chunks/' + c.hash, 'GET', undefined, true, signal);
      active(token); if (body.length !== c.size || hash(body) !== c.hash) throw Error('云端附件分块校验失败');
      yield body.subarray(Math.max(0, start - offset), Math.min(body.length, end - offset + 1)); offset = next;
    }
  }
  async function execute(action, r) {
    if (action === 'open') return open(); if (action === 'close') { close(); return true; }
    const selected = active(r.token);
    if (action === 'chats') return cloud.request('archive/chats?accountId=' + encodeURIComponent(r.accountId));
    if (action === 'messages') {
      const params = new URLSearchParams({ accountId: r.accountId, chatKey: r.chatKey, offset: String(r.offset || 0) });
      const result = await cloud.request('archive/messages?' + params); active(r.token);
      for (const message of result.messages) for (const a of message.assets) if (a.status === 'saved') a.url = 'blackcat-cloud://' + r.token + '/' + a.id;
      return result;
    }
    if (action === 'delete') {
      const en = r.locale === 'en'; const answer = await dialog.showMessageBox(getWindow(), { type: 'warning', title: en ? 'Delete cloud records' : '删除云端记录', message: en ? 'Delete the selected cloud records?' : '删除选中的云端聊天记录？', detail: en ? 'Platform chats stay unchanged. Independent older recovery points may retain copies. Deleted saved messages will not be automatically added again.' : '不会删除平台原聊天。独立的历史恢复点可能仍有副本。已删除的已存消息不会自动存回。', buttons: en ? ['Delete','Cancel'] : ['删除','取消'], defaultId: 1, cancelId: 1, noLink: true });
      if (answer.response !== 0) return null; if (selected !== active(r.token)) throw Error('选中的记录已变化');
      await cloud.request('archive/delete', 'POST', { accountId: r.accountId, chatKey: r.chatKey, scope: r.scope }); return { source: await open() };
    }
    if (action === 'save') {
      const a = await asset(r.token, r.assetId), choice = await dialog.showSaveDialog(getWindow(), { title: '保存云端附件 / Save cloud attachment', defaultPath: path.basename(a.name || 'cloud-attachment') });
      if (choice.canceled) return null; active(r.token);
      const temp = choice.filePath + '.blackcat-part-' + crypto.randomUUID(), controller = new AbortController(); requests.add(controller);
      try { await pipeline(Readable.from(bytes(r.token, a, 0, a.size - 1, controller.signal)), fs.createWriteStream(temp, { flags: 'wx' })); fs.renameSync(temp, choice.filePath); return true; }
      finally { requests.delete(controller); if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    }
    throw Error('未知云端浏览操作');
  }
  ipcMain.handle('cloud:reader', async (e, { action, request = {} } = {}) => { try { if (e.sender !== getWindow()?.webContents) throw Error('无权查看云端记录'); return { ok: true, data: await execute(action, request) }; } catch (e) { return { ok: false, error: e.message }; } });
  app.whenReady().then(() => protocol.handle('blackcat-cloud', async request => {
    let controller;
    try {
      const url = new URL(request.url), token = url.hostname; active(token); const a = await asset(token, decodeURIComponent(url.pathname.slice(1)));
      let start = 0, end = a.size - 1, status = 200; const range = request.headers.get('range');
      if (range) { const m = /^bytes=(\d*)-(\d*)$/.exec(range); if (!m || !m[1] && !m[2]) return new Response('', { status: 416 }); if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])); } else start = Math.max(0, a.size - Number(m[2])); if (!Number.isSafeInteger(start) || start > end) return new Response('', { status: 416, headers: { 'Content-Range': 'bytes */' + a.size } }); status = 206; }
      const headers = { 'Content-Type': /^(image|video|audio)\/[\w.+-]+(?:;.*)?$/.test(a.mime) ? a.mime : 'application/octet-stream', 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      if (status === 206) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + a.size;
      if (request.method === 'HEAD') return new Response(null, { status, headers });
      controller = new AbortController(); requests.add(controller); const stream = Readable.from(bytes(token, a, start, end, controller.signal)); controller.signal.addEventListener('abort', () => stream.destroy()); stream.once('close', () => requests.delete(controller)); return new Response(Readable.toWeb(stream), { status, headers });
    } catch { if (controller) requests.delete(controller); return new Response('', { status: 404 }); }
  }));
  app.on('before-quit', close);
  return { close, execute, bytes };
}
module.exports = { registerCloudReader };
