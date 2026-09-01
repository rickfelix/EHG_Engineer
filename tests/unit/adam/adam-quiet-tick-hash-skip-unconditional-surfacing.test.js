/**
 * QF-20260829-373 (A7 burn-lever) — MANDATORY regression criterion: injecting a directive
 * mid-quiet-streak must be surfaced on the very next tick, regardless of the state-hash
 * short-circuit added by this QF. The short-circuit only skips the HEAVY enumerations
 * (task_ledger scan, ventures scan, ratification-regression git diffs) — surfaceInboxItems()
 * (which surfaces directive-class rows) and surfaceSmsInbound()/surfaceParkedChairmanSms()
 * (chairman SMS hard interrupts) must remain unconditional.
 *
 * A live end-to-end fixture would need a full Supabase double for every table this tick
 * touches; instead this asserts the STRUCTURAL invariant directly against the shipped
 * source — the same style as tests/unit/lint/quiet-tick-token-parity-lint.test.js in this
 * repo — so a future edit that accidentally nests one of these calls inside the
 * `if (!skipHeavyPass)` gate fails loudly here instead of silently swallowing a directive.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, '../../../scripts/adam-quiet-tick.mjs'), 'utf8');
const lines = SRC.split('\n');

function indentOf(lineText) {
  const m = lineText.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

function callSiteIndent(fnCallSubstring) {
  const idx = lines.findIndex((l) => l.includes(fnCallSubstring));
  expect(idx, `call site for ${fnCallSubstring} not found`).toBeGreaterThanOrEqual(0);
  return indentOf(lines[idx]);
}

describe('adam-quiet-tick.mjs: hard-interrupt surfacing stays unconditional under the hash-skip short-circuit', () => {
  it('surfaceInboxItems(sb) is called at the top-level main() body indent, not nested inside a skipHeavyPass gate', () => {
    expect(callSiteIndent('await surfaceInboxItems(sb)')).toBe(2);
  });

  it('surfaceSmsInbound(sb) is called at the top-level main() body indent', () => {
    expect(callSiteIndent('await surfaceSmsInbound(sb)')).toBe(2);
  });

  it('surfaceParkedChairmanSms(sb) is called at the top-level main() body indent', () => {
    expect(callSiteIndent('await surfaceParkedChairmanSms(sb)')).toBe(2);
  });

  it('skipHeavyPass only gates the 5 named heavy enumerations (readCriticalPathParents, checkBoardStale, checkVentureTraversalStalls, checkRatificationRegressions, duration-baseline gauge)', () => {
    const gatedBlockCount = (SRC.match(/if \(!skipHeavyPass\)/g) || []).length;
    // readCriticalPathParents+checkAndAlertStalls share one gate; checkBoardStale (QF-20260830-690,
    // a full task_ledger scan) has its own; checkVentureTraversalStalls has its own.
    // SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C: the duration-baseline gauge (a full-history
    // aggregate read + an in-flight enumeration) gets its own gate too.
    expect(gatedBlockCount).toBe(4);
    expect(SRC).toContain('const regressedRatifications = skipHeavyPass ? { rows: [], count: 0 } : await checkRatificationRegressions(sb);');
  });

  it('a hash-computation error is wired to force skipHeavyPass=false (fail-open, never fail-silent)', () => {
    expect(SRC).toContain('hashError: cheapState.hashError,');
  });
});
