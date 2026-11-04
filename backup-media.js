'use strict';
// Inspect the downloaded bytes; a thumbnail/login page must not be labelled a video original.
function mediaType(bytes,declared='application/octet-stream'){
 const b=Buffer.from(bytes),text=b.subarray(0,400).toString('utf8').trimStart(),ascii=(start,end)=>b.subarray(start,end).toString('ascii');
 if(/^<(?:!doctype\s+html|html|head|body)\b/i.test(text))throw Error('下载结果是网页或登录页，原附件待补存');
 if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return'image/png';if(b[0]===255&&b[1]===216&&b[2]===255)return'image/jpeg';if(/^GIF8[79]a$/.test(ascii(0,6)))return'image/gif';
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return'image/webp';if(ascii(0,2)==='BM')return'image/bmp';if(/^<\?xml[^>]*>\s*<svg\b|^<svg\b/i.test(text))return'image/svg+xml';
 if(ascii(4,8)==='ftyp'){const brand=ascii(8,12);return /^(avif|avis)$/.test(brand)?'image/avif':/^(heic|heix|mif1|msf1)$/.test(brand)?'image/heic':/^(M4A |M4B |F4A )$/.test(brand)?'audio/mp4':brand==='qt  '?'video/quicktime':'video/mp4';}
 if(b.length>=4&&b.subarray(0,4).equals(Buffer.from([26,69,223,163])))return /^audio\//.test(declared)?'audio/webm':'video/webm';if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE')return'audio/wav';if(ascii(0,4)==='RIFF'&&ascii(8,12)==='AVI ')return'video/x-msvideo';if(ascii(0,4)==='OggS')return /^video\//.test(declared)?'video/ogg':'audio/ogg';if(ascii(0,3)==='ID3'||b[0]===255&&(b[1]&224)===224)return'audio/mpeg';if(ascii(0,5)==='%PDF-')return'application/pdf';
 const fallback=String(declared||'application/octet-stream').split(';')[0].toLowerCase();return /^(image|video)\//.test(fallback)?'application/octet-stream':fallback;
}
function verifiedMediaType(bytes,declared,kind){const type=mediaType(bytes,declared),b=Buffer.from(bytes);if(kind==='video'&&(!type.startsWith('video/')||b.length<12||!['ftyp','RIFF','OggS'].includes(b.subarray(4,8).toString('ascii'))&&!['RIFF','OggS'].includes(b.subarray(0,4).toString('ascii'))&&!b.subarray(0,4).equals(Buffer.from([26,69,223,163]))))throw Error('尚未取得完整可识别的影片原件，不能用封面或片段代替');if(kind==='image'&&!type.startsWith('image/'))throw Error('下载结果不是可识别的图片，原图待补存');return type;}
module.exports={mediaType,verifiedMediaType};
