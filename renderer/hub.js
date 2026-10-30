(() => {
  const words = {
    '只回复新收到的文字私聊。资料不足时会告知客户需人工核实，并记录转人工原因；旧消息不补发。': 'Replies only to new private text messages. If information is missing, the customer receives a handoff notice and the reason is recorded for you. Old messages are not answered.',
    '学习新增资料': 'Learn new sources', '全部资料已学习': 'All sources learned', '已学习': 'Learned', '学习': 'Learn', '继续学习': 'Resume learning', '学习中…': 'Learning…',
    '只学习新增、更新或失败的资料，已学习的资料不会重复扣费。学习会将待学习资料发送给 Sonnet；链接或 API 更新后，可刷新来源再学习。': 'Only new, updated or failed sources are processed; learned sources are not sent again. Pending sources are sent to Sonnet. Refresh a link or API source when its content changes.',
    '当前账号的 AI 助手': 'AI assistant for this account', '自动回复': 'Auto reply', '保存设置': 'Save settings', '账号专属配置': 'Account settings', '设置回复方式': 'Configure replies', '使用的知识库': 'Knowledge base', '管理知识库': 'Manage knowledge', '每个账号选择一个知识库，作为回复依据。': 'Choose one knowledge base as the source for this account’s replies.', '回复风格与要求': 'Tone and instructions', '回复说明': 'Reply guide', '可编辑': 'Editable', '查看学习摘要': 'View learning summary', '学习后会显示建议的回复方式，也可以在右侧与 AI 讨论修改。': 'Learning adds a suggested reply guide. Discuss changes with AI on the right.', '编辑或采用修改稿后，保存设置才会用于自动回复。': 'Save your settings to apply edits or an adopted proposal to automatic replies.', '回复节奏与每日上限': 'Timing and daily limit', '只回复新收到的文字私聊。资料不足时转人工，旧消息不补发。': 'Replies only to new private text messages. Missing knowledge goes to a person; old messages are not answered.', '模型与连接设置': 'Models and connections', 'Sonnet 学习资料': 'Sonnet learns sources', 'Haiku 自动回复': 'Haiku replies', '回复共创': 'Shape your replies', '清空聊天': 'Clear chat', '仅清空当前账号的讨论，保留已保存的回复说明。': 'Clear this account’s discussion and keep the saved reply guide.', '告诉 AI 你想怎样回复，先查看建议，再决定是否采用。': 'Describe how you want to reply. Review the proposal before adopting it.', '更亲切一点': 'Make it warmer', '回答更简洁': 'Make it shorter', '先询问需求': 'Ask about needs first', '例如：先了解客户需求，再介绍适合的方案。': 'e.g. Ask about needs first, then recommend a suitable plan.', '预览 AI 如何回答，测试不会发送给客户。': 'Preview an AI answer. Tests are never sent to customers.', '重试失败项': 'Retry failed', '只重试失败的收件人，成功项不会重复发送。': 'Retry failed recipients only. Successful recipients will not be sent again.', '部分失败项可能已发送文字或附件。请先核对实际聊天记录，再确认重试这些失败项。成功项不会重发。': 'Some failed items may already have sent text or attachments. Check their chats before retrying. Successful recipients will not be sent again.',
    '学习与回复说明': 'Learning and reply guide', '回复说明（可直接修改）': 'Reply guide (editable)', '学习后会显示建议的回复方式，也可以在下方与 AI 讨论修改。': 'Learning adds a suggested reply guide. Discuss changes with AI below.', '修改说明或采用 AI 修改稿后，点击“保存账号 AI 设置”才会生效。新增价格、政策等事实，请更新知识库。': 'Edits take effect after you save this account’s AI settings. Update the knowledge base to add facts such as prices or policies.', '和 Sonnet 讨论怎么改': 'Discuss changes with Sonnet', '例如：语气亲切一点，先询问需求再报价；请给我示例。': 'e.g. Use a warmer tone, ask about needs before quoting, and show examples.', '发送修改要求': 'Send change request', '采用 AI 修改稿': 'Use AI proposal', '总结回复方式': 'Summarize reply approach',
    '点击账号查看消息；打开账号后，可在右侧设置 AI 回复。': 'Choose an account to view messages, then open AI replies on the right to configure that account.', '请先打开一个账号，再点击右侧 AI 回复。': 'Open an account first, then choose AI replies on the right.', '使用的知识库（只能选一个）': 'Knowledge base (choose one)', '显示当前账号已同步的会话，可加载更多。': 'Synced conversations for this account. Load more to continue.', '暂无已同步会话，正在读取账号消息。': 'No synced conversations yet. Reading this account’s messages.', '返回消息': 'Back to messages', '刷新消息': 'Refresh messages', '快捷设置': 'Quick settings',
    '学习使用 Sonnet，自动回复使用 Haiku。': 'Sonnet learns your sources; Haiku replies to customers.',
    '已配置转写 Key': 'Transcription key configured', '尚未配置转写 Key；图片学习不需要转写服务。': 'No transcription key configured. Images do not need transcription.', '添加文字内容': 'Add content', '添加 URL 链接': 'Add URL', '添加 Google Sheet': 'Add Google Sheet', '添加 API 资料': 'Add API source', '添加媒体': 'Add media', '选择并上传媒体': 'Choose media files', '读取指定工作表（gid）的内容。请提供可查看的分享链接，或在下方提供有权限的访问令牌。': 'Reads the selected worksheet (gid). Use a viewable share link or an authorized access token below.', '使用 GET 读取 JSON 数据；不会调用写入接口。可以指定 JSON 路径，只学习需要的内容。': 'Reads JSON with GET. Choose a JSON path to learn only the data you need.', '读取网页正文、PDF、图片或文件内容。需要登录或仅靠脚本显示的网页，请改用文件或 API。': 'Reads page text, PDFs, images or files. For pages requiring a login or JavaScript, use a file or API source.',
    '首页': 'Home', '所有账号': 'All accounts', '点击账号打开聊天，点击 AI 回复设置自动回复。': 'Open an account to chat, or choose AI replies to set up automation.', '返回首页': 'Back to home', '搜索账号': 'Search accounts', '暂无账号，请从左侧选择平台并新建会话。': 'No accounts yet. Choose a platform on the left and add an account.', '账号 AI 回复': 'Account AI replies', 'Sonnet 学习 · Haiku 回复': 'Sonnet learns · Haiku replies', '点击账号设置 AI 回复': 'Choose an account to set up AI replies', '点击上方账号卡片，再设置开启状态和知识库。': 'Choose an account card above, then enable AI replies and select knowledge bases.', '选择一个账号': 'Choose an account',
    '音视频转写设置': 'Audio and video transcription', '音视频先由转写服务提取语音，再交给 Sonnet 学习。视频同时读取最多 8 张抽样画面。转写服务单独计费。': 'Speech is transcribed before Sonnet learns it. Videos also include up to 8 sampled frames. Your transcription provider charges separately.', '转写 API 地址': 'Transcription API endpoint', '转写模型': 'Transcription model', '转写 API Key（留空保留原值）': 'Transcription API key (leave blank to keep it)', '保存转写设置': 'Save transcription settings',
    '添加学习来源；每份资料最多 25 MB，最多 30 份。学习完成后可分配给多个账号。': 'Add up to 30 sources, 25 MB each. Ready knowledge bases can be shared across accounts.', '文字内容': 'Content', 'URL 链接': 'URL', '文件': 'File', '媒体': 'Media', '添加来源': 'Add source', '资料名称（可选）': 'Source name (optional)', '学习内容': 'Content to learn', '粘贴产品介绍、价格、FAQ 或回复规则': 'Paste product information, prices, FAQs or reply rules', '链接 / API 地址': 'Link / API endpoint', '访问认证（可选）': 'Authentication (optional)', 'Bearer 访问令牌': 'Bearer access token', '自定义请求头（JSON）': 'Custom headers (JSON)', 'JSON 数据路径（可选，例如 data.products）': 'JSON data path (optional, e.g. data.products)', '仅学习视频画面（无语音，不调用转写 API）': 'Learn video frames only (no speech transcription)', '添加资料': 'Add source', '让 Sonnet 学习资料': 'Let Sonnet learn sources', '图片：JPG / PNG / GIF / WebP。音频：MP3 / WAV / M4A / OGG / FLAC。视频：MP4 / WebM / MOV。音视频默认学习语音，视频同时学习抽样画面。': 'Images: JPG, PNG, GIF, WebP. Audio: MP3, WAV, M4A, OGG, FLAC. Video: MP4, WebM, MOV. Audio is transcribed; video also includes sampled frames.', 'Sonnet 学习资料，Haiku 生成回复。点击学习会将所选资料发送给 Claude；链接和 API 保存读取时的内容，更新后需刷新并重新学习。': 'Sonnet learns sources; Haiku writes replies. Learning sends sources to Claude. Links and APIs are saved as snapshots; refresh and relearn to use updated data.',
    '账号 AI 设置已保存': 'Account AI settings saved', '同步完成；省内存模式下，未打开的账号需要刷新才能更新会话。': 'Sync complete. In memory saver mode, refresh unopened accounts to update their conversations.',
    '统一收件箱': 'Unified inbox', '在一个首页处理多个账号的会话': 'Manage conversations across your accounts in one place', '收件箱': 'Inbox', 'AI 回复': 'AI replies', '知识库': 'Knowledge bases',
    '同步全部账号': 'Sync all accounts', '搜索联系人、消息或账号': 'Search contacts, messages or accounts', '全部平台': 'All platforms', '全部账号': 'All accounts', '未读 / 待人工': 'Unread / Needs a person',
    '暂无已同步会话，点击「同步全部账号」读取。': 'No conversations synced yet. Click “Sync all accounts”.', '加载更多会话': 'Load more conversations', '选择一个会话': 'Select a conversation',
    '打开原平台': 'Open original app', '选择左侧会话即可在这里查看和回复。': 'Select a conversation to read and reply here.', '输入消息': 'Type a message', 'AI 建议': 'AI suggestion', '发送': 'Send',
    '我确认这是私聊，允许此会话 AI 回复': 'I confirm this is a private chat and allow AI replies here', '按账号设置 AI 回复': 'AI settings per account', '开启此账号的 AI 自动回复': 'Enable automatic AI replies for this account',
    '只回复开启后新收到的文字私聊；旧消息不补发。资料不足时转人工，不会编造答案。': 'Only new private text messages received after enabling are eligible. Older messages are not answered. Missing knowledge is handed to a person.',
    '首页显示已同步的会话，可点击「加载更多会话」继续读取。': 'The home shows synced conversations. Use “Load more conversations” to continue reading the list.',
    '使用的知识库（可多选）': 'Knowledge bases (select multiple)', '回复要求': 'Reply instructions', '例如：简洁友好，按客户的语言回复。': 'e.g. Be concise and friendly. Reply in the customer’s language.',
    '等待客户补充消息（秒）': 'Wait for follow-up messages (seconds)', '每日自动回复上限': 'Daily automatic reply limit', '保存账号 AI 设置': 'Save account AI settings',
    '开启后账号卡片显示 AI 图标。自动回复需要保持软件运行及账号在线。': 'Enabled accounts show an AI icon. Automatic replies require this app and account to remain online.',
    '保存 Key': 'Save key', '与翻译设置共用已加密保存的 Key。学习资料和生成回复会使用你的 API 额度。': 'Uses the encrypted key shared with Translation. Learning documents and generating replies uses your API credits.',
    '测试当前账号的知识库': 'Test this account’s knowledge', '测试只生成答案，不会发送给客户。': 'Tests generate an answer without sending it to a customer.', '输入客户可能问的问题': 'Enter a question a customer might ask',
    '测试 AI 回复': 'Test AI reply', 'AI 回复记录': 'AI reply history', '多个知识库': 'Knowledge bases', '知识库名称': 'Knowledge base name', '新建知识库': 'New knowledge base',
    '选择或新建一个知识库': 'Select or create a knowledge base', '删除知识库': 'Delete knowledge base', '支持 PDF、Excel（XLSX / XLSM / CSV）及 TXT。每个文件最多 20 MB。原文件不会被修改。': 'Supports PDF, Excel (XLSX / XLSM / CSV) and TXT. Maximum 20 MB per file. Original files are not modified.',
    '导入资料': 'Import documents', '让 Haiku 学习资料': 'Let Haiku learn documents', '点击学习会把所选资料发送给 Claude，整理为本地知识库。学习完成后可分配给多个账号。': 'Learning sends your selected documents to Claude to organize a local knowledge base. A ready base can be assigned to multiple accounts.',
  };
  window.I18N?.extend(words);
  const local = (zh, en) => window.I18N?.locale === 'en' ? en : zh;
  const t = (text) => window.I18N?.t(text) || text;
  let homeOpen = false; let tab = 'accounts'; let selected = null; let selectedBase = null;
  let selectedAIAccount = null; let homePlatform = ''; let sourceType = null; let sourceBusy = false;
  let scopedAccount = null; let aiReturnToMessages = true;
  const aiFormDrafts = new Map();
  let cache = { accounts: {}, threads: {} };
  let aiState = { keySet: false, bases: [], accounts: {}, jobs: [] };
  let aiDirty = false; let syncBusy = false; let renderTimer = null; let saveTimer = null; let lastMessages = '';
  let selectedLease = null; let selectedLeaseAccount = null;
  const waiters = new Map(); const autoPending = new Map(); const processing = new Set(); const accountErrors = new Map();
  let monitor = []; let monitorTimer = null;
  function trace(accountId, stage, detail = {}) {
    monitor.push({ at: Date.now(), accountId, stage, ...detail }); monitor = monitor.slice(-150);
    if (!monitorTimer) monitorTimer = setTimeout(() => { monitorTimer = null; window.api.storeSet('ai-monitor', monitor).catch(() => {}); }, 500);
  }
  const defaults = () => ({ enabled: false, ready: false, knowledgeBaseIds: [], instructions: '', replyGuide: '', guideChat: [], delaySec: 5, dailyLimit: 200, allowedChats: [] });
  const configOf = (id) => ({ ...defaults(), ...aiState.accounts[id] });
  const keyOf = (accountId, key) => `${accountId}\u001f${key}`;
  const sleepHub = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const safeText = (tag, text, className) => { const node = el(tag, text, className); node.setAttribute('data-i18n-skip', ''); return node; };
  const api = async (method, ...args) => { const result = await window.api[method](...args); if (!result?.ok) throw new Error(result?.error || '操作失败'); return result.data; };
  const notify = (text, error = false) => { $('hub-status').textContent = text; if (error) toast(text, true); };
  const accountLabel = (id) => { const acc = findAcc(id); return acc ? `${acc.name} · ${platformOf(acc).label}` : id; };
  function saveCache() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => window.api.storeSet('unified-inbox', cache), 800);
  }
  function scheduleRender() { if (!renderTimer) renderTimer = setTimeout(() => { renderTimer = null; render(); }, 80); }
  window.isInboxHome = () => homeOpen;
  window.shouldAccountStayOnline = (id) => configOf(id).enabled && configOf(id).ready;
  window.isInboxWatching = (id) => (homeOpen && tab === 'inbox' && scopedAccount === id) || window.shouldAccountStayOnline(id);
  window.accountAIIndicator = (id) => {
    const config = configOf(id);
    if (!config.enabled) return null;
    const last = aiState.jobs.find((job) => job.accountId === id && ['error', 'handoff', 'uncertain'].includes(job.status));
    if (accountErrors.has(id)) return { state: 'error', title: accountErrors.get(id) };
    if (!config.ready) return { state: 'waiting', title: local('AI 等待知识库就绪', 'AI is waiting for the knowledge base') };
    return { state: last && Date.now() - last.createdAt < 300000 ? 'waiting' : 'enabled', title: last?.reason || local('AI 自动回复已开启', 'Automatic AI replies enabled') };
  };
  function pushAll() { accounts.forEach(pushTranslate); updateViewActivity(); }
  function showHome(nextTab = tab) {
    if (nextTab === 'accounts') { saveAIFormDraft(); accountListPlatform = null; searchEl.value = ''; renderRail(); }
    homeOpen = true; tab = nextTab;
    if (tab === 'accounts') { scopedAccount = null; if (selectedLease) selectedLease(); selectedLease = null; selectedLeaseAccount = null; }
    setSidePanel(null); if (!settingsEl.hidden) closeSettings();
    document.body.classList.add('home-mode'); $('hub').hidden = false; $('home-btn').classList.toggle('active', tab === 'accounts');
    $('hub-status').textContent = tab === 'accounts' ? t('点击账号查看消息；打开账号后，可在右侧设置 AI 回复。') : tab === 'inbox' ? local('在这里查看和回复当前账号的消息。', 'Read and reply to this account’s messages here.') : local('学习使用 Sonnet，自动回复使用 Haiku。', 'Sonnet learns your sources; Haiku replies to customers.');
    renderList(); pushAll(); render(); window.api.clearAttention?.();
  }
  function leaveHome() {
    saveAIFormDraft();
    homeOpen = false; document.body.classList.remove('home-mode'); $('hub').hidden = true; $('home-btn').classList.remove('active'); $('ai-tool-btn').classList.remove('active');
    if (selectedLease) selectedLease(); selectedLease = null; selectedLeaseAccount = null;
    renderList(); pushAll();
  }
  window.showInboxHome = showHome;
  function saveAIFormDraft() {
    if (!homeOpen || !['ai', 'knowledge'].includes(tab) || !selectedAIAccount) return;
    if (aiDirty || $('ai-guide-request').value.trim()) aiFormDrafts.set(selectedAIAccount, { dirty: aiDirty, enabled: $('ai-enabled').checked, baseId: $('ai-base-checks').querySelector('input:checked')?.value, instructions: $('ai-instructions').value, replyGuide: $('ai-reply-guide').value, delay: $('ai-delay').value, daily: $('ai-daily').value, request: $('ai-guide-request').value });
  }
  window.onAccountNavigate = (accountId) => {if(PLATFORMS[findAcc(accountId)?.platform]?.nativeOnly){if(homeOpen)leaveHome();return;}
    if (homeOpen && ['ai', 'knowledge'].includes(tab)) {
      saveAIFormDraft(); selectedAIAccount = accountId; scopedAccount = accountId; aiDirty = false;
      $('ai-test-result').textContent = ''; $('ai-test-question').value = ''; $('ai-guide-status').textContent = ''; $('ai-guide-request').value = '';
      if (tab === 'ai') renderAIForm(true); render(); pushAll();
    } else if (homeOpen) leaveHome();
  };
  function contextAccountId() { return homeOpen ? tab === 'accounts' ? null : tab === 'inbox' ? scopedAccount : selectedAIAccount : activeId(); }
  window.openAccountAISettings = (accountId = contextAccountId()) => {if(PLATFORMS[findAcc(accountId)?.platform]?.nativeOnly)return toast(local('此平台目前提供原生网页版入口。','This platform currently provides its native web interface.'),true);
    if (!accountId || contextAccountId() !== accountId || !findAcc(accountId)) return toast(t('请先打开一个账号，再点击右侧 AI 回复。'), true);
    aiReturnToMessages = homeOpen ? tab === 'inbox' || aiReturnToMessages : false;
    saveAIFormDraft(); aiDirty = false; if (selectedAIAccount !== accountId) { $('ai-test-result').textContent = ''; $('ai-guide-request').value = ''; } selectedAIAccount = accountId; showHome('ai'); renderAIForm(true);
  };
  async function showAccountMessages(accountId) {
    const acc = findAcc(accountId); if (!acc) return;
    if (homeOpen) leaveHome(); scopedAccount = accountId; activate(accountId);
  }
  window.showAccountMessages = showAccountMessages;
  window.onAccountOnline = (accountId) => { if (homeOpen && tab === 'inbox' && scopedAccount === accountId) syncAccounts(); };
  window.leaveInboxHome = leaveHome;
  $('home-btn').addEventListener('click', () => showHome('accounts'));
  $('hub-back-messages').addEventListener('click', () => showAccountMessages(selectedAIAccount));
  $('ai-tool-btn').addEventListener('click',()=>{if(homeOpen&&['ai','knowledge'].includes(tab)){leaveHome();renderViews();}else window.openAccountAISettings();});
  document.querySelectorAll('#ai-navigation button').forEach((button) => button.addEventListener('click', () => { tab = button.dataset.aiTab; render(); }));
  $('home-search').addEventListener('input', renderAccounts);
  window.refreshAccountOverview = scheduleRender;
  document.addEventListener('pointerdown', () => window.api.clearAttention?.(), { capture: true, passive: true });
  window.addEventListener('focus', () => window.api.clearAttention?.());
  window.addEventListener('blackcat:preferences', () => { render(); if (homeOpen) { $('hub-status').textContent = tab === 'accounts' ? t('点击账号查看消息；打开账号后，可在右侧设置 AI 回复。') : tab === 'inbox' ? local('在这里查看和回复当前账号的消息。', 'Read and reply to this account’s messages here.') : local('学习使用 Sonnet，自动回复使用 Haiku。', 'Sonnet learns your sources; Haiku replies to customers.'); pushAll(); } });
  function receive(acc, data) {
    if (!data || data.platform !== acc.platform) return;
    if (configOf(acc.id).enabled) trace(acc.id, 'snapshot', { current: data.current?.key || '', messages: data.messages?.length || 0, incomingId: data.messages?.at(-1)?.id || '', direction: data.messages?.at(-1)?.direction || '', events: (data.events || []).map(e => ({type:e.type,chat:e.ref?.key,incomingId:e.incomingId})) });
    const old = cache.accounts[acc.id] || { conversations: [] };
    const merged = new Map(old.conversations.map((row) => [row.key, row]));
    for (const raw of (data.conversations || []).slice(0, 250)) {
      if (typeof raw.key !== 'string' || !raw.key || typeof raw.title !== 'string') continue;
      const before = merged.get(raw.key);
      const row = { ambiguous:raw.ambiguous===true, key: raw.key.slice(0, 400), title: raw.title.slice(0, 150), preview: String(raw.preview || '').slice(0, 500), unread: Math.max(0, Math.min(9999, Number(raw.unread) || 0)), href: String(raw.href || '').slice(0, 1000), dataId: String(raw.dataId || '').slice(0, 400), privateChat: typeof raw.privateChat === 'boolean' ? raw.privateChat : null };
      row.updatedAt = before && before.preview === row.preview && before.unread === row.unread ? before.updatedAt : Date.now();
      row.needsHuman = before?.needsHuman === true;
      merged.set(row.key, row);
    }
    cache.accounts[acc.id] = { at: Date.now(), conversations: [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 1000) };
    if (data.current?.key && Array.isArray(data.messages)) {
      const messages = data.messages.slice(-100).filter((message) => message?.id && typeof message.text === 'string').map((message) => ({ id: String(message.id).slice(0, 500), text: message.text.slice(0, 6000), direction: ['incoming', 'outgoing'].includes(message.direction) ? message.direction : 'unknown' }));
      cache.threads[keyOf(acc.id, data.current.key)] = { accountId: acc.id, ref: data.current, messages, at: Date.now() };
      const entries = Object.entries(cache.threads); if (entries.length > 40) cache.threads = Object.fromEntries(entries.sort((a, b) => b[1].at - a[1].at).slice(0, 40));
      if (selected?.accountId === acc.id && selected.ref.key === data.current.key) selected.ref = { ...selected.ref, ...data.current };
    }
    saveCache(); scheduleRender();
    if (configOf(acc.id).enabled && configOf(acc.id).ready) for (const event of (data.events || []).slice(0, 10)) queueAutomatic(acc.id, event);
  }
  window.onInboxSnapshot = receive;
  window.onInboxResult = (request) => { const waiter = waiters.get(request?.requestId); if (waiter) { clearTimeout(waiter.timer); waiters.delete(request.requestId); request.ok ? waiter.resolve(request.data) : waiter.reject(new Error(request.error)); } };
  async function bridgeCommand(accountId, action, request = {}, signal) {
    const acc = findAcc(accountId); if (!acc) throw new Error('账号不存在');
    const view = ensureView(acc); const release = holdView(accountId);
    const previousFocus = document.activeElement;
    try {
      const deadline = Date.now() + 25000;
      while (view.dataset.inboxReady !== '1' && Date.now() < deadline) {signal?.throwIfAborted();await sleepHub(120);}signal?.throwIfAborted();
      if (view.dataset.inboxReady !== '1') throw new Error('账号页面尚未就绪，请确认已登录');
      const requestId = uid();
      const result = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiters.delete(requestId); reject(new Error('会话操作超时，请在原平台确认状态')); }, action === 'more' ? 30000 : 20000);
        const cleanup=()=>signal?.removeEventListener('abort',abort);const abort=()=>{clearTimeout(timer);waiters.delete(requestId);cleanup();try{view.send('wam:backup-cancel',{requestId});}catch{}reject(signal.reason||new Error('扫描已停止'));};
        waiters.set(requestId, { resolve:v=>{cleanup();resolve(v);}, reject:e=>{cleanup();reject(e);}, timer });signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      });
      try { signal?.throwIfAborted();view.send('wam:inbox-command', { ...request, action, requestId }); }
      catch (error) { const waiter = waiters.get(requestId); if (waiter) { clearTimeout(waiter.timer); waiters.delete(requestId); waiter.reject(error); } }
      return await result;
    } finally { release(); if (previousFocus?.isConnected && document.activeElement === view) previousFocus.focus({ preventScroll: true }); }
  }
  const exclusiveCommand = (accountId, action, request) => exclusive(() => bridgeCommand(accountId, action, request));
  async function selectConversation(accountId, ref) {
    if (scopedAccount !== accountId) return;
    if ($('hub-reply').value.trim() && selected && keyOf(selected.accountId, selected.ref.key) !== keyOf(accountId, ref.key)) { notify(local('请先发送或清空当前草稿', 'Send or clear the current draft first'), true); return; }
    selected = { accountId, ref }; lastMessages = '';
    $('hub-reply').value = ''; delete $('hub-reply').dataset.aiJob;
    if (selectedLease) selectedLease(); selectedLease = null; selectedLeaseAccount = accountId;
    const acc = findAcc(accountId); ensureView(acc); selectedLease = holdView(accountId); pushAll(); render();
    $('hub-thread-notice').hidden = false; $('hub-thread-notice').textContent = local('正在读取会话…', 'Loading conversation…');
    try {
      const result = await exclusiveCommand(accountId, 'thread', { ref });
      if (!selected || selected.accountId !== accountId || selected.ref.key !== ref.key) return;
      cache.threads[keyOf(accountId, ref.key)] = { accountId, ref: { ...ref, ...result.current }, messages: result.messages, at: Date.now() };
      selected.ref = { ...ref, ...result.current };
      const row = cache.accounts[accountId]?.conversations.find((r) => r.key === ref.key); if (row) row.unread = 0;
      $('hub-thread-notice').hidden = true; saveCache(); render();
    } catch (error) { $('hub-thread-notice').hidden = false; $('hub-thread-notice').textContent = error.message; }
  }
  async function syncAccounts(more = false) {
    if (syncBusy) return;
    syncBusy = true; $('hub-refresh').disabled = true;
    const chosen = scopedAccount || $('hub-account').value;
    const list = chosen ? accounts.filter((a) => a.id === chosen) : [];
    let count = 0;
    try {
      for (const acc of list) {
        count++;
        notify(local(`正在同步 ${acc.name}（${count}/${list.length}）`, `Syncing ${acc.name} (${count}/${list.length})`));
        const existed = !!views[acc.id];
        try { await exclusiveCommand(acc.id, more ? 'more' : 'snapshot'); }
        catch (error) { accountErrors.set(acc.id, error.message); }
        if (!existed && !window.shouldAccountStayOnline(acc.id) && !window.keepAllSessionsOnline?.() && selectedLeaseAccount !== acc.id && !heldViews.has(acc.id)) {
          views[acc.id]?.remove(); delete views[acc.id]; delete status[acc.id];
        }
      }
      notify(local('当前账号消息已刷新。', 'This account’s messages have been refreshed.'));
      renderList(); render();
    } finally { syncBusy = false; $('hub-refresh').disabled = false; }
  }
  $('hub-refresh').addEventListener('click', () => syncAccounts());
  $('hub-more').addEventListener('click', () => syncAccounts(true));
  function filterOptions() {
    const platform = $('hub-platform'); const platformValue = platform.value;
    platform.innerHTML = ''; platform.add(new Option(t('全部平台'), ''));
    for (const [key, value] of Object.entries(PLATFORMS)) platform.add(new Option(value.label, key)); platform.value = platformValue;
    for (const selector of [$('hub-account')]) {
      const value = selector.value; selector.innerHTML = '';
      if (selector.id === 'hub-account') selector.add(new Option(t('全部账号'), ''));
      for (const acc of accounts) selector.add(new Option(accountLabel(acc.id), acc.id));
      if ([...selector.options].some((v) => v.value === value)) selector.value = value;
    }
  }
  function avatarOf(acc,showUnread=false) {
    const avatar = el('span', undefined, 'avatar');
    if (acc.avatar) { const img = el('img'); img.src = acc.avatar; img.alt = ''; avatar.append(img); }
    else avatar.innerHTML = platformOf(acc).icon;
    const badge=el('span',unread[acc.id]?String(unread[acc.id]):'','unread');badge.title=String(unread[acc.id]||0);if(showUnread)avatar.append(badge);return avatar;
  }
  function accountInfo(acc) {
    const info = el('span', undefined, 'home-account-info'); const sub = el('small', undefined, 'home-account-handle'); const logo = el('span', undefined, 'account-platform-logo'); logo.innerHTML = platformOf(acc).icon; logo.title = platformOf(acc).label; logo.setAttribute('aria-label', platformOf(acc).label); sub.append(logo, safeText('span', accountIdentity(acc))); info.append(safeText('b', acc.name), sub); return info;
  }
  function aiPill(acc) {
    const ai = window.accountAIIndicator(acc.id); return el('span', ai ? 'AI' : local('AI 未开启', 'AI off'), ai ? `account-ai-icon ${ai.state}` : 'hub-muted');
  }
  function renderAccounts() {
    const totalUnread = accounts.reduce((n, acc) => n + (unread[acc.id] || 0), 0);
    $('home-summary').replaceChildren();
    for (const [count, label] of [[accounts.length, local('已连接账号', 'Linked accounts')], [accounts.filter((acc) => configOf(acc.id).enabled).length, local('AI 回复已开启', 'AI replies enabled')], [totalUnread, local('未读消息', 'Unread messages')]]) { const stat = el('div', undefined, 'home-stat'); stat.append(el('strong', String(count)), el('span', label)); $('home-summary').append(stat); }
    $('home-platforms').replaceChildren();
    for (const [key, label] of [['', local('全部', 'All')], ...Object.entries(PLATFORMS).filter(([key])=>window.platformVisible(key)).map(([key, platform]) => [key, platform.label])]) {
      const button = el('button', key ? undefined : label); if (key) { button.innerHTML = PLATFORMS[key].icon; button.classList.add('platform-filter-logo'); button.title = label; button.setAttribute('aria-label', label); } button.classList.toggle('active', homePlatform === key); button.addEventListener('click', () => { homePlatform = key; renderAccounts(); }); $('home-platforms').append(button);
    }
    const query = $('home-search').value.trim().toLowerCase();
    const list = accounts.filter((acc) => (!homePlatform || acc.platform === homePlatform) && `${acc.name} ${accountTag(acc)} ${platformOf(acc).label}`.toLowerCase().includes(query));
    $('home-account-grid').replaceChildren(); $('home-accounts-empty').hidden = !!list.length;
    $('home-accounts-empty').textContent = accounts.length ? local('没有匹配的账号', 'No matching accounts') : t('暂无账号，请从左侧选择平台并新建会话。');
    for (const acc of list) {
      const card = el('article', undefined, 'home-account-card'); card.dataset.accountId = acc.id;
      const open = el('button', undefined, 'home-account-open'); open.append(avatarOf(acc,true), accountInfo(acc)); open.addEventListener('click', () => showAccountMessages(acc.id));
      const meta = el('div', undefined, 'home-account-meta');
      const s = status[acc.id] || (views[acc.id] ? 'loading' : 'idle');
      const statusLabel = { in: local('已登录', 'Signed in'), loading: local('加载中', 'Loading'), out: local('需要登录', 'Sign in'), idle: local('点击打开', 'Click to open') }[s] || s;
      meta.append(el('span', statusLabel, `account-state ${s === 'in' ? 'online' : ''}`), aiPill(acc));

      const actions = el('div', undefined, 'home-account-actions');
      const chat = el('button', local('查看消息', 'View messages'), 'ghost-btn small'); chat.addEventListener('click', () => showAccountMessages(acc.id));
      actions.append(chat); card.append(open, meta, actions); $('home-account-grid').append(card);
    }
  }
  function renderConversations() {
    const search = $('hub-search').value.toLowerCase(); const platform = $('hub-platform').value; const account = $('hub-account').value;
    const rows = accounts.filter((acc) => acc.id === scopedAccount).flatMap((acc) => (cache.accounts[acc.id]?.conversations || []).map((ref) => ({ accountId: acc.id, acc, ref }))).filter(({ accountId, acc, ref }) => (!$('hub-unread').checked || ref.unread > 0 || ref.needsHuman) && (!search || `${ref.title} ${ref.preview} ${acc.name}`.toLowerCase().includes(search))).sort((a, b) => b.ref.updatedAt - a.ref.updatedAt);
    $('hub-chat-list').replaceChildren();
    for (const row of rows.slice(0, 1000)) {
      const li = el('li'); const button = el('button', undefined, 'hub-chat'); button.type = 'button';
      if (selected?.accountId === row.accountId && selected?.ref.key === row.ref.key) button.classList.add('active');
      const top = el('div', undefined, 'hub-chat-top'); top.append(safeText('b', row.ref.title));
      if (row.ref.unread) top.append(el('span', String(row.ref.unread), 'hub-unread'));
      if (row.ref.needsHuman) top.append(el('span', local('待人工', 'Needs a person'), 'hub-human'));
      button.append(top, safeText('p', row.ref.preview, 'hub-preview'), safeText('span', accountLabel(row.accountId), 'hub-muted'));
      button.addEventListener('click', () => selectConversation(row.accountId, row.ref)); li.append(button); $('hub-chat-list').append(li);
    }
    $('hub-count').textContent = local(`${rows.length} 个会话`, `${rows.length} conversations`);
    $('hub-list-empty').hidden = rows.length > 0;
  }
  function outgoingFor(acc, ref) { const config = translateOf(acc); return (config.perContact && config.contacts?.[ref.key]?.outgoing) || config.outgoing; }
  function renderThread() {
    if ($('hub-thread-empty')) $('hub-thread-empty').textContent = t('选择左侧会话即可在这里查看和回复。');
    const acc = selected && findAcc(selected.accountId);
    $('hub-thread-title').textContent = selected?.ref.title || t('选择一个会话');
    $('hub-thread-account').textContent = acc ? accountLabel(acc.id) : '';
    for (const name of ['hub-native', 'hub-reply', 'hub-send', 'hub-suggest']) $(name).disabled = !acc;
    if (!acc) { $('hub-messages').replaceChildren(el('p', t('选择左侧会话即可在这里查看和回复。'), 'hub-empty')); return; }
    const current = cache.threads[keyOf(acc.id, selected.ref.key)];
    const dataKey = JSON.stringify({ key: keyOf(acc.id, selected.ref.key), messages: current?.messages || [] });
    if (dataKey !== lastMessages) {
      const nearBottom = $('hub-messages').scrollHeight - $('hub-messages').scrollTop - $('hub-messages').clientHeight < 100 || !lastMessages;
      lastMessages = dataKey; $('hub-messages').replaceChildren();
      for (const message of current?.messages || []) $('hub-messages').append(safeText('div', message.text, `hub-bubble ${message.direction}`));
      if (!current?.messages.length) $('hub-messages').append(el('p', local('暂无已加载消息，正在读取当前会话。', 'No messages loaded yet. Reading the conversation.'), 'hub-empty'));
      if (nearBottom) $('hub-messages').scrollTop = $('hub-messages').scrollHeight;
    }
    const out = outgoingFor(acc, selected.ref);
    $('hub-reply').placeholder = out.enabled ? local(`消息翻译成【${LABELS[out.target] || out.target}】发送`, `Translate message to 【${t(LABELS[out.target] || out.target)}】 and send`) : t('输入消息');
    const config = configOf(acc.id);
    $('hub-private-label').hidden = !config.enabled || selected.ref.privateChat !== null;
    $('hub-private').checked = config.allowedChats.includes(selected.ref.key);
  }
  async function refreshAI() {
    aiState = await api('aiState');
    const unresolved = new Set(aiState.jobs.filter((job) => job.automatic && ['handoff', 'error', 'uncertain'].includes(job.status)).map((job) => keyOf(job.accountId, job.chatKey)));
    const resolved = new Set(aiState.jobs.filter((job) => job.status === 'resolved').map((job) => keyOf(job.accountId, job.chatKey)));
    for (const [accountId, value] of Object.entries(cache.accounts)) for (const row of value.conversations) {
      const key = keyOf(accountId, row.key); if (unresolved.has(key)) row.needsHuman = true; else if (resolved.has(key)) row.needsHuman = false;
    }
    saveCache();
    for (const acc of accounts) if (window.shouldAccountStayOnline(acc.id)) ensureView(acc);
    pushAll(); renderList(); render();
  }
  function renderAIForm(force = false) {
    if (aiDirty && !force) return;
    const accountId = selectedAIAccount; const config = configOf(accountId);
    $('ai-selected-account').textContent = accountId ? accountLabel(accountId) : t('选择一个账号');
    $('ai-account-fields').disabled = !accountId; $('ai-no-account').hidden = !!accountId; $('ai-test').disabled = !accountId;
    $('ai-enabled').checked = config.enabled; $('ai-instructions').value = config.instructions; $('ai-delay').value = config.delaySec; $('ai-daily').value = config.dailyLimit;
    $('ai-base-checks').replaceChildren();
    for (const base of aiState.bases) {
      const label = el('label', undefined, 'hub-check'); const input = el('input'); input.type = 'radio'; input.name = 'account-knowledge-base'; input.value = base.id; input.checked = config.knowledgeBaseIds.includes(base.id);
      input.addEventListener('change', () => { aiDirty = true; renderReplyGuide(true); renderGuideDiscussion(); renderAIHero(); });
      label.append(input, safeText('span', `${base.name} · ${baseStatus(base.status)} · ${base.cardCount}`)); $('ai-base-checks').append(label);
    }
    if (!aiState.bases.length) $('ai-base-checks').append(el('p', local('请先到知识库导入并学习资料。', 'Import and learn documents in Knowledge bases first.'), 'hub-muted'));
    $('ai-config-status').textContent = config.needsKnowledgeSelection ? local('旧设置使用了多个知识库，请选择一个后保存并重新开启。', 'The previous settings used multiple bases. Choose one, save, and enable AI again.') : accountErrors.get(accountId) || (config.enabled ? config.ready ? local('AI 自动回复已开启', 'Automatic AI replies enabled') : local('AI 等待知识库就绪', 'AI is waiting for the knowledge base') : local('AI 自动回复未开启', 'Automatic AI replies disabled'));
    $('ai-key-status').textContent = aiState.keySet ? local('已配置 Claude Key', 'Claude key configured') : local('尚未配置 Claude Key', 'Claude key not configured');
    $('ai-save').disabled = !accountId;
    $('ai-enabled').disabled = !accountId;
    const savedDraft = aiFormDrafts.get(accountId);
    if (savedDraft) {
      $('ai-enabled').checked = savedDraft.enabled; $('ai-instructions').value = savedDraft.instructions; $('ai-delay').value = savedDraft.delay; $('ai-daily').value = savedDraft.daily; $('ai-guide-request').value = savedDraft.request;
      for (const input of $('ai-base-checks').querySelectorAll('input')) input.checked = input.value === savedDraft.baseId;
      aiDirty = savedDraft.dirty;
    }
    renderReplyGuide(force); if (savedDraft) $('ai-reply-guide').value = savedDraft.replyGuide; renderGuideDiscussion(); renderAIHero();
  }
  function renderAIHero() {
    const acc = findAcc(selectedAIAccount); const config = configOf(selectedAIAccount); const base = chosenBase();
    $('ai-hero-avatar').replaceChildren(); if (acc) $('ai-hero-avatar').append(avatarOf(acc));
    $('ai-hero-description').textContent = base ? `${base.name} · ${baseStatus(base.status)}` : local('选择知识库，开始配置你的回复助手', 'Choose a knowledge base to set up your assistant');
    const state = $('ai-hero-state'); state.className = 'ai-state-pill ' + (aiDirty ? 'draft' : config.enabled && config.ready ? 'enabled' : '');
    state.textContent = aiDirty ? local('有未保存修改', 'Unsaved changes') : config.enabled && config.ready ? local('自动回复已开启', 'Auto reply on') : local('自动回复未开启', 'Auto reply off');
  }
  let guideDraftAccount = null; let guideDraftBase = null; let guideBusy = false; let guideBusyAccount = null; let guideRequestSerial = 0;
  const chosenBase = () => aiState.bases.find((base) => base.id === $('ai-base-checks').querySelector('input:checked')?.value);
  function renderReplyGuide(force = false) {
    const config = configOf(selectedAIAccount); const base = chosenBase();
    $('ai-learned-summary').textContent = base ? base.summary || local('尚无学习摘要，请先学习资料。', 'No learning summary yet. Learn the sources first.') : local('选择一个知识库后，这里会显示学习摘要。', 'Choose one knowledge base to see its learning summary.');
    if (force || guideDraftAccount !== selectedAIAccount || guideDraftBase !== base?.id) {
      $('ai-reply-guide').value = config.knowledgeBaseIds[0] === base?.id && config.replyGuide ? config.replyGuide : base?.replyGuide || '';
      guideDraftAccount = selectedAIAccount; guideDraftBase = base?.id || null;
    }
  }
  function renderGuideDiscussion() {
    const config = configOf(selectedAIAccount); const base = chosenBase(); const list = $('ai-guide-messages'); const oldTop = list.scrollTop; const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60; list.replaceChildren();
    for (const message of config.guideChat || []) {
      const row = el('div', undefined, `guide-message ${message.role}`); const speaker = el('span', message.role === 'user' ? local('你', 'You') : 'S', 'guide-speaker'); speaker.title = message.role === 'user' ? local('你', 'You') : 'Sonnet';
      const body = el('div', undefined, 'guide-message-body'); const text = String(message.text || '');
      if (message.role !== 'user' && text.length > 700) { body.append(safeText('p', text.slice(0, 300) + '…')); const details = el('details'); details.append(el('summary', local('展开完整回复', 'Show full reply')), safeText('pre', text)); body.append(details); }
      else body.append(safeText('p', text));
      row.append(speaker, body); list.append(row);
    }
    if (!config.guideChat?.length) { const empty = el('div', undefined, 'ai-chat-empty'); empty.append(el('b', local('一起完善你的回复助手', 'Shape your assistant together')), el('span', local('可以调整语气、回复步骤，也可以让 Sonnet 给出示例。', 'Adjust the tone and reply steps, or ask Sonnet for examples.'))); list.append(empty); }
    list.scrollTop = nearBottom ? list.scrollHeight : oldTop;
    const proposal = config.guideProposal;
    $('ai-guide-apply').hidden = !proposal || proposal.baseId !== base?.id;
    $('ai-guide-ask').disabled = guideBusy || !base || base.status !== 'ready'; $('ai-guide-summarize').disabled = $('ai-guide-ask').disabled;
    $('ai-guide-clear').disabled = !selectedAIAccount;
  }
  const baseStatus = (status) => ({ empty: local('未导入', 'Empty'), pending: local('待学习', 'Pending'), studying: local('学习中…', 'Learning…'), ready: local('已就绪', 'Ready'), error: local('学习失败', 'Learning failed') }[status] || status);
  function renderJobs() {
    $('ai-jobs').replaceChildren();
    for (const job of aiState.jobs.filter((job) => job.accountId === selectedAIAccount).slice(0, 60)) {
      const li = el('li'); const state = { draft: local('待人工发送', 'Draft'), sent: local('已发送', 'Sent'), handoff: local('转人工', 'Handed to a person'), error: local('失败', 'Failed'), sending: local('发送中', 'Sending'), cancelled: local('已取消', 'Cancelled'), uncertain: local('请人工确认', 'Check manually'), resolved: local('已人工处理', 'Handled by a person') }[job.status] || job.status;
      li.append(safeText('b', `${accountLabel(job.accountId)} · ${job.title || job.chatKey}`), el('p', `${state} · ${new Date(job.createdAt).toLocaleString()}`, 'hub-muted'), safeText('p', job.error || job.reason || job.text || ''));
      if (job.noticeStatus) { const notice = { pending: local('转人工提示待发送', 'Handoff notice pending'), sending: local('正在发送转人工提示', 'Sending handoff notice'), sent: local('已向客户发送转人工提示', 'Handoff notice sent to customer'), error: local('转人工提示未确认发送，请人工检查', 'Handoff notice not confirmed; check manually'), uncertain: local('转人工提示发送被中断，请人工确认', 'Handoff notice interrupted; check manually'), cancelled: local('转人工提示已取消', 'Handoff notice cancelled') }[job.noticeStatus]; li.append(el('p', notice, 'hub-muted')); }
      const ref = cache.accounts[job.accountId]?.conversations.find((row) => row.key === job.chatKey);
      if (ref && findAcc(job.accountId)) { const open = el('button', local('查看会话', 'View conversation'), 'link-btn'); open.addEventListener('click', async () => { await showAccountMessages(job.accountId); selectConversation(job.accountId, ref); }); li.append(open); }
      $('ai-jobs').append(li);
    }
  }
  function renderKnowledge() {
    if (!aiState.bases.some((base) => base.id === selectedBase)) selectedBase = aiState.bases[0]?.id || null;
    $('kb-list').replaceChildren();
    for (const base of aiState.bases) { const li = el('li'); const button = safeText('button', `${base.name}\n${baseStatus(base.status)} · ${base.cardCount}`); button.classList.toggle('active', base.id === selectedBase); button.addEventListener('click', () => { selectedBase = base.id; closeSource(); renderKnowledge(); }); li.append(button); $('kb-list').append(li); }
    const base = aiState.bases.find((b) => b.id === selectedBase); $('kb-detail').hidden = !base;
    $('kb-title').textContent = base?.name || t('选择或新建一个知识库');
    if (!base) return;
    if (document.activeElement !== $('kb-name')) $('kb-name').value = base.name;
    $('kb-status').textContent = base.error || `${baseStatus(base.status)} · ${base.documents.length} ${local('份资料', 'documents')} · ${base.cardCount} ${local('条知识', 'knowledge cards')}`;
    const unlearned = base.documents.some((document) => document.status !== 'ready');
    $('kb-learn').disabled = !unlearned || base.status === 'studying' || sourceBusy; $('kb-remove').disabled = base.status === 'studying';
    $('kb-learn').textContent = !unlearned && base.documents.length ? t('全部资料已学习') : t('学习新增资料');
    document.querySelectorAll('#kb-source-types button').forEach((button) => { button.disabled = base.status === 'studying' || sourceBusy; });
    $('kb-documents').replaceChildren();
    for (const document of base.documents) {
      const li = el('li'); const head = el('div', undefined, 'kb-document-head'); const identity = el('div', undefined, 'kb-document-identity'); identity.append(safeText('b', document.name), el('span', ({ content: local('文字', 'Content'), url: 'URL', file: local('文件', 'File'), media: local('媒体', 'Media'), sheet: 'Google Sheet', api: 'API' })[document.sourceType || 'file'], 'source-type-tag')); head.append(identity);
      if (document.status === 'ready') head.append(el('span', '✓ ' + t('已学习'), 'kb-learned-badge'));
      else { const learn = el('button', document.status === 'studying' ? t('学习中…') : document.learningProgress?.completed ? t('继续学习') : t('学习'), 'ghost-btn small'); learn.dataset.learnDocument = document.id; learn.disabled = base.status === 'studying' || sourceBusy; learn.addEventListener('click', async () => { learn.disabled = true; try { await api('aiLearnDocument', base.id, document.id); await refreshAI(); } catch (error) { notify(error.message, true); await refreshAI(); } }); head.append(learn); }
      li.append(head, el('p', `${document.status === 'ready' ? t('已学习') : baseStatus(document.status)} · ${(document.size / 1024).toFixed(0)} KB${document.learnedModel ? ` · ${document.learnedModel.includes('sonnet') ? 'Sonnet' : 'Haiku'}` : ''}`, 'hub-muted'));
      if (document.learningProgress?.total) { const progress = document.learningProgress; li.append(safeText('p', local(`分批学习：${progress.completed}/${progress.total} 段${progress.label ? ` · ${progress.label}` : ''}`, `Learning batches: ${progress.completed}/${progress.total}${progress.label ? ` · ${progress.label}` : ''}`), 'hub-muted')); }
      if (document.url) li.append(safeText('p', document.url, 'hub-muted'));
      if (document.fetchedAt) li.append(el('p', `${local('读取时间', 'Fetched')}: ${new Date(document.fetchedAt).toLocaleString()}`, 'hub-muted'));
      if (document.visualOnly) li.append(el('p', local('仅视频画面，不含语音', 'Video frames only, without audio'), 'hub-muted'));
      if (document.error) li.append(safeText('p', document.error, 'danger-text'));
      if (['url', 'sheet', 'api'].includes(document.sourceType)) {
        const refresh = el('button', local('刷新来源', 'Refresh source'), 'link-btn'); refresh.disabled = base.status === 'studying';
        refresh.addEventListener('click', async () => { refresh.disabled = true; try { await api('aiRefreshSource', base.id, document.id); await refreshAI(); notify(local('来源已刷新，请重新学习。', 'Source refreshed. Learn it again to update the knowledge.')); } catch (error) { notify(error.message, true); } finally { refresh.disabled = false; } }); li.append(refresh);
      }
      const remove = el('button', local('移除资料', 'Remove document'), 'link-btn danger-text'); remove.disabled = base.status === 'studying';
      remove.addEventListener('click', async () => { try { await api('aiRemoveDocument', base.id, document.id); await refreshAI(); } catch (error) { notify(error.message, true); } });
      li.append(remove); $('kb-documents').append(li);
    }
    $('kb-summary').textContent = base.summary || '';
  }
  function render() {
    if (!homeOpen) return;
    for (const name of ['accounts', 'inbox', 'ai', 'knowledge']) $('hub-' + name).hidden = tab !== name;
    $('hub-title').textContent = tab === 'accounts' ? t('所有账号') : tab === 'inbox' ? accountLabel(scopedAccount) : tab === 'ai' ? t('AI 回复') : `${accountLabel(selectedAIAccount)} · ${t('知识库')}`;
    $('hub-title').setAttribute('data-i18n-skip', '');
    $('hub-back-home').hidden = true; $('hub-refresh').hidden = tab !== 'inbox';
    $('hub-back-messages').hidden = !['ai', 'knowledge'].includes(tab);
    $('ai-navigation').hidden = !['ai', 'knowledge'].includes(tab);
    $('ai-tool-btn').classList.toggle('active', ['ai', 'knowledge'].includes(tab));
    document.querySelectorAll('#ai-navigation button').forEach((button) => button.classList.toggle('active', button.dataset.aiTab === tab));
    filterOptions();
    if (tab === 'accounts') renderAccounts();
    if (tab === 'inbox') { renderConversations(); renderThread(); }
    if (tab === 'ai') { renderAIForm(); renderAIHero(); renderGuideDiscussion(); renderJobs(); }
    if (tab === 'knowledge') renderKnowledge();
    window.I18N?.apply($('hub'));
  }
  ['hub-search', 'hub-platform', 'hub-account', 'hub-unread'].forEach((name) => $(name).addEventListener('input', renderConversations));
  $('hub-native').addEventListener('click', () => { if (!selected) return; const acc = findAcc(selected.accountId); leaveHome(); selectPlatform(acc.platform); activate(acc.id); });
  ['ai-enabled', 'ai-instructions', 'ai-delay', 'ai-daily'].forEach((name) => $(name).addEventListener('input', () => { aiDirty = true; renderAIHero(); }));
  $('ai-open-knowledge').addEventListener('click', () => { tab = 'knowledge'; render(); });
  $('ai-enabled').addEventListener('change', async () => {
    const accountId = selectedAIAccount; const old = configOf(accountId);
    if ($('ai-enabled').checked || !old.enabled) return;
    aiState.accounts[accountId] = { ...old, enabled: false }; pushAll(); renderList();
    for (const [key, pending] of autoPending) if (pending.accountId === accountId) { clearTimeout(pending.timer); autoPending.delete(key); }
    try { await api('aiConfigure', accountId, { ...old, enabled: false }); await refreshAI(); }
    catch (error) { notify(error.message, true); await refreshAI(); }
  });
  $('ai-save').addEventListener('click', async () => {
    const accountId = selectedAIAccount; if (!accountId) return;
    const config = { ...configOf(accountId), enabled: $('ai-enabled').checked, knowledgeBaseIds: [...$('ai-base-checks').querySelectorAll('input:checked')].map((v) => v.value), instructions: $('ai-instructions').value, replyGuide: $('ai-reply-guide').value, delaySec: Number($('ai-delay').value), dailyLimit: Number($('ai-daily').value) };
    try { await api('aiConfigure', accountId, config); aiFormDrafts.delete(accountId); if (selectedAIAccount === accountId) aiDirty = false; accountErrors.delete(accountId); await refreshAI(); if (selectedAIAccount === accountId) notify(local('账号 AI 设置已保存', 'Account AI settings saved')); } catch (error) { if (selectedAIAccount === accountId) $('ai-config-status').textContent = error.message; else toast(`${accountLabel(accountId)}: ${error.message}`, true); }
  });
  $('ai-reply-guide').addEventListener('input', () => { aiDirty = true; renderAIHero(); });
  $('ai-guide-chat-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const base = chosenBase(); const accountId = selectedAIAccount; const message = $('ai-guide-request').value.trim();
    if (guideBusy || !base || !accountId || !message) return;
    const ticket = ++guideRequestSerial; guideBusy = true; guideBusyAccount = accountId; renderGuideDiscussion(); $('ai-guide-status').textContent = local('Sonnet 正在生成修改稿…', 'Sonnet is preparing a proposal…');
    try {
      await api('aiRefineGuide', accountId, { baseId: base.id, message, draft: $('ai-reply-guide').value });
      if (ticket !== guideRequestSerial) return;
      if (selectedAIAccount === accountId) { $('ai-guide-request').value = ''; $('ai-guide-status').textContent = local('修改稿已生成。查看讨论内容，采用后再保存即可生效。', 'Proposal ready. Review it, use it, then save the account settings to apply.'); }
      await refreshAI();
    } catch (error) { if (ticket === guideRequestSerial && selectedAIAccount === accountId) $('ai-guide-status').textContent = error.message; }
    finally { if (ticket === guideRequestSerial) { guideBusy = false; guideBusyAccount = null; } renderGuideDiscussion(); }
  });
  $('ai-guide-clear').addEventListener('click', async () => {
    const accountId = selectedAIAccount; if (!accountId) return; $('ai-guide-clear').disabled = true;
    try {
      await api('aiClearGuideChat', accountId);
      if (guideBusyAccount === accountId) { guideRequestSerial++; guideBusy = false; guideBusyAccount = null; }
      const draft = aiFormDrafts.get(accountId); if (draft) draft.request = '';
      if (selectedAIAccount === accountId) { $('ai-guide-request').value = ''; $('ai-guide-status').textContent = local('聊天已清空，已保存的回复说明保持不变。', 'Chat cleared. Your saved reply guide is unchanged.'); }
      await refreshAI();
    } catch (error) { if (selectedAIAccount === accountId) $('ai-guide-status').textContent = error.message; }
    finally { renderGuideDiscussion(); }
  });
  document.querySelectorAll('[data-guide-suggestion]').forEach((button) => button.addEventListener('click', () => { $('ai-guide-request').value = t(button.dataset.guideSuggestion); $('ai-guide-request').focus(); }));
  $('ai-guide-request').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('ai-guide-chat-form').requestSubmit(); } });
  $('ai-guide-summarize').addEventListener('click', () => { $('ai-guide-request').value = local('请总结这个知识库学到了什么、应该怎样回复客户、给出两个示例，并说明何时转人工。', 'Summarize what was learned, how to reply, two examples, and when to hand off to a person.'); $('ai-guide-chat-form').requestSubmit(); });
  $('ai-guide-apply').addEventListener('click', () => {
    const proposal = configOf(selectedAIAccount).guideProposal; if (!proposal || proposal.baseId !== chosenBase()?.id) return;
    $('ai-reply-guide').value = proposal.text; aiDirty = true; renderAIHero(); $('ai-guide-status').textContent = local('已放入回复说明草稿。点击“保存账号 AI 设置”后生效。', 'Added to the guide draft. Save this account’s AI settings to apply it.');
  });
  $('kb-create').addEventListener('click', async () => { try { const name = $('kb-new-name').value.trim(); if (!name) return; selectedBase = await api('aiCreateBase', name); $('kb-new-name').value = ''; await refreshAI(); } catch (error) { notify(error.message, true); } });
  $('kb-rename').addEventListener('click', async () => { try { await api('aiRenameBase', selectedBase, $('kb-name').value); await refreshAI(); } catch (error) { notify(error.message, true); } });
  $('kb-remove').addEventListener('click', async () => { if (!window.confirm(local('删除这个知识库？使用它的账号会关闭 AI 回复。原文件不受影响。', 'Delete this knowledge base? Accounts using it will disable AI replies. Original documents are untouched.'))) return; try { await api('aiRemoveBase', selectedBase); await refreshAI(); } catch (error) { notify(error.message, true); } });
  async function loadTranscriptionSettings() {
    const settings = await window.api.getSettings();
    $('asr-endpoint').value = settings.transcriptionEndpoint || 'https://api.openai.com/v1/audio/transcriptions'; $('asr-model').value = settings.transcriptionModel || 'gpt-transcribe';
    $('asr-status').textContent = settings.transcriptionKeySet ? local('已配置转写 Key', 'Transcription key configured') : local('尚未配置转写 Key；图片学习不需要转写服务。', 'No transcription key configured. Images do not need transcription.');
  }
  $('asr-save').addEventListener('click', async () => {
    $('asr-save').disabled = true;
    try { const patch = { transcriptionEndpoint: $('asr-endpoint').value.trim(), transcriptionModel: $('asr-model').value.trim() }; if (!patch.transcriptionModel) throw Error(local('请输入转写模型', 'Enter a transcription model')); if ($('asr-key').value.trim()) patch.transcriptionKey = $('asr-key').value.trim(); await window.api.setSettings(patch); $('asr-key').value = ''; await loadTranscriptionSettings(); notify(local('转写设置已保存', 'Transcription settings saved')); }
    catch (error) { notify(error.message, true); } finally { $('asr-save').disabled = false; }
  });
  function closeSource() { sourceType = null; $('kb-source-form').hidden = true; document.querySelectorAll('#kb-source-types button').forEach((button) => button.classList.remove('active')); }
  async function pickSources(media = false) {
    if (!selectedBase || sourceBusy) return;
    sourceBusy = true; const baseId = selectedBase; renderKnowledge();
    try { const result = await api('aiImport', baseId, { media, visualOnly: media && $('kb-visual-only').checked }); if (result?.errors.length) notify(result.errors.join('\n'), true); if (result?.imported) { closeSource(); notify(local(`已添加 ${result.imported} 份资料，请点击 Sonnet 学习。`, `${result.imported} sources added. Let Sonnet learn them.`)); } await refreshAI(); }
    catch (error) { notify(error.message, true); } finally { sourceBusy = false; renderKnowledge(); }
  }
  document.querySelectorAll('#kb-source-types button').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.source === 'file') { pickSources(); return; }
    sourceType = button.dataset.source; $('kb-source-form').reset(); $('kb-source-feedback').hidden = true; $('kb-source-form').hidden = false;
    document.querySelectorAll('#kb-source-types button').forEach((b) => b.classList.toggle('active', b === button));
    $('kb-source-title').textContent = { content: local('添加文字内容', 'Add content'), url: local('添加 URL 链接', 'Add URL'), sheet: local('添加 Google Sheet', 'Add Google Sheet'), api: local('添加 API 资料', 'Add API source'), media: local('添加媒体', 'Add media') }[sourceType];
    $('kb-content-fields').hidden = sourceType !== 'content'; $('kb-link-fields').hidden = !['url', 'sheet', 'api'].includes(sourceType); $('kb-json-fields').hidden = sourceType !== 'api'; $('kb-media-fields').hidden = sourceType !== 'media';
    $('kb-source-name').parentElement.querySelector('label[for="kb-source-name"]').hidden = sourceType === 'media'; $('kb-source-name').hidden = sourceType === 'media';
    $('kb-source-submit').textContent = sourceType === 'media' ? local('选择并上传媒体', 'Choose media files') : t('添加资料');
    $('kb-link-help').textContent = sourceType === 'sheet' ? local('读取指定工作表（gid）的内容。请提供可查看的分享链接，或在下方提供有权限的访问令牌。', 'Reads the selected worksheet (gid). Use a viewable share link or an authorized access token below.') : sourceType === 'api' ? local('使用 GET 读取 JSON 数据；不会调用写入接口。可以指定 JSON 路径，只学习需要的内容。', 'Reads JSON with GET. Choose a JSON path to learn only the data you need.') : local('读取网页正文、PDF、图片或文件内容。需要登录或仅靠脚本显示的网页，请改用文件或 API。', 'Reads page text, PDFs, images or files. For pages requiring a login or JavaScript, use a file or API source.');
  }));
  $('kb-source-cancel').addEventListener('click', closeSource);
  $('kb-source-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (sourceBusy || !selectedBase || !sourceType) return; if (sourceType === 'media') { await pickSources(true); return; }
    const baseId = selectedBase; const source = { type: sourceType, name: $('kb-source-name').value.trim(), text: $('kb-source-text').value, url: $('kb-source-url').value.trim(), token: $('kb-source-token').value.trim(), headers: $('kb-source-headers').value.trim(), jsonPath: $('kb-source-path').value.trim() };
    sourceBusy = true; $('kb-source-submit').disabled = true; $('kb-source-feedback').hidden = false; $('kb-source-feedback').textContent = local('正在读取资料…', 'Reading source…');
    try { await api('aiAddSource', baseId, source); $('kb-source-form').reset(); closeSource(); await refreshAI(); notify(local('资料已添加，请点击 Sonnet 学习。', 'Source added. Let Sonnet learn it.')); }
    catch (error) { $('kb-source-feedback').textContent = error.message; } finally { sourceBusy = false; $('kb-source-submit').disabled = false; renderKnowledge(); }
  });
  $('kb-learn').addEventListener('click', async () => { $('kb-learn').disabled = true; const baseId = selectedBase; try { await api('aiLearn', baseId, false); await refreshAI(); } catch (error) { notify(error.message, true); await refreshAI(); } });
  $('ai-test').addEventListener('click', async () => {
    const accountId = selectedAIAccount; const question = $('ai-test-question').value.trim(); if (!accountId || !question) return;
    $('ai-test').disabled = true; $('ai-test-result').textContent = local('正在测试…', 'Testing…');
    try { const result = await api('aiGenerate', { accountId, chatKey: '__test__', incomingId: uid(), messages: [{ direction: 'incoming', text: question }], title: '[Test]', automatic: false }); $('ai-test-result').textContent = result.text || result.reason || local('转人工', 'Handed to a person'); await refreshAI(); }
    catch (error) { $('ai-test-result').textContent = error.message; } finally { $('ai-test').disabled = false; }
  });
  $('hub-private').addEventListener('change', async () => { if (!selected) return; const accountId = selected.accountId; const config = configOf(accountId); const allowed = new Set(config.allowedChats); $('hub-private').checked ? allowed.add(selected.ref.key) : allowed.delete(selected.ref.key); try { await api('aiConfigure', accountId, { ...config, allowedChats: [...allowed] }); await refreshAI(); } catch (error) { notify(error.message, true); } });
  $('hub-suggest').addEventListener('click', async () => {
    if (!selected || $('hub-reply').value.trim()) return;
    const chosen = { ...selected, ref: { ...selected.ref } }; $('hub-suggest').disabled = true;
    try { const conversation = await exclusiveCommand(chosen.accountId, 'thread', { ref: chosen.ref }); const last = conversation.messages[conversation.messages.length - 1]; const job = await api('aiGenerate', { accountId: chosen.accountId, chatKey: chosen.ref.key, incomingId: last?.id || uid(), messages: conversation.messages, title: chosen.ref.title, automatic: false }); if (selected?.accountId === chosen.accountId && selected?.ref.key === chosen.ref.key && !$('hub-reply').value.trim()) { $('hub-reply').value = job.text || ''; $('hub-reply').dataset.aiJob = job.id; $('hub-send-status').textContent = job.reason || ''; } await refreshAI(); }
    catch (error) { notify(error.message, true); } finally { $('hub-suggest').disabled = false; }
  });
  $('hub-reply').addEventListener('input', () => { delete $('hub-reply').dataset.aiJob; });
  let hubTranslateBusy=false;
  async function translateHubDraft(){
    if(!selected||hubTranslateBusy||$('hub-send').disabled)return;
    const chosen={...selected,ref:{...selected.ref}},box=$('hub-reply'),original=box.value,acc=findAcc(chosen.accountId),out=outgoingFor(acc,chosen.ref);
    if(!original.trim()||!out.enabled)return;
    const key=JSON.stringify(out);hubTranslateBusy=true;$('hub-send').disabled=true;$('hub-send-status').textContent=local('正在翻译…','Translating…');
    try{const r=await window.api.translate({text:original,...out,accountId:acc.id});if(!r.ok)throw Error(r.error);if(selected?.accountId!==chosen.accountId||selected?.ref.key!==chosen.ref.key||box.value!==original||JSON.stringify(outgoingFor(acc,chosen.ref))!==key)return;
      if(typeof r.text!=='string'||!r.text.trim())throw Error(local('译文为空，消息未发送','Translation was empty. Nothing was sent.'));
      box.value=r.text;if(r.text!==original)delete box.dataset.aiJob;
      $('hub-send-status').textContent=local('已翻译，按 Enter 发送','Translation ready · Press Enter to send');
    }catch(e){$('hub-send-status').textContent=e.message;}finally{hubTranslateBusy=false;$('hub-send').disabled=!selected;}
  }
  let sendOriginal = false;
  $('hub-reply').addEventListener('keydown',event=>{
    if(event.isComposing||event.keyCode===229)return;
    const acc=selected&&findAcc(selected.accountId);
    if(acc&&outgoingFor(acc,selected.ref).enabled&&BlackCatTranslationShortcut.matches(event,translateOf(acc).shortcut)){event.preventDefault();event.stopPropagation();if(!event.repeat)translateHubDraft();return;}
    if(event.key==='Enter'&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();if(!event.repeat){sendOriginal=event.altKey;$('hub-reply-form').requestSubmit();}}
  });
  $('hub-reply-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (!selected || hubTranslateBusy || $('hub-send').disabled) return;
    const chosen = { ...selected, ref: { ...selected.ref } }; const original = $('hub-reply').value; const jobId = $('hub-reply').dataset.aiJob; const raw = sendOriginal; sendOriginal = false;
    if (!original.trim()) return;
    $('hub-send').disabled = true; $('hub-send-status').textContent = local('正在发送…', 'Sending…');
    try {
      let text = original; const acc = findAcc(chosen.accountId); const out = outgoingFor(acc, chosen.ref);
      if (!raw && !jobId && out.enabled && !BlackCatTranslationShortcut.normalize(translateOf(acc).shortcut).enabled) { const result = await window.api.translate({ text, ...out, accountId: acc.id }); if (!result.ok) throw new Error(result.error); text = result.text; }
      if ($('hub-reply').value !== original) throw new Error('输入已变化，请重新发送');
      if (jobId) await api('aiAuthorizeSend', jobId);
      await exclusiveCommand(chosen.accountId, 'send', { ref: chosen.ref, text, automatic: false });
      if (jobId) await api('aiFinish', jobId, true);
      await api('aiResolve', chosen.accountId, chosen.ref.key);
      accountErrors.delete(chosen.accountId);
      if ($('hub-reply').value === original) { $('hub-reply').value = ''; delete $('hub-reply').dataset.aiJob; }
      $('hub-send-status').textContent = local('已发送', 'Sent'); await refreshAI();
    } catch (error) { if (jobId) await api('aiFinish', jobId, false, error.message).catch(() => {}); $('hub-send-status').textContent = error.message; }
    finally { $('hub-send').disabled = false; }
  });
  function queueAutomatic(accountId, event) {
    if (!event?.ref?.key || event.ref.privateChat === false || event.at < Date.now() - 10000 || !configOf(accountId).enabled) return;
    const key = keyOf(accountId, event.ref.key); const before = autoPending.get(key); if (before) clearTimeout(before.timer);
    const pending = { accountId, event, timer: setTimeout(() => { autoPending.delete(key); automaticReply(accountId, event); }, configOf(accountId).delaySec * 1000) };
    autoPending.set(key, pending);
    trace(accountId, 'queued', { chatKey: event.ref.key, type: event.type, incomingId: event.incomingId || '' });
  }
  async function automaticReply(accountId, event) {
    const key = keyOf(accountId, event.ref.key);
    if (!configOf(accountId).enabled || !configOf(accountId).ready) { trace(accountId, 'skipped', { reason: 'disabled-or-knowledge-not-ready' }); return; }
    if (processing.has(key)) { if (Date.now() - event.at < 120000) setTimeout(() => automaticReply(accountId, event), 1000); return; }
    if (selected?.accountId === accountId && selected?.ref.key === event.ref.key && $('hub-reply').value.trim()) return;
    processing.add(key); let job;
    try {
      const conversation = await exclusiveCommand(accountId, 'thread', { ref: event.ref, automatic: true, expectedIncomingId: event.incomingId, expectedPreview: event.type === 'hint' ? event.preview : '' });
      const last = conversation.messages[conversation.messages.length - 1];
      trace(accountId, 'thread-read', { chatKey: event.ref.key, incomingId: last?.id || '', direction: last?.direction || '', messages: conversation.messages.length });
      if (last?.direction !== 'incoming') { trace(accountId, 'skipped', { reason: 'newest-message-is-not-incoming' }); return; }
      if (event.incomingId && event.incomingId !== last.id) { trace(accountId, 'skipped', { reason: 'newer-message-replaced-event' }); return; }
      if (event.type === 'hint' && event.preview && !last.text.includes(event.preview) && !event.preview.includes(last.text.slice(0, 40))) { trace(accountId, 'skipped', { reason: 'preview-does-not-match-newest-message' }); return; }
      trace(accountId, 'generating', { chatKey: event.ref.key, incomingId: last.id });
      job = await api('aiGenerate', { accountId, chatKey: event.ref.key, incomingId: last.id, messages: conversation.messages, title: event.ref.title, automatic: true, privateChat: conversation.current.privateChat });
      if (job.duplicate || (job.status !== 'draft' && !(job.status === 'handoff' && job.noticeStatus === 'pending'))) { await refreshAI(); return; }
      await exclusive(async () => {
        if (!configOf(accountId).enabled) { await api('aiDiscard', job.id, 'AI 回复已关闭'); return; }
        if (selected?.accountId === accountId && selected?.ref.key === event.ref.key && $('hub-reply').value.trim()) { await api('aiDiscard', job.id, '人工正在输入，未自动发送'); return; }
        const authorized = await api('aiAuthorizeSend', job.id);
        await bridgeCommand(accountId, 'send', { ref: event.ref, text: authorized.text, expectedIncomingId: last.id, automatic: true, privateConfirmed: configOf(accountId).allowedChats.includes(event.ref.key) });
        await api('aiFinish', job.id, true);
        trace(accountId, 'sent', { chatKey: event.ref.key, incomingId: last.id, handoff: job.status === 'handoff' });
      });
      accountErrors.delete(accountId); await refreshAI();
    } catch (error) {
      trace(accountId, 'error', { chatKey: event.ref.key, error: error.message });
      accountErrors.set(accountId, error.message);
      if (job?.id) await api('aiFinish', job.id, false, error.message).catch(() => {});
      else await api('aiHandoff', { accountId, chatKey: event.ref.key, incomingId: event.incomingId || `preview:${event.preview || event.ref.preview || event.ref.key}`, title: event.ref.title, reason: error.message }).catch(() => {});
      await refreshAI().catch(() => {});
    }
    finally { processing.delete(key); }
  }
  let aiRefreshTimer = null;
  window.api.onAIChanged?.(() => { clearTimeout(aiRefreshTimer); aiRefreshTimer = setTimeout(() => refreshAI().catch((error) => notify(error.message, true)), 100); });
  async function initialize() {
    if (!window.api.aiState) return;
    for (let i = 0; i < 100 && !window.blackcatAccountsReady; i++) await sleepHub(100);
    try {
      const stored = await window.api.storeGet('unified-inbox');
      if (stored?.accounts && stored?.threads) cache = stored;
      await refreshAI();
      await loadTranscriptionSettings();
    } catch (error) { notify(error.message, true); }
  }
  window.addEventListener('DOMContentLoaded', initialize);
  window.inboxController = { receive, selectConversation, bridgeCommand, refreshAI, queueAutomatic, showAccountMessages, getState: () => ({ cache, aiState, selected, homeOpen, scopedAccount, selectedAIAccount, tab }), showHome, leaveHome };
  window.I18N?.apply($('hub'));
})();
