const { app, BrowserWindow, ipcMain, session, shell, dialog, Menu, safeStorage, net, nativeTheme, protocol, Notification } = require('electron');
protocol.registerSchemesAsPrivileged([{scheme:'blackcat-archive',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const path = require('path');
const fs = require('fs');
const { startRelay, testProxy } = require('./proxy');
const { extractCrx, crxPublicKey } = require('./crx');
const { translate, DEFAULT_LINGVA_SERVERS, clearTranslationCache, loadTranslationCache, flushTranslationCache } = require('./translate');
const { pathToFileURL } = require('url');
const { registerAI } = require('./ai-main');

// 数据目录从旧名「WA Multi」改为「BlackCat CRM」：首次启动时整体搬过去，账号、登录状态和设置都保留。
const DATA_DIR = path.join(app.getPath('appData'), 'BlackCat CRM');
const LEGACY_DATA_DIR = path.join(app.getPath('appData'), 'WA Multi');
let userDataDir = DATA_DIR;
if (!fs.existsSync(DATA_DIR) && fs.existsSync(LEGACY_DATA_DIR)) {
  try { fs.renameSync(LEGACY_DATA_DIR, DATA_DIR); }
  catch { userDataDir = LEGACY_DATA_DIR; } // 旧版仍在运行或文件被占用：本次继续用旧目录，下次启动再搬
}
app.setPath('userData', userDataDir);

// WhatsApp Web 会拒绝带 Electron/应用名 的 UA，这里用内置 Chromium 版本号拼一个标准 Chrome UA
app.userAgentFallback =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
  `Chrome/${process.versions.chrome} Safari/537.36`;

// 仅为当前页面和正在发送任务的页面保持运行，后台页面使用 Chromium 的节流机制。
const managedGuests = new Map();
const guestActivity = new Map();

const ACCOUNTS_FILE = path.join(app.getPath('userData'), 'accounts.json');

// 代理密码用系统加密（Windows DPAPI）后再写入磁盘
function encodeSecret(s) {
  return s && safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(s).toString('base64')}` : s;
}

function decodeSecret(s) {
  if (!s || !s.startsWith('enc:')) return s;
  try {
    return safeStorage.decryptString(Buffer.from(s.slice(4), 'base64'));
  } catch {
    return '';
  }
}

const mapPassword = (accounts, fn) => accounts.map((a) => (
  a.proxy ? { ...a, proxy: { ...a.proxy, password: fn(a.proxy.password) } } : a
));

function loadAccounts() {
  try {
    return mapPassword(JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')), decodeSecret);
  } catch {
    return [];
  }
}

function saveAccounts(accounts) {
  fs.mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(mapPassword(accounts, encodeSecret), null, 2));
}

// 全局设置（目前只有 Lingva 服务器列表）
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  let s = {};
  try {
    s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch { /* 第一次运行没有文件 */ }
  return { lingvaServers: DEFAULT_LINGVA_SERVERS, ...s };
}

let settings = loadSettings();
// 翻译结果存在本机：重开软件后同一句话不再重新翻译、不再扣 AI 点数。
loadTranslationCache(path.join(app.getPath('userData'), 'translation-cache.json'));
app.on('will-quit', flushTranslationCache);

// 登录黑猫服务器：没登录只显示登录页；配套决定账号数、功能和 AI 点数。
const { createLicense } = require('./license');
const license = createLicense({ dataDir: app.getPath('userData'), safeStorage, appVersion: app.getVersion(), defaultServer: require('./package.json').blackcatServer || '', onChange: () => {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('license:changed', license.state());
  if (!license.loggedIn() && !win.webContents.getURL().endsWith('login.html')) win.loadFile(path.join(__dirname, 'renderer', 'login.html'));
} });
// 客户自己的 Claude Key 优先；没有时经黑猫服务器中转，按用量扣点。
// 「AI 使用方式」选黑猫点数时，即使保存了 Key 也走服务器扣点。
const claudeAccess = () => { const own = decodeSecret(settings.claudeKey); const relay = license.relay(); if (settings.claudeMode === 'points' && relay) return relay; return own ? { apiKey: own } : relay || { apiKey: '' }; };

// 每个 partition 当前使用的本地中转
const relays = new Map();
// 每个 session 的网络出口（直连或哪个代理），翻译限流按出口分开计
const netIdBySession = new WeakMap();

async function applyProxy(partition, proxy) {
  const ses = session.fromPartition(partition);
  netIdBySession.set(ses, proxy?.enabled && proxy.host && proxy.port ? `${proxy.host}:${proxy.port}` : 'direct');
  relays.get(partition)?.stop();
  relays.delete(partition);

  if (!proxy?.enabled || !proxy.host || !proxy.port) {
    await ses.setProxy({ mode: 'direct' });
  } else if (proxy.username) {
    const relay = await startRelay(proxy);
    relays.set(partition, relay);
    await ses.setProxy({ proxyRules: `http://127.0.0.1:${relay.port}`, proxyBypassRules: '<local>' });
  } else {
    const scheme = proxy.protocol === 'socks5' ? 'socks5' : 'http';
    await ses.setProxy({ proxyRules: `${scheme}://${proxy.host}:${proxy.port}`, proxyBypassRules: '<local>' });
  }
  await ses.closeAllConnections();
}

// LINE 没有网页版，只有官方 Chrome 扩展：首次使用时从 Chrome 应用商店下载并解压，
// 去掉后台脚本（只负责弹窗口），在页面里注入 line-shim.js 补齐 Electron 缺的接口。
const LINE_EXT_ID = 'ophjlpahpchlmihnnnihgmmeilfjmjjc';
const LINE_DIR = path.join(app.getPath('userData'), 'line-extension');
let lineReady = null;

async function downloadLineExtension() {
  const manifestFile = path.join(LINE_DIR, 'manifest.json');
  // 已下载且带官方公钥就直接用（LINE 的加密模块只认官方扩展 ID）
  if (fs.existsSync(manifestFile) && JSON.parse(fs.readFileSync(manifestFile, 'utf8')).key) return LINE_DIR;
  const url = 'https://clients2.google.com/service/update2/crx?response=redirect'
    + `&prodversion=${process.versions.chrome}&acceptformat=crx2,crx3&x=id%3D${LINE_EXT_ID}%26uc`;
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`下载 LINE 扩展失败（HTTP ${res.status}）`);
  const crx = Buffer.from(await res.arrayBuffer());
  const key = crxPublicKey(crx, LINE_EXT_ID);
  if (!key) throw new Error('LINE 扩展包校验失败（找不到官方公钥）');
  const tmp = `${LINE_DIR}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  extractCrx(crx, tmp);
  const tmpManifest = path.join(tmp, 'manifest.json');
  fs.writeFileSync(tmpManifest, JSON.stringify({ ...JSON.parse(fs.readFileSync(tmpManifest, 'utf8')), key }, null, 2));
  fs.rmSync(LINE_DIR, { recursive: true, force: true });
  fs.renameSync(tmp, LINE_DIR);
  return LINE_DIR;
}

// 每次启动都重新打补丁（幂等），这样更新 line-shim.js 后已下载的扩展也能用上
function patchLineExtension(dir) {
  const manifestFile = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  delete manifest.background;
  delete manifest.update_url;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

  fs.copyFileSync(path.join(__dirname, 'line-shim.js'), path.join(dir, 'electron-shim.js'));
  // Electron 不会真正隔离 manifest 里的 sandbox 页面，它们也能碰到 chrome.*，所以每个页面都要注入
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.html'))) {
    const file = path.join(dir, f);
    const html = fs.readFileSync(file, 'utf8');
    if (!html.includes('electron-shim.js')) {
      fs.writeFileSync(file, html.replace('<head>', '<head><script src="/electron-shim.js"></script>'));
    }
  }
  return dir;
}

// 把 LINE 扩展装进某个账号的 session，返回聊天页面地址
async function prepareLine(partition) {
  lineReady ??= downloadLineExtension().then(patchLineExtension).catch((e) => { lineReady = null; throw e; });
  const dir = await lineReady;
  const exts = session.fromPartition(partition).extensions;
  const ext = exts.getAllExtensions().find((e) => e.path === dir) || await exts.loadExtension(dir);
  return `${ext.url}index.html`;
}

let win;
registerAI({ app, ipcMain, dialog, getWindow: () => win, getKey: () => claudeAccess().apiKey, getBaseURL: () => claudeAccess().baseURL, getLimits: () => license.limits(), loadAccounts, protect: (value) => { if (!safeStorage.isEncryptionAvailable()) throw Error('系统加密尚未就绪，请重新打开软件'); return encodeSecret(value); }, reveal: decodeSecret, getTranscription: () => ({ endpoint: settings.transcriptionEndpoint, model: settings.transcriptionModel, key: decodeSecret(settings.transcriptionKey) }) });

function createWindow() {
  nativeTheme.themeSource = ['dark','light','system'].includes(settings.uiTheme)?settings.uiTheme:'light';
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: '黑猫SCRM',
    icon: path.join(__dirname, 'assets', 'blackcat.ico'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#20242d' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      backgroundThrottling: false,
      autoplayPolicy:'no-user-gesture-required',
    },
  });
  // The taskbar menu and pins read these instead of the name Windows cached for the app ID (it had kept "Electron")
  if (process.platform === 'win32') win.setAppDetails({ appId: require('./desktop-notifications').APP_ID(app), appIconPath: app.isPackaged ? process.execPath : path.join(__dirname, 'assets', 'blackcat.ico'), relaunchCommand: app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${app.getAppPath()}"`, relaunchDisplayName: app.isPackaged ? '黑猫SCRM' : '黑猫SCRM（本地版）' });
  Menu.setApplicationMenu(null);
  // The hidden popup window would otherwise keep the app running after the main window closes
  win.on('closed', () => { win = null; app.quit(); });
  const clearAttention = () => { if (!win.isDestroyed()) win.flashFrame(false); };
  win.on('focus', clearAttention);
  win.on('restore', clearAttention);
  win.webContents.on('focus', clearAttention);
  win.loadFile(path.join(__dirname, 'renderer', license.loggedIn() ? 'index.html' : 'login.html'));
  if (license.loggedIn()) license.refresh();
}

// 每个账号的独立 session：允许通知、麦克风（语音消息）等权限
app.on('session-created', (ses) => {
  const allowed = new Set(['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
});

app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;
  contents.on('focus', () => { if (win && !win.isDestroyed()) win.flashFrame(false); });
  managedGuests.set(contents.id, contents);
  contents.once('destroyed', () => { managedGuests.delete(contents.id); guestActivity.delete(contents.id); });
  // 防止 WebRTC 绕过代理暴露真实 IP
  contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  // 聊天里点开的链接用系统浏览器打开
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
});

// 各平台自己的域名（含登录、验证页面）留在软件里打开，其它链接交给系统浏览器
const APP_DOMAINS = [
  'whatsapp.com', 'whatsapp.net',
  'facebook.com', 'messenger.com', 'fb.com', 'fbcdn.net',
  'telegram.org', 't.me',
  'line.me', 'naver.jp',
  'tiktok.com', 'tiktokv.com', 'tiktokcdn.com',
  'zalo.me', 'zaloapp.com', 'zadn.vn', 'zdn.vn', 'zalo.vn',
  'x.com', 'twitter.com', 'twimg.com', 't.co', 'x.ai',
];

function isAppUrl(url) {
  if (url.startsWith('chrome-extension://')) return true;
  try {
    const host = new URL(url).hostname;
    return APP_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

ipcMain.handle('accounts:load', () => loadAccounts());
ipcMain.handle('accounts:save', (_e, accounts) => {const previous=loadAccounts();const max=license.limits()?.accounts;if(max>=0&&accounts.length>max&&accounts.length>previous.length)throw Error(`当前配套最多 ${max} 个聊天账号`);saveAccounts(accounts);app.emit('blackcat:accounts-saved',{previous,accounts});});

ipcMain.handle('accounts:confirm-remove', async (_e, name) => {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: settings.uiLocale === 'en' ? ['Cancel', 'Delete'] : ['取消', '删除'],
    defaultId: 0,
    cancelId: 0,
    title: settings.uiLocale === 'en' ? 'Delete account' : '删除账号',
    message: settings.uiLocale === 'en' ? `Delete account “${name}”?` : `确定删除账号「${name}」吗？`,
    detail: settings.uiLocale === 'en' ? 'Local login data for this account will also be removed. You will need to sign in again.' : '会同时清除这个账号在本机的登录数据，下次需要重新扫码。',
  });
  return response === 1;
});

ipcMain.handle('accounts:clear-data', async (_e, partition) => {
  relays.get(partition)?.stop();
  relays.delete(partition);
  await session.fromPartition(partition).clearStorageData();
  await session.fromPartition(partition).clearCache();
});

ipcMain.handle('line:prepare', async (_e, partition) => {
  try {
    return { ok: true, url: await prepareLine(partition) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 翻译请求可能来自聊天页面（webview）或设置面板；用发起方自己的 session 联网，聊天页面的翻译也走该账号的代理
ipcMain.handle('translate:text', async (e, req) => {
  try {
    const ses = e.sender.session;
    return {
      ok: true,
      ...(await translate(req, {
        fetch: (url, opts) => ses.fetch(url, opts),
        lingvaServers: settings.lingvaServers,
        claudeKey: claudeAccess().apiKey,
        claudeBaseURL: claudeAccess().baseURL,
        netId: netIdBySession.get(ses) || 'direct',
      })),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 界面只拿到 Key 的末 4 位，完整 Key 只在主进程里解密使用
function publicSettings() {
  const key = decodeSecret(settings.claudeKey) || '';
  return { lingvaServers: settings.lingvaServers, claudeKeySet: !!key, claudeMode: settings.claudeMode === 'points' ? 'points' : 'own', usesOwnKey: !!key && settings.claudeMode !== 'points', claudeKeyHint: key ? `…${key.slice(-4)}` : '', transcriptionEndpoint: settings.transcriptionEndpoint || 'https://api.openai.com/v1/audio/transcriptions', transcriptionModel: settings.transcriptionModel || 'gpt-transcribe', transcriptionKeySet: !!decodeSecret(settings.transcriptionKey), uiTheme: settings.uiTheme, uiLocale: settings.uiLocale };
}

ipcMain.handle('settings:get', () => publicSettings());
const fromWindow = (e) => { if (e.sender !== win?.webContents) throw Error('无权访问'); };
// Backup may scan the account on screen only while the user is away: idle 2+ minutes, or working in another program.
ipcMain.handle('backup:user-idle', (e) => { fromWindow(e); return require('electron').powerMonitor.getSystemIdleTime() >= (backupService.state().idleMinutes || 2) * 60 || !win?.isFocused(); });
ipcMain.handle('license:state', (e) => { fromWindow(e); return license.state(); });
ipcMain.handle('license:refresh', async (e) => { fromWindow(e); return license.refresh(); });
ipcMain.handle('license:login', async (e, r = {}) => {
  fromWindow(e);
  try { const state = await license.login(r); win.loadFile(path.join(__dirname, 'renderer', 'index.html')); return { ok: true, state }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('license:logout', async (e) => { fromWindow(e); await license.logout(); return { ok: true }; });
require('./app-update').registerUpdates({ app, ipcMain, getWindow: () => win, getServer: () => license.state().server, fromWindow });
ipcMain.on('views:activity', (event, items) => {
  if (event.sender !== win?.webContents || !Array.isArray(items)) return;
  for (const item of items.slice(0, 500)) {
    const guest = managedGuests.get(item?.id);
    const awake = item?.awake === true;
    if (!guest || guest.isDestroyed() || guestActivity.get(item.id) === awake) continue;
    guestActivity.set(item.id, awake);
    guest.setBackgroundThrottling(!awake);
  }
});
ipcMain.handle('app:appearance', (_e, value) => {
  const theme = value?.themeMode === 'system' ? 'system' : value?.theme === 'dark' ? 'dark' : 'light';
  const locale = value?.locale === 'en' ? 'en' : 'zh-CN';
  nativeTheme.themeSource = theme;
  settings = { ...settings, uiTheme: theme, uiLocale: locale };
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
});
ipcMain.handle('settings:set', (event, patch) => {
  if (event.sender !== win?.webContents) throw Error('无权修改设置');
  const next = { ...patch };
  // Claude API Key 用系统加密后再写入磁盘；传空字符串表示删除
  if ('claudeMode' in next) next.claudeMode = next.claudeMode === 'points' ? 'points' : 'own';
  if ('claudeKey' in next) next.claudeKey = next.claudeKey ? encodeSecret(String(next.claudeKey).trim()) : '';
  if ('transcriptionKey' in next) { if (next.transcriptionKey && !safeStorage.isEncryptionAvailable()) throw Error('系统加密尚未就绪'); next.transcriptionKey = next.transcriptionKey ? encodeSecret(String(next.transcriptionKey).trim()) : ''; }
  if ('transcriptionEndpoint' in next) { const url = new URL(next.transcriptionEndpoint); if (url.protocol !== 'https:' || url.username || url.password) throw Error('转写 API 需要 HTTPS 地址'); next.transcriptionEndpoint = url.href; }
  if ('transcriptionModel' in next) next.transcriptionModel = String(next.transcriptionModel).trim().slice(0, 120);
  settings = { ...settings, ...next };
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  return publicSettings();
});

// ---------- 快捷回复：模板存在 quick-replies.json，附件复制到 quick-media 目录 ----------

const QUICK_FILE = path.join(app.getPath('userData'), 'quick-replies.json');
const QUICK_DIR = path.join(app.getPath('userData'), 'quick-media');
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.heic': 'image/heic', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf', '.zip': 'application/zip', '.txt': 'text/plain',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const MAX_ATTACHMENT = 200 * 1024 * 1024;

ipcMain.handle('quick:load', () => {
  try {
    return JSON.parse(fs.readFileSync(QUICK_FILE, 'utf8'));
  } catch {
    return { mode: 'direct', public: [], personal: {} };
  }
});

ipcMain.handle('quick:save', (_e, data) => fs.writeFileSync(QUICK_FILE, JSON.stringify(data, null, 2)));

// 选文件并复制一份到软件目录，原文件之后移动/删除也不影响模板
ipcMain.handle('quick:pick-files', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: settings.uiLocale === 'en' ? 'Choose photos / videos / files' : '选择照片 / 视频 / 文件',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '所有文件', extensions: ['*'] },
      { name: '照片 / 视频', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'webm'] },
    ],
  });
  if (r.canceled) return { files: [], skipped: [] };
  fs.mkdirSync(QUICK_DIR, { recursive: true });
  const files = [];
  const skipped = [];
  for (const p of r.filePaths) {
    const { size } = fs.statSync(p);
    if (size > MAX_ATTACHMENT) {
      skipped.push(path.basename(p));
      continue;
    }
    const ext = path.extname(p).toLowerCase();
    const file = `${require('crypto').randomUUID()}${ext}`;
    fs.copyFileSync(p, path.join(QUICK_DIR, file));
    files.push({ file, name: path.basename(p), type: MIME[ext] || 'application/octet-stream', size });
  }
  return { files, skipped };
});

const quickPath = (file) => path.join(QUICK_DIR, path.basename(String(file)));

ipcMain.handle('quick:read-file', (_e, f) => {
  const p = quickPath(f.file);
  if (!fs.existsSync(p)) return { ok: false, name: f.name };
  return { ok: true, name: f.name, type: f.type, data: fs.readFileSync(p) };
});

ipcMain.handle('quick:delete-files', (_e, files) => {
  for (const file of files) fs.rmSync(quickPath(file), { force: true });
});

ipcMain.on('quick:dir', (e) => {
  e.returnValue = pathToFileURL(QUICK_DIR).href;
});

// 头像图片多为跨域地址，用该账号自己的 session 下载后转成 data URL
ipcMain.handle('avatar:fetch', async (e, url) => {
  try {
    const res = await e.sender.session.fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${res.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
});

// ---------- 联系人 / 群发文案：各存一个 JSON 文件 ----------

const STORES = { contacts: 'contacts.json', 'account-contacts': 'account-contacts.json', bulk: 'bulk.json', 'unified-inbox': 'unified-inbox.json', 'ai-monitor': 'ai-monitor.json' };
const storePath = (name) => {
  if (!STORES[name]) throw new Error(`unknown store ${name}`);
  return path.join(app.getPath('userData'), STORES[name]);
};

ipcMain.handle('store:get', (_e, name) => {
  try {
    return JSON.parse(fs.readFileSync(storePath(name), 'utf8'));
  } catch {
    return null;
  }
});

ipcMain.handle('store:set', (_e, name, data) => fs.writeFileSync(storePath(name), JSON.stringify(data, null, 2)));

// ---------- Excel：导入收件人、下载模板、导出结果 ----------

const ExcelJS = require('exceljs');

// 单元格转文字（数字、富文本、超链接、公式结果都兼容）
function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
}

ipcMain.handle('excel:import', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: settings.uiLocale === 'en' ? 'Import Excel' : '导入 Excel',
    properties: ['openFile'],
    filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'csv'] }],
  });
  if (r.canceled) return null;
  const file = r.filePaths[0];
  const wb = new ExcelJS.Workbook();
  try {
    if (file.toLowerCase().endsWith('.csv')) await wb.csv.readFile(file);
    else await wb.xlsx.readFile(file);
  } catch (e) {
    return { error: `无法读取文件：${e.message}（只支持 .xlsx / .csv）` };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { error: '文件里没有工作表' };
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = [];
    for (let c = 1; c <= ws.columnCount; c++) values.push(cellText(row.getCell(c).value));
    rows.push(values);
  });
  if (!rows.length) return { error: '表格是空的' };
  const [headers, ...data] = rows;
  return { name: path.basename(file), headers, rows: data.filter((v) => v.some(Boolean)) };
});

async function saveWorkbook(wb, defaultName) {
  const r = await dialog.showSaveDialog(win, {
    title: settings.uiLocale === 'en' ? 'Save Excel' : '保存 Excel',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });
  if (r.canceled) return null;
  await wb.xlsx.writeFile(r.filePath);
  return r.filePath;
}

function styleHeader(ws) {
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3FF' } };
}

ipcMain.handle('excel:template', async (_e, platform) => {
  const wa = platform === 'whatsapp';
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('收件人');
  ws.columns = [
    { header: wa ? '电话号码 / Username' : 'username', width: 22 },
    ...(wa?[{header:'Username key',width:20}]:[]),
    { header: '名字', width: 16 },
    { header: '变量2', width: 16 },
    { header: '变量3', width: 16 },
  ];
  if(wa)ws.getColumn(2).numFmt='@'; // Keep leading zeroes in provided username keys.
  ws.getColumn(1).numFmt = '@'; // 电话号码按文字存，避免变成科学计数
  if (wa) {
    ws.addRow(['60123456789', '', '张三', '', '']);
    ws.addRow(['@customer.name', '', 'Amy', '', '']);
    ws.addRow(['@another_user', '对方提供的key', 'Alex', '', '']);
  } else {
    ws.addRow(['@username1', '张三', '', '']);
    ws.addRow(['username2', 'Amy', '', '']);
  }
  styleHeader(ws);
  const help = wb.addWorksheet('说明');
  help.columns = [{ width: 90 }];
  [
    '第 1 列：' + (wa ? '电话号码（含国家区号，如60123456789）或完整@username / wa.me链接' : 'Telegram username（带不带 @ 都可以）'),
    ...(wa?['第2列Username key：可选，只填写对方明确提供的key；未开放Username搜索的账号只能使用电话号码。']:[]),
    (wa?'第3列':'第2列')+'起：变量。第 1 行是变量名，可以改成任何名字（如 名字、订单号、金额）。',
    '文案里用 @变量名 调用，例如：你好 @名字，你的订单 @订单号 已发货。',
    '空的变量列可以删掉，也可以继续往右加更多列。',
  ].forEach((t) => help.addRow([t]));
  return saveWorkbook(wb, wa ? '群发模板-WhatsApp.xlsx' : '群发模板-Telegram.xlsx');
});

ipcMain.handle('excel:export', async (_e, { name, headers, rows }) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('结果');
  ws.columns = headers.map((h) => ({ header: h, width: 20 }));
  rows.forEach((r) => ws.addRow(r));
  styleHeader(ws);
  return saveWorkbook(wb, name);
});

// 注入到每个聊天页面的翻译脚本
ipcMain.on('app:webview-preload', (e) => {
  e.returnValue = pathToFileURL(path.join(__dirname, 'webview-preload.js')).href;
});

ipcMain.handle('proxy:apply', (_e, partition, proxy) => applyProxy(partition, proxy));

ipcMain.handle('proxy:test', async (_e, proxy) => {
  try {
    return { ok: true, ...(await testProxy(proxy)) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

require('./conversation-notes').registerNotes({ app, ipcMain, getWindow: () => win, loadAccounts });
const appSystem=require('./app-system').registerAppSystem({app,ipcMain,session,getWindow:()=>win,managedGuests,loadAccounts,clearTranslationCache});
require('./desktop-notifications').registerDesktopNotifications({app,ipcMain,BrowserWindow,getWindow:()=>win,getPolicy:()=>appSystem.get(),loadAccounts});
require('./app-assistant').registerAssistant({app,ipcMain,getWindow:()=>win,getKey:()=>claudeAccess().apiKey,getBaseURL:()=>claudeAccess().baseURL,
  getAccount:()=>{const s=license.state();return s.loggedIn?{profile:s.profile,catalog:s.catalog,ownClaudeKey:!!decodeSecret(settings.claudeKey)&&settings.claudeMode!=='points',accountsUsed:loadAccounts().length}:null;}});
ipcMain.handle('help:guide',async e=>{if(e.sender!==win?.webContents)return{ok:false,error:'无权打开教程'};const error=await shell.openPath(path.join(__dirname,'assets','黑猫SCRM使用教程.pdf'));return error?{ok:false,error}:{ok:true};});
const backupService=require('./backup-main').registerBackup({ app, ipcMain, dialog, shell, getWindow: () => win, loadAccounts, session, managedGuests, net });
require('./backup-reader').registerBackupReader({app,ipcMain,protocol,dialog,getWindow:()=>win,getFolder:()=>backupService.state().folder,getAccounts:loadAccounts,resolveIdentity:backupService.identityFor,removeLive:request=>backupService.removeRecords(request),isBusy:()=>backupService.isBusy()});

ipcMain.on('badge:total', (_e, total) => {
  if (!win) return;
  win.setTitle(total > 0 ? `(${total}) 黑猫SCRM` : '黑猫SCRM');
  win.flashFrame(false);
});
ipcMain.on('attention:clear', (event) => {
  if (win && (event.sender === win.webContents || managedGuests.has(event.sender.id))) win.flashFrame(false);
});

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } else if (app.isReady()) createWindow(); });
  app.whenReady().then(createWindow);
} else app.quit();

app.on('browser-window-focus', () => win && win.flashFrame(false));

app.on('window-all-closed', () => app.quit());
