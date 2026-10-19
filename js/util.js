/* 一页 · 通用工具（日期 / 金额 / DOM / 图标） */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const uid = (prefix = 'id') =>
  prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export const pad2 = (n) => String(n).padStart(2, '0');

/* ---------------- 日期 ---------------- */

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMinutes(d, n) {
  return new Date(new Date(d).getTime() + n * 60000);
}

/** 本地日期键：YYYY-MM-DD */
export function dayKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}

export function monthKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}`;
}

export function startOfMonth(d = new Date()) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(d = new Date()) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const wd = x.getDay() === 0 ? 7 : x.getDay();
  return addDays(x, -(wd - 1));
}

/** 两个时刻相隔的自然日（不看时分） */
export function daysApart(a, b) {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(ms / 86400000);
}

export function sameDay(a, b) {
  return dayKey(a) === dayKey(b);
}

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

export function weekdayCN(d) {
  return WEEK_CN[new Date(d).getDay()];
}

/** 今天 / 明天 / 昨天 / 周一 / 10月19日 */
export function relDayLabel(d, now = new Date()) {
  if (!d) return '';
  const diff = daysApart(d, now);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === 2) return '后天';
  if (diff === -1) return '昨天';
  if (diff > 2 && diff < 7) return '周' + weekdayCN(d);
  if (diff < -1 && diff > -7) return '周' + weekdayCN(d);
  const x = new Date(d);
  const sameYear = x.getFullYear() === new Date(now).getFullYear();
  return sameYear ? `${x.getMonth() + 1}月${x.getDate()}日` : `${x.getFullYear()}年${x.getMonth() + 1}月${x.getDate()}日`;
}

export function fmtDateCN(d, { year = false } = {}) {
  if (!d) return '';
  const x = new Date(d);
  return (year ? `${x.getFullYear()}年` : '') + `${x.getMonth() + 1}月${x.getDate()}日`;
}

export function fmtClock(d) {
  if (!d) return '';
  const x = new Date(d);
  return `${pad2(x.getHours())}:${pad2(x.getMinutes())}`;
}

export function fmtDateTime(d) {
  if (!d) return '';
  return `${fmtDateCN(d)} ${fmtClock(d)}`;
}

/** 距离现在的人话描述 */
export function countdownLabel(due, now = new Date()) {
  if (!due) return '';
  const ms = new Date(due).getTime() - now.getTime();
  const abs = Math.abs(ms);
  const suffix = ms >= 0 ? '后' : '前';
  if (abs < 60 * 1000) return '现在';
  if (abs < 3600 * 1000) return `${Math.round(abs / 60000)} 分钟${suffix}`;
  if (abs < 86400 * 1000) return `${Math.round(abs / 3600000)} 小时${suffix}`;
  const days = Math.round(abs / 86400000);
  if (days <= 60) return `${days} 天${suffix}`;
  return fmtDateCN(due);
}

/** 生成 <input type="datetime-local"> 用的值 */
export function toLocalInput(d) {
  if (!d) return '';
  const x = new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}T${pad2(x.getHours())}:${pad2(x.getMinutes())}`;
}

/** 日/周键，用于习惯打卡 */
export function weekKey(d = new Date()) {
  const s = startOfWeek(d);
  return dayKey(s);
}

/* ---------------- 金额 ---------------- */

export function money(cents, { sign = false, decimals = 2 } = {}) {
  const n = (Number(cents) || 0) / 100;
  const neg = n < 0;
  const abs = Math.abs(n);
  const fixed = decimals === 0 ? Math.round(abs).toString() : abs.toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const withComma = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = dec && decimals > 0 ? `${withComma}.${dec}` : withComma;
  if (sign) return (neg ? '-' : '+') + '¥' + body;
  return (neg ? '-' : '') + '¥' + body;
}

export function yuanToCents(v) {
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function signMoney(cents, type) {
  const s = Number(cents) || 0;
  return type === 'income' ? '+' + money(s) : '-' + money(s);
}

/** 金额输入框用的字符串（不带符号） */
export function centsToInput(cents) {
  return (Number(cents || 0) / 100).toFixed(2).replace(/\.00$/, '');
}

/* ---------------- 杂项 ---------------- */

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function durationLabel(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} 小时 ${rest} 分` : `${h} 小时`;
}

export function download(filename, content, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 中文数字（0-99） */
const CN_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function cnNumber(s) {
  if (s === null || s === undefined || s === '') return null;
  const str = String(s).trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  if (str === '半') return 30;
  if (str === '一刻') return 15;
  if (str === '三刻') return 45;
  if (str.includes('十')) {
    const [a, b] = str.split('十');
    const tens = a ? CN_DIGIT[a] : 1;
    const ones = b ? CN_DIGIT[b] : 0;
    if (tens === undefined || ones === undefined) return null;
    return tens * 10 + ones;
  }
  if (str.length === 1 && str in CN_DIGIT) return CN_DIGIT[str];
  return null;
}

/** 粗略判断是否 iOS / 已安装 */
export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

/* ---------------- 图标 ---------------- */

const ICON_PATHS = {
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5v-9Z"/><path d="M3 9.5h18"/><path d="M16.5 14h2"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4.5l3 1.8"/><path d="M9 2h6"/>',
  chart: '<path d="M4 20V5"/><path d="M4 20h16"/><path d="M8.5 20v-6M13 20V8M17.5 20v-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M4 8h3l1.6-2.2h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.2" r="3.4"/>',
  clipboard: '<path d="M9 4.5h6v2.6H9z"/><path d="M9 4.5H7a1 1 0 0 0-1 1V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-2"/><path d="M9 11h6M9 15h4"/>',
  sparkles: '<path d="M12 3.2 13.7 8l4.8 1.7-4.8 1.7L12 16.2l-1.7-4.8L5.5 9.7 10.3 8 12 3.2Z"/><path d="M18.8 15.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.6V12l3 1.9"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4.5h10.5l-1.6 4 1.6 4H6"/>',
  repeat: '<path d="M17 3.2 20.4 6.6 17 10"/><path d="M3.6 11.2V9.6a3 3 0 0 1 3-3h13.4"/><path d="M7 20.8 3.6 17.4 7 14"/><path d="M20.4 12.8v1.6a3 3 0 0 1-3 3H3.6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7"/><path d="M6.5 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="M9.5 6.5 15 12l-5.5 5.5"/>',
  back: '<path d="M14.5 6.5 9 12l5.5 5.5"/>',
  flame: '<path d="M12 21.5c3.9 0 6.8-2.6 6.8-6.4 0-3-2-5-3.4-6.9-1.4-1.9-2.2-4.7-2.2-4.7s-1.5 2.9-1.5 5.3c-1-.5-1.5-1.9-1.5-1.9S7 9.7 7 14.3c0 4.2 2.2 7.2 5 7.2Z"/>',
  play: '<path d="M8.5 5.4 19 12 8.5 18.6V5.4Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.6" fill="currentColor" stroke="none"/>',
  bell: '<path d="M18 8.5a6 6 0 0 0-12 0c0 6.4-2.5 6.9-2.5 8.4h17c0-1.5-2.5-2-2.5-8.4Z"/><path d="M10 21h4"/>',
  settings: '<path d="M4 8h8M16 8h4M4 16h3M11 16h9"/><circle cx="14" cy="8" r="2"/><circle cx="9" cy="16" r="2"/>',
  download: '<path d="M12 3.5v11.5M7.5 11 12 15.5 16.5 11"/><path d="M4 20.5h16"/>',
  upload: '<path d="M12 20.5V9M7.5 13 12 8.5 16.5 13"/><path d="M4 3.5h16"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>',
  moon: '<path d="M20.5 14.8A8.6 8.6 0 0 1 9.2 3.5a8.6 8.6 0 1 0 11.3 11.3Z"/>',
  coffee: '<path d="M4 8.5h13v4.2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8.5Z"/><path d="M17 9.5h1.6a2.2 2.2 0 0 1 0 4.4H17"/><path d="M7.5 3v2.4M11.5 3v2.4M15.5 3v2.4"/>',
  leaf: '<path d="M20 4.2C10.5 4.2 4 9.2 4 16.1c0 2.2.9 3.9 2 3.9 7 0 14-6.1 14-15.8Z"/><path d="M4.4 20C8 16.4 12.2 12.4 16.4 10.2"/>',
  alert: '<path d="M12 3.8 21 19.4H3L12 3.8Z"/><path d="M12 9.4v4M12 16.6h.01"/>',
  check: '<path d="M5 12.8 9.4 17 19 6.6"/>',
  layers: '<path d="M12 3.2 20.6 8 12 12.8 3.4 8 12 3.2Z"/><path d="M3.4 12.4 12 17.2l8.6-4.8"/><path d="M3.4 16.4 12 21.2l8.6-4.8"/>',
  hourglass: '<path d="M7 3.2h10M7 20.8h10"/><path d="M8.2 3.2v3.4l3.8 3.2 3.8-3.2V3.2"/><path d="M8.2 20.8v-3.4l3.8-3.2 3.8 3.2v3.4"/>',
  bolt: '<path d="M13.4 2.2 4.8 13.8h6l-1.2 8 8.6-11.6h-6l1.2-8Z"/>',
  edit: '<path d="M4 20h4L20.2 7.8a1.6 1.6 0 0 0 0-2.3l-1.7-1.7a1.6 1.6 0 0 0-2.3 0L4 16v4Z"/><path d="M14.4 5.6l4 4"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><circle cx="8.6" cy="9.6" r="1.5"/><path d="M4 17.5 9.4 12l3.4 3.4 2.8-2.6 4.4 4.7"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.2M12 7.8h.01"/>',
  more: '<circle cx="6" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 1 1 7 0v2.5"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none"/>',
};

export function icon(name, size = 20, cls = '') {
  const body = ICON_PATHS[name] || ICON_PATHS.info;
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
