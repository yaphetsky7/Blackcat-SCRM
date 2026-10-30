// Builds assets/黑猫SCRM使用教程.pdf from guide-figures.js and assets/guide/*.jpg.
// Run: npx electron scripts/build-guide.js
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const guide = require(path.join(root, 'guide-figures.js'));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const img = (name) => pathToFileURL(path.join(root, 'assets', 'guide', name + '.jpg')).href;

// Narrow crops (panels) sit beside their steps, medium crops stay near natural size, full screenshots span the page.
function layout(name) {
  const { width, height } = nativeImage.createFromPath(path.join(root, 'assets', 'guide', name + '.jpg')).getSize();
  return width / height < 1.3 ? 'side' : width < 1000 ? 'mid' : 'wide';
}

function html() {
  const toc = guide.chapters.map((c, i) => `<li><span class="n">${i + 1}</span><span>${esc(c.zh)}<em>${esc(c.en)}</em></span></li>`).join('');
  const chapters = guide.chapters.map((c, i) => `
    <section class="chapter">
      <header class="ch-head"><span class="ch-no">${String(i + 1).padStart(2, '0')}</span><div><h2>${esc(c.zh)}</h2><h3>${esc(c.en)}</h3></div></header>
      <p class="intro">${esc(c.introZh)}<br><span class="en">${esc(c.introEn)}</span></p>
      ${c.figures.map((f) => `
        <figure class="${layout(f.img)}">
          <figcaption>${esc(f.zh)} <span class="en">/ ${esc(f.en)}</span></figcaption>
          <div class="body"><img src="${img(f.img)}">
          <ol>${f.steps.map(([zh, en], k) => `<li><span class="badge">${k + 1}</span><div>${esc(zh)}<br><span class="en">${esc(en)}</span></div></li>`).join('')}</ol></div>
        </figure>`).join('')}
      <aside class="tip"><b>提示 Tip</b> ${esc(c.tipZh)}<br><span class="en">${esc(c.tipEn)}</span></aside>
    </section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; }
    * { box-sizing: border-box; }
    body { font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif; color: #1f2329; font-size: 10.5pt; line-height: 1.5; margin: 0; }
    .en { color: #646a73; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; }
    .cover { height: 268mm; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; padding: 0 8mm; break-after: page; }
    .cover img { width: 30mm; height: 30mm; border-radius: 7mm; }
    .cover h1 { font-size: 30pt; margin: 9mm 0 1mm; letter-spacing: .5pt; }
    .cover .sub { font-size: 15pt; color: #3370ff; margin: 0; }
    .cover .ver { margin-top: 10mm; color: #646a73; font-size: 10pt; }
    .toc { break-after: page; }
    .toc h2 { font-size: 18pt; margin: 0 0 6mm; }
    .toc ol { list-style: none; padding: 0; margin: 0; }
    .toc li { display: flex; gap: 4mm; align-items: center; padding: 3.2mm 0; border-bottom: 1px solid #e8eaed; font-size: 12pt; }
    .toc li em { display: block; font-style: normal; color: #646a73; font-size: 10pt; }
    .toc .n, .ch-no { background: #3370ff; color: #fff; border-radius: 2mm; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
    .toc .n { width: 8mm; height: 8mm; font-size: 11pt; flex: none; }
    .chapter { break-before: page; }
    .ch-head { display: flex; align-items: center; gap: 4mm; margin-bottom: 3mm; }
    .ch-no { width: 13mm; height: 13mm; font-size: 16pt; }
    .ch-head h2 { margin: 0; font-size: 18pt; }
    .ch-head h3 { margin: 0; font-size: 11.5pt; font-weight: 500; color: #646a73; }
    .intro { margin: 0 0 4mm; padding: 3mm 4mm; background: #f2f5ff; border-radius: 2mm; }
    figure { margin: 0 0 6mm; break-inside: avoid; }
    figcaption { font-weight: 700; font-size: 12pt; margin-bottom: 2mm; }
    figure img { border: 1px solid #dee0e3; border-radius: 1.5mm; display: block; }
    figure ol { list-style: none; padding: 0; margin: 0; }
    .wide img { width: 100%; }
    .mid img { width: 128mm; }
    .wide ol, .mid ol { margin-top: 3mm; columns: 2; column-gap: 6mm; }
    .side .body { display: flex; gap: 6mm; align-items: flex-start; }
    .side img { width: 88mm; max-height: 205mm; object-fit: contain; object-position: top left; flex: none; }
    .side ol { flex: 1; padding-top: 1mm; }
    figure li { display: flex; gap: 2.5mm; margin-bottom: 2.2mm; break-inside: avoid; font-size: 9.8pt; line-height: 1.45; }
    figure li .en { font-size: 9pt; }
    .badge { flex: none; width: 5.4mm; height: 5.4mm; border-radius: 50%; background: #e5484d; color: #fff; font: 700 8.5pt/5.4mm "Segoe UI", sans-serif; text-align: center; margin-top: .4mm; }
    .tip { break-inside: avoid; border-left: 1.2mm solid #f5a623; background: #fff8eb; padding: 3mm 4mm; border-radius: 1mm; font-size: 9.8pt; }
  </style></head><body>
    <div class="cover">
      <img src="${pathToFileURL(path.join(root, 'assets', 'blackcat.png')).href}">
      <h1>黑猫SCRM 图文使用教程</h1>
      <p class="sub">BlackCat SCRM Illustrated User Guide</p>
      <p class="ver">版本 Version ${esc(guide.version)} · 中文 / English<br>截图使用示例账号，二维码已模糊处理。<br><span class="en">Screenshots use demo accounts; QR codes are blurred.</span></p>
    </div>
    <div class="toc"><h2>目录 <span class="en" style="font-size:12pt">Contents</span></h2><ol>${toc}</ol></div>
    ${chapters}
  </body></html>`;
}

app.whenReady().then(async () => {
  const tmp = path.join(app.getPath('temp'), 'blackcat-guide.html');
  fs.writeFileSync(tmp, html());
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadFile(tmp);
  const pdf = await win.webContents.printToPDF({
    pageSize: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#8f959e;text-align:center;font-family:Segoe UI">黑猫SCRM · BlackCat SCRM — <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margins: { top: 0.5, bottom: 0.6, left: 0.55, right: 0.55 },
  });
  const out = process.argv.find((a) => a.endsWith('.pdf')) || path.join(root, 'assets', '黑猫SCRM使用教程.pdf');
  fs.writeFileSync(out, pdf);
  console.log('wrote', out, (pdf.length / 1024 / 1024).toFixed(1) + ' MB');
  app.quit();
});
