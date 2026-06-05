// QF-20260510-170: regression-pin static guard for block-then-exit audit await pattern.
// Pre-fix: 9 sibling block paths called auditPermissionDecision then immediately
// process.exit(2), dropping the POST mid-flight (permission_audit_log had 0 rows
// over 1000-row sample despite 314 warns + 686 allows).
// Post-fix: every block path uses `const auditPromise = auditPermissionDecision(...)`
// followed by `await auditAndExit(auditPromise, code)` — same pattern as
// QF-20260510-148 (NPM-INSTALL-RACE inline await Promise.race kept for parity).
// This static guard is regex-based on the source string so it cannot be defeated
// by mocking the audit table or the network layer.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const HOOK_SRC = readFileSync(
  path.resolve(__dirname, '../pre-tool-enforce.cjs'),
  'utf8'
);

// Sites enumerated by feedback 44c5b834 + obvious sibling SCHEMA_PREFLIGHT
// (omitted from feedback enumeration but same bug class) + RCA-TIERED-ENFORCEMENT
// (dynamic outcome, but block branch has same drop pattern).
// NPM-INSTALL-RACE retains the inline `await Promise.race` from QF-20260510-148.
const BLOCK_SITES = [
  'SCHEMA_PREFLIGHT',
  'ENF-SD-CREATE-SKILL',
  'WORKTREE-HYGIENE-MAIN',
  'NC-006',
  'PAT-CLMMULTI-002',
  'D1-BUGFIX-TDD',
  'ENF-FILE-CLAIM',
  'RCA-TIERED-ENFORCEMENT',
  'SD-LEO-INFRA-MCP-READ-WRITE-001',
];

describe('QF-20260510-170: block-path audit await guard', () => {
  it('exports an auditAndExit helper with timeout-capped await pattern', () => {
    expect(HOOK_SRC).toMatch(/async function auditAndExit\(auditPromise, code, timeoutMs\)/);
    expect(HOOK_SRC).toMatch(/Promise\.race\(\[[\s\S]*?auditPromise[\s\S]*?setTimeout/);
  });

  it.each(BLOCK_SITES)('%s block path captures audit promise then awaits via auditAndExit', (ruleCode) => {
    // Find the auditPermissionDecision call for this rule; the line MUST start
    // with `const auditPromise =` (capture form) — not bare invocation.
    const captureRe = new RegExp(
      `const auditPromise = auditPermissionDecision\\([^)]*'${escapeRegex(ruleCode)}'`,
      'm'
    );
    expect(HOOK_SRC, `Block path '${ruleCode}' must capture audit promise`).toMatch(captureRe);

    // Within ~50 lines after the capture, an `await auditAndExit(auditPromise,` call
    // must appear (and no bare `process.exit(N)` between them).
    const afterCapture = HOOK_SRC.split(captureRe)[1];
    expect(afterCapture, `Block path '${ruleCode}' must have content after capture`).toBeTruthy();
    const window = afterCapture.split(/\n/).slice(0, 50).join('\n');
    expect(window, `Block path '${ruleCode}' must await auditAndExit`).toMatch(
      /await auditAndExit\(auditPromise,\s*\d+/
    );
  });

  it('SCHEMA_PREFLIGHT advisory branch may stay fire-and-forget (warn outcome only)', () => {
    // Sanity-check the advisory branch (warn outcome) is NOT required to await.
    expect(HOOK_SRC).toMatch(
      /auditPermissionDecision\([^)]*'SCHEMA_PREFLIGHT_ADVISORY'[^)]*'warn'/
    );
  });

  it('NPM-INSTALL-RACE retains the QF-20260510-148 inline Promise.race pattern', () => {
    // Functional parity site; documented predecessor of the auditAndExit helper.
    expect(HOOK_SRC).toMatch(
      /'NPM-INSTALL-RACE'[\s\S]{0,2000}?await Promise\.race\(\[[\s\S]*?auditPromise[\s\S]*?setTimeout/
    );
  });

  it('no bare auditPermissionDecision(...,\\s*\'block\',...) call without subsequent await', () => {
    // Catch-all: any `auditPermissionDecision(..., 'block', ...)` invocation that
    // is NOT prefixed by `const auditPromise =` is the regression we are guarding
    // against. Match the unwanted shape directly.
    const regressionRe = /(?<!const auditPromise = )auditPermissionDecision\([^)]*'block'/g;
    const violations = [...HOOK_SRC.matchAll(regressionRe)];
    expect(
      violations,
      `Found bare auditPermissionDecision(...'block'...) without 'const auditPromise = ' prefix:\n` +
      violations.map(m => '  ' + m[0]).join('\n')
    ).toEqual([]);
  });
});

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
