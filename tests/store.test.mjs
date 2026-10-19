import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const {
  db,
  summaryFor,
  categoryBreakdown,
  dailyExpense,
  todayTasks,
  upcomingTasks,
  focusStats,
  backupPayload,
  txCSV,
} = await import('../js/store.js');
const { habitDoneOn, habitStreak, nextOccurrence } = await import('../js/task-parser.js');
const { uid, addDays, dayKey } = await import('../js/util.js');

const NOW = new Date(2026, 9, 19, 10, 0, 0);

test('记账：新增、月度汇总、分类、最近 7 天', () => {
  db.reset();
  db.addTx({ type: 'expense', amountCents: 3200, merchant: '星巴克', category: 'food', occurredAt: NOW.toISOString() });
  db.addTx({ type: 'expense', amountCents: 280000, merchant: '房租', category: 'home', occurredAt: addDays(NOW, -3).toISOString() });
  db.addTx({ type: 'income', amountCents: 1200000, merchant: '工资', category: 'salary', occurredAt: addDays(NOW, -8).toISOString() });

  const s = summaryFor(NOW);
  assert.equal(s.expense, 283200);
  assert.equal(s.income, 1200000);
  assert.equal(s.net, 916800);

  const cats = categoryBreakdown(NOW);
  assert.equal(cats[0].category, 'home');
  assert.equal(cats[0].cents, 280000);

  const days = dailyExpense(7, NOW);
  assert.equal(days.length, 7);
  assert.equal(days[6].cents, 3200);
});

test('任务：今天 / 接下来 / 习惯打卡', () => {
  db.reset();
  const project = db.addTask({ title: '写报告', style: 'project', dueAt: NOW.toISOString(), subtasks: [{ id: 's1', title: 'a', minutes: 10, done: false }] });
  const future = db.addTask({ title: '下周的事', style: 'normal', dueAt: addDays(NOW, 3).toISOString() });
  const habit = db.addTask({
    title: '跑步',
    style: 'habit',
    recurrence: { type: 'weekly', weekdays: [1, 3, 5], time: '07:30' },
    habit: { log: {} },
  });

  const today = todayTasks(NOW).map((t) => t.id);
  assert.ok(today.includes(project.id));
  assert.ok(today.includes(habit.id));
  assert.ok(!today.includes(future.id));
  assert.ok(upcomingTasks(NOW).some((t) => t.id === future.id));

  db.toggleTask(habit.id, NOW);
  assert.equal(habitDoneOn(habit, NOW), true);
  assert.equal(habitStreak(habit, NOW), 1);
  assert.ok(new Date(habit.dueAt) > NOW);

  db.toggleTask(project.id, NOW);
  assert.equal(project.status, 'done');
});

test('专注：半途结束也计入分钟，完成才计番茄数', () => {
  db.reset();
  const t = db.addTask({ title: '写代码', style: 'normal' });
  const s1 = new Date(NOW);
  s1.setHours(9, 0, 0, 0);
  db.addSession({
    taskId: t.id,
    startedAt: s1.toISOString(),
    endedAt: new Date(s1.getTime() + 25 * 60000).toISOString(),
    plannedSec: 1500,
    seconds: 1500,
    completed: true,
  });
  db.addSession({
    taskId: t.id,
    startedAt: new Date(NOW.getTime() - 10 * 60000).toISOString(),
    endedAt: NOW.toISOString(),
    plannedSec: 1500,
    seconds: 600,
    completed: false,
  });
  const stats = focusStats(NOW);
  assert.equal(stats.todaySec, 2100);
  assert.equal(stats.todayCount, 1);
});

test('备份：导出再导入不丢数据', () => {
  db.reset();
  db.addTx({ type: 'expense', amountCents: 100, merchant: '测试', occurredAt: NOW.toISOString() });
  db.addTask({ title: '测试任务', style: 'normal' });
  const payload = JSON.parse(JSON.stringify(backupPayload()));
  db.reset();
  assert.equal(db.data.tx.length, 0);
  db.replaceAll(payload);
  assert.equal(db.data.tx.length, 1);
  assert.equal(db.data.tasks.length, 1);
  assert.equal(db.data.tx[0].merchant, '测试');
});

test('CSV 用中文分类名，带 BOM', () => {
  db.reset();
  db.addTx({ type: 'expense', amountCents: 1250, merchant: '瑞幸', category: 'food', occurredAt: NOW.toISOString() });
  const csv = txCSV();
  assert.ok(csv.startsWith('\ufeff'));
  assert.match(csv, /餐饮/);
  assert.match(csv, /12\.50/);
});

test('习惯：下次发生时间跳过今天已过时段', () => {
  const next = nextOccurrence({ type: 'weekly', weekdays: [1], time: '09:00' }, NOW);
  assert.equal(dayKey(next), '2026-10-26');
});
