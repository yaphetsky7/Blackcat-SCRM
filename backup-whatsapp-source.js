(function(scope){
  // Only project messages whose exact IDs were observed in the current chat.
  // Encryption keys, session data and unrelated object stores are never read.
  function fileHash(value){if(typeof value!=='string')return'';if(/^[a-f0-9]{64}$/i.test(value))return value.toLowerCase();try{const bytes=atob(value);return bytes.length===32?[...bytes].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join(''):'';}catch{return'';}}
  function projectMessage(key,value,id){
    if(typeof key!=='string'||String(value?.id)!==key||!(key===id||key.split('_').includes(id)))return null;
    const match=key.match(/^(true|false)_/);if(!match)return null;
    const kind={image:'image',video:'video',document:'file',audio:'audio',ptt:'audio',sticker:'sticker'}[value.type],text=value.type==='chat'?value.body:value.caption;
    return{id,text:typeof text==='string'?text:null,sentAt:Number(value.t)>0?Number(value.t)*1000:null,direction:match[1]==='true'?'outgoing':'incoming',author:'',entities:[],media:kind?[{kind,id,name:String(value.filename||value.fileName||''),mime:String(value.mimetype||''),size:Math.max(0,Number(value.size||value.fileLength)||0),expectedHash:fileHash(value.filehash),width:Number(value.width)||0,height:Number(value.height)||0}]:[],mediaKnown:!!kind||value.type==='chat',sourceConfidence:'whatsapp-cache'};
  }
  async function readMessages(ids){
    const wanted=new Set(ids.filter(id=>typeof id==='string'&&id.length<=1200&&!id.startsWith('rendered:')&&!id.startsWith('grouped-')));if(!wanted.size||typeof indexedDB==='undefined')return[];
    try{if(typeof indexedDB.databases==='function'&&!(await indexedDB.databases()).some(d=>d.name==='model-storage'))return[];
      return await new Promise(resolve=>{let db,done=false,count=0;const matches=new Map(),duplicates=new Set(),finish=()=>{if(done)return;done=true;clearTimeout(timer);db?.close();resolve([...matches].filter(([id])=>!duplicates.has(id)).map(([,m])=>m));},timer=setTimeout(finish,3000),request=indexedDB.open('model-storage');request.onerror=finish;request.onupgradeneeded=()=>request.transaction.abort();request.onsuccess=()=>{db=request.result;if(done){db.close();return;}if(!db.objectStoreNames.contains('message'))return finish();const cursor=db.transaction('message','readonly').objectStore('message').openCursor();cursor.onerror=finish;cursor.onsuccess=()=>{if(done)return;const c=cursor.result;if(!c||++count>100000)return finish();if(typeof c.key==='string'){const parts=[c.key,...c.key.split('_')];for(const id of new Set(parts)){if(!wanted.has(id))continue;const m=projectMessage(c.key,c.value,id);if(m){if(matches.has(id))duplicates.add(id);else matches.set(id,m);}}}c.continue();};};});
    }catch{return[];}
  }
  const api={projectMessage,readMessages};if(typeof module==='object'&&module.exports)module.exports=api;else scope.BlackCatWhatsAppSource=api;
})(typeof globalThis==='object'?globalThis:this);
