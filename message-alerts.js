(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BlackCatMessageAlerts=factory();})(typeof window==='undefined'?globalThis:window,()=>{
 function create({onCount,play,getPolicy,isOnline,now=Date.now,warmup=4000,onNotify=()=>{},schedule=setTimeout,settleMs=4000}){const states=new Map();let lastAny=-Infinity;
  const state=id=>{if(!states.has(id))states.set(id,{count:0,initialized:false,titleMode:false,rows:new Map(),created:now(),readyAt:now()+warmup,lastRing:-Infinity,lastNotify:-Infinity,login:null});return states.get(id);};
  function ring(id){const s=state(id),p=getPolicy();if(!isOnline(id)||now()<s.readyAt||p.notificationSound===false||p.accountSounds?.[id]===false||now()-s.lastRing<2500||now()-lastAny<350)return false;s.lastRing=now();lastAny=now();play(id);return true;}
  function alert(id,popups=1,exact=false){const s=state(id);if(isOnline(id)&&now()>=s.readyAt&&(exact||now()-s.lastNotify>=1500)){s.lastNotify=now();if(getPolicy().notifications!==false)for(let i=0;i<Math.min(3,popups);i++)onNotify(id);}return ring(id);}
  function count(id,n,notify=false){if(!Number.isSafeInteger(n)||n<0)return;const s=state(id),old=s.count,first=!s.initialized;s.count=n;s.initialized=true;if(first||n!==old)onCount(id,n);if(notify&&!first&&n>old)alert(id);}
  return{reset(id){states.delete(id);state(id);},login(id,value){const s=state(id);if(s.login!==value){s.login=value;s.readyAt=now()+warmup;if(value==='out')count(id,0);}},title(id,title){const s=state(id);
   // Telegram Web flashes "1 notification" in the title for new messages (it keeps chats it considers open at 0 unread).
   // The number counts every message and reaction Telegram would notify about since the page last had focus. Right after
   // the page loads it already includes old unseen ones, so that first number is only a baseline. A higher number, or a
   // lower one (Telegram restarts counting once the chat was viewed), means something new; badge alerts just before count.
   const blink=String(title).trim().match(/^(\d+)\s+(?:new\s+)?(?:notifications?|messages?)$|^(\d+)\s*条新?(?:通知|消息)$/i);if(blink){const n=Number(blink[1]||blink[2]);
    if(s.blinkBase===undefined&&now()-s.created<60000)s.blinkBase=n;const base=s.blinkBase??0,fresh=n>base?n-base:n<base?n:0;s.blinkBase=n;s.blinkSeen=now();
    // Several messages can land between two flashes; one popup each (up to 3), minus the one a badge already announced
    const popups=fresh-(now()-(s.lastHint??-Infinity)<4000?1:0);if(fresh>0)s.lastHint=-Infinity;if(popups>0)alert(id,popups,true);return;}
   const match=String(title).match(/[（(](\d+)\+?[）)]/);if(match){s.bareSince=null;const first=!s.titleMode;s.titleMode=true;count(id,Number(match[1]),!first);}else if(s.titleMode&&/^(?:Telegram|WhatsApp|Messenger(?: Web)?|Facebook|LINE|WeChat|微信|TikTok)(?:\s*[-–|]\s*(?:Web|Messenger))?$/i.test(String(title).trim())){if(s.bareSince)return;const since=s.bareSince=now();schedule(()=>{if(s.bareSince===since){s.bareSince=null;count(id,0);}},settleMs);}},snapshot(id,data){const s=state(id);for(const row of data?.conversations||[])if(row?.key&&Number.isFinite(row.unread))s.rows.set(row.key,Math.max(0,Math.floor(row.unread)));if(Number.isSafeInteger(data?.unreadTotal))count(id,data.unreadTotal);else if(!s.titleMode)count(id,[...s.rows.values()].reduce((a,b)=>a+b,0));const last=data?.messages?.at(-1);if((data?.events||[]).some(e=>e.type==='thread'&&last?.direction==='incoming'&&last.id===e.incomingId||e.type==='hint'&&e.reason==='unread-increase')&&now()-(s.blinkSeen??-Infinity)>10000){s.lastHint=now();alert(id);}},notification:alert,get:id=>({...state(id),rows:undefined})};
 }
 return{create};
});
