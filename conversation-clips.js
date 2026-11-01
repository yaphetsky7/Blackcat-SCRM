// Messages, pictures and videos saved from a chat into its notes ("保存到备注"). Kept beside the typed note: clips live
// in conversation-clips.json, files in clip-media/, keyed by account and conversation like the notes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const MAX_PER_CHAT = 500, MAX_IMAGE = 8 * 1024 * 1024, MAX_VIDEO = 200 * 1024 * 1024;
const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

function createClipsStore(dataDir, now = Date.now) {
  const file = path.join(dataDir, 'conversation-clips.json'), mediaDir = path.join(dataDir, 'clip-media');
  const key = (accountId, chatKey) => JSON.stringify([accountId, chatKey]);
  let clips = new Map();
  try { for (const [k, items] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')).clips || {})) if (Array.isArray(items)) clips.set(k, items); } catch {}
  // An early version saved Telegram's own menu ("ic-reply Reply ic-content-copy Copy …") for photo messages; drop those
  const junk = (i) => i.kind === 'text' && !i.memo && (String(i.text).match(/ic-[a-z]/g) || []).length >= 3;
  let cleaned = false;
  for (const [k, items] of clips) if (items.some(junk)) { cleaned = true; const rest = items.filter((i) => !junk(i)); rest.length ? clips.set(k, rest) : clips.delete(k); }
  const save = () => { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify({ version: 1, clips: Object.fromEntries(clips) })); fs.renameSync(file + '.tmp', file); };
  if (cleaned) try { save(); } catch {}
  const url = (name) => (name ? pathToFileURL(path.join(mediaDir, name)).href : '');
  const view = (item) => ({ ...item, src: url(item.image), videoSrc: url(item.video) });
  // Files are named by their content, so the same picture or video saved twice is stored once
  const storeFile = (bytes, ext) => {
    const name = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32) + '.' + ext;
    fs.mkdirSync(mediaDir, { recursive: true });
    if (!fs.existsSync(path.join(mediaDir, name))) fs.writeFileSync(path.join(mediaDir, name), bytes);
    return name;
  };
  const storePicture = (data) => {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
    if (!m) return '';
    const bytes = Buffer.from(m[2], 'base64');
    if (!bytes.length || bytes.length > MAX_IMAGE) throw Error('图片太大，无法保存');
    return storeFile(bytes, m[1] === 'jpeg' ? 'jpg' : m[1]);
  };
  function check(r) { if (typeof r.accountId !== 'string' || !r.accountId || typeof r.chatKey !== 'string' || !r.chatKey || r.chatKey.length > 1200) throw Error('请先打开一个对话'); }
  function list(r) { check(r); return (clips.get(key(r.accountId, r.chatKey)) || []).map(view); }
  function add(r) {
    check(r);
    const text = String(r.text || '').slice(0, 20000), kind = ['image', 'video'].includes(r.kind) ? r.kind : 'text';
    let image = '', video = '';
    if (kind === 'image') { image = storePicture(r.imageData); if (!image) throw Error('图片无法保存'); }
    else if (kind === 'video') {
      const bytes = r.videoBytes ? Buffer.from(r.videoBytes) : null;
      if (!bytes?.length) throw Error('影片无法保存');
      if (bytes.length > MAX_VIDEO) throw Error('影片超过 200 MB，无法保存');
      video = storeFile(bytes, VIDEO_TYPES[String(r.mime || '').split(';')[0]] || 'mp4');
      image = storePicture(r.imageData);
    } else if (!text.trim()) throw Error('没有可保存的文字');
    const items = clips.get(key(r.accountId, r.chatKey)) || [];
    const item = { id: crypto.randomUUID(), kind, text, author: String(r.author || '').slice(0, 120), time: String(r.time || '').slice(0, 60), image, video, title: String(r.title || '').slice(0, 200), savedAt: now() };
    clips.set(key(r.accountId, r.chatKey), [...items, item].slice(-MAX_PER_CHAT)); save();
    return view(item);
  }
  function remove(r) {
    check(r);
    const items = clips.get(key(r.accountId, r.chatKey)) || [], gone = items.find((i) => i.id === r.id);
    if (!gone) return false;
    const rest = items.filter((i) => i.id !== r.id);
    rest.length ? clips.set(key(r.accountId, r.chatKey), rest) : clips.delete(key(r.accountId, r.chatKey)); save();
    // The same file can be saved in several chats; delete it only when nothing uses it any more
    for (const name of [gone.image, gone.video].filter(Boolean)) if (![...clips.values()].some((all) => all.some((i) => i.image === name || i.video === name))) fs.rmSync(path.join(mediaDir, name), { force: true });
    return true;
  }
  // The user's own words about a saved item ("写备注"), e.g. what a photo shows
  function update(r) {
    check(r);
    const items = clips.get(key(r.accountId, r.chatKey)) || [], item = items.find((i) => i.id === r.id);
    if (!item) throw Error('这条已保存的内容不存在');
    item.memo = String(r.memo || '').slice(0, 2000); item.memoAt = now(); save();
    return view(item);
  }
  const mediaPath = (r) => { check(r); const item = (clips.get(key(r.accountId, r.chatKey)) || []).find((i) => i.id === r.id && (i.video || i.image)); return item ? path.join(mediaDir, item.video || item.image) : null; };
  return { list, add, remove, update, mediaPath };
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
  handle('clips:update', (r) => store.update(r));
  handle('clips:open', async (r) => { const file = store.mediaPath(r); if (!file) throw Error('文件不存在'); const error = await shell.openPath(file); if (error) throw Error(error); return true; });
  return store;
}

module.exports = { createClipsStore, registerClips };
