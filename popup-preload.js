// Bridge for renderer/popup.html (the message popup stack); it can only report clicks, closes, hover and its height.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('popup', {
  onCards: (callback) => ipcRenderer.on('popup:cards', (_event, cards) => callback(cards)),
  click: (id) => ipcRenderer.send('popup:click', id),
  close: (id) => ipcRenderer.send('popup:close', id),
  hold: (on) => ipcRenderer.send('popup:hold', on),
  size: (height) => ipcRenderer.send('popup:size', height),
});
