// 注入到每个聊天页面（webview）的翻译脚本：
//   1) 历史消息翻译：把聊天记录里的消息翻译后显示在气泡下方
//   2) 发送翻译：拦截输入框的 Enter，先把内容翻译成目标语言再发送（Alt+Enter 发送原文）
//   3) 实时翻译：输入时在输入框上方预览译文
// 脚本运行在隔离环境，只操作 DOM；模拟回车要让页面自己的代码收到，所以用 webFrame 在页面环境里执行。
const { ipcRenderer, webFrame } = require('electron');
// BEGIN translation-shortcut inline (sandboxed preloads cannot require local files).
const translationShortcut=(()=>{const module={exports:{}};
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BlackCatTranslationShortcut=factory();})(typeof globalThis==='undefined'?this:globalThis,()=>{
  const DEFAULT='Ctrl+T';
  const modifiers=['Ctrl','Alt','Shift','Meta'];
  function parse(value){
    if(typeof value!=='string')return null;
    const parts=value.split('+').map(s=>s.trim().toLowerCase()),mods=new Set();let key='';
    for(const part of parts){const mod={ctrl:'Ctrl',control:'Ctrl',alt:'Alt',option:'Alt',shift:'Shift',meta:'Meta',cmd:'Meta',command:'Meta'}[part];if(mod){if(mods.has(mod))return null;mods.add(mod);}else if(!key&&/^(?:[a-z0-9]|f(?:[1-9]|1[0-2]))$/.test(part))key=part.toUpperCase();else return null;}
    if(!key||!['Ctrl','Alt','Meta'].some(m=>mods.has(m)))return null;
    return [...modifiers.filter(m=>mods.has(m)),key].join('+');
  }
  function fromEvent(e){
    if(e.isComposing||e.keyCode===229||e.getModifierState?.('AltGraph'))return null;
    const code=/^(?:Key([A-Z])|Digit([0-9])|(F(?:[1-9]|1[0-2])))$/.exec(e.code||'');
    const key=code?(code[1]||code[2]||code[3]):String(e.key||'').toUpperCase();
    return parse([e.ctrlKey&&'Ctrl',e.altKey&&'Alt',e.shiftKey&&'Shift',e.metaKey&&'Meta',key].filter(Boolean).join('+'));
  }
  const normalize=value=>({enabled:value?.enabled===true,accelerator:parse(value?.accelerator)||DEFAULT});
  const matches=(e,value)=>{const config=normalize(value);return config.enabled&&fromEvent(e)===config.accelerator;};
  return{DEFAULT,parse,fromEvent,normalize,matches};
});

return module.exports;})();
// END translation-shortcut inline
const recipientAddress=(()=>{const module={exports:{}};
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

return module.exports;})();
const {CLIENT_STATE_SCRIPT,createWhatsAppUsernameFlow}=(()=>{const module={exports:{}};
// Read only current client state; native UI performs the search/key challenge.
const CLIENT_STATE_SCRIPT='('+async function(){
  try{
    const get=globalThis.require;if(typeof get!=='function')return{available:false};
    const collection=get('WAWebChatCollection').ChatCollection,chat=collection.getActive();
    let searchEnabled=null;try{searchEnabled=get('WAWebUsernameGatingUtils').usernameSearchEnabled();}catch{}
    if(!chat)return{available:true,searchEnabled,active:null};
    const id=String(chat.id?._serialized||chat.id?.toString?.()||'');let contact=get('WAWebContactCollection').ContactCollection.get(chat.id);
    let username=contact?.username||'';
    if(!username&&id){try{const store=get('WAWebLidAwareContactsDB');const record=await(store.default||store).get(chat.id?.toJid?.()||id);username=record?.username||'';}catch{}}
    const current=collection.getActive();if(String(current?.id?._serialized||current?.id?.toString?.()||'')!==id)return{available:true,searchEnabled,active:null};
    return{available:true,searchEnabled,active:{id,username:String(username).replace(/^@/,'').toLowerCase(),privateChat:!!id&&!/@(?:g\.us|broadcast|newsletter)$/.test(id)}};
  }catch{return{available:false};}
}.toString()+')()';

function createWhatsAppUsernameFlow({document:doc,getState,getComposer,readText,fillText,click,pause,waitFor}){
  const visible=el=>!!el&&el.isConnected&&!el.closest('[hidden],[aria-hidden="true"]')&&!!el.getClientRects().length;
  const elements=(selector,root=doc)=>[...root.querySelectorAll(selector)].filter(visible);
  const label=node=>(node.getAttribute('aria-label')||node.getAttribute('title')||node.textContent||'').trim();
  const same=(a,b)=>String(a||'').replace(/^@/,'').toLowerCase()===String(b||'').replace(/^@/,'').toLowerCase();
  const valid=(state,wanted)=>!!state?.active?.id&&state.active.privateChat&&same(state.active.username,wanted)&&!!getComposer();
  const fieldValue=el=>'value'in el?el.value:readText(el);
  async function put(el,value){el.focus();if('value'in el){const proto=el.tagName==='TEXTAREA'?el.ownerDocument.defaultView.HTMLTextAreaElement.prototype:el.ownerDocument.defaultView.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new el.ownerDocument.defaultView.Event('input',{bubbles:true}));return el.value===value;}return fillText(el,value);}
  function challenge(wanted){return elements('[role="dialog"],[data-testid*="username-key"],[data-testid*="username-pin"]').find(node=>/username.{0,20}(?:key|pin)|用户名.{0,12}(?:密钥|口令|验证)/i.test(node.textContent)&&node.textContent.toLowerCase().includes(String(wanted).replace(/^@/,'').toLowerCase()));}
  async function submitKey(dialog,key){if(!key)throw Error('对方要求 Username key，请在名单中填写后重试；未发送');
    const inputs=elements('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),[contenteditable="true"]',dialog).filter(el=>!el.disabled);
    if(inputs.length===1){if(!(await put(inputs[0],key)))throw Error('无法填入 Username key；未发送');}
    else if(inputs.length===key.length&&inputs.every(el=>el.maxLength===1)){for(let i=0;i<inputs.length;i++)if(!(await put(inputs[i],key[i])))throw Error('无法填入 Username key；未发送');}
    else throw Error('无法识别 Username key 输入框；未发送');
    const next=await waitFor(()=>elements('button,[role="button"]',dialog).find(el=>/^(?:next|continue|confirm|submit|下一步|继续|确认|提交)$/i.test(label(el))&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'),2000);if(!next)throw Error('Username key 未被接受或找不到确认按钮；未发送');click(next);
  }
  async function verify(proof){if(proof.deadline&&Date.now()>proof.deadline)throw Error('任务已超时，已取消发送');const state=await getState();if(proof.deadline&&Date.now()>proof.deadline)throw Error('任务已超时，已取消发送');if(!valid(state,proof.username)||state.active.id!==proof.id)throw Error('当前聊天对象已改变或无法核对 Username，已取消发送');return true;}
  async function open(recipient){const wanted=recipient.target.replace(/^@/,''),query='@'+wanted;let state=await getState();if(valid(state,wanted))return{id:state.active.id,username:wanted};
    if(state?.searchEnabled===false)throw Error('当前 WhatsApp 账号尚未开放 Username 搜索，请使用电话号码；未发送');
    if(!state?.available)throw Error('无法读取 WhatsApp 当前用户标识，请刷新账号后重试；未发送');
    const composer=getComposer();if(composer&&readText(composer).trim())throw Error('当前聊天有未发送草稿，请先处理；未发送');
    const start=elements('button[aria-label],button[title],[role="button"][aria-label],[role="button"][title]').find(el=>/^(?:New chat|New message|新建聊天|新建对话|新聊天|新对话|发起新聊天)$/i.test(label(el)))||elements('#side [data-icon="new-chat-outline"],#side [data-icon="new-chat"],#side header [data-icon="chat"]').map(el=>el.closest('button,[role="button"]')).find(visible);
    if(!start)throw Error('找不到 WhatsApp 新建聊天入口，请确认已登录；未发送');click(start);
    const search=await waitFor(()=>elements('input[type="text"],input[type="search"],[contenteditable="true"][role="textbox"]').find(el=>!el.closest('#main')&&(el===doc.activeElement||/search|搜索|搜尋|查找/i.test(label(el)+' '+el.getAttribute('data-testid')))),8000);if(!search)throw Error('找不到 WhatsApp 新建聊天搜索框；未发送');
    let ownedDialog=null;try{
      await pause(350);
      if(!(await put(search,query)))throw Error('无法输入完整 Username；未发送');
      const root=search.closest('[data-testid="drawer-left"],[data-testid="new-chat-drawer"],[role="dialog"],#side')||doc;
      const candidates=()=>elements('[role="row"],[role="listitem"],[data-testid="cell-frame-container"]',root).filter(el=>!el.contains(search)&&!el.closest('#main'));
      let match=await waitFor(()=>{const list=candidates(),exact=list.filter(el=>[...el.querySelectorAll('[data-username],span,[dir="auto"]')].some(n=>same(n.getAttribute('data-username')||n.textContent.trim(),query)));return exact.find(el=>!exact.some(other=>other!==el&&el.contains(other)))||(list.length===1?list[0]:null);},12000);
      if(!match)throw Error('未找到完整匹配的 Username，或当前账号暂不支持此功能；未发送');
      const target=match.querySelector('[role="button"],[tabindex],span[title]')||match;target.scrollIntoView?.({block:'nearest'});click(target);
      let keySubmitted=false;const end=Date.now()+15000;
      while(Date.now()<end){state=await getState();if(valid(state,wanted))return{id:state.active.id,username:wanted};const dialog=challenge(wanted);if(dialog){ownedDialog=dialog;if(!keySubmitted){await submitKey(dialog,recipient.usernameKey);keySubmitted=true;}else if(/incorrect|invalid|wrong|不正确|错误|无效/i.test(dialog.textContent))throw Error('Username key 不正确或已变更；未发送');}await pause(300);}
      throw Error(keySubmitted?'Username key 尚未通过或聊天未打开；未发送':'无法确认打开的用户就是指定 Username；未发送');
    }catch(error){if(ownedDialog&&visible(ownedDialog)){const cancel=elements('button,[role="button"]',ownedDialog).find(el=>/^(?:cancel|取消)$/i.test(label(el)));if(cancel)click(cancel);}if(search.isConnected&&fieldValue(search)===query){await put(search,'').catch(()=>{});const back=elements('[data-icon="back"],[data-icon="back-arrow"]',search.closest('#side')||doc).map(el=>el.closest('button,[role="button"]')).find(visible);if(back)click(back);}throw error;}
  }
  return{open,verify};
}
module.exports={CLIENT_STATE_SCRIPT,createWhatsAppUsernameFlow};

return module.exports;})();

const waDirectory=(()=>{const module={exports:{}};
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

return module.exports;})();
async function readWhatsAppDirectory(request={}){const options={query:String(request.query||''),offset:Number(request.offset)||0,limit:Number(request.limit)||50};let result;try{result=await Promise.race([webFrame.executeJavaScript(waDirectory.directoryScript(options)),new Promise(resolve=>setTimeout(()=>resolve({available:false}),5000))]);}catch{}if(result?.available)return result;try{const databases=await indexedDB.databases();if(!databases.some(db=>db.name==='model-storage'))return{available:false};const [chats,contacts]=await Promise.all([idbGetAll('model-storage','chat'),idbGetAll('model-storage','contact')]);return waDirectory.assembleDirectory(chats,contacts,{...options,source:'whatsapp-local-database'});}catch{return{available:false};}}
const textOf = (sel) => document.querySelector(sel)?.textContent.trim() || '';

// 消息在聊天区右半边 = 自己发的（用于没有明确 class 的平台）
const onRightOf = (containerSel) => (el) => {
  const box = (document.querySelector(containerSel) || document.body).getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return r.left + r.width / 2 > box.left + box.width / 2;
};

// 有些按钮（如 Telegram 的发送）认的是完整的按下/松开，而不是单纯的 click
function press(el) {
  const r = el.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, view: window, button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerType: 'mouse', isPrimary: true };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...o, buttons: 1 }));
  el.dispatchEvent(new MouseEvent('mousedown', { ...o, buttons: 1 }));
  el.dispatchEvent(new PointerEvent('pointerup', o));
  el.dispatchEvent(new MouseEvent('mouseup', o));
  el.dispatchEvent(new MouseEvent('click', o));
}

const shown = (el) => !!el && el.getBoundingClientRect().width > 0;
const imgSrc = (sel) => { const el = document.querySelector(sel); return el?.currentSrc || el?.src || el?.getAttribute('href') || el?.getAttribute('xlink:href') || null; };

// 新版 WhatsApp 的按钮图标用 <svg><title>ic-send-filled</title>，旧版用 data-icon="send"，都按“send”找（与界面语言无关）
const whatsappSend = (inFooter) => [...document.querySelectorAll('svg title, [data-icon]')]
  .filter((n) => /send/i.test(n.tagName.toLowerCase() === 'title' ? n.textContent : n.getAttribute('data-icon')))
  .map((n) => n.closest('[role="button"], button'))
  .find((b) => b && shown(b) && !!b.closest('#main footer') === inFooter);

// 发送按钮：可以是 CSS 选择器，也可以是返回元素的函数
const findSendButton = (ad) => (typeof ad.sendButton === 'function' ? ad.sendButton() : ad.sendButton ? document.querySelector(ad.sendButton) : null);

// Telegram 把头像缓存在 Cache Storage（tt-media-avatars），键名含自己的用户 ID
async function telegramAvatar() {
  const id = JSON.parse(localStorage.getItem('user_auth') || '{}').id;
  if (!id) return null;
  const cache = await caches.open('tt-media-avatars');
  const key = (await cache.keys()).find((r) => r.url.includes(`/avatar${id}?`));
  if (!key) return null;
  return URL.createObjectURL(await (await cache.match(key)).blob());
}

// 各平台的页面结构。avatar：自己的头像；mediaSend：粘贴文件后弹出的发送按钮（'enter' 表示附件进了输入框，回车发送）
// This helper is copied into the isolated guest preload before ADAPTERS.
function whatsappChatIdentity() {
  const main = document.querySelector('#main, [data-testid="conversation-panel-wrapper"]');
  const header = main?.querySelector('header, [data-testid="conversation-header"]');
  if (!header) return { key: '', title: '' };
  for (const selector of ['[data-testid="conversation-info-header-chat-title"]', '[data-testid="conversation-title"]', 'span[title]', '[role="heading"]', 'span[dir="auto"]']) {
    for (const node of header.querySelectorAll(selector)) {
      if (node.closest('[hidden], [aria-hidden="true"]')) continue;
      const title = (node.getAttribute('title') || node.textContent || '').replace(/\s+/g, ' ').trim();
      if (title) return { key: title, title };
    }
  }
  return { key: '', title: '' };
}

const ADAPTERS = [
  {
    match: () => location.host === 'web.whatsapp.com',
    messages: '#main .copyable-text span.selectable-text',
    skip: (el) => !!el.closest('.quoted-mention, [aria-label*="Quoted" i]'),
    composer: '#main footer [contenteditable="true"]',
    sendButton: () => whatsappSend(true),
    chat: whatsappChatIdentity,
    avatar: () => imgSrc('header img[src*="whatsapp"], [aria-label*="profile" i] img, [title*="profile" i] img'),
    mediaSend: () => whatsappSend(false),
  },
  {
    match: () => location.host === 'web.telegram.org',
    messages: '.Message .text-content',
    strip: '.MessageMeta, .Reactions, .message-time, .reactions',
    composer: '#editable-message-text',
    sendButton: '.SendButton, button.send',
    chat: () => ({ key: location.hash, title: textOf('.MiddleHeader .fullName, .MiddleHeader h3') }),
    avatar: telegramAvatar,
    mediaSend: () => document.querySelector('.Modal.open button.Button.primary'),
  },
  {
    match: () => location.host.endsWith('facebook.com') && location.pathname.startsWith('/messages'),
    // Messenger's newer layout puts each message in a data-scope="messages_table" block instead of a row
    messages: '[role="main"] [data-scope="messages_table"] div[dir="auto"], [role="main"] [role="row"] div[dir="auto"]',
    leafOnly: true,
    composer: '[role="main"] [role="textbox"][contenteditable="true"]',
    chat: () => ({ key: location.pathname, title: textOf('[role="main"] h2') }),
    mediaSend: () => 'enter',
  },
  {
    match: () => location.protocol === 'chrome-extension:',
    messages: '[class*="textMessageContent-module__text"]',
    composer: '[class*="chatroomEditor-module__textarea"]',
    chat: () => { const t = textOf('[class*="chatroomHeader-module__name"]'); return { key: t, title: t }; },
    avatar: () => imgSrc('[class*="myProfile"] img, [class*="profile_image"] img, [class*="profileImage"] img'),
    mediaSend: () => 'enter',
  },
];

// Facebook 的头像在页面顶部（不只聊天页），单独处理
const facebookAvatar = () => (location.host.endsWith('facebook.com')
  ? imgSrc('[role="banner"] [aria-label] svg image, [aria-label="Your profile"] image, [aria-label="你的个人主页"] image')
  : null);

const adapter = () => ADAPTERS.find((a) => a.match());
// WhatsApp messages: older pages put "true_/false_" (sent/received) in data-id; newer ones only an id inside a list row,
// so sent messages are told apart by their bubble sitting on the right half of the chat
const WA_MESSAGES = '#main [data-id^="true_"], #main [data-id^="false_"], #main [role="row"] [data-id]';
function waOutgoing(root) {
  const marked = (root.getAttribute('data-id') || '').match(/^(true|false)_/);
  if (marked) return marked[1] === 'true';
  const chat = document.querySelector('#main')?.getBoundingClientRect(), bubble = (root.querySelector('.copyable-text, [aria-label="Voice message"], img[src^="blob:"], video') || root).getBoundingClientRect();
  return !!chat?.width && bubble.width > 0 && bubble.left + bubble.width / 2 > chat.left + chat.width / 2;
}

let backupNativeInput=false;
async function scrollForBackup(el,deltaY,area='history'){
  const marker=Date.now().toString(36)+Math.random().toString(36).slice(2);el.setAttribute('data-blackcat-backup-scroll',marker);
  try{const r=await ipcRenderer.invoke('backup:scroll',{marker,deltaY,area});if(!r.ok)throw Error(r.error);return r.data;}finally{el.removeAttribute('data-blackcat-backup-scroll');}
}

// ---------- 设置 ----------

let cfg = null;                    // { translate, labels }，由宿主页面推送
let chat = { key: '', title: '' };

// 开启“粉丝独立翻译”且当前联系人有单独设置时用联系人的，否则用账号的
function settings() {
  if (!cfg) return null;
  const t = cfg.translate;
  const own = t.perContact && chat.key && t.contacts?.[chat.key];
  return own ? { ...t, incoming: own.incoming, outgoing: own.outgoing } : t;
}

const label = (code) => cfg?.labels?.[code] || code;

ipcRenderer.on('wam:settings', (_e, c) => {
  cfg = c;
  schedule();
  cancelPreview();
  syncComposerHint();
  if (cfg.active && settings()?.realtime) queuePreview();
});

// ---------- 翻译请求（最多 4 个并发） ----------

let running = 0;
const waiting = [];

function request(req) {
  return new Promise((resolve) => {
    waiting.push(async () => {
      running++;
      try {
        resolve(await ipcRenderer.invoke('translate:text', {
          text: req.text, source: req.source, target: req.target, route: req.route,
        }));
      } catch (e) {
        resolve({ ok: false, error: e.message });
      } finally {
        running--;
        pump();
      }
    });
    pump();
  });
}

function pump() {
  while (running < 4 && waiting.length) waiting.shift()();
}

const ENGINE_NAMES = { claude: 'Claude Haiku', google: 'Google 翻译', lingva: 'Lingva' };

// 说明这条译文是谁翻的；前面的引擎失败、改用了后面的引擎时写出原因
function engineNote(r) {
  const name = ENGINE_NAMES[r.engine] || r.engine;
  return r.fallbackFrom ? `已改用 ${name}（原因：${r.fallbackFrom}）` : `由 ${name} 翻译`;
}

// 所有引擎都失败时，每个引擎的原因各占一行
const failureReasons = (error) => String(error || '未知原因').split('；').join('\n');

// ---------- 样式（insertCSS 不受页面 CSP 限制） ----------

webFrame.insertCSS(`
  .wam-tr { display: block; margin-top: 4px; padding-top: 4px; border-top: 1px dashed rgba(128,128,128,.45);
    font-size: .95em; line-height: 1.6; font-weight: 500; color: var(--wam-translation-color, inherit) !important; white-space: pre-wrap; word-break: break-word; user-select: text; }
  .wam-tr.wam-err { color: #8f2418 !important; background: #ffede8; padding: 5px 8px; border-radius: 5px; cursor: pointer; }
  .wam-float { position: fixed; z-index: 2147483647; box-sizing: border-box; padding: 8px 12px; border-radius: 8px;
    background: #fff; color: #1f2329; border: 1px solid #d0d7e2; box-shadow: 0 4px 16px rgba(0,0,0,.15);
    font: 14px/1.5 "Segoe UI", "Microsoft YaHei", sans-serif; white-space: pre-wrap; word-break: break-word; max-height: 40vh; overflow: auto; }
  .wam-float .wam-hint { display: block; margin-bottom: 3px; font-size: 12px; color: #8a919f; }
  .wam-float.wam-err { color: #d4380d; }
  .wam-float[data-theme="dark"] { background: #20242d; color: #eef1f7; border-color: #404858; }
  .wam-float[data-theme="dark"] .wam-hint { color: #b6bece; }
  .wam-send-hint { position: fixed; z-index: 2147483646; color: #697586; background: transparent;
    padding: 0; border: 0; pointer-events: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wam-send-hint[data-theme="dark"] { color: #9ba5b7; }
  [data-wam-placeholder-active]::before { visibility: hidden !important; }
`);

// ---------- 1) 消息翻译 ----------

const state = new WeakMap(); // 消息元素 -> { src, key, pending, node, skip }

function readMessage(el, ad) {
  if (!ad.strip) return el.innerText.trim();
  const copy = el.cloneNode(true);
  copy.querySelectorAll(ad.strip).forEach((n) => n.remove());
  return copy.textContent.trim();
}

// 纯数字 / 符号 / 链接 / 单个字符不翻
// One Chinese/Japanese/Korean character is a whole word (好, 早, 谢); one Latin letter ("k") is not worth translating.
const worth = (t) => (t.length >= 2 || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(t)) && /\p{L}/u.test(t) && !/^https?:\/\/\S+$/.test(t);

function render(el, r, retry) {
  const node = document.createElement('div');
  node.className = r.ok ? 'wam-tr' : 'wam-tr wam-err';
  if (r.ok) syncTranslationAppearance(el, node);
  node.textContent = r.ok ? r.text : '翻译失败，点击重试';
  node.title = r.ok ? engineNote(r) : failureReasons(r.error); // 鼠标停留时显示由谁翻译 / 失败原因
  if (!r.ok) {
    node.addEventListener('click', (e) => { e.stopPropagation(); retry(); });
  }
  el.insertAdjacentElement('afterend', node);
  return node;
}

function syncTranslationAppearance(el, node) {
  // Follow the actual message text, including white text on coloured bubbles.
  // Refresh during scans so native theme changes also update existing results.
  const color = getComputedStyle(el).color;
  if (node.style.getPropertyValue('--wam-translation-color') !== color) node.style.setProperty('--wam-translation-color', color);
}

function scan() {
  const ad = adapter();
  const s = settings();
  if (!ad || !s || !cfg.active) return; // 只翻译正在看的账号，减少请求量（免费接口会限流）
  const inc = s.incoming;
  const key = `${inc.route}|${inc.source}|${inc.target}`;

  for (const el of document.querySelectorAll(ad.messages)) {
    if (el.closest('[contenteditable="true"], textarea, .wam-tr, .wam-float') || ad.skip?.(el)) continue;
    if (ad.leafOnly && el.querySelector(ad.messages)) continue;
    const st = state.get(el);
    if (st?.node?.isConnected && !st.node.classList.contains('wam-err')) syncTranslationAppearance(el, st.node);
    if (!inc.enabled) {
      st?.node?.remove();
      state.delete(el);
      continue;
    }
    const src = readMessage(el, ad);
    // 已处理且没变化：跳过（页面重绘把译文删掉时会重新插入，结果来自缓存）
    const retryDue = st?.failedAt && Date.now() - st.failedAt > 60000;
    if (st && st.src === src && st.key === key && !retryDue && (st.pending || st.skip || st.node?.isConnected)) continue;
    st?.node?.remove();
    if (!worth(src)) {
      state.set(el, { src, key, skip: true });
      continue;
    }
    const entry = { src, key, pending: true };
    state.set(el, entry);
    request({ text: src, ...inc }).then((r) => {
      entry.pending = false;
      if (!r.ok) entry.failedAt = Date.now();
      if (state.get(el) !== entry || !el.isConnected) return;
      if (r.ok && r.same) {
        entry.skip = true; // 本来就是目标语言
        return;
      }
      entry.node = render(el, r, () => {
        entry.node.remove();
        state.delete(el);
        scan();
      });
    });
  }
}

let timer = null;
function schedule() {
  if (!cfg?.active || !settings()?.incoming?.enabled) return;
  if (timer) return;
  timer = setTimeout(() => { timer = null; scan(); }, 300);
}

// 切换聊天时通知宿主（翻译面板显示当前联系人、按联系人取设置）
function watchChat() {
  if (!cfg?.active) return;
  const c = adapter()?.chat() || { key: '', title: '' };
  if (!c.key) c.key = c.title; // 拿不到会话 ID 时用联系人名称区分
  if (c.key !== chat.key || c.title !== chat.title) {
    chat = c;
    ipcRenderer.sendToHost('wam:chat', chat);
    schedule();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const appearanceObserver = new MutationObserver(schedule);
  appearanceObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  if (document.body) appearanceObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  new MutationObserver((muts) => {
    if (!cfg?.active || !settings()?.incoming?.enabled) return;
    // 忽略我们自己插入的译文/浮层引起的变化
    if (muts.every((m) => [...m.addedNodes, ...m.removedNodes].every((n) => n.classList?.contains('wam-tr') || n.classList?.contains('wam-float')))) return;
    schedule();
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setInterval(watchChat, 1000);
  setInterval(schedule, 4000);
  ipcRenderer.sendToHost('wam:ready');
});

// ---------- 2) 发送翻译 / 3) 实时翻译 ----------

const isField = (el) => el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');

function composerOf(target, ad) {
  const box = target?.closest?.('textarea, input, [contenteditable="true"]');
  return box && box.closest(ad.composer) ? box : null;
}

const readBox = (box) => (isField(box) ? box.value : box.innerText).trim();

// 富文本编辑器（Telegram 的 TipTap、WhatsApp/Facebook 的 Lexical）自己保存一份内容，
// 直接改 DOM 时界面变了但发出去的还是原文。模拟“全选 + 粘贴”，编辑器会按粘贴更新自己的内容。
// 直接定位到标记过的输入框并选中它的全部内容，不依赖“当前焦点在哪”（等翻译时用户可能点了别处）
const PASTE_TEXT = (value) => `(async () => {
  const el = document.querySelector('[data-wam-target]');
  if (!el) return null;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  await new Promise((r) => setTimeout(r, 60)); // 等编辑器同步选区
  const dt = new DataTransfer();
  dt.setData('text/plain', ${JSON.stringify(value)});
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 60));
  return el.innerText;
})()`;

const squash = (s) => s.replace(/\s+/g, '');

// 把输入框内容换成 value；返回是否真的换成功（失败时调用方不能发送，否则会发出原文）
async function setBox(box, value) {
  box.focus();
  if (isField(box)) {
    // 用原生 setter 赋值再发 input 事件，React 之类的框架才能感知
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box), 'value').set.call(box, value);
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return squash(box.value) === squash(value);
  }
  box.setAttribute('data-wam-target', '');
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      await webFrame.executeJavaScript(PASTE_TEXT(value)).catch(() => null);
      if (squash(readBox(box)) === squash(value)) return true;
    }
    // 编辑器不接受粘贴时退回旧办法
    box.focus();
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, value);
    return squash(readBox(box)) === squash(value);
  } finally {
    box.removeAttribute('data-wam-target');
  }
}

// 在页面环境里派发回车（keyCode 等属性在隔离环境里改了页面看不到）；
// 期间在 <html> 上打标记，让我们自己的拦截放行
const SEND_ENTER = `(() => {
  const el = document.activeElement;
  if (!el) return;
  const root = document.documentElement;
  root.dataset.wamBypass = '1';
  try {
    for (const type of ['keydown', 'keypress', 'keyup']) {
      const ev = new KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, composed: true });
      for (const [k, v] of [['keyCode', 13], ['which', 13], ['charCode', type === 'keypress' ? 13 : 0]]) Object.defineProperty(ev, k, { get: () => v });
      el.dispatchEvent(ev);
    }
  } finally {
    delete root.dataset.wamBypass;
  }
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 当前页面里真正可输入的那个输入框
function findComposer(ad) {
  const el = document.querySelector(ad.composer);
  if (!el) return null;
  return el.matches('textarea, input, [contenteditable="true"]') ? el : el.querySelector('textarea, input, [contenteditable="true"]');
}

// 输入框上方的浮层：实时预览 / 翻译中 / 出错提示
let floatEl = null;
let floatChat = '';
function showFloat(box, hint, body, isError = false) {
  const ad = adapter();
  if (!box?.isConnected) box = ad && findComposer(ad); // 切换聊天后旧输入框已被替换
  const rc = box?.getBoundingClientRect();
  if (!rc || !rc.width) return hideFloat();
  if (!floatEl) {
    floatEl = document.createElement('div');
    floatEl.className = 'wam-float';
    document.documentElement.appendChild(floatEl);
  }
  floatChat = chat.key;
  floatEl.classList.toggle('wam-err', isError);
  floatEl.dataset.theme = cfg?.theme || 'light';
  floatEl.style.left = `${rc.left}px`;
  floatEl.style.width = `${Math.max(rc.width, 260)}px`;
  floatEl.style.bottom = `${window.innerHeight - rc.top + 28}px`;
  floatEl.innerHTML = '';
  const h = document.createElement('span');
  h.className = 'wam-hint';
  h.textContent = hint;
  floatEl.append(h, document.createTextNode(body));
  floatEl.hidden = false;
}

function hideFloat() {
  if (floatEl) floatEl.hidden = true;
}

let preview = { src: '', result: null };
let busy = false;
let translatedDraft = null;
let composerHint = null;
const englishUi = () => cfg?.locale === 'en';
const sendingHint = (target) => {const shortcut=translationShortcut.normalize(settings()?.shortcut);return shortcut.enabled?(englishUi()?`${shortcut.accelerator}: translate to 【${label(target)}】 · Enter: send`:`${shortcut.accelerator} 翻译成【${label(target)}】 · Enter 发送`):(englishUi()?`Translate message to 【${label(target)}】 and send`:`消息翻译成【${label(target)}】发送`);};
const previewKey = (s) => `${chat.key}|${s?.outgoing?.source}|${s?.outgoing?.target}|${s?.outgoing?.route}`;

let hintedBox = null;
let placeholderAttributes = null;
const mutedPlaceholders = new Map();

function restoreNativePlaceholders() {
  for (const [node, old] of mutedPlaceholders) {
    if (node.style.visibility === 'hidden') node.style.visibility = old;
  }
  mutedPlaceholders.clear();
}

function restoreComposerPlaceholder() {
  restoreNativePlaceholders();
  if (hintedBox && placeholderAttributes) {
    for (const [name, value] of Object.entries(placeholderAttributes)) {
      if (hintedBox.getAttribute(name) !== value.last) continue;
      if (value.original === null) hintedBox.removeAttribute(name);
      else hintedBox.setAttribute(name, value.original);
    }
    hintedBox.removeAttribute('data-wam-placeholder-active');
  }
  hintedBox = null;
  placeholderAttributes = null;
  if (composerHint && !composerHint.hidden) composerHint.hidden = true;
}

function muteNativePlaceholders(box) {
  const known = new Set(['Aa', 'Message', 'Message…', 'Type a message', 'Write a message…', 'Write a message...', '消息', '输入消息', '输入消息…', '輸入訊息']);
  for (const record of Object.values(placeholderAttributes || {})) if (record.original) known.add(record.original.trim());
  const scope = box.parentElement;
  if (!scope) return;
  for (const node of scope.querySelectorAll('span, div, [data-placeholder], [class*="placeholder" i]')) {
    if (node === box || node.contains(box) || box.contains(node) || node.childElementCount || node.matches('button, [role="button"], [contenteditable="true"]')) continue;
    if (!known.has(node.textContent.trim())) continue;
    if (!mutedPlaceholders.has(node)) mutedPlaceholders.set(node, node.style.visibility);
    if (node.style.visibility !== 'hidden') node.style.visibility = 'hidden';
  }
}

function syncComposerHint() {
  const s = settings();
  const ad = adapter();
  const box = ad && findComposer(ad);
  if (!cfg?.active || !s?.outgoing?.enabled || !box?.isConnected) { restoreComposerPlaceholder(); return; }
  const hasText = isField(box) ? box.value.length > 0 : box.textContent.replace(/\u200b/g, '').length > 0;
  if (hasText) { restoreComposerPlaceholder(); return; }
  if (hintedBox !== box) {
    restoreComposerPlaceholder();
    hintedBox = box;
    placeholderAttributes = Object.fromEntries(['placeholder', 'data-placeholder', 'aria-placeholder'].map((name) => [name, { original: box.getAttribute(name), last: box.getAttribute(name) }]));
  }
  const text = sendingHint(s.outgoing.target);
  for (const [name, record] of Object.entries(placeholderAttributes)) {
    if (name === 'placeholder' && !isField(box)) continue;
    const value = box.getAttribute(name);
    if (value !== record.last) record.original = value;
    if (value !== text) box.setAttribute(name, text);
    record.last = text;
  }
  if (isField(box)) {
    if (composerHint && !composerHint.hidden) composerHint.hidden = true;
    restoreNativePlaceholders();
    box.removeAttribute('data-wam-placeholder-active');
    return;
  }
  const rc = box.getBoundingClientRect();
  if (!rc.width || !rc.height) { if (composerHint && !composerHint.hidden) composerHint.hidden = true; return; }
  if (!box.hasAttribute('data-wam-placeholder-active')) box.setAttribute('data-wam-placeholder-active', '');
  muteNativePlaceholders(box);
  if (!composerHint) {
    composerHint = document.createElement('div');
    composerHint.className = 'wam-send-hint';
    composerHint.setAttribute('aria-hidden', 'true');
    document.documentElement.appendChild(composerHint);
  }
  const style = getComputedStyle(box);
  const padLeft = parseFloat(style.paddingLeft) || 0;
  const padTop = parseFloat(style.paddingTop) || 0;
  const padRight = parseFloat(style.paddingRight) || 0;
  if (composerHint.textContent !== text) composerHint.textContent = text;
  if (composerHint.dataset.theme !== (cfg?.theme || 'light')) composerHint.dataset.theme = cfg?.theme || 'light';
  const values = {
    left: `${rc.left + padLeft}px`, top: `${rc.top + padTop}px`, bottom: 'auto',
    width: `${Math.max(0, rc.width - padLeft - padRight)}px`, maxHeight: `${Math.max(0, rc.height - padTop)}px`,
    fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
    lineHeight: style.lineHeight === 'normal' ? '1.4' : style.lineHeight,
  };
  for (const [name, value] of Object.entries(values)) if (composerHint.style[name] !== value) composerHint.style[name] = value;
  if (composerHint.hidden) composerHint.hidden = false;
}

setInterval(syncComposerHint, 800);
document.addEventListener('scroll', syncComposerHint, { capture: true, passive: true });
window.addEventListener('resize', syncComposerHint);


// 浮层只在“正在翻译”或输入框里还有对应内容时显示；发送、清空、切换聊天后自动收起
setInterval(() => {
  if (!floatEl || floatEl.hidden || busy || floatEl.classList.contains('wam-err')) return;
  const ad = adapter();
  const box = ad && findComposer(ad);
  if (!box || !readBox(box) || chat.key !== floatChat) hideFloat();
}, 500);

// 有发送按钮就点按钮（Telegram 不响应模拟回车），没有再模拟回车；点了没发出去也再补一次回车
let ourClick = false;
async function send(box, ad) {
  box.focus();
  const btn = findSendButton(ad);
  if (btn) {
    ourClick = true;
    try {
      press(btn.closest('button, [role="button"]') || btn);
    } finally {
      ourClick = false;
    }
    await sleep(400);
    if (!readBox(box)) return;
    box.focus();
  }
  await webFrame.executeJavaScript(SEND_ENTER);
}

// Manual shortcut mode fills the editor for review; it never sends a message.
async function translateAndSend(box, ad, s, original, translateOnly = false) {
  if (busy) return;
  busy = true;
  try {
    if (original) { translatedDraft=null;hideFloat();await send(box, ad);return; }
    const src=readBox(box),key=previewKey(s);
    clearTimeout(previewTimer);const generation=++previewGeneration;
    showFloat(box,englishUi()?'Translating…':'正在翻译…','');
    const r=preview.src===src&&preview.key===key&&preview.result?.ok?preview.result:await request({text:src,...s.outgoing});
    const current=()=>generation===previewGeneration&&box.isConnected&&cfg?.active&&settings()?.outgoing?.enabled&&previewKey(settings())===key;
    if(!current()||readBox(box)!==src){hideFloat();return;}
    if(!r.ok){showFloat(box,englishUi()?'Translation failed. Nothing was sent.':'翻译失败，消息未发送',failureReasons(r.error),true);return;}
    const text=r.same?src:r.text;
    if(typeof text!=='string'||!text.trim()){showFloat(box,englishUi()?'Translation was empty. Nothing was sent.':'译文为空，消息未发送','',true);return;}
    preview={src:'',result:null};
    if(!r.same&&!(await setBox(box,text))){showFloat(box,englishUi()?'Could not fill the translation. Nothing was sent.':'没能把译文放进输入框，消息未发送','',true);return;}
    if(!current()||readBox(box)!==text.trim()){hideFloat();return;}
    if(translateOnly){
      translatedDraft={box,text:readBox(box),key};
      showFloat(box,englishUi()?'Translation ready · Press Enter to send':'已翻译，按 Enter 发送',readBox(box));
      return;
    }
    translatedDraft=null;hideFloat();await send(box,ad);
  } finally {busy=false;}
}

window.addEventListener('keydown',e=>{
  if(document.documentElement.dataset.wamBypass||e.isComposing||e.keyCode===229)return;
  const ad=adapter(),s=settings();
  if(!ad||!cfg?.active||!s?.outgoing?.enabled)return;
  const box=composerOf(e.target,ad);if(!box)return;
  if(translationShortcut.matches(e,s.shortcut)){
    e.preventDefault();e.stopImmediatePropagation();
    if(!e.repeat&&readBox(box))translateAndSend(box,ad,s,false,true);
    return;
  }
  if(e.key!=='Enter'||e.shiftKey||e.ctrlKey||e.metaKey||!readBox(box))return;
  e.preventDefault();e.stopImmediatePropagation();
  if(!e.repeat)translateAndSend(box,ad,s,e.altKey||translationShortcut.normalize(s.shortcut).enabled);
},true);

window.addEventListener('click',e=>{
  if(ourClick||!e.isTrusted)return;
  const ad=adapter(),s=settings();
  if(!ad?.sendButton||!s?.outgoing?.enabled||!findSendButton(ad)?.contains(e.target))return;
  const box=findComposer(ad);if(!box||!readBox(box))return;
  e.preventDefault();e.stopImmediatePropagation();
  translateAndSend(box,ad,s,e.altKey||translationShortcut.normalize(s.shortcut).enabled);
},true);

let previewTimer = null;
let previewGeneration = 0;
let observedPreview = '';
let observedBox = null;

function cancelPreview() {
  clearTimeout(previewTimer);
  previewGeneration++;
  observedPreview = '';
  observedBox = null;
  translatedDraft = null;
  preview = { src: '', result: null };
  hideFloat();
}

function queuePreview(target) {
  if(translatedDraft){const draft=translatedDraft;if(draft.box.isConnected&&readBox(draft.box)===draft.text&&previewKey(settings())===draft.key)return;translatedDraft=null;hideFloat();}
  const ad = adapter();
  const s = settings();
  if (!ad || !cfg?.active || !s?.realtime || busy) return;
  const box = target ? composerOf(target, ad) : findComposer(ad);
  if (!box) return;
  const src = readBox(box);
  const key = previewKey(s);
  const observed = `${key}|${src}`;
  if (observedPreview === observed && observedBox === box) return;
  observedPreview = observed;
  observedBox = box;
  clearTimeout(previewTimer);
  const generation = ++previewGeneration;
  if (!src) { preview = { src: '', result: null }; hideFloat(); return; }
  previewTimer = setTimeout(async () => {
    if (generation !== previewGeneration || !settings()?.realtime || !cfg?.active || !box.isConnected) return;
    showFloat(box, englishUi() ? 'Translating live…' : '实时翻译中…', '');
    const r = await request({ text: src, ...s.outgoing });
    if (generation !== previewGeneration || !cfg?.active || !settings()?.realtime || !box.isConnected || readBox(box) !== src || busy || previewKey(settings()) !== key) return;
    preview = { src, result: r, key };
    if (!r.ok) return showFloat(box, englishUi() ? 'Live translation failed:' : '实时翻译失败，原因：', failureReasons(r.error), true);
    const hint = s.outgoing.enabled ? (englishUi() ? `Live translation 【${label(s.outgoing.target)}】` : `实时译文【${label(s.outgoing.target)}】`) : (englishUi() ? `Live preview 【${label(s.outgoing.target)}】 · Send translation is off` : `实时预览【${label(s.outgoing.target)}】· 发送翻译已关闭`);
    showFloat(box, hint, r.text || src);
  }, 350);
}

document.addEventListener('input', (e) => { syncComposerHint(); queuePreview(e.target); }, true);
document.addEventListener('compositionend', (e) => queuePreview(e.target), true);
document.addEventListener('focusin', (e) => queuePreview(e.target), true);
setInterval(() => { if (cfg?.active && settings()?.realtime) queuePreview(); }, 400);


// ---------- 4) 快捷回复：先发文字，再把文件（照片/视频/其他）粘贴进聊天并确认发送 ----------

async function waitFor(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(200);
  }
  return null;
}

async function quickSend({ text, files, translate, expectedChatKey, expectedWhatsApp }) {
  const verifyCustomer=async()=>{if(expectedWhatsApp)await whatsappUsernameFlow.verify(expectedWhatsApp);if(expectedChatKey){const current=blackcatInboxBridge.snapshot(true)?.conversation;if(current?.key!==expectedChatKey||current.ambiguous)throw Error('客户已变化，已取消发送；请核对实际聊天记录');}};
  await verifyCustomer();
  const ad = adapter();
  if (!ad) return { ok: false, error: '当前页面不支持快捷回复' };
  let box = findComposer(ad);
  if (!box) return { ok: false, error: '请先打开一个聊天' };

  if((expectedChatKey||expectedWhatsApp)&&readBox(box))return{ok:false,error:'输入框有未发送草稿，已取消发送'};
  async function sendCurrent(currentBox){
    if(!expectedWhatsApp)return send(currentBox,ad);
    await verifyCustomer();currentBox.focus();const button=findSendButton(ad);ourClick=true;
    try{if(button)press(button.closest('button,[role="button"]')||button);else await webFrame.executeJavaScript(SEND_ENTER);}finally{ourClick=false;}
    await sleep(1000);await verifyCustomer();if(readBox(currentBox).trim())throw Error('发送结果未确认，请检查聊天记录；不会自动重发');
  }
  let msg = (text || '').trim();
  if (msg && translate) {
    const s = settings();
    const r = await request({ text: msg, ...(s?.outgoing || { source: 'auto', target: 'en', route: 'auto' }) });
    if (!r.ok) return { ok: false, error: `翻译失败：${r.error}` };
    if (!r.same) msg = r.text;
  }
  if (msg) {
    await verifyCustomer();
    if (!(await setBox(box, msg))) return { ok: false, error: '没能把文字放进输入框，未发送' };
    await verifyCustomer();
    await sendCurrent(box);
    await sleep(800);
  }

  if (files?.length) {
    const list = await Promise.all(files.map((f) => ipcRenderer.invoke('quick:read-file', f)));
    const missing = list.filter((f) => !f.ok);
    if (missing.length) return { ok: false, error: `文件不存在：${missing.map((f) => f.name).join('、')}` };
    await verifyCustomer();
    const dt = new DataTransfer();
    for (const f of list) dt.items.add(new File([f.data], f.name, { type: f.type }));
    box = findComposer(ad) || box;
    box.focus();
    box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    // 平台会弹出发送预览窗口，等它出现后点发送；找不到就留给用户手动点
    const confirm = await waitFor(() => ad.mediaSend?.(), 8000);
    if (!confirm) return { ok: true, note: '文件已放进发送窗口，请手动点发送' };
    await verifyCustomer();
    if (confirm === 'enter') {
      await sleep(600);
      await verifyCustomer();
      await sendCurrent(findComposer(ad) || box);
    } else {
      // 预览窗口刚弹出时发送按钮可能还没准备好：按完确认窗口关了，没关就再按，最多 3 次
      let closed = false;
      for (let i = 0; i < (expectedWhatsApp?1:3) && !closed; i++) {
        await sleep(i ? 1200 : 600);
        const btn = ad.mediaSend?.();
        if (!btn || btn === 'enter') {
          closed = true;
          break;
        }
        await verifyCustomer();
        press(btn);
        closed = !!(await waitFor(() => !ad.mediaSend?.(), 1500));
      }
      if (!closed) return { ok: false, error: '附件发送窗口没有关闭，请手动点发送' };
    }
  }
  return { ok: true };
}

ipcRenderer.on('wam:quick-send', async (_e, job) => {
  let result;
  try {
    result = await quickSend(job);
  } catch (e) {
    result = { ok: false, error: e.message };
  }
  ipcRenderer.sendToHost('wam:quick-result', result);
});

// ---------- 5) 自己的头像：找到后缩小成 64px 发给宿主，显示在会话卡片上 ----------

async function toSmallDataUrl(src) {
  let url = src;
  if (!src.startsWith('data:') && !src.startsWith('blob:')) {
    url = await ipcRenderer.invoke('avatar:fetch', src); // 跨域图片交给主进程用本账号的 session 下载
    if (!url) return null;
  }
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  c.getContext('2d').drawImage(img, 0, 0, 64, 64);
  return c.toDataURL('image/jpeg', 0.85);
}

let lastAvatar = '';
async function watchAvatar() {
  if (!cfg?.active) return;
  try {
    const src = (await adapter()?.avatar?.()) || facebookAvatar();
    if (!src) return;
    const data = await toSmallDataUrl(src);
    if (src.startsWith('blob:')) URL.revokeObjectURL(src);
    if (data && data !== lastAvatar) {
      lastAvatar = data;
      ipcRenderer.sendToHost('wam:avatar', data);
    }
  } catch { /* 下次再试 */ }
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(watchAvatar, 5000);
  setInterval(watchAvatar, 60000);
});

// ---------- 6) 账号信息 / 联系人 / 群发（仅 WhatsApp、Telegram） ----------

const isTelegram = () => location.host === 'web.telegram.org';
const isWhatsApp = () => location.host === 'web.whatsapp.com';

function setInputValue(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function idbGetAll(dbName, storeName) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        return reject(new Error(`找不到数据表 ${storeName}`));
      }
      const req = db.transaction(storeName).objectStore(storeName).getAll();
      req.onsuccess = () => { db.close(); resolve(req.result); };
      req.onerror = () => { db.close(); reject(req.error); };
    };
  });
}

// Telegram 网页版把用户、联系人缓存在 IndexedDB tt-data / store / tt-global-state
async function telegramState() {
  const open = indexedDB.open('tt-data');
  const db = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
  try {
    return await new Promise((resolve) => {
      const req = db.transaction('store').objectStore('store').get('tt-global-state');
      req.onsuccess = () => {
        let v = req.result;
        if (typeof v === 'string') try { v = JSON.parse(v); } catch { v = null; }
        resolve(v);
      };
      req.onerror = () => resolve(null);
    });
  } finally {
    db.close();
  }
}

const tgUsername = (u) => (u?.usernames?.find((x) => x.isActive) || u?.usernames?.[0])?.username || '';
const tgName = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ');

// 自己的账号：Telegram 用 username（没有就用手机号），WhatsApp 用手机号
async function selfInfo() {
  if (isTelegram()) {
    const g = await telegramState();
    const id = g?.currentUserId || JSON.parse(localStorage.getItem('user_auth') || '{}').id;
    const me = g?.users?.byId?.[id];
    if (!me) return null;
    return { username: tgUsername(me), phone: me.phoneNumber || '' };
  }
  if (isWhatsApp()) {
    const raw = localStorage.getItem('last-wid-md') || localStorage.getItem('last-wid') || '';
    const phone = (raw.replace(/"/g, '').match(/^(\d{6,})/) || [])[1];
    return phone ? { phone } : null;
  }
  return null;
}

async function listContacts() {
  if (isTelegram()) {
    const g = await telegramState();
    if (!g?.contactList) throw new Error('还没加载到 Telegram 联系人，请稍后再试');
    return g.contactList.userIds.map((id) => g.users.byId[id]).filter(Boolean).map((u) => ({
      username: tgUsername(u), phone: u.phoneNumber || '', name: tgName(u),
    }));
  }
  if (isWhatsApp()) {
    // 新版 WhatsApp 的联系人 id 多为 @lid（不含号码），号码在 phoneNumber 字段；同一个人可能有两条记录，按号码去重
    const rows = await idbGetAll('model-storage', 'contact');
    const byPhone = new Map();
    for (const c of rows) {
      if (!c.isAddressBookContact && !c.name) continue;
      const id = String(c.id || '');
      const src = c.phoneNumber || (/@(c\.us|s\.whatsapp\.net)$/.test(id) ? id : '');
      const phone = String(src).split('@')[0].replace(/\D/g, '');
      if (phone.length < 6) continue;
      const name = c.name || c.shortName || c.pushname || '';
      if (!byPhone.has(phone) || (!byPhone.get(phone).name && name)) byPhone.set(phone, { phone, name });
    }
    return [...byPhone.values()];
  }
  throw new Error('当前平台不支持读取联系人');
}

let lastSelf = '';
async function watchSelf() {
  if (!cfg?.active) return;
  try {
    const info = await selfInfo();
    const key = JSON.stringify(info);
    if (info && key !== lastSelf) {
      lastSelf = key;
      ipcRenderer.sendToHost('wam:self', info);
    }
  } catch { /* 还没登录 */ }
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(watchSelf, 6000);
  setInterval(watchSelf, 30000);
});

ipcRenderer.on('wam:get-contacts', async (_e, reqId) => {
  try {
    ipcRenderer.sendToHost('wam:contacts', { reqId, ok: true, list: await listContacts() });
  } catch (e) {
    ipcRenderer.sendToHost('wam:contacts', { reqId, ok: false, error: e.message });
  }
});

// ----- 群发：打开对方聊天 → 发送文字和附件 -----

// Telegram：在左侧搜索框搜 @username（或手机号），优先点用户名完全一致的结果；
// 打开后用缓存里的用户资料核对用户名，对不上就不发
async function telegramOpenChat(target) {
  const isPhone = /^\+?\d[\d\s-]{5,}$/.test(target);
  const query = isPhone ? target.replace(/[^\d]/g, '') : `@${target.replace(/^@/, '')}`;
  const wanted = isPhone ? null : query.slice(1).toLowerCase();
  const input = document.querySelector('#telegram-search-input');
  if (!input) throw new Error('找不到 Telegram 搜索框（请确认已登录）');

  const results = () => [...document.querySelectorAll('#LeftColumn .LeftSearch .ListItem.search-result')].filter((li) => li.offsetParent);
  const exact = () => wanted && results().find((li) => li.querySelector('.handle')?.textContent.trim().toLowerCase() === wanted);
  let pick = null;
  let exactHit = false; // 用户名完全一致
  // 刚打开 Telegram 时第一次搜索偶尔没有结果，清空后重试一次
  for (let attempt = 0; attempt < 2 && !pick; attempt++) {
    if (attempt) {
      setInputValue(input, '');
      await sleep(800);
    }
    input.focus();
    await sleep(600); // 等搜索模式打开，否则输入会被清空
    setInputValue(input, query);
    pick = await waitFor(exact, 4000);
    exactHit = !!pick;
    if (!pick) pick = await waitFor(() => results()[0], 4000);
  }
  if (!pick) throw new Error(isPhone ? '找不到这个手机号（Telegram 只能搜到联系人的手机号）' : '找不到这个用户名');
  const before = location.hash;
  press(pick.querySelector('.ListItem-button') || pick);
  await waitFor(() => location.hash && location.hash !== before && findComposer(adapter()), 8000);

  // 宁可跳过也不发错人：搜索结果的用户名不是完全一致时，必须能从资料里确认打开的就是这个用户名
  const peerId = location.hash.replace(/^#/, '');
  if (wanted && !exactHit) {
    const user = (await telegramState())?.users?.byId?.[peerId];
    const names = (user?.usernames || []).map((u) => u.username.toLowerCase());
    if (!names.includes(wanted)) throw new Error(`无法确认搜索结果就是 @${wanted}，已跳过（没有发送）`);
  }
  if (!findComposer(adapter())) throw new Error('无法给该用户发消息（对方隐私设置或已拉黑）');
}

// WhatsApp：用 /send?phone= 打开聊天（页面会重新加载），任务暂存在 sessionStorage，加载完继续
const BULK_KEY = 'wamBulkJob';
async function readWhatsAppRecipientState(){return Promise.race([webFrame.executeJavaScript(CLIENT_STATE_SCRIPT).catch(()=>({available:false})),new Promise(resolve=>setTimeout(()=>resolve({available:false}),3000))]);}
const whatsappUsernameFlow=createWhatsAppUsernameFlow({document,getState:readWhatsAppRecipientState,getComposer:()=>findComposer(adapter()),readText:readBox,fillText:setBox,click:press,pause:sleep,waitFor});

async function whatsappContinue(job) {
  const invalid = () => [...document.querySelectorAll('[role="dialog"], [data-animate-modal-popup="true"]')]
    .find((d) => /invalid|无效|不正确|isn.t on WhatsApp|不在 WhatsApp/i.test(d.innerText));
  // 先等 WhatsApp 加载完（正常约 8 秒），再等聊天打开。
  // 号码无效时新版 WhatsApp 不弹窗：有时停在空白页不加载，有时加载完但不打开聊天
  const loaded = await waitFor(() => document.querySelector('#pane-side') || invalid(), 40000);
  if (!loaded) {
    const err = new Error('号码无效或未注册 WhatsApp（页面没有加载）');
    err.reloadHome = true;
    throw err;
  }
  const ready = await waitFor(() => invalid() || findComposer(adapter()), 15000);
  const bad = invalid();
  if (bad) {
    bad.querySelector('button, [role="button"]')?.click();
    throw new Error('号码无效或未注册 WhatsApp');
  }
  if (!ready) throw new Error('号码无效或未注册 WhatsApp（聊天没有打开）');
  await sleep(800);
}

async function runBulkJob(job) {
  let proof;
  if (isTelegram()) await telegramOpenChat(job.target);
  else if (isWhatsApp()) {const recipient=recipientAddress.whatsapp(job.target,job.usernameKey);if(recipient.kind==='username'){proof=await whatsappUsernameFlow.open({...recipient,deadline:job.deadline});proof.deadline=job.deadline||Date.now()+120000;await whatsappUsernameFlow.verify(proof);}else await whatsappContinue(job);}
  else throw new Error('当前平台不支持群发');
  if(job.dryRun)return{note:'收件人已核对，未发送消息',dryRun:true};
  const result=await quickSend({text:job.text,files:job.files,translate:false,...(proof?{expectedWhatsApp:proof}:{})});if(!result.ok)throw Error(result.error);if(proof&&/手动/.test(result.note||''))throw Error('文字可能已发送，附件仍待手动确认；请检查聊天记录，不会自动重发');return result;
}

async function finishBulkJob(job) {
  let result;
  let reloadHome = false;
  try {
    result = { ok: true, ...(await runBulkJob(job)) };
  } catch (e) {
    result = { ok: false, error: e.message };
    reloadHome = !!e.reloadHome;
  }
  ipcRenderer.sendToHost('wam:bulk-result', { jobId: job.jobId, ...result });
  // WhatsApp 卡在空白页时重新正常打开，免得一直空白
  if (reloadHome) setTimeout(() => { location.href = 'https://web.whatsapp.com/'; }, 300);
}

ipcRenderer.on('wam:bulk-job', (_e, job) => {
  if (isWhatsApp()) {
    let recipient;try{recipient=recipientAddress.whatsapp(job.target,job.usernameKey);}catch(error){ipcRenderer.sendToHost('wam:bulk-result',{jobId:job.jobId,ok:false,error:error.message});return;}if(recipient.kind==='username'){finishBulkJob({...job,...recipient});return;}
    const digits = recipient.target;
    if (!digits) {
      ipcRenderer.sendToHost('wam:bulk-result', { jobId: job.jobId, ok: false, error: '电话号码为空或格式不对' });
      return;
    }
    sessionStorage.setItem(BULK_KEY, JSON.stringify(job));
    location.href = `https://web.whatsapp.com/send?phone=${digits}`;
    return;
  }
  finishBulkJob(job);
});

window.addEventListener('DOMContentLoaded', () => {
  const pending = sessionStorage.getItem(BULK_KEY);
  if (!pending) return;
  sessionStorage.removeItem(BULK_KEY);
  finishBulkJob(JSON.parse(pending));
});


// Unified inbox bridge: rendered conversation data only; no credentials or private HTTP APIs.
function installInboxBridge(deps) {
  const { ipc, getConfig, getAdapter, getComposer, getBoxText, putBoxText, click, pause, sendOnce, isSending, getDirectory } = deps;
  let backupRequest=null;const cancelledBackupRequests=new Set();ipc.on('wam:backup-cancel',(_e,r)=>{if(backupRequest===r?.requestId)cancelledBackupRequests.add(r.requestId);});
  const checkBackup=()=>{if(backupRequest&&cancelledBackupRequests.has(backupRequest))throw Error('扫描已停止');};
  const digest = (text) => { let h = 2166136261; for (const c of String(text)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const plain = (element, strip = '') => {
    if (!element) return '';
    const copy = element.cloneNode(true);
    copy.querySelectorAll('.wam-tr,.wam-float,.wam-send-hint,script,style').forEach((n) => n.remove());
    if (strip) copy.querySelectorAll(strip).forEach((n) => n.remove());
    return (copy.textContent || '').replace(/\s+/g, ' ').trim();
  };
  function platform() {
    if (location.host === 'web.whatsapp.com') return 'whatsapp';
    if (location.host === 'web.telegram.org') return 'telegram';
    if (location.host.endsWith('facebook.com') && location.pathname.startsWith('/messages')) return 'facebook';
    if (location.protocol === 'chrome-extension:') return 'line';
    return '';
  }
  const selectors = {
    whatsapp: '#pane-side [role="row"], #pane-side [role="listitem"]',
    telegram: '.chat-list .ListItem, .chatlist .ListItem, .ListItem.Chat, .chatlist-chat, [data-chat-id]',
    facebook: 'a[href*="/messages/t/"], a[href*="/messages/e2ee/t/"]',
    line: '[class*="chatListItem" i], [class*="chatList-module__item" i], [data-chat-id]',
  };
  const comparableTitle=value=>String(value||'').replace(/[‎‏‪-‮⁦-⁩]/g,'').replace(/\s+/g,' ').trim();
  const threadRoute=value=>String(value||'').replace(/\/messages\/(?:e2ee\/)?t\/([^/?#]+).*/, '/messages/t/$1');
  const sameThread=(a,b)=>threadRoute(a)===threadRoute(b);
  let lastOpened = null;
  let lastSnapshot = '';
  let lastRows = new Map();
  let lastThread = null;
  let watching = false;
  let lastTop = '';
  let scrollQuietAfter = 0;
  const rowNodes = new Map();
  function recentClock(value) {
    const m = String(value).match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i); if (!m) return false;
    let hours = Number(m[1]); const minutes = Number(m[2]); if (minutes > 59 || hours > (m[3] ? 12 : 23)) return false;
    if (m[3]) hours = hours % 12 + (/PM/i.test(m[3]) ? 12 : 0);
    const now = new Date(); const diff = (now.getHours() * 60 + now.getMinutes() - hours * 60 - minutes + 1440) % 1440;
    return diff <= 1;
  }
  function privateType(row, key) {
    const explicit = row?.closest?.('[data-chat-type]')?.getAttribute('data-chat-type');
    if (explicit === 'private' || explicit === 'user') return true;
    if (explicit === 'group' || explicit === 'channel') return false;
    if (/@g\.us|@broadcast/.test(key)) return false;
    if (/@(?:c\.us|s\.whatsapp\.net|lid)/.test(key)) return true;
    if (platform() === 'telegram') {
      const peer = key.replace(/^.*#/, '');
      if (/^-\d+$/.test(peer)) return false;
      if (/^\d+$/.test(peer)) return true;
    }
    if (row?.querySelector?.('[data-icon*="group"], [aria-label*="group" i], [aria-label*="群组"], [class*="groupIcon" i]')) return false;
    if (platform() === 'facebook') {
      const main = document.querySelector('[role="main"]');
      if (main?.querySelector('[aria-label*="members" i], [aria-label*="群成员"], [aria-label*="group details" i]')) return false;
      const profile = main?.querySelector('h2 a[href], header a[href], a[href*="profile.php?id="]');
      if (profile) { try { const url = new URL(profile.getAttribute('href'), location.href); if (url.hostname.endsWith('facebook.com') && !/^\/(messages|groups|login)/.test(url.pathname)) return true; } catch {} }
    }
    return null;
  }
  // Telegram Web A now scrambles its class names. Its chat badges sit in .chat-badge-transition: a number pill
  // (green = unread, grey = muted chat), or a pin / @mention icon. Muted chats count as 0, like Telegram's own total.
  function telegramBadge(row) {
    const box = row.querySelector('.chat-badge-transition');
    if (!box) return null;
    let unread = 0, muted = false;
    for (const el of box.querySelectorAll('span, div')) {
      const m = (el.childElementCount ? '' : el.textContent.trim()).match(/^(\d+(?:[.,]\d+)?)\s*([KkMm])?$/);
      if (!m) continue;
      unread = Math.min(9999, Math.round(Number(m[1].replace(',', '.')) * (m[2] ? (/k/i.test(m[2]) ? 1e3 : 1e6) : 1)));
      const [r, g, b, alpha = 1] = (getComputedStyle(el.closest('.chat-badge-transition div') || el).backgroundColor.match(/[\d.]+/g) || []).map(Number);
      muted = Number.isFinite(r) && alpha > 0 && Math.max(r, g, b) - Math.min(r, g, b) < 30;
    }
    return { unread: unread || (box.querySelector('.icon-mention') ? 1 : 0), muted };
  }
  function conversationRows(allRows = false) {
    const p = platform();
    if (!p) return [];
    const result = []; const seen = new Set(); rowNodes.clear();
    for (const row of document.querySelectorAll(selectors[p])) {
      if (allRows && !row.getClientRects().length) continue;
      if (row.closest('header, [contenteditable="true"], .wam-float')) continue;
      let titleNode = row.querySelector(p === 'whatsapp' ? 'span[title], [dir="auto"]' : p === 'telegram' ? '.fullName, h3, .title, [class*="title"]' : p === 'facebook' ? '[dir="auto"], span' : '[class*="name" i], [class*="title" i]');
      if(p==='facebook') { const candidates=[...row.querySelectorAll('[dir="auto"],span')].filter(n=>!n.querySelector('span,[dir="auto"]'));titleNode=candidates.find(n=>{const value=plain(n);return value&&!/^(?:Active now|Active \d|Message request|现在在线|刚刚活跃|消息请求|\d+\s*(?:min|hr|天|分钟)|[·•])(?:$|\b)/i.test(value);})||titleNode; }
      const title = (titleNode?.getAttribute('title') || plain(titleNode) || plain(row).split('\n')[0]).trim().slice(0, 150);
      if (!title) continue;
      const link = row.matches('a[href]') ? row : row.querySelector('a[href]');
      let href = link?.getAttribute('href') || '';
      const dataId = row.getAttribute('data-chat-id') || row.getAttribute('data-peer-id') || row.getAttribute('data-id') || '';
      let key = dataId || href || `title:${title}`;
      if (p === 'facebook' && href) { try { key = new URL(href, location.href).pathname; } catch {} }
      if (p === 'facebook' && !/^\/messages\/(?:e2ee\/)?t\/[^/]+\/?$/.test(key)) continue;
      if (p === 'telegram' && href.includes('#')) key = href.slice(href.indexOf('#'));
      if (seen.has(key)) { if (String(key).startsWith('title:')) { const old = result.find(r => r.key === key); if (old) old.ambiguous = true; } continue; }
      seen.add(key);
      // Prefer the actual text to its subtitle container (which includes an
      // unread badge), and never mistake LastMessageMeta for message content.
      const previewNode = row.querySelector('.last-message-summary, .last-message') || row.querySelector('.subtitle, [class*="preview" i], [class*="text-secondary" i]');
      const lines = (row.innerText || row.textContent || '').split('\n').map((s) => s.trim()).filter((s) => s && s !== title);
      const previewText = plain(previewNode, '[class*="unread" i], .badge, .Badge, .LastMessageMeta, .last-message-meta, time') || lines.filter((s) => !/^\d{1,2}:\d{2}(?:\s*[AP]M)?$/i.test(s) && !/^\d+$/.test(s)).slice(-1)[0] || '';
      const preview = (/^\d{1,2}:\d{2}(?:\s*[AP]M)?$/i.test(previewText) ? '' : previewText).slice(0, 500);
      const messageStamp = plain(row.querySelector('.LastMessageMeta .time, time'));
      const badge = row.querySelector('[aria-label*="unread" i], [aria-label*="未读"], [class*="unread" i], .badge, [data-unread-count]');
      const unreadText = badge?.getAttribute('data-unread-count') || badge?.getAttribute('aria-label') || plain(badge);
      const tg = p === 'telegram' && !badge ? telegramBadge(row) : null;
      const unread = tg ? (tg.muted ? 0 : tg.unread) : badge ? Math.min(9999, Number((unreadText?.match(/\d+/) || [])[0]) || 1) : 0;
      const ref = { key: String(key).slice(0, 400), title, href: href.slice(0, 1000), dataId: dataId.slice(0, 400), privateChat: privateType(row, String(key)) };
      rowNodes.set(ref.key, row);
      result.push({ ...ref, preview, messageStamp, unread, updatedAt: Date.now() });
      if (!allRows && result.length >= 200) break;
    }
    return result;
  }
  function currentRef(rows = conversationRows()) {
    const ad = getAdapter();
    if (!ad) return null;
    const current = ad.chat?.() || {};
    const sameOpened = lastOpened && (platform() === 'facebook' ? sameThread(location.pathname,lastOpened.key) : platform() === 'telegram' ? location.hash === lastOpened.key : current.title && comparableTitle(current.title) === comparableTitle(lastOpened.title));
    if (sameOpened) { const { updatedAt, ...live } = rows.find((r) => r.key === lastOpened.key) || {}; const { updatedAt: ignored, ...identity } = lastOpened; return { ...identity, ...live }; }
    if (platform() === 'facebook') return { key: location.pathname, title: current.title || rows.find((r) => r.key === location.pathname)?.title || '', privateChat: privateType(document.querySelector('[role="main"]'), location.pathname) };
    if (platform() === 'telegram' && location.hash) return { key: location.hash, title: current.title || rows.find((r) => r.key === location.hash)?.title || '', privateChat: privateType(document.querySelector('#MiddleColumn, .MiddleColumn, .middle-column'), location.hash) };
    const matches = rows.filter((r) => comparableTitle(r.title) === comparableTitle(current.title));
    if (matches.length === 1) return { ...matches[0] };
    return current.title ? { key: `title:${current.title}`, title: current.title, privateChat: null } : null;
  }
  function direction(element) {
    const explicit = element.closest('[data-direction]')?.getAttribute('data-direction');
    if (['incoming', 'outgoing'].includes(explicit)) return explicit;
    if (element.closest('.message-out, .Message.own, .Message.is-outgoing, [data-is-outgoing="true"], [class*="messageOwn" i], [class*="message-out" i]')) return 'outgoing';
    if (element.closest('.message-in, .Message:not(.own):not(.is-outgoing), [data-is-outgoing="false"], [class*="message-in" i]')) return 'incoming';
    const main = document.querySelector('[role="main"], [class*="chatroomContent" i]');
    const box = element.getBoundingClientRect(); const parent = main?.getBoundingClientRect();
    if (parent?.width && box.width && box.width < parent.width * .8) return box.left + box.width / 2 > parent.left + parent.width / 2 ? 'outgoing' : 'incoming';
    return 'unknown';
  }
  function noteConversation(ref, rows) {
    if (!ref?.key || !getComposer(getAdapter()) || (platform() === 'facebook' && !/^\/messages\/(?:e2ee\/)?t\/[^/]+/.test(ref.key))) return null;
    let stable = ref.key;
    if (platform() === 'whatsapp') {
      const jid = [...document.querySelectorAll('#main [data-id]')].map(node => (node.getAttribute('data-id') || '').match(/^(?:true|false)_(\d+(?:-\d+)?@(?:c\.us|s\.whatsapp\.net|lid|g\.us))_/)?.[1]).find(Boolean);
      if (jid) stable = jid;
    }
    if (stable.startsWith('title:') && (rows.filter(r => r.title === ref.title).length > 1 || rows.some(r => r.title === ref.title && r.ambiguous))) return { title: ref.title, ambiguous: true };
    return { key: `${platform()}:${stable}`, title: ref.title || '当前对话' };
  }
  function thread(ref) {
    const ad = getAdapter();
    if (!ad) return [];
    const result = []; const seen = new Set();
    for (const element of document.querySelectorAll(ad.messages)) {
      if (element.closest('[contenteditable="true"], .wam-tr, .wam-float') || ad.skip?.(element) || (ad.leafOnly && element.querySelector(ad.messages))) continue;
      const text = plain(element, ad.strip || '');
      if (!text || text.length > 10000) continue;
      const node = element.closest('[data-message-id], [data-mid], [data-id], [data-item-id], .Message[id]');
      const dir = direction(element);
      const messageId = node?.getAttribute('data-message-id') || node?.getAttribute('data-mid') || node?.getAttribute('data-id') || node?.getAttribute('data-item-id') || node?.id || `${dir}:${digest(text)}`;
      if (seen.has(messageId)) continue;
      seen.add(messageId);
      if (ref.privateChat === null && platform() === 'whatsapp') {
        if (/@g\.us|@broadcast/.test(messageId)) ref.privateChat = false;
        else if (/@(?:c\.us|s\.whatsapp\.net|lid)/.test(messageId)) ref.privateChat = true;
      }
      result.push({ id: String(messageId).slice(0, 500), text, direction: dir });
    }
    return result.slice(-120);
  }
  // Rich read for 黑猫助手: sender, time, text and media of each message. The newest photos and video
  // frames are drawn into small JPEGs so the assistant can look at them (blob:/data: images are same-origin).
  async function picture(el) {
    try {
      if (el.tagName === 'IMG' && !el.complete) await new Promise((r) => { el.addEventListener('load', r, { once: true }); el.addEventListener('error', r, { once: true }); setTimeout(r, 1500); });
      const w = el.naturalWidth || el.videoWidth, h = el.naturalHeight || el.videoHeight;
      if (!w || !h || (el.tagName === 'VIDEO' && el.readyState < 2)) return null;
      const scale = Math.min(1, 768 / Math.max(w, h)), canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
      canvas.getContext('2d').drawImage(el, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch { return null; }
  }
  function waMedia(root) {
    const media = [], leaf = (re) => [...root.querySelectorAll('span,div')].filter((n) => !n.childElementCount).map((n) => n.textContent.trim()).find((t) => re.test(t)) || '';
    if (root.querySelector('[data-icon*="audio-play"],[data-icon*="audio-pause"],[data-icon*="ptt"],[aria-label*="voice message" i],[aria-label*="语音"]')) return [{ kind: 'voice', duration: leaf(/^\d{1,2}:\d{2}$/) }];
    const video = !!root.querySelector('video,[data-icon*="media-play"],[data-icon*="msg-video"],[data-icon*="media-gif"],[data-icon*="video-pip"]');
    for (const img of root.querySelectorAll('img')) {
      if (img.closest('.wam-tr,.wam-float,[class*="avatar" i],[class*="quoted" i],[aria-label*="Quoted" i]') || /emoji/i.test(img.className + ' ' + (img.getAttribute('alt') || '')) || /profile picture|头像/i.test(img.getAttribute('alt') || '')) continue;
      if ((img.naturalWidth && img.naturalWidth < 40) || (img.width && img.width < 30)) continue;
      media.push({ kind: video ? 'video' : 'image', element: root.querySelector('video') || img, duration: video ? leaf(/^\d{1,2}:\d{2}$/) : '' });
      if (video) break;
    }
    if (!media.length && video) media.push({ kind: 'video', element: root.querySelector('video'), duration: leaf(/^\d{1,2}:\d{2}$/) });
    if (!media.length && root.querySelector('[data-icon*="document"],[data-icon^="doc-"],[data-icon*="audio-file"],a[download]')) media.push({ kind: 'file', name: root.querySelector('[title]:not([title=""])')?.getAttribute('title')?.replace(/^(Download|下载)\s*/i, '').slice(0, 120) || '' });
    return media;
  }
  async function richThread(ref, limit = 30, pictures = 4) {
    if (platform() !== 'whatsapp') return thread(ref).slice(-limit).map((m) => ({ ...m, author: '', time: '', media: [] }));
    const ad = getAdapter(), all = [...document.querySelectorAll(WA_MESSAGES)];
    const roots = all.filter((el) => !all.some((p) => p !== el && p.contains(el)));
    const names = new Map(), out = [];
    for (const root of roots) {
      if (root.closest('.wam-tr,.wam-float,[contenteditable="true"]')) continue;
      const id = root.getAttribute('data-id'), member = id.match(/@g\.us_[^_]+_(.+)$/)?.[1] || '';
      const pre = (root.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '').match(/^\[([^\]]*)\]\s*(.*?):\s*$/);
      if (pre?.[2] && member) names.set(member, pre[2]);
      const text = [...root.querySelectorAll(ad.messages)].filter((el) => !ad.skip?.(el)).map((el) => plain(el, ad.strip || '')).filter(Boolean).join('\n');
      const media = waMedia(root);
      if (!text && !media.length) continue;
      const time = pre?.[1] || [...root.querySelectorAll('span,div')].filter((n) => !n.childElementCount).map((n) => n.textContent.trim()).filter((t) => /^\d{1,2}:\d{2}(\s?[ap]\.?m\.?)?$/i.test(t)).pop() || '';
      out.push({ id, direction: waOutgoing(root) ? 'outgoing' : 'incoming', member, author: pre?.[2] || '', time, text: text.slice(0, 4000), media });
    }
    for (const m of out) if (!m.author && m.member) m.author = names.get(m.member) || (m.member.endsWith('@lid') ? '' : '+' + m.member.replace(/@.*/, ''));
    const recent = out.slice(-limit);
    for (let i = recent.length - 1; i >= 0 && pictures > 0; i--) for (const item of recent[i].media) if (pictures > 0 && item.element) { const data = await picture(item.element); if (data) { item.picture = data; pictures--; } }
    for (const m of recent) { delete m.member; for (const item of m.media) delete item.element; }
    return recent;
  }
  function snapshot(force = false) {
    const config = getConfig();
    if (!platform() || (!config?.active && !config?.inboxWatch && !config?.aiWatch && !config?.backupWatch && !config?.unreadWatch && !force)) return null;
    const rows = conversationRows(); const ref = currentRef(rows); const messages = ref ? thread(ref) : [];
    const events = [];
    const aiWatch = config?.aiWatch === true || config?.unreadWatch === true;
    if (aiWatch && watching) {
      for (const row of rows) {
        const old = lastRows.get(row.key);
        const changedText = old?.preview && row.preview && row.preview !== old.preview;
        const changedStamp = old?.messageStamp && recentClock(row.messageStamp) && row.messageStamp !== old.messageStamp && row.preview;
        // Unread badges are not reliable when Telegram considers a background
        // session read. A changed preview is a hint, never permission to send:
        // the host still reads the thread and verifies its newest incoming ID.
        if (old && ((row.unread > old.unread) || changedText || changedStamp)) events.push({ type: 'hint', reason:row.unread>old.unread?'unread-increase':'preview', ref: row, preview: row.preview, at: Date.now() });
      }
      if (Date.now() > scrollQuietAfter && rows[0]?.unread > 0 && !lastRows.has(rows[0].key) && lastTop && rows.some((r) => r.key === lastTop)) events.push({ type: 'hint', ref: rows[0], preview: rows[0].preview, at: Date.now() });
      const last = messages[messages.length - 1];
      if (ref && lastThread?.key === ref.key && last?.direction === 'incoming' && last.id !== lastThread.lastId && messages.some((m) => m.id === lastThread.lastId)) events.push({ type: 'thread', ref, incomingId: last.id, at: Date.now() });
    }
    watching = aiWatch;
    lastRows = new Map(rows.map((row) => [row.key, row])); lastTop = rows[0]?.key || '';
    lastThread = ref && messages.length ? { key: ref.key, lastId: messages[messages.length - 1].id } : null;
    const conversation = noteConversation(ref, rows);
    const data = { platform: platform(), conversations: rows, current: ref, conversation, messages, events, at: Date.now() };
    const key = digest(JSON.stringify({ rows: rows.map(({ updatedAt, ...r }) => r), ref, conversation, messages }));
    if (force || events.length || key !== lastSnapshot) { lastSnapshot = key; ipc.sendToHost('wam:inbox', data); }
    return data;
  }
  let commandBusy = false;
  async function open(ref, allRows = false) {
    const rows = conversationRows(allRows); const current = currentRef(rows);
    const ad = getAdapter(); const composer = ad && getComposer(ad);
    if (composer && getBoxText(composer) && current?.key !== ref.key) throw new Error('原会话有未发送的草稿，请先处理');
    if (current?.key === ref.key && composer) { lastOpened = { ...current, ...ref }; return; }
    const exact = rowNodes.get(ref.key);
    const candidates = rows.filter((r) => r.key === ref.key || (ref.href && r.href === ref.href) || (ref.dataId && r.dataId === ref.dataId));
    const byTitle = rows.filter((r) => comparableTitle(r.title) === comparableTitle(ref.title));
    const match = exact || (candidates.length === 1 ? rowNodes.get(candidates[0].key) : byTitle.length === 1 ? rowNodes.get(byTitle[0].key) : null);
    if (!match) throw new Error('会话尚未在网页列表加载，请刷新或加载更多会话');
    let target;
    if(platform()==='whatsapp') {
      // WhatsApp attaches selection handlers to descendants inside the outer grid row.
      // Dispatching on the outer row never reaches those handlers.
      const titleNode=[...match.querySelectorAll('span[title], [dir="auto"]')].find(node=>(node.getAttribute('title')||plain(node)).trim()===ref.title);
      target=titleNode||match.querySelector('[data-testid="cell-frame-container"], [role="gridcell"] [tabindex], [tabindex], [role="button"]')||match;
    } else target = platform() === 'telegram' && !match.matches('a, button, [role="button"]') ? match.querySelector('.ListItem-button, a[href], [role="button"]') || match : match.closest('a, button, [role="button"]') || match;
    target.scrollIntoView?.({block:'nearest'});
    click(target);
    const end = Date.now() + 12000;
    while (Date.now() < end) {
      checkBackup();await pause(180);checkBackup();
      const now = getAdapter()?.chat?.() || {};
      const urlMatch = platform() === 'facebook' ? sameThread(location.pathname,ref.key) : platform() === 'telegram' ? location.hash === ref.key : false;
      if ((urlMatch || comparableTitle(now.title) === comparableTitle(ref.title)) && getComposer(getAdapter())) { lastOpened = { ...ref }; return; }
    }
    throw new Error('打开会话超时：未能确认目标聊天已打开；未发送消息。');
  }
  ipc.on('wam:inbox-command', async (_event, request) => {
    let result;
    if (commandBusy) return ipc.sendToHost('wam:inbox-result', { requestId: request.requestId, ok: false, error: '账号正在处理其他会话，请稍后重试' });
    commandBusy = true;backupRequest=request.scanRead||request.action.startsWith('backup-')?request.requestId:null;
    try {
      if (request.action === 'directory'){if(!getDirectory)throw Error('此平台暂不支持客户资料读取');result=await getDirectory(request);}
      else if (request.action === 'snapshot') result = snapshot(true);
      else if (request.action === 'backup-step') result = await blackcatBackupGuest.step({...request,checkCancelled:checkBackup});
      else if (request.action === 'backup-status') result = { pending: blackcatBackupGuest.pending() };
      else if (request.action === 'backup-list') {
        if (getConfig()?.active && !request.idle) throw new Error('账号正在使用，历史扫描待补充');
        const before = conversationRows(true); let container = rowNodes.values().next().value?.parentElement;
        while (container && container !== document.body && !(container.clientHeight > 100 && container.scrollHeight > container.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(container).overflowY))) container = container.parentElement;
        const old = container?.scrollTop; if (container && container !== document.body) { if(deps.scrollBackup&&!request.reset&&!request.stay&&!Number.isFinite(request.position)){await deps.scrollBackup(container,Math.max(1,container.clientHeight*.70),'list');}else{container.scrollTop = request.reset?0:Number.isFinite(request.position)?request.position:request.stay?container.scrollTop:container.scrollTop+Math.max(1, container.clientHeight * .70);container.dispatchEvent(new Event('scroll',{bubbles:true}));if(request.reset&&deps.scrollBackup)await deps.scrollBackup(container,-Math.max(1,container.clientHeight*.70),'list');}await pause(request.stay?100:1200); }
        checkBackup();const after = conversationRows(true);
        // Telegram knows every person/group you chat with (not only saved contacts): record username/phone by chat ID for the backup.
        if (location.host === 'web.telegram.org') { try { const g = await telegramState(); for (const row of after) { const id = String(row.key).replace(/^#/, ''); const u = g?.users?.byId?.[id], c = g?.chats?.byId?.[id]; if (u) { row.username ||= tgUsername(u); row.phone ||= u.phoneNumber || ''; } else if (c) { row.username ||= tgUsername(c); } } } catch { /* identity is optional */ } }
        result = { rows: after, moved: !!container && container !== document.body && Math.abs(container.scrollTop-old)>2,position:container&&container!==document.body?container.scrollTop:0,atEnd:!container||container===document.body||container.scrollTop+container.clientHeight>=container.scrollHeight-3 };
      }
      else if (request.action === 'more') {
        const p = platform();
        const container = document.querySelector(p === 'whatsapp' ? '#pane-side' : p === 'telegram' ? '#LeftColumn .custom-scroll, .chat-list, .chatlist' : p === 'facebook' ? '[role="navigation"] [style*="overflow"], [role="grid"]' : '[class*="chatList" i]');
        if (!container) throw new Error('没有找到可滚动的会话列表');
        for (let i = 0; i < 5; i++) { container.scrollTop += Math.max(300, container.clientHeight * .8); await pause(400); snapshot(true); }
        result = snapshot(true);
      } else {
        if (isSending()) throw new Error('当前页面正在发送消息，请稍后重试');
        if (request.automatic && getConfig()?.active && document.hasFocus() && currentRef()?.key !== request.ref.key) throw new Error('人工正在查看其他会话，已转人工');
        await open(request.ref);
        const current = currentRef(); let messages = thread(current || request.ref);
        if (!current || current.key !== request.ref.key) throw new Error('会话发生变化，操作已取消');
        if (request.action === 'thread' && request.automatic) {
          const expected = String(request.expectedPreview || '').trim(); const end = Date.now() + 6000;
          const ready = () => { const last = messages.at(-1); return !!last && (!request.expectedIncomingId || last.id === request.expectedIncomingId) && (!expected || last.text.includes(expected) || expected.includes(last.text.slice(0, 40))); };
          while (!ready() && Date.now() < end) { await pause(150); if (currentRef()?.key !== request.ref.key) throw new Error('会话发生变化，操作已取消'); messages = thread(current); }
          if (!ready()) throw new Error('新消息正文尚未加载，未自动发送；请查看该会话');
        }
        if (request.action === 'send') {
          if (request.automatic && (current.privateChat === false || (current.privateChat !== true && !request.privateConfirmed))) throw new Error('无法确认是私聊，已取消自动发送');
          if (request.automatic && getConfig()?.aiWatch !== true) throw new Error('AI 回复已关闭');
          const last = messages[messages.length - 1];
          if (request.expectedIncomingId && (last?.id !== request.expectedIncomingId || last.direction !== 'incoming')) throw new Error('收到更新的消息或人工已回复，自动发送已取消');
          const ad = getAdapter(); const box = getComposer(ad);
          if (getBoxText(box)) throw new Error('输入框有未发送内容，已转人工');
          if (!String(request.text || '').trim() || request.text.length > 6000) throw new Error('消息为空或过长');
          if (!(await putBoxText(box, request.text))) throw new Error('无法填入消息，未发送');
          if(currentRef()?.key!==request.ref.key||getComposer(getAdapter())!==box||!box.isConnected)throw new Error('会话发生变化，已取消发送；请核对聊天记录');
          const accepted = await sendOnce(box, ad);
          if (!accepted) throw new Error('发送结果未确认，请人工检查；系统不会自动重发');
          result = { accepted: true, current, messages: thread(current) };
        } else if (request.action === 'read') {
          await pause(500);
          const limit = Math.min(80, Math.max(1, Number(request.limit) || 30));
          result = { current, conversation: noteConversation(current, conversationRows()), messages: await richThread(current, limit, Math.min(4, Math.max(0, Number(request.pictures) || 0))) };
        } else if (request.action === 'fill') {
          // Suggested reply: only fills the typing box; the user reviews it and presses Enter themselves
          const box = getComposer(getAdapter());
          if (!box) throw new Error('没有找到输入框');
          if (getBoxText(box)) throw new Error('输入框已有内容，请先发送或清空');
          if (!String(request.text || '').trim() || request.text.length > 6000) throw new Error('消息为空或过长');
          if (!(await putBoxText(box, request.text))) throw new Error('无法填入输入框');
          result = { filled: true, current };
        } else result = { current, messages };
        snapshot(true);
      }
      ipc.sendToHost('wam:inbox-result', { requestId: request.requestId, ok: true, data: result });
    } catch (error) { ipc.sendToHost('wam:inbox-result', { requestId: request.requestId, ok: false, error: error.message }); }
    finally { cancelledBackupRequests.delete(backupRequest);backupRequest=null;commandBusy = false; }
  });
  let timer = null;
  const scheduleInbox = () => {
    if (timer || (!getConfig()?.active && !getConfig()?.inboxWatch && !getConfig()?.aiWatch && !getConfig()?.backupWatch && !getConfig()?.unreadWatch)) return;
    timer = setTimeout(() => { timer = null; try { snapshot(); } catch {} }, 800);
  };
  window.addEventListener('DOMContentLoaded', () => {
    new MutationObserver((changes) => { if (changes.some((m) => !m.target.closest?.('.wam-tr,.wam-float,.wam-send-hint'))) scheduleInbox(); }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    scheduleInbox();
  });
  setInterval(scheduleInbox, 3000);
  document.addEventListener('pointerdown', () => ipc.send('attention:clear'), { capture: true, passive: true });
  document.addEventListener('pointerdown', event => { const row = event.target.closest?.(selectors[platform()] || '[data-no-conversation]'); const next = [...rowNodes].find(([,node]) => node === row);if(next&&next[0]!==currentRef()?.key){const ref=conversationRows().find(r=>r.key===next[0]);ipc.sendToHost('wam:conversation-changing',{key:platform()==='whatsapp'?undefined:platform()+':'+next[0],title:ref?.title});setTimeout(()=>snapshot(true),160);setTimeout(()=>snapshot(true),480);} }, { capture: true, passive: true });
  window.addEventListener('hashchange', () => { ipc.sendToHost('wam:conversation-changing'); scheduleInbox(); });
  document.addEventListener('scroll', () => { scrollQuietAfter = Date.now() + 2500; }, { capture: true, passive: true });
  return { snapshot, schedule: scheduleInbox, conversationRows, currentRef, thread, open };
}

const blackcatInboxBridge = installInboxBridge({
  scrollBackup:scrollForBackup,
  ipc: ipcRenderer, getConfig: () => cfg, getAdapter: adapter, getComposer: findComposer, getBoxText: readBox,
  putBoxText: setBox, click: press, pause: sleep, isSending: () => busy,getDirectory:readWhatsAppDirectory,
  sendOnce: async (box, ad) => {
    box.focus(); const button = findSendButton(ad);
    ourClick = true;
    try { if (button) press(button.closest('button, [role="button"]') || button); else await webFrame.executeJavaScript(SEND_ENTER); }
    finally { ourClick = false; }
    await sleep(1000); return !readBox(box);
  },
});

// Local archive bridge. Reads rendered content and browser-readable attachments;
// it never sends chat messages or reads application tokens/private platform APIs.
// BEGIN backup-content inline
const backupContent=(()=>{const module={exports:{}};
(function(scope){
  function normalizeLinks(rows){const seen=new Set(),out=[];for(const row of Array.isArray(rows)?rows:[]){try{const url=new URL(typeof row==='string'?row:row?.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>16384||seen.has(url.href))continue;seen.add(url.href);out.push({url:url.href,text:String(typeof row==='string'?'':row.text||'').slice(0,2000)});if(out.length>=100)break;}catch{}}return out;}
  const ignore='.wam-tr,.wam-float,.Avatar,.avatar,[data-testid*="avatar" i],[data-testid="contact-photo"],[data-testid="profile-photo"],[aria-label*="profile photo" i],[aria-label*="profile picture" i],[aria-label*="头像"],[class^="avatar-"],[class*=" avatar-"],[class*="quoted" i],[class*="reply" i],.reactions,.Reactions,[data-reaction],[class*="Reaction"]';
  function excluded(el,root){for(let n=el;n&&n!==root;n=n.parentElement)if(n.matches(ignore))return true;return false;}
  function whatsappRoots(doc){const area=doc.querySelector('#main');if(!area)return[];const selector='[data-id^="true_"],[data-id^="false_"],[role="row"] [data-id]',nodes=[...area.querySelectorAll(selector)].filter(el=>/^(?:true|false)_[^_]+_.+/.test(el.getAttribute('data-id')||'')||/^[A-F0-9]{16,64}$/i.test(el.getAttribute('data-id')||''));return nodes.filter(el=>!excluded(el,area)&&!el.closest('header,[role="dialog"],[data-testid="media-viewer"]')&&!nodes.some(parent=>parent!==el&&parent.contains(el)));}
  function sourceMessageId(el,root){const tile=el.closest('[id^="album-media-message-"]'),match=tile&&root.contains(tile)&&tile.id.match(/^album-media-message-(\d+(?:\.\d+)?)$/);if(match)return match[1];return root.getAttribute('data-message-id')||root.getAttribute('data-mid')||root.getAttribute('data-id')||root.id||'';}
  function photoEntries(root){return [...root.querySelectorAll('.media-inner')].filter(el=>!excluded(el,root)&&!el.querySelector('.media-inner')&&!el.closest(fileBox)&&!el.closest('.AnimatedEmoji')&&!el.querySelector('video,[data-media-type="video"],[class*="video" i]')&&!el.closest('.WebPage,.web-page,.LinkPreview,.link-preview,a[href]')&&!!el.querySelector('img,canvas.thumbnail')).map((box,index)=>({box,messageId:sourceMessageId(box,root),element:box.querySelector('img.full-media,img.media:not(.thumb)')||box.querySelector('img:not([class*="emoji" i])')||box.querySelector('canvas.thumbnail'),slot:'photo:'+([...(root.querySelectorAll('.media-inner'))].filter(n=>sourceMessageId(n,root)===sourceMessageId(box,root)).indexOf(box))}));}
  const filePattern=/\.(?:pdf|docx?|xlsx?|pptx?|csv|txt|zip|rar|7z|mp4|m4v|webm|mov|mkv|mp3|m4a|ogg|wav|jpe?g|png|webp|gif)(?:$|[?#])/i;
  const fileBox='[data-filename],[data-file-name],[data-mime-type],.document,.Document,.document-container,[class*="document-message" i],[class*="documentMessage"],[data-testid*="document"],[data-icon="document"],[data-type="document"]';
  const downloadButton='a[download],button[aria-label*="download" i],button[title*="download" i],[role="button"][aria-label*="download" i],[role="button"][title*="download" i],button[aria-label*="下载"],[role="button"][aria-label*="下载"],[data-icon*="download" i],[class*="icon-download"],[class*="download-icon"]';
  function attachmentName(el){return el.getAttribute('download')||el.getAttribute('data-filename')||el.getAttribute('data-file-name')||el.closest('[data-filename],[data-file-name]')?.getAttribute('data-filename')||el.closest('[data-file-name]')?.getAttribute('data-file-name')||el.querySelector('[data-filename]')?.getAttribute('data-filename')||el.querySelector('.file-title,.document-name,.filename,.file-name,[data-testid="document-title"]')?.textContent?.trim()||el.textContent?.trim().match(/[^\n\r]{1,180}\.(?:pdf|docx?|xlsx?|pptx?|csv|txt|zip|rar|7z|mp4|m4v|webm|mov|mkv|mp3|m4a|ogg|wav|jpe?g|png|webp|gif)\b/i)?.[0]||'';}
  function fileKind(name,mime=''){if(/^video\//i.test(mime)||/\.(mp4|m4v|webm|mov|mkv)$/i.test(name))return'video';if(/^image\//i.test(mime)||/\.(jpe?g|png|webp|gif|avif|heic)$/i.test(name))return'image';if(/^audio\//i.test(mime)||/\.(mp3|m4a|ogg|wav)$/i.test(name))return'audio';return'file';}
  function documentAssets(root){const out=[],seen=new Set();for(const el of root.querySelectorAll('a[download],[data-download-url],a[href]')){if(excluded(el,root))continue;const href=el.getAttribute('data-download-url')||el.href||'',name=attachmentName(el);if(!el.hasAttribute('download')&&!el.hasAttribute('data-download-url')&&!(el.closest(fileBox)&&(!!name||filePattern.test(href))))continue;if(!/^(https?:|blob:|data:)/i.test(href))continue;const key=href+'|'+name;if(seen.has(key))continue;seen.add(key);out.push({element:el,source:href,name,kind:fileKind(name||href,el.getAttribute('data-mime-type')||''),quality:'download-link'});}
   for(const el of root.querySelectorAll(fileBox)){if(excluded(el,root)||el.querySelector(fileBox))continue;const name=attachmentName(el),button=el.matches(downloadButton)?el:el.querySelector(downloadButton);if(!name||!button||out.some(a=>el.contains(a.element)))continue;out.push({element:el,source:'',name,kind:fileKind(name,el.getAttribute('data-mime-type')||''),quality:'download-link'});}return out;}
  function linksFrom(root,base){const items=[];for(const a of root.querySelectorAll('a[href]')){if(excluded(a,root)||a.hasAttribute('download')||a.hasAttribute('data-download-url')||a.closest(fileBox))continue;try{items.push({url:new URL(a.getAttribute('href'),base).href,text:a.textContent?.trim()||''});}catch{}}return normalizeLinks(items);}
  const api={whatsappRoots,sourceMessageId,excluded,photoEntries,normalizeLinks,linksFrom,documentAssets,attachmentName,fileKind,fileBox,downloadButton};if(typeof module==='object'&&module.exports)module.exports=api;else scope.BlackCatBackupContent=api;
})(typeof globalThis==='object'?globalThis:this);
return module.exports;})();
// END backup-content inline
// BEGIN backup-timeline inline
const backupTimeline=(()=>{const module={exports:{}};
(function(scope){
  const DECIMAL=/^\d+(?:\.\d+)?$/;
  function normalize(message){const out={};if(typeof message.albumCaption==='string'&&message.albumCaption)out.albumCaption=message.albumCaption;if(Number.isSafeInteger(message.sourceExpectedMessages)&&message.sourceExpectedMessages>0)out.sourceExpectedMessages=message.sourceExpectedMessages;if(['telegram-cache','whatsapp-cache','dom'].includes(message.sourceConfidence))out.sourceConfidence=message.sourceConfidence;if(message.sourceEmoji===true)out.sourceEmoji=true;if(message.sourceEmojiResource===true)out.sourceEmojiResource=true;if(message.sourceMediaComplete===true){out.sourceMediaComplete=true;out.sourceMediaKinds=(message.sourceMediaKinds||[]).filter(k=>['image','video','audio','file','sticker','emoji','link-preview'].includes(k));}for(const key of ['timeZone','dateLabel','timeTitle','sourceOrder','sourcePrevious','sourceNext','unsupportedType'])if(typeof message[key]==='string'&&message[key])out[key]=message[key].slice(0,key==='timeTitle'?2000:200);if(Array.isArray(message.entities)&&message.entities.length)out.entities=message.entities.filter(e=>typeof e.type==='string'&&Number.isInteger(e.offset)&&Number.isInteger(e.length)).map(e=>({type:e.type,offset:e.offset,length:e.length,...(typeof e.url==='string'?{url:e.url}:{})}));if(Array.isArray(message.mediaManifest)&&message.mediaManifest.length)out.mediaManifest=message.mediaManifest.map(a=>({slot:String(a.slot),kind:String(a.kind),sourceMessageId:String(a.sourceMessageId||message.id||''),...(a.sourceMediaId?{sourceMediaId:String(a.sourceMediaId)}:{}),...(a.expectedName?{expectedName:String(a.expectedName)}:{}),expectedBytes:Math.max(0,Number(a.expectedBytes)||0),...(/^[a-f0-9]{64}$/.test(a.expectedHash||'')?{expectedHash:a.expectedHash}:{}),width:Math.max(0,Number(a.width)||0),height:Math.max(0,Number(a.height)||0)}));for(const key of ['albumId','replyTo'])if(message[key])out[key]=String(message[key]);if(Number.isFinite(message.editedAt)&&message.editedAt>0)out.editedAt=message.editedAt;if(Number.isFinite(message.sentAt)&&message.sentAt>0)out.sentAt=message.sentAt;if(['second','minute','label'].includes(message.timePrecision))out.timePrecision=message.timePrecision;return out;}
  function mergeMessage(previous,incoming){
    if(!previous)return incoming;
    const olderEdit=(Number(incoming.editedAt)||0)<(Number(previous.editedAt)||0),newerEdit=(Number(incoming.editedAt)||0)>(Number(previous.editedAt)||0),weaker=previous.sourceConfidence==='telegram-cache'&&incoming.sourceConfidence!=='telegram-cache',merged={...incoming};
    if(olderEdit||weaker&&!newerEdit){for(const key of ['text','author','direction','entities','time','timeTitle','sentAt','timeZone','timePrecision','sourceOrder','sourcePrevious','sourceNext','unsupportedType','dateLabel','albumId','replyTo','editedAt','mediaManifest','sourceEmoji','sourceEmojiResource','sourceMediaComplete','sourceMediaKinds'])if(previous[key]!==undefined&&!(key==='text'&&previous.cloudTextSynced&&!previous.text))merged[key]=previous[key];merged.sourceConfidence=previous.cloudTextSynced&&!previous.text?incoming.sourceConfidence:previous.sourceConfidence;}
    for(const key of ['sourcePrevious','sourceNext','author','sourceExpectedMessages'])if(!merged[key]&&previous[key])merged[key]=previous[key];
    if(!['incoming','outgoing'].includes(merged.direction)&&['incoming','outgoing'].includes(previous.direction))merged.direction=previous.direction;
    if(!merged.sentAt&&previous.sentAt)for(const key of ['sentAt','timeZone','timePrecision'])if(previous[key]!==undefined)merged[key]=previous[key];
    if(merged.unsupportedType&&!merged.text&&previous.text&&!previous.cloudTextSynced)merged.text=previous.text;
    return merged;
  }
  function parseAbsolute(value){const line=String(value||'').split('\n')[0].trim();if(!/(?:19|20)\d{2}/.test(line))return null;let text=line.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'');if(/\d{4}年/.test(text))text=text.replace(/年|月/g,'-').replace(/日/g,' ').replace(/上午/g,' AM ').replace(/下午/g,' PM ');const ms=Date.parse(text);return Number.isFinite(ms)?ms:null;}
  async function activateTelegramDates(roots,pause){let changed=false;for(const root of roots)for(const el of root.querySelectorAll('.message-time'))if(!parseAbsolute(el.getAttribute('title'))){el.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true,composed:true}));changed=true;}if(changed)await pause(100);}
  function readTime(root,platform){const timeEl=root.querySelector('.message-time'),absolute=root.querySelector('time[datetime]')?.getAttribute('datetime')||timeEl?.getAttribute('title')||root.getAttribute('data-timestamp')||root.getAttribute('data-utime')||root.querySelector('[data-utime]')?.getAttribute('data-utime')||'',raw=absolute||root.getAttribute('data-pre-plain-text')||root.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text')||timeEl?.textContent||root.querySelector('.MessageMeta')?.textContent||'',sentAt=/^\d{10}(?:\d{3})?$/.test(absolute)?Number(absolute)*(absolute.length===10?1000:1):parseAbsolute(raw),dateLabel=root.closest('.message-date-group')?.querySelector(':scope > .sticky-date')?.textContent?.trim()||'',timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'';let dayLabel=dateLabel;if(!raw){const group=root.closest('.message-date-group'),other=group&&[...group.querySelectorAll('.message-time[title]')].map(el=>parseAbsolute(el.title)).find(Boolean);if(other){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(other)).map(p=>[p.type,p.value]));dayLabel=parts.year+'-'+parts.month+'-'+parts.day;}}const edited=String(raw).split('\n').find(line=>/edited|编辑|編輯/i.test(line)),editedAt=edited?parseAbsolute(edited.replace(/^.*?[:：]\s*/,'')):null;return{time:(/^\d{10}(?:\d{3})?$/.test(absolute)?new Date(sentAt).toLocaleString():null)||(platform==='whatsapp'?String(raw).match(/^\[[^\]]+\]/)?.[0]:null)||String(raw).split('\n')[0].trim(),timeTitle:String(raw),...(editedAt?{editedAt}:{}),...(sentAt?{sentAt,timePrecision:/\d{1,2}:\d{2}:\d{2}/.test(raw)?'second':'minute'}:{timePrecision:'label'}),...(dayLabel?{dateLabel:dayLabel}:{}),...(timeZone?{timeZone}:{})};}
  function compareIds(a,b){if(!DECIMAL.test(a)||!DECIMAL.test(b))return String(a).localeCompare(String(b));const [ai,af='']=a.replace(/^0+(?=\d)/,'').split('.'),[bi,bf='']=b.replace(/^0+(?=\d)/,'').split('.');return ai.length-bi.length||(ai<bi?-1:ai>bi?1:0)||(af<bf?-1:af>bf?1:0);}
  function invalidNumericId(column='id'){if(!/^[a-z_]+$/i.test(column))throw Error('Invalid ordering column');return `(${column}='' OR ${column} GLOB '*[^0-9.]*' OR ${column} NOT GLOB '[0-9]*' OR length(${column})-length(replace(${column},'.',''))>1 OR substr(${column},-1)='.')`;}
  function orderSQL(numeric,{observed='firstSeen',direction='ASC'}={}){if(!/^[a-z_]+$/i.test(observed)||!['ASC','DESC'].includes(direction))throw Error('Invalid timeline order');if(numeric)return `CAST(id AS INTEGER) ${direction},CASE WHEN instr(id,'.')>0 THEN substr(id,instr(id,'.')+1) ELSE '' END ${direction},id ${direction}`;return `CASE WHEN typeof(json_extract(data,'$.sentAt')) IN ('integer','real') THEN json_extract(data,'$.sentAt') ELSE ${observed} END ${direction},id ${direction}`;}
  function displayTime(message){if(message.sentAt>0){try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:message.timePrecision==='second'?'medium':'short',...(message.timeZone?{timeZone:message.timeZone}:{})}).format(new Date(message.sentAt));}catch{}}const raw=String(message.time||'');return parseAbsolute(raw)?raw:[message.dateLabel,raw].filter(Boolean).join(' · ');}
  function facebookLabel(root){
    const label=String(root.getAttribute('aria-label')||''),match=label.match(/^At (.+?\b\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?),\s+([^\n]*?):(?:\s|$)/i);
    if(!match||!parseAbsolute(match[1]))return null;
    return{time:match[1],author:match[2],direction:/^(?:You|你|您)$/i.test(match[2])?'outgoing':'incoming'};
  }
  function assetMismatch(message,asset,previous){
    if(asset.status!=='saved'||asset.quality!=='download-link')return false;
    const candidates=(message.mediaManifest||[]).filter(m=>m.kind===asset.kind),info=candidates.find(m=>String(m.slot)===String(asset.slot))||(candidates.length===1?candidates[0]:null);if(!info)return false;const priorCandidates=(previous?.mediaManifest||[]).filter(m=>m.kind===asset.kind),prior=priorCandidates.find(m=>String(m.slot)===String(asset.slot))||(priorCandidates.length===1?priorCandidates[0]:null),sourceId=asset.sourceMediaId||prior?.sourceMediaId;if(info.sourceMediaId&&sourceId&&info.sourceMediaId!==sourceId)return true;
    if(info.expectedBytes>0&&asset.size!==info.expectedBytes)return true;
    const storedHash=asset.file?.hash||String(asset.path||'').replace(/\\/g,'/').match(/\/([a-f0-9]{64})(?:\.[a-z0-9]+)?$/i)?.[1];
    if(info.expectedHash&&storedHash&&storedHash!==info.expectedHash)return true;
    const photoId=String(asset.name||'').match(/^(\d+)\.[a-z0-9]+$/i)?.[1];return asset.kind==='image'&&!!photoId&&!info.expectedName&&!!info.sourceMediaId&&photoId!==info.sourceMediaId;
  }
  // Captured pages overlap. Their neighbour IDs establish source order even
  // when message IDs are opaque and several messages share the same minute.
  function orderRows(rows,{numeric=true}={}){
    const byId=new Map(rows.map(row=>[String(row.id),row])),data=new Map(rows.map(row=>[String(row.id),typeof row.data==='string'?JSON.parse(row.data):row]));
    if(numeric&&rows.every(row=>DECIMAL.test(String(row.id))&&data.get(String(row.id)).sourceIdentity!=='rendered'))return{rows:[...rows].sort((a,b)=>compareIds(String(a.id),String(b.id))),verified:true,conflicts:0};
    const edges=new Map(rows.map(row=>[String(row.id),new Set()])),degree=new Map(rows.map(row=>[String(row.id),0]));let links=0;
    const add=(a,b)=>{if(a===b||!byId.has(a)||!byId.has(b)||edges.get(a).has(b))return;edges.get(a).add(b);degree.set(b,degree.get(b)+1);links++;};
    for(const [id,m]of data){if(m.sourcePrevious)add(String(m.sourcePrevious),id);if(m.sourceNext)add(id,String(m.sourceNext));}
    const fallback=(a,b)=>{const am=data.get(a),bm=data.get(b),at=Number(am.sentAt)||0,bt=Number(bm.sentAt)||0;return at&&bt&&at!==bt?at-bt:(Number(byId.get(a).firstSeen||byId.get(a).first_seen)||0)-(Number(byId.get(b).firstSeen||byId.get(b).first_seen)||0)||a.localeCompare(b);};
    // Min heap avoids quadratic insertion on large customer histories.
    const heap=[];const push=id=>{heap.push(id);let i=heap.length-1;while(i){const p=(i-1)>>1;if(fallback(heap[p],id)<=0)break;heap[i]=heap[p];i=p;}heap[i]=id;};
    const pop=()=>{const id=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&fallback(heap[child+1],heap[child])<0)child++;if(fallback(last,heap[child])<=0)break;heap[i]=heap[child];i=child;}heap[i]=last;}return id;};
    for(const [id,n]of degree)if(!n)push(id);const output=[];let ambiguous=false;
    while(heap.length){if(heap.length>1)ambiguous=true;const id=pop();output.push(byId.get(id));for(const next of edges.get(id)){degree.set(next,degree.get(next)-1);if(!degree.get(next))push(next);}}
    const conflicts=rows.length-output.length;if(conflicts){const done=new Set(output.map(row=>String(row.id)));output.push(...rows.filter(row=>!done.has(String(row.id))).sort((a,b)=>fallback(String(a.id),String(b.id))));}
    return{rows:output,verified:!conflicts&&!ambiguous&&(rows.length<2||links>0)&&![...data.values()].some(m=>m.sourceIdentity==='rendered'),conflicts};
  }
  function pageRows(rows,offset=0){const ordered=orderRows(rows),end=Math.max(0,ordered.rows.length-offset),start=Math.max(0,end-200);return{...ordered,rows:ordered.rows.slice(start,end)};}
  function storedOrder(db,table,where,params,observed='firstSeen'){
    if(!['messages','cloud_archive_messages'].includes(table)||!['firstSeen','first_seen'].includes(observed))throw Error('Invalid timeline source');
    const telegram=String(params.at(-1)||'').startsWith('telegram:'),numeric=telegram&&db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE '+where+' AND '+invalidNumericId()).get(...params).n===0;
    if(numeric)return{ids:db.prepare('SELECT id FROM '+table+' WHERE '+where+' ORDER BY '+orderSQL(true)).all(...params).map(row=>row.id),verified:true,conflicts:0};
    // Read only ordering metadata, never every message body or attachment.
    const rows=db.prepare(`SELECT id,${observed} AS firstSeen,json_object('sentAt',json_extract(data,'$.sentAt'),'sourcePrevious',json_extract(data,'$.sourcePrevious'),'sourceNext',json_extract(data,'$.sourceNext'),'sourceIdentity',json_extract(data,'$.sourceIdentity')) AS data FROM ${table} WHERE ${where}`).all(...params),ordered=orderRows(rows,{numeric:telegram});
    return{ids:ordered.rows.map(row=>row.id),verified:ordered.verified,conflicts:ordered.conflicts};
  }
  const api={mergeMessage,normalize,parseAbsolute,activateTelegramDates,readTime,compareIds,invalidNumericId,orderSQL,displayTime,orderRows,pageRows,storedOrder,facebookLabel,assetMismatch};if(typeof module==='object'&&module.exports)module.exports=api;else scope.BlackCatBackupTimeline=api;
})(typeof globalThis==='object'?globalThis:this);
return module.exports;})();
// END backup-timeline inline
// BEGIN backup-telegram-source inline
const backupTelegramSource=(()=>{const module={exports:{}};
(function(scope){
  function authorName(state,id){const user=state.users?.byId?.[id],chat=state.chats?.byId?.[id];return[user?.firstName,user?.lastName].filter(Boolean).join(' ')||user?.username||chat?.title||'';}
  function mediaInfo(value,kind){if(!value)return null;const isPhoto=kind==='image';if(kind==='file'){if(/^video\//.test(value.mimeType||''))kind='video';else if(/^audio\//.test(value.mimeType||''))kind='audio';else if(/^image\//.test(value.mimeType||''))kind='image';}const sizes=(value.sizes||[]).filter(s=>s.width&&s.height).sort((a,b)=>a.width*a.height-b.width*b.height),size=sizes.at(-1);return{kind,id:String(value.id||''),name:String(value.fileName||value.filename||''),mime:String(value.mimeType||''),size:isPhoto?0:Math.max(0,Number(value.size)||0),width:Number(value.width||size?.width)||0,height:Number(value.height||size?.height)||0,duration:Number(value.duration)||0,...(/^blob:https:\/\/web\.telegram\.org\//.test(value.blobUrl||'')?{blobUrl:value.blobUrl}:{})};}
  function projectMessages(state,chatId,ids){const records=[],messages=state?.messages?.byChatId?.[chatId]?.byId;if(!messages)return records;const selected=new Set(ids),groups=new Set(ids.map(id=>messages[id]).filter(m=>m&&String(m.chatId)===String(chatId)&&m.groupedId).map(m=>String(m.groupedId)));for(const m of Object.values(messages))if(m&&String(m.chatId)===String(chatId)&&m.groupedId&&groups.has(String(m.groupedId)))selected.add(String(m.id));for(const id of selected){const m=messages[id];if(!m||String(m.id)!==String(id)||String(m.chatId)!==String(chatId))continue;const content=m.content||{},media=[];for(const[key,kind]of [['photo','image'],['video','video'],['audio','audio'],['voice','audio'],['document','file'],['sticker','sticker']]){const info=mediaInfo(content[key],kind);if(info)media.push(info);}const text=typeof content.text?.text==='string'?content.text.text:'',entities=(content.text?.entities||[]).map(e=>({type:String(e.type||''),offset:Number(e.offset)||0,length:Number(e.length)||0,...(e.url?{url:String(e.url)}:{})}));records.push({id:String(m.id),chatId:String(chatId),sentAt:Number(m.date)*1000,direction:m.isOutgoing?'outgoing':'incoming',author:authorName(state,m.senderId),senderId:String(m.senderId||''),text,entities,media,...(m.groupedId?{albumId:String(m.groupedId)}:{}),...(m.isEdited?{editedAt:Number(m.editDate)*1000}:{}),...(content.action?{service:true}:{}),...(m.replyInfo?{replyTo:String(m.replyInfo.replyToMsgId||m.replyInfo.replyToMessageId||'')}:{}),...(m.forwardInfo?{forwarded:true}:{})});}return records;}
  function splitAlbum(message,records){
    const {_domText,...base}=message,owners=new Set((message.assets||[]).map(a=>String(a.sourceMessageId||message.id))),group=message.albumId?[...records.values()].filter(m=>m.albumId===message.albumId):[];
    if(owners.size<2&&!group.some(m=>m.id!==message.id))return[base];
    for(const m of group)owners.add(m.id);owners.add(message.id);
    const captions=group.filter(m=>m.text).map(m=>m.text),unmappedCaption=!!_domText&&(!captions.length||captions.join('\n').replace(/\s/g,'')!==_domText.replace(/\s/g,''));
    return[...owners].sort((a,b)=>Number(a)-Number(b)).map(id=>{
      const native=records.get(id),assets=(message.assets||[]).filter(a=>String(a.sourceMessageId||message.id)===id),media=native?.media||[];
      if(!assets.length)for(const info of media)assets.push({slot:info.kind+':0',kind:info.kind,source:info.blobUrl||'',sourceMessageId:id,name:info.name,quality:'page',width:info.width,height:info.height});
      const out={...base,id,text:typeof native?.text==='string'?native.text:'',assets,albumId:native?.albumId||message.albumId||'dom:'+message.id,entities:native?.entities||[],sourceConfidence:native?'telegram-cache':'dom',...(native?.sentAt?{sentAt:native.sentAt,timePrecision:'second'}:{}),...(native?.author?{author:native.author}:{}),...(native?.direction?{direction:native.direction}:{})};
      delete out.sourceMediaComplete;delete out.sourceMediaKinds;
      if(native&&media.length===assets.length&&media.every(n=>media.filter(m=>m.kind===n.kind).length===assets.filter(a=>a.kind===n.kind).length)){out.sourceMediaComplete=true;out.sourceMediaKinds=media.map(m=>m.kind);}
      out.mediaManifest=assets.map(a=>{const info=media.find(m=>m.kind===a.kind);return{slot:String(a.slot),kind:a.kind,sourceMessageId:id,...(info?{sourceMediaId:info.id,...(info.name?{expectedName:info.name}:{}),expectedBytes:info.size,width:info.width,height:info.height}:{})};});
      if(unmappedCaption&&id===message.id){out.albumCaption=_domText;out.unsupportedType='album-caption-owner';}
      return out;
    });
  }
  async function readCachedChat(chatId,ids){if(!/^-?\d+$/.test(chatId)||!ids.length||typeof indexedDB==='undefined')return[];try{if(typeof indexedDB.databases==='function'&&!(await indexedDB.databases()).some(d=>d.name==='tt-data'))return[];return await new Promise(resolve=>{let db;const timer=setTimeout(()=>{db?.close();resolve([]);},2000),done=value=>{clearTimeout(timer);db?.close();resolve(value);},request=indexedDB.open('tt-data');request.onupgradeneeded=()=>{request.transaction.abort();done([]);};request.onerror=()=>done([]);request.onsuccess=()=>{db=request.result;if(!db.objectStoreNames.contains('store'))return done([]);const read=db.transaction('store','readonly').objectStore('store').get('tt-global-state');read.onerror=()=>done([]);read.onsuccess=()=>{try{const state=typeof read.result==='string'?JSON.parse(read.result):read.result;const rows=projectMessages(state,chatId,ids),count=Number(state.messages?.byChatId?.[chatId]?.threadsById?.['-1']?.threadInfo?.messagesCount);if(Number.isSafeInteger(count)&&count>0)rows.sourceExpectedMessages=count;done(rows);}catch{done([]);}};};});}catch{return[];}}
  const api={projectMessages,readCachedChat,splitAlbum};if(typeof module==='object'&&module.exports)module.exports=api;else scope.BlackCatTelegramSource=api;
})(typeof globalThis==='object'?globalThis:this);
return module.exports;})();
// END backup-telegram-source inline
// BEGIN backup-whatsapp-source inline
const backupWhatsAppSource=(()=>{const module={exports:{}};
(function(scope){
  // Only project messages whose exact IDs were observed in the current chat.
  // Encryption keys, session data and unrelated object stores are never read.
  function fileHash(value){if(typeof value!=='string')return'';if(/^[a-f0-9]{64}$/i.test(value))return value.toLowerCase();try{const bytes=atob(value);return bytes.length===32?[...bytes].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join(''):'';}catch{return'';}}
  function projectMessage(key,value,id){
    if(typeof key!=='string'||String(value?.id)!==key||!(key===id||key.split('_').includes(id)))return null;
    const match=key.match(/^(true|false)_/);if(!match)return null;
    const kind={image:'image',video:'video',document:'file',audio:'audio',ptt:'audio',sticker:'sticker'}[value.type],text=value.type==='chat'?value.body:value.caption;
    return{id,chatId:key.split('_')[1],text:typeof text==='string'?text:null,sentAt:Number(value.t)>0?Number(value.t)*1000:null,direction:match[1]==='true'?'outgoing':'incoming',author:'',entities:[],media:kind?[{kind,id,name:String(value.filename||value.fileName||''),mime:String(value.mimetype||''),size:Math.max(0,Number(value.size||value.fileLength)||0),expectedHash:fileHash(value.filehash),width:Number(value.width)||0,height:Number(value.height)||0}]:[],mediaKnown:!!kind||value.type==='chat',sourceConfidence:'whatsapp-cache'};
  }
  async function readMessages(ids){
    const wanted=new Set(ids.filter(id=>typeof id==='string'&&id.length<=1200&&!id.startsWith('rendered:')&&!id.startsWith('grouped-')));if(!wanted.size||typeof indexedDB==='undefined')return[];
    try{if(typeof indexedDB.databases==='function'&&!(await indexedDB.databases()).some(d=>d.name==='model-storage'))return[];
      return await new Promise(resolve=>{let db,done=false,count=0;const matches=new Map(),duplicates=new Set(),finish=()=>{if(done)return;done=true;clearTimeout(timer);db?.close();resolve([...matches].filter(([id])=>!duplicates.has(id)).map(([,m])=>m));},timer=setTimeout(finish,3000),request=indexedDB.open('model-storage');request.onerror=finish;request.onupgradeneeded=()=>request.transaction.abort();request.onsuccess=()=>{db=request.result;if(done){db.close();return;}if(!db.objectStoreNames.contains('message'))return finish();const cursor=db.transaction('message','readonly').objectStore('message').openCursor();cursor.onerror=finish;cursor.onsuccess=()=>{if(done)return;const c=cursor.result;if(!c||++count>100000)return finish();if(typeof c.key==='string'){const parts=[c.key,...c.key.split('_')];for(const id of new Set(parts)){if(!wanted.has(id))continue;const m=projectMessage(c.key,c.value,id);if(m){if(matches.has(id))duplicates.add(id);else matches.set(id,m);}}}c.continue();};};});
    }catch{return[];}
  }
  // Run in WhatsApp's own page context. Only the selected message's decrypted
  // Blob is exposed; the platform performs its normal media retrieval internally.
  async function nativeMedia(request,normalizeHash){
    const unavailable={available:false};
    try{
      if(!request.messageId||!request.chatId||!/^[a-f0-9]{64}$/.test(request.expectedHash||'')||!(request.expectedBytes>0))return unavailable;
      const visible=new Set([...document.querySelectorAll('#main [data-id]')].map(el=>el.getAttribute('data-id')));if(!visible.size&&!(request.resume===true&&request.start===false))return unavailable;
      const get=globalThis.require;if(typeof get!=='function')return unavailable;
      const all=get('WAWebMsgCollection').MsgCollection.getModelsArray();if(!(request.resume===true&&request.start===false)&&!all.some(m=>{const full=String(m.id?._serialized||m.id?.toString?.()||''),chat=String(m.id?.remote?._serialized||m.id?.remote||full.split('_')[1]||'');return chat===request.chatId&&(visible.has(String(m.id?.id||''))||visible.has(full))}))return unavailable;
      const matches=all.filter(m=>{const full=String(m.id?._serialized||m.id?.toString?.()||''),id=String(m.id?.id||''),chat=String(m.id?.remote?._serialized||m.id?.remote||full.split('_')[1]||'');return chat===request.chatId&&(id===request.messageId||full===request.messageId)});
      if(matches.length!==1)return unavailable;const model=matches[0],kind={image:'image',video:'video',document:'file',audio:'audio',ptt:'audio',sticker:'sticker'}[model.type],rawHash=model.filehash||model.mediaData?.filehash;
      if(kind!==request.kind||normalizeHash(rawHash)!==request.expectedHash||Number(model.size)!==request.expectedBytes)return unavailable;
      const cache=get('WAWebMediaInMemoryBlobCache').InMemoryMediaBlobCache;
      if(cache.has(rawHash)){const blob=cache.get(rawHash);if(!(blob instanceof Blob)||blob.size!==request.expectedBytes)return unavailable;const source=cache.getOrCreateURL(rawHash);return typeof source==='string'&&source.startsWith('blob:')?{available:true,source,mime:blob.type,size:blob.size}:unavailable;}
      const jobs=globalThis.__blackcatBackupMediaDownloads||(globalThis.__blackcatBackupMediaDownloads=new Map()),key=request.chatId+'|'+request.messageId+'|'+request.expectedHash;let job=jobs.get(key);
      if(job?.done&&request.retry&&!['FETCHING','REUPLOADING','DOWNLOADING','RESOLVING'].includes(model.mediaData?.mediaStage)){jobs.delete(key);job=null;}
      if(!job&&request.start&&typeof model.forceDownloadMediaEvenIfExpensive==='function'){if(jobs.size>=500)for(const[k,v]of jobs)if(v.done||Date.now()-v.at>60000)jobs.delete(k);job={at:Date.now(),done:false};jobs.set(key,job);Promise.resolve().then(()=>model.forceDownloadMediaEvenIfExpensive()).catch(()=>{}).finally(()=>job.done=true);}
      return{available:false,pending:!!job&&Date.now()-job.at<180000&&(!job.done||['FETCHING','REUPLOADING','DOWNLOADING','RESOLVING'].includes(model.mediaData?.mediaStage))};
    }catch{return unavailable;}
  }
  function mediaScript(request){return '('+nativeMedia.toString()+')('+JSON.stringify(request)+','+fileHash.toString()+')';}
  async function nativeHistory(request,project){try{const ids=new Set([...document.querySelectorAll('#main [data-id]')].map(n=>n.getAttribute('data-id')));if(!request.chatId||!request.anchors?.some(id=>ids.has(id)))return{available:false};const get=globalThis.require,models=get('WAWebMsgCollection').MsgCollection.getModelsArray(),anchor=models.some(m=>{const full=String(m.id?._serialized||m.id?.toString?.()||''),chat=String(m.id?.remote?._serialized||m.id?.remote||full.split('_')[1]||'');return chat===request.chatId&&request.anchors.some(id=>id===String(m.id?.id||'')||id===full)});if(!anchor)return{available:false};const chats=get('WAWebChatCollection').ChatCollection.getModelsArray().filter(c=>String(c.id?._serialized||c.id)===request.chatId);if(chats.length!==1)return{available:false};const chat=chats[0],loaded=await get('WAWebChatLoadMessages').loadEarlierMsgs({chat});const records=project?chat.msgs.getModelsArray().filter(m=>String(m.id?.remote?._serialized||m.id?.remote||'')===request.chatId).map(m=>{const key=String(m.id?._serialized||m.id?.toString?.()||'');return project(key,{id:key,t:m.t,type:m.type,body:m.body,caption:m.caption||m.body||'',filename:m.filename,size:m.size,mimetype:m.mimetype,filehash:m.filehash,width:m.width,height:m.height},String(m.id?.id||''))}).filter(Boolean):[];return{available:true,loaded:Array.isArray(loaded)?loaded.length:0,boundary:chat.msgs?.msgLoadState?.noEarlierMsgs===true,records};}catch{return{available:false}}}
  function historyScript(request){return '(()=>{const fileHash='+fileHash.toString()+';return ('+nativeHistory.toString()+')('+JSON.stringify(request)+','+projectMessage.toString()+');})()';}
  const api={projectMessage,readMessages,nativeMedia,mediaScript,nativeHistory,historyScript};if(typeof module==='object'&&module.exports)module.exports=api;else scope.BlackCatWhatsAppSource=api;
})(typeof globalThis==='object'?globalThis:this);
return module.exports;})();
// END backup-whatsapp-source inline
// BEGIN backup-audio-auto inline
const backupAudioAuto=(()=>{const module={exports:{}};
(function(scope){
  // A queue belongs to one managed account view. Each task retains the exact
  // archive chat, platform chat, message, slot and source-file hash it observed.
  function createQueue({enabled,paused=()=>false,need,download,save,now=Date.now,concurrency=2,limit=500}){
    const tasks=new Map(),finished=new Set();let busy=false;
    const key=t=>JSON.stringify([t.chatKey,t.chatId,t.messageId,t.hash,t.slot]);
    function observe(items){for(const item of [...items].sort((a,b)=>(b.sentAt||0)-(a.sentAt||0))){if(!item.chatKey||!item.chatId||!item.messageId||!item.hash||!item.size)continue;const id=key(item);if(finished.has(id))continue;for(const[k,t]of tasks)if(k!==id&&t.chatKey===item.chatKey&&t.messageId===item.messageId){t.cancelled=true;tasks.delete(k);}const old=tasks.get(id);if(old){Object.assign(old,item);continue;}if(tasks.size>=limit){const victim=[...tasks].reverse().find(([,t])=>!t.inFlight);if(!victim)continue;tasks.delete(victim[0]);}tasks.set(id,{...item,key:id,nextAt:0,attempts:0,inFlight:false});}}
    const live=t=>enabled()&&!t.cancelled&&tasks.get(t.key)===t;
    function defer(t){t.inFlight=false;t.attempts++;t.nextAt=now()+Math.min(900000,60000*2**Math.min(t.attempts-1,4));}
    function complete(t){tasks.delete(t.key);finished.add(t.key);if(finished.size>2000)finished.delete(finished.values().next().value);}
    async function process(t){
      try{if(!live(t)||paused())return;const lease=await need(t);if(!live(t))return;if(lease?.paused){t.nextAt=now()+3000;return;}if(!lease?.needed){complete(t);return;}
        const wasInFlight=t.inFlight,result=await download(t,{start:!wasInFlight,resume:wasInFlight,retry:!wasInFlight&&t.attempts>0});if(!live(t))return;
        if(result?.available){const current=await need(t);if(!live(t))return;if(current?.paused){t.nextAt=now()+3000;return;}if(!current?.needed){complete(t);return;}await save(t,result,current);if(live(t))tasks.delete(t.key);}
        else if(result?.pending){t.inFlight=true;t.nextAt=now()+4000;}else defer(t);
      }catch{if(live(t))defer(t);}
    }
    async function tick(){if(busy||!enabled()||paused())return;busy=true;try{const active=[...tasks.values()].filter(t=>t.inFlight&&t.nextAt<=now());for(const t of active){if(!enabled()||paused())break;await process(t);}const slots=concurrency-[...tasks.values()].filter(t=>t.inFlight).length;if(slots>0)for(const t of [...tasks.values()].filter(t=>!t.inFlight&&t.nextAt<=now()).sort((a,b)=>a.nextAt-b.nextAt||(b.sentAt||0)-(a.sentAt||0)).slice(0,slots)){if(!enabled()||paused())break;await process(t);}}finally{busy=false;}}
    return{observe,tick,status:()=>({queued:tasks.size,inFlight:[...tasks.values()].filter(t=>t.inFlight).length,busy})};
  }
  const api={createQueue};if(typeof module==='object'&&module.exports)module.exports=api;else scope.BlackCatAutomaticAudio=api;
})(typeof globalThis==='object'?globalThis:this);
return module.exports;})();
// END backup-audio-auto inline

function installBackupGuest({ipc,getConfig,getAdapter,getComposer,getBoxText,bridge,pause,downloadClick,openMedia,scrollPage,isNativeInput=()=>false,getNativeMedia,getNativeHistory,automaticAudioFactory}) {
  const Content=backupContent;const Timeline=backupTimeline;const TelegramSource=backupTelegramSource;const WhatsAppSource=backupWhatsAppSource;const waOriginals=new Map();let waHistoryScope='',waHistoryRecords=new Map();let waScope='',waAt=0,waSignature='',waRecords=new Map();let nativeExpected=0;const historySeen=new Map();let nativeScope='',nativeAt=0,nativeSignature='',nativeRecords=new Map();
  let lastDigest='',lastCapture=0,capturing=false,workers=0,awaitingChat=null,lastReadChat='',lastReadSignature='',chatSeenId='',chatSeenAt=0;const pending=new Map(),active=new Set(),failed=new Map();
  const hash=text=>{let n=2166136261;for(const c of String(text)){n^=c.codePointAt(0);n=Math.imul(n,16777619);}return(n>>>0).toString(36);};
  const enabled=()=>getConfig()?.backupWatch===true;
  let scanning=0;
  function queueAsset(asset){const old=failed.get(asset.id);if(pending.has(asset.id)||active.has(asset.id))return;if(old&&old.source===asset.source&&Date.now()-old.at<60000)throw Error('附件传输稍后自动重试');pending.set(asset.id,{...asset,pinned:pin(asset.source,asset.quality==='download-link'?null:[...document.images].find(image=>(image.currentSrc||image.src)===asset.source))});pump();pump();}
  const audioQueue=automaticAudioFactory&&getNativeMedia?automaticAudioFactory({enabled,paused:()=>scanning>0,need:async task=>{const result=await ipc.invoke('backup:needs-original',{chatKey:task.chatKey,messageId:task.messageId,kind:'audio',slot:task.slot,automatic:true,expectedHash:task.hash,expectedBytes:task.size});if(!result?.ok)throw Error(result?.error||'无法核对音频备份');return result.data;},download:(task,options)=>getNativeMedia({messageId:task.messageId,chatId:task.chatId,kind:'audio',expectedHash:task.hash,expectedBytes:task.size,...options}),save:async(task,original,lease)=>{if(!original.source?.startsWith('blob:'))throw Error('音频原件来源无效');queueAsset({id:lease.assetId,kind:'audio',source:original.source,quality:'download-link',name:lease.name||'',width:0,height:0});}}):null;
  function observeAudio(data){if(!audioQueue||location.host!=='web.whatsapp.com')return;const records=waHistoryRecords.size?waHistoryRecords:waRecords,items=[];for(const message of data.messages){const record=records.get(message.id),info=record?.media.length===1?record.media[0]:null;if(info?.kind!=='audio'||!info.expectedHash||!info.size)continue;const assets=(message.assets||[]).filter(a=>a.kind==='audio');if(assets.length!==1)continue;items.push({chatKey:data.chat.key,chatId:record.chatId,messageId:message.id,slot:String(assets[0].slot),hash:info.expectedHash,size:info.size,sentAt:message.sentAt||0});}audioQueue.observe(items);}

  function roots(){if(location.host==='web.whatsapp.com')return Content.whatsappRoots(document);const p=location.host;const selector=p==='web.telegram.org'?'.Message,.ActionMessage[data-message-id],.ActionMessage[id^="message-"]':p==='web.whatsapp.com'?WA_MESSAGES:p.endsWith('facebook.com')?'[role="main"] [data-scope="messages_table"][data-message-id],[role="main"] [aria-roledescription="message"]':'[data-message-id],[class*="messageItem" i]';const nodes=new Set(document.querySelectorAll(selector));for(const el of document.querySelectorAll(getAdapter()?.messages||'[data-no-message]')){const parent=el.closest(selector);if(parent||!p.endsWith('facebook.com'))nodes.add(parent||el.parentElement);}const area=document.querySelector('#main,#MiddleColumn,.MessageList,[role="main"],[class*="chatroomContent" i]');if(area)for(const el of area.querySelectorAll('video,audio,a[download],[class*="imageMessage" i] img,[class*="mediaMessage" i] img'))nodes.add(el.closest(selector)||el.parentElement);return[...nodes].filter(el=>!el.closest('.wam-tr,.wam-float,[contenteditable="true"]')&&![...nodes].some(parent=>parent!==el&&parent.contains(el)));}
  const reactionSelector='.Reactions,.reactions,.Reaction,.reaction,.ReactionButton,[data-reaction],[class*="Reaction"]';
  const customEmojiSelector='custom-emoji,[data-custom-emoji-id],[data-document-id].emoji,.custom-emoji,[class*="customEmoji"],[class*="CustomEmoji"]';
  function emojiValue(value){const v=String(value||'').trim();return v.length<=100&&/^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200d\ufe0e\ufe0f\u20e30-9#*\u{e0020}-\u{e007f}]+$/u.test(v)&&/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(v)?v:'';}
  function emojiFor(el){if(!el)return'';for(const value of[el.getAttribute('data-emoji'),el.getAttribute('data-emoticon'),el.getAttribute('alt'),el.getAttribute('aria-label')]){const found=emojiValue(value);if(found)return found;}return'';}
  function reactionData(root){const rows=[...root.querySelectorAll('.Reaction,.reaction,.ReactionButton,[data-reaction],.Reactions >*,.reactions >*')].filter(el=>!el.querySelector('.Reaction,.reaction,.ReactionButton,[data-reaction]'));const seen=new Set(),result=[];for(const el of rows){const label=emojiFor(el)||[...el.querySelectorAll('img,[data-emoji],[data-emoticon]')].map(emojiFor).find(Boolean)||[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(el.textContent||'')].map(s=>emojiValue(s.segment)).find(Boolean)||'';if(!label&&!el.querySelector('img,canvas,custom-emoji'))continue;const key=label||'custom';if(seen.has(key))continue;seen.add(key);const raw=el.getAttribute('data-count')||el.querySelector('.ReactionCount,.reaction-count,[data-count]')?.textContent||(el.textContent||'').match(/\d+\s*$/)?.[0];const count=Number(raw);result.push({emoji:label,count:Number.isSafeInteger(count)&&count>0?count:1});}return result;}

  const mediaIgnoreSelector=reactionSelector+','+customEmojiSelector+',.sticker-media,.Sticker,.sticker,.AnimatedEmoji'+',[class*="quoted" i],[class*="reply" i]';
  const nativeFor=root=>location.host==='web.whatsapp.com'?(waHistoryRecords.get(root.getAttribute('data-id'))||waRecords.get(root.getAttribute('data-id'))):location.host==='web.telegram.org'&&nativeScope==='telegram:'+location.hash?nativeRecords.get(root.getAttribute('data-message-id')||root.getAttribute('data-mid')||root.getAttribute('data-id')||root.id):null;
  const primaryVideo=root=>!!nativeFor(root)?.media?.some(a=>a.kind==='video')||[...root.querySelectorAll(videoSignals)].some(n=>!n.closest(mediaIgnoreSelector));
  const videoSignals='.video,[class*="video-message"],[class*="videoMessage"],[class*="video-thumb"],[class*="VideoPlay"],video,[data-mime-type^="video/"],[data-media-type="video"],[data-type="video"],[class*="VideoPlayer"],[class*="video-player"],[class*="video-duration"],[class*="video-time"],[data-icon="video-play"],[data-icon="media-play"],[aria-label*="play video" i],[aria-label*="播放视频"]';
  function videoInfo(el,root){if(el.closest(mediaIgnoreSelector))return null;let box=el.tagName==='VIDEO'?el.parentElement:el.closest('[class*="video" i],[data-media-type="video"],[data-mime-type^="video/"],.media-inner,.media-container');if(!box||!root.contains(box)||!box.querySelector(videoSignals)&&!box.matches(videoSignals)){const images=[...root.querySelectorAll('img')].filter(n=>!n.closest(mediaIgnoreSelector)&&!emojiFor(n));if(images.length!==1||images[0]!==el||!primaryVideo(root))return null;box=root;}const video=el.tagName==='VIDEO'?el:box.querySelector('video');const link=box.querySelector('a[download],[data-download-url]');const source=video?.currentSrc||video?.getAttribute('src')||video?.querySelector('source')?.src||link?.getAttribute('data-download-url')||link?.href||'';return{box,video,source:source===el.getAttribute('poster')||el.tagName==='IMG'&&source===(el.currentSrc||el.src)?'':source,name:link?.getAttribute('download')||video?.getAttribute('data-filename')||'影片'};}
  const downloadRequests=new Map(),galleryFailures=new Map();let automaticDownloadClick=false;
  const viewerSelector='.MediaViewer,.media-viewer,#MediaViewer,[data-testid="media-viewer"],[class*="MediaViewer"]';
  async function hydrateOriginals(request={}) {
    const deadline=Date.now()+10000;
    let requested=0,backlog=false;
    const live=()=>{request.checkCancelled?.();return bridge.snapshot()?.conversation;};
    if(location.host==='web.whatsapp.com'&&getNativeMedia){const records=waHistoryRecords.size?waHistoryRecords:waRecords;for(const native of records.values()){request.checkCancelled?.();if(request.messageIds&&!request.messageIds.includes(native.id)||native.media.length!==1)continue;const info=native.media[0],key=native.chatId+'|'+native.id;if(!info.expectedHash||!info.size||waOriginals.get(key)?.hash===info.expectedHash)continue;const needed=await ipc.invoke('backup:needs-original',{chatKey:live()?.key,messageId:native.id,kind:info.kind});if(!needed?.ok||!needed.data?.needed)continue;if(requested>=6||Date.now()>deadline){backlog=true;break;}const original=await getNativeMedia({messageId:native.id,chatId:native.chatId,kind:info.kind,expectedHash:info.expectedHash,expectedBytes:info.size,start:true,retry:request.retry===true});requested++;if(original?.available)waOriginals.set(key,{...original,kind:info.kind,hash:info.expectedHash});else if(original?.pending)backlog=true;}return{requested,backlog};}
    for(const root of roots().reverse()) {
      if(Date.now()>deadline||requested>=6){backlog=true;break;}
      const chat=live(),messageId=root.getAttribute('data-message-id')||root.getAttribute('data-mid')||root.getAttribute('data-id')||root.id;
      if(Array.isArray(request.messageIds)&&!request.messageIds.includes(messageId)&&![...root.querySelectorAll('[id^="album-media-message-"]')].some(el=>request.messageIds.includes(Content.sourceMessageId(el,root))))continue;
      if(!chat?.key||chat.ambiguous||!messageId)continue;
      const native=nativeFor(root)||(location.host==='web.whatsapp.com'?waRecords.get(messageId):null);
      if(native&&native.mediaKnown!==false&&native.media.length===0&&!native.entities.some(e=>/customemoji/i.test(e.type)))continue;
      const perform=async candidate=>{
        if(candidate.button.disabled||candidate.button.getAttribute('aria-disabled')==='true')return false;
        const targetId=candidate.messageId||messageId,nativeInfo=nativeRecords.get(targetId)?.media.find(a=>a.kind===candidate.kind),downloadName=candidate.button.getAttribute('download')||candidate.button.closest('a[download]')?.getAttribute('download')||candidate.name||'';if(!nativeInfo?.name&&nativeInfo?.id&&/^\d+\.[a-z0-9]+$/i.test(downloadName)&&downloadName.split('.')[0]!==nativeInfo.id)throw Error('附件查看器与目标消息不一致，已停止，未写入其他消息');const key=[chat.key,targetId,candidate.kind,candidate.slot||'',candidate.name||''].join('|');
        if(Date.now()-(downloadRequests.get(key)||0)<60000)return false;
        if(live()?.key!==chat.key)throw Error('客户已切换，原附件补存已暂停');
        const prepared=await ipc.invoke('backup:prepare-download',{chatKey:chat.key,title:chat.title,messageId:targetId,kind:candidate.kind,slot:candidate.slot,expectedName:downloadName});
        if(!prepared?.ok||!prepared.data?.ready){if(prepared?.data?.busy)backlog=true;return false;}
        downloadRequests.set(key,Date.now());requested++;automaticDownloadClick=true;
        try{if(typeof downloadClick==='function')await downloadClick(candidate.button);else candidate.button.click();}finally{automaticDownloadClick=false;}
        await pause(500);return true;
      };
      if(location.host==='web.whatsapp.com'&&getNativeMedia&&native?.media.length===1&&native.media[0].expectedHash&&native.media[0].size){const info=native.media[0],originalKey=native.chatId+'|'+messageId;if(waOriginals.get(originalKey)?.hash===info.expectedHash)continue;const needed=await ipc.invoke('backup:needs-original',{chatKey:chat.key,messageId,kind:info.kind});if(!needed?.ok||!needed.data?.needed)continue;if(requested>=6||Date.now()>deadline){backlog=true;break;}const original=await getNativeMedia({messageId,chatId:native.chatId,kind:info.kind,expectedHash:info.expectedHash,expectedBytes:info.size,start:true,retry:request.retry===true});requested++;if(original?.available){waOriginals.set(originalKey,{...original,kind:info.kind,hash:info.expectedHash});continue;}if(original?.pending)backlog=true;continue;}
      const docs=Content.documentAssets(root);
      for(const doc of docs){const button=doc.element.matches(Content.downloadButton)?doc.element:doc.element.querySelector(Content.downloadButton);if(button)await perform({button,kind:doc.kind,name:doc.name,slot:'document:'+hash(doc.name||doc.source)});}
      if(docs.length)continue;
      const isVideo=primaryVideo(root),images=[...root.querySelectorAll('img')].filter(n=>!Content.excluded(n,root)&&!emojiFor(n)),videos=[...root.querySelectorAll('video')].filter(n=>!Content.excluded(n,root));
      const photos=Content.photoEntries(root);
      const direct=root.querySelector('a[download],button[aria-label*="download" i],button[title*="download" i],[role="button"][aria-label*="download" i],button[aria-label*="下载"]');if(isVideo&&direct&&!photos.length){await perform({button:direct,messageId:Content.sourceMessageId(direct,root),kind:'video',slot:'video:0',name:''});continue;}
      const videoEntries=[...root.querySelectorAll('.media-inner')].filter(box=>!box.querySelector('.media-inner')&&!box.closest('.AnimatedEmoji,.Sticker,.sticker')&&(nativeRecords.get(Content.sourceMessageId(box,root))?.media.some(a=>a.kind==='video')||box.querySelector(videoSignals))).map(box=>({box,messageId:Content.sourceMessageId(box,root),kind:'video',slot:'video:0'}));if(isVideo&&!videoEntries.length)videoEntries.push({box:videos[0]||images[0],messageId,kind:'video',slot:'video:0'});const entries=[...photos.map(p=>({...p,kind:'image'})),...videoEntries];if(!entries.length&&!isVideo&&images.length===1)entries.push({box:images[0],messageId,kind:'image'});
      for(const entry of entries) {
        if(!entry.box||entry.box.closest('a[href],.WebPage,.web-page,.LinkPreview,.link-preview,.AnimatedEmoji,.Sticker,.sticker,.sticker-media'))continue;
        if(Date.now()>deadline||requested>=6){backlog=true;break;}
        const key=[chat.key,entry.messageId||messageId,entry.kind,entry.slot||'','viewer'].join('|');
        if(Date.now()-(downloadRequests.get(key)||0)<60000)continue;
        let viewer,started=false;
        try {
          if(openMedia){const opened=await openMedia(entry.box,{chatKey:chat.key,messageId:entry.messageId||messageId,kind:entry.kind,slot:entry.slot});if(typeof opened==='object'&&opened.busy)backlog=true;if(!(typeof opened==='object'?opened.clicked:opened))continue;}
          else if(typeof downloadClick==='function')await downloadClick(entry.box);else entry.box.click();
          for(let i=0;i<30;i++){request.checkCancelled?.();await pause(100);viewer=[...document.querySelectorAll(viewerSelector)].find(v=>v.getClientRects().length);if(viewer)break;}
          if(!viewer){const attempts=(galleryFailures.get(key)||0)+1;galleryFailures.set(key,attempts);if(attempts<3)backlog=true;continue;}galleryFailures.delete(key);
          if(live()?.key!==chat.key)throw Error('客户已切换，原附件补存已暂停');
          let button;
          for(let i=0;i<30;i++){button=viewer.querySelector(Content.downloadButton);if(button)break;request.checkCancelled?.();await pause(150);}
          if(button)started=await perform({button,messageId:entry.messageId||messageId,kind:entry.kind,slot:entry.slot,name:''});
          if(started)downloadRequests.set(key,Date.now());
        } finally {
          if(viewer){const close=viewer.querySelector('button[aria-label="Close" i],[role="button"][aria-label="Close" i],button[title="Close" i],button[aria-label*="关闭"],[data-testid="media-viewer-close"]');if(close){if(typeof downloadClick==='function')await downloadClick(close);else close.click();}else document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));for(let i=0;i<10&&viewer.getClientRects().length;i++)await pause(150);if(viewer.getClientRects().length)throw Error('附件查看器未关闭，已暂停扫描，避免读取其他内容');}
        }
      }
    }
    return{backlog,requested};
  }

  function whatsappNativeMessage(record){const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'',assets=record.media.map(info=>{const original=waOriginals.get(record.chatId+'|'+record.id);return{slot:info.kind+':0',kind:info.kind,name:info.name||'',source:original?.hash===info.expectedHash?original.source:'',quality:original?.hash===info.expectedHash?'download-link':'page',width:info.width||0,height:info.height||0}});return{id:record.id,text:record.text||'',links:Content.normalizeLinks((record.text?.match(/https?:\/\/[^\s<>]+/g)||[]).map(url=>({url}))),direction:record.direction,author:record.author||'',sentAt:record.sentAt,time:record.sentAt?new Date(record.sentAt).toISOString():'',timePrecision:'second',timeZone,sourceIdentity:'platform',sourceConfidence:'whatsapp-cache',...(record.mediaKnown?{sourceMediaComplete:true,sourceMediaKinds:record.media.map(m=>m.kind)}:{}),...(!record.mediaKnown&&!record.text?{unsupportedType:'whatsapp-source-type'}:{}),mediaManifest:record.media.map((info,i)=>({slot:assets[i].slot,kind:info.kind,sourceMessageId:record.id,sourceMediaId:info.id,expectedBytes:info.size,expectedHash:info.expectedHash,expectedName:info.name,width:info.width,height:info.height})),assets,reactions:[]};}
  const threadSignature=()=>roots().map(r=>r.getAttribute('data-message-id')||r.getAttribute('data-mid')||r.getAttribute('data-id')||r.id||hash(r.textContent)).join('|');
  function textOf(el){if(!el)return'';const c=el.cloneNode(true);c.querySelectorAll('.wam-tr,.wam-float,.wam-send-hint,script,style,'+(getAdapter()?.strip||'script')).forEach(n=>n.remove());c.querySelectorAll(reactionSelector).forEach(n=>n.remove());for(const image of c.querySelectorAll('img')){const value=emojiFor(image);if(value)image.replaceWith(value);}for(const item of c.querySelectorAll(customEmojiSelector)){if(!item.isConnected&&!c.contains(item))continue;item.replaceWith(emojiFor(item)||emojiValue(item.textContent)||'[自定义表情]');}c.querySelectorAll('video,audio,iframe,source,img').forEach(n=>n.remove());const probe=document.createElement('div');probe.className='wam-backup-probe';probe.setAttribute('aria-hidden','true');Object.assign(probe.style,{position:'fixed',left:'-100000px',top:'0',opacity:'0',pointerEvents:'none',width:Math.max(1,el.getBoundingClientRect().width)+'px',whiteSpace:getComputedStyle(el).whiteSpace});probe.append(c);document.body.append(probe);try{return(c.innerText||c.textContent||'').trim();}finally{probe.remove();}}
  async function read(){if(location.host==='web.whatsapp.com'){const scope=bridge.snapshot()?.conversation?.key||'';if(scope!==waHistoryScope){waHistoryRecords.clear();waHistoryScope=scope;}const ids=roots().map(root=>root.getAttribute('data-id')).filter(Boolean),sig=ids.join('|');if(scope!==waScope||sig!==waSignature||Date.now()-waAt>15000){const rows=await WhatsAppSource.readMessages(ids);waScope=scope;waSignature=sig;waAt=Date.now();waRecords=new Map(rows.map(m=>[m.id,m]));}}if(location.host==='web.telegram.org'){const chatKey=bridge.snapshot()?.conversation?.key||'',ids=[...new Set(roots().flatMap(root=>[root,...root.querySelectorAll('[data-message-id]')]).map(root=>root.getAttribute('data-message-id')||root.getAttribute('data-mid')||root.getAttribute('data-id')||root.id).filter(Boolean))],sig=ids.join('|');if(chatKey!==nativeScope||sig!==nativeSignature||Date.now()-nativeAt>15000){const records=await TelegramSource.readCachedChat(location.hash.slice(1),ids);nativeExpected=Number(records.sourceExpectedMessages)||0;nativeScope=chatKey;nativeSignature=sig;nativeAt=Date.now();nativeRecords=new Map(records.map(m=>[m.id,m]));}await Timeline.activateTelegramDates(roots(),pause);}const snap=bridge.snapshot();const chat=snap?.conversation;if(!chat?.key||chat.ambiguous)return null;const signature=threadSignature();if(roots().length&&(awaitingChat?.key===snap.current?.key&&signature===awaitingChat.previous||lastReadChat&&chat.key!==lastReadChat&&signature===lastReadSignature))return null;lastReadChat=chat.key;lastReadSignature=signature;chat.listKey=snap.current?.key?location.host==='web.telegram.org'?'telegram:'+snap.current.key:location.host==='web.whatsapp.com'?'whatsapp:'+snap.current.key:location.protocol==='chrome-extension:'?'line:'+snap.current.key:'facebook:'+snap.current.key:chat.key;const messages=[];let ordinal=0;
    for(const root of roots()){
      const ad=getAdapter();const content=[...root.querySelectorAll(ad.messages)].filter(el=>!ad.skip?.(el)&&(!ad.leafOnly||!el.querySelector(ad.messages)));if(root.matches(ad.messages))content.unshift(root);
      const facebook=location.host.endsWith('facebook.com')?Timeline.facebookLabel(root):null;const cached=nativeFor(root)||(location.host==='web.whatsapp.com'?(waHistoryRecords.get(root.getAttribute('data-id'))||waRecords.get(root.getAttribute('data-id'))):null),service=!!cached?.service||root.matches('.ActionMessage,[data-message-type="service"]'),timing=Timeline.readTime(root,location.host==='web.telegram.org'?'telegram':location.host==='web.whatsapp.com'?'whatsapp':'other');if(facebook){timing.time=facebook.time;timing.timeTitle=facebook.time;timing.sentAt=Timeline.parseAbsolute(facebook.time);timing.timePrecision='minute';}const native=cached&&(timing.editedAt||0)<=(cached.editedAt||0)?cached:null;if(cached&&!native)nativeRecords.delete(cached.id);const text=native&&!native.service&&native.sourceConfidence!=='whatsapp-cache'&&typeof native.text==='string'?native.text:content.map(textOf).filter(Boolean).join('\n')||(service?textOf(root):'');if(native?.sentAt>0){timing.sentAt=native.sentAt;timing.timePrecision='second';if(!Timeline.parseAbsolute(timing.time))timing.time=new Intl.DateTimeFormat(document.documentElement.lang||'en-US',{dateStyle:'medium',timeStyle:'medium',timeZone:timing.timeZone}).format(new Date(native.sentAt));}const time=timing.time;
      const waDirection=location.host==='web.whatsapp.com'?(waOutgoing(root)?'true':'false'):null;
      const direction=native?.direction||facebook?.direction||(waDirection?waDirection==='true'?'outgoing':'incoming':root.closest('.own,.message-out,[data-direction="outgoing"],[data-is-outgoing="true"]')||root.querySelector('[data-is-outgoing="true"]')?'outgoing':root.closest('.message-in,.Message:not(.own),[data-direction="incoming"],[data-is-outgoing="false"]')?'incoming':'unknown');
      const nativeId=root.getAttribute('data-message-id')||root.getAttribute('data-mid')||root.getAttribute('data-id')||root.id;
      const nativeEmoji=!!(native&&native.media.length===0&&emojiValue(native.text));const photos=nativeEmoji?[]:Content.photoEntries(root).filter(photo=>!nativeRecords.get(photo.messageId)?.media.some(a=>a.kind==='video'));const photoNodes=new Set(photos.flatMap(p=>[...p.box.querySelectorAll('img,canvas')]));const documents=Content.documentAssets(root),documentNodes=new Set(documents.map(d=>d.element));const assets=[],ignoredAssetSlots=[],ignoredImageSlots=[],videoBoxes=new Set(),reactions=reactionData(root);let slot=0;for(const el of root.querySelectorAll('img,video,audio,a[download],[data-download-url]')){
        if(nativeEmoji&&el.closest('.AnimatedEmoji,.emoji-only')){ignoredAssetSlots.push(String(slot++));continue;}if(documentNodes.has(el)||photoNodes.has(el))continue;
        if(Content.excluded(el,root)||el.matches('[class*="emoji" i], [alt="emoji"]')||/profile picture|头像/i.test(el.getAttribute('alt')||''))continue;
        if(el.tagName==='IMG'&&((el.naturalWidth&&el.naturalWidth<40)||(el.width&&el.width<30)))continue;
        const assetSlot=slot++;if(emojiFor(el)||el.closest(reactionSelector)||el.closest(customEmojiSelector)){ignoredAssetSlots.push(String(assetSlot));continue;}
        const info=videoInfo(el,root);if(el.tagName==='IMG'&&info){ignoredImageSlots.push(String(assetSlot));if(info.video||videoBoxes.has(info.box))continue;videoBoxes.add(info.box);assets.push({slot:assetSlot,kind:'video',sourceMessageId:Content.sourceMessageId(el,root),source:info.source,name:info.name,quality:info.source?'download-link':'page',width:0,height:0});continue;}
        const kind=el.closest('.WebPage,.web-page,.LinkPreview,.link-preview')?'link-preview':el.matches('.sticker-media')||el.closest('.Sticker,.sticker,[data-message-type="sticker"]')?'sticker':el.closest('.AnimatedEmoji')?'emoji':el.tagName==='IMG'?'image':el.tagName==='VIDEO'?'video':el.tagName==='AUDIO'?'audio':/\.(mp4|webm|mov|m4v|mkv)(?:$|[?#])/i.test(el.getAttribute('download')||el.href||'')?'video':'file';
        const source=el.getAttribute('data-download-url')||el.currentSrc||el.getAttribute('src')||el.querySelector?.('source')?.src||(el.hasAttribute('download')?el.href:'')||'';
        if(source&&!/^(https?:|blob:|data:)/.test(source))continue;
        if(location.host==='web.whatsapp.com'&&native?.mediaKnown&&kind==='image'&&(!native.media.length||native.media.length===1&&!['image','video','sticker'].includes(native.media[0].kind))){ignoredImageSlots.push(String(assetSlot));continue;}
        assets.push({slot:assetSlot,kind,sourceMessageId:Content.sourceMessageId(el,root),source,name:el.getAttribute('download')||el.getAttribute('alt')||'',quality:el.hasAttribute('download')||el.hasAttribute('data-download-url')?'download-link':'page',width:el.naturalWidth||el.videoWidth||0,height:el.naturalHeight||el.videoHeight||0});
      }
      if(nativeEmoji)for(let i=0;i<Content.photoEntries(root).length;i++)ignoredImageSlots.push('photo:'+i);
      for(const box of root.querySelectorAll('[id^="album-media-message-"]')){const owner=Content.sourceMessageId(box,root),info=nativeRecords.get(owner)?.media.find(a=>a.kind==='video');if(info&&!assets.some(a=>a.kind==='video'&&String(a.sourceMessageId||nativeId)===owner))assets.push({slot:'video:0',sourceMessageId:owner,kind:'video',source:info.blobUrl||'',name:info.name||'影片',quality:'page',width:info.width,height:info.height});}
      if(primaryVideo(root)&&!assets.some(a=>a.kind==='video')&&!documents.some(a=>a.kind==='video')){const info=native?.media.find(a=>a.kind==='video');assets.push({slot:'video:0',kind:'video',source:info?.blobUrl||'',name:info?.name||'影片',quality:info?.blobUrl&&info.size?'download-link':'page',width:info?.width||0,height:info?.height||0});}
      for(const photo of photos){const el=photo.element,source=el?.tagName==='IMG'?(el.currentSrc||el.getAttribute('src')||''):'';assets.push({slot:photo.slot,kind:'image',sourceMessageId:photo.messageId,source,name:'',quality:'page',width:el?.naturalWidth||0,height:el?.naturalHeight||0});}
      for(const doc of documents)assets.push({slot:'document:'+hash(doc.name||doc.source),kind:doc.kind,sourceMessageId:Content.sourceMessageId(doc.element,root),source:doc.source,name:doc.name,quality:doc.quality,width:0,height:0});
      if(location.host==='web.whatsapp.com'&&native?.mediaKnown&&native.media.length===1&&!assets.some(a=>a.kind===native.media[0].kind)){const info=native.media[0];assets.push({slot:info.kind+':0',kind:info.kind,source:'',name:info.name||'',quality:'page',width:info.width||0,height:info.height||0});}
      if(location.host==='web.whatsapp.com'&&native?.media.length===1){const original=waOriginals.get(native.chatId+'|'+nativeId),info=native.media[0];if(original?.hash===info.expectedHash&&original.kind===info.kind)for(const asset of assets)if(asset.kind===info.kind){asset.source=original.source;asset.quality='download-link';asset.name=info.name||asset.name;}}
      const links=Content.linksFrom(root,location.href);if(native&&native.mediaKnown!==false&&native.media.length===0&&links.length)for(const asset of assets)if(asset.kind==='image')asset.kind='link-preview';
      const fallback=direction+'|'+text+'|'+time+'|'+assets.map(a=>a.source).join('|')+'|'+ordinal++;
      const id=nativeId||'rendered:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fallback))),b=>b.toString(16).padStart(2,'0')).join('');
      const unsupportedType=root.querySelector(customEmojiSelector)?'custom-emoji-resource':!text&&!assets.length&&!reactions.length&&!links.length?(root.getAttribute('data-message-type')||'unrecognized-message'):'';messages.push({id,text,links,_domText:root.querySelector('[id^="album-media-message-"]')?content.map(textOf).filter(Boolean).join('\n'):'',...(location.host==='web.telegram.org'&&nativeExpected?{sourceExpectedMessages:nativeExpected}:{}),...(unsupportedType?{unsupportedType}: {}),direction,...(service?{service:true}:{}),...timing,time:String(time).trim(),...(/^\d+(?:\.\d+)?$/.test(nativeId||'')?{sourceOrder:nativeId}:{}),author:native?.author||facebook?.author||root.getAttribute('data-sender-name')||root.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text')?.match(/^\[[^\]]*\]\s*(.*?):\s*$/)?.[1]||textOf(root.querySelector('.message-title,.sender-name'))||textOf(root.closest('.sender-group-container')?.querySelector('.message-title,.sender-name')),entities:native?.entities||[],sourceConfidence:native?.sourceConfidence||(native?'telegram-cache':'dom'),...(assets.length&&assets.every(a=>a.kind==='sticker')?{sourceMediaComplete:true,sourceMediaKinds:assets.map(a=>a.kind)}:{}),...(assets.length&&assets.every(a=>a.kind==='emoji')&&root.querySelector('.AnimatedEmoji')&&!root.querySelector('custom-emoji,.CustomEmoji,[data-custom-emoji-id]')?{sourceEmojiResource:true,sourceMediaComplete:true,sourceMediaKinds:assets.map(a=>a.kind)}:{}),...(nativeEmoji?{sourceEmoji:true}:{}),...(native&&native.mediaKnown!==false&&new Set([nativeId,...[...root.querySelectorAll('[data-message-id]')].map(n=>n.getAttribute('data-message-id'))]).size===1&&native.media.length===assets.length&&native.media.every(n=>assets.filter(a=>a.kind===n.kind).length===native.media.filter(m=>m.kind===n.kind).length)?{sourceMediaComplete:true,sourceMediaKinds:native.media.map(n=>n.kind)}:{}),mediaManifest:assets.map(a=>{const matches=native?.media.filter(n=>n.kind===a.kind)||[],info=matches.length===1?matches[0]:null;return{slot:String(a.slot),kind:a.kind,sourceMessageId:nativeId,...(info?{sourceMediaId:info.id,...(info.name?{expectedName:info.name}:{}),...(info.expectedHash?{expectedHash:info.expectedHash}:{}),expectedBytes:info.size,width:info.width,height:info.height}:{} )};}),...(native?.albumId?{albumId:native.albumId}:{}),...(native?.replyTo?{replyTo:native.replyTo}:{}),...(Math.max(native?.editedAt||0,timing.editedAt||0)?{editedAt:Math.max(native?.editedAt||0,timing.editedAt||0)}:{}),sourceIdentity:nativeId?'platform':'rendered',assets,reactions,ignoredAssetSlots,ignoredImageSlots});
    }
    if(location.host==='web.whatsapp.com'&&waHistoryScope===chat.key&&waHistoryRecords.size){const visible=new Map(messages.map(m=>[m.id,m])),ordered=[];for(const record of waHistoryRecords.values()){const current=visible.get(record.id);ordered.push(current&&!(current.unsupportedType&&!current.text)?current:whatsappNativeMessage(record));visible.delete(record.id);}ordered.push(...visible.values());messages.splice(0,messages.length,...ordered);}
    if(location.host==='web.telegram.org'){const expanded=messages.flatMap(m=>TelegramSource.splitAlbum(m,nativeRecords));messages.splice(0,messages.length,...expanded);}if(!historySeen.has(chat.key))historySeen.set(chat.key,new Set());for(const m of messages)historySeen.get(chat.key).add(m.id);for(let i=0;i<messages.length;i++){if(i)messages[i].sourcePrevious=messages[i-1].id;if(i+1<messages.length)messages[i].sourceNext=messages[i+1].id;}return{chat,messages};
  }
  function pin(source,image){if(!/^(blob:|data:)/.test(source)&&!(/^https?:/.test(source)&&new URL(source).origin===location.origin))return null;return fetch(source,{credentials:'same-origin',redirect:'error'}).then(r=>{if(!r.ok||/text\/html/i.test(r.headers.get('content-type')||''))throw Error('原媒体尚未加载');const range=r.headers.get('content-range');if(r.status===206){const m=(range||'').match(/^bytes 0-(\d+)\/(\d+)$/);if(!m||Number(m[1])+1!==Number(m[2]))throw Error('影片仅加载了片段，待下载原片');}return{reader:r.body.getReader(),mime:r.headers.get('content-type')||''};}).catch(async error=>{if(image?.complete&&image.naturalWidth){try{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(blob)return{reader:blob.stream().getReader(),mime:'image/png'};}catch{}}return{error};});}
  async function pump(){if(workers>=2||!enabled())return;const item=[...pending.values()].find(a=>!active.has(a.id));if(!item)return;active.add(item.id);workers++;
    let token;try{const claim=await ipc.invoke('backup:claim',{id:item.id,upgrade:item.quality==='download-link'||item.width>0,quality:item.quality,width:item.width,height:item.height});if(!claim.ok)throw Error(claim.error);if(claim.data.busy){await pause(700);return;}if(claim.data.saved){pending.delete(item.id);return;}token=claim.data.token;
      const pinned=await(item.pinned||pin(item.source));if(/^https?:/.test(item.source)&&(!pinned||pinned.error)){const r=await ipc.invoke('backup:fetch',{token,url:item.source});if(!r.ok)throw Error(r.error);}else{const resource=pinned;if(!resource||resource.error)throw resource?.error||Error('资源未加载');while(true){const {done,value}=await resource.reader.read();if(done)break;for(let offset=0;offset<value.length;offset+=512*1024){const r=await ipc.invoke('backup:chunk',{token,bytes:value.subarray(offset,offset+512*1024)});if(!r.ok)throw Error(r.error);}}const r=await ipc.invoke('backup:asset-finish',{token,mime:resource.mime});if(!r.ok)throw Error(r.error);}
      pending.delete(item.id);failed.delete(item.id);
    }catch(error){failed.set(item.id,{at:Date.now(),source:item.source});pending.delete(item.id);await ipc.invoke('backup:asset-fail',{id:item.id,token,error:String(error.message||error)}).catch(()=>{});}finally{workers--;active.delete(item.id);if(enabled())setTimeout(pump,100);}}
  async function stableRead(){if([...document.querySelectorAll(viewerSelector)].some(v=>v.getClientRects().length))return null;const id=()=>{const s=bridge.snapshot();return[s?.conversation?.key||'',s?.current?.key||'',location.pathname+location.hash].join('|');};const first=id();if(first!==chatSeenId){chatSeenId=first;chatSeenAt=Date.now();}if(Date.now()-chatSeenAt<1500)return null;const before=threadSignature();const data=await read();if(!data)return null;await pause(500);if(id()!==first||threadSignature()!==before)return null;return data;}
  async function capture(force=false){if(!enabled())return;if(capturing){if(force){await pause(50);return capture(true);}return;}capturing=true;try{let data=await stableRead();for(let i=0;force&&!data&&i<16;i++){await pause(500);data=await stableRead();}if(!data){if(force)throw Error('无法识别当前对话，请确认聊天已加载');return;}const signature=hash(JSON.stringify(data));if(!force&&signature===lastDigest&&Date.now()-lastCapture<20000)return;lastDigest=signature;lastCapture=Date.now();for(let i=0;i<data.messages.length;i+=200){const result=await ipc.invoke('backup:ingest',{chat:data.chat,messages:data.messages.slice(i,i+200),retryOriginals:force===true});if(!result?.ok)throw Error(result?.error||'归档失败');for(const asset of result.data.assets){const old=failed.get(asset.id);if(pending.has(asset.id)||active.has(asset.id)||(old&&old.source===asset.source&&Date.now()-old.at<3600000))continue;pending.set(asset.id,{...asset,pinned:pin(asset.source,asset.quality==='download-link'?null:[...document.images].find(image=>(image.currentSrc||image.src)===asset.source))});}}observeAudio(data);pump();pump();return data;}catch(error){ipc.sendToHost('backup:guest-error',String(error.message||error));if(force)throw error;}finally{capturing=false;}}
  function scrollContainer(){const first=roots()[0];for(let n=first?.parentElement;n&&n!==document.body;n=n.parentElement)if(n.clientHeight>100&&/(auto|scroll)/.test(getComputedStyle(n).overflowY))return n;return null;}
  async function scanStep(request){const check=()=>request.checkCancelled?.();check();if(request.retry){failed.clear();downloadRequests.clear();galleryFailures.clear();historySeen.clear();}if(!enabled())throw Error('备份未启用');if(getConfig()?.active&&!request.idle)throw Error('账号正在使用，历史扫描待补充');const box=getComposer(getAdapter());if(box&&getBoxText(box))throw Error('当前聊天有未发送草稿，历史扫描已跳过');if(request.ref){const before=bridge.snapshot(),current=before?.current?.key;if(current!==request.ref.key)awaitingChat={key:request.ref.key,previous:threadSignature()};await bridge.open(request.ref,true);check();if(awaitingChat?.key===request.ref.key){const end=Date.now()+10000;let ready=false;while(Date.now()<end){check();await pause(250);check();const snap=bridge.snapshot(),loading=document.querySelector('#main [role="progressbar"],#MiddleColumn [role="progressbar"],[role="main"] [aria-busy="true"]');if(snap?.current?.key===request.ref.key&&!loading&&(threadSignature()!==awaitingChat.previous||!roots().length)){ready=true;awaitingChat=null;break;}}if(!ready)throw Error('聊天已定位，但消息内容尚未加载；已保留为待补存');}}if(request.latest){const bottom=scrollContainer();if(bottom){bottom.scrollTop=bottom.scrollHeight;bottom.dispatchEvent(new Event('scroll',{bubbles:true}));await pause(500);}}check();await capture(true);const mediaBatch=await hydrateOriginals(request);check();const captured=await capture(true);check();const chatKey=captured?.chat?.key||bridge.snapshot()?.conversation?.key;if(mediaBatch.backlog)return{done:false,waitingForMedia:true,chatKey};if(request.latest)return{done:true,coverage:'recent',chatKey};// Media is saved by its own workers; never block the next customer's text on a slow download.
let container=scrollContainer();if(location.host==='web.whatsapp.com'&&getNativeHistory){const scopes=[...new Set([...waRecords.values()].map(m=>m.chatId).filter(Boolean))];if(scopes.length===1){const history=await Promise.race([getNativeHistory({chatId:scopes[0],anchors:roots().map(r=>r.getAttribute('data-id')).filter(Boolean)}),pause(25000).then(()=>({available:false}))]);check();if(history?.available&&history.records?.length){waHistoryScope=chatKey;waHistoryRecords=new Map(history.records.map(m=>[m.id,m]));await capture(true);return{done:!history.loaded,loading:!!history.loaded,coverage:'start-unverified',chatKey,sourceObserved:historySeen.get(chatKey)?.size||0,anchor:'native:'+history.records[0].id+'|'+history.records.length,atStart:history.boundary===true};}}container=scrollContainer();}if(!container)return{done:true,coverage:'start-unverified',chatKey,anchor:roots()[0]?.getAttribute('data-message-id')||''};const old=container.scrollTop;if(scrollPage){if(old<=2){await scrollPage(container,Math.min(200,container.clientHeight*.4),'history');await pause(150);}await scrollPage(container,-Math.max(300,container.clientHeight*.8),'history');}else{container.scrollTop-=Math.max(1,container.clientHeight*.70);container.dispatchEvent(new Event('scroll',{bubbles:true}));}await pause(1000);check();await capture(true);const nextMedia=await hydrateOriginals(request);check();await capture(true);check();if(nextMedia.backlog)return{done:false,waitingForMedia:true,chatKey};const first=roots()[0];return{done:false,chatKey,sourceExpectedMessages:nativeExpected,sourceObserved:historySeen.get(chatKey)?.size||0,position:container.scrollTop,stationary:Math.abs(old-container.scrollTop)<2,atStart:container.scrollTop<=2,loading:!!container.querySelector('[role="progressbar"],[aria-busy="true"]'),anchor:first?.getAttribute('data-message-id')||first?.getAttribute('data-id')||first?.id||hash(first?.textContent||''),pending:pending.size};}
  async function step(request){scanning++;try{return await scanStep(request);}finally{scanning--;}}
  const timer=setInterval(()=>{if(!enabled()){for(const [id,a]of pending)if(!active.has(id)){a.pinned?.then(r=>r.reader?.cancel()).catch(()=>{});pending.delete(id);}return;}capture().then(()=>audioQueue?.tick()).catch(()=>{});pump();pump();},2500);
  const interrupt=event=>{if(enabled()&&event.isTrusted&&!automaticDownloadClick&&!isNativeInput())ipc.invoke('backup:interrupt-download',{}).catch(()=>{});};document.addEventListener('keydown',interrupt,{capture:true,passive:true});
  document.addEventListener('pointerdown',event=>{interrupt(event);if(!enabled()||automaticDownloadClick)return;let n=event.target,download=false;for(let i=0;n&&i<6;i++,n=n.parentElement)if(/download|下载/i.test([n.getAttribute?.('aria-label'),n.getAttribute?.('title'),n.getAttribute?.('class'),n.getAttribute?.('data-icon')].join(' '))){download=true;break;}if(!download)return;const root=roots().find(r=>r.contains(event.target));const messageId=root&&(root.getAttribute('data-message-id')||root.getAttribute('data-mid')||root.getAttribute('data-id')||root.id);const chat=bridge.snapshot()?.conversation;if(chat?.key&&messageId)ipc.send('backup:download-context',{chatKey:chat.key,title:chat.title,messageId});},{capture:true,passive:true});
  window.addEventListener('beforeunload',()=>{clearInterval(timer);for(const a of pending.values())a.pinned?.then(r=>r.reader?.cancel()).catch(()=>{});});
  return{capture,step,pending:()=>pending.size};
}
const blackcatBackupGuest=installBackupGuest({ipc:ipcRenderer,getConfig:()=>cfg,getAdapter:adapter,getComposer:findComposer,getBoxText:readBox,bridge:blackcatInboxBridge,pause:sleep,downloadClick:press,scrollPage:scrollForBackup,isNativeInput:()=>backupNativeInput,getNativeMedia:request=>webFrame.executeJavaScript(backupWhatsAppSource.mediaScript(request)),getNativeHistory:request=>webFrame.executeJavaScript(backupWhatsAppSource.historyScript(request)),automaticAudioFactory:backupAudioAuto.createQueue,openMedia:async(el,context)=>{const marker=Date.now().toString(36)+Math.random().toString(36).slice(2);el.scrollIntoView({block:'center',behavior:'instant'});await sleep(200);el.setAttribute('data-blackcat-media-open',marker);const previousNativeInput=backupNativeInput;backupNativeInput=true;try{const r=await ipcRenderer.invoke('backup:open-media',{...context,marker});if(!r.ok)throw Error(r.error);return r.data;}finally{backupNativeInput=previousNativeInput;el.removeAttribute('data-blackcat-media-open');}}});

// Only system notification sounds are controlled. Customer voice and video
// playback remains untouched.
window.addEventListener('blackcat:message-notification',()=>ipcRenderer.sendToHost('wam:message-notification'));
// Telegram Web hands each notification (title = chat, body = message or reaction) to its service worker; it already
// skips muted chats and old messages. Copy it to 黑猫SCRM so the popup shows at once with the exact text.
if (location.host === 'web.telegram.org') {
  webFrame.executeJavaScript(`(()=>{if(window.__blackcatSwHook||typeof ServiceWorker==='undefined')return;window.__blackcatSwHook=true;const send=ServiceWorker.prototype.postMessage;ServiceWorker.prototype.postMessage=function(message,...rest){try{const p=message&&message.type==='showMessageNotification'&&message.payload;if(p)window.postMessage({__blackcatNotify:{title:String(p.title||''),body:String(p.body||''),id:String(p.chatId||'')+':'+String(p.messageId||''),silent:p.isSilent===true}},location.origin);}catch{}return send.call(this,message,...rest);};})()`).catch(() => {});
  window.addEventListener('message', (event) => {
    const n = event.source === window && event.data?.__blackcatNotify;
    if (n) ipcRenderer.sendToHost('wam:page-notification', { title: String(n.title).slice(0, 120), body: String(n.body).slice(0, 500), id: String(n.id).slice(0, 80), silent: n.silent === true });
  });
}
// "保存到备注": the message, picture, video, voice note or file under the right-click, with who sent it and when, goes to
// the app's notes. A message bubble inside the open conversation (never the chat list on the left):
const MESSAGE_ROOT = WA_MESSAGES + ', #MiddleColumn .Message, .MessageList .Message, #MiddleColumn [id^="message-"], [role="main"] [data-scope="messages_table"], [role="main"] [role="row"], [data-message-id], [data-mid]';
const messageAt = (el) => el?.closest?.(MESSAGE_ROOT) || null;
const messageId = (root) => root?.getAttribute('data-id') || root?.id || '';
// Pictures often sit under a transparent overlay, so look through everything at the click point. Small ones on screen
// (profile photos: Messenger's are 100 px files drawn at 28 px) are not the message's picture.
const bigEnough = (el) => (el.naturalWidth || el.videoWidth || el.width || 0) >= 60 && el.getBoundingClientRect().width >= 60;
const pictureAt = (x, y) => document.elementsFromPoint(x, y).find((el) => /^(IMG|VIDEO)$/.test(el.tagName) && bigEnough(el) && !el.closest('[class*="avatar" i]'));
const bigPicture = (root) => [...root.querySelectorAll('img, video')].find((i) => bigEnough(i) && !i.closest('[class*="avatar" i], [class*="emoji" i], [class*="reaction" i]'));
const looksLikeVoice = (root) => !!root.querySelector('[aria-label="Voice message"], [aria-label*="voice message" i], [aria-label*="语音"], [data-icon*="ptt"], [data-icon*="audio-play"], .Audio.voice, .Audio [class*="waveform" i], [class*="voice" i]');
// Icon names: older WhatsApp uses data-icon="…", the new layout <svg><title>ic-…</title> (e.g. ic-videocam-filled)
const iconNames = (root) => [...root.querySelectorAll('[data-icon], svg title')].map((n) => (n.tagName.toLowerCase() === 'title' ? n.textContent : n.getAttribute('data-icon'))).join(' ');
const looksLikeVideo = (root) => !!root.querySelector('video, [aria-label*="Play video" i], [aria-label*="播放影片"], .message-media-duration') || /videocam|msg-video|media-play|play-arrow|media-gif|ic-gif/i.test(iconNames(root));
const downloadControl = (root) => root.querySelector('[aria-label^="Download" i], [title^="Download" i], [aria-label*="下载"], [title*="下载"], [data-icon*="download"], .File .file-icon, .File') || [...root.querySelectorAll('svg title')].find((t) => /download/i.test(t.textContent))?.closest('svg') || null;
const looksLikeFile = (root) => !looksLikeVoice(root) && !!(root.querySelector('.File, [aria-label*="document" i], [title*=".pdf" i], [title*=".doc" i], [title*=".xls" i], [title*=".zip" i]') || /document|doc-|ic-(pdf|doc|xls|ppt|zip|file|attach)|file-/i.test(iconNames(root)) || (downloadControl(root) && !bigPicture(root)));
// WhatsApp's new layout draws a video's preview as a background picture, not an <img>
async function posterOf(root) {
  const urls = [...root.querySelectorAll('[style*="background-image"]')].map((el) => /url\("?([^")]+)"?\)/.exec(el.getAttribute('style') || '')?.[1]).filter((u) => /^(data:image|blob:|https:)/.test(u || ''));
  for (const u of urls.reverse()) {
    const img = new Image(); img.src = u;
    try { await img.decode(); const frame = frameOf(img); if (frame) return frame; } catch {}
  }
  return '';
}
const kindOf = (root, media) => (looksLikeVoice(root) ? 'voice' : looksLikeVideo(root) ? 'video' : media ? 'image' : looksLikeFile(root) ? 'file' : 'text');
// The page's own "Download" in the menu it opened for this message (Telegram and WhatsApp both offer one for media);
// using it saves a video that was never played
const DOWNLOAD_WORDS = /^(download|下载|下載|save as|另存为|lưu|unduh|скачать)/i;
const pageDownloadItem = () => [...document.querySelectorAll('[role="menuitem"], .MenuItem, [role="menu"] [role="button"], [role="application"] li, [role="application"] [role="button"]')]
  .find((el) => shown(el) && !el.closest('.wam-notes-chip') && (DOWNLOAD_WORDS.test((el.getAttribute('aria-label') || el.textContent || '').trim()) || !!el.querySelector('.icon-download, [data-icon*="download"]')));
// One photo or video of an album (several in one message, e.g. WhatsApp's 2×2 grid): each is its own clickable tile
const albumTiles = (root) => {
  const tiles = [...root.querySelectorAll('[role="button"]')].filter((t) => t.querySelector('[style*="background-image"], img') && !t.querySelector(':scope [role="button"] [style*="background-image"], :scope [role="button"] img') && t.getBoundingClientRect().width >= 60);
  return tiles.length >= 2 ? tiles : [];
};
// Media shown from another site (Facebook's pictures, videos and files) that the page may not copy: the app downloads it with the chat's own sign-in
const fetchByApp = async (url) => { const r = await ipcRenderer.invoke('clips:fetch-url', { url }); if (!r?.ok) throw new Error(r?.error || '无法下载'); return r.data; };
// Message text without menus, buttons or icon-font names (Telegram draws its menu inside the message)
const cleanText = (node) => {
  const c = node.cloneNode(true);
  c.querySelectorAll('.wam-tr, .wam-float, .wam-send-hint, script, style, button, svg, i, [role="menu"], [role="menuitem"], [class*="menu" i], [class*="reaction" i]').forEach((n) => n.remove());
  c.querySelectorAll('img[alt]').forEach((i) => i.replaceWith(i.getAttribute('alt')));
  return (c.textContent || '').replace(/ic-[\w-]+/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
};
const frameOf = (pic) => {
  const w = pic.naturalWidth || pic.videoWidth, h = pic.naturalHeight || pic.videoHeight;
  if (!w || !h) return '';
  const scale = Math.min(1, 1600 / Math.max(w, h)), canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(pic, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
};
// Voice notes and videos: the pages only fetch them when played (WhatsApp as a blob, Telegram through its own media
// link). A page-side hook notes every audio source and keeps the last few video blobs (WhatsApp drops its blob link when
// the viewer closes), and a click on a voice note or video ties the next new one to that message.
const AUDIO_HOOK = `(()=>{if(window.__blackcatAudio)return;const list=window.__blackcatAudio=[];const vids=window.__blackcatVideo=[];const keep=(u,type)=>{list.push({u,t:Date.now(),type});if(list.length>40)list.shift();};
const make=URL.createObjectURL;URL.createObjectURL=function(o){const u=make.apply(this,arguments);try{if(o instanceof Blob&&String(o.type).startsWith('video/')&&o.size>0){vids.push({u,t:Date.now(),b:o});if(vids.length>3)vids.shift();}else if(o instanceof Blob&&/audio|ogg|opus|mpeg/i.test(o.type))keep(u,o.type);}catch{}return u;};
const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){try{const u=this.currentSrc||this.src;if(this instanceof HTMLAudioElement&&u&&!/^data:/.test(u))keep(u,'media');}catch{}return play.apply(this,arguments);};
window.addEventListener('message',(e)=>{const q=e.source===window&&e.data&&e.data.__blackcatVideoAsk;if(!q)return;const v=vids.find((x)=>x.u===q.u)||(q.since?vids.filter((x)=>x.t>=q.since).pop():null);window.postMessage({__blackcatVideoBlob:{id:q.id,blob:v?v.b:null}},location.origin);});
window.addEventListener('message',async(e)=>{const q=e.source===window&&e.data&&e.data.__blackcatFetchAsk;if(!q)return;let blob=null,error='';try{const parts=[];let at=0,total=-1,type='';for(let i=0;i<4000;i++){const r=await fetch(q.u,{headers:{Range:'bytes='+at+'-'}});if(!r.ok)throw Error('HTTP '+r.status);type=type||r.headers.get('content-type')||'';const b=await r.blob();if(r.status===200){parts.length=0;parts.push(b);break;}const t=Number(String(r.headers.get('content-range')||'').split('/').pop());if(t>0)total=t;if(!b.size)break;parts.push(b);at+=b.size;if(at>209715200)throw Error('200 MB');if(total<0||at>=total)break;}blob=new Blob(parts,{type});}catch(x){error=String(x&&x.message||x);}window.postMessage({__blackcatFetchBlob:{id:q.id,blob,error}},location.origin);});})()`;
const voiceUrls = new Map(), videoClicks = new Map();
if (/^web\.(whatsapp\.com|telegram\.org)$/.test(location.host)) {
  webFrame.executeJavaScript(AUDIO_HOOK).catch(() => {});
  window.addEventListener('click', (event) => {
    const root = messageAt(event.target);
    if (!root) return;
    if (!looksLikeVoice(root) && looksLikeVideo(root)) { videoClicks.set(messageId(root), Date.now() - 200); return; }
    if (!looksLikeVoice(root) || !event.target.closest?.('button, [role="button"]')) return;
    const id = messageId(root), since = Date.now() - 200;
    (async () => { for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 250)); const u = await webFrame.executeJavaScript(`(window.__blackcatAudio||[]).filter(x=>x.t>=${since}).map(x=>x.u).pop()||''`).catch(() => ''); if (u) { voiceUrls.set(id, u); return; } } })();
  }, true);
}
// Ask the page-side hook for a blob and wait for its answer
const askPage = (ask, answer, payload, wait) => new Promise((resolve) => {
  const id = Math.random().toString(36).slice(2), timer = setTimeout(() => { window.removeEventListener('message', got); resolve(null); }, wait);
  function got(event) { const r = event.source === window && event.data?.[answer]; if (!r || r.id !== id) return; clearTimeout(timer); window.removeEventListener('message', got); resolve(r); }
  window.addEventListener('message', got);
  window.postMessage({ [ask]: { id, ...payload } }, location.origin);
});
// A video blob kept by the page-side hook, by its link or as the newest one since the video was clicked
const keptVideo = async (u, since) => (await askPage('__blackcatVideoAsk', '__blackcatVideoBlob', { u: u || '', since: since || 0 }, 3000))?.blob || null;
// The whole file behind a media link, fetched by the page itself (Telegram's media links are answered by its service worker)
const pageFetch = async (u) => { const r = await askPage('__blackcatFetchAsk', '__blackcatFetchBlob', { u }, 300000); if (r?.error) throw new Error(/200 MB/.test(r.error) ? '影片超过 200 MB，无法保存' : r.error); return r?.blob || null; };
const MAX_VIDEO = 200 * 1024 * 1024;
// Telegram serves media through links that answer one byte range at a time, so a plain fetch gets only the first piece
// (the cut-off file then never plays). Ask for every piece until the whole file is in.
async function fetchWhole(src) {
  const pieces = []; let at = 0, total = Infinity, type = '';
  while (at < total) {
    const r = await fetch(src, { headers: { Range: 'bytes=' + at + '-' } });
    if (!r.ok) throw new Error('影片载入失败（' + r.status + '），请先播放一遍再保存');
    type = type || r.headers.get('content-type') || '';
    const piece = new Uint8Array(await r.arrayBuffer());
    if (r.status === 200) return { bytes: piece, type };
    const m = /\/(\d+)\s*$/.exec(r.headers.get('content-range') || '');
    if (m) total = Number(m[1]);
    if (!piece.length) break;
    pieces.push(piece); at += piece.length;
    if (at > MAX_VIDEO) throw new Error('影片超过 200 MB，无法保存');
    if (!m) break;
  }
  if (Number.isFinite(total) && at < total) throw new Error('影片没有完整载入，请再试一次');
  const bytes = new Uint8Array(at); let o = 0;
  for (const p of pieces) { bytes.set(p, o); o += p.length; }
  return { bytes, type };
}
const blobBytes = async (blob) => (blob?.size ? { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type } : null);
// What the saved bytes really are; a cut-off MP4 (no index, or a last box running past the end) is refused
const box = (b, at) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const u32 = (b, at) => b[at] * 16777216 + b[at + 1] * 65536 + b[at + 2] * 256 + b[at + 3];
function videoType(b) {
  if (b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  if (b.length < 16 || box(b, 4) !== 'ftyp') return '';
  let at = 0, index = false;
  while (at + 8 <= b.length) {
    let size = u32(b, at);
    if (size === 1) size = u32(b, at + 8) * 4294967296 + u32(b, at + 12); else if (size === 0) size = b.length - at;
    if (size < 8) return '';
    if (box(b, at + 4) === 'moov') index = true;
    at += size;
  }
  if (!index || at > b.length) return '';
  return box(b, 8) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
}
// Files: the page's own download button is clicked once the main process is ready to catch that one download
const waitForDownload = (token, wait) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { ipcRenderer.removeListener('clips:download-done', done); reject(new Error('文件没有开始下载，请先在聊天里点一下文件让它下载，再保存')); }, wait);
  function done(_e, r) { if (r?.token !== token) return; clearTimeout(timer); ipcRenderer.removeListener('clips:download-done', done); r.error ? reject(new Error(r.error)) : resolve(r); }
  ipcRenderer.on('clips:download-done', done);
});
// Close the page's own menu: Esc goes to what has focus (WhatsApp listens on the focused menu item)
const closePageMenu = () => (document.activeElement || document).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
// The page's "Download" menu item; when its menu has already closed, open it again on the same message
let reopeningMenu = false;
async function menuDownloadItem(target, x, y) {
  let item = pageDownloadItem();
  if (item || !target?.isConnected) return item;
  reopeningMenu = true;
  try { target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, button: 2, clientX: x, clientY: y })); } finally { reopeningMenu = false; }
  for (let i = 0; i < 15 && !item; i++) { await new Promise((r) => setTimeout(r, 100)); item = pageDownloadItem(); }
  if (!item) closePageMenu();
  return item;
}
// Click the page's own download (a button on the message or "Download" in its menu) and catch that one download.
// A video can take minutes: Telegram first loads the whole file, then hands it over.
async function pageDownload(control, long) {
  const ready = await ipcRenderer.invoke('clips:expect-download', { long });
  if (!ready?.ok) throw new Error(ready?.error || '无法保存文件');
  press(control.closest('button, [role="button"], [role="menuitem"], .MenuItem, li, a') || control);
  if (long) ipcRenderer.sendToHost('notes:captured', { notice: '正在下载影片，下载完成后会自动保存到备注…' });
  return { token: ready.data, ...(await waitForDownload(ready.data, long ? 600000 : 60000)) };
}
// A picture: copied off the screen, or (when the page may not copy it, e.g. Facebook's pictures) downloaded by the app
async function pictureInto(out, pic) {
  try { out.imageData = frameOf(pic); } catch { out.imageData = ''; }
  if (out.imageData) return;
  const src = pic.currentSrc || pic.src || '';
  if (!/^https:/.test(src)) throw new Error('图片还没载入完成，请稍后再试');
  const got = await fetchByApp(src);
  if (!/^image\//.test(got.mime)) throw new Error('图片无法保存');
  Object.assign(out, { fileToken: got.token, mime: got.mime });
}
async function captureForNotes(request) {
  try {
    // The chip passes what was under the right-click; by the time it is clicked the page's own menu covers that spot
    const x = Number(request.x) || 0, y = Number(request.y) || 0, at = request.target || document.elementFromPoint(x, y);
    if (!at) throw new Error('没有找到这条消息');
    // Selected text can be saved from anywhere; otherwise the click must be on a message (an empty stand-in keeps the lookups below simple)
    // A photo or video open in the page's full-screen viewer is outside any message but can be saved as it is (WhatsApp lays
    // a clear layer over it, so the app's menu only offers "save to notes"; the big picture under the click is what is meant)
    const bigAt = !request.root && !messageAt(at) && !request.selection ? (request.media || pictureAt(x, y)) : null;
    const viewerMedia = bigAt && bigAt.getBoundingClientRect().width >= 200 ? bigAt : null;
    if (!request.root && !messageAt(at) && !viewerMedia && (!request.selection || request.kind !== 'text')) throw new Error('请在打开的对话里右键某条消息');
    const root = request.root || messageAt(at) || document.createElement('div');
    const ad = adapter(), parts = ad ? [...root.querySelectorAll(ad.messages)].filter((n) => !ad.skip?.(n)).map(cleanText).filter(Boolean) : [];
    const pre = (root.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '').match(/^\[([^\]]*)\]\s*(.*?):\s*$/);
    const author = pre?.[2] || (root.querySelector('.message-title, .sender-title, [data-sender-name]')?.textContent || '').trim();
    const time = pre?.[1] || root.querySelector('time')?.getAttribute('datetime') || (root.querySelector('.message-time, .time')?.textContent || '').trim();
    const media = request.media || (request.root ? null : pictureAt(x, y)) || bigPicture(root);
    let kind = request.kind;
    if (viewerMedia && (kind === 'text' || !request.kind)) kind = viewerMedia.tagName === 'VIDEO' ? 'video' : 'image';
    // "保存到备注" on a photo, video, voice note or file without words saves that item itself
    // (a message with words stays a text message; a forwarded video's header is not its words)
    if (kind === 'text' && !request.selection && !parts.length) kind = kindOf(root, media);
    const out = { kind, text: request.selection || parts.join('\n'), author: author.slice(0, 120), time: String(time).slice(0, 60), imageData: '' };
    const send = () => { out.text = String(out.text || '').slice(0, 20000); ipcRenderer.sendToHost('notes:captured', out); };
    const inViewer = !!viewerMedia;
    // One tile of an album: the page's menu downloads the whole album (WhatsApp: a ZIP); the app keeps only this one,
    // matched by its length (e.g. 0:16) or its place in the album. The viewer is not opened.
    const tile = request.tile?.isConnected ? request.tile : null;
    if (tile && (kind === 'video' || kind === 'image')) {
      const item = (request.downloadItem?.isConnected && request.downloadItem) || (request.target && await menuDownloadItem(request.target, x, y));
      if (!item) throw new Error('没有找到下载，请再右键一次');
      const length = (tile.textContent.match(/(\d+):(\d\d)/) || []).slice(1).map(Number);
      out.pick = { index: request.tiles.indexOf(tile), count: request.tiles.length, seconds: length.length ? length[0] * 60 + length[1] : 0 };
      try { out.imageData = await posterOf(tile); } catch {}
      const got = await pageDownload(item, true);
      Object.assign(out, { fileToken: got.token, mime: got.mime || '' });
      return send();
    }
    if (kind === 'image') {
      if (!media) throw new Error('没有找到图片，请等图片载入完成');
      await pictureInto(out, media);
    } else if (kind === 'video') {
      const video = (media?.tagName === 'VIDEO' && media) || root.querySelector('video'), src = video?.currentSrc || video?.src || '';
      try { out.imageData = video?.readyState >= 2 ? frameOf(video) : (media?.tagName === 'IMG' ? frameOf(media) : ''); } catch { out.imageData = ''; }
      if (!out.imageData) out.imageData = await posterOf(root);
      // Best: the page's own "Download" (no need to play the video first). Not in the viewer: the video playing there is
      // already the whole file, and opening a menu (or Esc) there would close the viewer.
      const item = inViewer ? null : request.downloadItem?.isConnected ? request.downloadItem : request.target ? await menuDownloadItem(request.target, x, y) : null;
      if (item) {
        const got = await pageDownload(item, true);
        Object.assign(out, { fileToken: got.token, mime: got.mime || 'video/mp4' });
        out.text = String(out.text || '').slice(0, 20000);
        return ipcRenderer.sendToHost('notes:captured', out);
      }
      // A video file on another site (Facebook): the app downloads it
      if (/^https:/.test(src) && location.host !== 'web.telegram.org') {
        const got = await fetchByApp(src).catch(() => null);
        if (got && /^video\//.test(got.mime)) { Object.assign(out, { fileToken: got.token, mime: got.mime }); return send(); }
      }
      // Otherwise try each place the whole file can come from, keeping the first that is a complete, playable video
      const tries = [];
      if (/^https?:/.test(src)) tries.push(async () => blobBytes(await pageFetch(src)), () => fetchWhole(src));
      if (src.startsWith('blob:')) tries.push(async () => blobBytes(await (await fetch(src)).blob()), async () => blobBytes(await keptVideo(src)));
      if (videoClicks.has(messageId(root))) tries.push(async () => blobBytes(await keptVideo('', videoClicks.get(messageId(root)))));
      if (!tries.length) throw new Error('影片还没载入：请右键影片，在出现的菜单旁点「🎬 保存影片到备注」');
      let got = null, problem = null;
      for (const attempt of tries) {
        try { const r = await attempt(); if (r?.bytes?.length && videoType(r.bytes)) { got = r; break; } } catch (error) { problem = error; }
      }
      if (!got) throw new Error(problem && /200 MB/.test(problem.message) ? problem.message : '影片还没完整载入：请先点开把影片播放一遍（或等它下载完），再保存');
      if (got.bytes.length > MAX_VIDEO) throw new Error('影片超过 200 MB，无法保存');
      out.videoBytes = got.bytes; out.mime = videoType(got.bytes);
    } else if (kind === 'voice') {
      const src = voiceUrls.get(messageId(root)) || root.querySelector('audio')?.currentSrc || '';
      if (!src) throw new Error('请先播放这段语音（播一下就行），再保存');
      const blob = await (await fetch(src)).blob();
      out.audioBytes = new Uint8Array(await blob.arrayBuffer()); out.mime = blob.type || 'audio/ogg';
      out.text = out.text || (root.querySelector('[aria-label*="Voice message" i]') ? '' : '');
    } else if (kind === 'file') {
      // "Download" in the page's own menu is the surest; the button on the message may only open the file
      const control = (request.downloadItem?.isConnected && request.downloadItem) || (request.target && await menuDownloadItem(request.target, x, y)) || downloadControl(root);
      // Messenger shows a file as a link to Facebook's file server
      const link = !control && root.querySelector('a[href*="fbsbx.com"], a[href*="fbcdn.net"], a[download][href^="https:"]');
      if (!control && !link) throw new Error('没有找到这个文件的下载按钮');
      const got = control ? await pageDownload(control, false) : await fetchByApp(link.href);
      Object.assign(out, { fileToken: got.token, text: out.text || got.name || '', fileName: got.name });
    } else if (!out.text) out.text = cleanText(root);
    out.text = String(out.text || '').slice(0, 20000);
    ipcRenderer.sendToHost('notes:captured', out);
  } catch (error) { ipcRenderer.sendToHost('notes:captured', { error: error.message === 'The operation is insecure.' ? '这个文件无法保存（平台限制）' : error.message }); }
}
// The app's own menu (pages that keep the normal right-click, e.g. Messenger) reports a position that can be off from
// the page's (it may count from the app window); use where the right-click really happened in the page
let lastRightClick = null;
ipcRenderer.on('notes:capture', (_event, request) => {
  const r = lastRightClick && Date.now() - lastRightClick.at < 30000 ? lastRightClick : null;
  captureForNotes(r ? { ...request, x: r.x, y: r.y, target: r.target, media: r.media } : request);
});
// WhatsApp and Telegram replace the right-click menu with their own, so the app's menu never shows. When a page does
// that on a message, a small save chip appears beside the click as well; the page's own menu keeps working.
let notesChip = null;
const hideNotesChip = () => { notesChip?.remove(); notesChip = null; };
window.addEventListener('contextmenu', (event) => {
  if (reopeningMenu) return;
  hideNotesChip();
  const x = event.clientX, y = event.clientY, target = event.target;
  lastRightClick = { x, y, target, media: pictureAt(x, y) || null, at: Date.now() };
  setTimeout(() => {
    const root = messageAt(target);
    // Also on the big photo or video of the page's full-screen viewer
    const shownBig = !root ? pictureAt(x, y) : null, viewer = shownBig && shownBig.getBoundingClientRect().width >= 200 ? shownBig : null;
    if (!event.defaultPrevented || !adapter() || (!root && !viewer)) return;
    const selection = String(window.getSelection() || '').slice(0, 20000), media = viewer || pictureAt(x, y) || bigPicture(root);
    // One tile of an album saves just that photo or video
    const tiles = root && !selection ? albumTiles(root) : [], tile = tiles.find((t) => t.contains(target)) || null;
    const kind = viewer ? (viewer.tagName === 'VIDEO' ? 'video' : 'image') : selection ? 'text' : tile ? (/videocam|play-arrow|media-play|msg-video/i.test(iconNames(tile)) ? 'video' : 'image') : kindOf(root, media);
    const chip = document.createElement('div'); chip.className = 'wam-float wam-notes-chip';
    chip.style.cssText = 'position:fixed;z-index:2147483647;display:flex;gap:4px;padding:4px;background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.2);font:13px/1.2 "Segoe UI","Microsoft YaHei",sans-serif';
    let menuItem = null;
    const button = (label, as) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.style.cssText = 'border:0;border-radius:6px;padding:6px 10px;background:#3370ff;color:#fff;cursor:pointer;font:inherit;white-space:nowrap';
      b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); }, true);
      b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation(); hideNotesChip();
        // A video (or file) goes through "Download" in the page's own menu when it has one; that click also closes the menu
        // (not in the viewer, which has no such menu; an album tile's photo goes through the album download too)
        const downloadItem = !viewer && (as === 'video' || as === 'file' || tile) ? (pageDownloadItem() || (menuItem?.isConnected ? menuItem : null)) : null;
        // Otherwise close the page's own menu that is still open (never in the viewer: Esc would close the viewer itself)
        if (!downloadItem && !viewer) closePageMenu();
        captureForNotes({ kind: as, x, y, selection, root, target, media, downloadItem, tile, tiles });
      }, true);
      chip.append(b);
    };
    // Sit just above-left of the click, where the platform's own menu (which opens down-right) does not cover it
    const place = () => {
      const r = chip.getBoundingClientRect();
      chip.style.left = Math.max(4, Math.min(innerWidth - r.width - 4, x - r.width - 6)) + 'px';
      chip.style.top = Math.max(4, Math.min(innerHeight - r.height - 4, y - r.height - 6)) + 'px';
    };
    button(selection ? '📌 保存选中文字' : { voice: '🎤 保存语音到备注', video: '🎬 保存影片到备注', image: '🖼 保存图片到备注', file: '📄 保存文件到备注' }[kind] || '📌 保存到备注', kind);
    document.documentElement.append(chip); place();
    // A message the page offers to download but that is not recognised as media (e.g. a document in a new layout) can be saved as a file
    setTimeout(() => {
      menuItem = pageDownloadItem();
      if (menuItem && kind === 'text' && !selection && notesChip === chip) { button('📄 保存文件到备注', 'file'); place(); }
    }, 300);
    notesChip = chip; setTimeout(() => { if (notesChip === chip) hideNotesChip(); }, 8000);
  }, 0);
}, true);
// Close the chip on a click elsewhere, the mouse wheel or Esc (not on page-driven scrolling, which the menus cause)
window.addEventListener('mousedown', (e) => { if (notesChip && !notesChip.contains(e.target)) hideNotesChip(); }, true);
window.addEventListener('wheel', hideNotesChip, true);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.isTrusted) hideNotesChip(); }, true);
ipcRenderer.on('blackcat:system',(_event,policy)=>{
  const value={notifications:policy?.notifications!==false,notificationSound:policy?.notificationSound!==false,hostNotification:location.hostname==='web.telegram.org',managedMessageSound:policy?.managedMessageSound===true};
  webFrame.executeJavaScript(`(()=>{const value=${JSON.stringify(value)};const key='__blackcatNotificationPolicy';if(window[key]){window[key].value=value;if(!value.notifications)for(const n of window[key].open)n.close();return;}const state={value,open:new Set()};Object.defineProperty(window,key,{value:state});const Native=window.Notification;if(typeof Native!=='function')return;class QuietNotification extends EventTarget{constructor(title,options){super();this.title=String(title);this.body=options?.body||'';}close(){this.dispatchEvent(new Event('close'));}}const Wrapped=new Proxy(Native,{construct(target,args){if(state.value.managedMessageSound)window.dispatchEvent(new Event('blackcat:message-notification'));if(!state.value.notifications||state.value.hostNotification)return new QuietNotification(args[0],args[1]);const options={...(args[1]||{})};if(state.value.managedMessageSound||!state.value.notificationSound)options.silent=true;const item=Reflect.construct(target,[args[0],options]);state.open.add(item);item.addEventListener('close',()=>state.open.delete(item),{once:true});return item;},get(target,key){if(key==='permission'&&!state.value.notifications)return'denied';if(key==='requestPermission')return callback=>{if(!state.value.notifications){callback?.('denied');return Promise.resolve('denied');}return target.requestPermission(callback);};return Reflect.get(target,key,target);}});window.Notification=Wrapped;})()`).catch(()=>{});
});
