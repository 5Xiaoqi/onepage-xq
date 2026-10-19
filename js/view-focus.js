/* 一页 · 专注
 * 计时用时间戳而不是累加，切后台/锁屏回来不会少算。
 */

import { escapeHtml, icon, pad2 } from './util.js';
import { db, todayTasks, focusStats } from './store.js';
import { openSheet, closeSheet, toast, haptic, isSheetOpen } from './ui.js';

const R = 136;
const C = 2 * Math.PI * R;
const TIMER_KEY = 'onepage.timer.v1';

const T = {
  active: false,
  paused: false,
  mode: 'focus', // focus | break
  plannedSec: 25 * 60,
  baseSec: 0,
  startTs: 0,
  taskId: null,
  sessionStart: null,
};

let tickTimer = null;
let rootRef = null;
let ambient = null;
let wakeLock = null;
let chimeCtx = null;

/* ---------------- 渲染 ---------------- */

export function renderFocus(root) {
  rootRef = root;
  const now = new Date();
  const stats = focusStats(now);
  const tasks = todayTasks(now);
  const settings = db.data.settings;
  if (!T.active && T.plannedSec === 25 * 60 && settings.focusMin && settings.focusMin !== 25) {
    T.plannedSec = settings.focusMin * 60;
  }
  const task = T.taskId ? db.data.tasks.find((t) => t.id === T.taskId) : null;
  const presetActive = (m) => !T.active && T.plannedSec === m * 60;
  const weekMax = Math.max(...stats.week.map((w) => w.sec), 1);

  root.innerHTML = `
    <header class="page-head">
      <div>
        <p class="eyebrow">专注 · ${T.mode === 'break' ? '休息' : 'Focus'}</p>
        <h1 class="page-title">把时间留出来</h1>
        <p class="page-sub">一次只做一件事</p>
      </div>
      <button class="icon-btn" data-focus-settings aria-label="专注设置">${icon('settings', 19)}</button>
    </header>

    <div class="focus-stage ${T.active && !T.paused ? 'focus-running' : ''}">
      <div class="ring-wrap">
        <svg class="ring" viewBox="0 0 300 300" aria-hidden="true">
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#3DB08E" />
              <stop offset="100%" stop-color="#0C5E48" />
            </linearGradient>
          </defs>
          <circle class="ring-bg" cx="150" cy="150" r="${R}" />
          <circle class="ring-fg" id="ring-fg" cx="150" cy="150" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="0" />
        </svg>
        <div class="ring-inner">
          <span class="ring-mode" id="ring-mode">${T.mode === 'break' ? '休息' : T.paused ? '已暂停' : T.active ? '专注中' : '准备开始'}</span>
          <strong class="ring-time" id="ring-time">${fmt(T.active ? Math.max(0, T.plannedSec - elapsed()) : T.plannedSec)}</strong>
          <span class="ring-task ${task ? '' : 'empty'}" id="ring-task">${task ? escapeHtml(task.title) : '还没关联任务'}</span>
        </div>
      </div>

      <div class="presets">
        ${[15, 25, 45, 60]
          .map((m) => `<button data-preset="${m}" class="${presetActive(m) ? 'active' : ''}">${m} 分</button>`)
          .join('')}
      </div>

      <button class="focus-btn" data-main>${mainLabel()}</button>
      <div class="focus-tools">
        <button data-ambient class="${ambient ? 'on' : ''}">${icon('coffee', 14)} 白噪音</button>
        <button data-stop class="${T.active ? '' : 'hidden'}">${icon('stop', 13)} 结束这一轮</button>
        <button data-clear-task class="${T.taskId ? '' : 'hidden'}">${icon('x', 13)} 取消关联</button>
      </div>

      ${
        tasks.length
          ? `<div class="task-picker">
              <button class="pick-chip ${!T.taskId ? 'active' : ''}" data-pick="">不关联</button>
              ${tasks
                .map(
                  (t) =>
                    `<button class="pick-chip ${T.taskId === t.id ? 'active' : ''}" data-pick="${t.id}">${escapeHtml(t.title)}</button>`
                )
                .join('')}
            </div>`
          : ''
      }
    </div>

    <div class="card focus-stats">
      <div class="stat-row">
        <div class="stat"><b class="num">${Math.round(stats.todaySec / 60)}</b><span>今日分钟</span></div>
        <div class="stat"><b class="num">${stats.todayCount}</b><span>完成番茄</span></div>
        <div class="stat"><b class="num">${Math.round(stats.weekSec / 60)}</b><span>本周分钟</span></div>
      </div>
      <div class="week-bars">
        ${stats.week
          .map(
            (w) =>
              `<div class="wb ${w.sec ? 'on' : ''}"><i style="height:${Math.max(4, Math.round((w.sec / weekMax) * 100))}%"></i><span>${'日一二三四五六'[w.date.getDay()]}</span></div>`
          )
          .join('')}
      </div>
    </div>
  `;

  root.querySelectorAll('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => {
      if (T.active) {
        toast('先结束当前这一轮，再换时长');
        return;
      }
      T.mode = 'focus';
      T.plannedSec = +b.dataset.preset * 60;
      saveTimer();
      renderFocus(root);
    })
  );

  root.querySelector('[data-main]').addEventListener('click', () => {
    if (!T.active) startTimer(T.mode, T.plannedSec);
    else if (T.paused) resumeTimer();
    else pauseTimer();
    renderFocus(rootRef);
    if (T.active) paintTimer();
  });

  root.querySelector('[data-stop]').addEventListener('click', () => stopTimer());
  root.querySelector('[data-clear-task]')?.addEventListener('click', () => {
    T.taskId = null;
    saveTimer();
    renderFocus(root);
  });

  root.querySelectorAll('[data-pick]').forEach((b) =>
    b.addEventListener('click', () => {
      T.taskId = b.dataset.pick || null;
      saveTimer();
      renderFocus(root);
    })
  );

  root.querySelector('[data-ambient]').addEventListener('click', () => {
    toggleAmbient();
    renderFocus(root);
  });

  root.querySelector('[data-focus-settings]').addEventListener('click', openFocusSettings);

  paintTimer();
  startTickingIfNeeded();
}

function mainLabel() {
  if (!T.active) return `${icon('play', 17)} 开始${T.mode === 'break' ? '休息' : '专注'}`;
  if (T.paused) return `${icon('play', 17)} 继续`;
  return `${icon('pause', 16)} 暂停`;
}

function fmt(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}

/* ---------------- 状态 ---------------- */

function elapsed() {
  if (!T.active) return 0;
  return T.baseSec + (T.paused ? 0 : (Date.now() - T.startTs) / 1000);
}

function saveTimer() {
  try {
    localStorage.setItem(
      TIMER_KEY,
      JSON.stringify({
        active: T.active,
        paused: T.paused,
        mode: T.mode,
        plannedSec: T.plannedSec,
        baseSec: T.active ? elapsed() : 0,
        savedAt: Date.now(),
        taskId: T.taskId,
        sessionStart: T.sessionStart,
      })
    );
  } catch {
    /* 忽略 */
  }
}

function restoreTimer() {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s || !s.active) {
      if (s?.plannedSec) T.plannedSec = s.plannedSec;
      if (s?.mode) T.mode = s.mode;
      if (s?.taskId) T.taskId = s.taskId;
      return;
    }
    T.active = true;
    T.paused = !!s.paused;
    T.mode = s.mode || 'focus';
    T.plannedSec = s.plannedSec || T.plannedSec;
    T.taskId = s.taskId || null;
    T.sessionStart = s.sessionStart || new Date().toISOString();
    T.baseSec = s.baseSec || 0;
    T.startTs = s.paused ? 0 : Date.now();
    if (!s.paused) {
      const gap = (Date.now() - (s.savedAt || Date.now())) / 1000;
      T.baseSec += gap;
      T.baseSec = Math.min(T.baseSec, T.plannedSec);
    }
  } catch {
    /* 忽略 */
  }
}

function startTimer(mode, plannedSec) {
  T.active = true;
  T.paused = false;
  T.mode = mode;
  T.plannedSec = plannedSec;
  T.baseSec = 0;
  T.startTs = Date.now();
  T.sessionStart = new Date().toISOString();
  saveTimer();
  ensureAudio();
  requestWakeLock();
  askNotifyPermission();
  haptic(8);
}

function pauseTimer() {
  T.baseSec = elapsed();
  T.paused = true;
  saveTimer();
  stopTicking();
  releaseWakeLock();
  haptic(6);
}

function resumeTimer() {
  T.startTs = Date.now();
  T.paused = false;
  saveTimer();
  requestWakeLock();
  startTickingIfNeeded();
}

function stopTimer() {
  const sec = Math.round(elapsed());
  const shouldRecord = T.active && sec >= 60;
  if (shouldRecord) recordSession(sec, false);
  T.active = false;
  T.paused = false;
  T.baseSec = 0;
  T.sessionStart = null;
  T.plannedSec = (db.data.settings.focusMin || 25) * 60;
  T.mode = 'focus';
  saveTimer();
  stopTicking();
  releaseWakeLock();
  if (rootRef) renderFocus(rootRef);
  if (shouldRecord) toast(`这一轮记了 ${Math.round(sec / 60)} 分钟`);
}

function recordSession(sec, completed) {
  db.addSession({
    taskId: T.taskId,
    mode: T.mode,
    startedAt: T.sessionStart || new Date(Date.now() - sec * 1000).toISOString(),
    endedAt: new Date().toISOString(),
    plannedSec: T.plannedSec,
    seconds: Math.max(1, Math.round(sec)),
    completed,
  });
}

/* ---------------- 走时 ---------------- */

function startTickingIfNeeded() {
  if (!T.active || T.paused) {
    stopTicking();
    return;
  }
  if (tickTimer) return;
  tickTimer = setInterval(tick, 250);
}

function stopTicking() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function tick() {
  if (!T.active) {
    stopTicking();
    return;
  }
  const remain = T.plannedSec - elapsed();
  paintTimer(remain);
  if (remain <= 0) completeSession();
}

function paintTimer(remainOverride) {
  const root = rootRef;
  if (!root) return;
  const remain = remainOverride ?? T.plannedSec - elapsed();
  const timeEl = root.querySelector('#ring-time');
  const ring = root.querySelector('#ring-fg');
  const modeEl = root.querySelector('#ring-mode');
  if (timeEl) timeEl.textContent = fmt(remain);
  if (ring) {
    const pct = Math.min(1, Math.max(0, (T.plannedSec - remain) / T.plannedSec));
    ring.style.strokeDashoffset = String(C * pct);
  }
  if (modeEl && T.active) modeEl.textContent = T.paused ? '已暂停' : T.mode === 'break' ? '休息中' : '专注中';
}

function completeSession() {
  const wasBreak = T.mode === 'break';
  const sec = T.plannedSec;
  recordSession(sec, true);
  T.active = false;
  T.paused = false;
  T.baseSec = 0;
  T.sessionStart = null;
  stopTicking();
  releaseWakeLock();
  chime();
  haptic([12, 60, 18]);
  if (wasBreak) {
    T.mode = 'focus';
    T.plannedSec = (db.data.settings.focusMin || 25) * 60;
  } else {
    T.mode = 'break';
    T.plannedSec = (db.data.settings.breakMin || 5) * 60;
  }
  saveTimer();

  pushNotify(wasBreak ? '休息结束' : '专注完成 ✓', wasBreak ? '回来继续吧，下一轮已经准备好了。' : `${Math.round(sec / 60)} 分钟，做完了。`);

  // 只在专注页重绘；在别的页面时不碰 DOM，避免把当前页面覆盖掉
  const onFocusPage = !!rootRef && !!rootRef.querySelector?.('.focus-page');
  if (onFocusPage) renderFocus(rootRef);

  if (wasBreak) {
    toast('休息结束，继续');
    return;
  }

  const task = T.taskId ? db.data.tasks.find((t) => t.id === T.taskId) : null;
  const breakMin = db.data.settings.breakMin || 5;

  // 正在别处填表时，不弹庆祝层，避免打断
  if (!onFocusPage || isSheetOpen()) {
    toast(`专注完成 · ${Math.round(sec / 60)} 分钟`);
    return;
  }

  openSheet({
    title: '这一轮完成了',
    subtitle: '站起来走两步，喝口水',
    body: `<div style="text-align:center;padding:6px 0 14px">
      <div style="font-size:52px;font-weight:280;letter-spacing:-.04em;color:var(--jade);font-variant-numeric:tabular-nums">${Math.round(sec / 60)}<span style="font-size:20px;font-weight:500;margin-left:2px">分钟</span></div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:4px">${task ? escapeHtml(task.title) : '没有关联任务，也算数'}</div>
    </div>`,
    foot: `<button class="btn" data-break>休息 ${breakMin} 分钟</button>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn secondary" data-again>再来一轮</button>
        <button class="btn secondary" data-done>收工</button>
      </div>`,
    onMount(sheet) {
      sheet.querySelector('[data-break]').addEventListener('click', () => {
        closeSheet();
        T.mode = 'break';
        T.plannedSec = breakMin * 60;
        startTimer('break', breakMin * 60);
        if (rootRef) renderFocus(rootRef);
      });
      sheet.querySelector('[data-again]').addEventListener('click', () => {
        closeSheet();
        T.mode = 'focus';
        T.plannedSec = (db.data.settings.focusMin || 25) * 60;
        startTimer('focus', T.plannedSec);
        if (rootRef) renderFocus(rootRef);
      });
      sheet.querySelector('[data-done]').addEventListener('click', () => closeSheet());
    },
  });
}

/* ---------------- 声音 ---------------- */

function ensureAudio() {
  if (chimeCtx) {
    if (chimeCtx.state === 'suspended') chimeCtx.resume().catch(() => {});
    return chimeCtx;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    chimeCtx = new Ctx();
  } catch {
    chimeCtx = null;
  }
  return chimeCtx;
}

function chime() {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  [880, 1174.7, 1568].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + i * 0.18);
    gain.gain.linearRampToValueAtTime(0.16, now + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.18);
    osc.stop(now + i * 0.18 + 0.55);
  });
}

function toggleAmbient() {
  if (ambient) {
    const a = ambient;
    ambient = null;
    try {
      a.gain.gain.linearRampToValueAtTime(0, a.ctx.currentTime + 0.35);
      setTimeout(() => {
        try {
          a.ctx.close();
        } catch {
          /* 忽略 */
        }
      }, 450);
    } catch {
      /* 忽略 */
    }
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    toast('这个浏览器不支持白噪音');
    return;
  }
  let ctx;
  try {
    ctx = new Ctx();
  } catch {
    toast('这个浏览器不支持白噪音');
    return;
  }
  const len = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1100;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 1.2);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
  ambient = { ctx, src, gain };
}

/* ---------------- 通知 / 屏幕常亮 ---------------- */

async function askNotifyPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      /* 忽略 */
    }
  }
}

async function pushNotify(title, body) {
  if (Notification.permission !== 'granted') return;
  try {
    if (navigator.serviceWorker?.controller) {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.showNotification(title, {
        body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: 'onepage-focus',
      });
      return;
    }
  } catch {
    /* 回退 */
  }
  try {
    new Notification(title, { body });
  } catch {
    /* iOS 上不支持的场景直接忽略 */
  }
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  try {
    wakeLock?.release();
  } catch {
    /* 忽略 */
  }
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (T.active && !T.paused) {
    startTickingIfNeeded();
    requestWakeLock();
    if (T.plannedSec - elapsed() <= 0) completeSession();
  }
});

/* ---------------- 设置 ---------------- */

function openFocusSettings() {
  const s = db.data.settings;
  openSheet({
    title: '专注设置',
    subtitle: '改成自己顺手的节奏',
    body: `
      <div class="field">
        <label class="field-label">专注时长（分钟）</label>
        <input class="input" type="number" inputmode="numeric" min="5" max="120" data-set-focus value="${s.focusMin}" />
      </div>
      <div class="field">
        <label class="field-label">休息时长（分钟）</label>
        <input class="input" type="number" inputmode="numeric" min="1" max="60" data-set-break value="${s.breakMin}" />
      </div>
      <div class="tip-card">${icon('info', 14)}<span>计时按真实时间计算，切到别的 App、锁屏再回来也会继续走。系统级提醒请把任务「加入日历」。</span></div>
    `,
    foot: `<button class="btn" data-set-save>保存</button>`,
    onMount(sheet) {
      sheet.querySelector('[data-set-save]').addEventListener('click', () => {
        const f = Math.min(120, Math.max(5, +sheet.querySelector('[data-set-focus]').value || 25));
        const b = Math.min(60, Math.max(1, +sheet.querySelector('[data-set-break]').value || 5));
        db.setSetting('focusMin', f);
        db.setSetting('breakMin', b);
        if (!T.active) {
          T.plannedSec = f * 60;
          T.mode = 'focus';
          saveTimer();
        }
        closeSheet();
        toast('已保存');
        if (rootRef) renderFocus(rootRef);
      });
    },
  });
}

/* ---------------- 对外 ---------------- */

export function setFocusTask(id) {
  T.taskId = id || null;
  T.mode = 'focus';
  saveTimer();
}

export function initFocusTimer() {
  restoreTimer();
  if (T.active && T.plannedSec - elapsed() <= 0) {
    // App 关着的时候已经到点了：静默记一笔，不弹庆祝层
    recordSession(T.plannedSec, true);
    T.active = false;
    T.paused = false;
    T.baseSec = 0;
    saveTimer();
  }
  startTickingIfNeeded();
}
