// Messages and images saved from a chat into its notes ("保存到备注"). Kept beside the typed note: clips live in
// conversation-clips.json, images in clip-media/, keyed by account and conversation like the notes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const MAX_PER_CHAT = 500, MAX_IMAGE = 8 * 1024 * 1024;

function createClipsStore(dataDir, now = Date.now) {
  const file = path.join(dataDir, 'conversation-clips.json'), mediaDir = path.join(dataDir, 'clip-media');
  const key = (accountId, chatKey) => JSON.stringify([accountId, chatKey]);
  let clips = new Map();
  try { for (const [k, items] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')).clips || {})) if (Array.isArray(items)) clips.set(k, items); } catch {}
  const save = () => { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify({ version: 1, clips: Object.fromEntries(clips) })); fs.renameSync(file + '.tmp', file); };
  const view = (item) => ({ ...item, src: item.image ? pathToFileURL(path.join(mediaDir, item.image)).href : '' });
  function check(r) { if (typeof r.accountId !== 'string' || !r.accountId || typeof r.chatKey !== 'string' || !r.chatKey || r.chatKey.length > 1200) throw Error('请先打开一个对话'); }
  function list(r) { check(r); return (clips.get(key(r.accountId, r.chatKey)) || []).map(view); }
  function add(r) {
    check(r);
    const text = String(r.text || '').slice(0, 20000), kind = r.kind === 'image' ? 'image' : 'text';
    let image = '';
    if (kind === 'image') {
      const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(r.imageData || ''));
      if (!m) throw Error('图片无法保存');
      const bytes = Buffer.from(m[2], 'base64');
      if (!bytes.length || bytes.length > MAX_IMAGE) throw Error('图片太大，无法保存');
      image = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32) + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
      fs.mkdirSync(mediaDir, { recursive: true });
      if (!fs.existsSync(path.join(mediaDir, image))) fs.writeFileSync(path.join(mediaDir, image), bytes);
    } else if (!text.trim()) throw Error('没有可保存的文字');
    const items = clips.get(key(r.accountId, r.chatKey)) || [];
    const item = { id: crypto.randomUUID(), kind, text, author: String(r.author || '').slice(0, 120), time: String(r.time || '').slice(0, 60), image, title: String(r.title || '').slice(0, 200), savedAt: now() };
    clips.set(key(r.accountId, r.chatKey), [...items, item].slice(-MAX_PER_CHAT)); save();
    return view(item);
  }
  function remove(r) {
    check(r);
    const items = clips.get(key(r.accountId, r.chatKey)) || [], gone = items.find((i) => i.id === r.id);
    if (!gone) return false;
    const rest = items.filter((i) => i.id !== r.id);
    rest.length ? clips.set(key(r.accountId, r.chatKey), rest) : clips.delete(key(r.accountId, r.chatKey)); save();
    // The same picture can be saved in several chats; delete the file only when nothing uses it any more
    if (gone.image && ![...clips.values()].some((list) => list.some((i) => i.image === gone.image))) fs.rmSync(path.join(mediaDir, gone.image), { force: true });
    return true;
  }
  const imagePath = (r) => { check(r); const item = (clips.get(key(r.accountId, r.chatKey)) || []).find((i) => i.id === r.id && i.image); return item ? path.join(mediaDir, item.image) : null; };
  return { list, add, remove, imagePath };
}

function registerClips({ app, ipcMain, shell, getWindow, loadAccounts }) {
  const store = createClipsStore(app.getPath('userData'));
  const handle = (name, fn) => ipcMain.handle(name, async (e, r = {}) => {
    try {
      if (e.sender !== getWindow()?.webContents) throw Error('无权访问备注');
      if (!loadAccounts().some((a) => a.id === r.accountId)) throw Error('账号不存在');
      return { ok: true, data: await fn(r) };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  handle('clips:list', (r) => store.list(r));
  handle('clips:add', (r) => store.add(r));
  handle('clips:remove', (r) => store.remove(r));
  handle('clips:open', async (r) => { const file = store.imagePath(r); if (!file) throw Error('图片不存在'); const error = await shell.openPath(file); if (error) throw Error(error); return true; });
  return store;
}

module.exports = { createClipsStore, registerClips };
