/**
 * SD-LEO-INFRA-RETRO-PROMOTION-PATH-001 FR-4 (TS-6): replay a COMMITTED SNAPSHOT of real
 * retro_type=HANDOFF rows through the live classifyRetro() import. Deliberately a committed
 * snapshot, not a live DB query -- a live replay is self-invalidating (a regressed fix would
 * write rows that satisfy itself), and it keeps this test DB-free (only node:fs + the pure
 * guard module are imported).
 *
 * Generator: scripts/one-off/retro-promotion-path-001-generate-handoff-snapshot.mjs
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyRetro } from '../../scripts/modules/handoff/lib/retro-clobber-guard.js';

const snapshot = JSON.parse(
  readFileSync(new URL('../fixtures/retro-handoff-classification-snapshot.json', import.meta.url), 'utf8')
);

describe('classifyRetro replay against a live retro_type=HANDOFF snapshot (FR-1, TS-6)', () => {
  it('the snapshot is non-trivial (>=100 real rows, per the PRD acceptance criterion)', () => {
    expect(snapshot.rows.length).toBeGreaterThanOrEqual(100);
    expect(snapshot.live_total_handoff_count).toBeGreaterThan(snapshot.rows.length);
  });

  it('every sampled row classifies exactly as expected under the corrected logic', () => {
    const mismatches = snapshot.rows.filter(({ row, expected }) => {
      const actual = classifyRetro(row);
      return actual.safe !== expected.safe || actual.reason !== expected.reason;
    });
    expect(mismatches, `mismatched rows: ${JSON.stringify(mismatches).slice(0, 2000)}`).toEqual([]);
  });

  it('zero auto-generated rows refuse via rich_existing_content (the defect this SD fixes)', () => {
    const stillRefusing = snapshot.rows.filter(({ row }) => {
      const AUTO_GENERATED_TYPES = ['AUTO', 'AUTO_HOOK', 'NON_SD_MERGE', 'RETRO_SUB_AGENT', 'SUB_AGENT', 'system', 'non_interactive'];
      const isAuto = row.generated_by && AUTO_GENERATED_TYPES.includes(row.generated_by);
      const result = classifyRetro(row);
      return isAuto && !result.safe && result.reason === 'rich_existing_content';
    });
    expect(stillRefusing).toEqual([]);
    expect(snapshot.auto_generated_refused_count).toBe(0);
  });

  it('the manual-content refusal path is unaffected by this fix, verified via a LIVE classifyRetro call per row -- not the fixture\'s own precomputed `expected`/`reason_tally` fields', () => {
    // SD-LEO-INFRA-RETRO-PROMOTION-PATH-001 EXEC-phase TESTING finding F-7: the prior version of
    // this assertion compared two fields both precomputed by the fixture generator, never calling
    // the imported classifyRetro() -- it would have passed even against a broken/stubbed import.
    // This version derives everything from `row` (raw DB columns only) through the live import.
    let liveManualRefusals = 0;
    let livelyAutoRows = 0;
    const AUTO_GENERATED_TYPES = ['AUTO', 'AUTO_HOOK', 'NON_SD_MERGE', 'RETRO_SUB_AGENT', 'SUB_AGENT', 'system', 'non_interactive'];
    for (const { row } of snapshot.rows) {
      const result = classifyRetro(row);
      if (!result.safe && (result.reason === 'manual_retro' || result.reason === 'manual_retro_null_inferred')) {
        liveManualRefusals++;
      }
      if (row.generated_by && AUTO_GENERATED_TYPES.includes(row.generated_by)) livelyAutoRows++;
    }
    // The live sample contains at least one real manual specimen (the fix must not have swallowed it)...
    expect(liveManualRefusals).toBeGreaterThan(0);
    // ...and it must be strictly LESS than the total sample size, since the whole point of FR-1 is
    // that the (majority, auto-generated) remainder of the sample is NOT refused via this path.
    expect(liveManualRefusals).toBeLessThan(snapshot.rows.length);
    expect(livelyAutoRows).toBeGreaterThan(0);
  });
});
