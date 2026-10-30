// 群发消息（右侧面板，仅 WhatsApp / Telegram）
//   群发任务：可以建多个，列表显示进度；同一个账号被多个任务使用时按顺序排队
//   文案库：文字 + 附件，按分组存放，可多选删除 / 移动
//   名单库：导入的 Excel（或联系人）保存为名单，可查看、改变量名、导出、删除
// 数据存 bulk.json：{ templates: [分组], lists: [名单], tasks: [任务] }
// 依赖 app.js（$、toast、uid、thumb、fmtSize、LANGS、views、accounts、status、askName…）和 contacts.js

let bulk = { templates: [], lists: [], tasks: [] };
let bkView = 'tasks';
let detailTaskId = null;
const tpSelected = new Set();
const lsSelected = new Set();
const bulkWaiters = {}; // jobId -> 等待页面返回发送结果
const runtime = {}; // 任务 id -> { paused, stopped, active: Set(账号) }

const MIN_INTERVAL = 1;
const MAX_INTERVAL = 5 * 3600;
const DEFAULT_INTERVAL = 5;
const STATUS_LABEL = { pending: '待发送', sending: '发送中…', ok: '成功', fail: '失败', stopped: '已停止' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 存取 ----------

function withTemplateGroups(list) {
  if (!Array.isArray(list)) return [];
  if (list.length && !list[0].items) return [{ id: uid(), name: '默认分组', collapsed: false, items: list }];
  return list;
}

async function loadBulk() {
  const d = (await window.api.storeGet('bulk')) || {};
  bulk.templates = withTemplateGroups(d.templates);
  bulk.lists = d.lists || [];
  bulk.tasks = d.tasks || [];
  // 上次关闭软件时还在跑的任务：标记为“已中断”，可以继续
  for (const t of bulk.tasks) {
    if (t.state === 'running') t.state = 'interrupted';
    t.rows.forEach((r) => { if (r.status === 'sending') r.status = 'pending'; });
  }
  updateBulkBadge();
}

let saveTimer = null;
function saveBulk(now = false) {
  clearTimeout(saveTimer);
  const write = () => window.api.storeSet('bulk', bulk);
  if (now) write();
  else saveTimer = setTimeout(write, 1000);
}

// ---------- 小工具 ----------

const bulkPlatform = () => (BULK_PLATFORMS.includes(currentPlatform) ? currentPlatform : 'whatsapp');
const targetLabel = (p) => (p === 'whatsapp' ? '电话号码 / Username' : 'Username');
const normTarget = (p, raw) => {
  const s = String(raw || '').trim();
  if(p==='whatsapp'){try{return BlackCatRecipients.whatsapp(s).target;}catch{return '';}}return looksLikePhone(s)?cleanPhone(s):cleanUsername(s);
};
const showTarget = (p, t) => (/^\d+$/.test(t) ? `+${t}` : String(t).startsWith('@')?String(t):`@${t}`);
const fmtTime = (ms) => new Date(ms).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtDuration = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)} 小时` : s >= 60 ? `${Math.round(s / 60)} 分钟` : `${Math.round(s)} 秒`);

// 文字里的 @变量名 换成这一行的值（长的变量名先换，避免 @名字2 被 @名字 截断）
function fillVars(text, columns, values) {
  return columns
    .map((name, i) => [name, values[i] ?? ''])
    .sort((a, b) => b[0].length - a[0].length)
    .reduce((t, [name, value]) => t.split(`@${name}`).join(value), text);
}

const usedVars = (text) => [...new Set([...text.matchAll(/@([^\s@，。,.!?！？:：;；()（）]+)/g)].map((m) => m[1]))];

// 平均分：30 人 2 个号 → 每个号 15 人
function splitEvenly(rows, ids) {
  const base = Math.floor(rows.length / ids.length);
  const extra = rows.length % ids.length;
  const out = {};
  let at = 0;
  ids.forEach((id, i) => {
    const n = base + (i < extra ? 1 : 0);
    out[id] = rows.slice(at, at + n);
    at += n;
  });
  return out;
}

const allTemplates = () => bulk.templates.flatMap((g) => g.items);
const findTemplate = (id) => allTemplates().find((t) => t.id === id);
const findList = (id) => bulk.lists.find((l) => l.id === id);
const findTask = (id) => bulk.tasks.find((t) => t.id === id);

function fileList(files, onRemove) {
  const frag = document.createDocumentFragment();
  for (const f of files) {
    const li = document.createElement('li');
    li.appendChild(thumb(f));
    const name = document.createElement('span');
    name.className = 'fname';
    name.textContent = f.name;
    const size = document.createElement('span');
    size.className = 'fsize';
    size.textContent = fmtSize(f.size);
    li.append(name, size);
    if (onRemove) {
      const del = document.createElement('button');
      del.className = 'icon-btn';
      del.title = '移除';
      del.innerHTML = ICONS.close;
      del.addEventListener('click', () => onRemove(f));
      li.appendChild(del);
    }
    frag.appendChild(li);
  }
  return frag;
}

// 附件还被未完成的任务用着就先别删
function deleteFilesIfUnused(files) {
  const busy = new Set(bulk.tasks.filter((t) => (t.state !== 'done' && t.state !== 'stopped') || t.rows.some((row) => row.status === 'fail')).flatMap((t) => t.files.map((f) => f.file)));
  const inTemplates = new Set(allTemplates().flatMap((t) => t.files.map((f) => f.file)));
  const drop = files.filter((f) => !busy.has(f) && !inTemplates.has(f));
  if (drop.length) window.api.quickDeleteFiles(drop);
}

// ---------- 面板 ----------

function renderBulkPanel() {
  document.querySelectorAll('#bk-seg button').forEach((b) => b.classList.toggle('active', b.dataset.view === bkView || (bkView === 'editor' || bkView === 'detail') && b.dataset.view === 'tasks'));
  for (const v of ['tasks', 'editor', 'detail', 'templates', 'lists']) $(`bk-${v}`).hidden = bkView !== v;
  if (bkView === 'tasks') renderTasks();
  if (bkView === 'editor') renderEditor();
  if (bkView === 'detail') renderDetail();
  if (bkView === 'templates') renderTemplates();
  if (bkView === 'lists') renderLists();
}

function showBulkView(v) {
  bkView = v;
  renderBulkPanel();
}

document.querySelectorAll('#bk-seg button').forEach((b) => b.addEventListener('click', () => showBulkView(b.dataset.view)));

// ---------- 任务列表 ----------

function taskCounts(t) {
  const c = { ok: 0, fail: 0, pending: 0, sending: 0, stopped: 0, total: t.rows.length };
  for (const r of t.rows) c[r.status]++;
  c.finished = c.ok + c.fail;
  return c;
}

function taskState(t) {
  if (t.state === 'running') {
    const rt = runtime[t.id];
    if (rt?.stopped) return ['stopped', '正在停止'];
    if (rt?.paused) return ['paused', '已暂停'];
    if (!rt?.active.size) return ['queued', '排队中'];
    return ['running', '进行中'];
  }
  return { draft:['queued','待启动'],interrupted: ['interrupted', '已中断'], done: ['done', '已完成'], stopped: ['stopped', '已停止'] }[t.state] || ['', t.state];
}

function taskCard(t) {
  const c = taskCounts(t);
  const [cls, label] = taskState(t);
  const li = document.createElement('li');
  li.className = 'task-card';
  const accNames = t.accounts.map((id) => findAcc(id)?.name || '已删除').join('、');
  li.innerHTML = `<div class="tc-head"><b></b><span class="chip ${cls}">${label}</span></div>
    <div class="tc-meta"></div>
    <div class="bar"><div style="width:${c.total ? (c.finished / c.total) * 100 : 0}%"></div></div>
    <div class="tc-stats">成功 ${c.ok} · 失败 ${c.fail} · 剩余 ${c.pending + c.sending} · 共 ${c.total}</div>
    <div class="tc-actions"></div>`;
  li.querySelector('b').textContent = t.name;
  li.querySelector('.tc-meta').textContent = `${PLATFORMS[t.platform].label} · ${accNames} · 间隔 ${fmtDuration(t.intervalSec)} · ${fmtTime(t.createdAt)}`;
  const actions = li.querySelector('.tc-actions');
  const add = (text, fn, danger) => {
    const b = document.createElement('button');
    b.className = 'link-btn' + (danger ? ' danger-text' : '');
    b.textContent = text;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    actions.appendChild(b);
    return b;
  };
  if (t.state === 'running') {
    add(runtime[t.id]?.paused ? '继续' : '暂停', () => togglePause(t));
    add('停止', () => stopTask(t), true);
  } else if(t.state==='draft'){add('开始发送',()=>{if(window.confirm(`确认向 ${t.rows.length} 位收件人发送任务「${t.name}」？`))runTask(t);});
  } else if (t.state === 'interrupted') {
    add('继续发送', () => runTask(t));
  }
  if (t.state !== 'running' && c.fail) {
    const retry = add('重试失败项', () => retryFailedTask(t)); retry.dataset.act = 'retry-failed';
    retry.title = '只重试失败的收件人，成功项不会重复发送。';
  }
  add('详情', () => { detailTaskId = t.id; showBulkView('detail'); });
  add('导出结果', () => exportTask(t));
  if (t.state !== 'running') add('删除', () => deleteTask(t), true);
  li.addEventListener('click', () => { detailTaskId = t.id; showBulkView('detail'); });
  return li;
}

function renderTasks() {
  const ul = $('bk-task-list');
  ul.innerHTML = '';
  for (const t of bulk.tasks) ul.appendChild(taskCard(t));
  $('bk-task-empty').hidden = bulk.tasks.length > 0;
  const running = bulk.tasks.filter((t) => t.state === 'running').length;
  $('bk-task-summary').textContent = bulk.tasks.length ? `共 ${bulk.tasks.length} 个任务${running ? `，${running} 个进行中` : ''}` : '';
}

// 发送过程中频繁刷新，合并到 300ms 一次
let refreshTimer = null;
function refreshBulk() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    updateBulkBadge();
    if (sideTab === 'bulk' && (bkView === 'tasks' || bkView === 'detail')) renderBulkPanel();
  }, 300);
}

// 工具栏上显示所有进行中任务的总进度
function updateBulkBadge() {
  const running = bulk.tasks.filter((t) => t.state === 'running');
  const badge = $('bulk-badge');
  const label = $('bulk-tool-label');
  if (!running.length) {
    badge.hidden = true;
    label.textContent = '群发消息';
    return;
  }
  let done = 0;
  let total = 0;
  for (const t of running) {
    const c = taskCounts(t);
    done += c.finished;
    total += c.total;
  }
  badge.hidden = false;
  badge.textContent = `${done}/${total}`;
  label.textContent = `群发 ${total ? Math.floor((done / total) * 100) : 0}%`;
}

function togglePause(t) {
  const rt = runtime[t.id];
  if (!rt) return;
  rt.paused = !rt.paused;
  refreshBulk();
}

function stopTask(t) {
  const rt = runtime[t.id];
  if (rt && window.confirm(`停止「${t.name}」？已发出的不会撤回，剩下的不再发送。`)) {
    rt.stopped = true;
    rt.paused = false;
    refreshBulk();
  }
}

function deleteTask(t) {
  if (!window.confirm(`删除任务「${t.name}」？`)) return;
  bulk.tasks = bulk.tasks.filter((x) => x !== t);
  deleteFilesIfUnused(t.files.map((f) => f.file));
  saveBulk(true);
  if (detailTaskId === t.id) bkView = 'tasks';
  renderBulkPanel();
  updateBulkBadge();
}

async function exportTask(t) {
  const headers = [targetLabel(t.platform), ...t.columns, '发送账号', '状态', '说明'];
  const rows = t.rows.map((r) => [showTarget(t.platform, r.target), ...r.values, findAcc(r.account)?.name || '', STATUS_LABEL[r.status], r.error || '']);
  const saved = await window.api.excelExport({ name: `${t.name}-结果.xlsx`, headers, rows });
  if (saved) toast(`已导出到 ${saved}`);
}

// ---------- 任务详情 ----------

function renderDetail() {
  const t = findTask(detailTaskId);
  if (!t) return showBulkView('tasks');
  const c = taskCounts(t);
  const [cls, label] = taskState(t);
  const hasUsername=t.platform==='whatsapp'&&t.rows.some(r=>String(r.target).startsWith('@'));
  const head = $('bk-detail-head');
  head.innerHTML = `<div class="tc-head"><h3></h3><span class="chip ${cls}">${label}</span></div>
    <div class="tc-meta"></div>
    <div class="bk-detail-bar"><div style="width:${c.total ? (c.finished / c.total) * 100 : 0}%"></div></div>
    <div class="tc-stats">成功 ${c.ok} · 失败 ${c.fail} · 剩余 ${c.pending + c.sending} · 共 ${c.total}</div>
    <div class="tc-actions"></div>`;
  head.querySelector('h3').textContent = t.name;
  head.querySelector('.tc-meta').textContent = `文案「${t.templateName}」· 名单「${t.listName}」· ${t.accounts.map((id) => findAcc(id)?.name || '已删除').join('、')} · 间隔 ${fmtDuration(t.intervalSec)}`;
  const card = taskCard(t);
  head.querySelector('.tc-actions').replaceWith(card.querySelector('.tc-actions'));

  const table = $('bk-detail-table');
  table.innerHTML = '';
  const hr = table.createTHead().insertRow();
  for (const h of ['#', targetLabel(t.platform), ...(hasUsername?['Username key']:[]), ...t.columns, '状态', '账号']) {
    const th = document.createElement('th');
    th.textContent = h;
    hr.appendChild(th);
  }
  const body = table.createTBody();
  t.rows.slice(0, 1000).forEach((r, i) => {
    const tr = body.insertRow();
    tr.insertCell().outerHTML = `<td class="num">${i + 1}</td>`;
    tr.insertCell().textContent = showTarget(t.platform, r.target);
    if(hasUsername){const cell=tr.insertCell();if(String(r.target).startsWith('@')){const input=document.createElement('input');input.type='password';input.autocomplete='off';input.className='username-key-input';input.value=r.usernameKey||'';input.disabled=!!runtime[t.id]||r.status==='ok';input.setAttribute('aria-label','Username key');input.addEventListener('change',()=>{r.usernameKey=input.value.trim();saveBulk(true);});cell.append(input);}else cell.textContent='—';}
    r.values.forEach((v) => { tr.insertCell().textContent = v; });
    const st = tr.insertCell();
    st.className = `st ${r.status}`;
    st.textContent = `${STATUS_LABEL[r.status]}${r.error ? `：${r.error}` : ''}`;
    tr.insertCell().textContent = findAcc(r.account)?.name || '';
  });
}

$('bk-detail-back').addEventListener('click', () => showBulkView('tasks'));

// ---------- 运行 ----------

// 同一时间只让一个账号操作页面：多个聊天页面同时抢输入焦点会互相打断
let pageLock = Promise.resolve();
function exclusive(fn) {
  const run = pageLock.then(fn, fn);
  pageLock = run.catch(() => {});
  return run;
}

// 同一个账号同一时间只跑一个任务，其它任务排队，保证每个账号的间隔
const accountQueues = {};
function onAccount(accId, fn) {
  const run = (accountQueues[accId] || Promise.resolve()).then(fn, fn);
  accountQueues[accId] = run.catch(() => {});
  return run;
}

function bulkJob(t, accId, row, options = {}) {
  return new Promise((resolve) => {
    const jobId = uid();
    const timer = setTimeout(() => {
      delete bulkWaiters[jobId];
      resolve({ ok: false, error: '超时（2 分钟没有完成）' });
    }, 150000);
    bulkWaiters[jobId] = (r) => {
      clearTimeout(timer);
      delete bulkWaiters[jobId];
      resolve(r);
    };
    try {
      views[accId].send('wam:bulk-job', { jobId, target: row.target, usernameKey:row.usernameKey||'', text: fillVars(t.text, t.columns, row.values), files: t.files, deadline:Date.now()+140000, ...options });
    } catch (e) {
      bulkWaiters[jobId]({ ok: false, error: `账号页面不可用：${e.message}` });
    }
  });
}

async function waitInterval(rt, ms) {
  const end = Date.now() + ms;
  while ((Date.now() < end || rt.paused) && !rt.stopped) await sleep(300);
}

async function runTaskAccount(t, accId, rows) {
  const rt = runtime[t.id];
  rt.active.add(accId);
  const releaseView = window.holdAccountView(accId);
  refreshBulk();
  try {
    for (let i = 0; i < rows.length; i++) {
      while (rt.paused && !rt.stopped) await sleep(300);
      if (rt.stopped) break;
      const row = rows[i];
      row.status = 'sending';
      refreshBulk();
      const r = status[accId] !== 'in'
        ? { ok: false, error: '账号没有登录' }
        : await exclusive(() => (rt.stopped ? { ok: false, error: '已停止' } : bulkJob(t, accId, row)));
      row.status = r.ok ? 'ok' : 'fail';
      row.error = r.ok ? (r.note || '') : r.error;
      saveBulk();
      refreshBulk();
      if (i < rows.length - 1) await waitInterval(rt, t.intervalSec * 1000);
    }
  } finally {
    rt.active.delete(accId);
    releaseView();
    refreshBulk();
  }
}

async function retryFailedTask(t) {
  if (t.state === 'running' || runtime[t.id]) return;
  const failed = t.rows.filter((row) => row.status === 'fail');
  if (!failed.length) return toast('没有需要重试的失败项');
  const available = t.accounts.filter((id) => findAcc(id)?.platform === t.platform && status[id] === 'in' && views[id]);
  if (!available.length) return toast('请先登录任务中的发送账号后重试', true);
  if (failed.some((row) => /超时|未确认|部分发送|附件|timed?\s*out|unconfirmed/i.test(row.error || '')) && !window.confirm(window.I18N?.t('部分失败项可能已发送文字或附件。请先核对实际聊天记录，再确认重试这些失败项。成功项不会重发。') || '部分失败项可能已发送文字或附件。请先核对实际聊天记录，再确认重试这些失败项。成功项不会重发。')) return;
  for (const row of failed) { row.lastError = row.error || ''; row.error = ''; row.status = 'pending'; row.retryCount = (row.retryCount || 0) + 1; }
  t.retryCount = (t.retryCount || 0) + 1;
  return runTask(t, failed, available);
}

async function runTask(t, selectedRows = null, selectedAccounts = null) {
  if (runtime[t.id]) return;
  const accs = (selectedAccounts || t.accounts).filter((id) => findAcc(id));
  if (!accs.length) return toast('这个任务的发送账号都已删除', true);
  const rt = { paused: false, stopped: false, active: new Set() };
  runtime[t.id] = rt;
  t.state = 'running';
  const pending = (selectedRows || t.rows).filter((r) => r.status === 'pending');
  const groups = splitEvenly(pending, accs);
  for (const [id, rows] of Object.entries(groups)) rows.forEach((r) => { r.account = id; });
  saveBulk(true);
  refreshBulk();

  await Promise.all(accs.map((id) => onAccount(id, () => runTaskAccount(t, id, groups[id]))));

  if (rt.stopped) {
    pending.filter((r) => r.status === 'pending').forEach((r) => { r.status = 'stopped'; });
    t.state = 'stopped';
  } else {
    t.state = t.rows.some((row) => row.status === 'pending') ? 'interrupted' : 'done';
  }
  t.finishedAt = Date.now();
  delete runtime[t.id];
  saveBulk(true);
  refreshBulk();
  const c = taskCounts(t);
  toast(`「${t.name}」${t.state === 'stopped' ? '已停止' : '完成'}：成功 ${c.ok}，失败 ${c.fail}`);
}

// ---------- 新建任务 ----------

let draft = null;

function draftList() {
  return draft?.manualList?.id === draft?.listId && draft?.manualList?.platform === bulkPlatform()
    ? draft.manualList : findList(draft?.listId);
}

function newDraft() {
  draft = {
    name: `群发任务 ${fmtTime(Date.now())}`,
    templateId: allTemplates()[0]?.id || '',
    listId: bulk.lists.find((l) => l.platform === bulkPlatform())?.id || '',
    accounts: new Set(),
  };
  $('te-int-on').checked = false;
  $('te-int-value').value = 30;
  $('te-int-unit').value = '1';
  $('te-error').textContent = '';
}

$('bk-new-task').addEventListener('click', () => {
  newDraft();
  showBulkView('editor');
});
$('bk-editor-back').addEventListener('click', () => showBulkView('tasks'));

function intervalSeconds() {
  if (!$('te-int-on').checked) return DEFAULT_INTERVAL;
  return Number($('te-int-value').value) * Number($('te-int-unit').value);
}

function renderEditor() {
  if (!draft) newDraft();
  const p = bulkPlatform();
  $('te-name').value = draft.name;

  const tsel = $('te-template');
  tsel.innerHTML = '';
  if (!allTemplates().length) tsel.add(new Option('（文案库还没有文案，先去「文案库」新建）', ''));
  for (const g of bulk.templates) {
    if (!g.items.length) continue;
    const og = document.createElement('optgroup');
    og.label = g.name;
    for (const t of g.items) og.appendChild(new Option(t.name, t.id));
    tsel.appendChild(og);
  }
  if (!findTemplate(draft.templateId)) draft.templateId = allTemplates()[0]?.id || '';
  tsel.value = draft.templateId;

  const lsel = $('te-list');
  lsel.innerHTML = '';
  const lists = bulk.lists.filter((l) => l.platform === p);
  if (draft.manualList?.platform === p) lists.unshift(draft.manualList);
  if (!lists.length) lsel.add(new Option(`（还没有 ${PLATFORMS[p].label} 名单，可手动输入或导入）`, ''));
  for (const l of lists) lsel.add(new Option(`${l.name}（${l.rows.length} 人）${l.temporary ? ' · 仅本次' : ''}`, l.id));
  if (!lists.some((l) => l.id === draft.listId)) draft.listId = lists[0]?.id || '';
  lsel.value = draft.listId;

  renderEditorPreview();
  renderEditorAccounts();
}

function renderEditorPreview() {
  const tpl = findTemplate(draft.templateId);
  const list = draftList();
  const box = $('te-preview');
  if (!tpl) {
    box.className = 'bk-preview empty';
    box.textContent = '请选择文案';
  } else {
    const text = list?.rows[0] ? fillVars(tpl.text, list.columns, list.rows[0].values) : tpl.text;
    const files = tpl.files.length ? `\n\n＋ ${tpl.files.length} 个附件：${tpl.files.map((f) => f.name).join('、')}` : '';
    box.className = 'bk-preview';
    box.textContent = `${text}${files}`;
  }
  const vars = tpl ? usedVars(tpl.text) : [];
  const cols = list?.columns || [];
  const missing = vars.filter((v) => !cols.some((c) => v.startsWith(c)));
  $('te-vars').textContent = list
    ? `名单变量：${cols.length ? cols.map((c) => `@${c}`).join('、') : '无'}${missing.length ? `；文案里的 ${missing.map((v) => `@${v}`).join('、')} 不在名单里，会原样发出` : ''}`
    : '';
  $('te-vars').classList.toggle('danger-text', missing.length > 0);
}

function renderEditorAccounts() {
  const p = bulkPlatform();
  const box = $('te-accounts');
  box.innerHTML = '';
  const accs = accounts.filter((a) => a.platform === p);
  if (!accs.length) box.textContent = `还没有 ${PLATFORMS[p].label} 会话`;
  for (const acc of accs) {
    const online = status[acc.id] === 'in';
    if (!online) draft.accounts.delete(acc.id);
    const busy = bulk.tasks.some((t) => t.state === 'running' && t.accounts.includes(acc.id));
    const label = document.createElement('label');
    label.className = 'bulk-acc' + (online ? '' : ' disabled');
    label.innerHTML = `<input type="checkbox">${acc.avatar ? `<img src="${acc.avatar}" alt="">` : '<span class="ct-avatar"></span>'}
      <span class="acc-name"></span><span class="acc-tag"></span><span class="acc-progress"></span>`;
    const cb = label.querySelector('input');
    cb.checked = draft.accounts.has(acc.id);
    cb.disabled = !online;
    cb.addEventListener('change', () => {
      if (cb.checked) draft.accounts.add(acc.id);
      else draft.accounts.delete(acc.id);
      renderSplit();
    });
    label.querySelector('.acc-name').textContent = acc.name;
    label.querySelector('.acc-tag').textContent = `${accountTag(acc)}${online ? '' : `（${STATUS_TEXT[status[acc.id] || 'loading']}）`}`;
    label.querySelector('.acc-progress').textContent = busy ? '有任务进行中，会排队' : '';
    box.appendChild(label);
  }
  renderSplit();
}

function renderSplit() {
  const list = draftList();
  const n = list?.rows.length || 0;
  const k = draft.accounts.size;
  const sec = intervalSeconds();
  const ok = Number.isFinite(sec) && sec >= MIN_INTERVAL && sec <= MAX_INTERVAL;
  $('te-int-tip').textContent = ok ? `${$('te-int-on').checked ? '' : '不勾选时每条间隔 5 秒。'}范围 1 秒 – 5 小时。` : '间隔必须在 1 秒到 5 小时之间';
  $('te-int-tip').classList.toggle('danger-text', !ok);
  if (!n || !k) {
    $('te-split').textContent = k ? '' : '勾选一个或多个已登录的账号';
    return;
  }
  const per = Math.ceil(n / k);
  $('te-split').textContent = `共 ${n} 人，${k} 个账号平均分配，每个账号约 ${per} 条${ok ? `，预计 ${fmtDuration(Math.max(0, per - 1) * sec + per * 6)} 完成` : ''}`;
}

$('te-name').addEventListener('input', (e) => { draft.name = e.target.value; });
$('te-template').addEventListener('change', (e) => { draft.templateId = e.target.value; renderEditorPreview(); });
$('te-list').addEventListener('change', (e) => { draft.listId = e.target.value; renderEditorPreview(); renderSplit(); });
['te-int-on', 'te-int-value', 'te-int-unit'].forEach((id) => $(id).addEventListener('input', renderSplit));
$('te-int-on').addEventListener('change', renderSplit);
$('te-int-unit').addEventListener('change', renderSplit);

$('te-import').addEventListener('click', async () => {
  const list = await importListFromExcel();
  if (!list) return;
  draft.listId = list.id;
  renderEditor();
});
$('te-template-dl').addEventListener('click', downloadTemplate);
$('te-manual').addEventListener('click', () => openManualList());

$('te-start').addEventListener('click', () => {
  const err = (m) => { $('te-error').textContent = m; };
  err('');
  const p = bulkPlatform();
  const tpl = findTemplate(draft.templateId);
  const list = draftList();
  const sec = intervalSeconds();
  if (!tpl) return err('请选择文案（没有的话先去「文案库」新建）');
  if (!tpl.text.trim() && !tpl.files.length) return err('这个文案没有内容');
  if (!list || !list.rows.length) return err('请选择有收件人的名单');
  if (list.platform !== p) return err('名单与当前平台不一致');
  for (const id of [...draft.accounts]) if (findAcc(id)?.platform !== p) draft.accounts.delete(id);
  if (!draft.accounts.size) return err('请勾选至少一个发送账号');
  if (!Number.isFinite(sec) || sec < MIN_INTERVAL || sec > MAX_INTERVAL) return err('间隔必须在 1 秒到 5 小时之间');
  if (!window.confirm(`确定用 ${draft.accounts.size} 个账号向 ${list.rows.length} 人群发吗？\n\n提示：短时间给不认识的人发大量消息，账号可能被平台限制或封号。`)) return;

  const t = {
    id: uid(),
    name: draft.name.trim() || `群发任务 ${fmtTime(Date.now())}`,
    platform: p,
    templateName: tpl.name,
    listName: list.name,
    text: tpl.text,
    files: [...tpl.files],
    columns: [...list.columns],
    rows: list.rows.map((r) => ({ target: r.target, ...(r.usernameKey?{usernameKey:r.usernameKey}:{}), values: [...r.values], status: 'pending', error: '', account: null })),
    accounts: [...draft.accounts],
    intervalSec: sec,
    state: 'running',
    createdAt: Date.now(),
  };
  bulk.tasks.unshift(t);
  draft = null;
  showBulkView('tasks');
  runTask(t);
});

// ---------- 文案库 ----------

let tmEditing = null; // { item, group, files, added }

function renderTemplates() {
  const box = $('tp-groups');
  box.innerHTML = '';
  for (const id of [...tpSelected]) if (!findTemplate(id)) tpSelected.delete(id);
  for (const group of bulk.templates) {
    const wrap = document.createElement('div');
    wrap.className = 'qr-group' + (group.collapsed ? ' collapsed' : '');
    wrap.innerHTML = `<div class="qr-group-head">
        <span class="caret">▼</span><span class="qr-group-name"></span><span class="qr-group-count">(${group.items.length})</span>
        <span class="qr-group-tools">
          <button class="icon-btn" data-act="add" title="在此分组新建文案">${ICONS.plus}</button>
          <button class="icon-btn" data-act="rename" title="重命名分组">${ICONS.edit}</button>
          <button class="icon-btn del" data-act="delete" title="删除分组">${ICONS.trash}</button>
        </span>
      </div>
      <ul class="qr-group-items"></ul>`;
    wrap.querySelector('.qr-group-name').textContent = group.name;
    wrap.querySelector('.qr-group-head').addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'add') openTemplateEditor(null, group);
      else if (act === 'rename') {
        const name = await askName('重命名分组', group.name);
        if (name) { group.name = name; saveBulk(true); renderTemplates(); }
      } else if (act === 'delete') deleteTemplateGroup(group);
      else {
        group.collapsed = !group.collapsed;
        saveBulk();
        wrap.classList.toggle('collapsed', group.collapsed);
      }
    });
    const ul = wrap.querySelector('.qr-group-items');
    for (const item of group.items) {
      const li = document.createElement('li');
      li.className = 'tp-item';
      li.innerHTML = `<input type="checkbox"><div class="qr-item"><div class="tp-name"></div><div class="qr-text"></div><div class="qr-thumbs"></div>
        <div class="qr-item-actions">
          <button class="icon-btn" data-act="edit" title="编辑">${ICONS.edit}</button>
          <button class="icon-btn del" data-act="delete" title="删除">${ICONS.trash}</button>
        </div></div>`;
      const cb = li.querySelector('input');
      cb.checked = tpSelected.has(item.id);
      cb.addEventListener('change', () => {
        if (cb.checked) tpSelected.add(item.id);
        else tpSelected.delete(item.id);
        renderTemplateSelection();
      });
      li.querySelector('.tp-name').textContent = item.name;
      li.querySelector('.qr-text').textContent = item.text;
      const thumbs = li.querySelector('.qr-thumbs');
      if (item.files.length) item.files.forEach((f) => thumbs.appendChild(thumb(f)));
      else thumbs.remove();
      li.querySelector('.qr-item').addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'delete') deleteTemplates([item.id]);
        else openTemplateEditor(item, group);
      });
      ul.appendChild(li);
    }
    if (!group.items.length) {
      const p = document.createElement('p');
      p.className = 'qr-group-empty';
      p.textContent = '空分组，鼠标移到分组名上点 ＋ 新建';
      ul.appendChild(p);
    }
    box.appendChild(wrap);
  }
  $('tp-empty').hidden = allTemplates().length > 0 || bulk.templates.length > 0;
  renderTemplateSelection();
}

function renderTemplateSelection() {
  const items = allTemplates();
  $('tp-selected').textContent = tpSelected.size ? `已选 ${tpSelected.size}` : '';
  $('tp-all').checked = items.length > 0 && items.every((t) => tpSelected.has(t.id));
  $('tp-delete').disabled = !tpSelected.size;
  const move = $('tp-move');
  move.innerHTML = '';
  move.add(new Option('移动到分组…', ''));
  for (const g of bulk.templates) move.add(new Option(g.name, g.id));
  move.disabled = !tpSelected.size;
}

$('tp-all').addEventListener('change', () => {
  for (const t of allTemplates()) {
    if ($('tp-all').checked) tpSelected.add(t.id);
    else tpSelected.delete(t.id);
  }
  renderTemplates();
});

$('tp-move').addEventListener('change', (e) => {
  const target = bulk.templates.find((g) => g.id === e.target.value);
  if (!target) return;
  for (const g of bulk.templates) {
    const moving = g.items.filter((t) => tpSelected.has(t.id));
    if (g === target || !moving.length) continue;
    g.items = g.items.filter((t) => !tpSelected.has(t.id));
    target.items.push(...moving);
  }
  target.collapsed = false;
  tpSelected.clear();
  saveBulk(true);
  renderTemplates();
});

function deleteTemplates(ids) {
  if (!ids.length || !window.confirm(`删除 ${ids.length} 条文案？`)) return;
  const drop = new Set(ids);
  const files = [];
  for (const g of bulk.templates) {
    g.items.filter((t) => drop.has(t.id)).forEach((t) => files.push(...t.files.map((f) => f.file)));
    g.items = g.items.filter((t) => !drop.has(t.id));
  }
  ids.forEach((id) => tpSelected.delete(id));
  deleteFilesIfUnused(files);
  saveBulk(true);
  renderTemplates();
}

$('tp-delete').addEventListener('click', () => deleteTemplates([...tpSelected]));

function deleteTemplateGroup(group) {
  const n = group.items.length;
  if (!window.confirm(n ? `删除分组「${group.name}」及其中 ${n} 条文案？` : `删除分组「${group.name}」？`)) return;
  bulk.templates = bulk.templates.filter((g) => g !== group);
  deleteFilesIfUnused(group.items.flatMap((t) => t.files.map((f) => f.file)));
  saveBulk(true);
  renderTemplates();
}

$('tp-add-group').addEventListener('click', async () => {
  const name = await askName('新建文案分组');
  if (!name) return;
  bulk.templates.push({ id: uid(), name, collapsed: false, items: [] });
  saveBulk(true);
  renderTemplates();
});

$('tp-add').addEventListener('click', () => openTemplateEditor(null, null));

for (const [value, label] of LANGS) $('tm-lang').add(new Option(label, value));
$('tm-lang').value = 'en';

function openTemplateEditor(item, group) {
  tmEditing = { item, group, files: item ? [...item.files] : [], added: [] };
  $('tm-title').textContent = item ? '编辑文案' : '新建文案';
  const gsel = $('tm-group');
  gsel.innerHTML = '';
  for (const g of bulk.templates) gsel.add(new Option(g.name, g.id));
  if (!bulk.templates.length) gsel.add(new Option('默认分组（新建）', ''));
  gsel.value = group?.id || bulk.templates[0]?.id || '';
  $('tm-name').value = item?.name || '';
  $('tm-text').value = item?.text || '';
  $('tm-error').textContent = '';
  $('tm-translate-msg').textContent = '';
  renderTemplateFiles();
  $('tpl-modal').hidden = false;
  $('tm-name').focus();
}

function renderTemplateFiles() {
  const ul = $('tm-files');
  ul.innerHTML = '';
  ul.appendChild(fileList(tmEditing.files, (f) => {
    tmEditing.files = tmEditing.files.filter((x) => x !== f);
    renderTemplateFiles();
  }));
}

function closeTemplateEditor(saved) {
  if (!saved && tmEditing?.added.length) window.api.quickDeleteFiles(tmEditing.added);
  tmEditing = null;
  $('tpl-modal').hidden = true;
}

$('tm-pick').addEventListener('click', async () => {
  const r = await window.api.quickPickFiles();
  tmEditing.files.push(...r.files);
  tmEditing.added.push(...r.files.map((f) => f.file));
  $('tm-error').textContent = r.skipped.length ? `超过 200MB，未添加：${r.skipped.join('、')}` : '';
  renderTemplateFiles();
});

// 翻译时把 @变量 换成占位符，翻译完再换回来，变量名不会被翻译掉
$('tm-translate').addEventListener('click', async () => {
  const text = $('tm-text').value.trim();
  if (!text) return;
  const tokens = [];
  const masked = text.replace(/@[^\s@，。,.!?！？:：;；()（）]+/g, (m) => `⟦${tokens.push(m) - 1}⟧`);
  $('tm-translate-msg').textContent = '翻译中…';
  const r = await window.api.translate({ text: masked, source: 'auto', target: $('tm-lang').value, route: 'auto' });
  if (!r.ok) {
    $('tm-translate-msg').textContent = `翻译失败：${r.error}`;
    return;
  }
  $('tm-text').value = r.text.replace(/⟦\s*(\d+)\s*⟧/g, (m, i) => tokens[i] ?? m);
  $('tm-translate-msg').textContent = `已翻译成${LABELS[$('tm-lang').value]}，不满意可以直接修改`;
});

$('tm-save').addEventListener('click', () => {
  const text = $('tm-text').value.trim();
  if (!text && !tmEditing.files.length) {
    $('tm-error').textContent = '请输入文字或添加附件';
    return;
  }
  const name = $('tm-name').value.trim() || text.slice(0, 16) || '未命名文案';
  let target = bulk.templates.find((g) => g.id === $('tm-group').value);
  if (!target) {
    target = { id: uid(), name: '默认分组', collapsed: false, items: [] };
    bulk.templates.push(target);
  }
  const keep = new Set(tmEditing.files.map((f) => f.file));
  const dropped = [...(tmEditing.item?.files.map((f) => f.file) || []), ...tmEditing.added].filter((f) => !keep.has(f));
  if (tmEditing.item) {
    Object.assign(tmEditing.item, { name, text, files: tmEditing.files });
    if (tmEditing.group && tmEditing.group !== target) {
      tmEditing.group.items = tmEditing.group.items.filter((t) => t !== tmEditing.item);
      target.items.push(tmEditing.item);
    }
  } else {
    target.items.push({ id: uid(), name, text, files: tmEditing.files });
  }
  target.collapsed = false;
  closeTemplateEditor(true);
  deleteFilesIfUnused(dropped);
  saveBulk(true);
  renderTemplates();
});

$('tm-cancel').addEventListener('click', () => closeTemplateEditor(false));

// ---------- 名单库 ----------

let viewingList = null;
let manualList = null;
let manualReturnFocus = null;

// 仅检查输入格式；号码 / username 是否真实存在，由平台在使用时判断。
function parseManualTargets(platform, text, existing = []) {
  const seen=new Map(existing.map(row=>[BlackCatRecipients.dedupeKey(platform,row.target),row.usernameKey||''])),targets=[],recipients=[],invalid=[];let duplicates=0;
  const items=String(text).split(/[\r\n,，;；\t]+/).map(s=>s.trim()).filter(Boolean);
  items.forEach((raw,index)=>{let recipient;
    if(platform==='whatsapp'){try{const parsed=BlackCatRecipients.whatsapp(raw);recipient={target:parsed.target,...(parsed.usernameKey?{usernameKey:parsed.usernameKey}:{})};}catch{invalid.push(index+1);return;}}
    else if(platform==='telegram'){const link=raw.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/([^/?#]+)\/?(?:[?#].*)?$/i);const target=(link?link[1]:raw).replace(/^@/,'');if(!/^[A-Za-z0-9_]{1,32}$/.test(target)||/^\d+$/.test(target)){invalid.push(index+1);return;}recipient={target};}
    else{invalid.push(index+1);return;}
    const key=BlackCatRecipients.dedupeKey(platform,recipient.target);if(seen.has(key)){duplicates++;if(platform==='whatsapp'&&recipient.usernameKey&&seen.get(key)!==recipient.usernameKey)invalid.push(index+1);return;}seen.set(key,recipient.usernameKey||'');targets.push(recipient.target);recipients.push(recipient);
  });return{targets,recipients,invalid,duplicates};
}

function openManualList() {
  manualList = { platform: bulkPlatform() };
  manualReturnFocus = document.activeElement;
  const wa = manualList.platform === 'whatsapp';
  $('ml-title').textContent = '手动新建群发名单';
  $('ml-context').textContent = PLATFORMS[manualList.platform].label;
  $('ml-name-label').hidden = false;
  $('ml-name').hidden = false;
  $('ml-persist').checked = true;
  $('ml-name').value = '';
  $('ml-target-label').textContent = wa ? 'WhatsApp 电话号码 / Username' : 'Telegram Username';
  $('ml-targets').value = '';
  $('ml-targets').placeholder = wa ? '+60 123 456 789\n@customer.name\n@another_user | KEY' : '@username_one\nusername_two\nhttps://t.me/username_three';
  $('ml-hint').textContent = wa
    ? '每行填写含国家区号的号码或完整 @username；需要 key 时填写 @username | key。支持 wa.me 链接，重复收件人自动忽略。Username 功能需账号已开放。'
    : '每行一个 Username，可带 @ 或使用 t.me 链接；也可用逗号或分号分隔。空行和重复项会自动忽略。';
  $('ml-save').textContent = '保存并使用';
  $('manual-list-modal').hidden = false;
  renderManualPreview();
  $('ml-targets').focus();
}

function renderManualPreview() {
  if (!manualList) return;
  const parsed = parseManualTargets(manualList.platform, $('ml-targets').value);
  $('ml-summary').textContent = `可新增 ${parsed.targets.length} 人${parsed.duplicates ? `，已忽略 ${parsed.duplicates} 个重复项` : ''}`;
  $('ml-error').textContent = parsed.invalid.length
    ? `第 ${parsed.invalid.slice(0, 5).join('、')} 项格式不正确${parsed.invalid.length > 5 ? `，共 ${parsed.invalid.length} 项` : ''}，请修改后保存。`
    : '';
  $('ml-save').disabled = !parsed.targets.length || parsed.invalid.length > 0;
}

function closeManualList() {
  $('manual-list-modal').hidden = true;
  manualList = null;
  manualReturnFocus?.focus();
  manualReturnFocus = null;
}

$('ml-targets').addEventListener('input', renderManualPreview);
$('ml-persist').addEventListener('change', () => {
  $('ml-save').textContent = $('ml-persist').checked ? '保存并使用' : '仅本次使用';
});
$('ml-cancel').addEventListener('click', closeManualList);
$('manual-list-modal').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.stopPropagation(); closeManualList(); }
});
$('ml-save').addEventListener('click', () => {
  if (!manualList) return;
  const { platform } = manualList;
  const parsed = parseManualTargets(platform, $('ml-targets').value);
  if (!parsed.targets.length || parsed.invalid.length) { renderManualPreview(); return; }
  const name = $('ml-name').value.trim() || `${PLATFORMS[platform].label} 手动名单 ${fmtTime(Date.now())}`;
  let saved;
  if ($('ml-persist').checked) {
    saved = makeList(name, platform, [], parsed.recipients.map((recipient) => ({ ...recipient, values: [] })), '手动输入');
  } else {
    saved = { id: uid(), name, platform, columns: [], rows: parsed.recipients.map((recipient) => ({ ...recipient, values: [] })), temporary: true };
  }
  closeManualList();
  if (!draft) newDraft();
  if (saved.temporary) draft.manualList = saved;
  draft.listId = saved.id;
  showBulkView('editor');
  toast(`已准备 ${parsed.targets.length} 位收件人${saved.temporary ? '，仅用于本次群发' : '，已保存到名单库'}`);
});

function makeList(name, platform, columns, items, source) {
  const list = { id: uid(), name, platform, columns: [...columns], rows: [], createdAt: Date.now(), source };
  const seen = new Set();
  let skipped = 0;
  for (const it of items) {
    let recipient;try{recipient=platform==='whatsapp'?BlackCatRecipients.whatsapp(it.target,it.usernameKey):{target:normTarget(platform,it.target)};}catch{skipped++;continue;}const target=recipient.target,key=BlackCatRecipients.dedupeKey(platform,target);
    if (!target || seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    list.rows.push({ target, ...(recipient.usernameKey?{usernameKey:recipient.usernameKey}:{}), values: columns.map((_, i) => String(it.values[i] ?? '')) });
  }
  bulk.lists.unshift(list);
  saveBulk(true);
  return Object.assign(list, { skipped });
}

// contacts.js 用：勾选的联系人建成名单（变量：名字）
function createListFromContacts(name, platform, items) {
  const list = makeList(name, platform, ['名字'], items.map((c) => ({
    target: platform === 'whatsapp' ? c.phone : c.username || c.phone,
    values: [c.name || ''],
  })), '联系人');
  if (sideTab === 'bulk' && bkView === 'lists') renderLists();
  return list;
}

async function importListFromExcel() {
  const p = bulkPlatform();
  const r = await window.api.excelImport();
  if (!r) return null;
  if (r.error) {
    toast(r.error, true);
    return null;
  }
  const imported=BlackCatRecipients.excel(p,r.headers,r.rows);
  const list = makeList(r.name.replace(/\.(xlsx|csv)$/i, ''), p, imported.columns,imported.rows,r.name);
  toast(`已保存名单「${list.name}」：${list.rows.length} 人${list.skipped ? `，跳过 ${list.skipped} 个空号或重复` : ''}`);
  return list;
}

async function downloadTemplate() {
  const saved = await window.api.excelTemplate(bulkPlatform());
  if (saved) toast(`模板已保存到 ${saved}`);
}

function renderLists() {
  const p = bulkPlatform();
  const lists = bulk.lists.filter((l) => l.platform === p);
  for (const id of [...lsSelected]) if (!lists.some((l) => l.id === id)) lsSelected.delete(id);
  $('ls-summary').textContent = lists.length ? `${PLATFORMS[p].label} 名单 ${lists.length} 个` : '';
  const ul = $('ls-list');
  ul.innerHTML = '';
  for (const l of lists) {
    const li = document.createElement('li');
    li.className = 'ls-item';
    li.innerHTML = `<input type="checkbox"><div class="ls-info"><b></b><div class="ls-meta"></div><div class="tc-actions"></div></div>`;
    const cb = li.querySelector('input');
    cb.checked = lsSelected.has(l.id);
    cb.addEventListener('change', () => {
      if (cb.checked) lsSelected.add(l.id);
      else lsSelected.delete(l.id);
      renderListSelection(lists);
    });
    li.querySelector('b').textContent = l.name;
    li.querySelector('.ls-meta').textContent = `${l.rows.length} 人${l.pendingRecipients?.length?' · '+l.pendingRecipients.length+' 位待补充':''} · 变量：${l.columns.length ? l.columns.join('、') : '无'} · 来源：${l.source || '—'} · ${fmtTime(l.createdAt)}`;
    const actions = li.querySelector('.tc-actions');
    const add = (text, fn, danger) => {
      const b = document.createElement('button');
      b.className = 'link-btn' + (danger ? ' danger-text' : '');
      b.textContent = text;
      b.addEventListener('click', fn);
      actions.appendChild(b);
    };
    add('查看 / 编辑', () => openList(l));
    add('重命名', async () => {
      const name = await askName('重命名名单', l.name);
      if (name) { l.name = name; saveBulk(true); renderLists(); }
    });
    add('导出 Excel', () => exportList(l));
    add('删除', () => deleteLists([l.id]), true);
    ul.appendChild(li);
  }
  $('ls-empty').hidden = lists.length > 0;
  renderListSelection(lists);
}

function renderListSelection(lists) {
  $('ls-selected').textContent = lsSelected.size ? `已选 ${lsSelected.size}` : '';
  $('ls-all').checked = lists.length > 0 && lists.every((l) => lsSelected.has(l.id));
  $('ls-delete').disabled = !lsSelected.size;
}

function deleteLists(ids) {
  if (!ids.length || !window.confirm(`删除 ${ids.length} 个名单？（已建的任务不受影响）`)) return;
  const drop = new Set(ids);
  bulk.lists = bulk.lists.filter((l) => !drop.has(l.id));
  ids.forEach((id) => lsSelected.delete(id));
  saveBulk(true);
  renderLists();
}

$('ls-all').addEventListener('change', () => {
  for (const l of bulk.lists.filter((x) => x.platform === bulkPlatform())) {
    if ($('ls-all').checked) lsSelected.add(l.id);
    else lsSelected.delete(l.id);
  }
  renderLists();
});
$('ls-delete').addEventListener('click', () => deleteLists([...lsSelected]));
$('ls-import').addEventListener('click', async () => { if (await importListFromExcel()) renderLists(); });
$('ls-template').addEventListener('click', downloadTemplate);
$('ls-manual').addEventListener('click', () => openManualList());

async function exportList(l) {
  const saved = await window.api.excelExport({
    name: `${l.name}.xlsx`,
    headers: [targetLabel(l.platform), ...(l.platform==='whatsapp'?['Username key']:[]), ...l.columns],
    rows: l.rows.map((r) => [l.platform === 'whatsapp' ? r.target : showTarget(l.platform, r.target), ...(l.platform==='whatsapp'?[r.usernameKey||'']:[]), ...r.values]),
  });
  if (saved) toast(`已导出到 ${saved}`);
}

function openList(l) {
  viewingList = l;
  $('lm-test-username').hidden=l.platform!=='whatsapp'||!l.rows.some(r=>String(r.target).startsWith('@'));$('lm-test-status').textContent='';
  renderListTable();
  $('list-modal').hidden = false;
}

function renderListTable() {
  const l = viewingList;const hasUsername=l.platform==='whatsapp'&&l.rows.some(r=>String(r.target).startsWith('@'));
  $('lm-help').textContent=hasUsername?'Username key 仅用于首次联系验证；其他列可作为 @变量名。点 × 删除，修改自动保存。':'第 2 列起是变量，点表头可以改变量名（文案里用 @变量名 调用）；点 × 删除一行。修改会自动保存。';
  $('lm-title').textContent = l.name;
  $('lm-count').textContent = `${l.rows.length} 人${l.pendingRecipients?.length?' · '+l.pendingRecipients.length+' 位待补充':''} · ${PLATFORMS[l.platform].label}`;
  const table = $('lm-table');
  table.innerHTML = '';
  const hr = table.createTHead().insertRow();
  hr.insertCell().outerHTML = '<th>#</th>';
  hr.insertCell().outerHTML = `<th>${targetLabel(l.platform)}</th>`;
  if(hasUsername)hr.insertCell().textContent='Username key';
  l.columns.forEach((name, i) => {
    const th = document.createElement('th');
    const input = document.createElement('input');
    input.value = name;
    input.title = '点击修改变量名';
    input.addEventListener('change', () => {
      const v = input.value.trim().replace(/\s+/g, '');
      if (v && !l.columns.includes(v)) {
        l.columns[i] = v;
        saveBulk(true);
      }
      renderListTable();
    });
    th.appendChild(input);
    hr.appendChild(th);
  });
  hr.insertCell().outerHTML = '<th></th>';
  const body = table.createTBody();
  l.rows.slice(0, 2000).forEach((r, idx) => {
    const tr = body.insertRow();
    tr.insertCell().outerHTML = `<td class="num">${idx + 1}</td>`;
    tr.insertCell().textContent = showTarget(l.platform, r.target);
    if(hasUsername){const cell=tr.insertCell();if(String(r.target).startsWith('@')){const input=document.createElement('input');input.type='password';input.autocomplete='off';input.value=r.usernameKey||'';input.placeholder=window.I18N.locale==='en'?'Optional key':'可选 key';input.className='username-key-input';input.setAttribute('aria-label','Username key');input.addEventListener('change',()=>{r.usernameKey=input.value.trim();saveBulk(true);});cell.append(input);}else cell.textContent='—';}
    r.values.forEach((v) => { tr.insertCell().textContent = v; });
    const rm = document.createElement('button');
    rm.className = 'rm';
    rm.textContent = '×';
    rm.title = '删除这一行';
    rm.addEventListener('click', () => {
      l.rows = l.rows.filter((x) => x !== r);
      saveBulk(true);
      renderListTable();
    });
    tr.insertCell().appendChild(rm);
  });
  for(const pending of l.pendingRecipients||[]){const row=body.insertRow();row.className='recipient-pending';const cell=row.insertCell();cell.colSpan=l.columns.length+3+(hasUsername?1:0);cell.textContent=pending.title+' · '+(window.I18N.locale==='en'?'Needs recipient details. Will not send.':pending.reason+'；待补充，不会发送');const remove=document.createElement('button');remove.type='button';remove.className='rm';remove.textContent='×';remove.title=window.I18N.locale==='en'?'Remove pending recipient':'移除此待补充客户';remove.addEventListener('click',()=>{l.pendingRecipients=l.pendingRecipients.filter(v=>v!==pending);saveBulk(true);renderListTable();});cell.append(' ',remove);}
  if (l.rows.length > 2000) {
    const tr = body.insertRow();
    tr.className = 'empty-row';
    const td = tr.insertCell();
    td.colSpan = l.columns.length + 3 + (hasUsername?1:0);
    td.textContent = `只显示前 2000 行，共 ${l.rows.length} 行`;
  }
}

$('lm-close').addEventListener('click', () => {
  $('list-modal').hidden = true;
  viewingList = null;
  if (sideTab === 'bulk') renderBulkPanel();
});
$('lm-export').addEventListener('click', () => viewingList && exportList(viewingList));

const usernameTest=document.createElement('button');usernameTest.type='button';usernameTest.id='lm-test-username';usernameTest.textContent='测试首个 Username（不发送）';$('lm-export').before(usernameTest);
const usernameTestStatus=document.createElement('p');usernameTestStatus.id='lm-test-status';usernameTestStatus.className='bulk-tip';$('lm-table').parentElement.before(usernameTestStatus);
usernameTest.addEventListener('click',async()=>{const list=viewingList,row=list?.rows.find(r=>String(r.target).startsWith('@')),account=findAcc(activeId());if(!row||list.platform!=='whatsapp'){usernameTestStatus.textContent=window.I18N.locale==='en'?'This list has no WhatsApp usernames.':'此名单没有WhatsApp Username。';return;}if(account?.platform!=='whatsapp'||status[account.id]!=='in'){usernameTestStatus.textContent=window.I18N.locale==='en'?'Select a signed-in WhatsApp account first.':'请先选择一个已登录的WhatsApp账号。';return;}usernameTest.disabled=true;usernameTestStatus.textContent=window.I18N.locale==='en'?'Checking recipient. No message will be sent…':'正在核对收件人，不会发送消息…';const release=holdView(account.id);try{const result=await exclusive(()=>bulkJob({text:'',files:[],columns:[]},account.id,row,{dryRun:true}));usernameTestStatus.textContent=result.ok?(window.I18N.locale==='en'?'Recipient verified. No message sent.':'收件人已核对，未发送消息。'):result.error;}catch(error){usernameTestStatus.textContent=error.message;}finally{release();usernameTest.disabled=false;}});
window.I18N?.extend({'Username key 仅用于首次联系验证；其他列可作为 @变量名。点 × 删除，修改自动保存。':'Username key verifies first contact. Other columns can be used as @variables. Click × to remove a row. Changes save automatically.','电话号码 / Username':'Phone number / username','WhatsApp 电话号码 / Username':'WhatsApp phone number / username','测试首个 Username（不发送）':'Test first username (no message)','每行填写含国家区号的号码或完整 @username；需要 key 时填写 @username | key。支持 wa.me 链接，重复收件人自动忽略。Username 功能需账号已开放。':'Enter a phone number with country code or an exact @username on each line. For a key, use @username | key. wa.me links are accepted. Duplicates are ignored. Your account must support usernames.'});

loadBulk();

