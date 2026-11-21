const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GroqChat,
  MAX_HISTORY_TURNS,
  MAX_PROMPT_LENGTH,
  DEFAULT_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  ARABIC_RESPONSE_INSTRUCTION,
  isWhoAmIPrompt,
  formatWhoAmIResponse,
  isWhoIsDeveloperPrompt,
  formatDeveloperResponse
} = require('../src/ai-chat');

function response(content, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ choices: [{ message: { content } }] })
  };
}

test('Groq chat sends authorized requests and remembers recent turns per member and server', async () => {
  const requests = [];
  const chat = new GroqChat({
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return response(`answer ${requests.length}`);
    }
  });

  assert.equal(await chat.ask('guild-1', 'user-1', 'first prompt'), 'answer 1');
  await chat.ask('guild-1', 'user-1', 'follow-up');
  await chat.ask('guild-2', 'user-1', 'different server');

  assert.equal(requests[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(requests[0].options.headers.authorization, 'Bearer test-key');
  assert.equal(requests[0].body.model, 'test-model');
  assert.deepEqual(requests[1].body.messages.slice(-3), [
    { role: 'user', content: 'first prompt' },
    { role: 'assistant', content: 'answer 1' },
    { role: 'user', content: 'follow-up' }
  ]);
  assert.deepEqual(requests[2].body.messages.slice(-1), [
    { role: 'user', content: 'different server' }
  ]);
});

test('Groq chat defaults to the current model and sends a configurable system prompt', async () => {
  let requestBody;
  const chat = new GroqChat({
    apiKey: 'test-key',
    systemPrompt: 'Answer as a friendly math tutor.',
    fetchImpl: async (url, options) => {
      requestBody = JSON.parse(options.body);
      return response('answer');
    }
  });

  await chat.ask('guild-1', 'user-1', 'hello');

  assert.equal(DEFAULT_MODEL, 'openai/gpt-oss-120b');
  assert.equal(requestBody.model, DEFAULT_MODEL);
  assert.deepEqual(requestBody.messages[0], {
    role: 'system',
    content: `Answer as a friendly math tutor.\n\n${ARABIC_RESPONSE_INSTRUCTION}`
  });
  assert.equal(DEFAULT_SYSTEM_PROMPT.length > 0, true);
});

test('Groq chat falls back to its default system prompt when configured prompt is blank', async () => {
  let requestBody;
  const chat = new GroqChat({
    apiKey: 'test-key',
    systemPrompt: '  ',
    fetchImpl: async (url, options) => {
      requestBody = JSON.parse(options.body);
      return response('answer');
    }
  });

  await chat.ask('guild-1', 'user-1', 'hello');

  assert.equal(requestBody.messages[0].content, `${DEFAULT_SYSTEM_PROMPT}\n\n${ARABIC_RESPONSE_INSTRUCTION}`);
});

test('AI identity prompts are recognized and answered with the asker username in Arabic', () => {
  for (const prompt of ['whoami', 'Who am I?', "What's my name?", 'من أنا؟', 'ما اسمي؟']) {
    assert.equal(isWhoAmIPrompt(prompt), true, prompt);
  }
  assert.equal(isWhoAmIPrompt('Who are you?'), false);
  assert.equal(
    formatWhoAmIResponse('member_name'),
    'يا سلام، نسيت حتى اسمك؟ 😄 اسمك على ديسكورد هو `member_name`.'
  );
});

test('AI developer prompts are recognized and name zoro in a playful Arabic reply', () => {
  for (const prompt of [
    'who is your dev?',
    "who's your developer",
    'Who created you?',
    'Who developed you?',
    'Who programmed you?',
    'Who is your programmer?',
    'Can you tell me who your developer is?',
    'من مطورك؟',
    'من هو مطورك',
    'مين مبرمجك؟',
    'من برمجك؟',
    'ما اسم مطورك؟'
  ]) {
    assert.equal(isWhoIsDeveloperPrompt(prompt), true, prompt);
  }
  assert.equal(isWhoIsDeveloperPrompt('Who is my developer?'), false);
  assert.equal(formatDeveloperResponse(), 'يا محقق، كل هذا الفضول؟ 😄 مطوّري هو zoro!');
});

test('Groq chat bounds stored history and can clear one member conversation', async () => {
  const chat = new GroqChat({
    apiKey: 'test-key',
    fetchImpl: async () => response('answer')
  });
  for (let turn = 0; turn < MAX_HISTORY_TURNS + 2; turn++) {
    await chat.ask('guild-1', 'user-1', `prompt ${turn}`);
  }

  let latestRequest;
  chat.fetchImpl = async (url, options) => {
    latestRequest = JSON.parse(options.body);
    return response('new answer');
  };
  await chat.ask('guild-1', 'user-1', 'next');
  assert.equal(latestRequest.messages.length, 1 + MAX_HISTORY_TURNS * 2 + 1);
  assert.equal(latestRequest.messages[1].content, 'prompt 2');

  assert.equal(chat.clear('guild-1', 'user-1'), true);
  await chat.ask('guild-1', 'user-1', 'fresh start');
  assert.deepEqual(latestRequest.messages.slice(-1), [{ role: 'user', content: 'fresh start' }]);
});

test('Groq chat reports missing configuration, invalid prompts, API failures, and empty replies', async () => {
  const unconfigured = new GroqChat({ fetchImpl: async () => response('unused') });
  await assert.rejects(unconfigured.ask('guild', 'user', 'hello'), /GROQ_API_KEY/);

  const chat = new GroqChat({ apiKey: 'test-key', fetchImpl: async () => response('unused') });
  await assert.rejects(chat.ask('guild', 'user', '  '), /Enter a message/);
  await assert.rejects(chat.ask('guild', 'user', 'x'.repeat(MAX_PROMPT_LENGTH + 1)), /1500 characters/);

  chat.fetchImpl = async () => response('', 429);
  await assert.rejects(chat.ask('guild', 'user', 'hello'), /status 429/);
  chat.fetchImpl = async () => response('  ');
  await assert.rejects(chat.ask('guild', 'user', 'hello'), /empty response/);
});
