// SD-LEO-INFRA-CHAIRMAN-APPLY-FLAG-001
// CHAIRMAN_APPLY_VERIFICATION — the gate that makes metadata.requires_chairman_apply mean
// something. Before this gate, the flag's only functional consumer made a drift detector
// QUIETER, and this executor could not see the flag at all: a chairman-gated SD parked at
// pending_approval/LEAD_FINAL was one adopt-and-auto-chain away from being marked completed
// with its production migration never applied.
//
// Every case below fails against the pre-change code, where no such gate existed.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const classifyMigrationApplyState = vi.fn();
vi.mock(
  '../../scripts/modules/handoff/executors/lead-final-approval/chairman-apply-state.js',
  () => ({ classifyMigrationApplyState: (...a) => classifyMigrationApplyState(...a) })
);

const { createChairmanApplyVerificationGate } = await import(
  '../../scripts/modules/handoff/executors/lead-final-approval/gates.js'
);

const gate = () => createChairmanApplyVerificationGate();
const sdWith = (metadata) => ({ sd: { sd_key: 'SD-TEST-001', metadata } });

beforeEach(() => classifyMigrationApplyState.mockReset());

describe('TS-3: an SD without the flag is completely unaffected', () => {
  it('passes as not-applicable and never consults the classifier', async () => {
    const r = await gate().validator(sdWith({}));
    expect(r.passed).toBe(true);
    expect(r.details.applicable).toBe(false);
    // The regression that matters: unflagged SDs must not gain a new dependency or failure mode.
    expect(classifyMigrationApplyState).not.toHaveBeenCalled();
  });

  it('treats a non-true flag value as not applicable', async () => {
    for (const v of [false, 'true', 1, null, undefined]) {
      const r = await gate().validator(sdWith({ requires_chairman_apply: v }));
      expect(r.passed).toBe(true);
      expect(r.details.applicable).toBe(false);
    }
  });
});

describe('TS-1: a flagged SD whose migration is NOT applied is blocked', () => {
  it('blocks and names the migration file and its status', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [
        { file: '20260101_SD-TEST-001_add_thing.sql', status: 'NOT_APPLIED', missing: ['table:thing'] },
        { file: '20260102_unrelated.sql', status: 'APPLIED' }
      ],
      error: null
    });

    const r = await gate().validator(sdWith({
      requires_chairman_apply: true,
      migration_files: ['20260101_SD-TEST-001_add_thing.sql']
    }));

    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    const text = r.issues.join('\n');
    expect(text).toContain('20260101_SD-TEST-001_add_thing.sql');
    expect(text).toContain('NOT_APPLIED');
    expect(text).toMatch(/never applied/i);
    // The unrelated APPLIED migration must not be dragged in.
    expect(text).not.toContain('20260102_unrelated.sql');
  });
});

describe('TS-2: a flagged SD whose migration IS applied completes normally', () => {
  it('passes - the gate discriminates rather than blanket-blocking flagged SDs', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260101_SD-TEST-001_add_thing.sql', status: 'APPLIED' }],
      error: null
    });
    const r = await gate().validator(sdWith({
      requires_chairman_apply: true,
      migration_files: ['20260101_SD-TEST-001_add_thing.sql']
    }));
    expect(r.passed).toBe(true);
    expect(r.details.verified).toEqual(['20260101_SD-TEST-001_add_thing.sql']);
  });

  it('accepts NO_DDL as nothing-to-apply', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260101_SD-TEST-001_comment_only.sql', status: 'NO_DDL' }],
      error: null
    });
    const r = await gate().validator(sdWith({
      requires_chairman_apply: true,
      migration_files: ['20260101_SD-TEST-001_comment_only.sql']
    }));
    expect(r.passed).toBe(true);
  });
});

describe('TS-5: PARTIAL is not APPLIED', () => {
  it('blocks a half-applied migration', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260101_SD-TEST-001_add_thing.sql', status: 'PARTIAL', missing: ['index:thing_idx'] }],
      error: null
    });
    const r = await gate().validator(sdWith({
      requires_chairman_apply: true,
      migration_files: ['20260101_SD-TEST-001_add_thing.sql']
    }));
    expect(r.passed).toBe(false);
    expect(r.issues.join('\n')).toContain('PARTIAL');
  });
});

describe('TS-4: fail closed - could-not-determine BLOCKS, it never passes', () => {
  it('blocks when the classifier reports an error (e.g. database unreachable)', async () => {
    classifyMigrationApplyState.mockResolvedValue({ files: [], error: 'connect ECONNREFUSED' });
    const r = await gate().validator(sdWith({ requires_chairman_apply: true, migration_files: ['x.sql'] }));
    expect(r.passed).toBe(false);
    expect(r.details.fail_closed).toBe(true);
    const text = r.issues.join('\n');
    expect(text).toContain('ECONNREFUSED');
    // Must be distinguishable from a determinate not-applied result (FR-3 acceptance).
    expect(text).toMatch(/could not be completed/i);
    expect(text).not.toMatch(/is NOT applied to the live database/);
  });

  it('blocks when the classifier returns something unusable (throw inside the gate)', async () => {
    // Exercises the gate's catch via a NATURALLY-ARISING throw: destructuring { files, error }
    // from null raises a TypeError inside the try. Deliberately not `mockImplementation(() =>
    // { throw new Error(...) })` — vitest's unhandled-error tracking reports any Error
    // CONSTRUCTED inside a vi.fn as a test failure even when the code under test catches it,
    // which reads like a fail-open that isn't one. Verified outside vitest (direct node call):
    // the validator RETURNS passed=false / fail_closed=true and never throws.
    classifyMigrationApplyState.mockResolvedValue(null);
    const r = await gate().validator(sdWith({ requires_chairman_apply: true, migration_files: ['x.sql'] }));
    expect(r.passed).toBe(false);
    expect(r.details.fail_closed).toBe(true);
    expect(r.issues.join('\n')).toMatch(/could not be completed/i);
  });

  it('blocks when no migration can be associated with the SD', async () => {
    // Observed live 2026-07-27 against SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001: the SD is
    // flagged but declares no migration and no filename carries its key. Unverifiable is not
    // verified, so this blocks - and says how to fix it.
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260102_unrelated.sql', status: 'APPLIED' }],
      error: null
    });
    const r = await gate().validator(sdWith({ requires_chairman_apply: true }));
    expect(r.passed).toBe(false);
    expect(r.details.fail_closed).toBe(true);
    expect(r.issues.join('\n')).toMatch(/metadata\.migration_files/);
  });

  it('blocks when a DECLARED migration is absent from the corpus', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260102_unrelated.sql', status: 'APPLIED' }],
      error: null
    });
    const r = await gate().validator(sdWith({
      requires_chairman_apply: true,
      migration_files: ['20260101_missing.sql']
    }));
    expect(r.passed).toBe(false);
    expect(r.issues.join('\n')).toContain('20260101_missing.sql');
  });
});

describe('association falls back to the SD key without sharpening the shared heuristic', () => {
  it('matches a migration filename containing the SD key when none is declared', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [
        { file: '20260101_SD-TEST-001_add_thing.sql', status: 'NOT_APPLIED', missing: [] },
        { file: '20260102_unrelated.sql', status: 'APPLIED' }
      ],
      error: null
    });
    const r = await gate().validator(sdWith({ requires_chairman_apply: true }));
    expect(r.passed).toBe(false);
    expect(r.issues.join('\n')).toContain('20260101_SD-TEST-001_add_thing.sql');
  });
});

describe('gate shape matches the executor contract', () => {
  it('is named and required', () => {
    const g = gate();
    expect(g.name).toBe('CHAIRMAN_APPLY_VERIFICATION');
    expect(g.required).toBe(true);
    expect(typeof g.validator).toBe('function');
  });
});
