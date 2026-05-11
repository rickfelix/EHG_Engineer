import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(__dirname, '..', 'scripts', 'session-check-concurrency.js');

function stripCommentsAndStrings(src) {
  let out = src.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
  out = out
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  out = out.replace(/(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g, '');
  return out;
}

describe('session-check-concurrency.js: Windows libuv-safe exit (QF-20260511-469)', () => {
  const src = readFileSync(SCRIPT_PATH, 'utf8');
  const code = stripCommentsAndStrings(src);

  it('has no process.exit(...) call statements in executable code', () => {
    const matches = code.match(/process\.exit\s*\(/g) || [];
    expect(matches).toEqual([]);
  });

  it('uses process.exitCode = 0 for the isolated path', () => {
    expect(code).toMatch(/process\.exitCode\s*=\s*0/);
  });

  it('uses process.exitCode = 1 for the contention path', () => {
    expect(code).toMatch(/process\.exitCode\s*=\s*1/);
  });

  it('uses process.exitCode = 2 for the error paths (missing creds, query error, catch)', () => {
    const twos = code.match(/process\.exitCode\s*=\s*2/g) || [];
    expect(twos.length).toBeGreaterThanOrEqual(3);
  });
});
