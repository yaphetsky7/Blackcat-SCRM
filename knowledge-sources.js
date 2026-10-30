const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const MAX_BYTES = 25 * 1024 * 1024;
const IMAGE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
const AUDIO = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac', mpga: 'audio/mpeg', mpeg: 'audio/mpeg' };
const VIDEO = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
const SUPPORTED = ['pdf', 'xlsx', 'xlsm', 'csv', 'txt', 'md', 'json', 'html', 'htm', 'docx', 'srt', 'vtt', ...Object.keys(IMAGE), ...Object.keys(AUDIO), ...Object.keys(VIDEO)];
function urlOf(value) {
  const url = new URL(String(value).trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('请输入 HTTP / HTTPS 地址；认证请填在访问令牌或请求头中');
  if (['169.254.169.254', 'metadata.google.internal'].includes(url.hostname)) throw Error('不支持这个服务地址');
  return url;
}
function entities(text) {
  return text.replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => { const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; }).replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, key) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[key]));
}
function htmlText(html) {
  return entities(String(html).replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<\/(p|div|h[1-6]|tr|li|section|article)>/gi, '\n').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/?t[dh]\b[^>]*>/gi, '\t').replace(/<[^>]*>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function sheetURL(value) {
  const url = urlOf(value);
  if (url.hostname !== 'docs.google.com' || !url.pathname.startsWith('/spreadsheets/d/')) throw Error('请输入 Google Sheet 的分享或发布链接');
  if (url.pathname.includes('/d/e/')) { const result = new URL(url.origin + url.pathname.replace(/\/pubhtml$/, '/pub')); result.searchParams.set('output', 'csv'); return result.href; }
  const id = url.pathname.match(/\/d\/([\w-]+)/)?.[1]; if (!id) throw Error('无法识别 Google Sheet 链接');
  const result = new URL(`https://docs.google.com/spreadsheets/d/${id}/export`); result.searchParams.set('format', 'csv');
  const gid = new URLSearchParams(url.hash.slice(1)).get('gid') || url.searchParams.get('gid'); if (gid && /^\d+$/.test(gid)) result.searchParams.set('gid', gid);
  return result.href;
}
function publicURL(value) { const url = urlOf(value); return url.origin + url.pathname; }
async function fetchBytes(address, { headers = {}, fetchImpl = fetch, limit = MAX_BYTES, timeout = 45000, method = 'GET', body } = {}) {
  let url = urlOf(address); let safeHeaders = { ...headers }; const signal = AbortSignal.timeout(timeout);
  for (let redirects = 0; redirects < 6; redirects++) {
    const response = await fetchImpl(url.href, { method, body, headers: safeHeaders, redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location'); if (!location) throw Error('服务返回了无效的跳转');
      const next = urlOf(new URL(location, url).href);
      if (method !== 'GET') throw Error('转写接口发生跳转，请填写最终接口地址');
      if (url.protocol === 'https:' && next.protocol !== 'https:') throw Error('服务跳转到了不安全的地址');
      if (next.origin !== url.origin) safeHeaders = {};
      await response.body?.cancel(); url = next; continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw Error(`资料服务返回 HTTP ${response.status}，请检查地址、权限或访问令牌`); }
    if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw Error('资料超过大小限制，请拆分后导入'); }
    const chunks = []; let length = 0;
    for await (const chunk of response.body || []) { length += chunk.length; if (length > limit) { throw Error('资料超过大小限制，请拆分后导入'); } chunks.push(Buffer.from(chunk)); }
    return { bytes: Buffer.concat(chunks), type: response.headers.get('content-type') || '', url: url.href };
  }
  throw Error('链接跳转次数过多');
}
async function readRemote(connection, type, fetchImpl) {
  const url = type === 'sheet' ? sheetURL(connection.url) : urlOf(connection.url).href;
  const headers = { Accept: type === 'api' ? 'application/json, text/plain' : '*/*', ...connection.headers };
  const response = await fetchBytes(url, { headers, fetchImpl });
  const pathname = new URL(response.url).pathname; let kind = path.extname(pathname).slice(1).toLowerCase();
  if (type === 'sheet') kind = 'csv';
  else if (response.type.includes('application/pdf')) kind = 'pdf';
  else if (response.type.includes('spreadsheetml')) kind = 'xlsx';
  else if (Object.values(IMAGE).some((mime) => response.type.split(';')[0] === mime)) kind = Object.keys(IMAGE).find((ext) => IMAGE[ext] === response.type.split(';')[0]);
  else if (response.type.includes('text/html')) kind = 'html';
  else if (response.type.includes('json') || type === 'api') kind = 'json';
  if (!SUPPORTED.includes(kind)) kind = 'txt';
  let bytes = response.bytes;
  if (type === 'sheet' && (/text\/html/i.test(response.type) || /^\s*</.test(bytes.toString('utf8', 0, 60)))) throw Error('Google Sheet 无法读取，请设置链接可查看或提供有权限的访问令牌');
  if (kind === 'json') {
    let data; try { data = JSON.parse(bytes.toString('utf8')); } catch { throw Error('API 没有返回有效 JSON，请检查接口与权限'); }
    if (connection.jsonPath) { for (const key of String(connection.jsonPath).split('.').filter(Boolean)) { if (['__proto__', 'constructor', 'prototype'].includes(key) || data === null || typeof data !== 'object' || !Object.hasOwn(data, key)) throw Error('JSON 数据路径不存在'); data = data[key]; } }
    bytes = Buffer.from(JSON.stringify(data, null, 2));
  }
  if (!bytes.length) throw Error('没有读取到资料内容');
  return { bytes, kind };
}
async function docxText(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const pieces = [];
  for (const name of Object.keys(zip.files).filter((name) => /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(name))) {
    const entry = zip.files[name]; if (entry._data?.uncompressedSize > 4 * 1024 * 1024) throw Error('Word 解压内容过大，请拆分');
    pieces.push(entities((await entry.async('string')).replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<w:br\b[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')));
  }
  if (!pieces.length) throw Error('Word 文件没有可读取的正文'); return pieces.join('\n');
}
async function transcribe(file, config, fetchImpl) {
  if (!config?.key || !config?.endpoint || !config?.model) throw Error('请先在 AI 回复中配置音视频转写 API；Claude Key 不能用于语音转写');
  const ext = path.extname(file).slice(1); const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)], { type: AUDIO[ext] || VIDEO[ext] || 'application/octet-stream' }), path.basename(file));
  form.append('model', config.model); form.append('response_format', 'json');
  const response = await fetchBytes(config.endpoint, { method: 'POST', body: form, headers: { Authorization: `Bearer ${config.key}` }, fetchImpl, limit: 4 * 1024 * 1024, timeout: 240000 });
  let data; try { data = JSON.parse(response.bytes.toString('utf8')); } catch { throw Error('转写服务没有返回有效 JSON'); }
  if (typeof data.text !== 'string' || !data.text.trim()) throw Error('未识别到语音文字；如为无声视频，可选择“仅学习视频画面”');
  if (data.text.length > 350000) throw Error('转写内容过长，请拆分媒体'); return data.text;
}
module.exports = { MAX_BYTES, IMAGE, AUDIO, VIDEO, SUPPORTED, urlOf, publicURL, htmlText, sheetURL, fetchBytes, readRemote, docxText, transcribe };
