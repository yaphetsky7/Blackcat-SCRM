'use strict';
// Private bucket only. Credentials are read on the backend, never included in desktop builds.
const crypto = require('crypto');
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (key, text) => crypto.createHmac('sha256', key).update(text).digest();
function createR2(env = process.env, fetchImpl = fetch) {
  const account = env.R2_ACCOUNT_ID || '', bucket = env.R2_BUCKET || '', access = env.R2_ACCESS_KEY_ID || '', secret = env.R2_SECRET_ACCESS_KEY || '';
  const gateway = String(env.R2_GATEWAY_URL || '').replace(/\/$/, ''), gatewaySecret = env.R2_GATEWAY_SECRET || '';
  const useGateway = /^https:\/\/[^/?#]+\/api\/private-backup$/.test(gateway) && /^[a-f0-9]{64}$/.test(gatewaySecret);
  const configured = useGateway || /^[a-f0-9]{32}$/.test(account) && /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) && !!access && !!secret;
  const upstreamError = res => Object.assign(Error('私有云储存连接失败（' + res.status + '）'), { status: 502, upstreamStatus: res.status, retryable: [408,429,500,502,503,504].includes(res.status), requestId: res.headers?.get('cf-ray') || res.headers?.get('x-amz-request-id') || '' });
  async function request(method, key, body) {
    if (!configured) throw Object.assign(Error('云储存尚未接通，请联系管理员完成 R2 配置'), { status: 503 });
    if (useGateway) {
      const res = await fetchImpl(gateway + '?key=' + encodeURIComponent(key), { method, headers: { authorization: 'Bearer ' + gatewaySecret, 'content-type': 'application/octet-stream' }, body: method === 'PUT' ? body : undefined, redirect: 'error', signal: AbortSignal.timeout(25000) });
      if (!res.ok) { await res.body?.cancel(); throw upstreamError(res); }
      return res;
    }
    const host = account + '.r2.cloudflarestorage.com';
    const uri = '/' + bucket + '/' + key.split('/').map(p => encodeURIComponent(p).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
    const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''), day = date.slice(0, 8), payload = digest(body || Buffer.alloc(0));
    const headers = { host, 'x-amz-content-sha256': payload, 'x-amz-date': date };
    const names = Object.keys(headers).sort(), signed = names.join(';');
    const canonical = [method, uri, '', names.map(n => n + ':' + headers[n] + '\n').join(''), signed, payload].join('\n');
    const scope = day + '/auto/s3/aws4_request';
    const keyDate = hmac('AWS4' + secret, day), keyRegion = hmac(keyDate, 'auto'), keyService = hmac(keyRegion, 's3');
    const signature = hmac(hmac(keyService, 'aws4_request'), 'AWS4-HMAC-SHA256\n' + date + '\n' + scope + '\n' + digest(canonical)).toString('hex');
    headers.authorization = 'AWS4-HMAC-SHA256 Credential=' + access + '/' + scope + ', SignedHeaders=' + signed + ', Signature=' + signature;
    const res = await fetchImpl('https://' + host + uri, { method, headers, body: method === 'PUT' ? body : undefined, redirect: 'error', signal: AbortSignal.timeout(25000) });
    if (!res.ok) { await res.body?.cancel(); throw upstreamError(res); }
    return res;
  }
  return { configured, put: async (key, body) => { const r = await request('PUT', key, body); await r.body?.cancel(); }, get: async key => Buffer.from(await (await request('GET', key)).arrayBuffer()), delete: async key => { const r = await request('DELETE', key); await r.body?.cancel(); } };
}
module.exports = { createR2 };
