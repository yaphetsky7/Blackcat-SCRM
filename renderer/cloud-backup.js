(() => {
  window.I18N?.extend?.({ '云备份': 'Cloud backup' });
  const en = () => window.I18N?.locale === 'en', text = (zh, eng) => en() ? eng : zh;
  const el = id => document.getElementById('cloud-' + id);
  const size = n => n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : (n / 1e6).toFixed(1) + ' MB';
  let state = null, busy = false, nextRefresh = null, nextBackupRefresh = null;
  async function call(action, payload) { const r = await window.api.cloud(action, payload); if (!r.ok) throw Error(r.error); return r.data; }
  function status(value) { el('status').textContent = value || ''; }
  const button = (label, fn, destructive = false) => { const b = document.createElement('button'); b.type = 'button'; b.className = destructive ? 'link-btn danger' : 'ghost-btn small'; b.textContent = label; b.disabled = !!state?.running; b.onclick = () => run(fn); return b; };
  function draw() {
    el('title').textContent = text('云备份', 'Cloud backup');
    el('intro').textContent = text('Business 100 GB · Enterprise 500 GB。聊天记录保存到云端；备注、知识库、联系人和群发资料可备份恢复。', 'Business 100 GB · Enterprise 500 GB. Chat history lives in the cloud; notes, knowledge bases, contacts and bulk messaging data can be backed up and restored.');
    el('primary-title').textContent = text('云端聊天记录', 'Cloud chat history');
    el('primary-description').textContent = text('无需选择本地备份文件夹。新电脑登录同一个黑猫账号即可在这里查看对话，照片及影片按需读取。本机只保留待上传缓冲，云端确认接收后清理。', 'No local backup folder is required. Sign into the same BlackCat account on a new computer to browse chats here. Photos and videos load on demand. Local pending-upload buffers are cleared after cloud confirmation.');
    el('capture-label').textContent = text('自动保存软件可读取的聊天', 'Automatically save chats the app can read');
    el('view').textContent = text('查看云端聊天记录', 'View cloud chats'); el('sync').textContent = text('立即同步聊天', 'Sync chats now');
    el('scan').textContent = text('扫描可读取历史', 'Scan readable history');
    el('scan-stop').textContent = text('停止扫描', 'Stop scan');
    el('business-title').textContent = text('其他资料备份与恢复', 'Business data backup and restore');
    el('automatic-label').textContent = text('每小时自动上传（软件运行时）', 'Upload every hour while the app is running');
    el('upload').textContent = text('立即云备份', 'Back up now'); el('refresh').textContent = text('刷新', 'Refresh'); el('stop').textContent = text('停止', 'Stop');
    el('cleanup').textContent = text('释放未引用的旧文件', 'Clean up unreferenced files'); el('open').textContent = text('打开已下载文件夹', 'Open downloaded folder'); el('restart').textContent = text('保存工作后重开软件以导入', 'Save your work and restart to import');
    el('note').textContent = text('聊天记录直接在上方查看，无需下载整份备份。下方恢复点用于备注、知识库、联系人、群发文案和名单；导入后重开软件。平台账号需要重新登录，AI 回复需手动开启，群发任务不会恢复执行。未加载的历史和未下载到的原附件需补存。', 'Browse cloud chats above without downloading a full backup. Recovery points below restore notes, knowledge, contacts, bulk templates and lists after a restart. Sign into messaging platforms again and enable AI replies manually. Bulk jobs never resume automatically. Unloaded history and unavailable original media still need collection.');
    if (!state) return;
    el('capture').checked = !!state.captureEnabled; el('capture').disabled = busy || !state.eligible;
    el('view').disabled = busy || !state.configured; el('sync').disabled = busy || state.running || !state.configured || !state.eligible;
    el('scan').disabled = busy || state.running || state.scanRunning || !state.eligible; el('scan-stop').hidden = !state.scanRunning;
    el('primary-status').textContent = [state.scanProgress, state.primaryError || state.legacyMigrationError, text('待同步/补存：', 'Pending sync/media: ') + (state.pendingMessages || 0), state.primaryLastRun ? text('上次同步：', 'Last synced: ') + new Date(state.primaryLastRun).toLocaleString(en() ? 'en-SG' : 'zh-CN') : ''].filter(Boolean).join(' · ');
    el('restore-report').textContent = state.pendingRestore ? text('已下载，等待导入：请先保存工作，再点击重开软件以导入。', 'Download complete; import is pending. Save your work and restart to import.') : state.lastRestore ? text('上次恢复的联系人：', 'Contacts in the last import: ') + Object.entries(state.lastRestore.contacts || {}).map(([p,n]) => p + ' ' + n).join(' · ') : '';
    el('capacity').textContent = state.eligible ? size(state.usedBytes) + ' / ' + size(state.quotaBytes) : text('当前配套不包含云备份', 'Cloud backup requires Business or Enterprise');
    el('meter').value = state.usedBytes || 0; el('meter').max = state.quotaBytes || 1;
    el('service').textContent = !state.configured ? text('云储存尚未接通，管理员需完成 R2 配置。', 'Cloud storage is not connected. The administrator needs to configure R2.') : state.trial ? text('试用保护已开启：所有客户共享试用总量限制，达到限制会暂停上传并保留本机资料。', 'Trial protection is enabled. Uploads pause at the shared trial limit; local data is retained.') : text('云储存已连接', 'Cloud storage connected');
    el('automatic').checked = !!state.automatic; el('automatic').disabled = !state.eligible || busy;
    el('upload').disabled = busy || state.running || !state.configured || !state.eligible; el('stop').hidden = !state.running;
    el('open').hidden = !state.lastDownload?.folder; el('restart').hidden = !state.pendingRestore;
    status(state.progress || state.lastError || (state.lastRun ? text('上次完成：', 'Last completed: ') + new Date(state.lastRun).toLocaleString(en() ? 'en-SG' : 'zh-CN') : ''));
    el('snapshots').replaceChildren();
    if (state.lastDownload?.folder && state.lastDownload.hasArchive !== false) el('snapshots').append(button(text('查看已下载的备份对话', 'View downloaded conversations'), async () => { const result = await window.api.cloudReaderOpen(); if (!result.ok) throw Error(result.error); return window.backupViewer.open(false, result); }));
    if (state.lastDownload?.folder && !state.pendingRestore) el('snapshots').append(button(text('重新导入已下载资料', 'Re-import downloaded data'), () => call('reimport')));
    if (!state.snapshots.length) { const empty = document.createElement('p'); empty.textContent = text('还没有其他资料的恢复点。', 'No business-data recovery points yet.'); el('snapshots').append(empty); }
    for (const s of state.snapshots) {
      const row = document.createElement('article'); row.className = 'cloud-snapshot';
      const info = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('small');
      title.textContent = s.label; detail.textContent = new Date(s.created).toLocaleString(en() ? 'en-SG' : 'zh-CN') + ' · ' + size(s.bytes); info.append(title, detail);
      const actions = document.createElement('div'); actions.className = 'backup-actions';
      actions.append(button(text('下载', 'Download'), () => call('download', { id: s.id, viewOnly: true })), button(text('下载并导入', 'Download and import'), async () => {
        if (!confirm(text('下载完成后需要重开软件，才会导入备注、知识库、联系人等资料。现有本机内容保留；平台登录和 API 密钥不会备份。继续？', 'Import takes effect after a restart. Existing local data is preserved. Platform logins and API credentials are excluded. Continue?'))) return;
        return call('download', { id: s.id });
      }), button(text('删除恢复点', 'Delete recovery point'), async () => { if (confirm(text('删除这个云端恢复点？本机资料不会删除。未引用文件一天后可清理。', 'Delete this cloud recovery point? Local data is retained. Unreferenced files can be cleaned after one day.'))) await call('delete', { id: s.id }); }, true));
      row.append(info, actions); el('snapshots').append(row);
    }
  }
  async function refresh() { state = await call('state'); draw(); }
  async function run(fn) { if (busy) return; busy = true; let error = ''; try { await fn(); await refresh(); } catch (e) { error = e.message; } finally { busy = false; draw(); if (error) status(error); } }
  el('upload').onclick = () => run(() => call('upload')); el('refresh').onclick = () => run(refresh); el('stop').onclick = () => run(() => call('stop'));
  el('view').onclick = () => run(async () => { const r = await window.api.cloudArchive('open'); if (!r.ok) throw Error(r.error); return window.backupViewer.open(false, r); });
  el('sync').onclick = () => run(() => call('sync')); el('capture').onchange = () => run(() => call('archive-configure', { enabled: el('capture').checked }));
  el('scan').onclick = () => run(async () => { await window.backupController.run(true); const error = window.backupController.getState().error; if (error) throw Error(error); });
  el('scan-stop').onclick = () => document.getElementById('backup-stop').click();
  el('automatic').onchange = () => run(() => call('configure', { automatic: el('automatic').checked }));
  el('cleanup').onclick = () => run(() => call('cleanup')); el('open').onclick = () => run(() => call('open'));
  el('restart').onclick = () => { if (confirm(text('请先保存草稿和设置。现在重开黑猫并导入资料？', 'Save drafts and settings first. Restart and import now?'))) run(() => call('restart')); };
  document.querySelector('[data-settings-tab="cloud"]').addEventListener('click', () => { draw(); run(refresh); });
  window.api.onCloudChanged?.(data => { if (state) { state.running = data.running; state.progress = data.progress; draw(); } clearTimeout(nextRefresh); if (!data.running) nextRefresh = setTimeout(() => refresh().catch(e => status(e.message)), 300); });
  window.api.onBackupChanged?.(() => { if (!state || document.getElementById('settings-cloud').hidden) return; clearTimeout(nextBackupRefresh); nextBackupRefresh = setTimeout(() => refresh().catch(e => status(e.message)), 200); });
  window.addEventListener('blackcat:preferences', draw); draw();
})();
