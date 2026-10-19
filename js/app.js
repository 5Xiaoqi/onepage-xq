/* 一页 · 应用入口 */

import { db, seedDemo, todayTasks } from './store.js';
import { icon, dayKey } from './util.js';
import { bus, openSheet, closeSheet, toast, decodeBase64Url, isSheetOpen } from './ui.js';
import { renderLedger, openImportSheet } from './view-ledger.js';
import { renderTasks } from './view-tasks.js';
import { renderFocus, initFocusTimer } from './view-focus.js';
import { renderMe } from './view-me.js';

const TABS = [
  { id: 'ledger', label: '记账', icon: 'wallet' },
  { id: 'tasks', label: '任务', icon: 'list' },
  { id: 'focus', label: '专注', icon: 'timer' },
  { id: 'me', label: '我的', icon: 'chart' },
];

const VIEWS = { ledger: renderLedger, tasks: renderTasks, focus: renderFocus, me: renderMe };

let current = 'ledger';
let lastReminderCheck = 0;

/* ---------------- 启动 ---------------- */

function boot() {
  db.load();
  applyTheme(db.data.settings.theme);

  bus.refresh = () => render();
  bus.go = (tab) => {
    if (!VIEWS[tab]) return;
    if (location.hash !== '#' + tab) location.hash = tab;
    else render({ resetScroll: true });
  };
  bus.openImport = (opts) => openImportSheet(opts);
  bus.applyTheme = applyTheme;

  window.addEventListener('hashchange', onHash);
  render({ resetScroll: true });
  initFocusTimer();
  registerServiceWorker();
  startReminderLoop();
  window.__OP_READY__ = true;

  if (!db.data.settings.onboarded && !db.data.tx.length && !db.data.tasks.length) {
    setTimeout(() => {
      if (!isSheetOpen()) showWelcome();
    }, 420);
  }

  setTimeout(handleDeepLink, 60);
  requestPersist();
  bindKeyboardScroll();

  window.addEventListener('op:storage-error', () => {
    toast('没能保存：存储空间不足，或浏览器在限制存储。请先导出备份。', { duration: 5200 });
  });
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else root.removeAttribute('data-theme');
  const dark = theme === 'dark' || (theme !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.removeAttribute('media');
    m.setAttribute('content', dark ? '#0D0F0E' : '#F4F1EA');
  });
}

async function requestPersist() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* 忽略 */
  }
}

/** iOS 键盘弹出时把输入框滚到可见位置 */
function bindKeyboardScroll() {
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t || !t.matches?.('input, textarea, select')) return;
    setTimeout(() => {
      try {
        t.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {
        /* 忽略 */
      }
    }, 280);
  });
}

/* ---------------- 路由 ---------------- */

function tabFromHash() {
  const h = location.hash.replace('#', '');
  return VIEWS[h] ? h : null;
}

function render({ resetScroll = false } = {}) {
  const tab = tabFromHash() || current;
  current = tab;
  const root = document.getElementById('view');
  root.innerHTML = '';
  root.className = 'view';
  VIEWS[tab](root);
  renderTabbar();
  if (resetScroll) window.scrollTo(0, 0);
}

function renderTabbar() {
  const bar = document.getElementById('tabbar');
  const todayCount = todayTasks(new Date()).length;
  bar.innerHTML = TABS.map(
    (t) => `<button class="tab ${current === t.id ? 'active' : ''}" data-tab="${t.id}" aria-label="${t.label}">
      <span style="position:relative;display:grid;place-items:center">
        ${icon(t.icon, 21)}
        ${t.id === 'tasks' && todayCount ? `<i style="position:absolute;top:-2px;right:-7px;width:6px;height:6px;border-radius:50%;background:var(--clay);box-shadow:0 0 0 2px var(--bg)"></i>` : ''}
      </span>
      <span>${t.label}</span>
    </button>`
  ).join('');
  bar.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.tab === current) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      bus.go(b.dataset.tab);
    })
  );
}

function onHash() {
  if (handleDeepLink()) return;
  render({ resetScroll: true });
}

/** 支持 #import=<base64> 和 #text=<urlencoded>，给快捷指令用 */
function handleDeepLink() {
  const h = location.hash || '';
  if (!h.startsWith('#import') && !h.startsWith('#text=')) return false;

  let text = '';
  try {
    if (h.startsWith('#import=')) text = decodeBase64Url(h.slice(8));
    else text = decodeURIComponent(h.slice(6));
  } catch {
    text = '';
  }

  history.replaceState(null, '', location.pathname + location.search + '#ledger');
  render();
  if (h === '#import') {
    setTimeout(() => openImportSheet(), 120);
  } else if (text.trim()) {
    setTimeout(() => openImportSheet({ text }), 120);
  }
  return true;
}

/* ---------------- 首次引导 ---------------- */

function showWelcome() {
  openSheet({
    title: '欢迎来到一页',
    subtitle: '记账、任务、专注，都在一个地方',
    body: `
      <div style="display:grid;gap:10px;margin:2px 0 6px">
        ${[
          ['camera', '截图记账', '微信、支付宝、淘宝订单截图，粘进来就自动认金额、商户和分类。'],
          ['sparkles', '一句话拆任务', '说「明天3点前交报告」，自动识别样式、设提醒、拆成 6 步。'],
          ['timer', '专注计时', '25 分钟一轮，切后台也不会少算，结束时自动记一笔。'],
        ]
          .map(
            ([ico, title, desc]) => `<div style="display:flex;gap:11px;align-items:flex-start;padding:11px;border-radius:14px;background:var(--bg-elev)">
              <span style="width:34px;height:34px;border-radius:10px;background:var(--card);color:var(--jade);display:grid;place-items:center;flex:none">${icon(ico, 17)}</span>
              <span><b style="font-size:13px;display:block">${title}</b><span style="font-size:11.5px;color:var(--muted);line-height:1.55;display:block;margin-top:2px">${desc}</span></span>
            </div>`
          )
          .join('')}
      </div>
      <div class="tip-card">${icon('lock', 14)}<span>没有账号，没有服务器。所有数据只存在这台手机里。</span></div>
    `,
    foot: `<button class="btn" data-start>直接开始</button>
      <button class="btn secondary" data-demo style="margin-top:8px">先看看示例</button>`,
    onMount(sheet) {
      sheet.querySelector('[data-start]').addEventListener('click', () => {
        db.setSetting('onboarded', true);
        closeSheet();
        toast('从记第一笔开始');
      });
      sheet.querySelector('[data-demo]').addEventListener('click', () => {
        db.reset();
        seedDemo(new Date());
        db.setSetting('onboarded', true);
        closeSheet();
        render({ resetScroll: true });
        toast('示例数据已就位');
      });
    },
    onClose() {
      if (!db.data.settings.onboarded) db.setSetting('onboarded', true);
    },
  });
}

/* ---------------- 提醒 ---------------- */

const fired = new Set();

function reminderKey(task, ts) {
  return `${task.id}:${ts}`;
}

function startReminderLoop() {
  setInterval(checkReminders, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkReminders();
  });
  setTimeout(checkReminders, 4000);
}

function checkReminders() {
  if (!db.data.settings.reminders) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  if (now - lastReminderCheck < 15000) return;
  lastReminderCheck = now;

  for (const task of db.data.tasks) {
    if (task.status === 'done') continue;

    if (task.style === 'habit' && task.recurrence) {
      const key = `habit:${task.id}:${dayKey(new Date())}`;
      if (fired.has(key) || task.habit?.log?.[dayKey(new Date())]) continue;
      const [h, m] = (task.recurrence.time || '09:00').split(':').map(Number);
      const at = new Date();
      at.setHours(h || 0, m || 0, 0, 0);
      if (now >= at.getTime() && now - at.getTime() < 2 * 3600 * 1000) {
        fired.add(key);
        notify(`该打卡了 · ${task.title}`, '今天的习惯还空着，现在做正合适。');
      }
      continue;
    }

    if (!task.remindAt) continue;
    const ts = new Date(task.remindAt).getTime();
    if (ts <= now && ts > now - 6 * 3600 * 1000) {
      const key = reminderKey(task, ts);
      if (fired.has(key)) continue;
      fired.add(key);
      const d = new Date(task.dueAt || task.remindAt);
      notify(task.title, `约在 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}，别忘了。`);
    }
  }
}

async function notify(title, body) {
  toast(`${title} · ${body}`, { duration: 3600 });
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.showNotification(title, {
        body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: 'onepage-reminder',
      });
      return;
    }
  } catch {
    /* 回退 */
  }
  try {
    new Notification(title, { body });
  } catch {
    /* 忽略 */
  }
}

/* ---------------- Service Worker ---------------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname)) return;

  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            toast('新版本已准备好，下次打开自动生效', { duration: 3200 });
          }
        });
      });
    })
    .catch((err) => console.warn('SW 注册失败', err));
}

/* ---------------- 启动 ---------------- */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* 桌面端调试用：防止双击缩放 */
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

export { render };
