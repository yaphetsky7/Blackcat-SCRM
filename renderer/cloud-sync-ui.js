(() => {
  window.I18N?.extend?.({ '云备份': 'Cloud sync' });
  const en = () => window.I18N?.locale === 'en', t = (zh, english) => en() ? english : zh;
  const el = id => document.getElementById('cloud-' + id);
  const size = n => n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : (n / 1e6).toFixed(1) + ' MB';
  let state, busy = false, nextRefresh;
  async function call(action, payload) { const r = await window.api.cloud(action, payload); if (!r.ok) throw Error(r.error); return r.data; }
  function draw() {
    el('title').textContent = t('云端同步', 'Cloud sync');
    el('intro').textContent = t('Business 100 GB · Enterprise 500 GB。登录同一个黑猫账号，电脑之间自动同步最新资料。', 'Business 100 GB · Enterprise 500 GB. Sign into the same BlackCat account to keep your computers up to date.');
    el('primary-title').textContent = t('云端聊天记录', 'Cloud chat history');
    el('primary-description').textContent = t('所有对话集中查看，照片及影片按需读取。同一平台账号重新登录后，会归回正常账号，并保留原有历史。', 'Browse conversations together and load photos and videos on demand. Signing back into the same platform account returns it to active accounts and retains its history.');
    el('capture-label').textContent = t('自动保存软件可读取的聊天', 'Automatically save readable chats');
    el('view').textContent = t('查看云端聊天记录', 'View cloud chats'); el('sync').textContent = t('立即同步聊天', 'Sync chats now');
    el('scan').textContent = t('补存可读取历史', 'Collect readable history'); el('scan-stop').textContent = t('停止扫描', 'Stop scan');
    el('business-title').textContent = t('工作资料同步', 'Workspace sync');
    el('business-description').textContent = t('保存后自动同步，新电脑自动加载。无需下载恢复点、导入或重开软件；断网时保留本机修改，联网后补传。', 'Changes sync automatically and load on a new computer. No recovery points, imports or restarts. Offline changes upload when connectivity returns.');
    el('automatic-label').textContent = t('自动同步工作资料', 'Automatically sync workspace data');
    el('upload').textContent = t('立即同步资料', 'Sync workspace now'); el('refresh').textContent = t('刷新状态', 'Refresh status');
    el('cleanup').textContent = t('清理无引用的云端文件', 'Clean up unreferenced cloud files');
    el('note').textContent = t('仅在软件运行且联网时同步。删除资料也会同步到其他电脑。平台登录与 API 密钥不上传；新电脑需重新登录平台，AI 自动回复需自行开启，群发任务不会自动执行。尚未读取的历史和未获取的原附件需补存。', 'Sync runs while the app is open and online. Deletions sync across computers too. Platform logins and API secrets are excluded. Sign into platforms again and enable AI replies on each computer; bulk jobs never start automatically. Unreadable history and unavailable original attachments still need collection.');
    const sync = state?.businessSync || {}, counts = sync.counts || {};
    const groups = [['联系人', 'Contacts', (counts.contact || 0) + (counts['account-contact'] || 0)], ['群发名单', 'Recipient lists', counts.list || 0], ['群发文案', 'Message templates', counts.template || 0], ['AI 知识库', 'AI knowledge bases', counts.knowledge || 0], ['对话备注', 'Conversation notes', counts.note || 0]];
    el('categories').replaceChildren(...groups.map(([zh, english, n]) => { const card = document.createElement('div'); card.className = 'cloud-category'; const label = document.createElement('span'), count = document.createElement('strong'); label.textContent = t(zh, english); count.textContent = n; card.append(label, count); return card; }));
    if (!state) return;
    el('capture').checked = !!state.captureEnabled; el('capture').disabled = busy || !state.eligible;
    el('view').disabled = busy || !state.configured; el('sync').disabled = busy || state.running || !state.configured || !state.eligible;
    el('scan').disabled = busy || state.running || state.scanRunning || !state.eligible; el('scan-stop').hidden = !state.scanRunning;
    el('primary-status').textContent = [state.scanProgress, state.primaryError || state.legacyMigrationError, t('待同步/补存：', 'Pending sync/media: ') + (state.pendingMessages || 0), state.primaryLastRun ? t('上次完成：', 'Last synced: ') + new Date(state.primaryLastRun).toLocaleString(en() ? 'en-SG' : 'zh-CN') : ''].filter(Boolean).join(' · ');
    el('capacity').textContent = state.eligible ? size(state.usedBytes) + ' / ' + size(state.quotaBytes) : t('需要 Business 或 Enterprise 配套', 'Requires Business or Enterprise');
    el('meter').value = state.usedBytes || 0; el('meter').max = state.quotaBytes || 1;
    el('service').textContent = !state.configured ? t('云储存尚未连接，请联系管理员。', 'Cloud storage is not connected. Contact your administrator.') : state.trial ? t('R2 试用总量保护已开启；达到保护上限时暂停上传，待传资料会保留。', 'Shared R2 trial protection is enabled. Uploads pause at the limit and pending data is retained.') : t('云储存已连接', 'Cloud storage connected');
    el('automatic').checked = state.automatic !== false; el('automatic').disabled = !state.eligible || busy;
    el('upload').disabled = busy || sync.running || !state.configured || !state.eligible;
    el('status').textContent = sync.error || state.businessError || (sync.running ? t('正在同步资料…', 'Syncing workspace…') : sync.lastRun ? t('已同步 · ', 'Synced · ') + new Date(sync.lastRun).toLocaleString(en() ? 'en-SG' : 'zh-CN') : t('等待首次同步', 'Waiting for first sync'));
  }
  async function refresh() { state = await call('state'); draw(); }
  async function run(fn) { if (busy) return; busy = true; draw(); let error; try { await fn(); await refresh(); } catch (e) { error = e.message; } finally { busy = false; draw(); if (error) el('status').textContent = error; } }
  el('upload').onclick = () => run(() => call('business-sync')); el('refresh').onclick = () => run(refresh);
  el('view').onclick = () => run(async () => { const r = await window.api.cloudArchive('open'); if (!r.ok) throw Error(r.error); return window.backupViewer.open(false, r); });
  el('sync').onclick = () => run(() => call('sync')); el('capture').onchange = () => run(() => call('archive-configure', { enabled: el('capture').checked }));
  el('scan').onclick = () => run(async () => { await window.backupController.run(true); const error = window.backupController.getState().error; if (error) throw Error(error); });
  el('scan-stop').onclick = () => document.getElementById('backup-stop').click();
  el('automatic').onchange = () => run(() => call('configure', { automatic: el('automatic').checked }));
  el('cleanup').onclick = () => run(() => call('cleanup'));
  document.querySelector('[data-settings-tab="cloud"]').addEventListener('click', () => { draw(); run(refresh); });
  const changed = () => { clearTimeout(nextRefresh); nextRefresh = setTimeout(() => { if (!document.getElementById('settings-cloud').hidden) refresh().catch(e => { el('status').textContent = e.message; }); }, 300); };
  window.api.onCloudChanged?.(changed); window.api.onBusinessChanged?.(changed); window.api.onBackupChanged?.(changed);
  const refreshTimer = setInterval(changed, 15000); window.addEventListener('beforeunload', () => clearInterval(refreshTimer));
  window.addEventListener('blackcat:preferences', draw); draw();
})();
