'use strict';
const { setTimeout: sleep } = require('node:timers/promises');
function transient(error) {
  const code = error?.cause?.code || error?.code;
  return error?.retryable === true || [408,429,500,502,503,504].includes(error?.upstreamStatus) || ['ECONNRESET','ETIMEDOUT','EAI_AGAIN','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].includes(code) || ['TimeoutError','AbortError'].includes(error?.name);
}
function createStorageRetry({ beforeAttempt = () => {}, wait = sleep, report = () => {} } = {}) {
  return async (kind, action) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      // Charge every physical read/write, including retries, against trial guards.
      // A quota rejection is outside the catch and must never be retried.
      beforeAttempt(kind);
      try { return await action(); }
      catch (error) {
        if (!transient(error)) throw error;
        report({ kind, attempt, upstreamStatus: error.upstreamStatus || null, requestId: String(error.requestId || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 128) });
        if (attempt === 3) throw Object.assign(Error('云储存暂时连接失败，已自动重试。待传资料仍保留，软件会稍后继续同步。'), { status: 503, retryable: true, upstreamStatus: error.upstreamStatus, requestId: error.requestId, cause: error });
        await wait(attempt === 1 ? 400 : 1200);
      }
    }
  };
}
module.exports = { createStorageRetry, transient };
