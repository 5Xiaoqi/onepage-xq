import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReview } from '../js/review.js';

const NOW = new Date(2026, 9, 19, 10, 0, 0); // 2026-10-19 周一 10:00

const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min, 0).toISOString();

const TX = [
  // 本周：便利店三笔小额，星巴克，京东购物，重复付款
  { id: 't1', type: 'expense', amountCents: 1200, merchant: '便利蜂', category: 'daily', occurredAt: at(2026, 10, 19, 8, 0) },
  { id: 't2', type: 'expense', amountCents: 1200, merchant: '便利蜂', category: 'daily', occurredAt: at(2026, 10, 19, 8, 10) },
  { id: 't3', type: 'expense', amountCents: 1200, merchant: '便利蜂', category: 'daily', occurredAt: at(2026, 10, 19, 8, 20) },
  { id: 't4', type: 'expense', amountCents: 1800, merchant: '星巴克', category: 'food', occurredAt: at(2026, 10, 19, 9, 0) },
  { id: 't5', type: 'expense', amountCents: 12000, merchant: '京东', category: 'shopping', occurredAt: at(2026, 10, 19, 9, 30) },
  { id: 't6', type: 'expense', amountCents: 5000, merchant: '某某商户', category: 'other', occurredAt: at(2026, 10, 19, 9, 40) },
  { id: 't7', type: 'expense', amountCents: 5000, merchant: '某某商户', category: 'other', occurredAt: at(2026, 10, 19, 9, 42) },
  // 本周订阅
  { id: 't8', type: 'expense', amountCents: 1500, merchant: '网易云音乐', category: 'fun', occurredAt: at(2026, 10, 19, 7, 0) },
  // 上周
  { id: 't9', type: 'expense', amountCents: 10000, merchant: '海底捞', category: 'food', occurredAt: at(2026, 10, 15, 19, 0) },
  // 过去两个月，构成订阅
  { id: 't10', type: 'expense', amountCents: 1500, merchant: '网易云音乐', category: 'fun', occurredAt: at(2026, 9, 5, 7, 0) },
  { id: 't11', type: 'expense', amountCents: 1500, merchant: '网易云音乐', category: 'fun', occurredAt: at(2026, 8, 5, 7, 0) },
];

test('复盘：本周 vs 上周、分类、小额高频', () => {
  const r = buildReview(TX, { budgetCents: 20000 }, NOW);
  assert.equal(r.weekKey, '2026-10-19');
  assert.equal(r.week.expense, 28900);
  assert.equal(r.week.prevExpense, 10000);
  assert.equal(r.week.deltaPct, 189);
  assert.equal(r.week.count, 8);
  assert.equal(r.categories[0].id, 'shopping');
  assert.equal(r.categories[0].cents, 12000);
  assert.equal(r.small.count, 3);
  assert.equal(r.small.cents, 3600);
  assert.equal(r.small.items[0].label, '便利蜂');
});

test('复盘：疑似订阅与重复付款', () => {
  const r = buildReview(TX, { budgetCents: 20000 }, NOW);
  assert.equal(r.subscriptions.length, 1);
  assert.equal(r.subscriptions[0].merchant, '网易云音乐');
  assert.ok(r.anomalies.some((a) => a.type === 'duplicate'));
  assert.ok(r.anomalies.some((a) => a.type === 'budget'));
});

test('复盘：候选支出与头条', () => {
  const r = buildReview(TX, { budgetCents: 20000 }, NOW);
  assert.ok(r.candidates.length >= 3);
  assert.ok(r.candidates.some((c) => c.reason.includes('小额高频')));
  assert.ok(r.candidates.some((c) => c.reason === '娱乐/购物'));
  assert.match(r.headline, /本周花了/);
  assert.match(r.headline, /比上周多/);
  assert.match(r.headline, /小额高频/);
});

test('复盘：没有数据也能给出可读结论', () => {
  const r = buildReview([], {}, NOW);
  assert.equal(r.week.expense, 0);
  assert.match(r.headline, /还没有支出/);
  assert.equal(r.candidates.length, 0);
});
