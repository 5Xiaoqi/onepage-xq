/* 检查所有 ES module 的 import 是否都能在目标文件里找到对应 export */
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('js');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
const src = new Map(files.map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));

const exportsOf = new Map();
for (const [f, code] of src) {
  const names = new Set();
  for (const m of code.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of code.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop().trim();
      if (n) names.add(n);
    }
  }
  exportsOf.set(f, names);
}

let bad = 0;
for (const [f, code] of src) {
  for (const m of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)['"]/g)) {
    const target = m[2];
    const exp = exportsOf.get(target);
    if (!exp) {
      console.log(`MISSING FILE ${f} -> ${target}`);
      bad++;
      continue;
    }
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      if (!exp.has(name)) {
        console.log(`MISSING EXPORT ${f}: { ${name} } from ${target}`);
        bad++;
      }
    }
  }
}

/* 检查 HTML 里的静态引用是否存在 */
const html = fs.readFileSync('index.html', 'utf8');
for (const m of html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g)) {
  if (!fs.existsSync(m[1])) {
    console.log(`MISSING ASSET ${m[1]}`);
    bad++;
  }
}

console.log(bad ? `\n${bad} problem(s)` : 'all imports/exports/assets look consistent');
process.exit(bad ? 1 : 0);
