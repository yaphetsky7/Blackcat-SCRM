// Only metadata already available to this logged-in WhatsApp client is read.
function assembleDirectory(chats, contacts, request={}) {
  const id=value=>String(value?._serialized||value?.toString?.()||value||'');
  const phone=value=>{const raw=id(value);if(/@/.test(raw)&&!/@(?:c\.us|s\.whatsapp\.net)$/.test(raw))return'';const n=raw.split('@')[0].replace(/^\+/,'');return/^[1-9]\d{5,14}$/.test(n)?n:'';};
  const username=value=>{const name=String(value||'').replace(/^@/,'');return /^[a-z0-9._]{3,35}$/i.test(name)&&/[a-z]/i.test(name)?name.toLowerCase():'';};
  const byId=new Map();for(const c of contacts){if(c?.id)byId.set(id(c.id),c);if(c?.phoneNumber)byId.set(id(c.phoneNumber),c);}
  const items=[];const seen=new Set();let skippedGroups=0;
  for(const chat of chats){const key=id(chat.id);if(!key||seen.has(key))continue;seen.add(key);if(!/@(?:c\.us|s\.whatsapp\.net|lid)$/.test(key)){skippedGroups++;continue;}const contact=byId.get(key)||chat.contact||{};const number=phone(contact.phoneNumber)||phone(contact.id)||phone(chat.phoneNumber)||phone(key),user=username(contact.username)||username(chat.username);const title=String(contact.name||contact.shortName||contact.pushname||contact.displayNameLID||chat.name||chat.title||user&&'@'+user||number&&'+'+number||key).trim();let at=Number(chat.t||chat.lastMessageAt||0);if(at>0&&at<1e12)at*=1000;
    items.push({clientId:key,title,phone:number,username:user,target:number||user&&'@'+user||'',privateChat:true,lastMessageAt:Number.isFinite(at)&&at>0?at:null});}
  items.sort((a,b)=>(b.lastMessageAt||0)-(a.lastMessageAt||0)||a.clientId.localeCompare(b.clientId));const query=String(request.query||'').trim().toLocaleLowerCase();const filtered=query?items.filter(v=>[v.clientId,v.title,v.phone,v.username].some(s=>String(s).toLocaleLowerCase().includes(query))):items;const offset=Math.max(0,Number(request.offset)||0),limit=Math.max(1,Math.min(100,Number(request.limit)||50));
  return{available:true,source:request.source||'whatsapp-client-cache',orderedBy:items.some(v=>v.lastMessageAt)?'lastMessageAt':'unknown',items:filtered.slice(offset,offset+limit),total:filtered.length,offset,hasMore:offset+limit<filtered.length,skippedGroups};
}
async function readClientDirectory(assemble,request){
  try{const get=globalThis.require;if(typeof get!=='function')return{available:false};const chats=get('WAWebChatCollection').ChatCollection,contacts=get('WAWebContactCollection').ContactCollection;const array=c=>typeof c.getModelsArray==='function'?c.getModelsArray():Array.isArray(c.models)?c.models:[];const serial=v=>String(v?._serialized||v?.toString?.()||v||'');const clean=c=>({id:serial(c.id),phoneNumber:serial(c.phoneNumber),username:c.username||'',name:c.name||'',shortName:c.shortName||'',pushname:c.pushname||'',displayNameLID:c.displayNameLID||''});const rows=array(chats).map(c=>({id:serial(c.id),t:Number(c.t||0),name:c.name||c.formattedTitle||''})),people=array(contacts).map(clean);let result=assemble(rows,people,request);
    const missing=result.items.filter(c=>!c.target);if(missing.length){try{const mod=get('WAWebLidAwareContactsDB'),db=mod.default||mod;const extra=await Promise.all(missing.map(async c=>{const record=await db.get(c.clientId);return record?{...clean(record),id:c.clientId}:null;}));people.push(...extra.filter(Boolean));result=assemble(rows,people,request);}catch{}}
    return result;
  }catch{return{available:false};}
}
function directoryScript(request){return'('+readClientDirectory.toString()+')('+assembleDirectory.toString()+','+JSON.stringify(request)+')';}
function matchSavedContact(item,accountList=[],personalList=[]){
  if(item.target)return{...item,addressSource:'whatsapp'};const norm=value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase();
  for(const [source,records]of[['account-contacts',accountList],['my-contacts',personalList]]){const matches=records.filter(c=>norm(c.name)===norm(item.title));const unique=new Map();for(const c of matches){let target='';const raw=String(c.phone||'').replace(/\D/g,'');if(/^[1-9]\d{5,14}$/.test(raw))target=raw;else if(/^[a-z0-9._]{3,35}$/i.test(String(c.username||'')))target='@'+String(c.username).replace(/^@/,'').toLowerCase();if(target)unique.set(target,c);}if(unique.size===1)return{...item,target:[...unique.keys()][0],addressSource:source};if(unique.size>1)return{...item,target:'',reason:'联系人同名但号码不同，未自动选择'};}
  return{...item,target:'',reason:'平台及联系人暂未提供可读取的号码或Username'};
}
module.exports={assembleDirectory,directoryScript,matchSavedContact};
