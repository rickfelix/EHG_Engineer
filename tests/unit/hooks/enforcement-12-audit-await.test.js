import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// QF-20260510-148: ENFORCEMENT 12 was dropping its permission_audit_log row
// because auditPermissionDecision was fire-and-forget and process.exit(2) ran
// before the POST round-trip completed. permission_audit_log all-time count for
// rule_code='NPM-INSTALL-RACE' was 0 despite the rule firing. Pin the fix here:
//   1. auditPermissionDecision returns the fetch promise (awaitable)
//   2. ENF-12 block path awaits the audit before process.exit(2)

const HOOK_PATH = resolve(process.cwd(), 'scripts/hooks/pre-tool-enforce.cjs');
const SRC = readFileSync(HOOK_PATH, 'utf8');

describe('pre-tool-enforce ENF-12 audit-await regression (QF-20260510-148)', () => {
  it('auditPermissionDecision returns the fetch promise (awaitable by callers)', () => {
    const fnStart = SRC.indexOf('function auditPermissionDecision(');
    expect(fnStart).toBeGreaterThan(-1);
    // Walk to closing brace at same depth
    let depth = 0, end = -1;
    for (let i = SRC.indexOf('{', fnStart); i < SRC.length; i++) {
      if (SRC[i] === '{') depth++;
      else if (SRC[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    expect(end).toBeGreaterThan(fnStart);
    const body = SRC.slice(fnStart, end);

    expect(body).toMatch(/return\s+fetch\s*\(/);
    expect(body).toMatch(/return\s+Promise\.resolve\(\)/);
  });

  // QF-20260719-120: ENF-12/12c now route through auditAndExit (same bounded
  // audit-await, PLUS drainUndiciPool before exit — raw exit(2) after the audit
  // fetch raced its async handle and tripped libuv's UV_HANDLE_CLOSING assertion).
  it('ENF-12 (NPM-INSTALL-RACE) block path awaits auditAndExit with a bounded timeout', () => {
    const ruleIdx = SRC.indexOf("'NPM-INSTALL-RACE'");
    expect(ruleIdx).toBeGreaterThan(-1);
    const window = SRC.slice(ruleIdx, ruleIdx + 1500);
    const m = window.match(/await\s+auditAndExit\s*\(\s*auditPromise\s*,\s*2\s*,\s*(\d+)\s*\)/);
    expect(m).toBeTruthy();
    const ms = parseInt(m[1], 10);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(5000);
  });

  it('auditAndExit awaits the audit with a bounded race, drains undici, then exits', () => {
    const fnStart = SRC.indexOf('async function auditAndExit(');
    expect(fnStart).toBeGreaterThan(-1);
    const body = SRC.slice(fnStart, SRC.indexOf('process.exit(code)', fnStart) + 20);
    expect(body).toMatch(/Promise\.race\s*\(/);
    expect(body).toMatch(/setTimeout\s*\(\s*resolve\s*,\s*ms\s*\)/);
    expect(body).toMatch(/await\s+drainUndiciPool\s*\(\s*\)/);
    // drain must come BEFORE the exit
    expect(body.indexOf('drainUndiciPool')).toBeLessThan(body.indexOf('process.exit(code)'));
  });

  // QF-20260719-120: the last un-drained exit paths — the fail-open main().catch and
  // the ALLOW-path exit — must drain the undici pool first. A crash here aborts the
  // PreToolUse hook, which Claude Code treats as non-blocking: enforcement silently
  // skipped.
  it('fail-open main().catch drains the undici pool before exiting', () => {
    const m = SRC.match(/main\(\)\.catch\(async \(\) => \{ await drainUndiciPool\(\); process\.exit\(0\); \}\)/);
    expect(m).toBeTruthy();
  });

  it('ALLOW-path final exit drains the undici pool after the pass-through audit', () => {
    const allowIdx = SRC.indexOf("'Tool call permitted by all enforcement rules'");
    expect(allowIdx).toBeGreaterThan(-1);
    // Match the statement sequence, not indexOf('process.exit(0)') — that string also
    // appears in the QF-20260509-199 comment between the audit and the exit.
    const window = SRC.slice(allowIdx, allowIdx + 1500);
    expect(window).toMatch(/await drainUndiciPool\(\);\s*\n\s*process\.exit\(0\);/);
  });
});
