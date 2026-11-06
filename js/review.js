/* 一页 · 复盘引擎
 *
 * 目标不是再画一张报表，而是回答三个问题：
 *   1. 哪笔没必要？  2. 哪类超了？  3. 下月改什么？
 *
 * 只读流水，不写数据；返回可解释、可勾选的证据。
 */

import { addDays, dayKey, startOfMonth, startOfWeek, money } from './util.js';
import { categoryById } from './money-parser.js';

const SMALL_LIMIT = 3000; // ¥30 以下算小额
const SMALL_WINDOW = 30; // 最近 30 天
const MS_DAY = 86400000;

const isExpense = (t) => t && t.type !== 'income';
const timeOf = (t) => new Date(t.occurredAt).getTime();
const valid = (t) => t && isFinite(timeOf(t));
const inRange = (t, a, b) => {
  const x = timeOf(t);
  return x >= a && x < b;
};
const sum = (list) => list.reduce((s, t) => s + (Number(t.amountCents) || 0), 0);
const median = (nums) => {
  const a = [...nums].sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};
const catName = (id) => categoryById(id).name;
const catEmoji = (id) => categoryById(id).emoji;

function categoryStats(prevExpenses, weekExpenses) {
  const map = new Map();
  for (const [list, field] of [
    [prevExpenses, 'prevCents'],
    [weekExpenses, 'cents'],
  ]) {
    for (const t of list) {
      const id = t.category || 'other';
      if (!map.has(id)) map.set(id, { id, cents: 0, prevCents: 0, count: 0 });
      const row = map.get(id);
      row[field] += Number(t.amountCents) || 0;
      if (field === 'cents') row.count++;
    }
  }
  return [...map.values()]
    .map((row) => {
      const cat = categoryById(row.id);
      return {
        ...row,
        name: cat.name,
        emoji: cat.emoji,
        color: cat.color,
        deltaCents: row.cents - row.prevCents,
        deltaPct: row.prevCents ? Math.round(((row.cents - row.prevCents) / row.prevCents) * 100) : null,
      };
    })
    .filter((row) => row.cents || row.prevCents)
    .sort((a, b) => b.cents - a.cents);
}

function smallFrequent(tx, now) {
  const cutoff = addDays(now, -SMALL_WINDOW).getTime();
  const groups = new Map();
  for (const t of tx) {
    if (!isExpense(t) || !inRange(t, cutoff, now.getTime() + 1)) continue;
    if ((Number(t.amountCents) || 0) > SMALL_LIMIT) continue;
    const key = (t.merchant || '').trim() || catName(t.category);
    if (!groups.has(key)) {
      groups.set(key, { key, label: key, count: 0, total: 0, latest: t, category: t.category, ids: [] });
    }
    const g = groups.get(key);
    g.count++;
    g.total += Number(t.amountCents) || 0;
    g.ids.push(t.id);
    if (timeOf(t) > timeOf(g.latest)) g.latest = t;
  }
  const items = [...groups.values()].filter((g) => g.count >= 3).sort((a, b) => b.total - a.total);
  return {
    items,
    cents: items.reduce((s, g) => s + g.total, 0),
    count: items.reduce((s, g) => s + g.count, 0),
  };
}

function subscriptions(tx, now) {
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime();
  const byMerchant = new Map();
  for (const t of tx) {
    if (!isExpense(t) || !t.merchant) continue;
    if (timeOf(t) < from) continue;
    const merchant = t.merchant.trim();
    const m = dayKey(t.occurredAt).slice(0, 7);
    if (!byMerchant.has(merchant)) byMerchant.set(merchant, new Map());
    const months = byMerchant.get(merchant);
    if (!months.has(m)) months.set(m, []);
    months.get(m).push(t);
  }

  const out = [];
  for (const [merchant, months] of byMerchant) {
    if (months.size < 3) continue;
    const lists = [...months.values()];
    if (!lists.every((l) => l.length === 1)) continue;
    const amounts = lists.flat().map((t) => Number(t.amountCents) || 0);
    const med = median(amounts);
    if (!med) continue;
    if (amounts.every((a) => Math.abs(a - med) / med <= 0.15)) {
      out.push({
        merchant,
        months: months.size,
        avgCents: Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length),
        category: lists[0][0].category,
      });
    }
  }
  return out.sort((a, b) => b.avgCents - a.avgCents).slice(0, 3);
}

function findAnomalies(tx, now, settings) {
  const out = [];

  // 同金额 + 同商户，3 天内出现两次；小额高频不算重复付款
  const groups = new Map();
  for (const t of tx) {
    if (!isExpense(t) || !t.merchant) continue;
    if ((Number(t.amountCents) || 0) <= SMALL_LIMIT) continue;
    const key = `${t.amountCents}|${t.merchant}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => timeOf(a) - timeOf(b));
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = timeOf(sorted[i + 1]) - timeOf(sorted[i]);
      if (gap > 3 * MS_DAY) continue;
      out.push({
        type: 'duplicate',
        title: '可能重复付款',
        detail: `${sorted[i].merchant} ${money(sorted[i].amountCents)}，两笔相隔 ${Math.max(1, Math.round(gap / MS_DAY))} 天`,
        txIds: [sorted[i].id, sorted[i + 1].id],
        cents: Number(sorted[i + 1].amountCents) || 0,
      });
      break;
    }
  }

  // 大额：超过近 90 天均值的 3 倍
  const last90 = tx.filter((t) => isExpense(t) && timeOf(t) >= addDays(now, -90).getTime());
  if (last90.length >= 3) {
    const avg = sum(last90) / last90.length;
    for (const t of tx) {
      if (!isExpense(t) || timeOf(t) < addDays(now, -30).getTime()) continue;
      if (t.amountCents > 20000 && t.amountCents > avg * 3) {
        out.push({
          type: 'large',
          title: '单笔明显偏大',
          detail: `${t.merchant || catName(t.category)} ${money(t.amountCents)}，是近期均值的 ${Math.round(t.amountCents / avg)} 倍`,
          txIds: [t.id],
          cents: t.amountCents,
        });
      }
    }
  }

  // 预算进度
  const budget = Number(settings.budgetCents) || 0;
  if (budget > 0 && now.getDate() >= 5) {
    const monthStart = startOfMonth(now).getTime();
    const spent = tx.filter((t) => isExpense(t) && inRange(t, monthStart, now.getTime() + 1)).reduce((s, t) => s + t.amountCents, 0);
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projected = (spent / now.getDate()) * days;
    if (projected > budget * 1.05) {
      out.push({
        type: 'budget',
        title: '按当前速度会超预算',
        detail: `预计 ${money(Math.round(projected), { decimals: 0 })}，预算 ${money(budget, { decimals: 0 })}`,
        cents: Math.round(projected - budget),
      });
    }
  }

  return out.slice(0, 5);
}

function pickCandidates(weekExpenses, small, anomalies, now) {
  const out = [];
  const seen = new Set();
  const push = (t, reason) => {
    if (!t || seen.has(t.id)) return;
    seen.add(t.id);
    out.push({
      id: t.id,
      title: t.merchant || catName(t.category),
      category: t.category,
      emoji: catEmoji(t.category),
      amountCents: t.amountCents,
      occurredAt: t.occurredAt,
      reason,
    });
  };

  for (const a of anomalies) {
    if (a.type !== 'duplicate' || !a.txIds?.length) continue;
    const t = weekExpenses.find((x) => x.id === a.txIds[a.txIds.length - 1]);
    if (t) push(t, '疑似重复');
  }

  const last7 = weekExpenses.filter((t) => timeOf(t) >= addDays(now, -7).getTime());
  for (const t of last7) {
    const h = new Date(t.occurredAt).getHours();
    if ((h >= 22 || h < 3) && t.amountCents >= 2000) push(t, '深夜消费');
  }
  for (const t of last7) {
    if (['fun', 'shopping'].includes(t.category) && t.amountCents >= 5000) push(t, '娱乐/购物');
  }
  for (const g of small.items.slice(0, 3)) {
    push(g.latest, `小额高频 · ${g.count} 笔`);
  }

  return out.slice(0, 6);
}

/**
 * @param {Array} transactions 账目数组
 * @param {Object} settings 设置（用 budgetCents）
 * @param {Date} now
 */
export function buildReview(transactions, settings = {}, now = new Date()) {
  const tx = (transactions || []).filter(valid);
  const weekStart = startOfWeek(now);
  const weekStartMs = weekStart.getTime();
  const nowMs = now.getTime();
  const prevStartMs = addDays(weekStart, -7).getTime();

  const thisWeek = tx.filter((t) => inRange(t, weekStartMs, nowMs + 1));
  const lastWeek = tx.filter((t) => inRange(t, prevStartMs, weekStartMs));
  const weekExpenses = thisWeek.filter(isExpense);
  const prevExpenses = lastWeek.filter(isExpense);
  const weekExpense = sum(weekExpenses);
  const prevExpense = sum(prevExpenses);
  const weekIncome = sum(thisWeek.filter((t) => !isExpense(t)));
  const deltaPct = prevExpense ? Math.round(((weekExpense - prevExpense) / prevExpense) * 100) : null;

  const categories = categoryStats(prevExpenses, weekExpenses);
  const small = smallFrequent(tx, now);
  const subs = subscriptions(tx, now);
  const anomalies = findAnomalies(tx, now, settings);
  const candidates = pickCandidates(weekExpenses, small, anomalies, now);

  const monthStart = startOfMonth(now).getTime();
  const monthExpense = tx.filter((t) => isExpense(t) && inRange(t, monthStart, nowMs + 1)).reduce((s, t) => s + t.amountCents, 0);
  const monthIncome = tx.filter((t) => !isExpense(t) && inRange(t, monthStart, nowMs + 1)).reduce((s, t) => s + t.amountCents, 0);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projected = now.getDate() ? Math.round((monthExpense / now.getDate()) * daysInMonth) : 0;

  let headline;
  if (!weekExpense) {
    headline = '本周还没有支出，先记两笔再看。';
  } else {
    let dir = '';
    if (deltaPct !== null) {
      if (deltaPct > 0) dir = `，比上周多 ${deltaPct}%`;
      else if (deltaPct < 0) dir = `，比上周少 ${Math.abs(deltaPct)}%`;
      else dir = '，和上周持平';
    }
    headline = `本周花了 ${money(weekExpense, { decimals: 0 })}${dir}`;
    if (small.items.length) headline += `；小额高频 ${money(small.cents, { decimals: 0 })}（${small.count} 笔）`;
    headline += '。';
  }

  const topCategory = categories[0];
  if (topCategory && weekExpense) {
    headline += ` 最大头是${topCategory.name}。`;
  }

  const weekEnd = addDays(weekStart, 6);
  return {
    now,
    weekKey: dayKey(weekStart),
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    week: {
      expense: weekExpense,
      prevExpense,
      income: weekIncome,
      count: weekExpenses.length,
      deltaPct,
    },
    month: {
      expense: monthExpense,
      income: monthIncome,
      net: monthIncome - monthExpense,
      budget: Number(settings.budgetCents) || 0,
      projected,
      daysElapsed: now.getDate(),
      daysInMonth,
    },
    categories,
    small,
    subscriptions: subs,
    anomalies,
    candidates,
    headline,
    topCategory: topCategory ? { ...topCategory } : null,
    questions: [
      { id: 'q1', title: '哪笔没必要？', hint: '从下面的证据里挑，或者自己写一笔。' },
      { id: 'q2', title: '哪类超了？', hint: '看环比涨得最多的分类，只抓一个。' },
      { id: 'q3', title: '下月改什么？', hint: '只写一条，能执行、能验收。' },
    ],
  };
}

export function reviewToText(review) {
  if (!review) return '';
  const lines = [
    `本周支出 ${money(review.week.expense)}，上周 ${money(review.week.prevExpense)}。`,
    review.small.items.length ? `小额高频：${review.small.items.map((g) => `${g.label} ${money(g.total)}×${g.count}`).join('；')}` : '',
    review.subscriptions.length ? `疑似订阅：${review.subscriptions.map((s) => `${s.merchant} ${money(s.avgCents)}/月`).join('；')}` : '',
    review.anomalies.length ? `异常：${review.anomalies.map((a) => a.title).join('；')}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}
