// Messages, pictures, videos, voice notes and files saved from a chat into its notes ("保存到备注"). Kept beside the
// typed note: clips live in conversation-clips.json, files in clip-media/, keyed by account and conversation like the notes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const MAX_PER_CHAT = 500, MAX_IMAGE = 8 * 1024 * 1024, MAX_FILE = 200 * 1024 * 1024;
const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const AUDIO_TYPES = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac' };

function createClipsStore(dataDir, now = Date.now) {
  const file = path.join(dataDir, 'conversation-clips.json'), mediaDir = path.join(dataDir, 'clip-media'), incomingDir = path.join(mediaDir, 'incoming');
  const key = (accountId, chatKey) => JSON.stringify([accountId, chatKey]);
  let clips = new Map();
  try { for (const [k, items] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')).clips || {})) if (Array.isArray(items)) clips.set(k, items); } catch {}
  const save = () => { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify({ version: 1, clips: Object.fromEntries(clips) })); fs.renameSync(file + '.tmp', file); };
  // An early version saved Telegram's / WhatsApp's own menu ("ic-reply Reply ic-content-copy Copy …"); drop those
  const junk = (i) => i.kind === 'text' && !i.memo && (String(i.text).match(/ic-[a-z]/g) || []).length >= 3;
  let cleaned = false;
  for (const [k, items] of clips) if (items.some(junk)) { cleaned = true; const rest = items.filter((i) => !junk(i)); rest.length ? clips.set(k, rest) : clips.delete(k); }
  if (cleaned) try { save(); } catch {}
  // Downloads waiting to be attached (files saved through the page's own download button)
  const incoming = new Map();
  const url = (name) => (name ? pathToFileURL(path.join(mediaDir, name)).href : '');
  const view = (item) => ({ ...item, src: url(item.image), videoSrc: url(item.video), audioSrc: url(item.audio), fileSrc: url(item.file) });
  // Files are named by their content, so the same file saved twice is stored once
  const storeBytes = (bytes, ext) => {
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
    return storeBytes(bytes, m[1] === 'jpeg' ? 'jpg' : m[1]);
  };
  const storeMedia = (raw, types, fallback, label) => {
    const bytes = raw ? Buffer.from(raw) : null;
    if (!bytes?.length) throw Error(label + '无法保存');
    if (bytes.length > MAX_FILE) throw Error(label + '超过 200 MB，无法保存');
    return storeBytes(bytes, types[String(raw.mime || '').split(';')[0]] || fallback);
  };
  // A file the page downloaded for us (see clips:expect-download), moved into clip-media under its content name
  function takeDownload(token, fallbackExt) {
    const got = incoming.get(String(token || ''));
    if (!got || !fs.existsSync(got.path)) throw Error('文件还没下载完成，请重试');
    incoming.delete(token);
    const size = fs.statSync(got.path).size;
    if (size > MAX_FILE) { fs.rmSync(got.path, { force: true }); throw Error('文件超过 200 MB，无法保存'); }
    const ext = (path.extname(got.name).slice(1).replace(/[^a-z0-9]/gi, '') || fallbackExt).slice(0, 10).toLowerCase();
    const name = crypto.createHash('sha256').update(fs.readFileSync(got.path)).digest('hex').slice(0, 32) + '.' + ext;
    if (fs.existsSync(path.join(mediaDir, name))) fs.rmSync(got.path, { force: true }); else fs.renameSync(got.path, path.join(mediaDir, name));
    return { file: name, fileName: got.name.slice(0, 200), size, mime: got.mime || '' };
  }
  function check(r) { if (typeof r.accountId !== 'string' || !r.accountId || typeof r.chatKey !== 'string' || !r.chatKey || r.chatKey.length > 1200) throw Error('请先打开一个对话'); }
  function list(r) { check(r); return (clips.get(key(r.accountId, r.chatKey)) || []).map(view); }
  function add(r) {
    check(r);
    const text = String(r.text || '').slice(0, 20000), kind = ['image', 'video', 'voice', 'file'].includes(r.kind) ? r.kind : 'text';
    const extra = {};
    if (kind === 'image') { extra.image = storePicture(r.imageData); if (!extra.image) throw Error('图片无法保存'); }
    else if (kind === 'video' && r.fileToken) { const got = takeDownload(r.fileToken, VIDEO_TYPES[String(r.mime || '').split(';')[0]] || 'mp4'); Object.assign(extra, { video: got.file, size: got.size }); extra.image = storePicture(r.imageData); }
    else if (kind === 'video') { extra.video = storeMedia(Object.assign(r.videoBytes || [], { mime: r.mime }), VIDEO_TYPES, 'mp4', '影片'); extra.image = storePicture(r.imageData); extra.size = r.videoBytes.length; }
    else if (kind === 'voice') { extra.audio = storeMedia(Object.assign(r.audioBytes || [], { mime: r.mime }), AUDIO_TYPES, 'ogg', '语音'); }
    else if (kind === 'file') Object.assign(extra, takeDownload(r.fileToken, 'bin'));
    else if (!text.trim()) throw Error('没有可保存的文字');
    const items = clips.get(key(r.accountId, r.chatKey)) || [];
    const item = { id: crypto.randomUUID(), kind, text, author: String(r.author || '').slice(0, 120), time: String(r.time || '').slice(0, 60), title: String(r.title || '').slice(0, 200), savedAt: now(), ...extra };
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
    const files = (i) => [i.image, i.video, i.audio, i.file].filter(Boolean);
    for (const name of files(gone)) if (![...clips.values()].some((all) => all.some((i) => files(i).includes(name)))) fs.rmSync(path.join(mediaDir, name), { force: true });
    return true;
  }
  // The user's own words about a saved item ("写备注"), e.g. what a photo shows
  function update(r) {
    check(r);
    const item = (clips.get(key(r.accountId, r.chatKey)) || []).find((i) => i.id === r.id);
    if (!item) throw Error('这条已保存的内容不存在');
    item.memo = String(r.memo || '').slice(0, 2000); item.memoAt = now(); save();
    return view(item);
  }
  const mediaPath = (r) => { check(r); const item = (clips.get(key(r.accountId, r.chatKey)) || []).find((i) => i.id === r.id); const name = item && (item.file || item.video || item.audio || item.image); return name ? path.join(mediaDir, name) : null; };
  const incomingPath = (token) => { fs.mkdirSync(incomingDir, { recursive: true }); return path.join(incomingDir, token); };
  return { list, add, remove, update, mediaPath, incomingPath, incoming };
}

function registerClips({ app, ipcMain, shell, getWindow, loadAccounts, managedGuests }) {
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
  // "保存文件到备注": the chat page clicks its own download button; that one download goes into clip-media
  const expecting = new Map(), hooked = new WeakSet();
  ipcMain.handle('clips:expect-download', (e, r = {}) => {
    if (!managedGuests.has(e.sender.id)) return { ok: false, error: '无权保存文件' };
    const token = crypto.randomUUID(), ses = e.sender.session;
    // A video can take minutes before the page hands it over (Telegram loads the whole file first)
    expecting.set(e.sender.id, { token, until: Date.now() + (r?.long ? 600000 : 60000) });
    if (!hooked.has(ses)) {
      hooked.add(ses);
      ses.on('will-download', (_event, item, contents) => {
        const wanted = contents && expecting.get(contents.id);
        if (!wanted || wanted.until < Date.now()) return;
        expecting.delete(contents.id);
        const target = store.incomingPath(wanted.token);
        item.setSavePath(target);
        item.once('done', (_e, state) => {
          if (contents.isDestroyed()) return;
          if (state !== 'completed') { fs.rmSync(target, { force: true }); contents.send('clips:download-done', { token: wanted.token, error: '下载失败' }); return; }
          store.incoming.set(wanted.token, { path: target, name: item.getFilename(), mime: item.getMimeType() });
          contents.send('clips:download-done', { token: wanted.token, name: item.getFilename(), size: item.getTotalBytes(), mime: item.getMimeType() });
        });
      });
    }
    return { ok: true, data: token };
  });
  return store;
}

module.exports = { createClipsStore, registerClips };
