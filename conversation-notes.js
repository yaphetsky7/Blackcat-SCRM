const fs = require('fs'); const path = require('path');
function createNotesStore(dataDir, now = Date.now) {
  const file = path.join(dataDir, 'conversation-notes.json'); let notes = new Map(); let loadError = null; const writes = new Map();
  const key = (accountId, chatKey) => JSON.stringify([accountId, chatKey]);
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(saved.notes)) throw Error('Invalid notes file');
    for (const note of saved.notes) { if (typeof note.accountId !== 'string' || typeof note.chatKey !== 'string' || typeof note.text !== 'string') throw Error('Invalid note'); notes.set(key(note.accountId, note.chatKey), note); }
  } catch (e) { if (e.code !== 'ENOENT') loadError = e; }
  function validate(request) {
    if (loadError) throw Error('备注文件无法读取，已保留原文件，请重试或联系维护人员');
    if (typeof request.accountId !== 'string' || !request.accountId || typeof request.chatKey !== 'string' || !request.chatKey || request.chatKey.length > 1200) throw Error('请先打开一个对话');
  }
  function get(request) { validate(request); return { ...(notes.get(key(request.accountId, request.chatKey)) || { accountId: request.accountId, chatKey: request.chatKey, title: request.title || '', text: '', updatedAt: null }) }; }
  function set(request) {
    validate(request); if (typeof request.text !== 'string') throw Error('备注格式不正确');
    const sequenceKey = typeof request.sessionId === 'string' && Number.isSafeInteger(request.editVersion) ? key(key(request.accountId, request.chatKey), request.sessionId) : null;
    if (sequenceKey && writes.has(sequenceKey) && writes.get(sequenceKey).version >= request.editVersion) return { ...writes.get(sequenceKey).note };
    const note = { accountId: request.accountId, chatKey: request.chatKey, title: String(request.title || ''), text: request.text, updatedAt: now() };
    const next = new Map(notes); if (note.text) next.set(key(note.accountId, note.chatKey), note); else next.delete(key(note.accountId, note.chatKey));
    fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify({ version: 1, notes: [...next.values()] }, null, 2)); fs.renameSync(file + '.tmp', file); notes = next;
    if (sequenceKey) writes.set(sequenceKey, { version: request.editVersion, note });
    return { ...note };
  }
  function list(request) {
    validate({ accountId: request.accountId, chatKey: '__index__' });
    return [...notes.values()].filter(note => note.accountId === request.accountId).map(({ accountId, chatKey, title, updatedAt }) => ({ accountId, chatKey, title, updatedAt }));
  }
  return { get, set, list };
}
function registerNotes({ app, ipcMain, getWindow, loadAccounts }) {
  const store = createNotesStore(app.getPath('userData'));
  const run = (event, request, write) => {
    try {
      if (event.sender !== getWindow()?.webContents) throw Error('无权访问备注');
      if (!loadAccounts().some(a => a.id === request.accountId)) throw Error('账号不存在');
      return { ok: true, data: write === 'list' ? store.list(request) : write ? store.set(request) : store.get(request) };
    } catch (e) { return { ok: false, error: e.message }; }
  };
  ipcMain.handle('notes:get', (e, r) => run(e, r, false)); ipcMain.handle('notes:set', (e, r) => run(e, r, true));
  ipcMain.handle('notes:list', (e, r) => run(e, r, 'list'));
  ipcMain.on('notes:flush', (e, r) => { e.returnValue = run(e, r, true); });
  return store;
}
module.exports = { createNotesStore, registerNotes };
