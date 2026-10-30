(() => {
  const translations = {
    '等你停止操作约 2 分钟，或切到其他账号/程序后，再备份': 'Waiting until you are idle ~2 min or switch to another account/program before backing up',
    '已跳过未变化的对话': 'unchanged chats skipped',
    'AI 使用方式': 'How AI is paid for', '黑猫 AI 点数': 'BlackCat AI points', '按用量扣账户点数，不需要自己的 Key': 'Charged to your account points; no key needed',
    '自己的 Claude Key': 'Your own Claude key', '费用由你直接付给 Anthropic，不扣点数': 'You pay Anthropic directly; no points used',
    '选择「自己的 Claude Key」时使用这里保存的 Key。切换到黑猫点数不会删除 Key。Key 加密保存在本机，可到 console.anthropic.com 申请。': 'Used when “Your own Claude key” is selected. Switching to BlackCat points keeps the key saved. Stored encrypted on this computer; get one at console.anthropic.com.',
    '还没有保存 Key，目前仍使用黑猫 AI 点数。请在下方保存 Key。': 'No key saved yet, so BlackCat AI points are still used. Save a key below.',
    '现在：AI 使用你自己的 Claude Key，不扣黑猫点数。': 'Now: AI uses your own Claude key; no BlackCat points are used.',
    '现在：AI 使用黑猫点数，用量会显示在「账户」和后台。': 'Now: AI uses BlackCat points; usage shows under Account and in the admin page.',
    '账户': 'Account', '当前配套不包含实时翻译预览': 'Your plan does not include the live translation preview',
    '使用黑猫 AI 点数（Claude Haiku），点数用完时改用 Google': 'Uses BlackCat AI points (Claude Haiku); switches to Google when points run out',
    '可选。填写后，Claude 翻译、AI 自动回复、知识库学习和黑猫助手都使用你自己的 Key，不扣黑猫点数；不填写则使用账户里的黑猫 AI 点数。Key 加密保存在本机，可到 console.anthropic.com 申请。': 'Optional. With your own key, Claude translation, AI auto-replies, knowledge-base learning and the assistant use it and spend no BlackCat points; without one, your account\'s BlackCat AI points are used. The key is stored encrypted on this computer. Get one at console.anthropic.com.',
    '测试翻译 / Lingva 服务器': 'Test translation / Lingva servers', '在设置中配置 Claude API Key': 'Set up the Claude API key in Settings',
    '用于 Claude 翻译、AI 自动回复、知识库学习和黑猫助手。所有账号共用，加密保存在本机。没有 Key 可到 console.anthropic.com 申请。': 'Used by Claude translation, AI auto-replies, knowledge-base learning and the Black Cat assistant. Shared by all accounts and stored encrypted on this computer. Get a key at console.anthropic.com.',
    '保存并测试': 'Save and test', '删除已保存的 Key': 'Delete the saved key', '尚未保存 Claude API Key': 'No Claude API key saved yet',
    '正在测试…': 'Testing…', '请先输入 API Key': 'Enter an API key first', 'Key 已删除': 'Key deleted',
    '所有功能共用设置中的同一个 Key。学习资料和生成回复会使用你的 API 额度。': 'All features share the key saved in Settings. Learning and replies use your API credit.',
    '打开 API Key 设置': 'Open API key settings',
    '点击打开': 'Click to open', '省内存': 'Eco', '全在线': 'All online', '省内存模式': 'Memory saver',
    '省内存模式：会话在点击时加载，未打开的会话不接收实时消息。点击可切换为全部保持在线。': 'Memory saver: sessions load when opened. Unopened sessions do not receive live messages. Click to keep all sessions online.',
    '全部会话保持在线，内存占用较高。点击切换为省内存模式。': 'All sessions stay online, using more memory. Click to enable memory saver.',
    'LINE 加载失败': 'LINE failed to load', 'Username（或手机号）': 'Username (or phone number)',
    '不勾选时每条间隔 5 秒。': 'Default: 5 seconds per message. ', '删除分组': 'Delete group', '删除这条快捷回复？': 'Delete this quick reply?',
    '发送超时': 'Send timed out', '在此分组新建文案': 'Create a template in this group', '在此分组添加回复': 'Add a reply to this group',
    '已发送': 'Sent', '所有会话共用；点一条回复即发送到当前聊天': 'Shared across sessions. Click a reply to send it to the current chat.',
    '文件': 'File', '新建文案分组': 'New template group', '新群发名单名称': 'New recipient list name', '无法识别，请检查格式': 'Could not recognize these details. Check the format.',
    '正在发送…': 'Sending…', '正在发送（附件较大时需要几秒）…': 'Sending (large attachments may take a few seconds)…', '没有已登录的账号': 'No signed-in accounts',
    '点击发送到当前聊天': 'Click to send to the current chat', '电话号码（含国家区号，如 60123456789）': 'Phone number with country code, e.g. 60123456789',
    '移动到分组…': 'Move to group…', '空分组，鼠标移到分组名上点 ＋ 新建': 'Empty group. Hover over its name and click + to create a template.',
    '空分组，鼠标移到分组名上点 ＋ 添加': 'Empty group. Hover over its name and click + to add a reply.', '端口应为 1-65535 的数字': 'The port must be a number from 1 to 65535',
    '继续发送': 'Resume sending', '编辑': 'Edit', '请填写主机地址': 'Enter a host address', '请输入 username 或手机号': 'Enter a username or phone number',
    '请输入正确的电话号码（至少 6 位数字）': 'Enter a valid phone number (at least 6 digits)', '读取超时': 'Loading timed out', '账号没有登录': 'Account is signed out',
    '账号登录后会自动读取联系人，也可以点「↻ 同步」': 'Contacts load automatically after sign-in. You can also click “↻ Sync”.', '超时（2 分钟没有完成）': 'Timed out (not completed within 2 minutes)',
    '还没有联系人，可以手动添加、导入 Excel，或在「账号联系人」里勾选后加入': 'No contacts yet. Add them manually, import Excel, or select them in Account contacts.',
    '这个任务的发送账号都已删除': 'All sending accounts for this task have been deleted', '这个联系人已经存在': 'This contact already exists',
    '默认分组（新建）': 'Default group (new)', '（含账号密码）': '(includes username and password)', '（未命名）': '(Untitled)',
    '黑猫SCRM': 'Black Cat SCRM', '中文': '中文', '切换深色模式': 'Toggle dark mode', '界面语言': 'Interface language',
    '搜索会话': 'Search sessions', '搜索会话名称': 'Search session names', '收起列表': 'Collapse list', '展开列表': 'Expand list',
    '＋ 新建会话': '+ New session', '新建会话': 'New session', '还没有会话': 'No sessions yet',
    '点击上方「新建会话」添加账号': 'Click “New session” above to add an account', '没有匹配的会话': 'No matching sessions',
    '选择左侧的会话，或点击「新建会话」': 'Select a session on the left, or click “New session”', '从左侧选择一个会话': 'Select a session on the left',
    '加载中': 'Loading', '未登录': 'Signed out', '已登录': 'Signed in', '加载失败': 'Failed to load',
    '翻译设置': 'Translation', '快捷回复': 'Quick replies', '联系人': 'Contacts', '群发消息': 'Bulk messages', '环境设置': 'Session settings',
    '当前会话的名称 / 代理': 'Current session name / proxy', '环境设置（名称 / 代理）': 'Session settings (name / proxy)', '环境设置（代理）': 'Proxy settings',
    '置顶 / 取消置顶': 'Pin / unpin', '取消置顶': 'Unpin', '置顶': 'Pinned', '刷新': 'Refresh', '开发者工具': 'Developer tools', '删除会话': 'Delete session',
    '个人': 'Personal', '公共': 'Shared', '直接发送': 'Send directly', '文字先翻译再发送': 'Translate text before sending',
    '暂未设置回复内容': 'No quick replies yet', '立即添加': 'Add now', '＋ 新建分组': '+ New group', '新建分组': 'New group',
    '＋ 添加回复': '+ Add reply', '添加快捷回复': 'Add quick reply', '编辑快捷回复': 'Edit quick reply', '分组': 'Group', '分组名称': 'Group name',
    '回复文字（可留空）': 'Reply text (optional)', '输入要发送的文字': 'Enter your message', '附件（照片 / 视频 / 其他文件）': 'Attachments (photos / videos / other files)',
    '＋ 添加附件': '+ Add attachments', '取消': 'Cancel', '保存': 'Save', '确定': 'OK', '关闭': 'Close', '完成': 'Done', '删除': 'Delete', '移除': 'Remove',
    '账号联系人': 'Account contacts', '我的联系人': 'My contacts', '重新读取账号联系人': 'Refresh account contacts', '↻ 同步': '↻ Sync',
    '＋ 添加': '+ Add', '第 1 列号码/username，第 2 列名字': 'Column 1: phone / username; column 2: name',
    '搜索名字 / 号码 / username': 'Search name / phone / username', '全选': 'Select all', '加入我的联系人': 'Add to my contacts', '建群发名单': 'Create recipient list',
    '添加联系人': 'Add contact', '编辑联系人': 'Edit contact', '名字': 'Name', '电话号码': 'Phone number', '用户名': 'Username', '名称': 'Name',
    '群发任务': 'Tasks', '文案库': 'Templates', '名单库': 'Lists', '＋ 新建任务': '+ New task', '新建任务': 'New task',
    '还没有群发任务，点「新建任务」开始': 'No bulk tasks yet. Click “New task” to get started.', '‹ 返回任务列表': '‹ Back to tasks',
    '任务名称': 'Task name', '文案': 'Template', '群发名单': 'Recipient list', '手动新建群发名单': 'Create manual recipient list',
    '手动输入': 'Manual entry', '手动输入收件人': 'Enter recipients', '导入 Excel 为新名单': 'Import Excel as new list', '下载模板': 'Download template',
    '预览（第一位收件人）': 'Preview (first recipient)', '发送账号': 'Sending accounts', '每个账号的消息间隔': 'Message interval per account',
    '秒': 'Seconds', '分钟': 'Minutes', '小时': 'Hours', '开始群发': 'Start sending', '＋ 新建文案': '+ New template', '新建文案': 'New template',
    '编辑文案': 'Edit template', '还没有文案，点「新建文案」添加': 'No templates yet. Click “New template” to add one.',
    '导入 Excel': 'Import Excel', '导出 Excel': 'Export Excel', '保存 Excel': 'Save Excel', '名单名称': 'List name', '如：活动通知名单': 'e.g. Event notifications',
    '还没有名单：可手动输入、导入 Excel，或在「联系人」里勾选后点「建群发名单」': 'No lists yet. Enter recipients manually, import Excel, or create a list from Contacts.',
    '收件人': 'Recipients', 'WhatsApp 电话号码': 'WhatsApp phone numbers', '保存到名单库': 'Save to list library', '保存名单': 'Save list', '保存并使用': 'Save and use', '仅本次使用': 'Use for this task only',
    '取消勾选时，名单仅用于本次群发，不保存到名单库。': 'Uncheck to use this list for this task without saving it to the list library.',
    '号码请包含国家区号，每行一个；也可用逗号或分号分隔。空行和重复号码会自动忽略。': 'Include the country code. Enter one number per line, or separate with commas or semicolons. Blank lines and duplicates are ignored.',
    '每行一个 Username，可带 @ 或使用 t.me 链接；也可用逗号或分号分隔。空行和重复项会自动忽略。': 'Enter one username per line, with optional @ or a t.me link. Commas and semicolons also work. Blank lines and duplicates are ignored.',
    '第 2 列起是变量，点表头可以改变量名（文案里用 @变量名 调用）；点 × 删除一行。修改会自动保存。': 'Columns after the recipient are variables. Click a header to rename it and use @variable in templates. Click × to delete a row. Changes save automatically.',
    '查看 / 编辑': 'View / edit', '重命名': 'Rename', '重命名名单': 'Rename list', '重命名分组': 'Rename group', '点击修改变量名': 'Click to rename variable', '删除这一行': 'Delete this row',
    '粉丝独立翻译': 'Per-contact translation', '开启后，每个联系人可以单独设置翻译语言；没单独设置的联系人使用默认设置': 'Give each contact individual translation settings. Others use the defaults.',
    '历史消息翻译设置': 'Incoming translation', '历史消息翻译': 'Translate messages to', '发送语言翻译设置': 'Outgoing translation', '输入框翻译': 'Translate outgoing to',
    '翻译路线': 'Translation provider', '源语言': 'Source language', '实时翻译': 'Live translation', '输入时在输入框上方预览译文': 'Preview translations above the message box while typing',
    '开启发送翻译后：Enter 发送译文，Alt+Enter 发送原文': 'With outgoing translation enabled: Enter sends the translation; Alt+Enter sends the original.',
    '测试翻译 / Claude Key / Lingva 服务器': 'Test translation / Claude key / Lingva servers',
    '输入一句话，按历史消息设置翻译': 'Enter text to test incoming translation settings', '测试': 'Test',
    'Claude API Key（Haiku 翻译，所有会话共用，加密保存）': 'Claude API key (Haiku translation; shared across sessions; stored encrypted)',
    'Lingva 服务器（每行一个，可填自建地址，所有会话共用）': 'Lingva servers (one per line; self-hosted URLs supported; shared across sessions)',
    '请先在左侧选择一个会话': 'Select a session on the left first', '自行检测': 'Auto-detect', '系统推荐': 'Recommended', 'Google 翻译': 'Google Translate', 'Claude Haiku（AI）': 'Claude Haiku (AI)',
    '简体中文': 'Simplified Chinese', '繁体中文': 'Traditional Chinese', '英语': 'English', '日语': 'Japanese', '韩语': 'Korean', '西班牙语': 'Spanish', '葡萄牙语': 'Portuguese',
    '法语': 'French', '德语': 'German', '俄语': 'Russian', '意大利语': 'Italian', '阿拉伯语': 'Arabic', '泰语': 'Thai', '越南语': 'Vietnamese', '印尼语': 'Indonesian',
    '马来语': 'Malay', '菲律宾语': 'Filipino', '印地语': 'Hindi', '孟加拉语': 'Bengali', '乌尔都语': 'Urdu', '土耳其语': 'Turkish', '波斯语': 'Persian', '希伯来语': 'Hebrew',
    '荷兰语': 'Dutch', '波兰语': 'Polish', '乌克兰语': 'Ukrainian', '高棉语': 'Khmer', '缅甸语': 'Burmese', '老挝语': 'Lao', '尼泊尔语（罗马字）': 'Nepali (Latin)', '尼泊尔语': 'Nepali',
    '粤语（广东话）': 'Cantonese', '泰米尔语': 'Tamil', '爪哇语': 'Javanese', '巽他语': 'Sundanese', '宿务语': 'Cebuano', '旁遮普语': 'Punjabi', '泰卢固语': 'Telugu',
    '马拉地语': 'Marathi', '古吉拉特语': 'Gujarati', '卡纳达语': 'Kannada', '马拉雅拉姆语': 'Malayalam', '僧伽罗语': 'Sinhala', '普什图语': 'Pashto', '希腊语': 'Greek',
    '捷克语': 'Czech', '罗马尼亚语': 'Romanian', '匈牙利语': 'Hungarian', '瑞典语': 'Swedish', '丹麦语': 'Danish', '挪威语': 'Norwegian', '芬兰语': 'Finnish',
    '斯洛伐克语': 'Slovak', '保加利亚语': 'Bulgarian', '塞尔维亚语': 'Serbian', '克罗地亚语': 'Croatian', '蒙古语': 'Mongolian', '哈萨克语': 'Kazakh',
    '乌兹别克语': 'Uzbek', '斯瓦希里语': 'Swahili', '阿姆哈拉语': 'Amharic', '豪萨语': 'Hausa', '约鲁巴语': 'Yoruba', '祖鲁语': 'Zulu', '索马里语': 'Somali',
    '基本信息': 'General', '会话名称': 'Session name', '代理设置': 'Proxy settings', '启用代理': 'Enable proxy', '智能填写 ⓘ': 'Quick configuration ⓘ',
    '支持 host:port:user:pass、user:pass@host:port、socks5://user:pass@host:port 等格式': 'Supports host:port:user:pass, user:pass@host:port, socks5://user:pass@host:port and similar formats',
    '粘贴IP信息到此处，自动识别\n例如 1.2.3.4:1080:user:pass': 'Paste proxy details for automatic detection\ne.g. 1.2.3.4:1080:user:pass',
    '协议': 'Protocol', '主机': 'Host', '端口': 'Port', '用户名': 'Username', '密码': 'Password', '没有可留空': 'Optional', '请输入主机地址': 'Enter a host address',
    '请输入端口号': 'Enter a port number', '检测配置': 'Test connection', '文字': 'Text', '如：新品通知': 'e.g. New product announcement', '翻译成': 'Translate to', '翻译文字': 'Translate text',
    '用 @变量名 引用名单里的列，例如：你好 @名字，你的订单 @订单号 已发货': 'Use @variable to insert list values, e.g. Hello @Name, order @OrderNumber has shipped',
    '还没打开聊天，下面修改的是默认设置': 'No chat open. Editing the default settings.', '恢复默认': 'Reset to defaults', '翻译中…': 'Translating…',
    '没有 Key 时不使用 Claude；在 console.anthropic.com 申请 API Key': 'Claude requires an API key. Get one at console.anthropic.com.', '已保存，正在测试…': 'Saved. Testing…',
    '待发送': 'Pending', '发送中…': 'Sending…', '成功': 'Succeeded', '失败': 'Failed', '已停止': 'Stopped', '正在停止': 'Stopping', '已暂停': 'Paused', '排队中': 'Queued',
    '进行中': 'Running', '已中断': 'Interrupted', '已完成': 'Completed', '暂停': 'Pause', '继续': 'Resume', '停止': 'Stop', '详情': 'Details', '查看明细': 'View details', '导出结果': 'Export results',
    '已删除': 'Deleted', '默认分组': 'Default group', '未命名文案': 'Untitled template', '选择分组': 'Select group', '移动到': 'Move to', '无': 'None',
    '请选择文案': 'Select a template', '请勾选至少一个发送账号': 'Select at least one sending account', '勾选一个或多个已登录的账号': 'Select one or more signed-in accounts',
    '有任务进行中，会排队': 'Busy; new task will be queued', '请选择有收件人的名单': 'Select a list with recipients', '名单与当前平台不一致': 'The list belongs to a different platform',
    '请选择文案（没有的话先去「文案库」新建）': 'Select a template, or create one in Templates first', '这个文案没有内容': 'This template is empty',
    '请输入文字或添加附件': 'Enter text or add an attachment', '间隔必须在 1 秒到 5 小时之间': 'The interval must be between 1 second and 5 hours',
    '不勾选时每条间隔 5 秒。范围 1 秒 – 5 小时。': 'Default: 5 seconds per message. Allowed range: 1 second to 5 hours.', '范围 1 秒 – 5 小时。': 'Allowed range: 1 second to 5 hours.',
    '（文案库还没有文案，先去「文案库」新建）': '(No templates yet. Create one in Templates.)', '联系人': 'Contacts', '状态': 'Status', '账号': 'Account',
    '发送账号': 'Sending accounts', '说明': 'Details', '仅本次': 'This task only', '手动名单': 'Manual list', '名单变量：': 'List variables: ',
    '代理：': 'Proxy: ', '未启用（本机网络）': 'Disabled (local network)', '右键：更多操作': 'Right-click for more options',
    '正在检测…': 'Testing…', '代理未启用': 'Proxy is disabled', '请输入文字': 'Enter text', '没有匹配的联系人': 'No matching contacts',
  };
  const patterns = [
    [/^共 (\d+) 个任务，(\d+) 个进行中$/, (_m, n, running) => `${n} tasks; ${running} running`],
    [/^还没有 (.+) 会话$/, (_m, platform) => `No ${platform} sessions yet`],
    [/^名单变量：(.*)$/, (_m, variables) => `List variables: ${variables === '无' ? 'None' : variables}`],
    [/^群发任务 (.+)$/, (_m, date) => `Bulk task ${date}`],
    [/^还没有 (.+) 会话，点击「新建会话」添加$/, (_m, p) => `No ${p} sessions yet. Click “New session” to add one.`],
    [/^(.+)（(\d+) 个会话）$/, (_m, p, n) => `${p} (${n} sessions)`],
    [/^（还没有 (.+) 名单，可手动输入或导入）$/, (_m, p) => `(No ${p} lists. Enter recipients manually or import.)`],
    [/^可新增 (\d+) 人(?:，已忽略 (\d+) 个重复项)?$/, (_m, n, d) => `${n} recipients ready${d ? `; ${d} duplicates ignored` : ''}`],
    [/^第 (.+) 项格式不正确(?:，共 (\d+) 项)?，请修改后保存。$/, (_m, n, count) => `Invalid entries: ${n}${count ? ` (${count} total)` : ''}. Correct them before saving.`],
    [/^已准备 (\d+) 位收件人，(.+)$/, (_m, n, kind) => `${n} recipients ready; ${kind.includes('本次') ? 'for this task only' : 'saved to Lists'}`],
    [/^(.+) 名单 (\d+) 个$/, (_m, p, n) => `${p}: ${n} lists`],
    [/^已选 (\d+)$/, (_m, n) => `${n} selected`],
    [/^(\d+) 人 · (.+)$/, (_m, n, p) => `${n} recipients · ${p}`],
    [/^(.+)（(\d+) 人）(.*)$/, (_m, name, n, rest) => `${t(name)} (${n} recipients)${rest.includes('仅本次') ? ' · This task only' : rest}`],
    [/^(.+) 手动名单 (.+)$/, (_m, platform, date) => `${platform} manual list ${date}`],
    [/^会话：(.+)$/, (_m, name) => `Session: ${name}`],
    [/^联系人：(.+)$/, (_m, name) => `Contact: ${name}`],
    [/^正在编辑「(.+)」的单独设置$/, (_m, name) => `Editing individual settings for “${name}”`],
    [/^「(.+)」正在使用默认设置，修改后单独保存$/, (_m, name) => `“${name}” uses the defaults. Changes apply only to this contact.`],
    [/^只显示前 (\d+) 行，共 (\d+) 行$/, (_m, n, total) => `Showing the first ${n} of ${total} rows`],
    [/^确定用 (\d+) 个账号向 (\d+) 人群发吗？[\s\S]*$/, (_m, accounts, recipients) => `Send to ${recipients} recipients using ${accounts} accounts?\n\nSending many unsolicited messages may lead to account restrictions.`],
    [/^删除 (\d+) 个名单？（已建的任务不受影响）$/, (_m, n) => `Delete ${n} lists? Existing tasks are not affected.`],
    [/^删除 (\d+) 条文案？$/, (_m, n) => `Delete ${n} templates?`],
  ];
  const fragments = {
    '已保存名单「': 'Saved list “', '」：': '”: ', ' 人': ' recipients', ' 个重复项': ' duplicates', '个空号或重复': 'blank or duplicate entries',
    '已导出到 ': 'Exported to ', '模板已保存到 ': 'Template saved to ', '点击修改变量名': 'Click to rename variable',
    '成功 ': 'Succeeded ', '失败 ': 'Failed ', '剩余 ': 'Remaining ', '共 ': 'Total ', '变量：': 'Variables: ', '来源：': 'Source: ',
    '正在读取': 'Loading', '同步中…': 'Syncing…', '读取失败': 'Load failed', '点击重试': 'Click to retry',
    '发送账号': 'Sending accounts', '发送失败': 'Send failed', '原文：': 'Original: ', '注意：': 'Note: ',
    '已自动改用 Google 翻译': 'Switched to Google Translate', '翻译失败：': 'Translation failed: ', '失败：': 'Failed: ',
    ' 位联系人': ' contacts', ' 个账号': ' accounts', ' 条': ' messages', ' 分钟': ' minutes', ' 小时': ' hours', ' 秒': ' seconds',
    '平均分配，每个账号约 ': 'distributed evenly, about ', '预计 ': 'estimated ', '完成': 'complete', '个附件': 'attachments',
    '不在名单里，会原样发出': 'are absent from the list and will be sent unchanged', '文案里的 ': 'Template variables ',
    '，跳过 ': '; skipped ', '，忽略 ': '; ignored ', '，已保存到名单库': '; saved to Lists', '，仅用于本次群发': '; for this task only',
    '变量：': 'Variables: ', '文案「': 'Template “', '」· 名单「': '” · List “', '」· ': '” · ', '间隔 ': 'Interval ',
  };
  const keys = Object.keys(fragments).sort((a, b) => b.length - a.length);
  let locale = document.documentElement.lang === 'en' ? 'en' : 'zh-CN';
  function t(value) {
    const text = String(value ?? '');
    if (locale !== 'en') return text;
    const trimmed = text.trim();
    if (translations[trimmed] !== undefined) return text.replace(trimmed, translations[trimmed]);
    for (const [pattern, replacement] of patterns) if (pattern.test(trimmed)) return text.replace(trimmed, trimmed.replace(pattern, replacement));
    let result = text;
    for (const key of keys) result = result.split(key).join(fragments[key]);
    return result;
  }
  const records = new WeakMap();
  const attrRecords = new WeakMap();
  const protectedContent = 'script,style,textarea,webview,[data-i18n-skip],.session .name,.session .sub,.ct-info b,.ls-info > b,.tp-item b,#te-preview,#qr-groups .qr-text,#lm-table td:not(.num),#bk-detail-table td:not(.num)';
  function translateText(node) {
    if (!node.parentElement || node.parentElement.closest(protectedContent)) return;
    const old = records.get(node);
    const source = old && node.data === old.rendered ? old.source : node.data;
    const rendered = t(source);
    records.set(node, { source, rendered });
    if (node.data !== rendered) node.data = rendered;
  }
  function translateAttributes(element) {
    if (element.matches('webview,script,style,[data-i18n-skip]')) return;
    let old = attrRecords.get(element);
    if (!old) { old = {}; attrRecords.set(element, old); }
    for (const attr of ['title', 'placeholder', 'aria-label', 'alt']) {
      if (!element.hasAttribute(attr)) continue;
      const value = element.getAttribute(attr);
      const source = old[attr] && value === old[attr].rendered ? old[attr].source : value;
      const rendered = t(source);
      old[attr] = { source, rendered };
      if (value !== rendered) element.setAttribute(attr, rendered);
    }
  }
  function apply(root = document.body) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) { translateText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    translateAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) node.nodeType === Node.TEXT_NODE ? translateText(node) : translateAttributes(node);
  }
  const pending = new Set();
  let pendingTimer = null;
  function queue(root) {
    pending.add(root);
    if (pendingTimer) return;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      for (const node of pending) if (node.isConnected) apply(node);
      pending.clear();
    }, 32);
  }
  const observer = new MutationObserver((mutations) => {
    if (locale !== 'en') return;
    for (const mutation of mutations) {
      if (mutation.type === 'characterData' || mutation.type === 'attributes') queue(mutation.target);
      else for (const node of mutation.addedNodes) queue(node);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label', 'alt'] });
  window.I18N = {
    get locale() { return locale; }, t, apply, extend: (entries) => Object.assign(translations, entries),
    setLocale(next) { locale = next === 'en' ? 'en' : 'zh-CN'; document.documentElement.lang = locale; apply(); },
  };
  const confirm = window.confirm.bind(window);
  window.confirm = (message) => confirm(t(message));
  apply();
})();
