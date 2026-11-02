const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLocal, normalizeParsed, buildCalendar } = require('../core');
const now = new Date('2026-11-08T01:00:00Z'); // Sunday 09:00 in Shanghai.
const parse = text => parseLocal(text, now, 'Asia/Shanghai');
test('next week uses the next calendar week from Sunday', () => {
  const p = parse('让小王下周一下午三点半提交报价');
  assert.equal(p.who, '小王'); assert.equal(p.task, '提交报价');
  assert.equal(p.due.toISOString(), '2026-11-09T07:30:00.000Z');
  assert.equal(parse('下周五15:30联系客户').due.toISOString(), '2026-11-13T07:30:00.000Z');
});
test('relative minutes/hours are real intervals and preserve action', () => {
  const p = parse('10分钟后提醒我联系客户');
  assert.equal(p.due.toISOString(), '2026-11-08T01:10:00.000Z'); assert.equal(+p.rem, +p.due); assert.equal(p.task, '联系客户');
  assert.equal(parse('两小时后提交方案').due.toISOString(), '2026-11-08T03:00:00.000Z');
});
test('no deadline stays blank; task content does not lose 在 or 前', () => {
  const p = parse('请小王整理在建项目的前期资料');
  assert.equal(p.due, null); assert.equal(p.rem, null); assert.equal(p.task, '整理在建项目的前期资料');
  assert.ok(p.warnings.some(w => w.includes('截止时间')));
});
test('leading task words are preserved; urgency is not part of owner name', () => {
  for (const task of ['在建项目的前期资料', '前台资料整理', '于经理的报价', '前期资料整理']) assert.equal(parse(task).task, task);
  assert.equal(parse('让小王尽快完成报价').who, '小王');
  assert.equal(parse('让小王务必提交报价').who, '小王');
  assert.equal(parse('让小王周五前整理资料').task, '整理资料');
});
test('vague periods do not fabricate an exact evening deadline', () => {
  for (const phrase of ['明早提交报价', '明晚提交报价', '今晚提交报价', '明天上午提交报价', '今天中午联系客户', '下午联系客户']) {
    const result = parse(phrase); assert.equal(result.due, null); assert.equal(result.rem, null); assert.ok(result.warnings.some(w => w.includes('具体时刻')));
  }
});
test('near deadline default reminders remain future after minute precision form roundtrip', () => {
  const p = parseLocal('今天下午三点提交报价', new Date('2026-11-02T06:20:59Z'), 'Asia/Shanghai');
  assert.equal(p.rem.toISOString(), '2026-11-02T07:00:00.000Z');
  assert.ok(p.warnings.some(w => w.includes('提醒')));
});
test('date/time grammar, Chinese minutes and explicit reminder lead', () => {
  assert.equal(parse('明天下午三点三十分联系客户').due.toISOString(), '2026-11-09T07:30:00.000Z');
  assert.equal(parse('2026年12月1日15:30联系客户，提前两小时提醒').rem.toISOString(), '2026-12-01T05:30:00.000Z');
  assert.equal(parse('明天联系客户').due.toISOString(), '2026-11-09T10:00:00.000Z');
  assert.ok(parse('明天联系客户').warnings.some(w => w.includes('18:00')));
});
test('invalid dates and hours stay blank rather than rolling to another day', () => {
  assert.equal(parse('2026年2月30日15:00提交报价').due, null);
  assert.equal(parse('明天25:90提交报价').due, null);
});
test('ambiguous multiple tasks emit a warning and do not claim perfect splitting', () => {
  assert.ok(parse('让小王明天交报价；另外请小李联系客户').warnings.some(w => w.includes('多项任务')));
  assert.equal(parse('明天下午三点开会四点提交报价').due, null);
  assert.equal(parse('每周五下午三点提交报价').due, null);
});
test('AI result validation rejects invalid dates, offsets, schema and reminders after due', () => {
  const base = { who: '小王', task: '提交报价', std: '', due: '2026-11-09T15:30:00+08:00', rem: null };
  assert.equal(normalizeParsed(base).due.toISOString(), '2026-11-09T07:30:00.000Z');
  for (const due of ['2026-02-30T15:30:00Z', '2026-11-09T25:30:00Z', '2026-11-09T15:30', '2026-11-09T15:30:00+15:00', 'garbage', Infinity]) assert.throws(() => normalizeParsed({ ...base, due }));
  assert.throws(() => normalizeParsed({ ...base, task: 'x'.repeat(2001) }));
  assert.throws(() => normalizeParsed({ ...base, rem: '2026-11-10T15:30:00+08:00' }));
  assert.throws(() => normalizeParsed({ ...base, due: null, rem: '2026-11-09T15:30:00+08:00' }));
});
test('timezone wall conversion honors local date near midnight', () => {
  const p = parseLocal('明天上午九点提交报价', new Date('2026-11-08T17:00:00Z'), 'Asia/Shanghai');
  assert.equal(p.due.toISOString(), '2026-11-10T01:00:00.000Z');
});
test('nonexistent daylight-saving wall time is rejected', () => {
  assert.equal(parseLocal('2027年3月14日02:30提交报价', now, 'America/New_York').due, null);
});
test('calendar has stable UID, UTC dates, alarm and safe escaped UTF8 folding', () => {
  const p = { id: 'x\r\nBEGIN:VEVENT', who: '小王', task: '报价,标准;\nBEGIN:VEVENT' + '中文任务'.repeat(40), std: '预算\\报价', due: Date.parse('2026-11-09T07:30Z'), rem: Date.parse('2026-11-09T05:30Z') };
  const out = buildCalendar(p, { now });
  assert.ok(out.includes('DTSTART:20261109T073000Z\r\n'));
  assert.ok(out.includes('TRIGGER:-PT7200S\r\n'));
  assert.equal((out.match(/\r\nBEGIN:VEVENT\r\n/g) || []).length, 1);
  assert.ok(out.includes('报价\\,标准\\;\\nBEGIN:VEVENT'));
  for (const line of out.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.equal(out.match(/UID:(.+)/)[1], buildCalendar(p, { now: new Date(+now + 1000) }).match(/UID:(.+)/)[1]);
  assert.throws(() => buildCalendar({ ...p, due: null }));
});
