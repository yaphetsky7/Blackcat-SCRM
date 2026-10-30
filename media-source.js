const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { BrowserWindow, nativeImage, session } = require('electron');
const { IMAGE, VIDEO, transcribe } = require('./knowledge-sources');
let videoQueue = Promise.resolve();
async function videoFrames(file) {
  const run = async () => {
    const partition = 'knowledge-media-extractor';
    session.fromPartition(partition).setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    const win = new BrowserWindow({ show: false, webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    try {
      await win.loadFile(path.join(__dirname, 'renderer', 'media-extract.html'));
      return await win.webContents.executeJavaScript(`window.extractVideo(${JSON.stringify(pathToFileURL(file).href)})`);
    } finally { win.destroy(); }
  };
  const result = videoQueue.then(run, run); videoQueue = result.catch(() => {}); return result;
}
async function extractMedia(file, document, config) {
  if (IMAGE[document.kind]) {
    let image = nativeImage.createFromBuffer(fs.readFileSync(file));
    if (image.isEmpty()) throw Error('无法读取图片，请转换为 PNG / JPG 后重试');
    const size = image.getSize(); const scale = Math.min(1, 1800 / Math.max(size.width, size.height));
    if (scale < 1) image = image.resize({ width: Math.round(size.width * scale), height: Math.round(size.height * scale) });
    return [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.toJPEG(88).toString('base64') } }, { type: 'text', text: 'Read this image as reference material. For animated images only the first frame is supplied.' }];
  }
  const cacheFile = file + (document.visualOnly ? '.visual.json' : '.extracted.json');
  try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {}
  const content = [];
  if (!document.visualOnly) content.push({ type: 'text', text: `Audio transcript (speech recognition may contain errors; do not infer unclear details):\n${await transcribe(file, config)}` });
  if (VIDEO[document.kind]) {
    const result = await videoFrames(file);
    content.push({ type: 'text', text: `Video duration: ${result.duration.toFixed(1)} seconds. Only ${result.frames.length} sampled frames are provided. Do not claim these cover every scene or details outside them.${document.visualOnly ? ' The user selected visual-only learning; no audio was transcribed.' : ''}` });
    for (const frame of result.frames) content.push({ type: 'text', text: `Frame at ${frame.time.toFixed(1)}s` }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frame.data } });
  }
  if (!content.length) throw Error('没有可学习的媒体内容');
  fs.writeFileSync(cacheFile, JSON.stringify(content)); return content;
}
module.exports = { extractMedia, videoFrames };
