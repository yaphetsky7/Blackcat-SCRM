// 解压 Chrome 扩展包（.crx）：去掉 CRX 头部后就是普通 zip，这里用 zlib 自己解 zip，不额外依赖
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crxToZip(buf) {
  if (buf.toString('latin1', 0, 4) !== 'Cr24') throw new Error('不是有效的 CRX 文件');
  const version = buf.readUInt32LE(4);
  if (version === 3) return buf.subarray(12 + buf.readUInt32LE(8));
  if (version === 2) return buf.subarray(16 + buf.readUInt32LE(8) + buf.readUInt32LE(12));
  throw new Error(`不支持的 CRX 版本 ${version}`);
}

function extractZip(zip, destDir) {
  // 找到 End of Central Directory
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('zip 结构损坏');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const root = path.resolve(destDir);

  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 目录损坏');
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOff = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    const out = path.resolve(root, name);
    if (!out.startsWith(root + path.sep)) throw new Error(`非法路径：${name}`);
    if (name.endsWith('/')) {
      fs.mkdirSync(out, { recursive: true });
      continue;
    }
    const dataStart = localOff + 30 + zip.readUInt16LE(localOff + 26) + zip.readUInt16LE(localOff + 28);
    const raw = zip.subarray(dataStart, dataStart + compSize);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, method === 8 ? zlib.inflateRawSync(raw) : raw);
  }
}

function extractCrx(buf, destDir) {
  extractZip(crxToZip(buf), destDir);
}

// 扩展 ID = 公钥 SHA256 的前 16 字节，每 4 位映射到 a-p
function idFromKey(key) {
  const hex = require('crypto').createHash('sha256').update(key).digest('hex').slice(0, 32);
  return [...hex].map((h) => String.fromCharCode(97 + parseInt(h, 16))).join('');
}

// 从 CRX3 头（protobuf）里找出与扩展 ID 对应的公钥，返回 base64，写进 manifest.key 后
// 解压出来的扩展就能保持官方 ID（有些扩展会校验自己的 origin）
function crxPublicKey(buf, extId) {
  if (buf.toString('latin1', 0, 4) !== 'Cr24' || buf.readUInt32LE(4) !== 3) return null;
  const header = buf.subarray(12, 12 + buf.readUInt32LE(8));
  const varint = (b, p) => {
    let v = 0, shift = 0, byte;
    do { byte = b[p++]; v += (byte & 0x7f) * 2 ** shift; shift += 7; } while (byte & 0x80);
    return [v, p];
  };
  // 遍历一层 protobuf 字段，返回 [[字段号, 内容]]（只关心长度分隔类型）
  const fields = (b) => {
    const out = [];
    let p = 0;
    while (p < b.length) {
      let tag, len;
      [tag, p] = varint(b, p);
      const type = tag & 7;
      if (type === 2) { [len, p] = varint(b, p); out.push([Math.floor(tag / 8), b.subarray(p, p + len)]); p += len; }
      else if (type === 0) [, p] = varint(b, p);
      else if (type === 5) p += 4;
      else if (type === 1) p += 8;
      else break;
    }
    return out;
  };
  for (const [num, proof] of fields(header)) {
    if (num !== 2 && num !== 3) continue; // sha256_with_rsa / sha256_with_ecdsa
    const key = fields(proof).find(([n]) => n === 1)?.[1];
    if (key && idFromKey(key) === extId) return key.toString('base64');
  }
  return null;
}

module.exports = { extractCrx, crxPublicKey };
