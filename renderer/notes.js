(() => {
  const t = text => window.I18N?.t(text) || text;
  window.I18N?.extend({ '对话备注': 'Conversation notes', '备注': 'Notes', '备注内容': 'Note', '打开一个对话，即可添加备注。': 'Open a conversation to add a note.', '自动保存。备注仅保存在本机，不会发送给对方。': 'Saved automatically on this computer. Notes are never sent to the contact.', '例如：客户偏好、沟通记录、下次跟进事项……': 'e.g. Preferences, conversation history, next follow-up…', '重试保存': 'Retry save', '正在读取备注…': 'Loading note…', '正在保存…': 'Saving…', '等待保存…': 'Waiting to save…', '已保存': 'Saved', '尚无备注': 'No note yet', '备注未保存，请重试': 'Note not saved. Retry.', '有同名对话，暂时无法确认身份。': 'There are conversations with the same name; identity could not be confirmed.', '当前对话': 'Current conversation' });
  const contexts = new Map(); const entries = new Map(); const versions = new Map(); const field = document.getElementById('notes-text');
  const sessionId = crypto.randomUUID();
  const transitions=new Map();
  let selected = null; let renderedKey = null; let requestEpoch = 0;
  const keyOf = (accountId, chatKey) => JSON.stringify([accountId, chatKey]);
  // Saved messages, pictures, videos, voice notes and files ("保存到备注"), listed under the note of the open conversation
  window.I18N?.extend({ '已保存的消息': 'Saved messages', '在聊天里右键消息或图片 → 保存到备注。': 'Right-click a message or image in the chat → Save to notes.', '已保存到备注': 'Saved to notes', '删除': 'Delete', '图片': 'Image', '还没有保存的消息。': 'Nothing saved yet.', '影片': 'Video', '写备注…': 'Add a note…', '在聊天里右键消息、图片或影片 → 保存到备注。': 'Right-click a message, image or video in the chat → Save to notes.', '语音': 'Voice note', '文件': 'File', '点击打开': 'Click to open', '在聊天里右键消息、图片、影片、语音或文件 → 保存到备注。': 'Right-click a message, image, video, voice note or file in the chat → Save to notes.' });
  const sizeText = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const clips = new Map(), clipsLoading = new Set(); let clipsDrawn = ''; const clipList = document.getElementById('notes-clips-list');
  function drawClips() {
    const box = document.getElementById('notes-clips'), entry = selected; box.hidden = !entry;
    if (!entry) return;
    const items = clips.get(entry.key);
    if (!items) { if (!clipsLoading.has(entry.key)) { clipsLoading.add(entry.key); window.api.clipList({ accountId: entry.accountId, chatKey: entry.chatKey }).then((r) => { clips.set(entry.key, r?.ok ? r.data : []); }).finally(() => { clipsLoading.delete(entry.key); if (selected === entry) drawClips(); }); } clipList.replaceChildren(); return; }
    const drawn = entry.key + '|' + items.length; if (drawn === clipsDrawn && clipList.childElementCount) return; clipsDrawn = drawn;
    document.getElementById('notes-clips-count').textContent = items.length ? '(' + items.length + ')' : '';
    if (!items.length) { const p = document.createElement('p'); p.className = 'hub-muted'; p.textContent = t('还没有保存的消息。'); clipList.replaceChildren(p); return; }
    clipList.replaceChildren(...[...items].reverse().map((item) => {
      const el = document.createElement('div'); el.className = 'note-clip';
      const meta = document.createElement('div'); meta.className = 'note-clip-meta';
      meta.textContent = [item.author, item.time].filter(Boolean).join(' · ') || new Date(item.savedAt).toLocaleString(document.documentElement.lang === 'en' ? 'en' : 'zh-CN');
      const del = document.createElement('button'); del.type = 'button'; del.className = 'link-btn note-clip-delete'; del.textContent = t('删除');
      del.addEventListener('click', async () => { const r = await window.api.clipRemove({ accountId: entry.accountId, chatKey: entry.chatKey, id: item.id }); if (!r?.ok) return toast(r?.error || '删除失败', true); clips.set(entry.key, (clips.get(entry.key) || []).filter((i) => i.id !== item.id)); drawClips(); });
      meta.append(del); el.append(meta);
      const openFile = () => window.api.clipOpen({ accountId: entry.accountId, chatKey: entry.chatKey, id: item.id }).then((r) => { if (!r?.ok) toast(r?.error || '无法打开文件', true); });
      if (item.videoSrc) { const video = document.createElement('video'); video.src = item.videoSrc; if (item.src) video.poster = item.src; video.controls = true; video.preload = 'metadata'; video.title = t('影片'); video.addEventListener('dblclick', openFile); el.append(video);
        // Some phone videos (e.g. HEVC) cannot play inside the app; offer the computer's own player instead
        video.addEventListener('error', () => { const open = document.createElement('button'); open.type = 'button'; open.className = 'note-clip-file'; open.textContent = '🎬 ' + t('这里无法播放，点击用系统播放器打开'); open.addEventListener('click', openFile); video.replaceWith(open); }, { once: true }); }
      else if (item.audioSrc) { const audio = document.createElement('audio'); audio.src = item.audioSrc; audio.controls = true; audio.preload = 'metadata'; audio.title = t('语音'); el.append(audio); }
      else if (item.fileSrc) { const file = document.createElement('button'); file.type = 'button'; file.className = 'note-clip-file'; file.title = t('点击打开'); file.textContent = '📄 ' + (item.fileName || t('文件')) + (item.size ? ' · ' + sizeText(item.size) : ''); file.addEventListener('click', openFile); el.append(file); }
      else if (item.src) { const img = document.createElement('img'); img.src = item.src; img.alt = t('图片'); img.title = t('图片'); img.addEventListener('click', openFile); el.append(img); }
      if (item.text && item.text !== item.fileName) { const text = document.createElement('div'); text.className = 'note-clip-text'; text.textContent = item.text; text.addEventListener('click', () => text.classList.toggle('open')); el.append(text); }
      // Your own words about this item ("写备注"), saved a moment after you stop typing
      const memo = document.createElement('textarea'); memo.className = 'note-clip-memo'; memo.rows = 1; memo.placeholder = t('写备注…'); memo.value = item.memo || '';
      let memoTimer = null; const saveMemo = async () => { clearTimeout(memoTimer); if ((item.memo || '') === memo.value) return; const r = await window.api.clipUpdate({ accountId: entry.accountId, chatKey: entry.chatKey, id: item.id, memo: memo.value }); if (!r?.ok) return toast(r?.error || '备注未保存，请重试', true); item.memo = r.data.memo; };
      memo.addEventListener('input', () => { memo.style.height = 'auto'; memo.style.height = memo.scrollHeight + 'px'; clearTimeout(memoTimer); memoTimer = setTimeout(saveMemo, 600); });
      memo.addEventListener('blur', saveMemo);
      el.append(memo); requestAnimationFrame(() => { if (memo.value) { memo.style.height = 'auto'; memo.style.height = memo.scrollHeight + 'px'; } });
      return el;
    }));
  }
  async function saveClip(accountId, data) {
    if (data?.error) return toast(data.error, true);
    if (data?.notice) return toast(t(data.notice));
    const context = contexts.get(accountId);
    if (!context?.key || context.ambiguous) return toast(t('打开一个对话，即可添加备注。'), true);
    const r = await window.api.clipAdd({ accountId, chatKey: context.key, title: context.title, kind: data.kind, text: data.text, author: data.author, time: data.time, imageData: data.imageData, videoBytes: data.videoBytes, audioBytes: data.audioBytes, fileToken: data.fileToken, mime: data.mime });
    if (!r?.ok) return toast(r?.error || '保存失败', true);
    const k = keyOf(accountId, context.key); if (clips.has(k)) clips.set(k, [...clips.get(k), r.data]);
    toast(t('已保存到备注')); if (selected?.key === k) drawClips();
  }
  function draw() {
    drawClips();
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
  window.conversationNotes = { saveClip, flush:async(accountId,chatKey)=>{const entry=entries.get(keyOf(accountId,chatKey));if(!entry)return;for(let i=0;i<150&&entry.saving;i++)await new Promise(r=>setTimeout(r,20));if(entry.dirty)await persist(entry);for(let i=0;i<150&&entry.saving;i++)await new Promise(r=>setTimeout(r,20));if(entry.dirty||entry.error)throw Error('当前备注尚未保存，请先处理保存错误');},reload:async(accountId,chatKey)=>{const key=keyOf(accountId,chatKey),entry=entries.get(key);if(entry?.dirty||entry?.saving)throw Error('此备注还有未保存的编辑，请先等待保存完成');if(entry)versions.set(key,entry.version);entries.delete(key);if(selected?.key===key){selected=null;await refreshAccount();const loaded=entries.get(key);if(loaded)loaded.version=Math.max(loaded.version,entry?.version||0);}},setContext, refreshAccount, pause, getState: () => selected && ({ accountId: selected.accountId, chatKey: selected.chatKey, title:selected.title,text: selected.text, dirty: selected.dirty, saving: selected.saving,switching:transitions.has(selected.accountId) }) };
  window.addEventListener('DOMContentLoaded', refreshAccount);
})();
