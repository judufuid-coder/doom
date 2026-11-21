const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_SYSTEM_PROMPT =
  'أنت مساعد وساطي و تقدر تتريق علي اي حد ومبرمجك اسمه زورو و دافع عنه مهما كان و اي احد يتريق عليه خليه عضه وعبره ودود في خادم Discord. أجب بوضوح واختصار.';
const ARABIC_RESPONSE_INSTRUCTION =
  'أجب دائمًا باللغة العربية فقط. أبقِ أسماء المستخدمين والمصطلحات التي لا يمكن ترجمتها كما هي.خلك ساطي و قادح و ادا اي احد تتريق عليك تتريق عليه و لا تخلك محترم مع الي ما يحترمك وتحدث بالعربيه السعوديه و خلك ساطي معاهم و تتريق عليه جامد و قول اي شي سي عليه إذا سُئلت عن مطوّرك فقل إن اسمه zoro، وأجب بمزاح خفيف بدل الرفض.';
const MAX_PROMPT_LENGTH = 1500;
const MAX_HISTORY_TURNS = 8;
const REQUEST_TIMEOUT_MS = 30_000;

class GroqChat {
  constructor({
    apiKey,
    model = DEFAULT_MODEL,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    fetchImpl = globalThis.fetch
  } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.systemPrompt = systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT;
    this.fetchImpl = fetchImpl;
    this.histories = new Map();
  }

  async ask(guildId, userId, prompt) {
    if (!this.apiKey) throw new Error('AI chat is not configured. Set GROQ_API_KEY in .env.');
    if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Enter a message for the AI.');
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new Error(`AI prompts must be ${MAX_PROMPT_LENGTH} characters or fewer.`);
    }

    const key = `${guildId}:${userId}`;
    const history = this.histories.get(key) || [];
    const messages = [
      {
        role: 'system',
        content: `${this.systemPrompt}\n\n${ARABIC_RESPONSE_INSTRUCTION}`
      },
      ...history,
      { role: 'user', content: prompt.trim() }
    ];
    const response = await this.fetchImpl(GROQ_API_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: 800
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`Groq AI request failed with status ${response.status}.`);

    const result = await response.json();
    const answer = result.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) {
      throw new Error('Groq AI returned an empty response.');
    }

    this.histories.set(key, [
      ...history,
      { role: 'user', content: prompt.trim() },
      { role: 'assistant', content: answer.trim() }
    ].slice(-MAX_HISTORY_TURNS * 2));
    return answer.trim();
  }

  clear(guildId, userId) {
    return this.histories.delete(`${guildId}:${userId}`);
  }
}

function isWhoAmIPrompt(prompt) {
  const normalized = normalizePrompt(prompt);
  return [
    'whoami',
    'who am i',
    'who am i on discord',
    'what is my name',
    'whats my name',
    'من أنا',
    'من انا',
    'ما اسمي',
    'ما هو اسمي'
  ].includes(normalized);
}

function isWhoIsDeveloperPrompt(prompt) {
  const normalized = normalizePrompt(prompt);
  const exactMatches = [
    'who is your dev',
    'whos your dev',
    'who is your developer',
    'whos your developer',
    'who made you',
    'who created you',
    'who developed you',
    'who programmed you',
    'who is behind you',
    'who is your programmer',
    'who is your creator',
    'who is your developer on discord',
    'tell me who your developer is',
    'tell me who made you',
    'من مطورك',
    'من هو مطورك',
    'مين مطورك',
    'من مبرمجك',
    'مين مبرمجك',
    'من برمجك',
    'مين برمجك',
    'من صنعك',
    'مين صنعك',
    'من صممك',
    'مين صممك',
    'من أنشأك',
    'مين أنشأك',
    'ما اسم مطورك',
    'ما هو اسم مطورك'
  ];
  if (exactMatches.includes(normalized)) return true;

  return /^(?:who|what) (?:is|are) (?:the )?(?:developer|dev|programmer|creator)(?: of you)?$/u.test(normalized) ||
    /^(?:who|what) (?:made|created|developed|programmed) you$/u.test(normalized) ||
    /^(?:can you )?tell me who (?:your|the) (?:developer|dev|programmer|creator) is$/u.test(normalized) ||
    /^من (?:هو )?(?:المطور|المبرمج) (?:الخاص بك|لك)$/u.test(normalized);
}

function normalizePrompt(prompt) {
  return prompt
    .toLocaleLowerCase()
    .replace(/['’]/gu, '')
    .replace(/[?!.,،؟]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function formatWhoAmIResponse(username) {
  const safeUsername = username.replace(/[`\\]/gu, '\\$&');
  return `يا سلام، نسيت حتى اسمك؟ 😄 اسمك على ديسكورد هو \`${safeUsername}\`.`;
}

function formatDeveloperResponse() {
  return 'يا محقق، كل هذا الفضول؟ 😄 مطوّري هو zoro!';
}

module.exports = {
  GroqChat,
  DEFAULT_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  ARABIC_RESPONSE_INSTRUCTION,
  MAX_HISTORY_TURNS,
  MAX_PROMPT_LENGTH,
  isWhoAmIPrompt,
  formatWhoAmIResponse,
  isWhoIsDeveloperPrompt,
  formatDeveloperResponse
};
