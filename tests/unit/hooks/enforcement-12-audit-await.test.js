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

  it('ENF-12 (NPM-INSTALL-RACE) block path awaits the audit before process.exit(2)', () => {
    const ruleIdx = SRC.indexOf("'NPM-INSTALL-RACE'");
    expect(ruleIdx).toBeGreaterThan(-1);
    const exitIdx = SRC.indexOf('process.exit(2)', ruleIdx);
    expect(exitIdx).toBeGreaterThan(ruleIdx);
    const window = SRC.slice(ruleIdx, exitIdx);

    expect(window).toMatch(/\bawait\b/);
    expect(window).toMatch(/Promise\.race\s*\(/);
    expect(window).toMatch(/setTimeout\s*\(\s*resolve\s*,\s*\d+\s*\)/);
  });

  it('audit-await window in ENF-12 has a bounded timeout (never hangs hook longer than 5s)', () => {
    const ruleIdx = SRC.indexOf("'NPM-INSTALL-RACE'");
    const exitIdx = SRC.indexOf('process.exit(2)', ruleIdx);
    const window = SRC.slice(ruleIdx, exitIdx);
    const m = window.match(/setTimeout\s*\(\s*resolve\s*,\s*(\d+)\s*\)/);
    expect(m).toBeTruthy();
    const ms = parseInt(m[1], 10);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(5000);
  });
});
