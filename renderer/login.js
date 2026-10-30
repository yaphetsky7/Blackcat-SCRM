// Login page shown before the main window; the main process loads index.html once the server accepts the login.
(async () => {
  const $ = (id) => document.getElementById(id);
  const settings = await window.api.getSettings().catch(() => ({}));
  const english = settings.uiLocale === 'en';
  if (english) { document.documentElement.lang = 'en'; document.querySelectorAll('[data-en]').forEach((el) => { el.textContent = el.dataset.en; }); }
  if (settings.uiTheme === 'dark' || (settings.uiTheme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.dataset.theme = 'dark';

  const state = await window.api.licenseState();
  $('server').value = state.server || '';
  $('server-box').open = !state.server;
  $('username').value = state.lastUser || '';
  if (state.reason) { $('reason').hidden = false; $('reason').textContent = state.reason; }
  ($('username').value ? $('password') : $('username')).focus();

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('error').textContent = '';
    $('submit').disabled = true;
    $('submit').textContent = english ? 'Signing in…' : '正在登录…';
    const r = await window.api.licenseLogin({ server: $('server').value, username: $('username').value, password: $('password').value });
    if (!r.ok) {
      $('error').textContent = r.error;
      $('submit').disabled = false;
      $('submit').textContent = english ? 'Sign in' : '登录';
      if (/服务器/.test(r.error)) $('server-box').open = true;
    }
  });
})();
