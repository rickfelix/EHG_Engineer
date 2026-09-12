/**
 * QF-20260912-125 — adam-quiet-tick.mjs never surfaced unpinnable ratification rows (rows
 * naming target contracts but with no derivable commit pin) as a standing backlog count;
 * "unmeasurable" was silently absent from every report rather than a counted population.
 *
 * checkRatificationRegressions() takes a live Supabase client and shells out to git, so this
 * asserts the STRUCTURAL invariant directly against the shipped source — the same style as
 * tests/unit/adam/adam-quiet-tick-hash-skip-unconditional-surfacing.test.js in this repo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TICK_SRC = readFileSync(join(__dirname, '../../../scripts/adam-quiet-tick.mjs'), 'utf8');
const STARTUP_SRC = readFileSync(join(__dirname, '../../../scripts/adam-startup-check.mjs'), 'utf8');

describe('adam-quiet-tick.mjs: unpinnable ratification rows are a standing backlog count', () => {
  it('pushes a row into contractCoverageUnpinnable only when it names contracts AND has no resolvable pin', () => {
    expect(TICK_SRC).toContain(
      'if (namedContracts.length > 0 && !(pin && pin.commit)) contractCoverageUnpinnable.push(row);'
    );
  });

  it('a row naming zero contracts is never counted (distinct from the unpinnable population)', () => {
    // The push condition requires namedContracts.length > 0 -- computed from
    // row.target_contracts, so a row with no named contracts never reaches the push.
    const idx = TICK_SRC.indexOf('const namedContracts = Array.isArray(row.target_contracts)');
    expect(idx).toBeGreaterThanOrEqual(0);
    const pushIdx = TICK_SRC.indexOf('contractCoverageUnpinnable.push(row)');
    expect(pushIdx).toBeGreaterThan(idx);
  });

  it('checkRatificationRegressions returns contractCoverageUnpinnableCount alongside the other counts', () => {
    expect(TICK_SRC).toContain('contractCoverageUnpinnableRows: contractCoverageUnpinnable,');
    expect(TICK_SRC).toContain('contractCoverageUnpinnableCount: contractCoverageUnpinnable.length,');
  });

  it('emits QUIET_TICK_RATIFICATION_CONTRACT_UNPINNABLE_BACKLOG only when the count is > 0', () => {
    expect(TICK_SRC).toContain('const unpinnableCount = regressedRatifications.contractCoverageUnpinnableCount || 0;');
    expect(TICK_SRC).toContain('if (unpinnableCount > 0) {');
    expect(TICK_SRC).toContain('QUIET_TICK_RATIFICATION_CONTRACT_UNPINNABLE_BACKLOG=adam count=${unpinnableCount}');
  });

  it('the new token is registered in adam-startup-check.mjs as INFORMATIONAL ONLY (deliberately absent from the NO-OP gate)', () => {
    expect(STARTUP_SRC).toContain(
      'QUIET_TICK_RATIFICATION_CONTRACT_UNPINNABLE_BACKLOG is INFORMATIONAL ONLY and is deliberately absent from the NO-OP gate above'
    );
  });
});
