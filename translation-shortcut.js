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
