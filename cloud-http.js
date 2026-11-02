'use strict';
// Shared response handling for cloud browsing and transfers. Never expose raw
// gateway pages, credentials or customer content in an error message.
async function decodeCloudResponse(res, binary = false) {
  if (binary && res.ok) return Buffer.from(await res.arrayBuffer());
  let result;
  try {
    const text = await res.text();
    if (!text.trim()) throw Error('empty');
    result = JSON.parse(text);
    if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') throw Error('envelope');
  } catch {
    throw Object.assign(Error('云端响应不完整，请重试；已保存的聊天记录不会删除。 / Incomplete cloud response. Please retry; saved chats are retained.'), { status: res.ok ? 502 : res.status, retryable: res.ok || [408,502,503,504].includes(res.status) });
  }
  if (!res.ok || !result.ok) throw Object.assign(Error(result.error || '云端请求失败 / Cloud request failed'), { status: res.status });
  return result.data;
}
const safeToRetry = (route, method) => method === 'GET' || method === 'POST' && ['archive/prepare','sync/prepare'].includes(route);
async function cloudRequest({ url, route, method = 'GET', headers, body, binary = false, signal, check = () => {}, fetcher = fetch, delay = ms => new Promise(r => setTimeout(r, ms)) }) {
  for (let attempt = 0; ; attempt++) {
    try {
      check();
      const res = await fetcher(url, { method, redirect: 'error', headers, body, signal: signal || AbortSignal.timeout(120000) });
      const result = await decodeCloudResponse(res, binary);
      check();
      return result;
    } catch (e) {
      check();
      if (signal?.aborted || attempt >= 2 || !safeToRetry(route, method) || !(e.retryable || [408,502,503,504].includes(e.status) || !e.status && ['TypeError','TimeoutError'].includes(e.name))) throw e;
      await delay(400 * (attempt + 1));
    }
  }
}
module.exports = { decodeCloudResponse, cloudRequest };
