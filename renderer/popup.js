// Draws the message popup stack (newest first) and tells the main process its height, clicks and hover.
const stack = document.getElementById('stack');

function card(item) {
  const el = document.createElement('div'); el.className = 'card';
  const icon = document.createElement('img'); icon.src = '../assets/blackcat.png'; icon.alt = '';
  const text = document.createElement('div');
  for (const [cls, value] of [['source', item.source], ['title', item.title], ['body', item.body]]) {
    if (!value) continue;
    const line = document.createElement('div'); line.className = cls; line.textContent = value; text.append(line);
  }
  const close = document.createElement('button'); close.className = 'close'; close.textContent = '×'; close.title = '关闭';
  close.addEventListener('click', (event) => { event.stopPropagation(); window.popup.close(item.id); });
  el.addEventListener('click', () => window.popup.click(item.id));
  el.append(icon, text, close);
  return el;
}

window.popup.onCards((cards) => {
  stack.replaceChildren(...cards.map(card));
  // Measure right away: a hidden window gets no animation frames, so waiting for one would keep it hidden
  window.popup.size(stack.getBoundingClientRect().height);
});
document.addEventListener('mouseenter', () => window.popup.hold(true));
document.addEventListener('mouseleave', () => window.popup.hold(false));
