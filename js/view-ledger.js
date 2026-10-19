/* 一页 · 记账 */

import {
  escapeHtml,
  money,
  centsToInput,
  yuanToCents,
  fmtClock,
  relDayLabel,
  toLocalInput,
  dayKey,
  icon,
} from './util.js';
import {
  db,
  summaryFor,
  txInMonth,
  dailyExpense,
} from './store.js';
import {
  parseReceipt,
  findDuplicate,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  ACCOUNTS,
  categoryById,
} from './money-parser.js';
import {
  bus,
  openSheet,
  closeSheet,
  updateSheet,
  toast,
  confirmDialog,
  emptyState,
  haptic,
} from './ui.js';
import { recognizeImage, hasOcrSupport } from './ocr.js';

let filter = 'all'; // all | expense | income
let monthOffset = 0;

/* ---------------- 首页 ---------------- */

export function renderLedger(root) {
  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const s = summaryFor(viewDate);
  const all = txInMonth(viewDate);
  const list = all.filter((t) => (filter === 'all' ? true : t.type === filter));
  const sparkAnchor = monthOffset === 0 ? now : new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0, 12, 0, 0);
  const days = dailyExpense(7, sparkAnchor);
  const budget = db.data.settings.budgetCents || 0;
  const pct = budget ? Math.round((s.expense / budget) * 100) : 0;
  const maxDay = Math.max(...days.map((d) => d.cents), 1);

  const groups = new Map();
  for (const t of list) {
    const k = dayKey(t.occurredAt);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }

  const amount = (s.expense / 100).toFixed(2).split('.');
  const avg = all.length ? Math.round(s.expense / Math.max(1, new Set(all.map((t) => dayKey(t.occurredAt))).size)) : 0;
  const monthLabel = `${viewDate.getMonth() + 1} 月`;

  root.innerHTML = `
    <header class="page-head">
      <div>
        <p class="eyebrow">${viewDate.getFullYear()}年${viewDate.getMonth() + 1}月 · 记账</p>
        <h1 class="page-title">记账</h1>
        <p class="page-sub">${viewDate.getMonth() + 1} 月 ${all.length} 笔${all.length ? ` · 日均 ${money(avg, { decimals: 0 })}` : ''}</p>
      </div>
      <button class="icon-btn jade" data-act="import" aria-label="截图记账">${icon('camera', 19)}</button>
    </header>

    <section class="hero">
      <div class="hero-top">
        <span class="hero-label">${monthOffset === 0 ? '本月支出' : '当月支出'}</span>
        <span class="hero-month">
          <button data-month="-1" aria-label="上个月">${icon('back', 13)}</button>
          <b>${monthLabel}</b>
          <button data-month="1" aria-label="下个月" ${monthOffset >= 0 ? 'disabled' : ''}>${icon('chevron', 13)}</button>
        </span>
      </div>
      <div class="hero-amount"><span class="cur">¥</span>${amount[0]}<span class="dec">.${amount[1]}</span></div>
      <div class="hero-foot">
        <div>收入<b>${money(s.income)}</b></div>
        <div>结余<b>${money(s.net)}</b></div>
      </div>
      ${
        budget
          ? `<div class="budget">
              <div class="budget-line">
                <span>预算 ${money(budget)}</span>
                <span>${pct > 100 ? `已超 ${money(s.expense - budget)}` : `还剩 ${money(budget - s.expense)}`}</span>
              </div>
              <div class="budget-bar ${pct > 100 ? 'over' : ''}"><i style="width:${Math.min(100, pct)}%"></i></div>
            </div>`
          : ''
      }
      <div class="hero-spark">
        ${days
          .map((d, i) => {
            const h = d.cents ? Math.max(12, Math.round((d.cents / maxDay) * 100)) : 6;
            return `<div class="bar ${i === days.length - 1 && monthOffset === 0 ? 'on' : ''}"><i style="height:${h}%"></i><span>${'日一二三四五六'[d.date.getDay()]}</span></div>`;
          })
          .join('')}
      </div>
    </section>

    <div class="chips">
      ${[
        ['all', '全部'],
        ['expense', '支出'],
        ['income', '收入'],
      ]
        .map(([v, label]) => `<button class="chip ${filter === v ? 'active' : ''}" data-filter="${v}">${label}</button>`)
        .join('')}
    </div>

    <div id="tx-groups">
      ${
        list.length
          ? [...groups.entries()].map(([key, items]) => renderDayGroup(key, items)).join('')
          : emptyState({
              iconName: 'camera',
              title: all.length ? '这个筛选下没有账目' : monthOffset < 0 ? '这个月没有账目' : '还没有账目',
              text: all.length
                ? '换个筛选看看，或者再记一笔。'
                : monthOffset < 0
                  ? '往前翻翻，或者回到本月记一笔。'
                  : '把微信、支付宝的支付截图发进来，自动识别金额、商户和分类。',
              action: `<button class="btn" data-act="import">${icon('camera', 16)} 截图记一笔</button>`,
            })
      }
    </div>

    <button class="fab" data-act="import" aria-label="记一笔">${icon('plus', 24)}</button>
  `;

  root.querySelectorAll('[data-act="import"]').forEach((b) => b.addEventListener('click', () => openImportSheet()));
  root.querySelectorAll('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      filter = b.dataset.filter;
      renderLedger(root);
    })
  );
  root.querySelectorAll('[data-month]').forEach((b) =>
    b.addEventListener('click', () => {
      const next = monthOffset + Number(b.dataset.month);
      if (next > 0) return;
      monthOffset = next;
      renderLedger(root);
    })
  );
  root.querySelectorAll('[data-tx]').forEach((b) =>
    b.addEventListener('click', () => openTxForm({ tx: db.data.tx.find((t) => t.id === b.dataset.tx) }))
  );
}

function renderDayGroup(key, items) {
  const date = new Date(key + 'T12:00:00');
  const net = items.reduce((s, t) => s + (t.type === 'income' ? t.amountCents : -t.amountCents), 0);
  const label = relDayLabel(date);
  const dayText = `${label} · ${date.getMonth() + 1}月${date.getDate()}日`;
  return `
    <div class="day-head"><span>${dayText}</span><span class="day-total">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</span></div>
    <div class="list-card fade-list">
      ${items
        .map((t) => {
          const cat = categoryById(t.category);
          const title = t.merchant || cat.name;
          const meta = [cat.name, t.account, fmtClock(t.occurredAt), t.accountDetail].filter(Boolean).join(' · ');
          return `<button class="tx-row" data-tx="${t.id}">
            <span class="cat-badge" style="background:${cat.color}18;color:${cat.color}">${cat.emoji}</span>
            <span class="tx-main">
              <span class="tx-title">${escapeHtml(title)}</span>
              <span class="tx-meta">${escapeHtml(meta)}${t.note ? ' · ' + escapeHtml(t.note) : ''}</span>
            </span>
            <span class="tx-amt ${t.type === 'income' ? 'income' : ''}">${t.type === 'income' ? '+' : '−'}${money(t.amountCents)}</span>
          </button>`;
        })
        .join('')}
    </div>`;
}

/* ---------------- 记一笔 / 编辑 ---------------- */

export function openTxForm({ tx = null, parsed = null, rawText = '', showBanner = null } = {}) {
  const opts = { tx, parsed, rawText, showBanner: showBanner ?? !!parsed };
  const content = buildTxSheet(opts);
  openSheet({
    ...content,
    onMount(sheet) {
      attachTxSheet(sheet, opts);
    },
  });
}

function buildTxSheet({ tx = null, parsed = null, rawText = '', showBanner = false } = {}) {
  const isEdit = !!tx;
  const draft = tx || parsed || {};
  const type = draft.type || 'expense';
  return {
    title: isEdit ? '编辑账目' : '核对一下',
    subtitle: isEdit ? '改完记得保存' : '识别结果可以直接改',
    body: txFormHTML({ ...draft, type }, { showBanner, rawText }),
    foot: `<button class="btn" data-save>${isEdit ? '保存修改' : '保存这笔'}</button>
      ${isEdit ? '<button class="btn secondary" data-delete style="margin-top:8px">删除这笔</button>' : ''}`,
  };
}

/** 在已打开的弹层里把「导入」换成「核对表单」 */
function showTxFormInPlace(sheet, opts) {
  const content = buildTxSheet(opts);
  updateSheet(content);
  attachTxSheet(sheet, opts);
}

function attachTxSheet(sheet, { tx = null, parsed = null, rawText = '' } = {}) {
  const isEdit = !!tx;
  const draft = tx || parsed || {};
  bindTxForm(sheet, { ...draft, type: draft.type || 'expense' });

  sheet.querySelector('[data-save]')?.addEventListener('click', async () => {
    const data = readTxForm(sheet);
    if (!data) return;
    data.source = draft.source || (isEdit ? tx.source : 'manual');
    const dup = findDuplicate(data, db.data.tx.filter((t) => t.id !== tx?.id));
    if (dup) {
      const ok = await confirmDialog({
        title: '可能重复了',
        message: `已经有一笔 ${money(dup.amountCents)} · ${dup.merchant || '未填商户'}，确定还要再记一笔吗？`,
        confirmText: '仍然保存',
      });
      if (!ok) return;
    }
    if (isEdit) db.updateTx(tx.id, data);
    else {
      db.addTx(data);
      monthOffset = 0;
    }
    closeSheet();
    toast(isEdit ? '已更新' : '记好了');
    haptic(12);
    bus.refresh();
  });

  sheet.querySelector('[data-delete]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: '删除这笔账？',
      message: '删掉之后不能恢复，但不会影响其他数据。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    db.deleteTx(tx.id);
    closeSheet();
    toast('已删除');
    bus.refresh();
  });
}

function txFormHTML(tx, { showBanner = false, rawText = '' } = {}) {
  const type = tx.type || 'expense';
  const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const catId = tx.category || cats[cats.length - 1].id;
  const cat = categoryById(catId);

  return `
    ${showBanner ? `<div class="parse-banner">
      <span class="pb-icon">${icon('check', 17)}</span>
      <div><b>已识别 ${tx.confidence || 0}%</b><span class="pb-sub">${cat.emoji} ${cat.name} · ${tx.merchant ? escapeHtml(tx.merchant) : '商户待补'}</span></div>
    </div>` : ''}

    ${(tx.warnings || []).length ? `<div class="warnings">${tx.warnings.map((w) => `<div class="warning">${icon('alert', 13)}<span>${escapeHtml(w)}</span></div>`).join('')}</div>` : ''}

    <div class="field">
      <div class="segmented" data-type-seg>
        <button type="button" data-type="expense" class="${type === 'expense' ? 'active' : ''}">支出</button>
        <button type="button" data-type="income" class="${type === 'income' ? 'active income' : ''}">收入</button>
      </div>
    </div>

    <div class="amount-wrap">
      <span class="cur">¥</span>
      <input class="amount-input" data-amount inputmode="decimal" enterkeyhint="done" placeholder="0.00" value="${tx.amountCents ? centsToInput(tx.amountCents) : ''}" aria-label="金额">
    </div>

    <div class="field">
      <label class="field-label">商户 / 说明</label>
      <input class="input" data-merchant value="${escapeHtml(tx.merchant || '')}" placeholder="例如：星巴克、房租、工资" />
    </div>

    <div class="field">
      <label class="field-label">分类 <span style="font-weight:500">${cat.emoji}</span></label>
      <div class="cat-grid" data-cats>
        ${cats
          .map(
            (c) => `<button type="button" class="cat-opt ${c.id === catId ? 'active' : ''}" data-cat="${c.id}">
              <span class="emoji">${c.emoji}</span><span>${c.name}</span></button>`
          )
          .join('')}
      </div>
    </div>

    <div class="field">
      <label class="field-label">账户</label>
      <select class="select" data-account>
        ${ACCOUNTS.map((a) => `<option value="${a}" ${a === (tx.account || '其他') ? 'selected' : ''}>${a}${
          a === (tx.account || '') && tx.accountDetail ? ' · ' + escapeHtml(tx.accountDetail) : ''
        }</option>`).join('')}
      </select>
    </div>

    <div class="field">
      <label class="field-label">时间</label>
      <input class="input" type="datetime-local" data-time value="${toLocalInput(tx.occurredAt || new Date())}" />
    </div>

    <div class="field">
      <label class="field-label">备注 <span style="font-weight:500">可选</span></label>
      <input class="input" data-note value="${escapeHtml(tx.note || '')}" placeholder="和谁、为什么" />
    </div>

    ${
      rawText
        ? `<details class="tip-card" style="display:block;cursor:pointer"><summary style="font-weight:650;color:var(--ink-2)">查看识别原文</summary>
            <div style="white-space:pre-wrap;margin-top:6px;font-size:10.5px;line-height:1.55;max-height:140px;overflow:auto">${escapeHtml(rawText)}</div>
          </details>`
        : ''
    }
  `.trim();
}

function bindTxForm(sheet, tx) {
  let type = tx.type || 'expense';
  const catsWrap = sheet.querySelector('[data-cats]');
  const seg = sheet.querySelector('[data-type-seg]');

  const paintCats = () => {
    const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const active = cats.some((c) => c.id === tx.category) ? tx.category : cats[cats.length - 1].id;
    catsWrap.innerHTML = cats
      .map(
        (c) => `<button type="button" class="cat-opt ${c.id === active ? 'active' : ''}" data-cat="${c.id}">
          <span class="emoji">${c.emoji}</span><span>${c.name}</span></button>`
      )
      .join('');
    catsWrap.querySelectorAll('[data-cat]').forEach((b) =>
      b.addEventListener('click', () => {
        catsWrap.querySelectorAll('.cat-opt').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      })
    );
  };

  seg.querySelectorAll('[data-type]').forEach((b) =>
    b.addEventListener('click', () => {
      type = b.dataset.type;
      seg.querySelectorAll('button').forEach((x) => {
        x.classList.toggle('active', x.dataset.type === type);
        x.classList.toggle('income', x.dataset.type === 'income' && x.classList.contains('active'));
      });
      paintCats();
    })
  );

  paintCats();
}

function readTxForm(sheet) {
  const amountCents = yuanToCents(sheet.querySelector('[data-amount]').value);
  if (!amountCents) {
    toast('先填一个金额');
    sheet.querySelector('[data-amount]')?.focus();
    return null;
  }
  const type = sheet.querySelector('[data-type-seg] .active')?.dataset.type || 'expense';
  const catBtn = sheet.querySelector('[data-cats] .cat-opt.active');
  const timeVal = sheet.querySelector('[data-time]').value;
  let occurred = timeVal ? new Date(timeVal) : new Date();
  if (isNaN(occurred.getTime())) occurred = new Date();
  return {
    type,
    amountCents,
    merchant: sheet.querySelector('[data-merchant]').value.trim(),
    category: catBtn?.dataset.cat || (type === 'income' ? 'other_income' : 'other'),
    account: sheet.querySelector('[data-account]').value,
    accountDetail: '',
    occurredAt: occurred.toISOString(),
    note: sheet.querySelector('[data-note]').value.trim(),
    source: 'manual',
  };
}

/* ---------------- 截图导入 ---------------- */

export function openImportSheet({ text = '', mode = 'text' } = {}) {
  const body = `
    <div class="method-tabs" data-methods>
      <button data-mode="text" class="active">${icon('clipboard', 14)} 粘贴文字</button>
      <button data-mode="image">${icon('image', 14)} 选择图片</button>
      <button data-mode="manual">${icon('edit', 14)} 手动</button>
    </div>

    <div data-panel="text">
      <textarea class="textarea" data-text placeholder="把截图里识别出来的文字粘贴到这里，比如：&#10;微信支付 支付成功 ¥86.50&#10;收款方 星巴克咖啡&#10;支付时间 2026年10月19日 14:32">${escapeHtml(text)}</textarea>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn secondary" data-paste>从剪贴板粘贴</button>
        <button class="btn" data-parse>识别</button>
      </div>
      <div class="tip-card">${icon('info', 14)}<span><b>最快的方式：</b>截图后在相册里长按文字 → 拷贝 → 回到这里粘贴。用的是 iPhone 自带识别，准确率和速度都比图片 OCR 好。</span></div>
    </div>

    <div data-panel="image" hidden>
      <label class="dropzone" for="ocr-file">
        ${icon('camera', 26)}
        <div><b style="color:var(--ink-2);font-size:12.5px">选一张支付截图</b></div>
        <small>首次使用需联网下载中文识别包（约 3MB）</small>
      </label>
      <input id="ocr-file" type="file" accept="image/*" hidden />
      <div data-ocr-status class="ocr-progress" hidden>
        <span data-ocr-label>准备中…</span>
        <div class="bar"><i style="width:0%"></i></div>
      </div>
      <div class="tip-card">${icon('info', 14)}<span>图片识别在手机本地完成，不会上传。识别速度取决于机型，通常 5–15 秒。</span></div>
    </div>

    <div data-panel="manual" hidden>
      <p style="font-size:12.5px;color:var(--muted);line-height:1.65;margin-bottom:14px">不经过识别，直接填金额和分类。</p>
      <button class="btn" data-manual>手动记一笔</button>
    </div>
  `;

  openSheet({
    title: '记一笔',
    subtitle: '截图里的字，直接变成账目',
    body,
    onMount(sheet) {
      const textarea = sheet.querySelector('[data-text]');
      const statusEl = sheet.querySelector('[data-ocr-status]');
      const labelEl = sheet.querySelector('[data-ocr-label]');
      const barEl = statusEl.querySelector('.bar i');
      const panels = {};
      sheet.querySelectorAll('[data-panel]').forEach((p) => (panels[p.dataset.panel] = p));

      const setMode = (m) => {
        sheet.querySelectorAll('[data-methods] button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
        Object.entries(panels).forEach(([k, p]) => (p.hidden = k !== m));
        if (m === 'text') setTimeout(() => textarea.focus(), 120);
      };
      sheet.querySelectorAll('[data-methods] button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

      const goParse = (raw, source = 'paste') => {
        const input = String(raw || '').trim();
        if (!input) {
          toast('先粘贴或识别一段文字');
          return;
        }
        const parsed = parseReceipt(input);
        parsed.source = source;
        showTxFormInPlace(sheet, { parsed, rawText: input });
      };

      sheet.querySelector('[data-parse]').addEventListener('click', () => goParse(textarea.value));
      sheet.querySelector('[data-paste]').addEventListener('click', async () => {
        try {
          const t = await navigator.clipboard.readText();
          if (!t) {
            toast('剪贴板是空的');
            return;
          }
          textarea.value = t;
          goParse(t);
        } catch {
          toast('读不到剪贴板，请手动长按粘贴');
          textarea.focus();
        }
      });
      sheet.querySelector('[data-manual]').addEventListener('click', () => {
        showTxFormInPlace(sheet, {
          parsed: { type: 'expense', amountCents: 0, occurredAt: new Date().toISOString() },
          showBanner: false,
        });
      });

      const fileInput = sheet.querySelector('#ocr-file');
      fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        if (!hasOcrSupport()) {
          toast('这个浏览器不支持图片识别，请用粘贴文字');
          setMode('text');
          return;
        }
        statusEl.hidden = false;
        barEl.style.width = '2%';
        labelEl.textContent = '准备中…';
        try {
          const text = await recognizeImage(file, ({ label, progress }) => {
            labelEl.textContent = label;
            barEl.style.width = `${Math.max(2, Math.round(progress * 100))}%`;
          });
          statusEl.hidden = true;
          if (!text) {
            toast('图里没识别到字，换一张或改用粘贴');
            return;
          }
          textarea.value = text;
          toast('识别完成，核对一下');
          goParse(text, 'ocr');
        } catch (err) {
          console.warn(err);
          statusEl.hidden = true;
          toast(
            String(err.message || '').includes('识别库')
              ? '识别库没加载出来，请检查网络，或改用「粘贴文字」'
              : '识别失败，改用「粘贴文字」更稳'
          );
        } finally {
          fileInput.value = '';
        }
      });

      // 拖拽图片（桌面调试用）
      ['dragover', 'drop'].forEach((evt) =>
        panels.image.addEventListener(evt, (e) => {
          e.preventDefault();
          if (evt !== 'drop') return;
          const f = e.dataTransfer?.files?.[0];
          if (f) {
            const dt = new DataTransfer();
            dt.items.add(f);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change'));
          }
        })
      );

      if (mode === 'image') setMode('image');
      else if (mode === 'manual') setMode('manual');

      if (text && text.trim()) {
        setTimeout(() => goParse(text, 'paste'), 180);
      }
    },
  });
}
