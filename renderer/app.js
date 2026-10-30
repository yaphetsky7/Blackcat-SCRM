// 登录状态检测：out 选择器出现 = 登录页；in 选择器出现 = 已登录；
// 都没有时，fallbackIn 的平台视为已登录（页面加载完且不是登录页）
const PLATFORMS = {
  whatsapp: {
    label: 'WhatsApp',
    url: 'https://web.whatsapp.com/',
    icon: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#25D366"/><path fill="#fff" d="M16 7.2a8.8 8.8 0 0 0-7.6 13.2L7.2 24.8l4.5-1.2A8.8 8.8 0 1 0 16 7.2zm0 16a7.2 7.2 0 0 1-3.7-1l-.3-.2-2.7.7.7-2.6-.2-.3A7.2 7.2 0 1 1 16 23.2zm4-5.4c-.2-.1-1.3-.6-1.5-.7-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a5.9 5.9 0 0 1-2.9-2.6c-.2-.4.2-.4.6-1.2.1-.1 0-.3 0-.4l-.7-1.6c-.2-.4-.4-.4-.5-.4h-.4a.8.8 0 0 0-.6.3 2.5 2.5 0 0 0-.8 1.9 4.4 4.4 0 0 0 .9 2.3 10 10 0 0 0 3.8 3.4c1.4.6 2 .7 2.7.6.4-.1 1.3-.5 1.5-1.1.2-.5.2-1 .1-1.1l-.3-.3z"/></svg>',
    login: { out: 'canvas[aria-label], [data-ref]', in: '#pane-side, #side' },
  },
  telegram: {
    label: 'Telegram',
    url: 'https://web.telegram.org/a/',
    icon: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#2AABEE"/><path fill="#fff" d="M7.4 15.6l15.2-5.9c.7-.3 1.3.2 1.1 1.2l-2.6 12.2c-.2.9-.7 1.1-1.4.7l-3.9-2.9-1.9 1.8c-.2.2-.4.4-.8.4l.3-4 7.3-6.6c.3-.3-.1-.4-.5-.2l-9 5.7-3.9-1.2c-.8-.3-.9-.8.1-1.2z"/></svg>',
    login: { out: '#auth-pages, #auth-qr-form, #auth-phone-number-form, #auth-code-form, #auth-password-form', in: '#LeftColumn, #MiddleColumn, #editable-message-text' },
  },
  line: {
    label: 'LINE',
    url: null, // 由主进程装好官方扩展后给出地址
    icon: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#06C755"/><path fill="#fff" d="M16 6.5c-5.8 0-10.5 3.8-10.5 8.5 0 4.2 3.7 7.7 8.8 8.4.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5s6-3.5 8.2-6c1.5-1.7 2.3-3.4 2.3-5.3 0-4.7-4.7-8.5-10.5-8.5z"/><text x="16" y="17.6" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="6.2" fill="#06C755">LINE</text></svg>',
    login: { out: 'input[type="password"], [class*="Qr"]', fallbackIn: true },
  },
  facebook: {
    label: 'Messenger Web',
    url: 'https://www.facebook.com/messages/',
    icon: '<svg viewBox="0 0 32 32"><defs><linearGradient id="messenger-gradient" x1="0" y1="1" x2="0" y2="0"><stop stop-color="#0099FF"/><stop offset=".6" stop-color="#A033FF"/><stop offset="1" stop-color="#FF5280"/></linearGradient></defs><path fill="url(#messenger-gradient)" d="M16 2C8.1 2 2 7.8 2 15.4c0 4 1.7 7.5 4.5 9.9v4.3c0 .5.5.8.9.6l4.1-2.3c1.4.4 2.9.6 4.5.6 7.9 0 14-5.8 14-13.1S23.9 2 16 2z"/><path fill="#fff" d="m7.6 19.4 6.2-6.6 4 3 6.6-3.6-6.2 6.6-4-3z"/></svg>',
    login: { out: 'input[name="pass"], input[name="email"], input[name="approvals_code"]', outPath: '^/(login|checkpoint|recover)', fallbackIn: true },
  },
  tiktok:{label:'TikTok Messenger',url:'https://www.tiktok.com/messages/',nativeOnly:true,icon:'<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="#101117"/><path fill="#25f4ee" d="M19 6h4c.4 3 2 4 5 4v4c-2 0-4-.7-5-1.8V22a7 7 0 1 1-7-7v4a3 3 0 1 0 3 3z"/><path fill="#fff" d="M18 5h4c.4 3 2 4 5 4v4c-2 0-4-.7-5-1.8V21a7 7 0 1 1-7-7v4a3 3 0 1 0 3 3z"/></svg>',login:{out:'input[type="password"]',outPath:'^/login',nativeOnly:true}},
  zalo:{label:'Zalo',url:'https://chat.zalo.me/',nativeOnly:true,icon:'<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#0068ff"/><path fill="#fff" d="M9 10.5h10.6v2.3l-7.2 8.2h7.4V23.5H8.6v-2.3l7.2-8.2H9z"/><circle cx="23" cy="21.6" r="2" fill="#fff"/></svg>'},
  x:{label:'X',url:'https://x.com/messages',nativeOnly:true,icon:'<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#000"/><path fill="#fff" d="M9 8.5h4.6l3.7 5.2 4.4-5.2h2.1l-5.6 6.6 6.8 9.4h-4.6l-4-5.6-4.8 5.6H9.5l6-7z"/><path fill="#000" d="M11.6 9.8l9.5 13.4h1.3L12.9 9.8z"/></svg>'},
};

const ICONS = {
  person: '<svg viewBox="0 0 24 24" fill="none" stroke="#3370ff" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M5 4h14M12 20V8M7 13l5-5 5 5"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16"/></svg>',
  close: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>',
};

const STATUS_TEXT = { idle: '点击打开', loading: '加载中', out: '未登录', in: '已登录', error: '加载失败',web:'网页版' };
const STATUS_CLASS = { idle: '', loading: 'loading', out: '', in: 'online', error: 'error',web:'' };

const $ = (id) => document.getElementById(id);
const platformListEl = $('platform-list');
const panelEl = $('panel');
const listEl = $('session-list');
const listEmptyEl = $('list-empty');
const searchEl = $('search');
const viewsEl = $('views');
const emptyEl = $('empty');
const ctxMenu = $('ctx-menu');

let accounts = [];          // [{ id, platform, seq, name, pinned, proxy, translate }]
let currentPlatform = 'whatsapp';
let accountListPlatform = null;
const activeByPlatform = {}; // 平台 -> 当前选中的会话 id
const unread = {};          // id -> 未读数
const status = {};          // id -> loading | out | in | error
const views = {};           // id -> <webview>
const heldViews = new Map();
const loginChecks = new Set();
let loadAllTimer = null;

function ensureView(acc) {
  if (acc && !views[acc.id]) createView(acc).catch(() => setStatus(acc.id, 'error'));
  return acc && views[acc.id];
}

function updateViewActivity() {
  const activity = [];
  for (const [id, view] of Object.entries(views)) {
    // AI accounts must keep rendering: Telegram virtualizes text and badges
    // when its guest view is visibility:hidden, even if timers stay awake.
    const working = heldViews.has(id) || !!window.shouldAccountStayOnline?.(id) || !!window.backupController?.keepOnline();
    view.classList.toggle('background-work', working);
    const awake = (!window.isInboxHome?.() && id === activeId()) || working || window.shouldAccountStayOnline?.(id) || window.keepAllSessionsOnline?.();
    try { activity.push({ id: view.getWebContentsId(), awake: !!awake }); } catch {}
  }
  window.api.setViewActivity?.(activity);
}

function holdView(id) {
  heldViews.set(id, (heldViews.get(id) || 0) + 1);
  updateViewActivity();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (heldViews.get(id) || 1) - 1;
    if (count) heldViews.set(id, count); else heldViews.delete(id);
    updateViewActivity();
  };
}
window.holdAccountView = holdView;

function loadAllViews(startup = false) {
  clearTimeout(loadAllTimer);
  if (!startup && !window.keepAllSessionsOnline?.()) return;
  const next = accounts.find((acc) => !views[acc.id]);
  if (next) {
    const release = holdView(next.id); const view = ensureView(next);
    const timer = setTimeout(release, 45000);
    view?.addEventListener('did-stop-loading', () => { clearTimeout(timer); release(); }, { once: true });
    loadAllTimer = setTimeout(() => loadAllViews(startup), 1000);
  }
  updateViewActivity();
}
const chats = {};           // id -> 当前打开的联系人 { key, title }
let ctxTarget = null;

const partitionOf = (id) => `persist:wa-${id}`;
const platformOf = (acc) => PLATFORMS[acc.platform] || PLATFORMS.whatsapp;

// 卡片副标题：Telegram 显示 @username，WhatsApp 显示电话号码；还没读到时显示编号
function accountTag(acc) {
  const me = acc.self || {};
  if (acc.platform === 'telegram' && (me.username || me.phone)) return me.username ? `@${me.username}` : `+${me.phone}`;
  if (acc.platform === 'whatsapp' && me.phone) return `+${me.phone}`;
  return `${platformOf(acc).label}-${pad(acc.seq)}`;
}
const pad = (n) => String(n).padStart(2, '0');
const accountIdentity = (acc) => {
  const me = acc.self || {};
  if (me.username) return `@${me.username}`;
  if (me.phone) return `+${String(me.phone).replace(/^\+/, '')}`;
  return `#${pad(acc.seq)}`;
};
const findAcc = (id) => accounts.find((a) => a.id === id);
const activeId = () => {
  const id = activeByPlatform[currentPlatform];
  return findAcc(id)?.platform === currentPlatform ? id : null;
};

window.blackcatAccountsCount = () => accounts.length;
function persist() {
  window.api.saveAccounts(accounts);
}

// 界面偏好（当前平台、选中会话、是否收起）只存在本机浏览器存储里
function saveUi() {
  try {
    localStorage.setItem('ui', JSON.stringify({
      currentPlatform, activeByPlatform, accountListPlatform, collapsed: panelEl.hidden, sideTab,
    }));
  } catch { /* 存不了就算了 */ }
}

function loadUi() {
  try {
    return JSON.parse(localStorage.getItem('ui')) || {};
  } catch {
    return {};
  }
}

// 当前平台的会话：置顶的在前，其余按创建顺序
function sessionsOf(platform) {
  const list = accounts.filter((a) => a.platform === platform);
  return [...list.filter((a) => a.pinned), ...list.filter((a) => !a.pinned)];
}

// ---------- webview ----------

function errorPage(title, detail) {
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(
    `<body style="background:#f5f6f8;color:#1f2329;font-family:'Microsoft YaHei',sans-serif;display:grid;place-items:center;height:100vh;margin:0;text-align:center">`
    + `<div><h2>${esc(title)}</h2><p style="color:#8a919f">${esc(detail)}</p>`
    + `<p style="color:#8a919f">点击会话卡片上的「刷新」重试</p></div></body>`,
  );
}

// 先给账号的 session 设好代理，再加载页面，保证第一个请求就走代理
async function loadView(acc) {
  const wv = views[acc.id];
  delete wv.dataset.failed;
  setStatus(acc.id, 'loading');
  await window.api.applyProxy(partitionOf(acc.id), acc.proxy);
  let url = platformOf(acc).url;
  if (acc.platform === 'line') {
    const r = await window.api.prepareLine(partitionOf(acc.id));
    if (!r.ok) {
      wv.dataset.failed = '1';
      setStatus(acc.id, 'error');
      wv.setAttribute('src', errorPage('LINE 加载失败', r.error));
      return;
    }
    url = r.url;
  }
  wv.setAttribute('src', url);
}

function createView(acc) {
  if (views[acc.id]) return Promise.resolve();
  const wv = document.createElement('webview');
  wv.setAttribute('partition', partitionOf(acc.id));
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('preload', window.api.webviewPreload);
  wv.setAttribute('webpreferences', 'backgroundThrottling=true');
  wv.dataset.id = acc.id;

  // 聊天页面里的翻译脚本：就绪时推送设置，切换联系人时更新翻译面板
  wv.addEventListener('ipc-message', (e) => {
    if (e.channel === 'wam:ready') { wv.dataset.inboxReady = '1'; pushTranslate(acc); }
    if(e.channel==='wam:message-notification')window.accountMessageAlerts?.notification(acc.id);
    if(e.channel==='wam:page-notification')window.accountMessageAlerts?.page(acc.id,e.args[0]);
    if (e.channel === 'wam:inbox') { window.accountMessageAlerts?.snapshot(acc.id,e.args[0]); window.conversationNotes?.setContext(acc.id, e.args[0]?.conversation || null); window.onInboxSnapshot?.(acc, e.args[0]); }
    if (e.channel === 'wam:inbox-result') window.onInboxResult?.(e.args[0]);
    if (e.channel === 'wam:conversation-changing') window.conversationNotes?.pause(acc.id,e.args[0]);
    if (e.channel === 'wam:chat') {
      chats[acc.id] = e.args[0];
      if (acc.id === activeId()) renderTranslatePanel();
    }
    if (e.channel === 'wam:quick-result') quickWaiters[acc.id]?.(e.args[0]);
    if (e.channel === 'wam:contacts') contactWaiters[e.args[0].reqId]?.(e.args[0]);
    if (e.channel === 'wam:bulk-result') bulkWaiters[e.args[0].jobId]?.(e.args[0]);
    if (e.channel === 'wam:self' && JSON.stringify(acc.self) !== JSON.stringify(e.args[0])) {
      acc.self = e.args[0];
      persist();
      renderList();
    }
    if (e.channel === 'wam:avatar' && acc.avatar !== e.args[0]) {
      acc.avatar = e.args[0];
      persist();
      renderList();
    }
  });
  wv.addEventListener('did-start-navigation',e=>{if(e.isMainFrame)window.accountMessageAlerts?.reset(acc.id);});
  wv.addEventListener('dom-ready', () => { pushTranslate(acc); updateViewActivity(); });

  // 各平台标题里都带未读数，如 "(3) WhatsApp"、"(2) Facebook"、"(5) LINE"
  wv.addEventListener('page-title-updated', (e) => {
    window.accountMessageAlerts?.title(acc.id,e.title);
  });
  wv.addEventListener('did-fail-load', (e) => {
    if (e.isMainFrame && e.errorCode !== -3) setStatus(acc.id, 'error');
  });
  wv.addEventListener('did-stop-loading', () => checkLogin(acc));

  viewsEl.appendChild(wv);
  views[acc.id] = wv;
  return loadView(acc);
}

function reloadView(id) {
  const wv = views[id];
  if (!wv) { ensureView(findAcc(id)); return; }
  if (wv.dataset.failed) loadView(findAcc(id));
  else {
    setStatus(id, 'loading');
    wv.reload();
  }
}

function setStatus(id, s) {
  if (status[id] === s) return;
  status[id] = s;window.accountMessageAlerts?.login(id,s);
  if (s === 'in') window.onAccountOnline?.(id);
  const el = listEl.querySelector(`[data-id="${id}"] .status`);
  if (el) {
    el.textContent = STATUS_TEXT[s];
    el.className = `status ${STATUS_CLASS[s]}`;
  }
  window.refreshAccountOverview?.();
}

async function checkLogin(acc) {
  const wv = views[acc.id];
  if (!wv || wv.dataset.failed || status[acc.id] === 'error' || loginChecks.has(acc.id)) return;
  const p = platformOf(acc).login;
  const script = `(() => {
    if (${JSON.stringify(p.outPath || '')} && new RegExp(${JSON.stringify(p.outPath || '^$')}).test(location.pathname)) return 'out';
    if (document.querySelector(${JSON.stringify(p.out)})) return 'out';
    if (${JSON.stringify(p.in || '')} && document.querySelector(${JSON.stringify(p.in || 'x')})) return 'in';
    if (document.readyState !== 'complete') return ${status[acc.id] === 'in' ? "'in'" : "'loading'"};
    return ${p.nativeOnly?"'web'":p.fallbackIn ? "'in'" : "'loading'"};
  })()`;
  try {
    loginChecks.add(acc.id);
    setStatus(acc.id, await wv.executeJavaScript(script));
  } catch { /* 页面还没准备好，下次再查 */ }
  finally { loginChecks.delete(acc.id); }
}

setInterval(() => accounts.filter((acc) => acc.id === activeId() || heldViews.has(acc.id) || window.keepAllSessionsOnline?.()).forEach(checkLogin), 8000);

// ---------- 渲染 ----------

function renderRail() {
  platformListEl.innerHTML = '';
  for (const [key, p] of window.visiblePlatforms().filter(key=>PLATFORMS[key]).map(key=>[key,PLATFORMS[key]])) {
    const b = document.createElement('button');
    b.className = 'platform-btn' + (key === accountListPlatform ? ' active' : '');
    b.dataset.platform = key;
    b.title = `${p.label}（${accounts.filter((a) => a.platform === key).length} 个会话）`;
    b.innerHTML = `${p.icon}<span class="count"></span>`;
    b.addEventListener('click', () => selectPlatform(key));
    platformListEl.appendChild(b);
  }
}

function renderList() {
  const previousScrollTop = listEl.scrollTop;
  const plat = PLATFORMS[currentPlatform];
  const home = accountListPlatform === null;
  $('panel-title').textContent = home ? (window.I18N?.t('所有账号') || '所有账号') : PLATFORMS[accountListPlatform].label;
  const q = searchEl.value.trim().toLowerCase();
  const all = home ? [...accounts].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)) : sessionsOf(accountListPlatform);
  const list = q ? all.filter((a) => a.name.toLowerCase().includes(q)) : all;

  listEl.innerHTML = '';
  for (const acc of list) {
    const li = document.createElement('li');
    li.className = 'session' + (acc.id === activeId() ? ' active' : '') + (acc.pinned ? ' pinned' : '');
    li.dataset.id = acc.id;
    const proxy = proxyOn(acc) ? ` · 🌐 ${acc.proxy.host}` : '';
    li.title = `${acc.name}\n${accountTag(acc)}${proxyOn(acc) ? `\n代理：${acc.proxy.protocol.toUpperCase()} ${acc.proxy.host}:${acc.proxy.port}` : '\n代理：未启用（本机网络）'}\n右键：更多操作`;
    const s = status[acc.id] || (views[acc.id] ? 'loading' : 'idle');
    li.innerHTML = `
      <span class="status ${STATUS_CLASS[s]}">${STATUS_TEXT[s]}</span>
      ${acc.pinned ? '<span class="pin-flag">置顶</span>' : ''}
      <div class="avatar">${acc.avatar ? `<img src="${acc.avatar}" alt="">` : ICONS.person}<span class="unread"></span></div>
      <div class="info"><div class="name"></div><div class="sub"></div></div>
      <div class="actions">
        <button class="icon-btn pin" data-act="pin" title="${acc.pinned ? '取消置顶' : '置顶'}">${ICONS.pin}</button>
        <button class="icon-btn" data-act="reload" title="刷新">${ICONS.reload}</button>
        <button class="icon-btn" data-act="settings" title="环境设置（代理）">${ICONS.globe}</button>
        <button class="icon-btn del" data-act="remove" title="删除会话">${ICONS.close}</button>
      </div>`;
    li.querySelector('.name').textContent = acc.name;
    const ai = window.accountAIIndicator?.(acc.id);
    if (ai) {
      li.classList.add('has-ai');
      const icon = document.createElement('span'); icon.className = `account-ai-icon ${ai.state}`; icon.textContent = ai.state === 'error' ? 'AI !' : 'AI'; icon.title = ai.title;
      icon.setAttribute('role', 'button'); icon.tabIndex = 0;
      icon.addEventListener('click', (event) => { event.stopPropagation(); window.openAccountAISettings?.(acc.id); });
      icon.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); window.openAccountAISettings?.(acc.id); } });
      li.append(icon);
    }
    const sub = li.querySelector('.sub');
    if (home) {
      const mark = document.createElement('span'); mark.className = 'account-platform-logo'; mark.innerHTML = platformOf(acc).icon; mark.title = platformOf(acc).label; mark.setAttribute('aria-label', platformOf(acc).label);
      const handle = document.createElement('span'); handle.textContent = `${accountIdentity(acc)}${proxy}`; handle.setAttribute('data-i18n-skip', ''); sub.append(mark, handle);
    } else sub.textContent = `${accountTag(acc)}${proxy}`;
    li.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) runAction(act, acc.id);
      else activate(acc.id);
    });
    li.addEventListener('dblclick', (e) => {
      if (!e.target.closest('[data-act]')) openSettings(acc.id, true);
    });
    li.addEventListener('contextmenu', (e) => openCtxMenu(e, acc.id));
    listEl.appendChild(li);
  }
  listEmptyEl.hidden = all.length > 0;
  listEmptyEl.innerHTML = q && all.length ? '没有匹配的会话' : '还没有会话<br>点击上方「新建会话」添加账号';
  if (q && all.length && !list.length) listEmptyEl.hidden = false;
  listEl.scrollTop = previousScrollTop;
  renderBadges();
  renderViews();
}

function renderBadges() {
  const perPlatform = {};
  let total = 0;
  for (const acc of accounts) {
    const n = unread[acc.id] || 0;
    perPlatform[acc.platform] = (perPlatform[acc.platform] || 0) + n;
    total += n;
  }
  const fmt = (n) => (n > 0 ? String(n) : '');
  for (const b of platformListEl.children) b.querySelector('.count').textContent = fmt(perPlatform[b.dataset.platform] || 0);
  for (const li of listEl.children) li.querySelector('.unread').textContent = fmt(unread[li.dataset.id] || 0);
  window.api.setTotalBadge(total);
  window.refreshAccountOverview?.();
}

// 只显示当前平台选中的那个 webview
function renderViews() {
  const selected = findAcc(activeId());
  const id = !window.isInboxHome?.() && selected?.platform === currentPlatform ? selected.id : null;
  if (id) ensureView(selected);
  for (const [vid, wv] of Object.entries(views)) {
    const active = vid === id;
    wv.classList.toggle('active', active);
    wv.setAttribute('aria-hidden', String(!active));
  }
  const plat = PLATFORMS[currentPlatform];
  emptyEl.hidden = !!id;
  $('empty-icon').innerHTML = plat.icon;
  $('empty-title').textContent = plat.label;
  $('empty-text').textContent = sessionsOf(currentPlatform).length
    ? '从左侧选择一个会话'
    : `还没有 ${plat.label} 会话，点击「新建会话」添加`;
  renderTranslatePanel();
  if (sideTab === 'quick') renderQuick();
  updateViewActivity();
}

const proxyOn = (acc) => acc.proxy?.enabled && acc.proxy.host && acc.proxy.port;

// ---------- 操作 ----------

function selectPlatform(key) {
  accountListPlatform = key;
  currentPlatform = key;
  if (findAcc(activeByPlatform[key])?.platform !== key) activeByPlatform[key] = sessionsOf(key)[0]?.id;
  setCollapsed(false);
  searchEl.value = '';
  if (activeId()) { activate(activeId()); return; }
  if (window.isInboxHome?.()) window.leaveInboxHome();
  renderRail();
  renderList();
  updateToolbar();
  accounts.forEach(pushTranslate);
  saveUi();
  if (activeId()) views[activeId()].focus();
}

function activate(id) {
  const selectedAccount = findAcc(id); if (!selectedAccount) return;
  const environmentOpen = !settingsEl.hidden;
  currentPlatform = selectedAccount.platform;
  activeByPlatform[currentPlatform] = id;
  window.onAccountNavigate?.(id);
  if (sideTab === 'contacts' && typeof ctAccount !== 'undefined') ctAccount = id;
  renderRail(); renderList(); updateToolbar();
  if (environmentOpen) openSettings(id);
  accounts.forEach(pushTranslate); // 只有当前账号翻译聊天记录
  for (const li of listEl.children) li.classList.toggle('active', li.dataset.id === id);
  renderViews();
  saveUi();
  if (views[id] && !window.isInboxHome?.() && !environmentOpen && !sideTab) views[id].focus();
}

window.I18N?.extend({ '连接新账号': 'Connect an account', '选择你要登录的平台': 'Choose a platform to sign in', '每个账号独立登录，聊天和设置分别保留。': 'Each account has its own sign-in, chats and settings.', '关闭': 'Close' });
const platformPicker = $('platform-picker');
function openPlatformPicker() {
  const options = $('platform-picker-options'); options.replaceChildren();
  for (const [key, platform] of window.visiblePlatforms().filter(key=>PLATFORMS[key]).map(key=>[key,PLATFORMS[key]])) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'platform-choice'; button.dataset.platform = key;
    const icon = document.createElement('span'); icon.className = 'platform-choice-icon'; icon.innerHTML = platform.icon; icon.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span'); name.textContent = platform.label;
    const arrow = document.createElement('span'); arrow.className = 'platform-choice-arrow'; arrow.textContent = '›'; arrow.setAttribute('aria-hidden', 'true');
    button.append(icon, name, arrow); button.addEventListener('click', () => { platformPicker.close(); newSession(key); }); options.append(button);
  }
  window.I18N?.apply(platformPicker); if (!platformPicker.open) platformPicker.showModal();
  options.querySelector('button')?.focus();
}
$('platform-picker-close').addEventListener('click', () => platformPicker.close());
platformPicker.addEventListener('click', (event) => { if (event.target !== platformPicker) return; const r = platformPicker.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) platformPicker.close(); });
function newSession(platform, options = {}) {
  const background = options.background === true;
  const maxAccounts = window.blackcatLicense?.limits?.accounts;
  if (maxAccounts >= 0 && accounts.length >= maxAccounts) {
    const message = `当前配套最多 ${maxAccounts} 个聊天账号。请先删除不用的账号，或联系客服加购账号。`;
    if (background) throw Error(message);
    toast(message, true);
    return;
  }
  const chosenPlatform = typeof platform === 'string' && Object.hasOwn(PLATFORMS, platform) ? platform : null;
  if (!chosenPlatform && (accountListPlatform === null || window.isInboxHome?.())) { openPlatformPicker(); return; }
  if (chosenPlatform && !background) { currentPlatform = chosenPlatform; if (accountListPlatform !== null) accountListPlatform = chosenPlatform; }
  const sessionPlatform = chosenPlatform || currentPlatform;
  const seq = Math.max(0, ...accounts.filter((a) => a.platform === sessionPlatform).map((a) => a.seq || 0)) + 1;
  const acc = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    platform: sessionPlatform,
    seq,
    name: `name-${pad(seq)}`,
  };
  accounts.push(acc);
  persist();
  createView(acc);
  if (!background) activeByPlatform[currentPlatform] = acc.id;
  renderRail();
  renderList();
  saveUi();
  // 新会话先打开环境设置：改名、需要代理的话在登录前就配好
  if (!background) openSettings(acc.id);
  return acc;
}

function togglePin(id) {
  const acc = findAcc(id);
  acc.pinned = !acc.pinned;
  // 新置顶的排到最前
  if (acc.pinned) accounts = [acc, ...accounts.filter((a) => a !== acc)];
  persist();
  renderList();
}

async function removeAccount(id, confirmed = false) {
  const acc = findAcc(id);
  if (!confirmed && !(await window.api.confirmRemove(acc.name))) return;
  views[id]?.remove();
  delete views[id];
  delete unread[id];
  delete status[id];
  accounts = accounts.filter((a) => a.id !== id);
  persist();
  if (quick.personal[id]) {
    window.api.quickDeleteFiles(withGroups(quick.personal[id]).flatMap((g) => g.items.flatMap((q) => q.files.map((file) => file.file))));
    delete quick.personal[id];
    saveQuick();
  }
  await window.api.clearData(partitionOf(id));
  if (activeByPlatform[acc.platform] === id) activeByPlatform[acc.platform] = sessionsOf(acc.platform)[0]?.id;
  renderRail();
  renderList();
  saveUi();
}

function runAction(act, id) {
  if (act === 'pin') togglePin(id);
  if (act === 'reload') reloadView(id);
  if (act === 'settings') openSettings(id);
  if (act === 'devtools') ensureView(findAcc(id))?.openDevTools();
  if (act === 'remove') removeAccount(id);
}

function setCollapsed(collapsed) {
  panelEl.hidden = collapsed;
  $('expand-btn').hidden = !collapsed;
  saveUi();
}

function openCtxMenu(e, id) {
  e.preventDefault();
  ctxTarget = id;
  ctxMenu.hidden = false;
  ctxMenu.style.left = `${e.clientX}px`;
  ctxMenu.style.top = `${Math.min(e.clientY, window.innerHeight - ctxMenu.offsetHeight - 8)}px`;
}

ctxMenu.addEventListener('click', (e) => {
  const act = e.target.dataset.act;
  if (!act) return;
  ctxMenu.hidden = true;
  runAction(act, ctxTarget);
});

document.addEventListener('click', (e) => {
  if (!ctxMenu.contains(e.target)) ctxMenu.hidden = true;
});

$('new-btn').addEventListener('click', newSession);
$('collapse-btn').addEventListener('click', () => setCollapsed(true));
$('expand-btn').addEventListener('click', () => setCollapsed(false));
$('search-btn').addEventListener('click', () => {
  searchEl.hidden = !searchEl.hidden;
  if (searchEl.hidden) {
    searchEl.value = '';
    renderList();
  } else searchEl.focus();
});
searchEl.addEventListener('input', renderList);

// ---------- 环境设置（名称 + 代理） ----------

const settingsEl = $('settings');
const settingsForm = $('settings-panel');
const nameInput = $('acc-name');
const px = {
  enabled: $('px-enabled'),
  fields: $('px-fields'),
  protocol: $('px-protocol'),
  host: $('px-host'),
  port: $('px-port'),
  user: $('px-user'),
  pass: $('px-pass'),
  smart: $('px-smart'),
  test: $('px-test'),
  result: $('px-result'),
};
let settingsTarget = null;
const environmentDrafts = new Map();

function showResult(text, kind) {
  px.result.textContent = text;
  px.result.className = kind;
}

function readForm() {
  return {
    enabled: px.enabled.checked,
    protocol: px.protocol.value,
    host: px.host.value.trim(),
    port: px.port.value.trim(),
    username: px.user.value.trim(),
    password: px.pass.value,
  };
}

function openSettings(id, focusName = false) {
  if (settingsTarget === id && !settingsEl.hidden) { if (focusName) nameInput.focus(); return; }
  if (settingsTarget && !settingsEl.hidden && settingsTarget !== id) environmentDrafts.set(settingsTarget, { name: nameInput.value, proxy: readForm(), smart: px.smart.value });
  if (window.isInboxHome?.()) window.leaveInboxHome();
  setSidePanel(null);
  const acc = findAcc(id);
  if (!acc) return;
  const draft = environmentDrafts.get(id);
  const p = draft?.proxy || acc.proxy || {};
  settingsTarget = id;
  $('settings-account').textContent = accountTag(acc);
  nameInput.value = draft?.name ?? acc.name;
  px.enabled.checked = !!p.enabled;
  px.protocol.value = p.protocol || 'http';
  px.host.value = p.host || '';
  px.port.value = p.port || '';
  px.user.value = p.username || '';
  px.pass.value = p.password || '';
  px.smart.value = draft?.smart || '';
  px.fields.disabled = !px.enabled.checked;
  window.accountMessageAlerts?.sync();$('account-sound-status').textContent='';
  showResult('', '');
  settingsEl.hidden = false;
  document.documentElement.style.setProperty('--toolbar-width', $('toolbar').getBoundingClientRect().width + 'px');
  document.querySelector('[data-tool="env"]').classList.add('active');
  if (focusName) {
    nameInput.focus();
    nameInput.select();
  }
}

function closeSettings(preserveDraft = false) {
  if(preserveDraft&&settingsTarget)environmentDrafts.set(settingsTarget,{name:nameInput.value,proxy:readForm(),smart:px.smart.value});else environmentDrafts.delete(settingsTarget);
  settingsEl.hidden = true;
  settingsTarget = null;
  document.querySelector('[data-tool="env"]').classList.remove('active');
}

// 识别常见代理格式：
//   socks5://user:pass@host:port   user:pass@host:port   host:port@user:pass
//   host:port:user:pass   host port user pass   host:port
function parseProxy(text) {
  let s = text.trim();
  if (!s) return null;
  let protocol;
  const scheme = s.match(/^(https?|socks5h?|socks)\s*:\/\//i);
  if (scheme) {
    protocol = /^socks/i.test(scheme[1]) ? 'socks5' : 'http';
    s = s.slice(scheme[0].length);
  }
  const splitOnce = (str) => {
    const i = str.indexOf(':');
    return i < 0 ? [str, ''] : [str.slice(0, i), str.slice(i + 1)];
  };
  let host, port, username = '', password = '';
  // 密码里也可能有 @，所以只有 @ 一侧恰好是 host:port 时才按 @ 格式处理
  const hostPort = /^[^:@\s]+:\d{1,5}$/;
  const last = s.lastIndexOf('@');
  const first = s.indexOf('@');
  if (last > 0 && hostPort.test(s.slice(last + 1))) {
    [username, password] = splitOnce(s.slice(0, last));
    [host, port] = splitOnce(s.slice(last + 1));
  } else if (first > 0 && hostPort.test(s.slice(0, first))) {
    [host, port] = splitOnce(s.slice(0, first));
    [username, password] = splitOnce(s.slice(first + 1));
  } else {
    const parts = s.split(/[\s|,;]+|:/).filter(Boolean);
    [host, port, username = ''] = parts;
    password = parts.slice(3).join(':');
  }
  port = (port || '').replace(/\/.*$/, '');
  if (!host || !/^\d{1,5}$/.test(port)) return null;
  return { protocol, host, port, username, password };
}

px.enabled.addEventListener('change', () => {
  px.fields.disabled = !px.enabled.checked;
});

px.smart.addEventListener('input', () => {
  const p = parseProxy(px.smart.value);
  if (!p) {
    showResult(px.smart.value.trim() ? '无法识别，请检查格式' : '', 'err');
    return;
  }
  if (p.protocol) px.protocol.value = p.protocol;
  px.host.value = p.host;
  px.port.value = p.port;
  px.user.value = p.username;
  px.pass.value = p.password;
  showResult(`已识别：${px.protocol.value.toUpperCase()} ${p.host}:${p.port}${p.username ? '（含账号密码）' : ''}`, 'info');
});

function validate(p) {
  if (!p.host) return '请填写主机地址';
  const port = Number(p.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return '端口应为 1-65535 的数字';
  return null;
}

px.test.addEventListener('click', async () => {
  const p = readForm();
  const err = validate(p);
  if (err) return showResult(err, 'err');
  px.test.disabled = true;
  showResult('正在检测…', 'info');
  const r = await window.api.testProxy(p);
  px.test.disabled = false;
  if (r.ok) showResult(`✓ 连接成功　出口 IP：${r.ip}　${r.location}${r.org ? `　${r.org}` : ''}`, 'ok');
  else showResult(`✗ 检测失败：${r.error}`, 'err');
});

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = readForm();
  if (p.enabled) {
    const err = validate(p);
    if (err) return showResult(err, 'err');
  }
  const acc = findAcc(settingsTarget);
  const id = acc.id;
  const proxyChanged = JSON.stringify(acc.proxy || null) !== JSON.stringify(p)
    && !(!acc.proxy?.enabled && !p.enabled);
  acc.name = nameInput.value.trim() || acc.name;
  acc.proxy = p;
  persist();
  closeSettings();
  renderList();
  // 代理变了才需要重新连接
  if (proxyChanged) {
    await window.api.applyProxy(partitionOf(id), p);
    reloadView(id);
  }
});

$('settings-close').addEventListener('click', closeSettings);
$('settings-cancel').addEventListener('click', closeSettings);
new ResizeObserver(() => document.documentElement.style.setProperty('--toolbar-width', $('toolbar').getBoundingClientRect().width + 'px')).observe($('toolbar'));
settingsEl.addEventListener('mousedown', (e) => {
  if (e.target === settingsEl) closeSettings();
});

// ---------- 翻译设置 ----------

const LANGS = [
  ['zh-CN', '简体中文'], ['zh-TW', '繁体中文'], ['yue', '粤语（广东话）'], ['en', '英语'], ['ja', '日语'], ['ko', '韩语'],
  ['es', '西班牙语'], ['pt', '葡萄牙语'], ['fr', '法语'], ['de', '德语'], ['ru', '俄语'], ['it', '意大利语'],
  ['ar', '阿拉伯语'], ['th', '泰语'], ['vi', '越南语'], ['id', '印尼语'], ['ms', '马来语'], ['ta', '泰米尔语'], ['tl', '菲律宾语'],
  ['jw', '爪哇语'], ['su', '巽他语'], ['ceb', '宿务语'],
  ['hi', '印地语'], ['bn', '孟加拉语'], ['ur', '乌尔都语'], ['pa', '旁遮普语'], ['te', '泰卢固语'], ['mr', '马拉地语'],
  ['gu', '古吉拉特语'], ['kn', '卡纳达语'], ['ml', '马拉雅拉姆语'], ['si', '僧伽罗语'],
  ['tr', '土耳其语'], ['fa', '波斯语'], ['he', '希伯来语'], ['ps', '普什图语'],
  ['nl', '荷兰语'], ['pl', '波兰语'], ['uk', '乌克兰语'], ['el', '希腊语'], ['cs', '捷克语'], ['ro', '罗马尼亚语'],
  ['hu', '匈牙利语'], ['sv', '瑞典语'], ['da', '丹麦语'], ['no', '挪威语'], ['fi', '芬兰语'], ['sk', '斯洛伐克语'],
  ['bg', '保加利亚语'], ['sr', '塞尔维亚语'], ['hr', '克罗地亚语'],
  ['km', '高棉语'], ['my', '缅甸语'], ['lo', '老挝语'], ['mn', '蒙古语'], ['kk', '哈萨克语'], ['uz', '乌兹别克语'],
  ['sw', '斯瓦希里语'], ['am', '阿姆哈拉语'], ['ha', '豪萨语'], ['yo', '约鲁巴语'], ['zu', '祖鲁语'], ['so', '索马里语'],
  ['ne', '尼泊尔语'], ['ne-Latn', '尼泊尔语（罗马字）'],
];
const LABELS = Object.fromEntries(LANGS);
const ROUTE_OPTS = [
  ['auto', '系统推荐'],
  ['google', 'Google 翻译'],
  ['lingva', 'Lingva Translate'],
  ['claude', 'Claude Haiku（AI）'],
];

const DEFAULT_TRANSLATE = {
  perContact: false,
  incoming: { enabled: true, target: 'zh-CN', route: 'auto', source: 'auto' },
  outgoing: { enabled: false, target: 'en', route: 'auto', source: 'auto' },
  realtime: false,
  contacts: {}, // 联系人 key -> { title, incoming, outgoing }
};

const tr = {
  panel: $('tr-panel'),
  perContact: $('tr-percontact'),
  realtime: $('tr-realtime'),
  scope: $('tr-scope'),
};
for (const dir of ['in', 'out']) {
  for (const f of ['enabled', 'target', 'route', 'source']) tr[`${dir}-${f}`] = $(`tr-${dir}-${f}`);
}

function fillSelect(sel, options) {
  sel.innerHTML = '';
  for (const [value, text, disabled] of options) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    o.disabled = !!disabled;
    sel.appendChild(o);
  }
}

for (const dir of ['in', 'out']) {
  fillSelect(tr[`${dir}-target`], LANGS);
  fillSelect(tr[`${dir}-route`], ROUTE_OPTS);
  fillSelect(tr[`${dir}-source`], [['auto', '自行检测'], ...LANGS]);
}

function translateOf(acc) {
  acc.translate ??= structuredClone(DEFAULT_TRANSLATE);
  acc.translate.contacts ??= {};
  return acc.translate;
}

function pushTranslate(acc) {
  try {
    const labels = Object.fromEntries(LANGS.map(([code, name]) => [code, window.I18N?.t(name) || name]));
    const translate = window.blackcatLicense?.limits?.features?.realtime === false ? { ...translateOf(acc), realtime: false } : translateOf(acc);
    views[acc.id]?.send('wam:settings', { translate, labels, active: !window.isInboxHome?.() && acc.id === activeId() && acc.platform === currentPlatform, inboxWatch: !!window.isInboxWatching?.(acc.id), aiWatch: !!window.shouldAccountStayOnline?.(acc.id), backupWatch: !!window.backupController?.keepOnline(), unreadWatch:true, locale: window.I18N?.locale || 'zh-CN', theme: document.documentElement.dataset.theme || 'light' });
  } catch { /* webview 还没就绪，就绪后会再推 */ }
}

// 当前面板编辑的是哪一份设置：开启粉丝独立翻译且打开了聊天 → 该联系人的（可能还没有）
function translateScope(acc) {
  const t = translateOf(acc);
  const c = chats[acc.id];
  const contactKey = t.perContact && c?.key ? c.key : null;
  return { t, c, contactKey, own: contactKey ? t.contacts[contactKey] : null };
}

function renderTranslatePanel() {
  const acc = findAcc(activeId());
  $('tr-empty').hidden = !!acc;
  $('tr-body').hidden = !acc;
  if (!acc) return;
  const { t, c, contactKey, own } = translateScope(acc);
  const view = own || t;

  $('tr-target').textContent = `会话：${acc.name}（${accountTag(acc)}）`
    + (c?.title ? `\n联系人：${c.title}` : '');
  tr.perContact.checked = t.perContact;
  tr.realtime.checked = t.realtime;

  tr.scope.innerHTML = '';
  if (t.perContact) {
    if (!contactKey) tr.scope.textContent = '还没打开聊天，下面修改的是默认设置';
    else if (own) {
      tr.scope.textContent = `正在编辑「${c.title || contactKey}」的单独设置`;
      const reset = document.createElement('button');
      reset.textContent = '恢复默认';
      reset.addEventListener('click', () => {
        delete t.contacts[contactKey];
        saveTranslate(acc);
      });
      tr.scope.appendChild(reset);
    } else tr.scope.textContent = `「${c.title || contactKey}」正在使用默认设置，修改后单独保存`;
  }

  for (const [dir, key] of [['in', 'incoming'], ['out', 'outgoing']]) {
    const v = view[key];
    tr[`${dir}-enabled`].checked = v.enabled;
    tr[`${dir}-target`].value = v.target;
    tr[`${dir}-route`].value = v.route;
    tr[`${dir}-source`].value = v.source;
    $(`tr-${dir}`).classList.toggle('off', !v.enabled);
  }
}

function saveTranslate(acc) {
  persist();
  pushTranslate(acc);
  renderTranslatePanel();
}

function readDir(dir) {
  return {
    enabled: tr[`${dir}-enabled`].checked,
    target: tr[`${dir}-target`].value,
    route: tr[`${dir}-route`].value,
    source: tr[`${dir}-source`].value,
  };
}

// 两组语言设置任一项变化：写进当前编辑的那一份
function onLanguageChange() {
  const acc = findAcc(activeId());
  if (!acc) return;
  const { t, c, contactKey } = translateScope(acc);
  const values = { incoming: readDir('in'), outgoing: readDir('out') };
  if (contactKey) t.contacts[contactKey] = { title: c.title, ...values };
  else Object.assign(t, values);
  saveTranslate(acc);
}

for (const dir of ['in', 'out']) {
  for (const f of ['enabled', 'target', 'route', 'source']) tr[`${dir}-${f}`].addEventListener('change', onLanguageChange);
}

tr.perContact.addEventListener('change', () => {
  const acc = findAcc(activeId());
  if (!acc) return;
  translateOf(acc).perContact = tr.perContact.checked;
  saveTranslate(acc);
});

tr.realtime.addEventListener('change', () => {
  const acc = findAcc(activeId());
  if (!acc) return;
  translateOf(acc).realtime = tr.realtime.checked;
  saveTranslate(acc);
});


$('tr-lingva').addEventListener('change', (e) => {
  const servers = e.target.value.split(/\s+/).filter(Boolean);
  window.api.setSettings({ lingvaServers: servers });
});

$('tr-test-btn').addEventListener('click', async () => {
  const out = $('tr-test-result');
  const text = $('tr-test-text').value.trim();
  if (!text) return;
  const v = readDir('in');
  out.className = '';
  out.textContent = '翻译中…';
  const r = await window.api.translate({ text, source: v.source, target: v.target, route: v.route });
  const engine = { google: 'Google 翻译', lingva: 'Lingva Translate', claude: 'Claude Haiku', local: window.I18N?.locale === 'en' ? 'Original text' : '原文直发' };
  out.className = r.ok ? 'ok' : 'err';
  out.textContent = r.ok
    ? `${r.text}（${engine[r.engine] || r.engine}，原文：${LABELS[r.detected] || r.detected}）${r.fallbackFrom ? `\n注意：${r.fallbackFrom}，已自动改用 Google 翻译` : ''}`
    : `失败：${r.error}`;
});
// Claude API Key 只在「设置 → API Key」里填写；翻译和 AI 面板只显示状态并跳转过去。
function showClaudeStatus(s) {
  $('tr-claude-status').textContent = s.usesOwnKey
    ? `已保存 Key（${s.claudeKeyHint}）。「系统推荐」会优先用 Claude Haiku，失败时改用 Google`
    : window.blackcatLicense ? '使用黑猫 AI 点数（Claude Haiku），点数用完时改用 Google' : '没有 Key 时不使用 Claude';
  $('api-claude-status').textContent = s.claudeKeySet ? `已保存 Key（${s.claudeKeyHint}）` : '尚未保存 Claude API Key';
  $('api-claude-status').classList.toggle('ok', !!s.claudeKeySet);
  $('api-claude-remove').hidden = !s.claudeKeySet;
  document.querySelectorAll('[name="claude-mode"]').forEach((r) => { r.checked = r.value === s.claudeMode; });
  $('claude-mode-note').textContent = s.claudeMode === 'own' && !s.claudeKeySet ? '还没有保存 Key，目前仍使用黑猫 AI 点数。请在下方保存 Key。'
    : s.usesOwnKey ? '现在：AI 使用你自己的 Claude Key，不扣黑猫点数。' : '现在：AI 使用黑猫点数，用量会显示在「账户」和后台。';
}
document.querySelectorAll('[name="claude-mode"]').forEach((r) => r.addEventListener('change', async () => {
  if (!r.checked) return;
  showClaudeStatus(await window.api.setSettings({ claudeMode: r.value }));
  window.inboxController?.refreshAI();
  window.dispatchEvent(new Event('blackcat:claude-mode'));
}));
window.openApiKeySettings = () => {
  if (!$('app-settings-dialog').open) $('app-settings-btn').click();
  document.querySelector('[data-settings-tab="apikey"]').click();
  $('api-claude-key').focus();
};
document.addEventListener('click', (e) => { if (e.target.closest('.open-api-settings')) window.openApiKeySettings(); });

// 保存后马上用一句话测试 Key 是否可用
$('api-claude-save').addEventListener('click', async () => {
  const key = $('api-claude-key').value.trim();
  if (!key) { $('api-claude-result').textContent = '请先输入 API Key'; return; }
  $('api-claude-save').disabled = true;
  try {
    const s = await window.api.setSettings({ claudeKey: key });
    $('api-claude-key').value = '';
    showClaudeStatus(s);
    window.inboxController?.refreshAI();
    $('api-claude-result').textContent = '正在测试…';
    const r = await window.api.translate({ text: 'Hello! How are you today?', source: 'auto', target: 'zh-CN', route: 'claude' });
    $('api-claude-result').textContent = r.ok && r.engine === 'claude'
      ? `Key 可用 ✓ 测试译文：${r.text}`
      : `Key 已保存，但测试失败：${r.ok ? r.fallbackFrom : r.error}`;
  } finally { $('api-claude-save').disabled = false; }
});
$('api-claude-remove').addEventListener('click', async () => {
  if (!confirm('删除已保存的 Claude API Key？Claude 翻译、AI 回复和黑猫助手将停止使用 Claude。')) return;
  showClaudeStatus(await window.api.setSettings({ claudeKey: '' }));
  window.inboxController?.refreshAI();
  $('api-claude-result').textContent = 'Key 已删除';
});

$('tr-test-text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('tr-test-btn').click();
});

// ---------- 快捷回复 ----------
// 个人：只属于当前会话；公共：所有会话共用。模板按分组存放，点模板就发到当前聊天。
// 数据：{ mode, public: [分组], personal: { 会话id: [分组] } }，分组 = { id, name, collapsed, items: [模板] }

let quick = { mode: 'direct', public: [], personal: {} };
let quickScope = 'personal';
let editing = null; // 编辑中的模板 { item, group, files, added }
const quickWaiters = {}; // 会话 id -> 等待发送结果

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const quickUrl = (file) => `${window.api.quickDir}/${encodeURIComponent(file)}`;
const kindOf = (f) => (f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : 'file');
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// 旧版本没有分组（直接是模板数组），统一放进“默认分组”
function withGroups(list) {
  if (!Array.isArray(list)) return [];
  if (list.length && !list[0].items) return [{ id: uid(), name: '默认分组', collapsed: false, items: list }];
  return list;
}

function quickGroups(scope = quickScope) {
  if (scope === 'public') return quick.public;
  const id = activeId();
  if (!id) return null;
  quick.personal[id] = withGroups(quick.personal[id]);
  return quick.personal[id];
}

function saveQuick() {
  window.api.quickSave(quick);
}

function thumb(f) {
  const kind = kindOf(f);
  let el;
  if (kind === 'image') {
    el = document.createElement('img');
    el.src = quickUrl(f.file);
  } else if (kind === 'video') {
    el = document.createElement('video');
    el.src = `${quickUrl(f.file)}#t=0.1`;
    el.muted = true;
    el.preload = 'metadata';
  } else {
    el = document.createElement('div');
    el.textContent = (f.name.includes('.') ? f.name.split('.').pop() : '文件').toUpperCase().slice(0, 4);
  }
  el.className = 'qr-thumb';
  el.title = f.name;
  return el;
}

let toastTimer = null;
function toast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.className = isError ? 'err' : '';
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 5000 : 2500);
}

// 起名小弹窗（Electron 不支持 window.prompt）
function askName(title, initial = '') {
  return new Promise((resolve) => {
    $('name-title').textContent = title;
    $('name-input').value = initial;
    $('name-modal').hidden = false;
    $('name-input').focus();
    $('name-input').select();
    const done = (value) => {
      $('name-modal').hidden = true;
      $('name-form').onsubmit = null;
      $('name-cancel').onclick = null;
      resolve(value);
    };
    $('name-form').onsubmit = (e) => {
      e.preventDefault();
      done($('name-input').value.trim() || null);
    };
    $('name-cancel').onclick = () => done(null);
  });
}

function quickItemEl(item, group) {
  const li = document.createElement('li');
  li.className = 'qr-item';
  li.title = '点击发送到当前聊天';
  li.innerHTML = `<div class="qr-text"></div><div class="qr-thumbs"></div>
    <div class="qr-item-actions">
      <button class="icon-btn" data-act="edit" title="编辑">${ICONS.edit}</button>
      <button class="icon-btn del" data-act="delete" title="删除">${ICONS.trash}</button>
    </div>`;
  li.querySelector('.qr-text').textContent = item.text;
  const thumbs = li.querySelector('.qr-thumbs');
  if (item.files.length) item.files.forEach((f) => thumbs.appendChild(thumb(f)));
  else thumbs.remove();
  li.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'edit') openQuickEditor(item, group);
    else if (act === 'delete') deleteQuick(item, group);
    else sendQuick(item, li);
  });
  return li;
}

function renderQuick() {
  document.querySelectorAll('.qr-scope-btn').forEach((b) => b.classList.toggle('active', b.dataset.scope === quickScope));
  document.querySelectorAll('input[name="qr-mode"]').forEach((r) => { r.checked = r.value === quick.mode; });
  const groups = quickGroups();
  const acc = findAcc(activeId());
  $('qr-hint').textContent = quickScope === 'public'
    ? '所有会话共用；点一条回复即发送到当前聊天'
    : acc ? `「${acc.name}」专用；点一条回复即发送到当前聊天` : '请先在左侧选择一个会话';

  const box = $('qr-groups');
  box.innerHTML = '';
  for (const group of groups || []) {
    const wrap = document.createElement('div');
    wrap.className = 'qr-group' + (group.collapsed ? ' collapsed' : '');
    wrap.innerHTML = `<div class="qr-group-head">
        <span class="caret">▼</span><span class="qr-group-name"></span><span class="qr-group-count">(${group.items.length})</span>
        <span class="qr-group-tools">
          <button class="icon-btn" data-act="add" title="在此分组添加回复">${ICONS.plus}</button>
          <button class="icon-btn" data-act="rename" title="重命名分组">${ICONS.edit}</button>
          <button class="icon-btn del" data-act="delete" title="删除分组">${ICONS.trash}</button>
        </span>
      </div>
      <ul class="qr-group-items"></ul>`;
    wrap.querySelector('.qr-group-name').textContent = group.name;
    wrap.querySelector('.qr-group-head').addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'add') openQuickEditor(null, group);
      else if (act === 'rename') renameGroup(group);
      else if (act === 'delete') deleteGroup(group);
      else {
        group.collapsed = !group.collapsed;
        saveQuick();
        wrap.classList.toggle('collapsed', group.collapsed);
      }
    });
    const ul = wrap.querySelector('.qr-group-items');
    for (const item of group.items) ul.appendChild(quickItemEl(item, group));
    if (!group.items.length) {
      const p = document.createElement('p');
      p.className = 'qr-group-empty';
      p.textContent = '空分组，鼠标移到分组名上点 ＋ 添加';
      ul.appendChild(p);
    }
    box.appendChild(wrap);
  }
  $('qr-empty').hidden = !groups || groups.length > 0;
  document.querySelector('.qr-actions').hidden = !groups || !groups.length;
}

async function sendQuick(item, li, guard = {}) {
  const id = activeId();
  if (!id) return toast('请先在左侧选择一个会话', true);
  li.classList.add('sending');
  toast(item.files.length ? '正在发送（附件较大时需要几秒）…' : '正在发送…');
  const result = new Promise((resolve) => {
    quickWaiters[id] = resolve;
    setTimeout(() => resolve({ ok: false, error: '发送超时' }), 90000);
  });
  const release = holdView(id);
  let r;
  try {
    views[id].send('wam:quick-send', { text: item.text, files: item.files, translate: quick.mode === 'translate', ...guard });
    r = await result;
  } catch (error) { r = { ok: false, error: error.message }; }
  finally { release(); }
  delete quickWaiters[id];
  li.classList.remove('sending');
  toast(r.ok ? (r.note || '已发送') : `发送失败：${r.error}`, !r.ok);return r;
}

function deleteQuick(item, group) {
  if (!window.confirm('删除这条快捷回复？')) return;
  group.items.splice(group.items.indexOf(item), 1);
  window.api.quickDeleteFiles(item.files.map((f) => f.file));
  saveQuick();
  renderQuick();
}

async function addGroup() {
  const groups = quickGroups();
  if (!groups) return toast('请先在左侧选择一个会话', true);
  const name = await askName('新建分组');
  if (!name) return;
  groups.push({ id: uid(), name, collapsed: false, items: [] });
  saveQuick();
  renderQuick();
}

async function renameGroup(group) {
  const name = await askName('重命名分组', group.name);
  if (!name) return;
  group.name = name;
  saveQuick();
  renderQuick();
}

function deleteGroup(group) {
  const n = group.items.length;
  if (!window.confirm(n ? `删除分组「${group.name}」及其中 ${n} 条回复？` : `删除分组「${group.name}」？`)) return;
  const groups = quickGroups();
  groups.splice(groups.indexOf(group), 1);
  window.api.quickDeleteFiles(group.items.flatMap((q) => q.files.map((f) => f.file)));
  saveQuick();
  renderQuick();
}

function openQuickEditor(item = null, group = null) {
  const groups = quickGroups();
  if (!groups) return toast('请先在左侧选择一个会话', true);
  editing = { item, group, files: item ? [...item.files] : [], added: [] };
  $('qr-modal-title').textContent = item ? '编辑快捷回复' : `添加快捷回复（${quickScope === 'public' ? '公共' : '个人'}）`;
  const sel = $('qr-group');
  sel.innerHTML = '';
  for (const g of groups) sel.add(new Option(g.name, g.id));
  if (!groups.length) sel.add(new Option('默认分组（新建）', ''));
  sel.value = group?.id || groups[0]?.id || '';
  $('qr-text').value = item?.text || '';
  $('qr-form-error').textContent = '';
  renderQuickFiles();
  $('qr-modal').hidden = false;
  $('qr-text').focus();
}

function renderQuickFiles() {
  const ul = $('qr-files');
  ul.innerHTML = '';
  for (const f of editing.files) {
    const li = document.createElement('li');
    li.appendChild(thumb(f));
    const name = document.createElement('span');
    name.className = 'fname';
    name.textContent = f.name;
    const size = document.createElement('span');
    size.className = 'fsize';
    size.textContent = fmtSize(f.size);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn';
    del.title = '移除';
    del.innerHTML = ICONS.close;
    del.addEventListener('click', () => {
      editing.files = editing.files.filter((x) => x !== f);
      renderQuickFiles();
    });
    li.append(name, size, del);
    ul.appendChild(li);
  }
}

function closeQuickEditor(saved) {
  // 没保存就丢掉这次新加的文件
  if (!saved && editing?.added.length) window.api.quickDeleteFiles(editing.added);
  editing = null;
  $('qr-modal').hidden = true;
}

$('qr-pick').addEventListener('click', async () => {
  const r = await window.api.quickPickFiles();
  editing.files.push(...r.files);
  editing.added.push(...r.files.map((f) => f.file));
  $('qr-form-error').textContent = r.skipped.length ? `超过 200MB，未添加：${r.skipped.join('、')}` : '';
  renderQuickFiles();
});

$('qr-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('qr-text').value.trim();
  if (!text && !editing.files.length) {
    $('qr-form-error').textContent = '请输入文字或添加附件';
    return;
  }
  const groups = quickGroups();
  let target = groups.find((g) => g.id === $('qr-group').value);
  if (!target) {
    target = { id: uid(), name: '默认分组', collapsed: false, items: [] };
    groups.push(target);
  }
  const keep = new Set(editing.files.map((f) => f.file));
  const dropped = [...(editing.item?.files.map((f) => f.file) || []), ...editing.added].filter((file) => !keep.has(file));
  if (dropped.length) window.api.quickDeleteFiles(dropped);

  if (editing.item) {
    Object.assign(editing.item, { text, files: editing.files });
    if (editing.group !== target) { // 换了分组
      editing.group.items.splice(editing.group.items.indexOf(editing.item), 1);
      target.items.push(editing.item);
    }
  } else {
    target.items.push({ id: uid(), text, files: editing.files });
  }
  target.collapsed = false;
  saveQuick();
  closeQuickEditor(true);
  renderQuick();
});

$('qr-cancel').addEventListener('click', () => closeQuickEditor(false));
$('qr-modal').addEventListener('mousedown', (e) => {
  if (e.target === $('qr-modal')) closeQuickEditor(false);
});
$('qr-add').addEventListener('click', () => openQuickEditor());
$('qr-add-empty').addEventListener('click', () => openQuickEditor());
$('qr-add-group').addEventListener('click', addGroup);
document.querySelectorAll('.qr-scope-btn').forEach((b) => b.addEventListener('click', () => {
  quickScope = b.dataset.scope;
  renderQuick();
}));
document.querySelectorAll('input[name="qr-mode"]').forEach((r) => r.addEventListener('change', () => {
  quick.mode = r.value;
  saveQuick();
}));

// ---------- 最右侧工具栏 + 工具面板 ----------

const TOOL_TITLES = { translate: '翻译设置', quick: '快捷设置', contacts: '联系人', notes: '对话备注', bulk: '群发消息' };
document.body.insertBefore(settingsEl, $('toolbar'));
const BULK_PLATFORMS = ['whatsapp', 'telegram'];
let sideTab = null;
let toolbarPlatform = currentPlatform;

function setSidePanel(tab) {
  if (tab && window.isInboxHome?.()) window.leaveInboxHome();
  if (tab && !settingsEl.hidden) closeSettings(true);
  sideTab = TOOL_TITLES[tab] ? tab : null;
  if (sideTab === 'contacts' && typeof ctAccount !== 'undefined' && activeId()) ctAccount = activeId();
  tr.panel.hidden = !sideTab;
  document.querySelectorAll('.tool-btn[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === sideTab));
  $('tool-title').textContent = TOOL_TITLES[sideTab] || '';
  document.querySelectorAll('.side-section').forEach((sec) => { sec.hidden = sec.id !== `tab-${sideTab}`; });
  tr.panel.classList.toggle('wide', sideTab === 'bulk');
  if (sideTab === 'quick') renderQuick();
  if (sideTab === 'notes') window.conversationNotes?.refreshAccount();
  if (sideTab === 'contacts') renderContacts();
  if (sideTab === 'bulk') renderBulkPanel();
  saveUi();
}

function updateToolbar() {
  const platformChanged = toolbarPlatform !== currentPlatform; toolbarPlatform = currentPlatform;
  const nativeOnly=!!PLATFORMS[currentPlatform].nativeOnly;document.querySelectorAll('.tool-btn[data-tab]').forEach(b=>b.hidden=nativeOnly);$('ai-tool-btn').hidden=nativeOnly;const ok = !nativeOnly&&BULK_PLATFORMS.includes(currentPlatform);if(nativeOnly&&sideTab)setSidePanel(null);
  if (sideTab === 'notes') window.conversationNotes?.refreshAccount();
  document.querySelectorAll('.tool-btn.wa-tg').forEach((b) => { b.hidden = !ok; });
  if (!ok && (sideTab === 'contacts' || sideTab === 'bulk')) setSidePanel(null);
  else if (sideTab === 'contacts') renderContacts();
  else if (sideTab === 'bulk') {
    if (platformChanged) draft = null;
    renderBulkPanel();
  }
}

// 再点一次当前工具就收起面板
document.querySelectorAll('.tool-btn[data-tab]').forEach((b) => b.addEventListener('click', () => {
  setSidePanel(sideTab === b.dataset.tab ? null : b.dataset.tab);
}));
document.querySelector('.tool-btn[data-tool="env"]').addEventListener('click', () => {
  const id = activeId();
  if (!id) return toast('请先在左侧选择一个会话', true);
  if(!settingsEl.hidden&&settingsTarget===id)closeSettings(true);else openSettings(id);
});
$('tr-close').addEventListener('click', () => setSidePanel(null));

// 快捷键：Ctrl+1~9 切换当前平台的会话，Ctrl+N 新建会话，Ctrl+F 搜索
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    ctxMenu.hidden = true;
    if (!settingsEl.hidden) closeSettings();
  }
  if (!e.ctrlKey) return;
  const list = sessionsOf(currentPlatform);
  if (/^[1-9]$/.test(e.key) && list[e.key - 1]) {
    e.preventDefault();
    activate(list[e.key - 1].id);
  } else if (e.key.toLowerCase() === 'n') {
    e.preventDefault();
    newSession();
  } else if (e.key.toLowerCase() === 'f') {
    e.preventDefault();
    searchEl.hidden = false;
    searchEl.focus();
  }
});

(async () => {
  await window.systemPreferencesReady;accounts = await window.api.loadAccounts();
  // 兼容旧数据：没有平台的是 WhatsApp，没有编号的按顺序补编号
  for (const acc of accounts) {
    acc.platform = PLATFORMS[acc.platform] ? acc.platform : 'whatsapp';
    if (!acc.seq) acc.seq = Math.max(0, ...accounts.filter((a) => a.platform === acc.platform).map((a) => a.seq || 0)) + 1;
    translateOf(acc);
  }
  persist();
  window.api.getSettings().then((s) => {
    $('tr-lingva').value = s.lingvaServers.join('\n');
    showClaudeStatus(s);
  });

  quick = { mode: 'direct', public: [], personal: {}, ...(await window.api.quickLoad()) };
  quick.public = withGroups(quick.public);
  const ui = loadUi();
  if (PLATFORMS[ui.currentPlatform]) currentPlatform = ui.currentPlatform;
  accountListPlatform = PLATFORMS[ui.accountListPlatform] ? ui.accountListPlatform : null;
  for (const key of Object.keys(PLATFORMS)) {
    const saved = ui.activeByPlatform?.[key];
    activeByPlatform[key] = findAcc(saved)?.platform === key ? saved : sessionsOf(key)[0]?.id;
  }
  if (!activeId() && accounts.length) currentPlatform = accounts[0].platform;
  setCollapsed(!!ui.collapsed);
  renderRail();
  renderList();
  setSidePanel(ui.sideTab || (ui.translateOpen ? 'translate' : null));
  updateToolbar();
  loadAllViews(true);
  window.blackcatAccountsReady = true;
  window.dispatchEvent(new Event('blackcat:accounts-ready'));
})();

window.addEventListener('blackcat:preferences', () => {
  renderRail(); renderList(); updateToolbar();
  accounts.forEach(pushTranslate);
  loadAllViews();
  updateViewActivity();
});
