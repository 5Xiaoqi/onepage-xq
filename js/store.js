/* 一页 · 本地数据层（localStorage，全部数据只在这台手机上） */

import { uid, dayKey, startOfMonth, endOfMonth, addDays, startOfWeek, pad2 } from './util.js';
import { nextOccurrence } from './task-parser.js';
import { categoryById } from './money-parser.js';

const KEY = 'onepage.data.v1';
const VERSION = 1;

export const DEFAULT_SETTINGS = {
  budgetCents: 300000,
  focusMin: 25,
  breakMin: 5,
  theme: 'auto',
  reminders: true,
  sound: true,
  onboarded: false,
  lastBackupAt: null,
  nickname: '',
};

function emptyData() {
  return {
    version: VERSION,
    createdAt: new Date().toISOString(),
    tx: [],
    tasks: [],
    sessions: [],
    settings: { ...DEFAULT_SETTINGS },
    meta: { updatedAt: null, demo: false },
  };
}

export const db = {
  data: emptyData(),

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return this.data;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return this.data;
      this.data = {
        ...emptyData(),
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        tx: Array.isArray(parsed.tx) ? parsed.tx : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        meta: { ...emptyData().meta, ...(parsed.meta || {}) },
      };
      return this.data;
    } catch (err) {
      console.warn('读取本地数据失败', err);
      return this.data;
    }
  },

  save() {
    this.data.meta.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
      return true;
    } catch (err) {
      console.warn('保存失败（存储空间不足或隐私模式）', err);
      try {
        window.dispatchEvent(new CustomEvent('op:storage-error', { detail: err }));
      } catch {
        /* 忽略 */
      }
      return false;
    }
  },

  reset() {
    this.data = emptyData();
    this.save();
  },

  replaceAll(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('数据格式不对');
    if (!Array.isArray(payload.tx) || !Array.isArray(payload.tasks)) throw new Error('不是一页的备份文件');
    this.data = {
      ...emptyData(),
      ...payload,
      version: VERSION,
      settings: { ...DEFAULT_SETTINGS, ...(payload.settings || {}) },
      tx: payload.tx,
      tasks: payload.tasks,
      sessions: Array.isArray(payload.sessions) ? payload.sessions : [],
    };
    this.save();
  },

  /* ---------- 记账 ---------- */

  addTx(partial) {
    const tx = {
      id: uid('tx'),
      type: 'expense',
      amountCents: 0,
      category: 'other',
      merchant: '',
      account: '其他',
      accountDetail: '',
      occurredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      note: '',
      source: 'manual',
      rawText: '',
      ...partial,
    };
    this.data.tx.unshift(tx);
    this.save();
    return tx;
  },

  updateTx(id, patch) {
    const tx = this.data.tx.find((x) => x.id === id);
    if (!tx) return null;
    Object.assign(tx, patch);
    this.save();
    return tx;
  },

  deleteTx(id) {
    this.data.tx = this.data.tx.filter((x) => x.id !== id);
    this.save();
  },

  /* ---------- 任务 ---------- */

  addTask(partial) {
    const task = {
      id: uid('task'),
      title: '',
      style: 'normal',
      dueAt: null,
      remindAt: null,
      recurrence: null,
      priority: 'normal',
      subtasks: [],
      notes: '',
      status: 'open',
      createdAt: new Date().toISOString(),
      completedAt: null,
      focusSeconds: 0,
      source: 'manual',
      habit: { log: {} },
      ...partial,
    };
    if (task.style === 'habit' && task.recurrence) {
      task.dueAt = nextOccurrence(task.recurrence, new Date())?.toISOString() || task.dueAt;
    }
    this.data.tasks.unshift(task);
    this.save();
    return task;
  },

  updateTask(id, patch) {
    const task = this.data.tasks.find((x) => x.id === id);
    if (!task) return null;
    Object.assign(task, patch);
    this.save();
    return task;
  },

  deleteTask(id) {
    this.data.tasks = this.data.tasks.filter((x) => x.id !== id);
    this.save();
  },

  toggleSubtask(taskId, subId) {
    const task = this.data.tasks.find((x) => x.id === taskId);
    if (!task) return;
    const sub = task.subtasks.find((s) => s.id === subId);
    if (!sub) return;
    sub.done = !sub.done;
    this.save();
  },

  /** 完成 / 取消完成 */
  toggleTask(id, now = new Date()) {
    const task = this.data.tasks.find((x) => x.id === id);
    if (!task) return null;

    if (task.style === 'habit') {
      const key = dayKey(now);
      task.habit = task.habit || { log: {} };
      task.habit.log[key] = !task.habit.log[key];
      if (!task.habit.log[key]) delete task.habit.log[key];
      task.dueAt = nextOccurrence(task.recurrence, now)?.toISOString() || task.dueAt;
      this.save();
      return task;
    }

    task.status = task.status === 'done' ? 'open' : 'done';
    task.completedAt = task.status === 'done' ? now.toISOString() : null;
    this.save();
    return task;
  },

  /* ---------- 专注 ---------- */

  addSession(partial) {
    const s = {
      id: uid('focus'),
      taskId: null,
      mode: 'focus',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      plannedSec: 1500,
      seconds: 0,
      completed: false,
      ...partial,
    };
    this.data.sessions.unshift(s);
    if (s.taskId && s.mode === 'focus') {
      const t = this.data.tasks.find((x) => x.id === s.taskId);
      if (t) t.focusSeconds = (t.focusSeconds || 0) + s.seconds;
    }
    this.save();
    return s;
  },

  /* ---------- 设置 ---------- */

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
  },
};

/* ---------------- 统计 ---------------- */

export function summaryFor(date = new Date()) {
  const start = startOfMonth(date).getTime();
  const end = endOfMonth(date).getTime();
  let expense = 0;
  let income = 0;
  for (const t of db.data.tx) {
    const ts = new Date(t.occurredAt).getTime();
    if (ts < start || ts > end) continue;
    if (t.type === 'income') income += t.amountCents;
    else expense += t.amountCents;
  }
  return { expense, income, net: income - expense };
}

export function txInMonth(date = new Date()) {
  const start = startOfMonth(date).getTime();
  const end = endOfMonth(date).getTime();
  return db.data.tx
    .filter((t) => {
      const ts = new Date(t.occurredAt).getTime();
      return ts >= start && ts <= end;
    })
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
}

export function categoryBreakdown(date = new Date()) {
  const list = txInMonth(date).filter((t) => t.type === 'expense');
  const map = new Map();
  for (const t of list) {
    const cur = map.get(t.category) || { category: t.category, cents: 0, count: 0 };
    cur.cents += t.amountCents;
    cur.count++;
    map.set(t.category, cur);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents);
}

/** 最近 N 天支出（含今天），旧 → 新 */
export function dailyExpense(days = 7, now = new Date()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(now, -i);
    const key = dayKey(d);
    const cents = db.data.tx
      .filter((t) => t.type === 'expense' && dayKey(new Date(t.occurredAt)) === key)
      .reduce((s, t) => s + t.amountCents, 0);
    out.push({ date: d, key, cents });
  }
  return out;
}

export function focusStats(now = new Date()) {
  const todayKey = dayKey(now);
  const weekStart = startOfWeek(now).getTime();
  let todaySec = 0;
  let todayCount = 0;
  let weekSec = 0;
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(now, -i);
    const key = dayKey(d);
    const sec = db.data.sessions
      .filter((s) => s.mode === 'focus' && dayKey(new Date(s.startedAt)) === key)
      .reduce((sum, s) => sum + s.seconds, 0);
    week.push({ date: d, key, sec });
    if (key === todayKey) todaySec = sec;
  }
  for (const s of db.data.sessions) {
    if (s.mode !== 'focus') continue;
    const ts = new Date(s.startedAt).getTime();
    if (ts >= weekStart) weekSec += s.seconds;
    if (dayKey(new Date(s.startedAt)) === todayKey && s.completed) todayCount++;
  }
  return { todaySec, todayCount, weekSec, week };
}

export function openTasks() {
  return db.data.tasks.filter((t) => t.status !== 'done');
}

export function isHabitDueToday(task, now = new Date()) {
  if (!task.recurrence) return true;
  const rec = task.recurrence;
  if (rec.type === 'daily') return true;
  if (rec.times) {
    const start = startOfWeek(now).getTime();
    const today = dayKey(now);
    if (task.habit?.log?.[today]) return false;
    let count = 0;
    for (const k of Object.keys(task.habit?.log || {})) {
      const d = new Date(k + 'T12:00:00');
      if (!isNaN(d.getTime()) && d.getTime() >= start) count++;
    }
    return count < rec.times;
  }
  const wd = now.getDay() === 0 ? 7 : now.getDay();
  if (rec.type === 'weekly') return (rec.weekdays || []).includes(wd);
  if (rec.type === 'monthly') return now.getDate() === rec.day;
  return true;
}

/** 今天该做的事：习惯 + 今天到期 + 逾期 */
export function todayTasks(now = new Date()) {
  const today = dayKey(now);
  return openTasks()
    .filter((t) => {
      if (t.style === 'habit') return isHabitDueToday(t, now);
      if (!t.dueAt) return t.style !== 'waiting';
      return dayKey(new Date(t.dueAt)) <= today;
    })
    .sort((a, b) => {
      const aOver = a.dueAt ? new Date(a.dueAt) < now : false;
      const bOver = b.dueAt ? new Date(b.dueAt) < now : false;
      if (aOver !== bOver) return aOver ? -1 : 1;
      if (a.priority !== b.priority) {
        const rank = { high: 0, normal: 1, low: 2 };
        return rank[a.priority] - rank[b.priority];
      }
      if (a.dueAt && b.dueAt) return new Date(a.dueAt) - new Date(b.dueAt);
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

export function upcomingTasks(now = new Date()) {
  const today = dayKey(now);
  return openTasks()
    .filter((t) => t.style !== 'habit' && t.style !== 'waiting' && t.dueAt && dayKey(new Date(t.dueAt)) > today)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
}

export function waitingTasks() {
  return openTasks()
    .filter((t) => t.style === 'waiting')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export function completedTasks(limit = 20) {
  return db.data.tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
    .slice(0, limit);
}

export function habitTasks() {
  return openTasks().filter((t) => t.style === 'habit');
}

export function taskProgress(task) {
  if (!task.subtasks || !task.subtasks.length) return null;
  const done = task.subtasks.filter((s) => s.done).length;
  return { done, total: task.subtasks.length, pct: Math.round((done / task.subtasks.length) * 100) };
}

export function lastBackupDays(now = new Date()) {
  const at = db.data.settings.lastBackupAt;
  if (!at) return null;
  return Math.floor((now - new Date(at)) / 86400000);
}

/* ---------------- 备份 ---------------- */

export function backupPayload() {
  return {
    app: 'onepage',
    version: VERSION,
    exportedAt: new Date().toISOString(),
    settings: db.data.settings,
    tx: db.data.tx,
    tasks: db.data.tasks,
    sessions: db.data.sessions,
  };
}

export function txCSV() {
  const header = ['日期', '类型', '金额', '分类', '商户', '账户', '备注'];
  const rows = [...db.data.tx]
    .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))
    .map((t) => {
      const d = new Date(t.occurredAt);
      return [
        `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
        t.type === 'income' ? '收入' : '支出',
        (t.amountCents / 100).toFixed(2),
        categoryById(t.category).name,
        t.merchant,
        t.account,
        t.note,
      ];
    });
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '\ufeff' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

/* ---------------- 示例数据 ---------------- */

export function seedDemo(now = new Date()) {
  const at = (daysAgo, h, m) => {
    const d = addDays(now, -daysAgo);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const mk = (partial) => db.addTx({ source: 'demo', ...partial });

  mk({ amountCents: 3200, merchant: '星巴克', category: 'food', account: '微信', occurredAt: at(0, 9, 12) });
  mk({ amountCents: 12860, merchant: '盒马鲜生', category: 'daily', account: '支付宝', occurredAt: at(1, 18, 40) });
  mk({ amountCents: 2450, merchant: '滴滴出行', category: 'transport', account: '微信', occurredAt: at(1, 8, 22) });
  mk({ amountCents: 26800, merchant: '海底捞', category: 'food', account: '支付宝', occurredAt: at(2, 19, 35) });
  mk({ amountCents: 12900, merchant: '京东', category: 'shopping', account: '银行卡', occurredAt: at(3, 21, 5) });
  mk({ amountCents: 280000, merchant: '房租', category: 'home', account: '银行卡', occurredAt: at(5, 10, 0) });
  mk({ amountCents: 3800, merchant: '中国移动', category: 'telecom', account: '支付宝', occurredAt: at(4, 11, 20) });
  mk({ amountCents: 1200000, merchant: '工资', category: 'salary', account: '银行卡', type: 'income', occurredAt: at(8, 9, 0) });
  mk({ amountCents: 2500, merchant: '美团外卖', category: 'refund', account: '微信', type: 'income', occurredAt: at(2, 12, 10) });

  const tomorrow = addDays(now, 1);
  tomorrow.setHours(15, 0, 0, 0);
  const friday = addDays(now, ((5 - (now.getDay() || 7) + 7) % 7) || 7);
  friday.setHours(20, 0, 0, 0);

  db.addTask({
    title: '把季度报告初稿写完',
    style: 'project',
    dueAt: tomorrow.toISOString(),
    priority: 'high',
    estimateMinutes: 180,
    subtasks: [
      { id: uid('sub'), title: '明确主题、读者和验收标准', minutes: 15, done: true },
      { id: uid('sub'), title: '收集资料与数据', minutes: 40, done: true },
      { id: uid('sub'), title: '搭出结构大纲', minutes: 20, done: false },
      { id: uid('sub'), title: '写完初稿', minutes: 60, done: false },
      { id: uid('sub'), title: '修改润色并检查细节', minutes: 30, done: false },
      { id: uid('sub'), title: '提交或汇报', minutes: 15, done: false },
    ],
  });
  const projectTask = db.data.tasks[0];

  db.addTask({
    title: '交房租',
    style: 'deadline',
    dueAt: friday.toISOString(),
    priority: 'normal',
    subtasks: [],
  });

  db.addTask({
    title: '跑步 30 分钟',
    style: 'habit',
    recurrence: { type: 'weekly', weekdays: [1, 3, 5], time: '07:30' },
    dueAt: nextOccurrence({ type: 'weekly', weekdays: [1, 3, 5], time: '07:30' }, now)?.toISOString(),
    habit: { log: {} },
  });

  db.addTask({
    title: '等王工回复报价',
    style: 'waiting',
    createdAt: addDays(now, -3).toISOString(),
    notes: '已经发了第二版报价单，等他确认。',
    subtasks: [
      { id: uid('sub'), title: '礼貌发出跟进消息', minutes: 5, done: true },
      { id: uid('sub'), title: '把问题说清楚（要什么、何时要）', minutes: 5, done: false },
      { id: uid('sub'), title: '收到后确认并处理', minutes: 10, done: false },
    ],
  });

  const clinic = new Date(friday);
  clinic.setHours(15, 0, 0, 0);
  db.addTask({
    title: '牙科复诊',
    style: 'appointment',
    dueAt: clinic.toISOString(),
    priority: 'normal',
    subtasks: [
      { id: uid('sub'), title: '确认时间、地点和联系人', minutes: 5, done: true },
      { id: uid('sub'), title: '准备要带的材料', minutes: 15, done: false },
      { id: uid('sub'), title: '设好出发提醒', minutes: 5, done: false },
    ],
  });

  db.addTask({ title: '买牛奶', style: 'quick', priority: 'low', subtasks: [] });

  const s1 = new Date(now);
  s1.setHours(9, 0, 0, 0);
  db.addSession({
    taskId: projectTask.id,
    startedAt: s1.toISOString(),
    endedAt: new Date(s1.getTime() + 25 * 60000).toISOString(),
    plannedSec: 1500,
    seconds: 1500,
    completed: true,
  });
  const s2 = addDays(now, -1);
  s2.setHours(21, 0, 0, 0);
  db.addSession({
    startedAt: s2.toISOString(),
    endedAt: new Date(s2.getTime() + 25 * 60000).toISOString(),
    plannedSec: 1500,
    seconds: 1500,
    completed: true,
  });

  db.data.meta.demo = true;
  db.save();
}
