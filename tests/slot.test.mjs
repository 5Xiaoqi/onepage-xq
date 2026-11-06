import test from 'node:test';
import assert from 'node:assert/strict';

import { slotHint } from '../js/slot.js';
import { parseTask } from '../js/task-parser.js';

const NOW = new Date(2026, 9, 31, 7, 50, 0); // 2026-10-31 07:50

/* 时段建议：固定规则 */

test('约会类不给建议（自带时间）', () => {
  assert.equal(slotHint({ title: '开会', style: 'appointment' }, NOW), null);
});

test('等待类固定给跟进时段', () => {
  assert.equal(slotHint({ title: '等回复', style: 'waiting' }, NOW).slot, '16:30–17:30 跟进');
});

test('机械活塞午后低谷，优先于用时判断', () => {
  const h = slotHint({ title: '报销单', style: 'normal', subtasks: [{ minutes: 30, done: false }] }, NOW);
  assert.equal(h.slot, '午后 13:00–14:00 或碎片');
});

test('重复任务尊重已定时间，不被关键词改写', () => {
  const h = slotHint(
    { title: '做数学', style: 'habit', recurrence: { type: 'weekly', weekdays: [1, 3, 5], time: '19:30' } },
    NOW
  );
  assert.equal(h.slot, '按已定时间 19:30');
});

test('关键词分流：背单词 → 早上，做数学 → 晚上', () => {
  assert.equal(slotHint({ title: '背单词', style: 'normal' }, NOW).slot, '早上 06:40–07:10');
  assert.equal(slotHint({ title: '做数学第三章', style: 'normal' }, NOW).slot, '晚上 19:30–21:30');
  assert.equal(slotHint({ title: '站桩', style: 'normal' }, NOW).slot, '傍晚 16:30–17:30');
});

test('按下一步用时分级', () => {
  assert.equal(
    slotHint({ title: '写点东西', style: 'normal', subtasks: [{ minutes: 45, done: false }] }, NOW).slot,
    '周末 09:00–11:30，或晚上第 1–2 段'
  );
  assert.equal(
    slotHint({ title: '写点东西', style: 'normal', subtasks: [{ minutes: 20, done: false }] }, NOW).slot,
    '晚上 19:30–21:30，一段 20 分钟'
  );
  assert.equal(
    slotHint({ title: '写点东西', style: 'normal', subtasks: [{ minutes: 5, done: false }] }, NOW).slot,
    '午后 13:00–14:00 或碎片'
  );
});

test('已完成的步骤跳过，看下一步', () => {
  const h = slotHint(
    {
      title: '写点东西',
      style: 'normal',
      subtasks: [
        { minutes: 60, done: true },
        { minutes: 15, done: false },
      ],
    },
    NOW
  );
  assert.equal(h.slot, '午后 13:00–14:00 或碎片');
});

test('截止类没拆步骤 → 倒排提示，并报剩余天数', () => {
  const h = slotHint(
    { title: '交齐材料', style: 'deadline', dueAt: new Date(2026, 10, 6, 20, 0).toISOString() },
    NOW
  );
  assert.equal(h.slot, '今晚 19:30–21:30 起，20 分钟一段');
  assert.match(h.why, /还有 6 天|还有 7 天/);
});

test('什么都没给 → 兜底，不崩', () => {
  assert.equal(slotHint({ title: '写点东西', style: 'normal', subtasks: [] }, NOW).slot, '随手做，但别放在 22:00 后');
  assert.equal(slotHint(null, NOW), null);
  assert.equal(slotHint({}, NOW).slot.length > 0, true);
});

/* 批量粘贴：整句解析后能接上建议 */

test('批量粘贴的句子：样式识别 + 建议不打架', () => {
  const cases = [
    ['每天早上6点40背单词', 'habit', '按已定时间 06:40'],
    ['每周一三五晚上7点半做数学', 'habit', '按已定时间 19:30'],
    ['周五前交齐结项材料', 'deadline', '今晚 19:30–21:30 起，20 分钟一段'],
    ['等电气新能源学院回复调动的事', 'waiting', '16:30–17:30 跟进'],
    ['报销单填了', 'normal', '午后 13:00–14:00 或碎片'],
  ];
  for (const [line, style, slot] of cases) {
    const p = parseTask(line, NOW);
    assert.ok(p, `解析失败：${line}`);
    assert.equal(p.style, style, `${line} 样式不对`);
    assert.equal(slotHint(p, NOW).slot, slot, `${line} 建议不对`);
  }
});

test('没写时间的习惯：不假装是用户定的 09:00，继续看关键词', () => {
  const run = parseTask('每天跑步', NOW);
  assert.equal(run.recurrence.timeInferred, true);
  assert.equal(slotHint(run, NOW).slot, '傍晚 16:30–17:30');

  const diary = parseTask('每天写日报', NOW);
  assert.equal(diary.recurrence.timeInferred, true);
  assert.equal(slotHint(diary, NOW).slot, '按默认时间 09:00');
});

test('写了钟点的习惯：尊重用户的时间，不被关键词改写', () => {
  const p = parseTask('每天9点跑步', NOW);
  assert.equal(p.recurrence.timeInferred, false);
  assert.equal(slotHint(p, NOW).slot, '按已定时间 09:00');
});

test('“背”不再误伤“背景调查”', () => {
  const h = slotHint({ title: '背景调查', style: 'normal' }, NOW);
  assert.notEqual(h.slot, '早上 06:40–07:10');
});
