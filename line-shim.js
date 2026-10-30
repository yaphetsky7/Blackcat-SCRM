// 注入到 LINE 扩展页面最前面：补上 Electron 没有实现的 chrome.* 接口，
// 并把未读数（原本显示在扩展图标上）写进页面标题，供外层读取。
(() => {
  const c = globalThis.chrome || (globalThis.chrome = {});
  const event = () => {
    const fns = new Set();
    return { addListener: (f) => fns.add(f), removeListener: (f) => fns.delete(f), hasListener: (f) => fns.has(f), fire: (...a) => fns.forEach((f) => f(...a)) };
  };
  // 同时支持回调和 Promise 两种调用方式
  const reply = (value) => (...args) => {
    const cb = args.find((a) => typeof a === 'function');
    if (cb) setTimeout(() => cb(value));
    return Promise.resolve(value);
  };

  let badge = '';
  const setTitle = () => {
    const t = badge ? `(${badge}) LINE` : 'LINE';
    if (document.title !== t) document.title = t;
  };
  new MutationObserver(setTitle).observe(document.documentElement, { subtree: true, childList: true, characterData: true });

  c.action = {
    setBadgeText: ({ text }) => { badge = text || ''; setTitle(); return Promise.resolve(); },
    setBadgeBackgroundColor: reply(),
    setIcon: reply(),
    onClicked: event(),
  };

  const win = { id: 1, focused: true, type: 'normal' };
  c.windows = {
    getCurrent: reply(win),
    getAll: reply([win]),
    update: reply(win),
    create: reply(win),
    onRemoved: event(),
  };

  // Electron 自带的 getZoom 会因为“不是标签页”抛 No such tab，必须覆盖
  c.tabs = c.tabs || {};
  c.tabs.getZoom = reply(1);

  if (!c.cookies) c.cookies = { get: reply(null), getAll: reply([]), remove: reply(null), set: reply(null) };

  c.extension = c.extension || {};
  if (!c.extension.getViews) c.extension.getViews = () => [window];

  if (!c.notifications) {
    const shown = new Map();
    const onClicked = event();
    const onClosed = event();
    c.notifications = {
      create(id, opts, cb) {
        if (typeof id === 'object') { cb = opts; opts = id; id = String(Date.now()); }
        const n = new Notification(opts.title || 'LINE', { body: opts.message, icon: opts.iconUrl, silent: !!opts.silent });
        n.onclick = () => onClicked.fire(id);
        n.onclose = () => { shown.delete(id); onClosed.fire(id, false); };
        shown.set(id, n);
        if (cb) setTimeout(() => cb(id));
        return Promise.resolve(id);
      },
      clear(id, cb) {
        shown.get(id)?.close();
        shown.delete(id);
        if (cb) setTimeout(() => cb(true));
        return Promise.resolve(true);
      },
      getPermissionLevel: reply('granted'),
      onClicked,
      onClosed,
      onButtonClicked: event(),
    };
  }
})();
