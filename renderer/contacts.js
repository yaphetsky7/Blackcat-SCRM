// 联系人（仅 WhatsApp / Telegram）
//   账号联系人：账号登录后自动从页面读取（之后每 30 分钟同步一次），只读，缓存在 account-contacts.json
//   我的联系人：手动添加 / Excel 导入，同平台所有会话共用，存 contacts.json
// WhatsApp 用电话号码，Telegram 用 username（没有就用手机号）
// 依赖 app.js 里的 $、toast、uid、views、accounts、status、currentPlatform、PLATFORMS 等

let contacts = { whatsapp: [], telegram: [] }; // 我的联系人
let accountContacts = {}; // 会话 id -> { at, list: [{ phone, username, name }] }
let ctView = 'account';
let ctAccount = 'all';
const ctSelected = new Set();
let editingContact = null;
const contactWaiters = {}; // 请求 id -> 等待账号返回联系人
const SYNC_EVERY = 30 * 60 * 1000;

const cleanPhone = (s) => String(s || '').replace(/\D/g, '');
const cleanUsername = (s) => String(s || '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
const looksLikePhone = (s) => /^\+?[\d\s-]{6,}$/.test(String(s || '').trim());

const contactKey = (platform, c) => (platform === 'whatsapp' ? c.phone : (c.username || '').toLowerCase() || c.phone);
const contactLabel = (platform, c) => {
  if (platform === 'whatsapp') return `+${c.phone}`;
  return c.username ? `@${c.username}` : c.phone ? `+${c.phone}` : '';
};

async function loadContacts() {
  contacts = { whatsapp: [], telegram: [], ...((await window.api.storeGet('contacts')) || {}) };
  accountContacts = (await window.api.storeGet('account-contacts')) || {};
}

const saveContacts = () => window.api.storeSet('contacts', contacts);
const saveAccountContacts = () => window.api.storeSet('account-contacts', accountContacts);

function normalizeContact(platform, raw) {
  const name = String(raw.name || '').trim();
  if (platform === 'whatsapp') {
    const phone = cleanPhone(raw.phone);
    return phone.length >= 6 ? { id: uid(), phone, name } : null;
  }
  const username = cleanUsername(raw.username);
  const phone = cleanPhone(raw.phone);
  return username || phone ? { id: uid(), username, phone, name } : null;
}

// 合并进“我的联系人”，按号码 / username 去重
function mergeContacts(platform, list) {
  const have = new Set(contacts[platform].map((c) => contactKey(platform, c)));
  let added = 0;
  let skipped = 0;
  for (const raw of list) {
    const c = normalizeContact(platform, raw);
    const key = c && contactKey(platform, c);
    if (!key || have.has(key)) {
      skipped++;
      continue;
    }
    have.add(key);
    contacts[platform].push(c);
    added++;
  }
  saveContacts();
  return { added, skipped };
}

// ---------- 账号联系人：自动同步 ----------

function fetchAccountContacts(accId) {
  return new Promise((resolve) => {
    const reqId = uid();
    const timer = setTimeout(() => {
      delete contactWaiters[reqId];
      resolve({ ok: false, error: '读取超时' });
    }, 20000);
    contactWaiters[reqId] = (r) => {
      clearTimeout(timer);
      delete contactWaiters[reqId];
      resolve(r);
    };
    try {
      views[accId].send('wam:get-contacts', reqId);
    } catch (e) {
      contactWaiters[reqId]({ ok: false, error: e.message });
    }
  });
}

const syncing = new Set();
async function syncAccountContacts(accId, force = false) {
  const acc = findAcc(accId);
  if (!acc || !BULK_PLATFORMS.includes(acc.platform) || status[accId] !== 'in' || syncing.has(accId)) return;
  if (!force && Date.now() - (accountContacts[accId]?.at || 0) < SYNC_EVERY) return;
  syncing.add(accId);
  const r = await fetchAccountContacts(accId);
  syncing.delete(accId);
  if (!r.ok) {
    if (force) toast(`「${acc.name}」联系人读取失败：${r.error}`, true);
    return;
  }
  accountContacts[accId] = { at: Date.now(), list: r.list };
  saveAccountContacts();
  if (sideTab === 'contacts') renderContacts();
  if (force) toast(`「${acc.name}」同步了 ${r.list.length} 个联系人`);
}

// 账号刚登录（状态变成“已登录”）时由 app.js 调用；等页面数据加载一会儿再读
window.onAccountOnline = (accId) => setTimeout(() => syncAccountContacts(accId), 8000);
setInterval(() => accounts.forEach((a) => syncAccountContacts(a.id)), 5 * 60 * 1000);

// ---------- 渲染 ----------

const CONTACT_LIMIT = 500;

// 当前视图里的行：{ key, name, sub, from, data }
function contactRows() {
  const p = currentPlatform;
  if (ctView === 'mine') {
    return (contacts[p] || []).map((c) => ({ key: c.id, name: c.name, sub: contactLabel(p, c), data: c }));
  }
  const accs = accounts.filter((a) => a.platform === p && (ctAccount === 'all' || a.id === ctAccount));
  const byKey = new Map();
  for (const acc of accs) {
    for (const c of accountContacts[acc.id]?.list || []) {
      const key = contactKey(p, c);
      if (!key) continue;
      const row = byKey.get(key);
      if (row) row.from.push(acc.name);
      else byKey.set(key, { key, name: c.name, sub: contactLabel(p, c), from: [acc.name], data: c });
    }
  }
  return [...byKey.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

let shownRows = [];

function renderContacts() {
  const p = currentPlatform;
  if (!contacts[p]) return;
  document.querySelectorAll('#ct-seg button').forEach((b) => b.classList.toggle('active', b.dataset.view === ctView));
  $('ct-account-bar').hidden = ctView !== 'account';
  $('ct-mine-bar').hidden = ctView !== 'mine';
  $('ct-to-mine').hidden = ctView !== 'account';
  $('ct-delete').hidden = ctView !== 'mine';

  // 账号下拉
  const accs = accounts.filter((a) => a.platform === p);
  const sel = $('ct-account');
  sel.innerHTML = '';
  sel.add(new Option(`全部 ${PLATFORMS[p].label} 账号`, 'all'));
  for (const a of accs) sel.add(new Option(`${a.name}（${accountTag(a)}）`, a.id));
  if (ctAccount !== 'all' && !accs.some((a) => a.id === ctAccount)) ctAccount = 'all';
  sel.value = ctAccount;

  const all = contactRows();
  const q = $('ct-search').value.trim().toLowerCase();
  shownRows = q ? all.filter((r) => `${r.name} ${r.sub}`.toLowerCase().includes(q)) : all;
  for (const key of [...ctSelected]) if (!all.some((r) => r.key === key)) ctSelected.delete(key);

  if (ctView === 'account') {
    const synced = accs.filter((a) => accountContacts[a.id]).map((a) => accountContacts[a.id].at);
    const last = synced.length ? new Date(Math.max(...synced)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    $('ct-summary').textContent = accs.length
      ? `${all.length} 个联系人${last ? `，${last} 同步` : '，账号登录后会自动读取'}`
      : `还没有 ${PLATFORMS[p].label} 会话`;
  } else {
    $('ct-summary').textContent = `我的联系人 ${all.length} 个（手动添加 / Excel 导入，所有 ${PLATFORMS[p].label} 会话共用）`;
  }

  const ul = $('ct-list');
  ul.innerHTML = '';
  for (const r of shownRows.slice(0, CONTACT_LIMIT)) {
    const li = document.createElement('li');
    li.innerHTML = `<input type="checkbox"><span class="ct-avatar"></span><span class="ct-info"><b></b><span></span></span>`
      + (ctView === 'mine' ? `<span class="ct-actions">
          <button class="icon-btn" data-act="edit" title="编辑">${ICONS.edit}</button>
          <button class="icon-btn del" data-act="delete" title="删除">${ICONS.trash}</button>
        </span>` : '');
    const cb = li.querySelector('input');
    cb.checked = ctSelected.has(r.key);
    cb.addEventListener('change', () => {
      if (cb.checked) ctSelected.add(r.key);
      else ctSelected.delete(r.key);
      renderContactSelection();
    });
    li.querySelector('.ct-avatar').textContent = Array.from(r.name || r.sub.slice(1) || '?')[0].toUpperCase();
    li.querySelector('b').textContent = r.name || '（未命名）';
    const sub = li.querySelector('.ct-info span');
    sub.textContent = r.sub;
    if (ctView === 'account' && ctAccount === 'all' && accs.length > 1) {
      const from = document.createElement('span');
      from.className = 'from';
      from.textContent = ` · ${r.from.join('、')}`;
      sub.appendChild(from);
    }
    li.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'edit') openContactEditor(r.data);
      else if (act === 'delete') deleteMine([r.key]);
      else if (e.target !== cb) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      }
    });
    ul.appendChild(li);
  }
  if (shownRows.length > CONTACT_LIMIT) {
    const more = document.createElement('li');
    more.className = 'ct-more';
    more.textContent = `还有 ${shownRows.length - CONTACT_LIMIT} 个没显示，请用搜索查找（全选会包含全部 ${shownRows.length} 个）`;
    ul.appendChild(more);
  }
  $('ct-empty').hidden = shownRows.length > 0;
  $('ct-empty').textContent = q ? '没有匹配的联系人'
    : ctView === 'mine' ? '还没有联系人，可以手动添加、导入 Excel，或在「账号联系人」里勾选后加入'
      : '账号登录后会自动读取联系人，也可以点「↻ 同步」';
  renderContactSelection();
}

function renderContactSelection() {
  const n = ctSelected.size;
  $('ct-selected').textContent = n ? `已选 ${n}` : '';
  $('ct-all').checked = shownRows.length > 0 && shownRows.every((r) => ctSelected.has(r.key));
  for (const id of ['ct-to-mine', 'ct-to-list', 'ct-delete']) $(id).disabled = !n;
}

const selectedRows = () => contactRows().filter((r) => ctSelected.has(r.key));

function deleteMine(keys) {
  const p = currentPlatform;
  if (!keys.length || !window.confirm(`删除 ${keys.length} 个联系人？`)) return;
  const drop = new Set(keys);
  contacts[p] = contacts[p].filter((c) => !drop.has(c.id));
  keys.forEach((k) => ctSelected.delete(k));
  saveContacts();
  renderContacts();
}

// ---------- 事件 ----------

document.querySelectorAll('#ct-seg button').forEach((b) => b.addEventListener('click', () => {
  ctView = b.dataset.view;
  ctSelected.clear();
  $('ct-search').value = '';
  renderContacts();
}));

$('ct-account').addEventListener('change', (e) => {
  ctAccount = e.target.value;
  ctSelected.clear();
  renderContacts();
});

$('ct-sync').addEventListener('click', () => {
  const ids = accounts.filter((a) => a.platform === currentPlatform && (ctAccount === 'all' || a.id === ctAccount)).map((a) => a.id);
  const online = ids.filter((id) => status[id] === 'in');
  if (!online.length) return toast('没有已登录的账号', true);
  online.forEach((id) => syncAccountContacts(id, true));
});

$('ct-search').addEventListener('input', renderContacts);

$('ct-all').addEventListener('change', () => {
  for (const r of shownRows) {
    if ($('ct-all').checked) ctSelected.add(r.key);
    else ctSelected.delete(r.key);
  }
  renderContacts();
});

$('ct-to-mine').addEventListener('click', () => {
  const rows = selectedRows();
  const { added, skipped } = mergeContacts(currentPlatform, rows.map((r) => r.data));
  ctSelected.clear();
  renderContacts();
  toast(`已加入我的联系人 ${added} 个${skipped ? `，${skipped} 个已存在` : ''}`);
});

$('ct-to-list').addEventListener('click', async () => {
  const rows = selectedRows();
  if (!rows.length) return;
  const name = await askName('新群发名单名称', `联系人名单 ${new Date().toLocaleDateString()}`);
  if (!name) return;
  const list = createListFromContacts(name, currentPlatform, rows.map((r) => r.data));
  ctSelected.clear();
  renderContacts();
  toast(`已创建名单「${list.name}」（${list.rows.length} 人），在「群发消息 › 名单库」里查看`);
});

$('ct-delete').addEventListener('click', () => deleteMine([...ctSelected]));

function openContactEditor(c = null) {
  const p = currentPlatform;
  editingContact = c;
  $('ct-modal-title').textContent = c ? '编辑联系人' : `添加 ${PLATFORMS[p].label} 联系人`;
  $('ct-id-label').textContent = p === 'whatsapp' ? '电话号码（含国家区号，如 60123456789）' : 'Username（或手机号）';
  $('ct-name').value = c?.name || '';
  $('ct-id').value = c ? (p === 'whatsapp' ? c.phone : c.username ? `@${c.username}` : c.phone) : '';
  $('ct-error').textContent = '';
  $('ct-modal').hidden = false;
  $('ct-name').focus();
}

$('ct-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const p = currentPlatform;
  const raw = $('ct-id').value.trim();
  const input = p === 'whatsapp' || looksLikePhone(raw) ? { phone: raw } : { username: raw };
  const c = normalizeContact(p, { ...input, name: $('ct-name').value });
  if (!c) {
    $('ct-error').textContent = p === 'whatsapp' ? '请输入正确的电话号码（至少 6 位数字）' : '请输入 username 或手机号';
    return;
  }
  const key = contactKey(p, c);
  if (contacts[p].some((x) => x !== editingContact && contactKey(p, x) === key)) {
    $('ct-error').textContent = '这个联系人已经存在';
    return;
  }
  if (editingContact) Object.assign(editingContact, { ...c, id: editingContact.id });
  else contacts[p].push(c);
  saveContacts();
  $('ct-modal').hidden = true;
  renderContacts();
});

$('ct-cancel').addEventListener('click', () => { $('ct-modal').hidden = true; });
$('ct-add').addEventListener('click', () => openContactEditor());

$('ct-from-excel').addEventListener('click', async () => {
  const p = currentPlatform;
  const r = await window.api.excelImport();
  if (!r) return;
  if (r.error) return toast(r.error, true);
  const list = r.rows.map((row) => (p === 'whatsapp' || looksLikePhone(row[0])
    ? { phone: row[0], name: row[1] }
    : { username: row[0], name: row[1] }));
  const { added, skipped } = mergeContacts(p, list);
  renderContacts();
  toast(`从 ${r.name} 导入 ${added} 个联系人${skipped ? `，跳过 ${skipped} 个重复或空行` : ''}`);
});

loadContacts();
