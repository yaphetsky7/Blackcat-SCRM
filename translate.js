// 翻译引擎：按路线依次尝试，带内存缓存。
// 路线：claude（Claude Haiku，需要 API Key）、google（Google 翻译免费接口）、lingva（Lingva Translate 实例，可自建）、
//       auto（系统推荐：有 Claude Key 时 Claude → Google → Lingva，没有时 Google → Lingva）

const fs = require('fs');
const AnthropicSDK = require('@anthropic-ai/sdk');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
const { z } = require('zod');

const Anthropic = AnthropicSDK.default || AnthropicSDK;

const DEFAULT_LINGVA_SERVERS = [
  'https://lingva.ml',
  'https://lingva.lunar.icu',
  'https://translate.plausibility.cloud',
];

// 选了 Lingva / Claude 但不可用时自动退回 Google，避免消息发不出去
function routeEngines(route, ctx) {
  const ai = ctx.claudeKey ? ['claude'] : [];
  return {
    auto: [...ai, 'google', 'lingva'],
    claude: ['claude', 'google'],
    google: ['google'],
    lingva: ['lingva', 'google'],
  }[route] || [...ai, 'google', 'lingva'];
}

// 失败的 Lingva 服务器 10 分钟内不再尝试，免得每条消息都先等它们超时
const DEAD_MS = 10 * 60 * 1000;
const deadUntil = new Map();

// Lingva 的中文代码和 Google 不一样；罗马字尼泊尔语这两家都只有天城文尼泊尔语
const LINGVA_CODES = { 'zh-CN': 'zh', 'zh-TW': 'zh_HANT', 'ne-Latn': 'ne' };

// 把各家返回的语言代码统一，用来判断“原文已经是目标语言”
function normLang(code) {
  const c = String(code || '').toLowerCase().replace('_', '-');
  if (c === 'zh' || c === 'zh-hans' || c === 'zh-cn') return 'zh-cn';
  if (c === 'zh-hant' || c === 'zh-tw' || c === 'zh-hk') return 'zh-tw';
  if (c === 'ne-latn') return 'ne-latn'; // 罗马字尼泊尔语和天城文尼泊尔语要区分
  return c.split('-')[0];
}

// 被限流（HTTP 429）时暂停一段时间再试，连续被限流就加长（1 分钟起，最长 15 分钟），成功后恢复。
// 按“引擎 + 网络出口”分开记：Google 是按 IP 限流的，走代理的账号不受本机 IP 被限的影响
const cooldown = {}; // `${engine}@${netId}` -> { until, ms }

function checkCooldown(engine, label) {
  const c = cooldown[engine];
  if (c && c.until > Date.now()) {
    throw new Error(`${label}请求太频繁被暂时限制，${Math.ceil((c.until - Date.now()) / 1000)} 秒后自动恢复`);
  }
}

function hitLimit(engine) {
  const ms = Math.min((cooldown[engine]?.ms || 30000) * 2, 15 * 60 * 1000);
  cooldown[engine] = { until: Date.now() + ms, ms };
}

// 给 Claude 的语言名称（英文写清楚，模型更不容易误解）
const LANGUAGE_NAMES = {
  'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese', en: 'English', ja: 'Japanese', ko: 'Korean',
  es: 'Spanish', pt: 'Portuguese', fr: 'French', de: 'German', ru: 'Russian', it: 'Italian', ar: 'Arabic',
  th: 'Thai', vi: 'Vietnamese', id: 'Indonesian', ms: 'Malay', tl: 'Filipino', hi: 'Hindi', bn: 'Bengali',
  ur: 'Urdu', tr: 'Turkish', fa: 'Persian', he: 'Hebrew', nl: 'Dutch', pl: 'Polish', uk: 'Ukrainian',
  km: 'Khmer', my: 'Burmese', lo: 'Lao',
  ne: 'Nepali written in Devanagari script',
  'ne-Latn': 'Roman Nepali (Nepali written in Latin letters, the casual way it is typed in chats, e.g. "tapai lai kasto cha")',
};

const CLAUDE_MODEL = 'claude-haiku-5-5';
const TranslationSchema = z.object({
  translation: z.string(),
  source_language: z.string(),
});

let claudeClient = null;
let claudeClientKey = '';
// baseURL is set when AI goes through the BlackCat server (points); otherwise the customer's own key is used directly
function claudeFor(apiKey, baseURL) {
  if (!claudeClient || claudeClientKey !== apiKey + baseURL) {
    claudeClient = new Anthropic({ apiKey, baseURL, defaultHeaders: { 'x-blackcat-feature': 'translate' }, maxRetries: 1, timeout: 30000 });
    claudeClientKey = apiKey + baseURL;
  }
  return claudeClient;
}

function claudeSystemPrompt(source, target) {
  const codes = Object.keys(LANGUAGE_NAMES).join(', ');
  return [
    `You translate chat messages into ${LANGUAGE_NAMES[target] || target}.`,
    source !== 'auto' ? `The message is written in ${LANGUAGE_NAMES[source] || source}.` : '',
    'Write the translation the way a native speaker would type it in a chat: natural and casual, not word-for-word.',
    'Keep emojis, line breaks, URLs, @mentions, numbers and placeholders such as ⟦0⟧ exactly as they are.',
    'Return only the translation, with no notes or explanations. If the message is already in the target language and script, return it unchanged.',
    `Report source_language as one of these codes: ${codes}, or another ISO 639-1 code. Use "ne-Latn" for Nepali typed in Latin letters.`,
  ].filter(Boolean).join('\n');
}

const ENGINES = {
  async claude({ claudeKey, claudeBaseURL }, text, source, target) {
    if (!claudeKey) throw new Error('还没有设置 Claude API Key');
    checkCooldown('claude', 'Claude ');
    let response;
    try {
      response = await claudeFor(claudeKey, claudeBaseURL).messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        thinking: { type: 'disabled' }, // 翻译不需要思考，更快更省
        system: claudeSystemPrompt(source, target),
        messages: [{ role: 'user', content: text }],
        output_config: { format: zodOutputFormat(TranslationSchema) },
      });
    } catch (e) {
      // The BlackCat server explains points / plan / login problems in its own words
      if (claudeBaseURL && e instanceof Anthropic.APIError && [401, 402, 403, 503].includes(e.status)) throw new Error(e.error?.error?.message || '黑猫 AI 点数不可用');
      if (e instanceof Anthropic.AuthenticationError) throw new Error('Claude API Key 无效');
      if (e instanceof Anthropic.PermissionDeniedError) throw new Error('这个 Claude API Key 没有权限');
      if (e instanceof Anthropic.RateLimitError) {
        hitLimit('claude');
        throw new Error('Claude 请求太频繁，稍后自动恢复');
      }
      if (e instanceof Anthropic.BadRequestError) throw new Error(`Claude 拒绝了请求：${e.message}`);
      if (e instanceof Anthropic.APIConnectionError) throw new Error('连不上 Claude 服务器，请检查网络');
      if (e instanceof Anthropic.APIError) throw new Error(`Claude 出错（HTTP ${e.status}）`);
      throw e;
    }
    if (response.stop_reason === 'refusal') throw new Error('Claude 拒绝翻译这条内容');
    if (response.stop_reason === 'max_tokens') throw new Error('内容太长，翻译被截断');
    const out = response.parsed_output;
    if (!out?.translation) throw new Error('Claude 返回的格式不对');
    delete cooldown.claude;
    return { text: out.translation, detected: out.source_language };
  },

  async google({ fetch, netId = 'direct' }, text, source, target) {
    checkCooldown(`google@${netId}`, 'Google 翻译');
    // Google 没有“罗马字尼泊尔语”：读的时候让它自动识别，写的时候翻成尼泊尔语再取官方罗马字
    const romanTarget = target === 'ne-Latn';
    const sl = source === 'ne-Latn' ? 'auto' : source;
    const tl = romanTarget ? 'ne' : target;
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t${romanTarget ? '&dt=rm' : ''}&sl=${sl}&tl=${tl}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: `q=${encodeURIComponent(text)}`,
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 429) {
      hitLimit(`google@${netId}`);
      checkCooldown(`google@${netId}`, 'Google 翻译');
    }
    if (!res.ok) throw new Error(`Google 翻译返回 HTTP ${res.status}`);
    delete cooldown[`google@${netId}`];
    const data = await res.json();
    const segments = data[0].filter((seg) => typeof seg[0] === 'string');
    let out = segments.map((seg) => seg[0]).join('');
    if (romanTarget) {
      // dt=rm 时罗马字在最后一段的第 3 项
      const roman = data[0].map((seg) => seg[2]).filter((v) => typeof v === 'string' && v).join(' ');
      if (roman) out = roman;
    }
    return { text: out, detected: data[2] };
  },

  async lingva({ fetch, lingvaServers }, text, source, target) {
    let lastError = '没有可用的服务器';
    for (const server of lingvaServers) {
      const base = server.trim().replace(/\/+$/, '');
      if (!base) continue;
      if ((deadUntil.get(base) || 0) > Date.now()) {
        lastError = '服务器暂时都不可用';
        continue;
      }
      try {
        const sl = source === 'ne-Latn' ? 'auto' : LINGVA_CODES[source] || source;
        const res = await fetch(
          `${base}/api/v1/${sl}/${LINGVA_CODES[target] || target}/${encodeURIComponent(text)}`,
          { signal: AbortSignal.timeout(8000) },
        );
        const data = await res.json().catch(() => null);
        if (res.ok && data?.translation) return { text: data.translation, detected: data.info?.detectedSource };
        lastError = data?.error || `HTTP ${res.status}`;
      } catch (e) {
        lastError = e.message;
      }
      deadUntil.set(base, Date.now() + DEAD_MS);
    }
    throw new Error(`Lingva 不可用（${lastError}）`);
  },
};

// Translations are saved to disk (loadTranslationCache) so reopening the app reuses them instead of paying again.
// Map order is least-recently-used first; cachedAt is the last time an entry was used.
const cache = new Map();
const cachedAt = new Map();
const CACHE_MAX = 20000;
let cacheFile = null;
let saveTimer = null;
function loadTranslationCache(file) {
  cacheFile = file;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [key, result, at] of (saved.entries || []).slice(-CACHE_MAX)) { cache.set(key, result); cachedAt.set(key, at || Date.now()); }
  } catch { /* first run or unreadable file: start empty */ }
}
function flushTranslationCache() {
  clearTimeout(saveTimer); saveTimer = null;
  if (!cacheFile) return;
  try {
    const tmp = cacheFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, entries: [...cache].map(([key, result]) => [key, result, cachedAt.get(key)]) }));
    fs.renameSync(tmp, cacheFile);
  } catch (e) { console.error('translation cache save failed', e.message); }
}
const saveSoon = () => { if (cacheFile && !saveTimer) saveTimer = setTimeout(flushTranslationCache, 15000); };

// Only skip when the text itself is unambiguous. Latin letters may be many
// different languages; a configured source alone is not proof of the input.
function localUnchanged(text, target) {
  const content = String(text).replace(/https?:\/\/[^\s]+|www\.[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|@[\p{L}\p{N}_]+/gu, '');
  const letters = [...content].filter((char) => /\p{L}/u.test(char));
  if (!letters.length) return true; // Numbers, emoji and links need no translation.
  return normLang(target).startsWith('zh-') && letters.every((char) => /\p{Script=Han}/u.test(char));
}

// ctx: { fetch, lingvaServers, claudeKey }，fetch 用发起翻译的账号自己的 session，这样也走该账号的代理
async function translate({ text, source = 'auto', target, route = 'auto' }, ctx) {
  if (localUnchanged(text, target)) return { text, detected: target, engine: 'local', same: true };
  const engines = routeEngines(route, ctx);
  const key = `${engines.join('>')}|${source}|${target}|${text}`;
  if (cache.has(key)) {
    const hit = cache.get(key);
    cache.delete(key); cache.set(key, hit); cachedAt.set(key, Date.now()); saveSoon();
    return hit;
  }

  const errors = [];
  for (const engine of engines) {
    try {
      const r = await ENGINES[engine](ctx, text, source, target);
      const result = {
        text: r.text,
        detected: r.detected || source,
        engine,
        fallbackFrom: errors.length ? errors.join('；') : undefined,
        // 原文本来就是目标语言（或译文与原文相同），调用方可以不显示
        same: normLang(r.detected) === normLang(target) || r.text.trim() === text.trim(),
      };
      // 有引擎失败过（没 Key、限流、断网）的结果不缓存：问题修好后下次直接重试首选引擎
      if (!errors.length) {
        if (cache.size >= CACHE_MAX) { const oldest=cache.keys().next().value;cache.delete(oldest);cachedAt.delete(oldest); }
        cache.set(key, result);
        cachedAt.set(key,Date.now());
        saveSoon();
      }
      return result;
    } catch (e) {
      errors.push(e.message);
    }
  }
  throw new Error(errors.join('；'));
}

function clearTranslationCache(cutoff){let removed=0;for(const[key,at]of cachedAt)if(at<cutoff){cache.delete(key);cachedAt.delete(key);removed++;}saveSoon();return{removed,remaining:cache.size};}
module.exports = { translate, DEFAULT_LINGVA_SERVERS, clearTranslationCache, loadTranslationCache, flushTranslationCache };
