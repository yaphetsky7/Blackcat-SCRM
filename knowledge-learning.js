const crypto = require('crypto');
const fs = require('fs');
const VERSION = 1;
const CHUNK_CHARS = 7200;
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
class OutputLimitError extends Error {
  constructor(message = 'AI 生成结果达到本次长度限制') { super(message); this.code = 'MODEL_OUTPUT_LIMIT'; }
}
function cellText(cell) {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString();
  if (typeof cell !== 'object') return String(cell);
  if (cell.result !== undefined) return cellText(cell.result);
  if (cell.text !== undefined) return String(cell.text);
  if (cell.richText) return cell.richText.map((part) => part.text).join('');
  if (cell.formula || cell.sharedFormula) return `[formula without cached result: ${cell.formula || cell.sharedFormula}]`;
  return JSON.stringify(cell);
}
function pieces(text, limit = CHUNK_CHARS) {
  const result = []; let rest = String(text);
  while (rest.length > limit) {
    let at = rest.lastIndexOf('\n', limit);
    if (at < limit * .5) at = rest.lastIndexOf('。', limit);
    if (at < limit * .5) at = limit;
    else at++;
    // Do not split the two halves of a surrogate pair.
    if (/[\uD800-\uDBFF]/.test(rest[at - 1])) at--;
    result.push(rest.slice(0, at)); rest = rest.slice(at);
  }
  if (rest) result.push(rest); return result;
}
function pack(context, units, label, attachments = []) {
  const result = []; let group = []; let length = context.length;
  const flush = () => { if (group.length) result.push({ context, units: group, label, attachments }); group = []; length = context.length; };
  for (const unit of units) {
    const parts = pieces(unit.text, Math.max(1000, CHUNK_CHARS - context.length - 150));
    for (const [index, text] of parts.entries()) {
      const item = { key: unit.key + (parts.length > 1 ? ` part ${index + 1}/${parts.length}` : ''), text };
      const size = item.key.length + text.length + 2;
      if (group.length && length + size > CHUNK_CHARS) flush();
      group.push(item); length += size;
    }
  }
  flush();
  if (!result.length && attachments.length) result.push({ context, units: [], label, attachments });
  return result;
}
function planWorkbook(workbook) {
  const batches = []; let rowCount = 0; let characters = 0;
  for (const sheet of workbook.worksheets) {
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row, number) => {
      rowCount++; if (rowCount > 10000) throw Error('Excel 超过 10000 行，请拆分后导入');
      const text = row.values.slice(1).map(cellText).join('\t'); characters += text.length;
      rows.push({ key: `Row ${number}`, text });
    });
    if (!rows.length) continue;
    if (characters > 350000) throw Error('Excel 内容超过 350000 字符，请拆分后导入');
    const header = rows.slice(0, 2).map((row) => `${row.key}: ${row.text}`).join('\n').slice(0, 1500);
    const context = `Sheet: ${sheet.name}\nColumns are tab-separated. Sheet heading / column context:\n${header}\n`;
    batches.push(...pack(context, rows, sheet.name));
  }
  if (!batches.length) throw Error('Excel 没有可读取的内容');
  return { batches, rowCount, characters };
}
function planContent(content) {
  if (content.batches) return content.batches;
  const text = content.filter((block) => block.type === 'text').map((block) => block.text).join('\n');
  const attachments = content.filter((block) => block.type !== 'text');
  return pack('', text ? [{ key: 'Content', text }] : [], '资料', attachments);
}
function batchId(batch) { return digest(JSON.stringify(batch)); }
function contentOf(batch) { return [...(batch.attachments || []), { type: 'text', text: [batch.context, ...batch.units.map((unit) => `${unit.key}\t${unit.text}`)].filter(Boolean).join('\n') }]; }
function splitBatch(batch) {
  if (batch.units.length > 1) {
    const total = batch.units.reduce((sum, unit) => sum + unit.text.length, 0); let at = 1; let sum = batch.units[0].text.length;
    while (at < batch.units.length - 1 && sum < total / 2) { sum += batch.units[at].text.length; at++; }
    return [{ ...batch, units: batch.units.slice(0, at) }, { ...batch, units: batch.units.slice(at) }];
  }
  const unit = batch.units[0]; if (!unit || unit.text.length < 800) return null;
  let at = Math.floor(unit.text.length / 2); if (/[\uD800-\uDBFF]/.test(unit.text[at - 1])) at--;
  return [{ ...batch, units: [{ key: unit.key + ' (first half)', text: unit.text.slice(0, at) }] }, { ...batch, units: [{ key: unit.key + ' (continued)', text: unit.text.slice(at) }] }];
}
function validateStudy(result) {
  if (!Array.isArray(result.cards) || !result.cards.length) throw Error(result.summary || '未能从资料提取知识');
  for (const card of result.cards) {
    if (typeof card.topic !== 'string' || !card.topic.trim() || typeof card.content !== 'string' || !card.content.trim()) throw Error('资料学习结果不完整');
    if (card.content.length > 12000 || card.topic.length > 300) throw new OutputLimitError('单条知识过长，将自动缩小学习批次');
    if (!Array.isArray(card.keywords)) card.keywords = [];
  }
  return { summary: String(result.summary || ''), replyGuide: String(result.replyGuide || ''), cards: result.cards.map((card) => ({ topic: card.topic, content: card.content, keywords: card.keywords.slice(0, 30).map(String) })) };
}
async function learnBatches({ batches, checkpointFile, model, request, progress = () => {} }) {
  const fingerprint = digest(JSON.stringify({ version: VERSION, model, batches }));
  let state = { fingerprint, results: {}, split: [], expanded: [] };
  try { const old = JSON.parse(fs.readFileSync(checkpointFile, 'utf8')); if (old.fingerprint === fingerprint) state = old; } catch {}
  const persist = () => { fs.writeFileSync(checkpointFile + '.tmp', JSON.stringify(state)); fs.renameSync(checkpointFile + '.tmp', checkpointFile); };
  const leaves = (items) => items.flatMap((batch) => { const children = state.split.includes(batchId(batch)) ? splitBatch(batch) : null; return children ? leaves(children) : [batch]; });
  let queue = leaves(batches); let calls = 0;
  const report = (label) => progress({ completed: queue.filter((batch) => state.results[batchId(batch)]).length, total: queue.length, label });
  report('');
  for (let index = 0; index < queue.length;) {
    const batch = queue[index]; const key = batchId(batch);
    if (state.results[key]) { index++; continue; }
    if (++calls > 128) throw Error('本次学习批次数量已达上限，进度已保存；再次学习可继续');
    report(batch.label);
    try {
      const maxTokens = state.expanded.includes(key) ? 32768 : 16384;
      state.results[key] = validateStudy(await request(contentOf(batch), { maxTokens, label: batch.label, index: index + 1, total: queue.length }));
      persist(); report(batch.label); index++;
    } catch (error) {
      if (error.code !== 'MODEL_OUTPUT_LIMIT') throw error;
      const children = splitBatch(batch);
      if (children) { state.split.push(key); persist(); queue.splice(index, 1, ...children); report(batch.label); }
      else if (!state.expanded.includes(key)) { state.expanded.push(key); persist(); }
      else throw Error('这一段学习仍超出输出限制，已保存完成进度；再次学习可继续');
    }
  }
  report(''); return queue.map((batch) => state.results[batchId(batch)]);
}
module.exports = { OutputLimitError, CHUNK_CHARS, cellText, pieces, planWorkbook, planContent, batchId, contentOf, splitBatch, validateStudy, learnBatches };
