// Software updates: Settings → General row, a "restart to update" bar, and a blocking screen for forced updates.
(() => {
  const $ = (id) => document.getElementById(id);
  const en = () => window.I18N?.locale === 'en';
  const L = (zh, e) => (en() ? e : zh);
  let state = { status: 'idle' }, dismissed = '';

  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function statusText(s) {
    switch (s.status) {
      case 'checking': return L('正在检查更新…', 'Checking for updates…');
      case 'latest': return L('已是最新版本', 'You have the latest version');
      case 'downloading': return L(`正在下载 v${s.version}… ${s.percent || 0}%`, `Downloading v${s.version}… ${s.percent || 0}%`);
      case 'ready': return L(`v${s.version} 已下载好，重启后完成更新`, `v${s.version} is ready — restart to finish updating`);
      case 'error': return s.error || L('检查更新失败', 'Update check failed');
      default: return '';
    }
  }
  async function install() {
    if (window.backupController?.getState?.().running && !confirm(L('备份正在进行。现在重启会中断这次备份（下次会接着备份）。确定现在更新？', 'A backup is running. Restarting now interrupts it (it continues next time). Update now?'))) return;
    try { await window.api.updateInstall(); } catch (e) { alert(e.message); }
  }
  const installButton = (label) => { const b = el('button', 'primary-btn small', label || L('重启并更新', 'Restart and update')); b.type = 'button'; b.addEventListener('click', install); return b; };

  // Settings → General
  function drawRow() {
    const box = $('settings-general'); if (!box) return;
    let row = $('update-row');
    if (!row) { row = el('div', 'app-setting-row update-row'); row.id = 'update-row'; box.append(row); }
    const info = el('div', 'update-info');
    info.append(el('span', '', L('软件更新', 'Software update')), el('small', 'hub-muted', `${L('当前版本', 'Current version')} v${state.current || ''}${statusText(state) ? ' · ' + statusText(state) : ''}`));
    if (state.notes && (state.status === 'ready' || state.status === 'downloading')) info.append(el('small', 'hub-muted update-notes', state.notes));
    const act = el('div', 'update-actions');
    if (state.status === 'ready') act.append(installButton());
    else {
      const b = el('button', 'ghost-btn small', L('检查更新', 'Check for updates')); b.type = 'button';
      b.disabled = state.status === 'checking' || state.status === 'downloading';
      b.addEventListener('click', () => window.api.updateCheck().then(render));
      act.append(b);
    }
    row.replaceChildren(info, act);
  }

  // Bottom bar once an optional update is downloaded
  function drawBar() {
    let bar = $('update-bar');
    const show = state.status === 'ready' && !state.mandatory && dismissed !== state.version;
    if (!show) { bar?.remove(); return; }
    if (!bar) { bar = el('div', 'update-bar'); bar.id = 'update-bar'; bar.setAttribute('role', 'status'); document.body.append(bar); }
    const later = el('button', 'ghost-btn small', L('稍后', 'Later')); later.type = 'button';
    later.addEventListener('click', () => { dismissed = state.version; drawBar(); });
    bar.replaceChildren(el('span', '', L(`新版本 v${state.version} 已准备好`, `New version v${state.version} is ready`)), installButton(L('重启更新', 'Restart to update')), later);
  }

  // Forced update: covers the app until it is installed
  function drawForced() {
    let cover = $('update-forced');
    const show = state.mandatory && (state.status === 'downloading' || state.status === 'ready' || state.status === 'error');
    if (!show) { cover?.remove(); return; }
    if (!cover) { cover = el('div', 'update-forced'); cover.id = 'update-forced'; cover.setAttribute('role', 'alertdialog'); document.body.append(cover); }
    const card = el('div', 'update-forced-card');
    card.append(el('h2', '', L(`需要更新到 v${state.version}`, `Update to v${state.version} required`)),
      el('p', 'hub-muted', L('这个版本必须更新后才能继续使用。', 'This version must be updated before you can keep using the app.')));
    if (state.notes) card.append(el('p', 'update-notes', state.notes));
    if (state.status === 'ready') card.append(installButton(L('立即更新', 'Update now')));
    else if (state.status === 'error') { const retry = el('button', 'primary-btn small', L('重试', 'Retry')); retry.type = 'button'; retry.addEventListener('click', () => window.api.updateCheck().then(render)); card.append(el('p', 'danger-text', state.error), retry); }
    else { const bar = el('div', 'update-progress'); const fill = el('i'); fill.style.width = (state.percent || 0) + '%'; bar.append(fill); card.append(bar, el('p', 'hub-muted', statusText(state))); }
    cover.replaceChildren(card);
  }

  function render(s) { if (s) state = s; drawRow(); drawBar(); drawForced(); }
  window.api.updateState?.().then(render);
  window.api.onUpdateState?.(render);
  $('app-settings-btn')?.addEventListener('click', () => render()); // redraw in the current language
})();
