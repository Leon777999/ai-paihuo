import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { MODEL, validInstant, validateInput, validateOutput } from '../worker/index.mjs';

const origin = 'https://leon777999.github.io';
const token = 'unit-test-only-token-00000000000000000000';
const body = { text: '让小王明天下午三点提交报价', now: '2026-11-02T02:00:00.000Z', timeZone: 'Asia/Shanghai' };
const output = { who: '小王', task: '提交报价', std: '', due: '2026-11-03T15:00:00+08:00', rem: null, warnings: [] };
function fixture(overrides = {}) {
  const calls = [];
  return {
    calls,
    env: {
      ALLOWED_ORIGIN: origin, APP_TOKEN: token,
      PARSE_LIMITER: { async limit() { return { success: true }; } },
      AI: { async run(model, options) { calls.push({ model, options }); return { response: output }; } },
      ...overrides
    }
  };
}
function req(options = {}) {
  return new Request(options.url || 'https://worker.example/api/parse', {
    method: options.method || 'POST',
    headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...options.headers },
    ...(!['GET', 'OPTIONS'].includes(options.method) ? { body: options.raw ?? JSON.stringify(options.body ?? body) } : {})
  });
}

test('Worker invokes its AI binding (mocked) with structured JSON, context and bounded output', async () => {
  const { env, calls } = fixture();
  const response = await worker.fetch(req(), env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, 'workers-ai');
  assert.equal(result.model, MODEL);
  assert.equal(result.due, '2026-11-03T07:00:00.000Z');
  assert.equal(result.rem, null);
  assert.match(result.warnings.join(' '), /提醒/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.response_format.type, 'json_schema');
  assert.match(calls[0].options.messages[0].content, /Asia\/Shanghai/);
  assert.equal(calls[0].options.max_tokens, 600);
});
test('JSON string response is supported', async () => {
  const { env } = fixture({ AI: { run: async () => ({ response: JSON.stringify(output) }) } });
  assert.equal((await worker.fetch(req(), env)).status, 200);
});
test('missing/incorrect bearer does not reach the model', async () => {
  const { env, calls } = fixture();
  const response = await worker.fetch(req({ headers: { authorization: 'Bearer wrong' } }), env);
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
  assert.ok(!(await response.text()).includes(token));
});
test('configuration fails closed if auth or limiter missing', async () => {
  for (const setting of [{ APP_TOKEN: '' }, { PARSE_LIMITER: null }, { AI: null }]) {
    const { env } = fixture(setting);
    assert.equal((await worker.fetch(req(), env)).status, 503);
  }
});
test('exact CORS rejects lookalike and unrelated origins', async () => {
  const { env, calls } = fixture();
  for (const candidate of [origin + '.evil.example', 'https://evil.example', 'null']) {
    const response = await worker.fetch(req({ headers: { origin: candidate } }), env);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(calls.length, 0);
});
test('CORS preflight supports authorization and returns no wildcard', async () => {
  const { env, calls } = fixture();
  const response = await worker.fetch(req({ method: 'OPTIONS' }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.match(response.headers.get('access-control-allow-headers'), /Authorization/);
  assert.equal(calls.length, 0);
});
test('method, path, content-type and malformed JSON return distinct errors', async () => {
  const { env } = fixture();
  const cases = [[{ method: 'GET' }, 405], [{ url: 'https://worker.example/api/wrong' }, 404], [{ headers: { 'content-type': 'text/plain' } }, 415], [{ raw: '{' }, 400]];
  for (const [options, status] of cases) assert.equal((await worker.fetch(req(options), env)).status, status);
});
test('body and text length limits are enforced before model call', async () => {
  const { env, calls } = fixture();
  assert.equal((await worker.fetch(req({ raw: 'x'.repeat(8193) }), env)).status, 413);
  assert.equal((await worker.fetch(req({ body: { ...body, text: 'x'.repeat(1001) } }), env)).status, 400);
  assert.equal(calls.length, 0);
});
test('invalid timezone and invalid now rejected', async () => {
  const { env, calls } = fixture();
  for (const override of [{ timeZone: 'Mars/Olympus' }, { now: '2026-02-30T10:00:00Z' }, { now: '2026-11-02T10:00:00' }, { text: '  ' }]) {
    assert.equal((await worker.fetch(req({ body: { ...body, ...override } }), env)).status, 400);
  }
  assert.equal(calls.length, 0);
});
test('rate limiter stops AI invocation and reports retry', async () => {
  const { env, calls } = fixture({ PARSE_LIMITER: { limit: async () => ({ success: false }) } });
  const response = await worker.fetch(req(), env);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(calls.length, 0);
});
test('upstream failure is visible and provider details are not leaked', async () => {
  const { env } = fixture({ AI: { run: async () => { throw Error(`provider private diagnostic ${token}`); } } });
  const response = await worker.fetch(req(), env);
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.match(text, /MODEL_UNAVAILABLE/);
  assert.ok(!text.includes(token));
});
test('malformed output never receives an AI success label', async () => {
  for (const bad of ['not JSON', { ...output, due: '2026-02-30T15:00:00+08:00' }, { ...output, due: '2026-11-03T15:00:00' }, { ...output, task: '' }, { ...output, warnings: 'none' }, { ...output, who: null }]) {
    const { env } = fixture({ AI: { run: async () => ({ response: bad }) } });
    const response = await worker.fetch(req(), env);
    assert.equal(response.status, 502);
    assert.match(await response.text(), /INVALID_MODEL_OUTPUT/);
  }
});
test('missing due remains null and clears an unusable reminder', () => {
  const result = validateOutput({ ...output, due: null, rem: output.due }, body);
  assert.equal(result.due, null);
  assert.equal(result.rem, null);
  assert.match(result.warnings.join(' '), /手动确认/);
});
test('reminder after due is cleared and past dates are flagged', () => {
  const result = validateOutput({ ...output, due: '2026-11-01T15:00:00+08:00', rem: output.due }, body);
  assert.equal(result.rem, null);
  assert.match(result.warnings.join(' '), /已经过去/);
  assert.match(result.warnings.join(' '), /晚于/);
});
test('strict instant validates leap years, clock and numeric offsets', () => {
  for (const valid of ['2028-02-29T23:59:59Z', '2026-11-02T15:00:00+08:00', '2026-11-02T15:00:00-04:00']) assert.ok(validInstant(valid));
  for (const invalid of ['2026-02-29T10:00:00Z', '2026-11-31T10:00:00Z', '2026-11-02T24:00:00Z', '2026-11-02T10:00:00+14:01', '2026-11-02T10:00:00+08:99', null]) assert.equal(validInstant(invalid), false);
  assert.equal(validateInput(body).text, body.text);
});
