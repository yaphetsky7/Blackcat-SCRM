// Unified inbox bridge: rendered conversation data only; no credentials or private HTTP APIs.
function installInboxBridge(deps) {
  const { ipc, getConfig, getAdapter, getComposer, getBoxText, putBoxText, click, pause, sendOnce, isSending } = deps;
  const digest = (text) => { let h = 2166136261; for (const c of String(text)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const plain = (element, strip = '') => {
    if (!element) return '';
    const copy = element.cloneNode(true);
    copy.querySelectorAll('.wam-tr,.wam-float,.wam-send-hint,script,style').forEach((n) => n.remove());
    if (strip) copy.querySelectorAll(strip).forEach((n) => n.remove());
    return (copy.textContent || '').replace(/\s+/g, ' ').trim();
  };
  function platform() {
    if (location.host === 'web.whatsapp.com') return 'whatsapp';
    if (location.host === 'web.telegram.org') return 'telegram';
    if (location.host.endsWith('facebook.com') && location.pathname.startsWith('/messages')) return 'facebook';
    if (location.protocol === 'chrome-extension:') return 'line';
    return '';
  }
  const selectors = {
    whatsapp: '#pane-side [role="row"], #pane-side [role="listitem"]',
    telegram: '.chat-list .ListItem, .chatlist .ListItem, .ListItem.Chat, .chatlist-chat, [data-chat-id]',
    facebook: 'a[href*="/messages/t/"], a[href*="/messages/e2ee/t/"]',
    line: '[class*="chatListItem" i], [class*="chatList-module__item" i], [data-chat-id]',
  };
  let lastOpened = null;
  let lastSnapshot = '';
  let lastRows = new Map();
  let lastThread = null;
  let watching = false;
  let lastTop = '';
  let scrollQuietAfter = 0;
  const rowNodes = new Map();
  function recentClock(value) {
    const m = String(value).match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i); if (!m) return false;
    let hours = Number(m[1]); const minutes = Number(m[2]); if (minutes > 59 || hours > (m[3] ? 12 : 23)) return false;
    if (m[3]) hours = hours % 12 + (/PM/i.test(m[3]) ? 12 : 0);
    const now = new Date(); const diff = (now.getHours() * 60 + now.getMinutes() - hours * 60 - minutes + 1440) % 1440;
    return diff <= 1;
  }
  function privateType(row, key) {
    const explicit = row?.closest?.('[data-chat-type]')?.getAttribute('data-chat-type');
    if (explicit === 'private' || explicit === 'user') return true;
    if (explicit === 'group' || explicit === 'channel') return false;
    if (/@g\.us|@broadcast/.test(key)) return false;
    if (/@(?:c\.us|s\.whatsapp\.net|lid)/.test(key)) return true;
    if (platform() === 'telegram') {
      const peer = key.replace(/^.*#/, '');
      if (/^-\d+$/.test(peer)) return false;
      if (/^\d+$/.test(peer)) return true;
    }
    if (row?.querySelector?.('[data-icon*="group"], [aria-label*="group" i], [aria-label*="群组"], [class*="groupIcon" i]')) return false;
    if (platform() === 'facebook') {
      const main = document.querySelector('[role="main"]');
      if (main?.querySelector('[aria-label*="members" i], [aria-label*="群成员"], [aria-label*="group details" i]')) return false;
      const profile = main?.querySelector('h2 a[href], header a[href], a[href*="profile.php?id="]');
      if (profile) { try { const url = new URL(profile.getAttribute('href'), location.href); if (url.hostname.endsWith('facebook.com') && !/^\/(messages|groups|login)/.test(url.pathname)) return true; } catch {} }
    }
    return null;
  }
  function conversationRows(allRows = false) {
    const p = platform();
    if (!p) return [];
    const result = []; const seen = new Set(); rowNodes.clear();
    for (const row of document.querySelectorAll(selectors[p])) {
      if (allRows && !row.getClientRects().length) continue;
      if (row.closest('header, [contenteditable="true"], .wam-float')) continue;
      const titleNode = row.querySelector(p === 'whatsapp' ? 'span[title], [dir="auto"]' : p === 'telegram' ? '.fullName, h3, .title, [class*="title"]' : p === 'facebook' ? '[dir="auto"], span' : '[class*="name" i], [class*="title" i]');
      const title = (titleNode?.getAttribute('title') || plain(titleNode) || plain(row).split('\n')[0]).trim().slice(0, 150);
      if (!title) continue;
      const link = row.matches('a[href]') ? row : row.querySelector('a[href]');
      let href = link?.getAttribute('href') || '';
      const dataId = row.getAttribute('data-chat-id') || row.getAttribute('data-peer-id') || row.getAttribute('data-id') || '';
      let key = dataId || href || `title:${title}`;
      if (p === 'facebook' && href) { try { key = new URL(href, location.href).pathname; } catch {} }
      if (p === 'telegram' && href.includes('#')) key = href.slice(href.indexOf('#'));
      if (seen.has(key)) { if (String(key).startsWith('title:')) { const old = result.find(r => r.key === key); if (old) old.ambiguous = true; } continue; }
      seen.add(key);
      // Prefer the actual text to its subtitle container (which includes an
      // unread badge), and never mistake LastMessageMeta for message content.
      const previewNode = row.querySelector('.last-message-summary, .last-message') || row.querySelector('.subtitle, [class*="preview" i], [class*="text-secondary" i]');
      const lines = (row.innerText || row.textContent || '').split('\n').map((s) => s.trim()).filter((s) => s && s !== title);
      const previewText = plain(previewNode, '[class*="unread" i], .badge, .Badge, .LastMessageMeta, .last-message-meta, time') || lines.filter((s) => !/^\d{1,2}:\d{2}(?:\s*[AP]M)?$/i.test(s) && !/^\d+$/.test(s)).slice(-1)[0] || '';
      const preview = (/^\d{1,2}:\d{2}(?:\s*[AP]M)?$/i.test(previewText) ? '' : previewText).slice(0, 500);
      const messageStamp = plain(row.querySelector('.LastMessageMeta .time, time'));
      const badge = row.querySelector('[aria-label*="unread" i], [aria-label*="未读"], [class*="unread" i], .badge, [data-unread-count]');
      const unreadText = badge?.getAttribute('data-unread-count') || badge?.getAttribute('aria-label') || plain(badge);
      const unread = badge ? Math.min(9999, Number((unreadText?.match(/\d+/) || [])[0]) || 1) : 0;
      const ref = { key: String(key).slice(0, 400), title, href: href.slice(0, 1000), dataId: dataId.slice(0, 400), privateChat: privateType(row, String(key)) };
      rowNodes.set(ref.key, row);
      result.push({ ...ref, preview, messageStamp, unread, updatedAt: Date.now() });
      if (!allRows && result.length >= 200) break;
    }
    return result;
  }
  function currentRef(rows = conversationRows()) {
    const ad = getAdapter();
    if (!ad) return null;
    const current = ad.chat?.() || {};
    const sameOpened = lastOpened && (platform() === 'facebook' ? location.pathname === lastOpened.key : platform() === 'telegram' ? location.hash === lastOpened.key : current.title && current.title === lastOpened.title);
    if (sameOpened) { const { updatedAt, ...live } = rows.find((r) => r.key === lastOpened.key) || {}; const { updatedAt: ignored, ...identity } = lastOpened; return { ...identity, ...live }; }
    if (platform() === 'facebook') return { key: location.pathname, title: current.title || rows.find((r) => r.key === location.pathname)?.title || '', privateChat: privateType(document.querySelector('[role="main"]'), location.pathname) };
    if (platform() === 'telegram' && location.hash) return { key: location.hash, title: current.title || rows.find((r) => r.key === location.hash)?.title || '', privateChat: privateType(document.querySelector('#MiddleColumn, .MiddleColumn, .middle-column'), location.hash) };
    const matches = rows.filter((r) => r.title === current.title);
    if (matches.length === 1) return { ...matches[0] };
    return current.title ? { key: `title:${current.title}`, title: current.title, privateChat: null } : null;
  }
  function direction(element) {
    const explicit = element.closest('[data-direction]')?.getAttribute('data-direction');
    if (['incoming', 'outgoing'].includes(explicit)) return explicit;
    if (element.closest('.message-out, .Message.own, .Message.is-outgoing, [data-is-outgoing="true"], [class*="messageOwn" i], [class*="message-out" i]')) return 'outgoing';
    if (element.closest('.message-in, .Message:not(.own):not(.is-outgoing), [data-is-outgoing="false"], [class*="message-in" i]')) return 'incoming';
    const main = document.querySelector('[role="main"], [class*="chatroomContent" i]');
    const box = element.getBoundingClientRect(); const parent = main?.getBoundingClientRect();
    if (parent?.width && box.width && box.width < parent.width * .8) return box.left + box.width / 2 > parent.left + parent.width / 2 ? 'outgoing' : 'incoming';
    return 'unknown';
  }
  function noteConversation(ref, rows) {
    if (!ref?.key || !getComposer(getAdapter()) || (platform() === 'facebook' && !/^\/messages\/(?:e2ee\/)?t\/[^/]+/.test(ref.key))) return null;
    let stable = ref.key;
    if (platform() === 'whatsapp') {
      const jid = [...document.querySelectorAll('#main [data-id]')].map(node => (node.getAttribute('data-id') || '').match(/^(?:true|false)_(\d+(?:-\d+)?@(?:c\.us|s\.whatsapp\.net|lid|g\.us))_/)?.[1]).find(Boolean);
      if (jid) stable = jid;
    }
    if (stable.startsWith('title:') && (rows.filter(r => r.title === ref.title).length > 1 || rows.some(r => r.title === ref.title && r.ambiguous))) return { title: ref.title, ambiguous: true };
    return { key: `${platform()}:${stable}`, title: ref.title || '当前对话' };
  }
  function thread(ref) {
    const ad = getAdapter();
    if (!ad) return [];
    const result = []; const seen = new Set();
    for (const element of document.querySelectorAll(ad.messages)) {
      if (element.closest('[contenteditable="true"], .wam-tr, .wam-float') || ad.skip?.(element) || (ad.leafOnly && element.querySelector(ad.messages))) continue;
      const text = plain(element, ad.strip || '');
      if (!text || text.length > 10000) continue;
      const node = element.closest('[data-message-id], [data-mid], [data-id], [data-item-id], .Message[id]');
      const dir = direction(element);
      const messageId = node?.getAttribute('data-message-id') || node?.getAttribute('data-mid') || node?.getAttribute('data-id') || node?.getAttribute('data-item-id') || node?.id || `${dir}:${digest(text)}`;
      if (seen.has(messageId)) continue;
      seen.add(messageId);
      if (ref.privateChat === null && platform() === 'whatsapp') {
        if (/@g\.us|@broadcast/.test(messageId)) ref.privateChat = false;
        else if (/@(?:c\.us|s\.whatsapp\.net|lid)/.test(messageId)) ref.privateChat = true;
      }
      result.push({ id: String(messageId).slice(0, 500), text, direction: dir });
    }
    return result.slice(-120);
  }
  function snapshot(force = false) {
    const config = getConfig();
    if (!platform() || (!config?.active && !config?.inboxWatch && !config?.aiWatch && !config?.backupWatch && !force)) return null;
    const rows = conversationRows(); const ref = currentRef(rows); const messages = ref ? thread(ref) : [];
    const events = [];
    const aiWatch = config?.aiWatch === true;
    if (aiWatch && watching) {
      for (const row of rows) {
        const old = lastRows.get(row.key);
        const changedText = old?.preview && row.preview && row.preview !== old.preview;
        const changedStamp = old?.messageStamp && recentClock(row.messageStamp) && row.messageStamp !== old.messageStamp && row.preview;
        // Unread badges are not reliable when Telegram considers a background
        // session read. A changed preview is a hint, never permission to send:
        // the host still reads the thread and verifies its newest incoming ID.
        if (old && ((row.unread > old.unread) || changedText || changedStamp)) events.push({ type: 'hint', ref: row, preview: row.preview, at: Date.now() });
      }
      if (Date.now() > scrollQuietAfter && rows[0]?.unread > 0 && !lastRows.has(rows[0].key) && lastTop && rows.some((r) => r.key === lastTop)) events.push({ type: 'hint', ref: rows[0], preview: rows[0].preview, at: Date.now() });
      const last = messages[messages.length - 1];
      if (ref && lastThread?.key === ref.key && last?.direction === 'incoming' && last.id !== lastThread.lastId && messages.some((m) => m.id === lastThread.lastId)) events.push({ type: 'thread', ref, incomingId: last.id, at: Date.now() });
    }
    watching = aiWatch;
    lastRows = new Map(rows.map((row) => [row.key, row])); lastTop = rows[0]?.key || '';
    lastThread = ref && messages.length ? { key: ref.key, lastId: messages[messages.length - 1].id } : null;
    const conversation = noteConversation(ref, rows);
    const data = { platform: platform(), conversations: rows, current: ref, conversation, messages, events, at: Date.now() };
    const key = digest(JSON.stringify({ rows: rows.map(({ updatedAt, ...r }) => r), ref, conversation, messages }));
    if (force || events.length || key !== lastSnapshot) { lastSnapshot = key; ipc.sendToHost('wam:inbox', data); }
    return data;
  }
  let commandBusy = false;
  async function open(ref, allRows = false) {
    const rows = conversationRows(allRows); const current = currentRef(rows);
    const ad = getAdapter(); const composer = ad && getComposer(ad);
    if (composer && getBoxText(composer) && current?.key !== ref.key) throw new Error('原会话有未发送的草稿，请先处理');
    if (current?.key === ref.key && composer) { lastOpened = { ...current, ...ref }; return; }
    const exact = rowNodes.get(ref.key);
    const candidates = rows.filter((r) => r.key === ref.key || (ref.href && r.href === ref.href) || (ref.dataId && r.dataId === ref.dataId));
    const byTitle = rows.filter((r) => r.title === ref.title);
    const match = exact || (candidates.length === 1 ? rowNodes.get(candidates[0].key) : byTitle.length === 1 ? rowNodes.get(byTitle[0].key) : null);
    if (!match) throw new Error('会话尚未在网页列表加载，请刷新或加载更多会话');
    const target = platform() === 'telegram' && !match.matches('a, button, [role="button"]') ? match.querySelector('.ListItem-button, a[href], [role="button"]') || match : match.closest('a, button, [role="button"]') || match;
    click(target);
    const end = Date.now() + 12000;
    while (Date.now() < end) {
      await pause(180);
      const now = getAdapter()?.chat?.() || {};
      const urlMatch = platform() === 'facebook' ? location.pathname === ref.key : platform() === 'telegram' ? location.hash === ref.key : false;
      if ((urlMatch || now.title === ref.title) && getComposer(getAdapter())) { lastOpened = { ...ref }; return; }
    }
    throw new Error('打开会话超时，请在原平台确认已登录');
  }
  ipc.on('wam:inbox-command', async (_event, request) => {
    let result;
    if (commandBusy) return ipc.sendToHost('wam:inbox-result', { requestId: request.requestId, ok: false, error: '账号正在处理其他会话，请稍后重试' });
    commandBusy = true;
    try {
      if (request.action === 'snapshot') result = snapshot(true);
      else if (request.action === 'backup-step') result = await blackcatBackupGuest.step(request);
      else if (request.action === 'backup-status') result = { pending: blackcatBackupGuest.pending() };
      else if (request.action === 'backup-list') {
        if (getConfig()?.active && !request.idle) throw new Error('账号正在使用，历史扫描待补充');
        const before = conversationRows(true); let container = rowNodes.values().next().value?.parentElement;
        while (container && container !== document.body && !(container.clientHeight > 100 && container.scrollHeight > container.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(container).overflowY))) container = container.parentElement;
        const old = container?.scrollTop; if (container && container !== document.body) { container.scrollTop = request.reset?0:request.stay?container.scrollTop:container.scrollTop+Math.max(1, container.clientHeight * .70); container.dispatchEvent(new Event('scroll', { bubbles: true })); await pause(request.stay?100:1200); }
        const after = conversationRows(true); result = { rows: after, moved: !!container && container !== document.body && Math.abs(container.scrollTop-old)>2,position:container&&container!==document.body?container.scrollTop:0,atEnd:!container||container===document.body||container.scrollTop+container.clientHeight>=container.scrollHeight-3 };
      }
      else if (request.action === 'more') {
        const p = platform();
        const container = document.querySelector(p === 'whatsapp' ? '#pane-side' : p === 'telegram' ? '#LeftColumn .custom-scroll, .chat-list, .chatlist' : p === 'facebook' ? '[role="navigation"] [style*="overflow"], [role="grid"]' : '[class*="chatList" i]');
        if (!container) throw new Error('没有找到可滚动的会话列表');
        for (let i = 0; i < 5; i++) { container.scrollTop += Math.max(300, container.clientHeight * .8); await pause(400); snapshot(true); }
        result = snapshot(true);
      } else {
        if (isSending()) throw new Error('当前页面正在发送消息，请稍后重试');
        if (request.automatic && getConfig()?.active && document.hasFocus() && currentRef()?.key !== request.ref.key) throw new Error('人工正在查看其他会话，已转人工');
        await open(request.ref);
        const current = currentRef(); let messages = thread(current || request.ref);
        if (!current || current.key !== request.ref.key) throw new Error('会话发生变化，操作已取消');
        if (request.action === 'thread' && request.automatic) {
          const expected = String(request.expectedPreview || '').trim(); const end = Date.now() + 6000;
          const ready = () => { const last = messages.at(-1); return !!last && (!request.expectedIncomingId || last.id === request.expectedIncomingId) && (!expected || last.text.includes(expected) || expected.includes(last.text.slice(0, 40))); };
          while (!ready() && Date.now() < end) { await pause(150); if (currentRef()?.key !== request.ref.key) throw new Error('会话发生变化，操作已取消'); messages = thread(current); }
          if (!ready()) throw new Error('新消息正文尚未加载，未自动发送；请查看该会话');
        }
        if (request.action === 'send') {
          if (request.automatic && (current.privateChat === false || (current.privateChat !== true && !request.privateConfirmed))) throw new Error('无法确认是私聊，已取消自动发送');
          if (request.automatic && getConfig()?.aiWatch !== true) throw new Error('AI 回复已关闭');
          const last = messages[messages.length - 1];
          if (request.expectedIncomingId && (last?.id !== request.expectedIncomingId || last.direction !== 'incoming')) throw new Error('收到更新的消息或人工已回复，自动发送已取消');
          const ad = getAdapter(); const box = getComposer(ad);
          if (getBoxText(box)) throw new Error('输入框有未发送内容，已转人工');
          if (!String(request.text || '').trim() || request.text.length > 6000) throw new Error('消息为空或过长');
          if (!(await putBoxText(box, request.text))) throw new Error('无法填入消息，未发送');
          const accepted = await sendOnce(box, ad);
          if (!accepted) throw new Error('发送结果未确认，请人工检查；系统不会自动重发');
          result = { accepted: true, current, messages: thread(current) };
        } else result = { current, messages };
        snapshot(true);
      }
      ipc.sendToHost('wam:inbox-result', { requestId: request.requestId, ok: true, data: result });
    } catch (error) { ipc.sendToHost('wam:inbox-result', { requestId: request.requestId, ok: false, error: error.message }); }
    finally { commandBusy = false; }
  });
  let timer = null;
  const scheduleInbox = () => {
    if (timer || (!getConfig()?.active && !getConfig()?.inboxWatch && !getConfig()?.aiWatch && !getConfig()?.backupWatch)) return;
    timer = setTimeout(() => { timer = null; try { snapshot(); } catch {} }, 800);
  };
  window.addEventListener('DOMContentLoaded', () => {
    new MutationObserver((changes) => { if (changes.some((m) => !m.target.closest?.('.wam-tr,.wam-float,.wam-send-hint'))) scheduleInbox(); }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    scheduleInbox();
  });
  setInterval(scheduleInbox, 3000);
  document.addEventListener('pointerdown', () => ipc.send('attention:clear'), { capture: true, passive: true });
  document.addEventListener('pointerdown', event => { const row = event.target.closest?.(selectors[platform()] || '[data-no-conversation]'); const next = [...rowNodes].find(([,node]) => node === row);if(next&&next[0]!==currentRef()?.key){const ref=conversationRows().find(r=>r.key===next[0]);ipc.sendToHost('wam:conversation-changing',{key:platform()==='whatsapp'?undefined:platform()+':'+next[0],title:ref?.title});setTimeout(()=>snapshot(true),160);setTimeout(()=>snapshot(true),480);} }, { capture: true, passive: true });
  window.addEventListener('hashchange', () => { ipc.sendToHost('wam:conversation-changing'); scheduleInbox(); });
  document.addEventListener('scroll', () => { scrollQuietAfter = Date.now() + 2500; }, { capture: true, passive: true });
  return { snapshot, schedule: scheduleInbox, conversationRows, currentRef, thread, open };
}

const blackcatInboxBridge = installInboxBridge({
  ipc: ipcRenderer, getConfig: () => cfg, getAdapter: adapter, getComposer: findComposer, getBoxText: readBox,
  putBoxText: setBox, click: press, pause: sleep, isSending: () => busy,
  sendOnce: async (box, ad) => {
    box.focus(); const button = findSendButton(ad);
    ourClick = true;
    try { if (button) press(button.closest('button, [role="button"]') || button); else await webFrame.executeJavaScript(SEND_ENTER); }
    finally { ourClick = false; }
    await sleep(1000); return !readBox(box);
  },
});
