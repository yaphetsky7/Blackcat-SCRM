const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const shortcut=require('../translation-shortcut');let checks=0;
const check=(value,message)=>{assert(value,message);checks++;};
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
  const source=fs.readFileSync(path.join(__dirname,'../webview-preload.js'),'utf8');
  const inline=source.slice(source.indexOf('// BEGIN translation-shortcut inline'),source.indexOf('// END translation-shortcut inline'));
  check(inline.includes(fs.readFileSync(path.join(__dirname,'../translation-shortcut.js'),'utf8')),'Sandbox shortcut helper stays identical to the renderer helper');
  const fragment=source.slice(source.indexOf('// Manual shortcut mode'),source.indexOf('let previewTimer = null;'));
  const box={value:'你好',isConnected:true},outside={value:'Other field'},listeners={},sent=[],requests=[],floats=[];
  const settings={outgoing:{enabled:true,source:'auto',target:'en',route:'google'},shortcut:{enabled:true,accelerator:'Ctrl+T'}};
  const c={translationShortcut:shortcut,window:{addEventListener:(n,f)=>listeners[n]=f},document:{documentElement:{dataset:{}}},clearTimeout,
    previewTimer:null,previewGeneration:0,translatedDraft:null,busy:false,preview:{},cfg:{active:true},chatId:'one',settings:()=>settings,
    adapter:()=>({sendButton:'button'}),composerOf:t=>t===box?box:null,readBox:b=>b.value.trim(),findComposer:()=>box,
    findSendButton:()=>({contains:t=>t==='send-button'}),englishUi:()=>false,ourClick:false,
    previewKey:()=>c.chatId+'|'+JSON.stringify(settings.outgoing),showFloat:(_b,h,b,e)=>floats.push({hint:h,body:b,error:e}),hideFloat:()=>{},failureReasons:e=>String(e),
    request:async r=>{requests.push(r);return{ok:true,text:'Hello'};},setBox:async(b,v)=>{b.value=v;return true;},send:async b=>{sent.push(b.value);b.value='';}
  };
  vm.createContext(c);vm.runInContext(fragment,c);
  function key(value,flags={},target=box){const e={key:value,code:value.length===1?'Key'+value.toUpperCase():value,target,ctrlKey:false,altKey:false,shiftKey:false,metaKey:false,isComposing:false,repeat:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...flags};listeners.keydown(e);return e;}
  return{c,box,outside,listeners,sent,requests,floats,settings,key};
}
(async()=>{
 check(shortcut.normalize().enabled===false,'Legacy accounts keep the shortcut disabled');
 check(shortcut.normalize().accelerator==='Ctrl+T','The default translation shortcut is Ctrl+T');
 check(shortcut.parse('control + SHIFT + y')==='Ctrl+Shift+Y','Custom combinations are canonicalized');
 check(!shortcut.parse('Enter')&&!shortcut.parse('Ctrl+Enter')&&!shortcut.parse('Shift+T'),'Shortcut cannot replace sending, newlines or ordinary text');
 check(!shortcut.matches({key:'t',code:'KeyT',ctrlKey:true,shiftKey:true},{enabled:true,accelerator:'Ctrl+T'}),'Extra modifiers do not accidentally match');
 check(!shortcut.fromEvent({key:'t',code:'KeyT',ctrlKey:true,isComposing:true}),'IME composition cannot trigger translation');
 {
  const f=fixture();f.key('t',{ctrlKey:true});await tick();check(f.requests.length===1&&f.box.value==='Hello'&&!f.sent.length,'Ctrl+T fills the translated draft without sending');
  check(f.floats.at(-1).hint.includes('Enter'),'Translation completion asks the user to press Enter');
  f.box.value='Hello, edited';f.key('Enter');await tick();check(f.sent[0]==='Hello, edited'&&f.requests.length===1,'Enter sends the reviewed or edited text without translating it again');
 }
 {
  const f=fixture();f.settings.shortcut.enabled=false;f.key('Enter');await tick();check(f.requests.length===1&&f.sent[0]==='Hello','Default mode retains one-Enter translate and send');
 }
 {
  const f=fixture();f.key('Enter');await tick();check(f.requests.length===0&&f.sent[0]==='你好','Manual mode sends the current text directly when Enter is used');
 }
 {
  const f=fixture();f.settings.shortcut.accelerator='Alt+Y';f.key('t',{ctrlKey:true});await tick();check(!f.requests.length,'Old key stops working after a custom shortcut is saved');f.key('y',{altKey:true});await tick();check(f.box.value==='Hello'&&!f.sent.length,'Custom shortcut translates without sending');
 }
 {
  const f=fixture();f.c.request=async()=>({ok:false,error:'Unavailable'});f.key('t',{ctrlKey:true});await tick();check(f.box.value==='你好'&&!f.sent.length&&f.floats.at(-1).error,'A failed translation preserves the original and sends nothing');
 }
 {
  const f=fixture();let resolve;f.c.request=()=>new Promise(r=>resolve=r);f.key('t',{ctrlKey:true});f.key('Enter');await tick();check(!f.sent.length,'Enter is blocked while a translation is pending');f.box.value='新的内容';resolve({ok:true,text:'Stale'});await tick();check(f.box.value==='新的内容'&&!f.sent.length,'Typing while waiting cannot be overwritten by a stale translation');
 }
 {
  const f=fixture();let resolve;f.c.request=()=>new Promise(r=>resolve=r);f.key('t',{ctrlKey:true});f.c.chatId='two';resolve({ok:true,text:'Wrong customer'});await tick();check(f.box.value==='你好'&&!f.sent.length,'Changing customer while waiting discards the old result');
 }
 {
  const f=fixture();f.c.setBox=async()=>false;f.key('t',{ctrlKey:true});await tick();check(!f.sent.length&&f.floats.at(-1).error&&!f.c.busy,'Editor insertion failure never sends the original and releases the busy state');
 }
 {
  const f=fixture();f.key('t',{ctrlKey:true,repeat:true});f.key('Enter',{repeat:true});await tick();check(!f.requests.length&&!f.sent.length,'Holding keys cannot translate or send repeatedly');
  const shift=f.key('Enter',{shiftKey:true}),ime=f.key('Enter',{isComposing:true}),outside=f.key('t',{ctrlKey:true},f.outside);check(!shift.prevented&&!ime.prevented&&!outside.prevented,'Newlines, IME confirmation and unrelated fields are unaffected');
 }
 {
  const f=fixture();f.settings.outgoing.enabled=false;const e=f.key('Enter');f.key('t',{ctrlKey:true});await tick();check(!e.prevented&&!f.requests.length&&!f.sent.length,'Outgoing translation disabled leaves the native editor alone');
 }
 {
  const f=fixture();f.listeners.click({isTrusted:true,target:'send-button',preventDefault(){},stopImmediatePropagation(){}});await tick();check(f.sent[0]==='你好'&&!f.requests.length,'Manual-mode send button sends the editor text without retranslation');
 }
 {
  const f=fixture();f.settings.shortcut.enabled=false;f.key('Enter',{altKey:true});await tick();check(f.sent[0]==='你好'&&!f.requests.length,'Alt+Enter retains original-text sending');
 }
 {
  const f=fixture();f.c.request=async()=>({ok:true,text:'你好',same:true});f.key('t',{ctrlKey:true});await tick();check(f.box.value==='你好'&&!f.sent.length,'Same-language text remains reviewable and is not auto-sent by the shortcut');
 }
 {
  const text=fs.readFileSync(path.join(__dirname,'../renderer/hub.js'),'utf8'),fragment=text.slice(text.indexOf('  let hubTranslateBusy='),text.indexOf('  function queueAutomatic',text.indexOf('  let hubTranslateBusy=')));
  const nodes=Object.fromEntries(['hub-reply','hub-send','hub-send-status','hub-reply-form'].map(id=>[id,{value:'你好',disabled:false,dataset:{},textContent:'',listeners:{},addEventListener(n,f){this.listeners[n]=f;}}]));
  const config={outgoing:{enabled:true,target:'en'},shortcut:{enabled:true,accelerator:'Ctrl+T'}},sent=[];let requestCount=0,resolve;
  const c={BlackCatTranslationShortcut:shortcut,$:id=>nodes[id],selected:{accountId:'a',ref:{key:'one'}},findAcc:()=>({id:'a'}),translateOf:()=>config,outgoingFor:()=>config.outgoing,local:zh=>zh,
    window:{api:{translate:async()=>{requestCount++;return{ok:true,text:'Hello'};}}},api:async()=>({}),exclusiveCommand:async(_id,_action,r)=>sent.push(r.text),accountErrors:new Map(),refreshAI:async()=>{}};
  nodes['hub-reply-form'].requestSubmit=()=>{c.submitted=nodes['hub-reply-form'].listeners.submit({preventDefault(){}});};vm.createContext(c);vm.runInContext(fragment,c);
  const event=(key,extra={})=>({key,code:key==='t'?'KeyT':key,ctrlKey:false,preventDefault(){},stopPropagation(){},...extra});
  nodes['hub-reply'].listeners.keydown(event('t',{ctrlKey:true}));await tick();check(nodes['hub-reply'].value==='Hello'&&!sent.length,'Unified composer shortcut also translates without sending');
  nodes['hub-reply'].listeners.keydown(event('Enter'));await c.submitted;check(sent[0]==='Hello'&&requestCount===1,'Unified composer Enter sends the translation without a second request');
  nodes['hub-reply'].value='你好';c.window.api.translate=()=>new Promise(r=>resolve=r);nodes['hub-reply'].listeners.keydown(event('t',{ctrlKey:true}));nodes['hub-send'].disabled=false;nodes['hub-reply'].listeners.keydown(event('Enter'));await tick();check(sent.length===1,'Unified composer cannot send while translation is pending, even if its UI rerenders');resolve({ok:true,text:'Reviewed'});await tick();
 }
 console.log(JSON.stringify({passed:true,checks,realMessagesSent:0,networkRequests:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
