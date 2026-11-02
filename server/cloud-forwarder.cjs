// Compatibility entry for clients still using the old Windows/Tailscale address.
// It stores no customer database or Claude key and forwards only to the configured HTTPS origin.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

function createForwarder(originString) {
  const origin = new URL(originString);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw Error('Cloud forwarding requires an HTTPS origin without credentials or a path');
  }
  return http.createServer((request, response) => {
    const headers = { ...request.headers, host: origin.host };
    for (const name of ['connection', 'proxy-connection', 'proxy-authorization', 'upgrade']) delete headers[name];
    const upstream = https.request({
      hostname: origin.hostname, port: origin.port || 443,
      method: request.method, path: request.url, headers,
      timeout: 16 * 60 * 1000
    }, incoming => {
      const outgoing = { ...incoming.headers, 'x-blackcat-backend': 'linode-cloud' };
      delete outgoing.connection;
      response.writeHead(incoming.statusCode || 502, outgoing);
      incoming.pipe(response);
    });
    upstream.on('timeout', () => upstream.destroy(Error('Cloud backend timeout')));
    upstream.on('error', () => {
      if (response.headersSent) return response.destroy();
      response.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'retry-after': '10' });
      response.end(JSON.stringify({ ok: false, error: '云端后台暂时无法连接，请稍后重试' }));
    });
    request.on('aborted', () => upstream.destroy());
    response.on('close', () => { if (!response.writableFinished) upstream.destroy(); });
    request.pipe(upstream);
  });
}

function startFromConfig({ port = Number(process.env.PORT) || 8787 } = {}) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'cloud-origin.json'), 'utf8'));
  const server = createForwarder(config.origin);
  server.requestTimeout = 0;
  server.listen(port, '127.0.0.1', () => console.log('BlackCat compatibility entry forwarding to cloud on port ' + port));
  return server;
}
if (require.main === module) startFromConfig();
module.exports = { createForwarder, startFromConfig };
