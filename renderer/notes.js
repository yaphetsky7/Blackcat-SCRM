(() => {
  const t = text => window.I18N?.t(text) || text;
  window.I18N?.extend({ '对话备注': 'Conversation notes', '备注': 'Notes', '备注内容': 'Note', '打开一个对话，即可添加备注。': 'Open a conversation to add a note.', '自动保存。备注仅保存在本机，不会发送给对方。': 'Saved automatically on this computer. Notes are never sent to the contact.', '例如：客户偏好、沟通记录、下次跟进事项……': 'e.g. Preferences, conversation history, next follow-up…', '重试保存': 'Retry save', '正在读取备注…': 'Loading note…', '正在保存…': 'Saving…', '等待保存…': 'Waiting to save…', '已保存': 'Saved', '尚无备注': 'No note yet', '备注未保存，请重试': 'Note not saved. Retry.', '有同名对话，暂时无法确认身份。': 'There are conversations with the same name; identity could not be confirmed.', '当前对话': 'Current conversation' });
  const contexts = new Map(); const entries = new Map(); const versions = new Map(); const field = document.getElementById('notes-text');
  const sessionId = crypto.randomUUID();
  const transitions=new Map();
  let selected = null; let renderedKey = null; let requestEpoch = 0;
  const keyOf = (accountId, chatKey) => JSON.stringify([accountId, chatKey]);
  function draw() {
    const acc = findAcc(activeId()); const context = acc && contexts.get(acc.id); const entry = selected;const switching=acc&&transitions.get(acc.id);
    document.getElementById('notes-account').textContent = acc ? `${acc.name} · ${PLATFORMS[acc.platform].label}` : '';
    document.getElementById('notes-conversation').textContent = switching?.title||context?.title || '';
    const empty = document.getElementById('notes-empty'); empty.hidden = !!entry||!!switching;
    empty.textContent = t(context?.ambiguous ? '有同名对话，暂时无法确认身份。' : '打开一个对话，即可添加备注。');
    document.getElementById('notes-editor').hidden = !acc;
    if(switching){field.value='';field.disabled=true;document.getElementById('notes-status').textContent=t('正在读取备注…');return;}
    if (!entry) { field.value = ''; field.disabled = true; renderedKey = null;document.getElementById('notes-status').textContent=t('打开一个对话，即可添加备注。');document.getElementById('notes-retry').hidden=true;return; }
    field.disabled = !entry.loaded;
    if (renderedKey !== entry.key || field.value !== entry.text && document.activeElement !== field) field.value = entry.text;
    renderedKey = entry.key;
    const status = document.getElementById('notes-status');
    status.textContent = entry.error ? `${t('备注未保存，请重试')}：${entry.error}` : !entry.loaded ? t('正在读取备注…') : entry.saving ? t('正在保存…') : entry.dirty ? t('等待保存…') : entry.updatedAt ? `${t('已保存')} · ${new Date(entry.updatedAt).toLocaleTimeString(document.documentElement.lang === 'en' ? 'en' : 'zh-CN', { hour: '2-digit', minute: '2-digit' })}` : t('尚无备注');
    status.classList.toggle('notes-error', !!entry.error); document.getElementById('notes-retry').hidden = !entry.error;
  }
  async function persist(entry) {
    clearTimeout(entry?.timer); if (!entry?.dirty || !entry.loaded || entry.saving) return;
    const version = entry.version; const request = { accountId: entry.accountId, chatKey: entry.chatKey, title: entry.title, text: entry.text, sessionId, editVersion: version };
    entry.saving = true; entry.error = ''; if (selected === entry) draw();
    try {
      const result = await window.api.noteSet(request); if (!result?.ok) throw Error(result?.error || t('备注未保存，请重试'));
      entry.updatedAt = result.data.updatedAt; if (entry.version === version) entry.dirty = false;
    } catch (e) { entry.error = e.message; }
    finally { entry.saving = false; if (selected === entry) draw(); if (entry.dirty && !entry.error) persist(entry); }
  }
  async function refreshAccount() {
    const acc = findAcc(activeId()); const context = acc && contexts.get(acc.id); const key = context?.key && !context.ambiguous ? keyOf(acc.id, context.key) : null;
    if (selected?.key === key) { selected.title = context.title; draw(); return; }
    if (selected?.dirty) persist(selected);
    const epoch = ++requestEpoch; selected = null;
    if (!key) { draw(); return; }
    let entry = entries.get(key);
    if (!entry) { entry = { key, accountId: acc.id, chatKey: context.key, title: context.title, text: '', loaded: false, dirty: false, version: versions.get(key)||0, saving: false, updatedAt: null, error: '' }; entries.set(key, entry); }
    selected = entry; draw(); if (entry.loaded) return;if(entry.loading){await entry.loading;if(epoch===requestEpoch&&selected===entry)draw();return;}
    entry.loading=(async()=>{
    try {
      const result = await window.api.noteGet({ accountId: acc.id, chatKey: context.key, title: context.title }); if (!result?.ok) throw Error(result?.error || '无法读取备注');
      // A different conversation may now be open. Load only into this entry.
      if (!entry.dirty) { entry.text = result.data.text; entry.updatedAt = result.data.updatedAt; } entry.loaded = true; entry.error = '';
    } catch (e) { entry.error = e.message; }
    })();await entry.loading;entry.loading=null;if (epoch === requestEpoch && selected === entry) draw();
  }
  function setContext(accountId, context) {
    const pending=transitions.get(accountId);if(pending){if(!context?.key||context.key===pending.oldKey&&context.key!==pending.expectedKey)return;clearTimeout(pending.timer);transitions.delete(accountId);}
    const before = contexts.get(accountId); contexts.set(accountId, context);
    if (accountId === activeId() && (pending||before?.key !== context?.key || before?.title !== context?.title || before?.ambiguous !== context?.ambiguous || !selected)) refreshAccount();
  }
  field.addEventListener('input', () => { if (!selected?.loaded||transitions.has(activeId())) return; selected.text = field.value; selected.version++; selected.dirty = true; selected.error = ''; clearTimeout(selected.timer); selected.timer = setTimeout(() => persist(selected), 450); draw(); });
  field.addEventListener('blur', () => { if (selected?.dirty) persist(selected); });
  document.getElementById('notes-retry').addEventListener('click', () => { if (selected?.loaded) persist(selected); else { if (selected) entries.delete(selected.key); selected = null; refreshAccount(); } });
  window.addEventListener('beforeunload', event => {
    for (const entry of entries.values()) if (entry.dirty) {
      const result = window.api.noteFlush({ accountId: entry.accountId, chatKey: entry.chatKey, title: entry.title, text: entry.text, sessionId, editVersion: entry.version });
      if (!result?.ok) { event.preventDefault(); event.returnValue = ''; entry.error = result?.error || t('备注未保存，请重试'); draw(); } else entry.dirty = false;
    }
  });
  window.addEventListener('blackcat:preferences', draw);
  function pause(accountId,hint){if(selected?.accountId===accountId&&selected.dirty)persist(selected);clearTimeout(transitions.get(accountId)?.timer);const old=contexts.get(accountId);const transition={oldKey:old?.key,expectedKey:hint?.key,title:hint?.title||old?.title||''};transition.timer=setTimeout(()=>{if(transitions.get(accountId)!==transition)return;transitions.delete(accountId);contexts.delete(accountId);if(accountId===activeId()){selected=null;++requestEpoch;draw();}},4000);transitions.set(accountId,transition);if(accountId===activeId())draw();}
  window.conversationNotes = { flush:async(accountId,chatKey)=>{const entry=entries.get(keyOf(accountId,chatKey));if(!entry)return;for(let i=0;i<150&&entry.saving;i++)await new Promise(r=>setTimeout(r,20));if(entry.dirty)await persist(entry);for(let i=0;i<150&&entry.saving;i++)await new Promise(r=>setTimeout(r,20));if(entry.dirty||entry.error)throw Error('当前备注尚未保存，请先处理保存错误');},reload:async(accountId,chatKey)=>{const key=keyOf(accountId,chatKey),entry=entries.get(key);if(entry?.dirty||entry?.saving)throw Error('此备注还有未保存的编辑，请先等待保存完成');if(entry)versions.set(key,entry.version);entries.delete(key);if(selected?.key===key){selected=null;await refreshAccount();const loaded=entries.get(key);if(loaded)loaded.version=Math.max(loaded.version,entry?.version||0);}},setContext, refreshAccount, pause, getState: () => selected && ({ accountId: selected.accountId, chatKey: selected.chatKey, title:selected.title,text: selected.text, dirty: selected.dirty, saving: selected.saving,switching:transitions.has(selected.accountId) }) };
  window.addEventListener('DOMContentLoaded', refreshAccount);
})();
