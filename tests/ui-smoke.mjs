/* 无浏览器烟雾测试：用最小 DOM 桩执行四个页面的 render，捕获运行期错误 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

function makeEl(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    innerHTML: '',
    textContent: '',
    value: '',
    hidden: false,
    style: {},
    dataset: {},
    children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {},
    removeEventListener() {},
    appendChild(c) {
      this.children.push(c);
      return c;
    },
    remove() {},
    focus() {},
    click() {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    closest() {
      return null;
    },
    querySelector() {
      return makeEl();
    },
    querySelectorAll() {
      return [];
    },
    dispatchEvent() {},
  };
  return el;
}

globalThis.document = {
  readyState: 'complete',
  documentElement: makeEl('html'),
  body: makeEl('body'),
  head: makeEl('head'),
  createElement: (t) => makeEl(t),
  getElementById: () => makeEl(),
  querySelector: () => makeEl(),
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
};
globalThis.window = {
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  addEventListener() {},
  scrollTo() {},
  AudioContext: null,
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    userAgent: 'node',
    maxTouchPoints: 0,
    vibrate() {},
    clipboard: { writeText: async () => {}, readText: async () => '' },
    serviceWorker: { getRegistration: async () => null, controller: null },
  },
});
globalThis.Notification = class {
  static permission = 'default';
  static requestPermission = async () => 'default';
};
globalThis.matchMedia = window.matchMedia;
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.TextDecoder = TextDecoder;
globalThis.URL.createObjectURL = () => 'blob:x';
globalThis.URL.revokeObjectURL = () => {};

const { db, seedDemo } = await import('../js/store.js');
const { renderLedger } = await import('../js/view-ledger.js');
const { renderTasks } = await import('../js/view-tasks.js');
const { renderFocus } = await import('../js/view-focus.js');
const { renderMe } = await import('../js/view-me.js');
const { buildICS } = await import('../js/ics.js');

db.load();

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'param', 'track', 'wbr']);

function checkTags(html, name) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const [, close, tag, rest] = m;
    const t = tag.toLowerCase();
    if (VOID.has(t)) continue;
    if (close) {
      const last = stack.pop();
      if (last !== t) throw new Error(`${name}: 标签不匹配 </${t}>，栈顶是 <${last}>`);
    } else if (!/\/\s*$/.test(rest)) {
      stack.push(t);
    }
  }
  if (stack.length) throw new Error(`${name}: 未闭合标签 ${stack.join(' > ')}`);
}

function render(name, fn) {
  const root = makeEl('main');
  fn(root);
  assert.ok(root.innerHTML.length > 200, `${name}: HTML 太短`);
  assert.ok(!root.innerHTML.includes('undefined'), `${name}: 模板里有 undefined`);
  assert.ok(!root.innerHTML.includes('NaN'), `${name}: 模板里有 NaN`);
  checkTags(root.innerHTML, name);
  try {
    fs.mkdirSync('.shots', { recursive: true });
    fs.writeFileSync(`.shots/${name}.html`, root.innerHTML);
  } catch {
    /* 忽略 */
  }
  return root.innerHTML;
}

// 空数据
let html = render('ledger-empty', renderLedger);
assert.match(html, /本月支出/);
assert.match(html, /还没有账目/);
html = render('tasks-empty', renderTasks);
assert.match(html, /把脑子里的事说一句话/);
html = render('focus-empty', renderFocus);
assert.match(html, /把时间留出来/);
assert.match(html, /25:00/);
html = render('me-empty', renderMe);
assert.match(html, /本月概览/);
assert.match(html, /导出备份/);

// 示例数据
seedDemo(new Date(2026, 9, 19, 10, 0));
html = render('ledger-demo', renderLedger);
assert.match(html, /星巴克/);
assert.match(html, /3,?482|3,?000/);
html = render('tasks-demo', renderTasks);
assert.match(html, /季度报告/);
assert.match(html, /连续|习惯/);
html = render('focus-demo', renderFocus);
assert.match(html, /今日分钟/);
html = render('me-demo', renderMe);
assert.match(html, /钱花在哪|节奏/);

// 日历导出
const t = db.data.tasks.find((x) => x.style === 'project');
const { ics, count } = buildICS([t]);
assert.equal(count, 1);
assert.match(ics, /BEGIN:VCALENDAR/);
assert.match(ics, /BEGIN:VEVENT/);
assert.match(ics, /TRIGGER:-PT15M/);
assert.match(ics, /END:VCALENDAR/);
assert.ok(ics.includes('SUMMARY:' + t.title));

console.log('UI smoke ok: 4 views render with empty + demo data, ICS builds');
