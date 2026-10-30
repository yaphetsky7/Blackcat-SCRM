// 本地代理中转：Chromium 不支持带账号密码的 SOCKS5，
// 所以带认证的代理统一由这里在 127.0.0.1 起一个 HTTP 代理，再转发到上游（HTTP 或 SOCKS5）。
const net = require('net');
const http = require('http');
const https = require('https');
const tls = require('tls');

// 按需从 socket 读取数据：need(buf) 返回要取走的字节数，-1 表示还不够
function makeReader(sock) {
  let buf = Buffer.alloc(0);
  let waiter = null;
  const check = () => {
    if (!waiter) return;
    const n = waiter.need(buf);
    if (n < 0) return;
    const out = buf.subarray(0, n);
    buf = buf.subarray(n);
    const w = waiter;
    waiter = null;
    w.resolve(out);
  };
  const onData = (d) => { buf = Buffer.concat([buf, d]); check(); };
  const onClose = () => waiter && waiter.reject(new Error('上游代理断开了连接'));
  sock.on('data', onData);
  sock.on('close', onClose);
  const read = (need) => new Promise((resolve, reject) => { waiter = { need, resolve, reject }; check(); });
  return {
    read,
    bytes: (n) => read((b) => (b.length >= n ? n : -1)),
    done() {
      sock.removeListener('data', onData);
      sock.removeListener('close', onClose);
      sock.pause();
      if (buf.length) sock.unshift(buf);
    },
  };
}

async function socks5Handshake(sock, r, up, host, port) {
  sock.write(Buffer.from(up.username ? [5, 2, 0, 2] : [5, 1, 0]));
  const [ver, method] = await r.bytes(2);
  if (ver !== 5) throw new Error('上游不是 SOCKS5 代理');
  if (method === 0xff) throw new Error('SOCKS5 代理不接受当前认证方式（是否需要用户名密码？）');
  if (method === 2) {
    const u = Buffer.from(up.username || '');
    const p = Buffer.from(up.password || '');
    sock.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([p.length]), p]));
    const [, status] = await r.bytes(2);
    if (status !== 0) throw new Error('SOCKS5 用户名或密码错误');
  }
  const h = Buffer.from(host);
  sock.write(Buffer.concat([Buffer.from([5, 1, 0, 3, h.length]), h, Buffer.from([port >> 8, port & 0xff])]));
  const head = await r.bytes(4);
  if (head[1] !== 0) throw new Error(`SOCKS5 代理无法连接目标（错误码 ${head[1]}）`);
  const alen = head[3] === 1 ? 4 : head[3] === 4 ? 16 : (await r.bytes(1))[0];
  await r.bytes(alen + 2);
}

async function httpConnect(sock, r, up, host, port) {
  const auth = up.username
    ? `Proxy-Authorization: Basic ${Buffer.from(`${up.username}:${up.password || ''}`).toString('base64')}\r\n`
    : '';
  sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`);
  const head = (await r.read((b) => { const i = b.indexOf('\r\n\r\n'); return i < 0 ? -1 : i + 4; })).toString();
  const code = Number(head.split(' ')[1]);
  if (code === 407) throw new Error('HTTP 代理用户名或密码错误');
  if (code !== 200) throw new Error(`HTTP 代理返回 ${code || '无效响应'}`);
}

// 通过上游代理打通到 host:port 的 TCP 隧道
function openTunnel(up, host, port) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(Number(up.port), up.host);
    sock.setTimeout(15000, () => sock.destroy(new Error('连接代理超时')));
    sock.once('error', (e) => reject(e.code === 'ECONNREFUSED' ? new Error('代理拒绝连接（主机或端口不对？）') : e));
    sock.once('connect', async () => {
      const r = makeReader(sock);
      try {
        if (up.protocol === 'socks5') await socks5Handshake(sock, r, up, host, port);
        else await httpConnect(sock, r, up, host, port);
        r.done();
        sock.setTimeout(0);
        sock.removeAllListeners('error');
        resolve(sock);
      } catch (e) {
        sock.destroy();
        reject(e);
      }
    });
  });
}

function splitHostPort(s, defPort) {
  const m = s.match(/^\[?([^\]]+?)\]?(?::(\d+))?$/);
  return [m[1], Number(m[2]) || defPort];
}

// 启动本地中转，返回 { port, stop() }
function startRelay(up) {
  const sockets = new Set();
  const track = (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); s.on('error', () => {}); };

  // 普通 http:// 请求（WhatsApp 基本不用）：经隧道转发
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url);
      const sock = await openTunnel(up, url.hostname, Number(url.port) || 80);
      track(sock);
      const fwd = http.request(
        { method: req.method, path: url.pathname + url.search, headers: req.headers, createConnection: () => sock },
        (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); },
      );
      fwd.on('error', () => res.destroy());
      req.pipe(fwd);
    } catch {
      res.writeHead(502);
      res.end();
    }
  });

  // https / wss 走 CONNECT
  server.on('connect', async (req, client, head) => {
    track(client);
    const [host, port] = splitHostPort(req.url, 443);
    try {
      const upSock = await openTunnel(up, host, port);
      track(upSock);
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upSock.write(head);
      upSock.pipe(client);
      client.pipe(upSock);
      upSock.on('close', () => client.destroy());
      client.on('close', () => upSock.destroy());
    } catch {
      client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      port: server.address().port,
      stop() {
        server.close();
        for (const s of sockets) s.destroy();
      },
    }));
  });
}

// 检测代理：经代理访问 ipinfo.io，返回出口 IP 和地区
function testProxy(up) {
  return new Promise((resolve, reject) => {
    openTunnel(up, 'ipinfo.io', 443).then((sock) => {
      const req = https.request({
        host: 'ipinfo.io',
        path: '/json',
        headers: { Accept: 'application/json' },
        createConnection: () => tls.connect({ socket: sock, servername: 'ipinfo.io' }),
        timeout: 15000,
      }, (res) => {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => {
          try {
            const info = JSON.parse(body);
            resolve({
              ip: info.ip,
              location: [info.city, info.region, info.country].filter(Boolean).join(', '),
              org: info.org || '',
            });
          } catch {
            reject(new Error('代理已连通，但查询 IP 信息失败'));
          }
        });
      });
      req.on('timeout', () => req.destroy(new Error('经代理访问超时')));
      req.on('error', reject);
      req.end();
    }, reject);
  });
}

module.exports = { startRelay, testProxy };
