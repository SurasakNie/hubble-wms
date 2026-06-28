// Parse-gate: runs `node --check` on every JS module so a syntax error can
// never reach GitHub Pages (this app has no build step / bundler to catch it).
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

const files = walk('js');
let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    console.error(`PARSE FAIL: ${f}\n${err.stderr?.toString() || err.message}`);
  }
}

if (failed) {
  console.error(`\n✗ ${failed}/${files.length} file(s) failed to parse.`);
  process.exit(1);
}
console.log(`✓ All ${files.length} JS files parse clean.`);
