// Validate and reissue redirects in the same account session. Chromium may
// expose a 302 as either a redirect event or an ordinary response.
function streamPlatformAsset({net,session,url,validate,onChunk,timeout=900000}) {
 return new Promise((resolve,reject)=>{
  let request,settled=false,redirects=0,mime='application/octet-stream';
  const timer=setTimeout(()=>stop(Error('附件下载超时，已保留为待补存')),timeout);timer.unref?.();
  const header=(response,name)=>{const h=response.headers||{},key=Object.keys(h).find(k=>k.toLowerCase()===name),value=h[key];return String(Array.isArray(value)?value[0]:value||'');};
  function stop(error){if(settled)return;settled=true;clearTimeout(timer);if(error){try{request?.abort();}catch{}reject(error);}else resolve(mime);}
  function redirect(next,base){try{if(++redirects>6)throw Error('附件重定向过多');const target=validate(new URL(next,base).href),old=request;issue(target.href);try{old.abort();}catch{}}catch(error){stop(error);}}
  function issue(value){const current=net.request({url:value,session,credentials:'include',redirect:'manual'});request=current;const fail=error=>{if(current===request)stop(error);};
   current.on('redirect',(_status,_method,next)=>{if(current===request&&!settled)redirect(next,value);});
   current.on('error',fail);current.on('abort',()=>fail(Error('附件下载已中断，待重试')));
   current.on('response',response=>{if(current!==request||settled)return;
    if([301,302,303,307,308].includes(response.statusCode)){const next=header(response,'location');if(!next){setImmediate(()=>{if(current===request&&!settled)fail(Error('附件重定向缺少下载地址'));});return;}redirect(next,value);return;}
    if(response.statusCode<200||response.statusCode>=300)return fail(Error('附件下载返回 '+response.statusCode));
    if(response.statusCode===206){const range=header(response,'content-range').match(/^bytes 0-(\d+)\/(\d+)$/);if(!range||Number(range[1])+1!==Number(range[2]))return fail(Error('影片仅下载了片段，原片待补存'));}
    mime=header(response,'content-type')||'application/octet-stream';if(/text\/html/i.test(mime))return fail(Error('附件下载返回网页或登录页，未当作文件保存'));
    const length=header(response,'content-length'),expected=/^\d+$/.test(length)&&!header(response,'content-encoding')?Number(length):null;let received=0;
    response.on('error',fail);response.on('aborted',()=>fail(Error('附件传输中断，待重试')));response.on('data',chunk=>{if(current!==request||settled)return;try{received+=chunk.length;if(expected!==null&&received>expected)throw Error('附件大小与原下载响应不符，待补存');onChunk(chunk);}catch(error){fail(error);}});response.on('end',()=>{if(current===request){if(expected!==null&&received!==expected)return fail(Error('附件未下载完整，待补存'));stop();}});
   });current.end();
  }
  try{issue(validate(url).href);}catch(error){stop(error);}
 });
}
module.exports={streamPlatformAsset};
