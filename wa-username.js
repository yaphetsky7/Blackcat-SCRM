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
