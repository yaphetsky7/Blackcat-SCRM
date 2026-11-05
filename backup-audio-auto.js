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
