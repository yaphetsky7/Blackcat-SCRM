const path = require('path');
const { createAIService } = require('./ai-service');
function registerAI({ app, ipcMain, dialog, getWindow, getKey, getBaseURL, getLimits, loadAccounts, protect, reveal, getTranscription }) {
  const { extractMedia } = require('./media-source');
  const service = createAIService({ dataDir: app.getPath('userData'), getKey, getBaseURL, protect, reveal, getTranscription, extractMedia, notify: () => { const win = getWindow(); if (win && !win.isDestroyed()) win.webContents.send('ai:changed'); } });
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, request = {}) => {
    if (event.sender !== getWindow()?.webContents) return { ok: false, error: '无权访问 AI 设置' };
    try { return { ok: true, data: await fn(request) }; } catch (error) { return { ok: false, error: error.message }; }
  });
  const accountExists = (accountId) => { if (!loadAccounts().some((a) => a.id === accountId)) throw new Error('账号不存在'); };
  handle('ai:state', () => service.publicState());
  handle('ai:base-create', ({ name }) => { const max = getLimits?.()?.kbLimit; if (max === 0) throw Error('当前配套不包含知识库，请升级配套'); if (max > 0 && service.publicState().bases.length >= max) throw Error(`当前配套最多 ${max} 个知识库`); return service.createBase(name); });
  handle('ai:base-rename', ({ id, name }) => service.renameBase(id, name));
  handle('ai:base-remove', ({ id }) => service.removeBase(id));
  handle('ai:document-remove', ({ baseId, documentId }) => service.removeDocument(baseId, documentId));
  handle('ai:import', async ({ id, media, visualOnly }) => {
    const extensions = media ? ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp3', 'wav', 'm4a', 'ogg', 'flac', 'mp4', 'webm', 'mov', 'mpeg', 'mpga'] : ['pdf', 'docx', 'xlsx', 'xlsm', 'csv', 'txt', 'md', 'json', 'html', 'htm', 'srt', 'vtt'];
    const result = await dialog.showOpenDialog(getWindow(), { title: '导入知识库资料 / Import knowledge files', properties: ['openFile', 'multiSelections'], filters: [{ name: media ? 'Images / Audio / Video' : 'Documents', extensions }] });
    return result.canceled ? null : service.importFiles(id, result.filePaths, { visualOnly });
  });
  handle('ai:source-add', ({ id, source }) => service.addSource(id, source));
  handle('ai:source-refresh', ({ baseId, documentId }) => service.refreshSource(baseId, documentId));
  handle('ai:learn', ({ id, force }) => service.learn(id, force === true));
  handle('ai:learn-document', ({ baseId, documentId }) => service.learn(baseId, false, [documentId]));
  handle('ai:configure', ({ accountId, config }) => { accountExists(accountId); return service.configure(accountId, config); });
  handle('ai:guide-refine', ({ accountId, request }) => { accountExists(accountId); return service.refineGuide(accountId, request); });
  handle('ai:guide-clear', ({ accountId }) => { accountExists(accountId); return service.clearGuideChat(accountId); });
  handle('ai:generate', (request) => { accountExists(request.accountId); return service.generate(request); });
  handle('ai:handoff', (request) => { accountExists(request.accountId); return service.generate({ ...request, automatic: true, blockedReason: request.reason || '已转人工', messages: [] }); });
  handle('ai:authorize-send', ({ id }) => service.authorizeSend(id));
  handle('ai:finish', ({ id, ok, error }) => service.finish(id, ok === true, error));
  handle('ai:discard', ({ id, reason }) => service.discard(id, reason));
  handle('ai:resolve', ({ accountId, chatKey }) => { accountExists(accountId); return service.resolveHandoff(accountId, chatKey); });
  return service;
}
module.exports = { registerAI };
