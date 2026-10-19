/* 一页 · 任务 */

import {
  escapeHtml,
  icon,
  relDayLabel,
  fmtClock,
  countdownLabel,
  toLocalInput,
  daysApart,
  uid,
  pad2,
  dayKey,
} from './util.js';
import {
  db,
  todayTasks,
  upcomingTasks,
  waitingTasks,
  completedTasks,
  habitTasks,
  taskProgress,
} from './store.js';
import {
  TASK_STYLES,
  PRIORITY,
  parseTask,
  habitDoneOn,
  habitStreak,
  habitWeek,
  recurrenceLabel,
  nextOccurrence,
} from './task-parser.js';
import { bus, openSheet, closeSheet, toast, confirmDialog, emptyState, haptic } from './ui.js';
import { exportTasksToCalendar } from './ics.js';
import { setFocusTask } from './view-focus.js';

let showAllDone = false;

const EXAMPLES = ['明天下午3点前把季度报告初稿写完', '每周一三五跑步30分钟', '等王工回复报价', '周五前交房租'];

/* ---------------- 首页 ---------------- */

export function renderTasks(root) {
  const now = new Date();
  const today = todayTasks(now).filter((t) => t.style !== 'habit' && t.style !== 'waiting');
  const habits = habitTasks();
  const waiting = waitingTasks();
  const upcoming = upcomingTasks(now);
  const done = completedTasks(60);
  const doneShown = showAllDone ? done : done.slice(0, 4);
  const empty = !today.length && !habits.length && !waiting.length && !upcoming.length && !done.length;
  const dateText = `${now.getMonth() + 1}月${now.getDate()}日 · 周${'日一二三四五六'[now.getDay()]}`;

  root.innerHTML = `
    <header class="page-head">
      <div>
        <p class="eyebrow">${dateText}</p>
        <h1 class="page-title">任务</h1>
        <p class="page-sub">${today.length ? `今天还有 ${today.length} 件要推进` : '今天暂时没有硬任务'}</p>
      </div>
      <button class="icon-btn" data-new aria-label="新建任务">${icon('plus', 20)}</button>
    </header>

    <div class="capture">
      <div class="capture-row">
        <span class="spark">${icon('sparkles', 19)}</span>
        <input data-quick placeholder="明天下午3点前把报告初稿写完" enterkeyhint="done" />
        <button class="capture-btn" data-quick-go>${icon('sparkles', 13)} 识别</button>
      </div>
      <p class="capture-hint">自动识别截止 / 习惯 / 项目 / 等待 / 约会，并拆成小步骤</p>
      <div class="chips" style="margin:2px 0 2px">
        ${EXAMPLES.map((e) => `<button class="chip" data-example="${escapeHtml(e)}" style="font-size:11px;padding:5px 10px">${escapeHtml(e)}</button>`).join('')}
      </div>
    </div>

    ${
      empty
        ? emptyState({
            iconName: 'sparkles',
            title: '把脑子里的事说一句话',
            text: '不用选日期、不用建项目。写「明天3点前交方案」，它会自己识别样式、设好提醒、拆出步骤。',
            action: `<button class="btn" data-focus-input>${icon('sparkles', 16)} 试一句</button>`,
          })
        : `
          ${renderSection('今天', today.length, today.map((t) => taskCard(t, now)).join(''))}
          ${renderSection('习惯', habits.length, habits.map((t) => taskCard(t, now)).join(''))}
          ${renderSection('等待中', waiting.length, waiting.map((t) => taskCard(t, now)).join(''))}
          ${renderSection('接下来', upcoming.length, upcoming.map((t) => taskCard(t, now)).join(''))}
          ${
            done.length
              ? `<section class="section">
                  <div class="section-head">
                    <h2>已完成</h2><span class="count">${done.length}</span><span class="spacer"></span>
                    <button data-toggle-done>${showAllDone ? '收起' : '查看全部'}</button>
                  </div>
                  ${doneShown.map((t) => taskCard(t, now)).join('')}
                </section>`
              : ''
          }
        `
    }

    <button class="fab" data-new aria-label="新建任务">${icon('plus', 24)}</button>
  `;

  const input = root.querySelector('[data-quick]');
  const submit = () => {
    const v = input.value.trim();
    if (!v) {
      toast('先写一句要做的事');
      input.focus();
      return;
    }
    openTaskComposer(v);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });
  root.querySelector('[data-quick-go]').addEventListener('click', submit);
  root.querySelectorAll('[data-example]').forEach((b) =>
    b.addEventListener('click', () => {
      input.value = b.dataset.example;
      input.focus();
    })
  );
  root.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => openTaskComposer('')));
  root.querySelector('[data-focus-input]')?.addEventListener('click', () => input.focus());
  root.querySelector('[data-toggle-done]')?.addEventListener('click', () => {
    showAllDone = !showAllDone;
    renderTasks(root);
  });

  root.querySelectorAll('[data-task]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-check]') || e.target.closest('[data-nudge]')) return;
      openTaskSheet(el.dataset.task);
    });
  });

  root.querySelectorAll('[data-check]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const task = db.data.tasks.find((t) => t.id === btn.dataset.check);
      if (!task) return;
      const before = task.status;
      db.toggleTask(task.id, new Date());
      haptic(10);
      if (task.style === 'habit') {
        const done = habitDoneOn(task, new Date());
        toast(done ? `打卡成功 · 连续 ${habitStreak(task)} 天` : '已取消今天打卡');
      } else if (before !== 'done') {
        toast('完成一件 ✓');
      }
      bus.refresh();
    })
  );

  root.querySelectorAll('[data-nudge]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const task = db.data.tasks.find((t) => t.id === btn.dataset.nudge);
      if (!task) return;
      const stamp = `${new Date().getMonth() + 1}-${pad2(new Date().getDate())}`;
      const line = `[${stamp}] 跟进一次`;
      const notes = task.notes ? `${task.notes}\n${line}` : line;
      db.updateTask(task.id, { notes });
      toast('已记一次跟进，稍后记得再催');
      bus.refresh();
    })
  );
}

function renderSection(title, count, cards) {
  if (!count) return '';
  return `<section class="section">
    <div class="section-head"><h2>${title}</h2><span class="count">${count}</span></div>
    <div class="fade-list">${cards}</div>
  </section>`;
}

function taskCard(task, now) {
  const style = TASK_STYLES[task.style] || TASK_STYLES.normal;
  const isHabit = task.style === 'habit';
  const isDone = task.status === 'done';
  const habitDone = isHabit && habitDoneOn(task, now);
  const checked = isDone || habitDone;
  const prog = taskProgress(task);
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const overdue = due && due < now && !isDone && !isHabit;

  let meta = '';
  if (isHabit) {
    const streak = habitStreak(task, now);
    meta = `<span class="meta-item ${streak > 1 ? 'hot' : ''}">${icon('flame', 12)} ${streak > 0 ? `连续 ${streak} 天` : '今天还没打卡'}</span>
      <span class="meta-item">${icon('repeat', 12)} ${recurrenceLabel(task.recurrence)}</span>`;
  } else if (task.style === 'waiting') {
    const days = Math.max(0, daysApart(now, new Date(task.createdAt || now)));
    meta = `<span class="meta-item ${days >= 3 ? 'over' : ''}">${icon('hourglass', 12)} 已等 ${days} 天</span>
      <button class="ghost-link" data-nudge="${task.id}">记一次跟进</button>`;
  } else if (due) {
    const label = `${relDayLabel(due, now)} ${fmtClock(due)}`;
    meta = `<span class="meta-item ${overdue ? 'over' : ''}">${icon(task.style === 'appointment' ? 'calendar' : 'clock', 12)} ${label}${
      overdue ? ` · 逾期 ${countdownLabel(due, now).replace('前', '')}` : ''
    }</span>`;
    if (prog) meta += `<span class="meta-item">${prog.done}/${prog.total} 步</span>`;
    if (task.style === 'deadline' && !overdue) meta += `<span class="meta-item">${countdownLabel(due, now)}</span>`;
  } else {
    meta = `<span class="meta-item">${icon('clock', 12)} 随时可以做</span>`;
  }

  const dots = isHabit
    ? `<div class="habit-dots">${habitWeek(task, now)
        .map(
          (d) =>
            `<span class="dot ${d.done ? 'on' : ''} ${d.key === dayKey(now) ? 'today' : ''}">${'日一二三四五六'[d.date.getDay()]}</span>`
        )
        .join('')}</div>`
    : '';

  return `<article class="task-card ${isDone ? 'done' : ''}" data-task="${task.id}">
    <button class="check ${checked ? 'on' : ''}" data-check="${task.id}" aria-label="${checked ? '取消完成' : '完成'}">${icon('check', 14)}</button>
    <div class="task-main">
      <div class="task-top">
        <h3 class="task-title">${escapeHtml(task.title)}</h3>
        <span class="tag" style="color:${style.color};background:${style.soft}">${style.label}</span>
      </div>
      <div class="task-meta">${meta}</div>
      ${prog ? `<div class="progress"><i style="width:${prog.pct}%"></i></div>` : ''}
      ${dots}
    </div>
    <button class="task-more" tabindex="-1" aria-hidden="true">${icon('chevron', 15)}</button>
  </article>`;
}

/* ---------------- 新建 / 详情 ---------------- */

export function openTaskComposer(text = '') {
  const raw = String(text || '').trim();
  const parsed = raw ? parseTask(raw) : null;
  const draft = parsed || {
    title: '',
    style: 'normal',
    dueAt: null,
    remindAt: null,
    recurrence: null,
    priority: 'normal',
    subtasks: [],
    notes: '',
  };
  openSheet({
    title: parsed ? '识别完成' : '新任务',
    subtitle: parsed ? '确认或改一下，再保存' : '写清楚要做什么就行',
    body: taskEditorHTML(draft, { isNew: true, parsed, raw }),
    foot: `<button class="btn" data-task-save>保存任务</button>`,
    onMount(sheet) {
      attachTaskEditor(sheet, { draft, isNew: true, parsed });
    },
  });
}

export function openTaskSheet(id) {
  const task = db.data.tasks.find((t) => t.id === id);
  if (!task) return;
  openSheet({
    title: '任务详情',
    subtitle: task.style === 'habit' ? '习惯每天都可以重新开始' : '改完保存',
    body: taskEditorHTML(task, { isNew: false }),
    foot: `<button class="btn" data-task-save>保存修改</button>
      <div class="divider"></div>
      <button class="btn secondary" data-start-focus>${icon('timer', 16)} 开始专注</button>
      <button class="btn secondary" data-calendar style="margin-top:8px">${icon('calendar', 16)} 加入 iPhone 日历</button>
      <button class="btn danger" data-task-del style="margin-top:8px">删除任务</button>`,
    onMount(sheet) {
      attachTaskEditor(sheet, { draft: task, isNew: false, task });
    },
  });
}

function taskEditorHTML(task, { isNew = false, parsed = null, raw = '' } = {}) {
  const style = TASK_STYLES[task.style] || TASK_STYLES.normal;
  const isHabit = task.style === 'habit';
  const rec = task.recurrence || { type: 'daily', weekdays: [nowWeekday()], day: new Date().getDate(), time: '09:00' };
  const signals = parsed?.signals?.length ? parsed.signals.join(' · ') : style.desc;

  return `
    ${
      parsed
        ? `<div class="parse-banner" data-banner>
            <span class="pb-icon">${icon(style.icon, 17)}</span>
            <div><b>${style.label}型 · 识别 ${parsed.confidence}%</b><span class="pb-sub" data-banner-sub>${escapeHtml(signals)}</span></div>
          </div>`
        : ''
    }

    <div class="field">
      <label class="field-label">要做的事</label>
      <input class="input" data-title value="${escapeHtml(task.title || '')}" placeholder="例如：把季度报告初稿写完" />
    </div>

    <div class="field">
      <label class="field-label">样式 <span style="font-weight:500">点一下可以改</span></label>
      <div class="style-chips" data-styles>
        ${Object.entries(TASK_STYLES)
          .map(
            ([id, s]) =>
              `<button type="button" class="style-chip ${id === task.style ? 'active' : ''}" data-style="${id}" style="${id === task.style ? `color:${s.color};background:${s.soft};border-color:${s.color}` : ''}">${icon(s.icon, 12)} ${s.label}</button>`
          )
          .join('')}
      </div>
    </div>

    <div class="field" data-due-field ${isHabit ? 'hidden' : ''}>
      <label class="field-label">截止时间 <span style="font-weight:500">可留空</span></label>
      <input class="input" type="datetime-local" data-due value="${toLocalInput(task.dueAt)}" />
    </div>

    <div class="field" data-rec-field ${isHabit ? '' : 'hidden'}>
      <label class="field-label">重复</label>
      <div class="segmented" data-rec-seg>
        ${[
          ['daily', '每天'],
          ['weekly', '每周'],
          ['monthly', '每月'],
        ]
          .map(([v, l]) => `<button type="button" data-rec="${v}" class="${(rec.type || 'daily') === v ? 'active' : ''}">${l}</button>`)
          .join('')}
      </div>
      <div class="chips" data-weekdays style="margin:9px 0 2px">
        ${[1, 2, 3, 4, 5, 6, 7]
          .map(
            (d) =>
              `<button type="button" class="chip ${(rec.weekdays || []).includes(d) ? 'active' : ''}" data-weekday="${d}" style="min-width:36px;justify-content:center;padding:6px 0">${
                ['一', '二', '三', '四', '五', '六', '日'][d - 1]
              }</button>`
          )
          .join('')}
      </div>
      <div data-monthly ${rec.type === 'monthly' ? '' : 'hidden'} style="margin-top:9px">
        <input class="input" type="number" min="1" max="31" data-rec-day value="${rec.day || 1}" placeholder="每月几号" />
      </div>
      <div style="margin-top:9px">
        <input class="input" type="time" data-rec-time value="${rec.time || '09:00'}" />
      </div>
    </div>

    <div class="field">
      <label class="field-label">拆解 <span data-est style="font-weight:500">${task.estimateMinutes ? '约 ' + Math.round(task.estimateMinutes / 60 * 10) / 10 + ' 小时' : ''}</span></label>
      <div class="steps-editor" data-steps>
        ${(task.subtasks || [])
          .map(
            (s) => `<div class="step-edit" data-sub-id="${s.id}" data-done="${s.done ? '1' : '0'}" data-minutes="${s.minutes || 15}">
              <button type="button" class="step-check ${s.done ? 'on' : ''}" data-step-check aria-label="${s.done ? '标记未完成' : '标记完成'}">${icon('check', 11)}</button>
              <input class="input" value="${escapeHtml(s.title)}" placeholder="一步做什么" />
              <button type="button" class="del" data-del-step aria-label="删除这一步">${icon('x', 14)}</button>
            </div>`
          )
          .join('')}
      </div>
      <button type="button" class="add-step" data-add-step>${icon('plus', 14)} 加一步</button>
    </div>

    <div class="field" data-remind-field ${isHabit ? 'hidden' : ''}>
      <label class="field-label">提醒 <span style="font-weight:500">可留空</span></label>
      <input class="input" type="datetime-local" data-remind value="${toLocalInput(task.remindAt)}" />
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button type="button" class="chip" data-quick-remind="10" style="font-size:11px;padding:5px 10px">提前10分</button>
        <button type="button" class="chip" data-quick-remind="30" style="font-size:11px;padding:5px 10px">提前30分</button>
        <button type="button" class="chip" data-quick-remind="60" style="font-size:11px;padding:5px 10px">提前1小时</button>
        <button type="button" class="chip" data-quick-remind="0" style="font-size:11px;padding:5px 10px">清空</button>
      </div>
    </div>

    <div class="field">
      <label class="field-label">优先级</label>
      <div class="segmented" data-priority-wrap>
        ${Object.entries(PRIORITY)
          .map(([id, p]) => `<button type="button" data-priority="${id}" class="${task.priority === id ? 'active' : ''}">${p.label}</button>`)
          .join('')}
      </div>
    </div>

    <div class="field">
      <label class="field-label">备注 <span style="font-weight:500">可选</span></label>
      <input class="input" data-notes value="${escapeHtml(task.notes || '')}" placeholder="背景、联系人、链接" />
    </div>

    ${
      raw
        ? `<details class="tip-card" style="display:block;cursor:pointer"><summary style="font-weight:650;color:var(--ink-2)">查看原句</summary>
            <div style="margin-top:6px;font-size:11px">${escapeHtml(raw)}</div>
          </details>`
        : ''
    }
  `;
}

function nowWeekday() {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}

function attachTaskEditor(sheet, { draft, isNew, task = null, parsed = null }) {
  const dueField = sheet.querySelector('[data-due-field]');
  const recField = sheet.querySelector('[data-rec-field]');
  const remindField = sheet.querySelector('[data-remind-field]');
  const stylesWrap = sheet.querySelector('[data-styles]');
  let style = draft.style || 'normal';
  let recurrence = draft.recurrence ? { ...draft.recurrence } : null;

  const paintStyles = () => {
    stylesWrap.querySelectorAll('[data-style]').forEach((b) => {
      const s = TASK_STYLES[b.dataset.style];
      const on = b.dataset.style === style;
      b.classList.toggle('active', on);
      b.style.color = on ? s.color : '';
      b.style.background = on ? s.soft : '';
      b.style.borderColor = on ? s.color : '';
    });
  };

  const syncFields = () => {
    const isHabit = style === 'habit';
    dueField.hidden = isHabit;
    recField.hidden = !isHabit;
    remindField.hidden = isHabit;
    if (isHabit && !recurrence) {
      recurrence = { type: 'daily', weekdays: [nowWeekday()], day: new Date().getDate(), time: '09:00' };
      paintRecurrence();
    }
  };

  const paintRecurrence = () => {
    if (!recurrence) return;
    sheet.querySelectorAll('[data-rec]').forEach((b) => b.classList.toggle('active', b.dataset.rec === recurrence.type));
    sheet.querySelectorAll('[data-weekday]').forEach((b) =>
      b.classList.toggle('active', (recurrence.weekdays || []).includes(+b.dataset.weekday))
    );
    const monthly = sheet.querySelector('[data-monthly]');
    if (monthly) monthly.hidden = recurrence.type !== 'monthly';
    const dayInput = sheet.querySelector('[data-rec-day]');
    if (dayInput) dayInput.value = recurrence.day || 1;
    const timeInput = sheet.querySelector('[data-rec-time]');
    if (timeInput) timeInput.value = recurrence.time || '09:00';
    const wd = sheet.querySelector('[data-weekdays]');
    if (wd) wd.style.display = recurrence.type === 'weekly' ? '' : 'none';
  };

  stylesWrap.querySelectorAll('[data-style]').forEach((b) =>
    b.addEventListener('click', () => {
      style = b.dataset.style;
      paintStyles();
      syncFields();
    })
  );

  sheet.querySelectorAll('[data-rec]').forEach((b) =>
    b.addEventListener('click', () => {
      recurrence = recurrence || { type: 'daily', weekdays: [nowWeekday()], time: '09:00' };
      recurrence.type = b.dataset.rec;
      if (recurrence.type === 'weekly' && !(recurrence.weekdays || []).length) recurrence.weekdays = [nowWeekday()];
      paintRecurrence();
    })
  );

  sheet.querySelectorAll('[data-weekday]').forEach((b) =>
    b.addEventListener('click', () => {
      if (!recurrence) return;
      const d = +b.dataset.weekday;
      const set = new Set(recurrence.weekdays || []);
      if (set.has(d)) set.delete(d);
      else set.add(d);
      if (!set.size) set.add(d);
      recurrence.weekdays = [...set].sort((a, b2) => a - b2);
      paintRecurrence();
    })
  );

  sheet.querySelector('[data-rec-day]')?.addEventListener('input', (e) => {
    if (recurrence) recurrence.day = Math.max(1, Math.min(31, +e.target.value || 1));
  });
  sheet.querySelector('[data-rec-time]')?.addEventListener('input', (e) => {
    if (recurrence) recurrence.time = e.target.value || '09:00';
  });

  sheet.querySelectorAll('[data-quick-remind]').forEach((b) =>
    b.addEventListener('click', () => {
      const dueVal = sheet.querySelector('[data-due]').value;
      const remindInput = sheet.querySelector('[data-remind]');
      if (!dueVal) {
        toast('先设一个截止时间');
        return;
      }
      if (b.dataset.quickRemind === '0') {
        remindInput.value = '';
        return;
      }
      const d = new Date(dueVal);
      d.setMinutes(d.getMinutes() - +b.dataset.quickRemind);
      remindInput.value = toLocalInput(d);
    })
  );

  sheet.querySelectorAll('[data-priority]').forEach((b) =>
    b.addEventListener('click', () => {
      sheet.querySelectorAll('[data-priority]').forEach((x) => x.classList.toggle('active', x === b));
    })
  );

  const stepsWrap = sheet.querySelector('[data-steps]');
  const bindDel = (row) => {
    row.querySelector('[data-del-step]').addEventListener('click', () => {
      row.remove();
      updateEstimate();
    });
    const check = row.querySelector('[data-step-check]');
    const sync = () => {
      const on = row.dataset.done === '1';
      check.classList.toggle('on', on);
      row.classList.toggle('done', on);
      check.setAttribute('aria-label', on ? '标记未完成' : '标记完成');
    };
    check.addEventListener('click', () => {
      row.dataset.done = row.dataset.done === '1' ? '0' : '1';
      sync();
    });
    sync();
  };
  const updateEstimate = () => {
    const n = stepsWrap.querySelectorAll('.step-edit').length;
    const est = sheet.querySelector('[data-est]');
    if (est) est.textContent = n ? `${n} 步` : '';
  };
  stepsWrap.querySelectorAll('.step-edit').forEach(bindDel);

  sheet.querySelector('[data-add-step]').addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'step-edit';
    row.dataset.done = '0';
    row.dataset.minutes = '15';
    row.innerHTML = `<button type="button" class="step-check" data-step-check aria-label="标记完成">${icon('check', 11)}</button><input class="input" placeholder="一步做什么" /><button type="button" class="del" data-del-step aria-label="删除这一步">${icon('x', 14)}</button>`;
    stepsWrap.appendChild(row);
    bindDel(row);
    updateEstimate();
    row.querySelector('input').focus();
  });

  paintStyles();
  syncFields();
  paintRecurrence();

  const collect = () => {
    const title = sheet.querySelector('[data-title]').value.trim();
    if (!title) {
      toast('给任务起个名字');
      sheet.querySelector('[data-title]').focus();
      return null;
    }
    const priority = sheet.querySelector('[data-priority].active')?.dataset.priority || 'normal';
    const dueVal = sheet.querySelector('[data-due]').value;
    const remindVal = sheet.querySelector('[data-remind]').value;
    const notes = sheet.querySelector('[data-notes]').value.trim();

    const subtasks = [...stepsWrap.querySelectorAll('.step-edit')]
      .map((row) => {
        const text = row.querySelector('input').value.trim();
        if (!text) return null;
        return {
          id: row.dataset.subId || uid('sub'),
          title: text,
          minutes: +row.dataset.minutes || 15,
          done: row.dataset.done === '1',
        };
      })
      .filter(Boolean);

    let rec = null;
    let dueAt = null;
    let remindAt = null;

    if (style === 'habit') {
      const type = sheet.querySelector('[data-rec].active')?.dataset.rec || 'daily';
      const time = sheet.querySelector('[data-rec-time]').value || '09:00';
      rec = {
        type,
        time,
        weekdays: [...sheet.querySelectorAll('[data-weekday].active')].map((b) => +b.dataset.weekday),
        day: Math.max(1, Math.min(31, +sheet.querySelector('[data-rec-day]').value || 1)),
      };
      if (type === 'weekly' && !rec.weekdays.length) rec.weekdays = [nowWeekday()];
      dueAt = nextOccurrence(rec, new Date())?.toISOString() || null;
    } else {
      dueAt = dueVal ? new Date(dueVal).toISOString() : null;
      remindAt = remindVal ? new Date(remindVal).toISOString() : null;
    }

    return {
      title,
      style,
      priority,
      notes,
      dueAt,
      remindAt,
      recurrence: rec,
      subtasks,
      estimateMinutes: subtasks.reduce((s, x) => s + (x.minutes || 0), 0),
      updatedAt: new Date().toISOString(),
    };
  };

  /* 保存 */
  sheet.querySelector('[data-task-save]').addEventListener('click', () => {
    const patch = collect();
    if (!patch) return;
    if (isNew) {
      db.addTask({ ...patch, habit: { log: {} } });
      toast('任务已加上');
    } else {
      if (patch.style === 'habit' && !task.habit) patch.habit = { log: {} };
      db.updateTask(task.id, patch);
      toast('已保存');
    }
    haptic(10);
    closeSheet();
    bus.refresh();

    if (patch.remindAt && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  });

  /* 详情里的附加动作 */
  sheet.querySelector('[data-start-focus]')?.addEventListener('click', () => {
    if (!task) return;
    setFocusTask(task.id);
    closeSheet();
    bus.go('focus');
  });

  sheet.querySelector('[data-calendar]')?.addEventListener('click', () => {
    const patch = collect();
    if (!patch) return;
    if (!patch.dueAt) {
      toast('先给任务设一个截止时间');
      return;
    }
    const count = exportTasksToCalendar([{ ...(task || {}), ...patch }]);
    if (!count) {
      toast('先给任务设一个截止时间');
      return;
    }
    toast('已生成日历文件，打开它并选择「日历」');
  });

  sheet.querySelector('[data-task-del]')?.addEventListener('click', async () => {
    if (!task) return;
    const ok = await confirmDialog({
      title: '删除这个任务？',
      message: '任务和拆解步骤都会被删掉，专注记录会保留。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    db.deleteTask(task.id);
    closeSheet();
    toast('已删除');
    bus.refresh();
  });
}
