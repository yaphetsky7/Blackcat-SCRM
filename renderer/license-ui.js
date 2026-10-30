// Plan limits in the UI and the Settings → Account tab (plan, expiry, AI points, logout).
(() => {
  const $ = (id) => document.getElementById(id);
  const t = (s) => window.I18N?.t(s) || s;
  const en = () => window.I18N?.locale === 'en';
  const FEATURES = [['translate', 'AI 翻译', 'AI translation'], ['realtime', '实时翻译预览', 'Live translation preview'], ['quick', '快捷回复', 'Quick replies'], ['contacts', '联系人', 'Contacts'], ['notes', '备注', 'Notes'],
    ['bulk', '群发', 'Bulk messages'], ['backup', '本地备份', 'Local backup'], ['assistant', '黑猫助手', 'Black Cat assistant'], ['aiReply', 'AI 自动回复 + 知识库', 'AI auto-reply + knowledge base']];
  const fmt = (n) => (n < 0 ? (en() ? 'Unlimited' : '不限') : Math.max(0, Math.floor(n)).toLocaleString());
  const date = (ts) => new Date(ts).toLocaleDateString();

  // Features outside the plan disappear (a class, so the app's own show/hide logic can't bring them back)
  function applyLimits(profile) {
    window.blackcatLicense = profile;
    const f = profile?.limits?.features || {};
    const off = (el, hidden) => el?.classList.toggle('plan-off', !!hidden);
    off($('assistant-launcher'), !f.assistant);
    if (!f.assistant && $('assistant-panel')) $('assistant-panel').hidden = true;
    off($('ai-tool-btn'), !f.aiReply);
    off($('bulk-tool-label')?.closest('.tool-btn'), !f.bulk);
    off(document.querySelector('[data-settings-tab="backup"]'), !f.backup);
    const realtime = $('tr-realtime');
    if (realtime) { realtime.disabled = !f.realtime; realtime.closest('label, .tr-row, div')?.setAttribute('title', f.realtime ? '' : t('当前配套不包含实时翻译预览')); }
  }

  let drawSeq = 0;
  async function drawAccount(state) {
    const box = $('settings-license');
    if (!box) return;
    const seq = ++drawSeq;
    const p = state?.profile;
    const settings = p ? await window.api.getSettings().catch(() => ({})) : {};
    if (seq !== drawSeq) return; // a newer refresh is drawing
    box.replaceChildren();
    if (!p) return;
    const row = (label, value) => { const r = document.createElement('div'); r.className = 'app-setting-row'; const a = document.createElement('span'); a.textContent = label; const b = document.createElement('strong'); b.textContent = value; r.append(a, b); return r; };
    const used = (window.blackcatAccountsCount?.() ?? 0);
    const h = document.createElement('h3'); h.textContent = en() ? 'Account' : '账户';
    box.append(h,
      row(en() ? 'Username' : '用户名', p.username),
      row(en() ? 'Plan' : '配套', p.planName),
      row(en() ? 'Expires' : '到期日', p.unlimited ? (en() ? 'Never' : '永久') : date(p.expiresAt)),
      row(en() ? 'AI points left' : '剩余 AI 点数', p.unlimited ? (en() ? 'Unlimited' : '不限') : fmt(p.points.total)));
    if (!p.unlimited) box.append(
      row(en() ? 'Plan points this month' : '本月配套点数', `${fmt(p.points.plan)} / ${fmt(p.points.monthly)}`),
      row(en() ? 'Top-up points' : '充值点数', fmt(p.points.bonus)),
      row(en() ? 'Next monthly refill' : '下次重置', date(p.points.resetAt)));
    box.append(
      row(en() ? 'Chat accounts' : '聊天账号', `${used} / ${fmt(p.limits.accounts)}`),
      row(en() ? 'Computers' : '同时登录电脑', fmt(p.limits.devices)));
    const feats = document.createElement('p'); feats.className = 'hub-muted';
    feats.textContent = (en() ? 'Included: ' : '包含功能：') + FEATURES.filter(([k]) => p.limits.features[k]).map(([, zh, e]) => (en() ? e : zh)).join(en() ? ', ' : '、');
    const mode = document.createElement('p'); mode.className = 'hub-muted';
    mode.textContent = settings.usesOwnKey
      ? (en() ? 'You saved your own Claude key, so AI uses it and does not spend BlackCat points.' : '已填写自己的 Claude Key：AI 使用你的 Key，不扣黑猫点数。')
      : (en() ? 'AI translation and replies use your BlackCat points. To use your own Claude key instead, add it in the API Key tab.' : 'AI 翻译和回复使用黑猫点数。如要改用自己的 Claude Key，请在「API Key」中填写。');
    if (state.offline) mode.textContent += en() ? ' (Offline — showing the last known balance.)' : '（暂时连不上服务器，显示的是上次的余额。）';
    const actions = document.createElement('div'); actions.className = 'license-actions';
    const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'ghost-btn small'; refresh.textContent = en() ? 'Refresh' : '刷新';
    refresh.addEventListener('click', async () => { refresh.disabled = true; const s = await window.api.licenseRefresh(); refresh.disabled = false; render(s); });
    const out = document.createElement('button'); out.type = 'button'; out.className = 'link-btn danger-text'; out.textContent = en() ? 'Sign out' : '退出登录';
    out.addEventListener('click', async () => { if (confirm(en() ? 'Sign out of BlackCat SCRM on this computer?' : '确定在这台电脑退出黑猫SCRM？')) await window.api.licenseLogout(); });
    actions.append(refresh, out);
    box.append(feats, mode, actions);
  }

  function render(state) { applyLimits(state?.profile || null); drawAccount(state); }
  window.api.licenseState().then(render);
  window.api.onLicenseChanged?.(render);
  window.addEventListener('blackcat:claude-mode', () => window.api.licenseState().then(render));
  // Redraw when Settings opens so the account count and balance are current
  $('app-settings-btn')?.addEventListener('click', () => window.api.licenseState().then(render));
})();
