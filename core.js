(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PaihuoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const NUM = '(?:[0-9]+|[零〇一二两三四五六七八九十百]+)';
  function cnum(value) {
    if (/^\d+$/.test(value)) return Number(value);
    if (value === '十') return 10;
    if (value.includes('百')) {
      const [a, b] = value.split('百');
      return (DIGITS[a] || 1) * 100 + (b ? cnum(b.replace(/^零/, '')) : 0);
    }
    if (value.includes('十')) {
      const [a, b] = value.split('十');
      return (a ? DIGITS[a] : 1) * 10 + (b ? DIGITS[b] : 0);
    }
    return value.length === 1 ? DIGITS[value] : Number(value.split('').map(x => DIGITS[x]).join(''));
  }
  function wallParts(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(date);
    return Object.fromEntries(parts.filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  }
  function fromWall(year, month, day, hour, minute, timeZone) {
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    const target = Date.UTC(year, month - 1, day, hour, minute);
    const check = new Date(target);
    if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    let guess = target;
    for (let i = 0; i < 4; i++) {
      const p = wallParts(new Date(guess), timeZone);
      const delta = target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
      guess += delta;
      if (!delta) break;
    }
    const p = wallParts(new Date(guess), timeZone);
    return p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute ? new Date(guess) : null;
  }
  function checkedDate(value, field) {
    if (value == null || value === '') return null;
    if (typeof value === 'string') {
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/);
      if (!m) throw new Error(field + ' 必须包含完整日期和时区');
      const [, y, mo, d, h, mi, se = '00', offset] = m;
      const check = new Date(Date.UTC(+y, +mo - 1, +d));
      if (+mo < 1 || +mo > 12 || +d < 1 || check.getUTCFullYear() !== +y || check.getUTCMonth() !== +mo - 1 || check.getUTCDate() !== +d || +h > 23 || +mi > 59 || +se > 59) throw new Error(field + ' 日期无效');
      if (offset !== 'Z' && (+offset.slice(1, 3) > 14 || +offset.slice(4) > 59 || (+offset.slice(1, 3) === 14 && +offset.slice(4) !== 0))) throw new Error(field + ' 时区偏移无效');
    } else if (!(value instanceof Date) && typeof value !== 'number') throw new Error(field + ' 日期无效');
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) throw new Error(field + ' 日期无效');
    return d;
  }
  function normalizeParsed(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('解析结果格式无效');
    function field(name, max, required) {
      const v = value[name] == null ? '' : value[name];
      if (typeof v !== 'string' || v.length > max || (required && !v.trim())) throw new Error(name + ' 内容无效');
      return v.trim();
    }
    const result = { who: field('who', 100), task: field('task', 2000, true), std: field('std', 2000), due: checkedDate(value.due, '截止'), rem: checkedDate(value.rem, '提醒'), warnings: [] };
    if ((!result.due && result.rem) || (result.due && result.rem && result.rem > result.due)) throw new Error('提醒时间不能晚于截止时间');
    if (value.warnings != null) {
      if (!Array.isArray(value.warnings) || value.warnings.length > 20 || value.warnings.some(x => typeof x !== 'string' || x.length > 300)) throw new Error('解析提示格式无效');
      result.warnings = value.warnings.slice();
    }
    return result;
  }
  function parseLocal(text, now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new Error('请输入 1—2000 字的任务');
    now = checkedDate(now, '当前时间');
    const p = wallParts(now, timeZone); // Also validates the IANA time zone.
    const warnings = [], spans = [];
    let s = text.trim(), due = null, rem = null, explicitDay = false, relative = false;
    let year = p.year, month = p.month, day = p.day, hour = 18, minute = 0;
    const take = m => { if (m) spans.push([m.index, m.index + m[0].length]); return m; };
    const reminderMatch = s.match(new RegExp('提前\\s*(' + NUM + ')\\s*(分钟|小时|天)\\s*(?:提醒(?:我)?|通知(?:我)?)'));
    let advance = reminderMatch ? cnum(reminderMatch[1]) * ({ 分钟: 60000, 小时: 3600000, 天: 86400000 }[reminderMatch[2]]) : null;
    take(reminderMatch);
    let m = s.match(new RegExp('(' + NUM + ')\\s*(分钟|小时)后'));
    if (m && (!reminderMatch || m.index < reminderMatch.index || m.index >= reminderMatch.index + reminderMatch[0].length)) {
      take(m); due = new Date(now.getTime() + cnum(m[1]) * (m[2] === '小时' ? 3600000 : 60000)); relative = true;
    }
    if (!relative) {
      m = s.match(/(?:(\d{4})年)?(\d{1,2}|[一二三四五六七八九十]+)月(\d{1,2}|[一二三四五六七八九十]+)[日号]/);
      if (m) {
        take(m); explicitDay = true; year = m[1] ? +m[1] : p.year; month = cnum(m[2]); day = cnum(m[3]);
        if (!m[1] && (month < p.month || (month === p.month && day < p.day))) { year++; warnings.push('未写年份，按下一次该日期处理，请核对。'); }
      } else if ((m = s.match(/(\d{4})-(\d{2})-(\d{2})/))) {
        take(m); explicitDay = true; year = +m[1]; month = +m[2]; day = +m[3];
      } else if ((m = s.match(/大后天|后天|明天|明早|明晚|今天|今日|今晚/))) {
        take(m); explicitDay = true;
        const add = /大后天/.test(m[0]) ? 3 : /后天/.test(m[0]) ? 2 : /明/.test(m[0]) ? 1 : 0;
        const d = new Date(Date.UTC(year, month - 1, day + add)); year = d.getUTCFullYear(); month = d.getUTCMonth() + 1; day = d.getUTCDate();
      } else if ((m = s.match(/(下|本|这)?(?:周|星期|礼拜)([一二三四五六日天1-7])/))) {
        take(m); explicitDay = true;
        const target = /\d/.test(m[2]) ? +m[2] % 7 : m[2] === '天' ? 0 : '日一二三四五六'.indexOf(m[2]);
        const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
        const mondayDistance = (weekday + 6) % 7;
        const diff = m[1] === '下' ? 7 - mondayDistance + (target + 6) % 7 : m[1] ? -mondayDistance + (target + 6) % 7 : (target - weekday + 7) % 7;
        const d = new Date(Date.UTC(year, month - 1, day + diff)); year = d.getUTCFullYear(); month = d.getUTCMonth() + 1; day = d.getUTCDate();
      } else if ((m = s.match(new RegExp('(' + NUM + ')\\s*天(?:后|内)')))) {
        take(m); explicitDay = true;
        const d = new Date(Date.UTC(year, month - 1, day + cnum(m[1]))); year = d.getUTCFullYear(); month = d.getUTCMonth() + 1; day = d.getUTCDate();
      }
      const timePattern = '(凌晨|上午|早上|中午|下午|晚上|晚间)?\\s*(' + NUM + ')\\s*(?:点|时|[:：])\\s*(半|一刻|三刻|(?:' + NUM + ')分?)?';
      const timeMatches = [...s.matchAll(new RegExp(timePattern, 'g'))];
      const timeMatch = timeMatches[0];
      if (timeMatch) {
        take(timeMatch); hour = cnum(timeMatch[2]); const value = timeMatch[3] || '';
        minute = value === '半' ? 30 : value === '一刻' ? 15 : value === '三刻' ? 45 : value ? cnum(value.replace(/分$/, '')) : 0;
        const period = timeMatch[1] || (/明晚|今晚/.test(s) ? '晚上' : /明早/.test(s) ? '早上' : '');
        if (/下午|晚|中午/.test(period) && hour >= 1 && hour < 12) hour += 12;
        if (/凌晨|上午|早上/.test(period) && hour === 12) hour = 0;
        if (!period && hour >= 1 && hour <= 11 && !/[:：]/.test(timeMatch[0])) warnings.push('未注明上午或下午，按 24 小时制处理，请核对。');
        if (!explicitDay) warnings.push('只写了时间，暂按今天处理，请核对日期。');
        explicitDay = true;
      } else if (explicitDay && !/明早|明晚|今晚|凌晨|上午|早上|中午|下午|晚上|晚间/.test(s)) warnings.push('未写具体时刻，暂按 18:00 处理，请核对。');
      if (explicitDay) {
        due = fromWall(year, month, day, hour, minute, timeZone);
        if (!due) warnings.push('日期或时刻无效，请手动填写截止时间。');
      }
      if (timeMatches.length > 1) {
        due = null;
        warnings.push('识别到多个时刻，无法确定哪个是截止时间，请手动填写。');
      }
      if (!timeMatch && /明早|明晚|今晚|凌晨|上午|早上|中午|下午|晚上|晚间/.test(s)) {
        due = null;
        warnings.push('只写了大致时段，没有具体时刻，请手动填写截止时间。');
      }
    }
    if (/每天|每周|每月|每年|每隔|工作日/.test(text)) {
      due = null;
      warnings.push('本地规则暂不支持重复任务，请逐次设置具体截止时间。');
    }
    if (!due) warnings.push('没有识别到明确截止时间，请手动填写。');
    else {
      if (due <= now) warnings.push('识别的截止时间已经过去，请核对后再保存。');
      const suggested = due.getTime() - (advance == null ? 7200000 : advance);
      rem = new Date(suggested);
      if (advance == null && relative) rem = new Date(due);
      else if (suggested <= now.getTime()) {
        rem = new Date(due);
        warnings.push('提前提醒时间已过，暂改为截止时提醒，请核对。');
      }
    }
    // Remove only spans actually understood, rather than deleting characters inside task names.
    spans.sort((a, b) => b[0] - a[0]).forEach(([a, b]) => { s = s.slice(0, a) + ' \u0001 ' + s.slice(b); });
    let who = '', std = '按时完成，完成后回复我';
    const whoMatch = s.match(/^(?:让|叫|请|通知|安排|派|告诉)\s*([\u4e00-\u9fffA-Za-z]{1,12}?)(?=\s|在|于|把|将|去|给|做|完成|负责|准备|跟进|整理|写|提交|处理|联系|检查|核对|发送|尽快|务必|一定要)/)
      || s.match(/^([小老][\u4e00-\u9fff]|[\u4e00-\u9fff]{1,3}(?:总|经理|工|哥|姐))(?=\s|把|将|去|给|做|完成|负责|准备|跟进|整理|写|提交|处理|联系|检查|核对|发送|尽快|务必|一定要)/);
    if (whoMatch) { who = whoMatch[1]; s = s.slice(whoMatch[0].length); }
    const standard = s.match(/(?:要求|标准(?:是|为)?)[：:\s]*(.+)$/);
    if (standard) { std = standard[1].trim(); s = s.slice(0, standard.index); }
    s = s.replace(/(?:在|于)?\s*\u0001\s*(?:(?:之前|以前|前)(?=\s|把|将|去|负责|完成|整理|提交|联系|准备|核对|发送|检查|做|写|处理|$))?/g, ' ')
      .replace(/^\s*(?:提醒我|请|让|叫)\s*/, '').replace(/^\s*(?:把|将|去|负责)\s*/, '')
      .replace(/[，,。；;\s]+$/g, '').replace(/\s+/g, ' ').trim();
    if (/；|;|另外|然后再|同时(?:让|请)|分别/.test(text)) warnings.push('可能包含多项任务，请拆分后逐项确认。');
    if (!who) warnings.push('未识别负责人，请确认是否需要补充。');
    return normalizeParsed({ who, task: s || text.trim(), std, due, rem, warnings });
  }
  function icsEscape(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
  function foldLine(line) {
    let out = '', bytes = 0;
    for (const c of line) {
      const size = new TextEncoder().encode(c).length;
      if (bytes + size > 75) { out += '\r\n '; bytes = 1; }
      out += c; bytes += size;
    }
    return out;
  }
  function buildCalendar(task, { now = new Date() } = {}) {
    const parsed = normalizeParsed(task);
    if (!parsed.due) throw new Error('导出日历前请填写截止时间');
    const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const idSeed = String(task.id || [parsed.task, parsed.who, +parsed.due].join('|'));
    let hash = 2166136261;
    for (const char of idSeed) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AI Paihuo//Task Reminder//ZH', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', 'UID:paihuo-' + hash.toString(16) + '@ai-paihuo.local', 'DTSTAMP:' + stamp(checkedDate(now, '当前时间')), 'DTSTART:' + stamp(parsed.due), 'DTEND:' + stamp(new Date(+parsed.due + 900000)), 'SUMMARY:' + icsEscape((parsed.who ? parsed.who + '：' : '') + parsed.task), 'DESCRIPTION:' + icsEscape(parsed.std), 'STATUS:CONFIRMED'];
    if (parsed.rem) {
      const seconds = Math.floor((parsed.due - parsed.rem) / 1000);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(parsed.task), 'TRIGGER:-PT' + seconds + 'S', 'END:VALARM');
    }
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }
  return Object.freeze({ parseLocal, normalizeParsed, buildCalendar });
});
