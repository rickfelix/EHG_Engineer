// SD-LEO-INFRA-FILING-TOOLS-ENFORCE-001 (FR-1, TS-1/TS-2/TS-3): the criticality gate must
// run before the EVA pre-check / dedup scans, and a 'route_later' verdict must return before
// the quick_fixes insert is ever reached.
//
// Static-pattern test (same convention as create-quick-fix-insert-order.test.js): the
// createQuickFix() function is not exported and constructs its own Supabase client from env
// inline, so a unit-level execution would need to mock the full chain. The behavioral verdict
// LOGIC itself is unit-tested directly in tests/unit/governance/criticality-verdict.test.js
// (the pure, exported resolveCriticalityVerdict/routeCriticalityLater this file calls); this
// test only proves create-quick-fix.js's own control flow obeys that verdict.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../scripts/create-quick-fix.js');
const code = fs.readFileSync(SRC, 'utf8');

const CRITICALITY_GATE_RE = /resolveCriticalityVerdict\s*\(/;
const SEVERITY_VERDICT_RE = /severity\s*=\s*severityVerdict\.severity;/;
const EVA_PRECHECK_RE = /EVA Pre-Check/;
const QF_INSERT_RE = /\.from\(\s*['"]quick_fixes['"]\s*\)\s*\r?\n?\s*\.insert\(/;
const ROUTE_LATER_RETURN_RE = /if\s*\(criticalityVerdict\.verdict\s*===\s*'route_later'\)\s*\{[\s\S]{0,300}?return\s*\{/;
const REFUSE_EXIT_RE = /if\s*\(criticalityVerdict\.verdict\s*===\s*'refuse'\)\s*\{[\s\S]{0,200}?process\.exit\(1\);/;

describe('SD-LEO-INFRA-FILING-TOOLS-ENFORCE-001 FR-1: criticality gate placement and control flow', () => {
  it('the criticality gate runs after severity normalization and before the EVA pre-check', () => {
    const severityM = code.match(SEVERITY_VERDICT_RE);
    const gateM = code.match(CRITICALITY_GATE_RE);
    const evaM = code.match(EVA_PRECHECK_RE);
    expect(severityM?.index).toBeGreaterThanOrEqual(0);
    expect(gateM?.index).toBeGreaterThanOrEqual(0);
    expect(evaM?.index).toBeGreaterThanOrEqual(0);
    expect(severityM.index).toBeLessThan(gateM.index);
    expect(gateM.index).toBeLessThan(evaM.index);
  });

  it('a route_later verdict returns before the quick_fixes insert is ever reached (TS-3)', () => {
    const routeLaterM = code.match(ROUTE_LATER_RETURN_RE);
    const insertM = code.match(QF_INSERT_RE);
    expect(routeLaterM?.index).toBeGreaterThanOrEqual(0);
    expect(insertM?.index).toBeGreaterThanOrEqual(0);
    expect(routeLaterM.index).toBeLessThan(insertM.index);
  });

  it('a refuse verdict exits non-zero before the quick_fixes insert is ever reached (TS-2)', () => {
    const refuseM = code.match(REFUSE_EXIT_RE);
    const insertM = code.match(QF_INSERT_RE);
    expect(refuseM?.index).toBeGreaterThanOrEqual(0);
    expect(refuseM.index).toBeLessThan(insertM.index);
  });

  it('the quick_fixes insert carries criticalityMetadata (file_critical stamp reaches the row)', () => {
    expect(code).toMatch(/metadata:\s*Object\.keys\(criticalityMetadata\)\.length\s*>\s*0\s*\?\s*criticalityMetadata\s*:\s*null/);
  });

  it('reads the exact literal flag_key "QF_CRITICALITY_GATE_ENFORCE" (a typo here would silently disable the gate forever, TESTING finding EXEC-TO-PLAN)', () => {
    expect(code).toMatch(/\.eq\('flag_key',\s*'QF_CRITICALITY_GATE_ENFORCE'\)/);
  });

  it('--criticality is NOT aliased to --reason/--force-claim-reason (a distinct flag)', () => {
    // The existing --reason alias line must not also claim --criticality.
    const reasonAliasM = code.match(/arg === '--force-claim-reason' \|\| arg === '--reason'/);
    expect(reasonAliasM).toBeTruthy();
    expect(code).not.toMatch(/arg === '--criticality'[\s\S]{0,5}\|\|[\s\S]{0,5}arg === '--reason'/);
    expect(code).toMatch(/arg === '--criticality'\)\s*\{/);
  });
});
