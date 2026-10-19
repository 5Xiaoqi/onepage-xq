/* 一页 · 我的：统计 / 数据 / 设置 / 帮助 */

import {
  escapeHtml,
  icon,
  money,
  download,
  isStandalone,
  dayKey,
} from './util.js';
import {
  db,
  summaryFor,
  categoryBreakdown,
  focusStats,
  openTasks,
  completedTasks,
  habitTasks,
  lastBackupDays,
  backupPayload,
  txCSV,
  txInMonth,
  seedDemo,
} from './store.js';
import { categoryById } from './money-parser.js';
import { habitStreak } from './task-parser.js';
import { bus, openSheet, closeSheet, toast, confirmDialog, haptic } from './ui.js';

export function renderMe(root) {
  const now = new Date();
  const s = summaryFor(now);
  const cats = categoryBreakdown(now).slice(0, 6);
  const catMax = Math.max(...cats.map((c) => c.cents), 1);
  const focus = focusStats(now);
  const weekMax = Math.max(...focus.week.map((w) => w.sec), 1);
  const tasks = openTasks();
  const done = completedTasks(200);
  const monthDone = done.filter((t) => t.completedAt && new Date(t.completedAt).getMonth() === now.getMonth()).length;
  const habits = habitTasks();
  const bestStreak = habits.reduce((m, t) => Math.max(m, habitStreak(t, now)), 0);
  const budget = db.data.settings.budgetCents || 0;
  const pct = budget ? Math.min(100, Math.round((s.expense / budget) * 100)) : 0;
  const backupDays = lastBackupDays(now);
  const install = isStandalone();

  root.innerHTML = `
    <header class="page-head">
      <div>
        <p class="eyebrow">${now.getFullYear()} · 个人数据</p>
        <h1 class="page-title">我的</h1>
        <p class="page-sub">只在这台手机上，不上传</p>
      </div>
      <button class="icon-btn" data-install-help aria-label="安装与帮助">${icon('info', 19)}</button>
    </header>

    <section class="card">
      <div class="card-head">
        <span class="card-title">本月概览<small>${now.getMonth() + 1}月</small></span>
        <button class="card-link" data-edit-budget>改预算</button>
      </div>
      <div class="stat-row">
        <div class="stat"><b class="num" style="color:var(--clay)">${money(s.expense, { decimals: 0 })}</b><span>支出</span></div>
        <div class="stat"><b class="num" style="color:var(--jade)">${money(s.income, { decimals: 0 })}</b><span>收入</span></div>
        <div class="stat"><b class="num">${money(s.net, { decimals: 0 })}</b><span>结余</span></div>
      </div>
      ${
        budget
          ? `<div style="margin-top:14px">
              <div class="budget-line" style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:6px">
                <span>预算 ${money(budget, { decimals: 0 })}</span><span>${pct}%</span>
              </div>
              <div class="progress" style="height:6px"><i style="width:${pct}%;background:${pct > 90 ? 'var(--clay)' : 'var(--jade)'}"></i></div>
            </div>`
          : `<button class="ghost-link" data-edit-budget style="margin-top:12px">${icon('plus', 12)} 设一个月度预算</button>`
      }
    </section>

    ${
      cats.length
        ? `<section class="card">
            <div class="card-head"><span class="card-title">钱花在哪</span><span class="card-link">${txInMonth(now).length} 笔</span></div>
            ${cats
              .map((c) => {
                const cat = categoryById(c.category);
                return `<div class="cat-bar">
                  <span class="name">${cat.emoji} ${cat.name}</span>
                  <span class="track"><i class="fill" style="width:${Math.max(4, Math.round((c.cents / catMax) * 100))}%;background:${cat.color}"></i></span>
                  <span class="val">${money(c.cents, { decimals: 0 })}</span>
                </div>`;
              })
              .join('')}
          </section>`
        : ''
    }

    <section class="card">
      <div class="card-head"><span class="card-title">节奏</span><span class="card-link">近 7 天</span></div>
      <div class="stat-row">
        <div class="stat"><b class="num">${Math.round(focus.todaySec / 60)}</b><span>今日专注分钟</span></div>
        <div class="stat"><b class="num">${monthDone}</b><span>本月完成任务</span></div>
        <div class="stat"><b class="num">${bestStreak}</b><span>最长习惯连续</span></div>
      </div>
      <div class="week-bars" style="height:54px">
        ${focus.week
          .map(
            (w) =>
              `<div class="wb ${w.sec ? 'on' : ''}"><i style="height:${Math.max(4, Math.round((w.sec / weekMax) * 100))}%"></i><span>${'日一二三四五六'[w.date.getDay()]}</span></div>`
          )
          .join('')}
      </div>
      <div style="font-size:10.5px;color:var(--muted);margin-top:8px">本周 ${Math.round(focus.weekSec / 60)} 分钟 · ${tasks.length} 件进行中</div>
    </section>

    ${
      backupDays === null || backupDays > 14
        ? `<button class="card" data-backup style="width:100%;text-align:left;display:flex;align-items:center;gap:11px;border-color:var(--gold-soft);background:var(--gold-soft)">
            <span class="row-ico" style="background:var(--card);color:var(--gold)">${icon('download', 17)}</span>
            <span style="flex:1">
              <span class="row-title" style="display:block;color:var(--gold)">${backupDays === null ? '还没有备份过' : `上次备份是 ${backupDays} 天前`}</span>
              <span class="row-sub" style="display:block;color:var(--muted)">点一下导出一份 JSON，存到「文件」里</span>
            </span>
            ${icon('chevron', 15)}
          </button>`
        : ''
    }

    <div class="section-label">数据</div>
    <section class="card" style="padding:4px 15px">
      <div class="list-rows">
        <button class="row" data-backup>
          <span class="row-ico">${icon('download', 16)}</span>
          <span class="row-main"><span class="row-title">导出备份</span><span class="row-sub">JSON，包含账目、任务、专注记录</span></span>
          <span class="row-side">${icon('chevron', 14)}</span>
        </button>
        <button class="row" data-import>
          <span class="row-ico">${icon('upload', 16)}</span>
          <span class="row-main"><span class="row-title">恢复备份</span><span class="row-sub">会覆盖当前数据</span></span>
          <span class="row-side">${icon('chevron', 14)}</span>
        </button>
        <button class="row" data-csv>
          <span class="row-ico">${icon('chart', 16)}</span>
          <span class="row-main"><span class="row-title">导出账本 CSV</span><span class="row-sub">可以用 Excel 或 Numbers 打开</span></span>
          <span class="row-side">${icon('chevron', 14)}</span>
        </button>
        <button class="row" data-demo>
          <span class="row-ico">${icon('sparkles', 16)}</span>
          <span class="row-main"><span class="row-title">载入示例数据</span><span class="row-sub">先看看用起来是什么样</span></span>
          <span class="row-side">${icon('chevron', 14)}</span>
        </button>
        <button class="row" data-clear>
          <span class="row-ico" style="color:var(--clay);background:var(--clay-soft)">${icon('trash', 16)}</span>
          <span class="row-main"><span class="row-title" style="color:var(--clay)">清空全部数据</span><span class="row-sub">不可恢复，请先备份</span></span>
          <span class="row-side">${icon('chevron', 14)}</span>
        </button>
      </div>
    </section>

    <div class="section-label">设置</div>
    <section class="card" style="padding:4px 15px">
      <div class="list-rows">
        <button class="row" data-edit-budget>
          <span class="row-ico">${icon('wallet', 16)}</span>
          <span class="row-main"><span class="row-title">月度预算</span><span class="row-sub">${budget ? money(budget, { decimals: 0 }) : '未设置'}</span></span>
          <span class="row-side">${icon('chevron', 14)}</span>
        </button>
        <button class="row" data-theme>
          <span class="row-ico">${icon('moon', 16)}</span>
          <span class="row-main"><span class="row-title">外观</span><span class="row-sub">${themeLabel()}</span></span>
          <span class="row-side">${icon('chevron', 14)}</span>
        </button>
        <button class="row" data-notify>
          <span class="row-ico">${icon('bell', 16)}</span>
          <span class="row-main"><span class="row-title">系统通知</span><span class="row-sub">${notifyLabel()}</span></span>
          <span class="row-side">${icon('chevron', 14)}</span>
        </button>
        <button class="row" data-focus-setting>
          <span class="row-ico">${icon('timer', 16)}</span>
          <span class="row-main"><span class="row-title">专注时长</span><span class="row-sub">${db.data.settings.focusMin} 分钟 · 休息 ${db.data.settings.breakMin} 分钟</span></span>
          <span class="row-side">${icon('chevron', 14)}</span>
        </button>
        <button class="row" data-install-help>
          <span class="row-ico">${icon('lock', 16)}</span>
          <span class="row-main"><span class="row-title">${install ? '已安装到主屏幕' : '安装到主屏幕'}</span><span class="row-sub">${install ? '现在就是全屏 App 模式' : '用 Safari 打开后添加，体验和 App 一样'}</span></span>
          <span class="row-side">${icon('chevron', 14)}</span>
        </button>
      </div>
    </section>

    <button class="card" data-guide style="width:100%;text-align:left;display:flex;align-items:center;gap:11px">
      <span class="row-ico" style="color:var(--jade);background:var(--jade-soft)">${icon('clipboard', 17)}</span>
      <span style="flex:1">
        <span class="row-title" style="display:block">截图识别怎么用最顺</span>
        <span class="row-sub" style="display:block;color:var(--muted)">3 种方式 + 快捷指令自动记账</span>
      </span>
      ${icon('chevron', 15)}
    </button>

    <div class="about">
      <div class="brand-mark">页</div>
      一页 1.0 · 本地优先<br />
      没有账号、没有云端、没有广告<br />
      <span style="opacity:.7">数据在浏览器里，清理 Safari 数据会一起清掉，记得备份</span>
    </div>
  `;

  root.querySelectorAll('[data-backup]').forEach((b) => b.addEventListener('click', exportBackup));
  root.querySelector('[data-import]').addEventListener('click', importBackup);
  root.querySelector('[data-csv]').addEventListener('click', () => {
    if (!db.data.tx.length) {
      toast('还没有账目');
      return;
    }
    download(`一页账本-${dayKey(new Date())}.csv`, txCSV(), 'text/csv;charset=utf-8');
    toast('CSV 已导出');
  });
  root.querySelector('[data-demo]').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: '载入示例数据？',
      message: db.data.tx.length || db.data.tasks.length ? '这会清空你现在所有数据，换成一组示例。' : '会加入一组账单、任务和专注记录，方便先体验。',
      confirmText: '载入',
    });
    if (!ok) return;
    db.reset();
    seedDemo(new Date());
    toast('示例数据已就位');
    haptic(10);
    bus.refresh();
  });
  root.querySelector('[data-clear]').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: '清空全部数据？',
      message: '账目、任务、专注记录都会消失，无法恢复。建议先导出备份。',
      confirmText: '仍然清空',
      danger: true,
    });
    if (!ok) return;
    db.reset();
    toast('已清空');
    bus.refresh();
  });

  root.querySelectorAll('[data-edit-budget]').forEach((b) => b.addEventListener('click', openBudget));
  root.querySelector('[data-theme]').addEventListener('click', openTheme);
  root.querySelector('[data-notify]').addEventListener('click', requestNotify);
  root.querySelector('[data-focus-setting]').addEventListener('click', openFocusSettings);
  root.querySelectorAll('[data-install-help]').forEach((b) => b.addEventListener('click', openInstallGuide));
  root.querySelector('[data-guide]').addEventListener('click', openRecognitionGuide);
}

/* ---------------- 设置弹层 ---------------- */

function openBudget() {
  const current = db.data.settings.budgetCents || 0;
  openSheet({
    title: '月度预算',
    subtitle: '到月底看看有没有守住',
    body: `<div class="amount-wrap"><span class="cur">¥</span>
      <input class="amount-input" data-budget inputmode="decimal" value="${current ? (current / 100).toFixed(0) : ''}" placeholder="3000" />
    </div>
    <p style="text-align:center;font-size:11.5px;color:var(--muted);margin-top:4px">填 0 表示不设预算</p>`,
    foot: `<button class="btn" data-save>保存</button>`,
    onMount(sheet) {
      sheet.querySelector('[data-save]').addEventListener('click', () => {
        const v = parseFloat(sheet.querySelector('[data-budget]').value.replace(/[^\d.]/g, '')) || 0;
        db.setSetting('budgetCents', Math.round(v * 100));
        closeSheet();
        toast(v ? '预算已设置' : '已关闭预算');
        bus.refresh();
      });
    },
  });
}

function themeLabel() {
  const t = db.data.settings.theme;
  return t === 'light' ? '浅色' : t === 'dark' ? '深色' : '跟随系统';
}

function openTheme() {
  const current = db.data.settings.theme;
  openSheet({
    title: '外观',
    body: `<div class="segmented" data-theme-pick>
      ${[
        ['auto', '跟随系统'],
        ['light', '浅色'],
        ['dark', '深色'],
      ]
        .map(([v, l]) => `<button type="button" data-value="${v}" class="${current === v ? 'active' : ''}">${l}</button>`)
        .join('')}
    </div>
    <div class="tip-card">${icon('info', 14)}<span>深色模式在晚上更护眼；跟随系统会随 iPhone 的「深色模式」自动切换。</span></div>`,
    onMount(sheet) {
      sheet.querySelectorAll('[data-value]').forEach((b) =>
        b.addEventListener('click', () => {
          const v = b.dataset.value;
          db.setSetting('theme', v);
          bus.applyTheme?.(v);
          closeSheet();
          bus.refresh();
        })
      );
    },
  });
}

async function requestNotify() {
  if (!('Notification' in window)) {
    toast('这个浏览器不支持通知');
    return;
  }
  if (Notification.permission === 'granted') {
    toast('已开启，专注结束会提醒你');
    return;
  }
  if (Notification.permission === 'denied') {
    toast('被系统拒绝了：设置 › 通知 › 一页，手动打开');
    return;
  }
  try {
    const p = await Notification.requestPermission();
    toast(p === 'granted' ? '已开启' : '没有开启通知');
    bus.refresh();
  } catch {
    toast('没有开启通知');
  }
}

function notifyLabel() {
  if (!('Notification' in window)) return '此浏览器不支持';
  if (Notification.permission === 'granted') return '已开启';
  if (Notification.permission === 'denied') return '已拒绝 · 需去系统设置打开';
  return '未开启 · 点一下开启';
}

function openFocusSettings() {
  const s = db.data.settings;
  openSheet({
    title: '专注时长',
    body: `<div class="field"><label class="field-label">专注（分钟）</label>
      <input class="input" type="number" inputmode="numeric" min="5" max="120" data-f value="${s.focusMin}" /></div>
      <div class="field"><label class="field-label">休息（分钟）</label>
      <input class="input" type="number" inputmode="numeric" min="1" max="60" data-b value="${s.breakMin}" /></div>`,
    foot: `<button class="btn" data-save>保存</button>`,
    onMount(sheet) {
      sheet.querySelector('[data-save]').addEventListener('click', () => {
        db.setSetting('focusMin', Math.min(120, Math.max(5, +sheet.querySelector('[data-f]').value || 25)));
        db.setSetting('breakMin', Math.min(60, Math.max(1, +sheet.querySelector('[data-b]').value || 5)));
        closeSheet();
        toast('已保存');
        bus.refresh();
      });
    },
  });
}

/* ---------------- 数据 ---------------- */

function exportBackup() {
  const payload = backupPayload();
  download(`一页备份-${dayKey(new Date())}.json`, JSON.stringify(payload, null, 2), 'application/json');
  db.setSetting('lastBackupAt', new Date().toISOString());
  toast('备份已导出，存到「文件」里更稳');
  setTimeout(() => bus.refresh(), 350);
}

function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) {
      input.remove();
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const ok = await confirmDialog({
        title: '用这个备份覆盖？',
        message: '当前数据会被替换。建议先把现在这份也导出一次。',
        confirmText: '覆盖',
        danger: true,
      });
      if (!ok) return;
      db.replaceAll(data);
      toast('已恢复');
      haptic(10);
      bus.refresh();
    } catch (e) {
      console.warn(e);
      toast('文件读不出来，可能不是一页的备份');
    } finally {
      input.value = '';
      input.remove();
    }
  });
  input.click();
}

/* ---------------- 帮助 ---------------- */

function openInstallGuide() {
  const installed = isStandalone();
  openSheet({
    title: installed ? '已经装好了' : '装到 iPhone 主屏幕',
    subtitle: installed ? '现在就是全屏 App 模式' : '3 步，1 分钟',
    body: `
      ${
        installed
          ? `<div class="parse-banner"><span class="pb-icon">${icon('check', 17)}</span><div><b>你正在用安装版</b><span class="pb-sub">没有地址栏，启动更快，数据也在本机</span></div></div>`
          : `<ol style="padding-left:18px;margin:4px 0 12px;font-size:13px;line-height:1.9;color:var(--ink-2)">
              <li>用 <b>Safari</b> 打开这个网址（微信里打开不行）</li>
              <li>点底部的「分享」按钮</li>
              <li>往下滑，选「<b>添加到主屏幕</b>」→ 添加</li>
            </ol>
            <div class="tip-card">${icon('info', 14)}<span>装好后从桌面图标打开，就是全屏 App。Safari 的「无痕模式」不能用，需要普通标签页。</span></div>`
      }
      <div class="divider"></div>
      <p style="font-size:12px;color:var(--muted);line-height:1.7">
        为什么不是 App Store 的 App：个人自用不需要开发者账号和审核，网页版改起来也快。
        代价是系统级通知受限，所以重要的事建议「加入 iPhone 日历」。
      </p>
    `,
    foot: installed ? '' : `<button class="btn" data-copy>复制网址</button>`,
    onMount(sheet) {
      sheet.querySelector('[data-copy]')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(location.href);
          toast('网址已复制');
        } catch {
          toast('复制失败，手动选中地址栏吧');
        }
      });
    },
  });
}

function openRecognitionGuide() {
  openSheet({
    title: '截图识别怎么用',
    subtitle: '三种方式，从最快到最自动',
    body: `
      <div class="section-label" style="margin-top:0">① 最快：复制文字再粘贴</div>
      <p style="font-size:12.5px;line-height:1.7;color:var(--ink-2)">
        截图后打开「照片」，长按图里的金额或商户文字 → 拷贝 → 回到一页点「记一笔」→ 粘贴。
        iPhone 自带的识别又快又准，而且完全离线。
      </p>

      <div class="section-label">② 直接选图识别</div>
      <p style="font-size:12.5px;line-height:1.7;color:var(--ink-2)">
        「记一笔」→「选择图片」，在手机本地跑 OCR。首次要联网下载约 3MB 语言包，速度取决于机型。
      </p>

      <div class="section-label">③ 进阶：快捷指令（仅 Safari 标签页）</div>
      <p style="font-size:12.5px;line-height:1.7;color:var(--ink-2)">
        如果你把一页当普通网页用（没有添加到主屏幕），可以用快捷指令把「截图 → 识别 → 打开一页」串起来。
        注意：主屏幕 App 和 Safari 的本地数据是分开的，装了主屏幕版就老实用「复制 → 粘贴」。
      </p>
      <ol style="padding-left:18px;font-size:12.5px;line-height:1.85;color:var(--ink-2);margin:0">
        <li>打开「快捷指令」→ 新建</li>
        <li>添加操作「从图像中提取文本」</li>
        <li>在快捷指令设置里勾选「在分享表单中显示」，接收「图像」</li>
        <li>添加「Base64 编码」，换行选「无」</li>
        <li>添加「打开 URL」：<code style="font-size:10.5px;word-break:break-all">${escapeHtml(location.href.split('#')[0])}#import=编码结果</code></li>
        <li>命名为「记账」，从相册分享截图给它</li>
      </ol>
      <div class="tip-card">${icon('sparkles', 14)}<span>之后在相册里选中截图 → 分享 → 记账，Safari 会打开一页并填好金额、商户、分类。</span></div>

      <div class="section-label">小票 / 账单汇总</div>
      <p style="font-size:12.5px;line-height:1.7;color:var(--ink-2)">
        超市小票会优先取「合计/实付」；如果整页是「本月支出」这种汇总，会提示你确认，避免把一个月记成一笔。
      </p>
    `,
  });
}
