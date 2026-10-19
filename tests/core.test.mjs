import test from 'node:test';
import assert from 'node:assert/strict';

import { parseReceipt, findDuplicate } from '../js/money-parser.js';
import { parseTask, nextOccurrence, habitStreak, recurrenceLabel } from '../js/task-parser.js';
import { dayKey, addDays } from '../js/util.js';

const NOW = new Date(2026, 9, 19, 10, 0, 0); // 2026-10-19 10:00 本地时间

/* ---------------- 记账 ---------------- */

test('微信支付：金额/商户/时间/账户', () => {
  const r = parseReceipt(
    `微信支付
支付成功
¥86.50
收款方 星巴克咖啡
支付时间 2026年10月19日 14:32
支付方式 零钱`,
    NOW
  );
  assert.equal(r.ok, true);
  assert.equal(r.type, 'expense');
  assert.equal(r.amountCents, 8650);
  assert.equal(r.merchant, '星巴克咖啡');
  assert.equal(r.category, 'food');
  assert.equal(r.account, '微信');
  assert.equal(new Date(r.occurredAt).getHours(), 14);
  assert.equal(new Date(r.occurredAt).getMinutes(), 32);
});

test('支付宝：实付金额优先于其他金额', () => {
  const r = parseReceipt(
    `账单详情
商品金额 ¥30.00
优惠 -¥4.20
实付 ¥25.80
商户名称：瑞幸咖啡
创建时间 2026-10-19 09:12
付款方式 花呗`,
    NOW
  );
  assert.equal(r.amountCents, 2580);
  assert.equal(r.merchant, '瑞幸咖啡');
  assert.equal(r.category, 'food');
  assert.equal(r.account, '支付宝');
  assert.equal(r.accountDetail, '花呗');
});

test('ISO 空格时间：2026-10-18 20:11 不能退化成中午', () => {
  const r = parseReceipt('付款时间 2026-10-18 20:11\n实付 ¥399.00', NOW);
  assert.equal(new Date(r.occurredAt).getHours(), 20);
  assert.equal(new Date(r.occurredAt).getMinutes(), 11);
});

test('便利店品牌归类到日用', () => {
  const r = parseReceipt('微信支付\n支付成功\n￥12.50\n商户全称：便利蜂', NOW);
  assert.equal(r.merchant, '便利蜂');
  assert.equal(r.category, 'daily');
});

test('淘宝订单：店铺名 + 购物分类', () => {
  const r = parseReceipt(
    `订单详情
Apple iPhone 16
实付款 ¥5999.00
店铺名称：Apple官方旗舰店
下单时间 2026-10-18 21:05
支付方式 支付宝`,
    NOW
  );
  assert.equal(r.amountCents, 599900);
  assert.equal(r.merchant, 'Apple官方旗舰店');
  assert.equal(r.category, 'shopping');
  assert.equal(r.type, 'expense');
});

test('银行短信：尾号/银行/人民币金额', () => {
  const r = parseReceipt(
    '【招商银行】您尾号1234的账户10月19日12:34消费人民币86.50元，余额1,234.56元。',
    NOW
  );
  assert.equal(r.amountCents, 8650);
  assert.equal(r.account, '银行卡');
  assert.match(r.accountDetail, /招商银行/);
  assert.match(r.accountDetail, /1234/);
});

test('超市小票：合计金额 + 商户行', () => {
  const r = parseReceipt(
    `永辉超市
2026-10-18 19:23
矿泉水 2.00
全麦面包 8.50
合计 10.50
微信支付`,
    NOW
  );
  assert.equal(r.amountCents, 1050);
  assert.equal(r.merchant, '永辉超市');
  assert.equal(r.category, 'daily');
  assert.equal(r.account, '微信');
});

test('退款识别为收入', () => {
  const r = parseReceipt(
    `退款成功
¥25.00
退款至 零钱
原支付商户 美团外卖
2026-10-18 12:00`,
    NOW
  );
  assert.equal(r.type, 'income');
  assert.equal(r.amountCents, 2500);
  assert.equal(r.category, 'refund');
});

test('工资到账识别为收入并归类', () => {
  const r = parseReceipt(
    `工资到账
¥12,000.00
招商银行 尾号1234
2026-10-10 09:00`,
    NOW
  );
  assert.equal(r.type, 'income');
  assert.equal(r.category, 'salary');
  assert.equal(r.amountCents, 1200000);
});

test('账单汇总给出警告', () => {
  const r = parseReceipt('本月支出 ¥3,482.50\n较上月 +12%', NOW);
  assert.equal(r.isSummary, true);
  assert.ok(r.warnings.some((w) => w.includes('汇总')));
});

test('没有金额时 ok=false 并提示', () => {
  const r = parseReceipt('支付成功\n谢谢惠顾', NOW);
  assert.equal(r.ok, false);
  assert.ok(r.warnings.some((w) => w.includes('金额')));
});

test('重复检测：同金额同商户三天内', () => {
  const cand = parseReceipt('支付成功 ¥25.80 瑞幸咖啡 2026-10-19 09:12', NOW);
  const dup = findDuplicate(cand, [
    { amountCents: 2580, merchant: '瑞幸咖啡', occurredAt: new Date(2026, 9, 18, 9, 0).toISOString() },
  ]);
  assert.ok(dup);
});

/* ---------------- 任务 ---------------- */

test('项目型：明天下午3点前 + 报告 → 拆解', () => {
  const t = parseTask('明天下午3点前把季度报告初稿写完', NOW);
  assert.equal(t.style, 'project');
  assert.equal(t.title, '把季度报告初稿写完');
  assert.equal(new Date(t.dueAt).getDate(), 20);
  assert.equal(new Date(t.dueAt).getHours(), 15);
  assert.equal(t.subtasks.length, 6);
  assert.ok(t.estimateMinutes > 60);
});

test('截止型：周五前交房租（短任务不硬拆）', () => {
  const t = parseTask('周五前交房租', NOW);
  assert.equal(t.style, 'deadline');
  assert.equal(t.title, '交房租');
  assert.equal(t.subtasks.length, 0);
  assert.equal(new Date(t.dueAt).getDay(), 5);
  assert.equal(t.priority, 'normal');
});

test('习惯型：每周一三五跑步', () => {
  const t = parseTask('每周一三五跑步30分钟', NOW);
  assert.equal(t.style, 'habit');
  assert.deepEqual(t.recurrence.weekdays, [1, 3, 5]);
  assert.equal(t.recurrence.type, 'weekly');
  assert.equal(t.title, '跑步30分钟');
  assert.equal(recurrenceLabel(t.recurrence), '每周一、三、五 09:00');
});

test('习惯型：每月15号还信用卡', () => {
  const t = parseTask('每月15号还信用卡', NOW);
  assert.equal(t.style, 'habit');
  assert.equal(t.recurrence.type, 'monthly');
  assert.equal(t.recurrence.day, 15);
  assert.equal(new Date(t.dueAt).getMonth(), 10); // 11 月
});

test('等待型：等王工回复报价', () => {
  const t = parseTask('等王工回复报价', NOW);
  assert.equal(t.style, 'waiting');
  assert.equal(t.subtasks.length, 3);
  assert.equal(t.dueAt, null);
});

test('琐事型：买牛奶', () => {
  const t = parseTask('买牛奶', NOW);
  assert.equal(t.style, 'quick');
  assert.equal(t.subtasks.length, 0);
});

test('项目型：准备下周一的面试', () => {
  const t = parseTask('准备下周一的面试', NOW);
  assert.equal(t.style, 'project');
  assert.equal(t.title, '准备面试');
  assert.equal(new Date(t.dueAt).getDay(), 1);
  assert.ok(t.subtasks.length >= 6);
});

test('约会型：明天早上8点去医院', () => {
  const t = parseTask('明天早上8点去医院', NOW);
  assert.equal(t.style, 'appointment');
  assert.equal(new Date(t.dueAt).getHours(), 8);
  assert.ok(t.remindAt);
});

test('时间型：今晚8点给妈妈打电话', () => {
  const t = parseTask('今晚8点给妈妈打电话', NOW);
  assert.equal(new Date(t.dueAt).getHours(), 20);
  assert.equal(new Date(t.dueAt).getDate(), 19);
});

test('相对时间：三天后给王工发方案', () => {
  const t = parseTask('三天后给王工发方案', NOW);
  assert.equal(new Date(t.dueAt).getDate(), 22);
  assert.equal(new Date(t.dueAt).getHours(), 10);
});

test('习惯连续天数', () => {
  const task = { habit: { log: {} } };
  for (let i = 0; i < 4; i++) task.habit.log[dayKey(addDays(NOW, -i))] = true;
  assert.equal(habitStreak(task, NOW), 4);
});

test('下次发生时间：每天 09:00', () => {
  const next = nextOccurrence({ type: 'daily', interval: 1, time: '09:00' }, NOW);
  assert.equal(dayKey(next), '2026-10-20');
  assert.equal(next.getHours(), 9);
});
