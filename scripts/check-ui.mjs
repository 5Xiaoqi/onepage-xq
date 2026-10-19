/* 检查：模板里用到的 class 是否有样式、icon 名称是否存在 */
import fs from 'node:fs';

const css = fs.readFileSync('assets/app.css', 'utf8');
const files = fs.readdirSync('js').filter((f) => f.endsWith('.js'));
const js = files.map((f) => fs.readFileSync('js/' + f, 'utf8')).join('\n');

const classes = new Set();
for (const m of js.matchAll(/class="([^"]+)"/g)) {
  for (const tok of m[1].split(/\s+/)) {
    if (tok && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(tok)) classes.add(tok);
  }
}

const missing = [...classes].filter((c) => !new RegExp('\\.' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])').test(css));
console.log('classes used:', classes.size);
console.log('missing in css:', missing.length ? missing.join(', ') : 'none');

const iconDefs = fs.readFileSync('js/util.js', 'utf8');
const defined = new Set([...iconDefs.matchAll(/^\s{2}([a-z-]+):\s*'/gm)].map((m) => m[1]));
const used = new Set([...js.matchAll(/\bicon\('([a-z-]+)'/g)].map((m) => m[1]));
const missingIcons = [...used].filter((n) => !defined.has(n));
console.log('icons used:', used.size, '| missing:', missingIcons.length ? missingIcons.join(', ') : 'none');
