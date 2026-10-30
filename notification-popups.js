// 黑猫SCRM's own message popups: a small always-on-top stack at the bottom right of the screen, newest on top, at most 3.
// Windows queues its own toasts one after another, so the app draws these itself. They never take keyboard focus.
const path = require('path');

const WIDTH = 372, MARGIN = 12, MAX = 3, LIFE_MS = 7000;

function createPopups({ BrowserWindow, ipcMain, onClick }) {
  let win = null, loaded = null, cards = [], seq = 0, held = false;
  const timers = new Map();

  function open() {
    if (win && !win.isDestroyed()) return loaded;
    win = new BrowserWindow({ width: WIDTH, height: 120, show: false, frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, focusable: false, hasShadow: false, alwaysOnTop: true,
      webPreferences: { preload: path.join(__dirname, 'popup-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.setAlwaysOnTop(true, 'pop-up-menu');
    win.on('closed', () => { win = null; loaded = null; });
    loaded = win.loadFile(path.join(__dirname, 'renderer', 'popup.html'));
    return loaded;
  }
  const owner = (e) => win && !win.isDestroyed() && e.sender === win.webContents;
  function render() {
    if (!win || win.isDestroyed()) return;
    if (!cards.length) { win.hide(); return; }
    win.webContents.send('popup:cards', cards.map(({ timer, ...card }) => card));
  }
  function expire(id) { clearTimeout(timers.get(id)); timers.set(id, setTimeout(() => remove(id), LIFE_MS)); }
  function remove(id) { clearTimeout(timers.get(id)); timers.delete(id); cards = cards.filter((c) => c.id !== id); render(); }

  // The page reports its height after drawing; the window hugs the cards so the rest of the screen stays clickable
  ipcMain.on('popup:size', (e, height) => {
    if (!owner(e) || !cards.length) return;
    const area = require('electron').screen.getPrimaryDisplay().workArea, h = Math.max(40, Math.min(800, Math.round(Number(height) || 0)));
    win.setBounds({ x: area.x + area.width - WIDTH - MARGIN, y: area.y + area.height - h - MARGIN, width: WIDTH, height: h });
    if (!win.isVisible()) win.showInactive();
  });
  ipcMain.on('popup:click', (e, id) => { if (!owner(e)) return; const card = cards.find((c) => c.id === id); remove(id); if (card) onClick(card.accountId, card.chat); });
  ipcMain.on('popup:close', (e, id) => { if (owner(e)) remove(id); });
  // Pointer over the stack: keep every card until it leaves
  ipcMain.on('popup:hold', (e, on) => { if (!owner(e)) return; held = on === true; for (const c of cards) held ? clearTimeout(timers.get(c.id)) : expire(c.id); });

  async function show({ accountId, chat, title, body, source }) {
    const card = { id: ++seq, accountId, chat: String(chat || ''), title: String(title || '').slice(0, 120), body: String(body || '').slice(0, 300), source: String(source || ''), at: Date.now() };
    cards = [card, ...cards];
    for (const old of cards.slice(MAX)) remove(old.id);
    if (!held) expire(card.id);
    await open();
    render();
  }
  return { show, close: () => { for (const id of timers.keys()) clearTimeout(timers.get(id)); win?.destroy(); } };
}

module.exports = { createPopups };
