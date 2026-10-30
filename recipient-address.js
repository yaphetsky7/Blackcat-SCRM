(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BlackCatRecipients=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function whatsapp(raw, suppliedKey){
    let input=String(raw??'').trim(),key=String(suppliedKey??'').trim();
    const parts=input.split('|').map(s=>s.trim());if(parts.length>2)throw Error('每位收件人只能提供一个 Username key');
    if(parts.length===2){if(key&&key!==parts[1])throw Error('同一收件人的 Username key 不一致');key=parts[1];input=parts[0];}
    if(/^(?:https?:\/\/)?wa\.me\//i.test(input)){let url;try{url=new URL(/^https?:/i.test(input)?input:'https://'+input);}catch{throw Error('WhatsApp 链接格式不正确');}if(url.hostname.toLowerCase()!=='wa.me'||url.username||url.password)throw Error('WhatsApp 链接格式不正确');input=decodeURIComponent(url.pathname.replace(/^\/|\/$/g,''));if(input.includes('/'))throw Error('请提供电话号码或完整 Username 链接');}
    if(/^\+?[\d\s().-]+$/.test(input)){const phone=input.replace(/\D/g,'').replace(/^00/,'');if(!/^[1-9]\d{5,14}$/.test(phone))throw Error('电话号码须包含国家区号');if(key)throw Error('Username key 只能用于用户名收件人');return{kind:'phone',target:phone};}
    const name=input.replace(/^@/,'');if(!/^[A-Za-z0-9._]{3,35}$/.test(name)||!/[A-Za-z]/.test(name)||/^\.|\.$|\.\./.test(name)||/^www\./i.test(name)||/\.(?:com|org|net|int|edu|gov|mil|arpa|html?|txt|xml)$/i.test(name))throw Error('请填写完整 WhatsApp Username，例如 @customer.name');
    if(/[\s|,，;；\r\n]/.test(key))throw Error('Username key 不能包含空格或分隔符');
    return{kind:'username',target:'@'+name.toLowerCase(),...(key?{usernameKey:key}:{})};
  }
  const dedupeKey=(platform,target)=>platform==='whatsapp'?String(target).toLowerCase():String(target).toLowerCase();
  const keyHeader=header=>/^(?:username[ _-]*key|用户名(?:密钥|口令))(?:\s*[（(](?:可选|optional)[）)])?$/i.test(String(header||'').trim());
  function excel(platform,headers,rows){const keyIndex=platform==='whatsapp'?headers.findIndex(keyHeader):-1;const variableIndexes=headers.map((_,i)=>i).filter(i=>i>0&&i!==keyIndex);return{columns:variableIndexes.map((i)=>String(headers[i]||'变量'+i).replace(/^@/,'').replace(/\s+/g,'')),rows:rows.map(row=>({target:row[0],values:variableIndexes.map(i=>row[i]??''),...(keyIndex>=0?{usernameKey:String(row[keyIndex]??'').trim()}:{})}))};}
  return{whatsapp,dedupeKey,keyHeader,excel};
});
