/**
 * Seed-test for scripts/audit/migration-ledger-phantom-audit.mjs (QF-20260903-622).
 * SD-FDBK-INFRA-CONTROL-MERGE-WITHOUT-001's control-seed-test-lint gate: a control must
 * prove it can catch its own seeded defect, committed rather than an ad hoc manual check.
 *
 * KNOWN LIMITATION: this exercises undispositionedPhantoms() -- the pure suppression seam --
 * not the full main() flow (which connects to a live Supabase table and shells out to git for
 * classification; neither is fixture-trialable without either exposing real credentials to CI
 * or mutating repo state as a side effect of merely running). isGenuinePhantom()'s
 * git-dependent classification (tracked / deleted-on-HEAD / present-elsewhere) is exercised
 * indirectly by this fix's own PR description (live run against production, verified 21/21
 * known rows classified correctly) rather than a committed fixture.
 */
import { describe, it, expect } from 'vitest';
import { undispositionedPhantoms } from '../../../scripts/audit/migration-ledger-phantom-audit.mjs';

describe('undispositionedPhantoms — seed test (QF-20260903-622)', () => {
  const SEEDED_PHANTOM = {
    id: 'seed-defect-row-does-not-exist',
    migration_path: 'database/migrations/QF-20260903-622-seeded-defect.sql',
  };

  it('FIRES: a phantom row with no matching disposition entry is reported', () => {
    const result = undispositionedPhantoms([SEEDED_PHANTOM], {});
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(SEEDED_PHANTOM.id);
  });

  it('does not fire on a row that IS dispositioned', () => {
    const dispositions = {
      [SEEDED_PHANTOM.id]: { disposition: 'PHANTOM_LEDGER_ROW', reason: 'seed-test fixture' },
    };
    const result = undispositionedPhantoms([SEEDED_PHANTOM], dispositions);
    expect(result).toHaveLength(0);
  });

  it('a dispositions entry keyed by the WRONG id does not suppress the seeded row', () => {
    const result = undispositionedPhantoms([SEEDED_PHANTOM], { 'some-other-row-id': {} });
    expect(result).toHaveLength(1);
  });
});
