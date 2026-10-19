/* 一页 · UI 基础设施：底部弹层、Toast、确认框、共享小部件 */

import { icon, escapeHtml } from './util.js';

/** 跨模块刷新/跳转，由 app.js 注入，避免循环依赖 */
export const bus = {
  refresh: () => {},
  go: () => {},
  openImport: () => {},
  openTask: () => {},
};

let openState = null;

export function isSheetOpen() {
  return !!openState;
}

export function openSheet({ title, subtitle = '', body = '', foot = '', onMount, onClose, className = '', dismissible = true }) {
  closeSheet(true);
  const root = document.getElementById('sheet-root');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop" data-sheet-close></div>
    <section class="sheet ${className}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="sheet-grab"></div>
      <div class="sheet-head">
        <div>
          <h2 class="sheet-title">${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="sheet-sub">${escapeHtml(subtitle)}</p>` : ''}
        </div>
        ${dismissible ? `<button class="sheet-close" data-sheet-close aria-label="关闭">${icon('x', 17)}</button>` : ''}
      </div>
      <div class="sheet-body">${body}</div>
      ${foot ? `<div class="sheet-actions">${foot}</div>` : ''}
    </section>`;
  root.appendChild(wrap);
  document.body.style.overflow = 'hidden';

  const sheet = wrap.querySelector('.sheet');
  const backdrop = wrap.querySelector('.sheet-backdrop');

  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    sheet.classList.add('open');
  });

  const escClose = (e) => {
    if (e.key === 'Escape') closeSheet();
  };

  wrap.querySelectorAll('[data-sheet-close]').forEach((el) => el.addEventListener('click', () => closeSheet()));
  document.addEventListener('keydown', escClose);

  openState = { wrap, onClose, escClose };
  onMount?.(sheet);
  return sheet;
}

export function closeSheet(immediate = false) {  if (!openState) return;
  const { wrap, onClose, escClose } = openState;
  document.removeEventListener('keydown', escClose);
  openState = null;
  document.body.style.overflow = '';
  onClose?.();
  const sheet = wrap.querySelector('.sheet');
  const backdrop = wrap.querySelector('.sheet-backdrop');
  sheet.classList.remove('open');
  backdrop.classList.remove('open');
  const done = () => wrap.remove();
  if (immediate) done();
  else setTimeout(done, 320);
}

/** 在已打开的弹层里换内容（用于「粘贴 → 核对」这类下一步） */
export function updateSheet({ title, subtitle, body = '', foot = '' }) {
  if (!openState) return;
  const sheet = openState.wrap.querySelector('.sheet');
  if (title != null) sheet.querySelector('.sheet-title').textContent = title;
  const subEl = sheet.querySelector('.sheet-sub');
  if (subtitle != null) {
    if (subEl) subEl.textContent = subtitle;
    else if (subtitle) {
      const p = document.createElement('p');
      p.className = 'sheet-sub';
      p.textContent = subtitle;
      sheet.querySelector('.sheet-head > div').appendChild(p);
    }
  }
  sheet.querySelector('.sheet-body').innerHTML = body;
  let actions = sheet.querySelector('.sheet-actions');
  if (foot) {
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'sheet-actions';
      sheet.appendChild(actions);
    }
    actions.innerHTML = foot;
  } else if (actions) {
    actions.remove();
  }
  sheet.scrollTop = 0;
}

export function toast(message, { kind = 'normal', duration = 2400 } = {}) {  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  if (kind === 'error') el.style.background = 'rgba(150,58,36,.95)';
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, duration);
}

export function confirmDialog({ title, message, confirmText = '确定', cancelText = '取消', danger = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-backdrop';
    wrap.innerHTML = `
      <div class="dialog" role="alertdialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <h3 class="dialog-title">${escapeHtml(title)}</h3>
        <p class="dialog-msg">${escapeHtml(message)}</p>
        <div class="dialog-actions">
          <button class="btn secondary" data-cancel>${escapeHtml(cancelText)}</button>
          <button class="btn ${danger ? 'danger' : ''}" data-ok>${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));

    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 220);
      resolve(v);
    };
    wrap.querySelector('[data-cancel]').addEventListener('click', () => finish(false));
    wrap.querySelector('[data-ok]').addEventListener('click', () => finish(true));
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) finish(false);
    });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        finish(false);
      }
    };
    document.addEventListener('keydown', onKey);
  });
}

export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* iOS 不支持，忽略 */
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function segmented(options, value, attrs = '') {
  return `<div class="segmented" ${attrs}>${options
    .map(
      (o) =>
        `<button type="button" data-value="${escapeHtml(o.value)}" class="${o.value === value ? 'active ' + (o.cls || '') : o.cls || ''}">${escapeHtml(o.label)}</button>`
    )
    .join('')}</div>`;
}

export function switchRow({ label, sub = '', checked = false, action }) {
  return `<button class="row" type="button" ${action ? `data-action="${action}"` : ''} style="width:100%">
    <span class="row-main"><span class="row-title">${escapeHtml(label)}</span>${sub ? `<span class="row-sub">${escapeHtml(sub)}</span>` : ''}</span>
    <span class="switch ${checked ? 'on' : ''}" aria-hidden="true"></span>
  </button>`;
}

export function statBlock(value, label) {
  return `<div class="stat"><b class="num">${value}</b><span>${escapeHtml(label)}</span></div>`;
}

export function emptyState({ iconName = 'leaf', title, text, action = '' }) {
  return `<div class="empty">
    <div class="empty-ico">${icon(iconName, 28)}</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${text}</p>
    ${action}
  </div>`;
}

export function tag(style, TASK_STYLES) {
  const s = TASK_STYLES[style] || TASK_STYLES.normal;
  return `<span class="tag" style="color:${s.color};background:${s.soft}">${s.label}</span>`;
}

export function debounce(fn, ms = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** 把 base64url 解码成文本（快捷指令传参用） */
export function decodeBase64Url(input) {
  try {
    let s = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}
