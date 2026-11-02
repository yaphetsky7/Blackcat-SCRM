// Login page shown before the main window; the main process loads index.html once the server accepts the login.
// The server address is built into the app and never shown here.
(async () => {
  const $ = (id) => document.getElementById(id);
  const settings = await window.api.getSettings().catch(() => ({}));
  const english = settings.uiLocale === 'en';
  if (english) {
    document.documentElement.lang = 'en';
    document.querySelectorAll('[data-en]').forEach((el) => { el.textContent = el.dataset.en; });
    document.querySelectorAll('[data-en-label]').forEach((el) => el.setAttribute('aria-label', el.dataset.enLabel));
  }
  if (settings.uiTheme === 'dark' || (settings.uiTheme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.dataset.theme = 'dark';
  const say = (zh, en) => (english ? en : zh);

  const state = await window.api.licenseState();
  $('username').value = state.lastUser || '';
  if (state.reason) { $('reason').hidden = false; $('reason').textContent = state.reason; }
  ($('username').value ? $('password') : $('username')).focus();

  // Show / hide the password
  $('toggle-password').addEventListener('click', () => {
    const show = $('password').type === 'password';
    $('password').type = show ? 'text' : 'password';
    $('toggle-password').classList.toggle('on', show);
    $('toggle-password').setAttribute('aria-label', show ? say('隐藏密码', 'Hide password') : say('显示密码', 'Show password'));
    $('password').focus();
  });
  // Caps Lock warning while typing the password
  const caps = (e) => { if (e.getModifierState) $('caps').hidden = !e.getModifierState('CapsLock'); };
  $('password').addEventListener('keydown', caps);
  $('password').addEventListener('keyup', caps);
  $('password').addEventListener('blur', () => { $('caps').hidden = true; });

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('username').value.trim(), password = $('password').value;
    if (!username || !password) { $('error').textContent = say('请填写用户名和密码', 'Enter your username and password'); (username ? $('password') : $('username')).focus(); return; }
    $('error').textContent = '';
    $('submit').disabled = true; $('submit').classList.add('busy');
    $('submit').textContent = say('正在登录…', 'Signing in…');
    const r = await window.api.licenseLogin({ username, password });
    if (!r.ok) {
      $('error').textContent = r.error;
      $('submit').disabled = false; $('submit').classList.remove('busy');
      $('submit').textContent = say('登录', 'Sign in');
      $('password').select();
    }
  });
})();
