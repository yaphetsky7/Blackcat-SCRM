// Admin page: customers, usage, points, plans and settings. Talks only to /admin/api on the same server.
const $ = (id) => document.getElementById(id);
const FEATURE_NAMES = { translate: 'AI 翻译', realtime: '实时翻译预览', quick: '快捷回复', contacts: '联系人', notes: '备注', bulk: '群发', backup: '本地备份', assistant: '黑猫助手', aiReply: 'AI 自动回复 + 知识库' };
const FEATURE_LABELS = { translate: '翻译', assistant: '黑猫助手', ai: 'AI 回复 / 知识库' };
const KIND_NAMES = { reset: '每月重置', grant: '分配', deduct: '扣除', usage: '使用' };
let state = { customers: [], overview: null, editing: null, detail: null };

async function api(path, options = {}) {
  const res = await fetch('/admin/api' + path, { method: options.method || 'GET', headers: options.body ? { 'content-type': 'application/json' } : {}, body: options.body ? JSON.stringify(options.body) : undefined, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({ ok: false, error: '服务器没有响应' }));
  if (res.status === 401 && path !== '/login') { showLogin(); throw Error(data.error); }
  if (!data.ok) throw Error(data.error || '出错了');
  return data.data;
}
// Points are fractional (cost-based); keep one decimal so small usage doesn't show as 0
const fmtPoints = (n) => (n < 0 ? '不限' : (Math.floor(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 }));
const fmtUSD = (n) => '$' + (n || 0).toFixed(n >= 1 ? 2 : 4);
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString() : '—');
const fmtTime = (t) => (t ? new Date(t).toLocaleString() : '—');
const limitText = (n) => (n < 0 ? '不限' : String(n));
const cell = (text, cls) => { const td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; return td; };
const planName = (id) => state.overview?.plans.find((p) => p.id === id)?.name || id;

function showLogin() { $('app-view').hidden = true; $('login-view').hidden = false; $('login-password').focus(); }
async function showApp() { $('login-view').hidden = true; $('app-view').hidden = false; await refresh(); }

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault(); $('login-error').textContent = '';
  try { await api('/login', { method: 'POST', body: { password: $('login-password').value } }); $('login-password').value = ''; await showApp(); }
  catch (err) { $('login-error').textContent = err.message; }
});
$('logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }).catch(() => {}); showLogin(); });
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
  for (const t of ['customers', 'plans', 'cloud', 'updates', 'settings']) $('tab-' + t).hidden = t !== b.dataset.tab;
  if (b.dataset.tab === 'updates') drawUpdates().catch((err) => alert(err.message));
  if (b.dataset.tab === 'cloud') drawCloud().catch((err) => alert(err.message));
}));

async function refresh() {
  [state.overview, state.customers] = await Promise.all([api('/overview'), api('/customers')]);
  drawStats(); drawCustomers(); drawPlans(); drawSettings();
}

function stat(value, label) { const d = document.createElement('div'); d.className = 'stat'; const b = document.createElement('b'); b.textContent = value; const s = document.createElement('span'); s.textContent = label; d.append(b, s); return d; }
function drawStats() {
  const o = state.overview;
  $('stats').replaceChildren(stat(`${o.customers.active || 0} / ${o.customers.n}`, '有效客户 / 全部'), stat(fmtUSD(o.month.cost), '本月 Claude 实际费用'),
    stat(fmtPoints(o.month.points), '本月扣除点数'), stat((o.month.requests || 0).toLocaleString(), '本月 AI 请求次数'),
    ...o.byFeature.map((f) => stat(fmtUSD(f.cost), `本月 ${FEATURE_LABELS[f.feature] || f.feature}`)));
}

function drawCustomers() {
  const q = $('search').value.trim().toLowerCase();
  const rows = state.customers.filter((c) => !q || c.username.toLowerCase().includes(q) || c.note.toLowerCase().includes(q)).map((c) => {
    const tr = document.createElement('tr'); tr.className = 'clickable';
    const expired = !c.unlimited && c.expires_at < Date.now();
    const st = document.createElement('td'); const pill = document.createElement('span');
    pill.className = 'pill ' + (c.disabled || expired ? 'bad' : 'ok'); pill.textContent = c.disabled ? '已停用' : expired ? '已到期' : c.unlimited ? '无限使用' : '正常'; st.append(pill);
    const open = document.createElement('td'); const btn = document.createElement('button'); btn.className = 'link'; btn.textContent = '查看'; open.append(btn);
    tr.append(cell(c.username), cell(c.unlimited ? '无限使用' : planName(c.plan)), cell(c.unlimited ? '—' : fmtDate(c.expires_at)), cell(limitText(c.limits.accounts), 'num'),
      cell(c.unlimited ? '不限' : fmtPoints(c.plan_points + c.bonus_points), 'num'), cell(`${fmtUSD(c.month_cost)} · ${fmtPoints(c.month_points)} 点`, 'num'),
      cell(`${c.devices_active} / ${limitText(c.limits.devices)}`, 'num'), st, open);
    tr.addEventListener('click', () => openDetail(c.id));
    return tr;
  });
  $('customers').tBodies[0].replaceChildren(...rows);
}
$('search').addEventListener('input', drawCustomers);

// ----- create / edit customer -----
function fillPlanSelect(select, value) {
  select.replaceChildren(...state.overview.plans.map((p) => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.hidden ? `${p.name} · 内部，客户看不到` : `${p.name}（$${p.price_month}/月）`; return o; }));
  select.value = value || state.overview.plans[0]?.id;
}
function openCustomerForm(customer) {
  state.editing = customer || null;
  const f = $('customer-form'); f.reset(); $('customer-error').textContent = '';
  $('customer-title').textContent = customer ? `编辑客户：${customer.username}` : '新建客户';
  fillPlanSelect(f.plan, customer?.plan);
  f.username.value = customer?.username || ''; f.username.disabled = !!customer;
  $('password-field').hidden = !!customer; f.password.required = !customer;
  $('disabled-field').hidden = !customer;
  const expires = customer ? new Date(customer.expires_at) : new Date(Date.now() + 31 * 864e5);
  f.expires.value = expires.toISOString().slice(0, 10);
  f.extraAccounts.value = customer?.extra_accounts ?? 0; f.unlimited.checked = !!customer?.unlimited; f.disabled.checked = !!customer?.disabled; f.note.value = customer?.note || '';
  $('customer-dialog').showModal();
}
$('new-customer').addEventListener('click', () => openCustomerForm(null));
$('customer-save').addEventListener('click', async (e) => {
  e.preventDefault();
  const f = $('customer-form');
  if (!f.reportValidity()) return;
  const body = { plan: f.plan.value, expiresAt: new Date(f.expires.value + 'T23:59:59').getTime(), extraAccounts: Number(f.extraAccounts.value) || 0, unlimited: f.unlimited.checked, note: f.note.value };
  try {
    if (state.editing) await api(`/customers/${state.editing.id}`, { method: 'PUT', body: { ...body, disabled: f.disabled.checked } });
    else await api('/customers', { method: 'POST', body: { ...body, username: f.username.value.trim(), password: f.password.value } });
    $('customer-dialog').close(); await refresh();
    if (state.detail) await openDetail(state.detail.user.id);
  } catch (err) { $('customer-error').textContent = err.message; }
});

// ----- customer detail -----
async function openDetail(id) {
  const d = await api(`/customers/${id}`); state.detail = d; const u = d.user;
  $('detail-title').textContent = `${u.username} · ${u.unlimited ? '无限使用' : planName(u.plan)}`;
  $('detail-error').textContent = '';
  $('detail-summary').replaceChildren(
    stat(u.unlimited ? '不限' : fmtPoints(u.plan_points + u.bonus_points), `剩余点数（配套 ${fmtPoints(u.plan_points)} + 充值 ${fmtPoints(u.bonus_points)}）`),
    stat(u.unlimited ? '—' : fmtDate(u.plan_reset_at), '下次每月点数重置'), stat(u.unlimited ? '—' : fmtDate(u.expires_at), '到期日'),
    stat(`${fmtUSD(d.month.cost)}`, `本月 Claude 费用 · ${fmtPoints(d.month.points)} 点`), stat(limitText(u.limits.accounts), '可登录聊天账号'));
  $('daily').tBodies[0].replaceChildren(...(d.daily.length ? d.daily.map((r) => { const tr = document.createElement('tr'); tr.append(cell(r.day), cell(FEATURE_LABELS[r.feature] || r.feature), cell(r.requests, 'num'), cell((r.input_tokens || 0).toLocaleString(), 'num'), cell((r.output_tokens || 0).toLocaleString(), 'num'), cell(fmtUSD(r.cost), 'num'), cell(fmtPoints(r.points), 'num')); return tr; }) : [emptyRow(7, '最近 30 天没有 AI 用量')]));
  $('ledger').tBodies[0].replaceChildren(...(d.ledger.length ? d.ledger.map((r) => { const tr = document.createElement('tr'); tr.append(cell(fmtTime(r.at)), cell(KIND_NAMES[r.kind] || r.kind), cell((r.delta > 0 ? '+' : '') + fmtPoints(Math.abs(r.delta)).replace(/^/, r.delta < 0 ? '-' : ''), 'num'), cell(r.note)); return tr; }) : [emptyRow(4, '没有记录')]));
  $('devices').tBodies[0].replaceChildren(...(d.devices.length ? d.devices.map((r) => {
    const tr = document.createElement('tr'); const act = document.createElement('td'); const b = document.createElement('button'); b.className = 'link'; b.textContent = '退出这台电脑';
    b.addEventListener('click', async () => { await api(`/customers/${u.id}/devices?device=${encodeURIComponent(r.device_id)}`, { method: 'DELETE' }); await openDetail(u.id); await refresh(); });
    act.append(b); tr.append(cell(r.device_name || r.device_id.slice(0, 8)), cell(r.app_version || '—'), cell(fmtTime(r.created_at)), cell(fmtTime(r.last_seen)), act); return tr;
  }) : [emptyRow(5, '没有登录的电脑')]));
  if (!$('detail-dialog').open) $('detail-dialog').showModal();
}
function emptyRow(span, text) { const tr = document.createElement('tr'); const td = cell(text, 'muted'); td.colSpan = span; tr.append(td); return tr; }
$('detail-close').addEventListener('click', () => { $('detail-dialog').close(); state.detail = null; });
$('detail-edit').addEventListener('click', () => openCustomerForm(state.detail.user));
$('points-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target;
  try { await api(`/customers/${state.detail.user.id}/points`, { method: 'POST', body: { delta: Number(f.delta.value), note: f.note.value } }); f.reset(); await openDetail(state.detail.user.id); await refresh(); }
  catch (err) { $('detail-error').textContent = err.message; }
});
$('detail-password').addEventListener('click', async () => {
  const password = prompt('输入新的登录密码（至少 8 位）。修改后这个客户的所有电脑都会被登出。');
  if (!password) return;
  try { await api(`/customers/${state.detail.user.id}/password`, { method: 'POST', body: { password } }); $('detail-error').textContent = '密码已修改'; await openDetail(state.detail.user.id); }
  catch (err) { $('detail-error').textContent = err.message; }
});
$('detail-delete').addEventListener('click', async () => {
  const u = state.detail.user;
  if (prompt(`删除后无法恢复，用量和点数记录也会一起删除。输入用户名「${u.username}」确认：`) !== u.username) return;
  await api(`/customers/${u.id}`, { method: 'DELETE' }); $('detail-dialog').close(); state.detail = null; await refresh();
});

// ----- plans -----
function drawPlans() {
  $('plans').replaceChildren(...state.overview.plans.map((p) => {
    const form = document.createElement('form'); form.className = 'card plan-card' + (p.hidden ? ' internal' : '');
    const field = (name, label, type = 'number', step = 'any') => { const l = document.createElement('label'); l.textContent = label; const i = document.createElement('input'); i.name = name; i.type = type; i.step = step; i.value = p[name]; l.append(i); return l; };
    const h = document.createElement('h2'); h.textContent = p.name;
    // Internal (test) plans never appear in the plan list customers see
    if (p.hidden) { const tag = document.createElement('span'); tag.className = 'pill warn'; tag.textContent = '内部 · 客户看不到'; h.append(tag); }
    const grid = document.createElement('div'); grid.className = 'grid';
    grid.append(field('name', '名称', 'text'), field('price_month', '月费（USD）'), field('price_year', '年费（USD）'), field('included_accounts', '包含聊天账号', 'number', '1'),
      field('extra_price', '额外账号价格（USD/个）'), field('devices', '同时登录的电脑', 'number', '1'), field('monthly_points', '每月 AI 点数', 'number', '1'), field('kb_limit', '知识库数量', 'number', '1'));
    const extra = document.createElement('label'); extra.className = 'check'; const ei = document.createElement('input'); ei.type = 'checkbox'; ei.name = 'extra_allowed'; ei.checked = !!p.extra_allowed; extra.append(ei, ' 允许加购额外账号');
    const feats = document.createElement('div'); feats.className = 'features';
    for (const [k, label] of Object.entries(FEATURE_NAMES)) { const l = document.createElement('label'); l.className = 'check'; const i = document.createElement('input'); i.type = 'checkbox'; i.name = 'f_' + k; i.checked = !!p.features[k]; l.append(i, ' ' + label); feats.append(l); }
    const msg = document.createElement('span'); msg.className = 'muted';
    const save = document.createElement('button'); save.className = 'primary'; save.type = 'submit'; save.textContent = '保存配套';
    const foot = document.createElement('div'); foot.className = 'row'; foot.append(save, msg);
    const cloud = document.createElement('p'); cloud.className = 'muted'; cloud.textContent = p.cloud_bytes ? '云备份：' + (p.cloud_bytes / 1e9) + ' GB（同一客户所有电脑共用）' : '云备份：不包含；可使用本地备份'; form.append(h, grid, cloud, extra, feats, foot);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = form.elements;
      const body = { id: p.id, name: f.name.value, extra_allowed: f.extra_allowed.checked, features: Object.fromEntries(Object.keys(FEATURE_NAMES).map((k) => [k, f['f_' + k].checked])) };
      for (const k of ['price_month', 'price_year', 'included_accounts', 'extra_price', 'devices', 'monthly_points', 'kb_limit']) body[k] = Number(f[k].value);
      try { await api('/plans', { method: 'PUT', body }); msg.textContent = '已保存'; await refresh(); } catch (err) { msg.textContent = err.message; }
    });
    return form;
  }));
}

// ----- settings -----
function drawSettings() {
  $('multiplier').value = state.overview.multiplier;
  $('key-status').textContent = state.overview.keyConfigured ? '服务器已配置 Claude API Key（ANTHROPIC_API_KEY）。' : '服务器还没有配置 Claude API Key：在启动服务器时设置环境变量 ANTHROPIC_API_KEY，客户才能使用黑猫点数。';
}
$('multiplier-form').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/settings', { method: 'PUT', body: { multiplier: Number($('multiplier').value) } }); alert('已保存'); await refresh(); } catch (err) { alert(err.message); } });
$('admin-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/admin-password', { method: 'POST', body: { current: $('admin-current').value, next: $('admin-next').value } }); alert('密码已修改，请重新登录'); showLogin(); }
  catch (err) { alert(err.message); }
});

api('/overview').then(showApp, () => showLogin());

// ---------- Cloud backup ----------
const fmtBytes = (n) => { n = n || 0; if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e11 ? 0 : 2) + ' GB'; if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB'; return Math.round(n / 1e3) + ' KB'; };
function bar(used, limit) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const b = document.createElement('div'); b.className = 'bar' + (ratio >= 0.95 ? ' full' : ratio >= 0.8 ? ' warn' : '');
  const i = document.createElement('i'); i.style.width = (ratio * 100).toFixed(1) + '%'; b.append(i); return b;
}
function usageStat(value, label, used, limit) { const s = stat(value, label); s.append(bar(used, limit)); return s; }
async function drawCloud() {
  const d = await api('/cloud'), o = d.ops;
  $('cloud-stats').replaceChildren(
    stat(d.configured ? '已接通' : '未接通', 'R2 云储存'),
    usageStat(`${fmtBytes(d.sharedUsedBytes)} / ${fmtBytes(d.sharedLimitBytes)}`, d.trial ? '全部客户已用（试用保护上限）' : '全部客户已用', d.sharedUsedBytes, d.sharedLimitBytes),
    usageStat(`${o.A.toLocaleString()} / ${o.limitA.toLocaleString()}`, `本月写入请求（${o.month}）`, o.A, o.limitA),
    usageStat(`${o.B.toLocaleString()} / ${o.limitB.toLocaleString()}`, `本月读取请求（${o.month}）`, o.B, o.limitB),
    stat(String(d.customers.filter((c) => c.usedBytes > 0).length), '正在使用云备份的客户'));
  $('cloud-note').hidden = d.configured && !d.trial;
  $('cloud-note').textContent = !d.configured ? '服务器还没有接通 R2：客户上传云备份会失败，本机资料不受影响。请在服务器运行 blackcat-configure-r2。'
    : '目前是试用保护：全部客户合计最多 ' + fmtBytes(d.sharedLimitBytes) + '（低于 R2 免费 10 GB）。正式开放 100 / 500 GB 前，需要在服务器提高 R2_TOTAL_LIMIT_BYTES，并承担实际用量费用。';
  $('cloud-customers').tBodies[0].replaceChildren(...(d.customers.length ? d.customers.map((c) => {
    const tr = document.createElement('tr'); tr.className = 'clickable';
    const use = document.createElement('td'); const box = document.createElement('div'); box.className = 'usage';
    const t = document.createElement('span'); t.textContent = `${fmtBytes(c.usedBytes)} / ${c.quotaBytes ? fmtBytes(c.quotaBytes) : '不包含'}`; box.append(t, bar(c.usedBytes, c.quotaBytes)); use.append(box);
    const plan = cell(c.planName); if (c.disabled) { const p = document.createElement('span'); p.className = 'pill bad'; p.textContent = '已停用'; plan.append(' ', p); }
    const open = document.createElement('td'); const btn = document.createElement('button'); btn.className = 'link'; btn.textContent = '查看'; open.append(btn);
    tr.append(cell(c.username), plan, use, cell(String(c.restorePoints), 'num'), cell(String(c.chatSegments), 'num'), cell(fmtTime(c.lastBackup)), open);
    tr.addEventListener('click', () => openCloud(c.id));
    return tr;
  }) : [emptyRow(7, '还没有客户使用云备份（Business / Enterprise 配套的客户才会出现在这里）')]));
}
$('cloud-refresh').addEventListener('click', () => drawCloud().catch((err) => alert(err.message)));
let cloudId = null;
async function openCloud(id) {
  cloudId = id; const d = await api(`/cloud/${id}`);
  $('cloud-title').textContent = `${d.username} · 云备份`;
  $('cloud-summary').replaceChildren(
    usageStat(`${fmtBytes(d.usedBytes)} / ${d.quotaBytes ? fmtBytes(d.quotaBytes) : '不包含'}`, `已用空间 · ${d.planName}`, d.usedBytes, d.quotaBytes),
    stat(String(d.snapshots.length), '恢复点'),
    stat(String(d.chat.n), `云端聊天段 · ${fmtBytes(d.chat.bytes)}`),
    stat(fmtTime(Math.max(d.chat.last || 0, d.snapshots[0]?.created || 0) || null), '最近备份'));
  $('cloud-snapshots').tBodies[0].replaceChildren(...(d.snapshots.length ? d.snapshots.map((s) => {
    const tr = document.createElement('tr'); const act = document.createElement('td'); const b = document.createElement('button'); b.className = 'link danger-link'; b.textContent = '删除';
    b.addEventListener('click', async () => {
      if (!confirm(`删除「${s.label}」在 ${fmtTime(s.created)} 的恢复点？客户电脑上的资料不受影响。`)) return;
      try { const r = await api(`/cloud/${id}/snapshots/${s.id}`, { method: 'DELETE' }); $('cloud-status').textContent = r.cleanError ? `已删除恢复点；空间暂时没有清理（${r.cleanError}），稍后可点“清理未使用的空间”` : `已删除，释放 ${r.removed} 个未使用的分块`; await openCloud(id); await drawCloud(); }
      catch (err) { $('cloud-status').textContent = err.message; }
    });
    act.append(b); tr.append(cell(s.label), cell(fmtTime(s.created)), cell(fmtBytes(s.bytes), 'num'), act); return tr;
  }) : [emptyRow(4, '没有恢复点')]));
  if (!$('cloud-dialog').open) { $('cloud-status').textContent = ''; $('cloud-dialog').showModal(); }
}
$('cloud-close').addEventListener('click', () => { $('cloud-dialog').close(); cloudId = null; });
$('cloud-clean').addEventListener('click', async () => {
  $('cloud-clean').disabled = true; $('cloud-status').textContent = '正在清理…';
  try { const r = await api(`/cloud/${cloudId}/cleanup`, { method: 'POST' }); $('cloud-status').textContent = r.removed ? `已清理 ${r.removed} 个未使用的分块` : '没有可清理的空间（一天内上传的内容会先保留）'; await openCloud(cloudId); await drawCloud(); }
  catch (err) { $('cloud-status').textContent = err.message; }
  $('cloud-clean').disabled = false;
});

// ---------- Software updates ----------
const fmtSize = (n) => (n / 1048576).toFixed(1) + ' MB';
async function drawUpdates() {
  const d = await api('/updates'); const r = d.release, b = d.built;
  const newer = b && (!r || b.version.localeCompare(r.version, undefined, { numeric: true }) > 0);
  $('built-info').textContent = !b ? '项目的 dist 文件夹里还没有安装包。先把 package.json 的 version 调高，再运行 npm run dist。'
    : newer ? `可以发布：v${b.version}（${fmtSize(b.size)}，打包于 ${fmtTime(b.builtAt)}）`
    : `dist 里最新的是 v${b.version}，已经发布过。要推送新更新，先调高 package.json 的 version 并重新打包。`;
  $('publish-button').disabled = !newer; $('publish-button').textContent = newer ? `发布 v${b.version}` : '发布';
  $('release-form').hidden = !r;
  if (r) {
    $('release-info').textContent = `v${r.version} · ${fmtSize(r.size)} · 发布于 ${fmtTime(r.publishedAt)}${r.minVersion ? ' · 强制更新' : ''}`;
    $('release-notes').value = r.notes || ''; $('release-mandatory').checked = !!r.minVersion;
  }
  $('versions').tBodies[0].replaceChildren(...(d.versions.length ? d.versions.map((v) => { const tr = document.createElement('tr'); tr.append(cell(v.version ? 'v' + v.version : '旧版（未上报）'), cell(v.devices, 'num')); return tr; }) : [emptyRow(2, '还没有数据')]));
}
$('publish-form').addEventListener('submit', async (e) => {
  e.preventDefault(); $('publish-button').disabled = true; $('publish-status').textContent = '正在发布…';
  try {
    const r = await api('/updates/publish', { method: 'POST', body: { notes: $('publish-notes').value, mandatory: $('publish-mandatory').checked } });
    $('publish-status').textContent = `已发布 v${r.version}。客户的软件会在 3 小时内（或重开软件时）自动下载。`; $('publish-notes').value = ''; $('publish-mandatory').checked = false;
  } catch (err) { $('publish-status').textContent = err.message; }
  await drawUpdates().catch(() => {});
});
$('release-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/updates', { method: 'PUT', body: { notes: $('release-notes').value, mandatory: $('release-mandatory').checked } }); alert('已保存'); await drawUpdates(); } catch (err) { alert(err.message); }
});
