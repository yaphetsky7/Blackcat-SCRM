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
      const visible=new Set([...document.querySelectorAll('#main [data-id]')].map(el=>el.getAttribute('data-id')));if(!visible.size)return unavailable;
      const get=globalThis.require;if(typeof get!=='function')return unavailable;
      const all=get('WAWebMsgCollection').MsgCollection.getModelsArray();if(!all.some(m=>{const full=String(m.id?._serialized||m.id?.toString?.()||''),chat=String(m.id?.remote?._serialized||m.id?.remote||full.split('_')[1]||'');return chat===request.chatId&&(visible.has(String(m.id?.id||''))||visible.has(full))}))return unavailable;
      const matches=all.filter(m=>{const full=String(m.id?._serialized||m.id?.toString?.()||''),id=String(m.id?.id||''),chat=String(m.id?.remote?._serialized||m.id?.remote||full.split('_')[1]||'');return chat===request.chatId&&(id===request.messageId||full===request.messageId)});
      if(matches.length!==1)return unavailable;const model=matches[0],kind={image:'image',video:'video',document:'file',audio:'audio',ptt:'audio',sticker:'sticker'}[model.type],rawHash=model.filehash||model.mediaData?.filehash;
      if(kind!==request.kind||normalizeHash(rawHash)!==request.expectedHash||Number(model.size)!==request.expectedBytes)return unavailable;
      const cache=get('WAWebMediaInMemoryBlobCache').InMemoryMediaBlobCache;
      if(cache.has(rawHash)){const blob=cache.get(rawHash);if(!(blob instanceof Blob)||blob.size!==request.expectedBytes)return unavailable;const source=cache.getOrCreateURL(rawHash);return typeof source==='string'&&source.startsWith('blob:')?{available:true,source,mime:blob.type,size:blob.size}:unavailable;}
      const jobs=globalThis.__blackcatBackupMediaDownloads||(globalThis.__blackcatBackupMediaDownloads=new Map()),key=request.chatId+'|'+request.messageId+'|'+request.expectedHash;let job=jobs.get(key);
      if(job?.done&&request.retry){jobs.delete(key);job=null;}
      if(!job&&request.start&&typeof model.forceDownloadMediaEvenIfExpensive==='function'){if(jobs.size>=500)for(const[k,v]of jobs)if(v.done||Date.now()-v.at>60000)jobs.delete(k);job={at:Date.now(),done:false};jobs.set(key,job);Promise.resolve().then(()=>model.forceDownloadMediaEvenIfExpensive()).catch(()=>{}).finally(()=>job.done=true);}
      return{available:false,pending:!!job&&Date.now()-job.at<180000&&(!job.done||['FETCHING','REUPLOADING','DOWNLOADING','RESOLVING'].includes(model.mediaData?.mediaStage))};
    }catch{return unavailable;}
  }
  function mediaScript(request){return '('+nativeMedia.toString()+')('+JSON.stringify(request)+','+fileHash.toString()+')';}
  async function nativeHistory(request,project){try{const ids=new Set([...document.querySelectorAll('#main [data-id]')].map(n=>n.getAttribute('data-id')));if(!request.chatId||!request.anchors?.some(id=>ids.has(id)))return{available:false};const get=globalThis.require,models=get('WAWebMsgCollection').MsgCollection.getModelsArray(),anchor=models.some(m=>{const full=String(m.id?._serialized||m.id?.toString?.()||''),chat=String(m.id?.remote?._serialized||m.id?.remote||full.split('_')[1]||'');return chat===request.chatId&&request.anchors.some(id=>id===String(m.id?.id||'')||id===full)});if(!anchor)return{available:false};const chats=get('WAWebChatCollection').ChatCollection.getModelsArray().filter(c=>String(c.id?._serialized||c.id)===request.chatId);if(chats.length!==1)return{available:false};const chat=chats[0],loaded=await get('WAWebChatLoadMessages').loadEarlierMsgs({chat});const records=project?chat.msgs.getModelsArray().filter(m=>String(m.id?.remote?._serialized||m.id?.remote||'')===request.chatId).map(m=>{const key=String(m.id?._serialized||m.id?.toString?.()||'');return project(key,{id:key,t:m.t,type:m.type,body:m.body,caption:m.caption||m.body||'',filename:m.filename,size:m.size,mimetype:m.mimetype,filehash:m.filehash,width:m.width,height:m.height},String(m.id?.id||''))}).filter(Boolean):[];return{available:true,loaded:Array.isArray(loaded)?loaded.length:0,boundary:chat.msgs?.msgLoadState?.noEarlierMsgs===true,records};}catch{return{available:false}}}
  function historyScript(request){return '(()=>{const fileHash='+fileHash.toString()+';return ('+nativeHistory.toString()+')('+JSON.stringify(request)+','+projectMessage.toString()+');})()';}
  const api={projectMessage,readMessages,nativeMedia,mediaScript,nativeHistory,historyScript};if(typeof module==='object'&&module.exports)module.exports=api;else scope.BlackCatWhatsAppSource=api;
})(typeof globalThis==='object'?globalThis:this);
