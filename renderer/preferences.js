(() => {
  let preferences={};try{preferences=JSON.parse(localStorage.getItem('blackcat-preferences'))||{};}catch{}
  const root=document.documentElement;let themeMode=['light','dark','system'].includes(preferences.themeMode)?preferences.themeMode:preferences.theme==='dark'?'dark':'light';const darkQuery=matchMedia('(prefers-color-scheme: dark)');const resolved=()=>themeMode==='system'?(darkQuery.matches?'dark':'light'):themeMode;root.dataset.theme=resolved();root.dataset.themeMode=themeMode;root.lang=preferences.locale==='en'?'en':'zh-CN';
  const upgraded=preferences.autoLoginVersion!==2;let keepAllOnline=upgraded||preferences.keepAllOnline!==false;
  if(upgraded)localStorage.setItem('blackcat-preferences',JSON.stringify({...preferences,keepAllOnline:true,autoLoginVersion:2}));
  window.keepAllSessionsOnline=()=>keepAllOnline;
  function save(){localStorage.setItem('blackcat-preferences',JSON.stringify({theme:root.dataset.theme,themeMode,locale:root.lang,keepAllOnline,autoLoginVersion:2}));window.api?.setAppearance?.({theme:root.dataset.theme,themeMode,locale:root.lang});window.dispatchEvent(new Event('blackcat:preferences'));}
  window.appPreferences={setTheme(value){themeMode=['light','dark','system'].includes(value)?value:'light';root.dataset.themeMode=themeMode;root.dataset.theme=resolved();save();},setLocale(value){window.I18N.setLocale(value==='en'?'en':'zh-CN');save();},setOnline(value){keepAllOnline=!!value;save();}};
  darkQuery.addEventListener('change',()=>{if(themeMode==='system'){root.dataset.theme=resolved();window.dispatchEvent(new Event('blackcat:preferences'));}});window.appPreferences.themeMode=()=>themeMode;
  window.systemPreferences={notifications:true,notificationSound:true,zoom:1,platforms:{whatsapp:true,telegram:true,line:true,facebook:true,tiktok:false,wechat:false},platformOrder:['whatsapp','telegram','line','facebook','tiktok','wechat']};window.systemPreferencesReady=window.api?.appSystemGet?.().then(result=>{if(result?.ok)window.systemPreferences=result.data;}).catch(()=>{});window.platformVisible=key=>window.systemPreferences.platforms?.[key]!==false;window.visiblePlatforms=()=>window.systemPreferences.platformOrder.filter(key=>window.platformVisible(key));
  window.addEventListener('DOMContentLoaded',async()=>{
    if(!preferences.theme&&!preferences.locale&&window.api?.getSettings){const saved=await window.api.getSettings();if(saved.uiTheme){themeMode=['light','dark','system'].includes(saved.uiTheme)?saved.uiTheme:'light';root.dataset.themeMode=themeMode;root.dataset.theme=resolved();}if(saved.uiLocale)window.I18N.setLocale(saved.uiLocale);window.dispatchEvent(new Event('blackcat:preferences'));}
    window.api?.setAppearance?.({theme:root.dataset.theme,themeMode,locale:root.lang});
  });
})();
