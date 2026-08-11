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

describe('an SD without the flag is enforced too (widened by SD-LEO-INFRA-COMPLETION-FAIL-OWN-001)', () => {
  // These cases previously asserted the OLD contract (unflagged → applicable:false, classifier
  // never consulted). That contract is deliberately reversed per coordinator ruling 454e005a:
  // an applier now exists for ungated migrations, so blocking is clearable and legitimate.
  it('consults the classifier and passes migrationless when the SD owns no migration', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260102_unrelated.sql', status: 'APPLIED' }],
      error: null
    });
    const r = await gate().validator(sdWith({}));
    expect(r.passed).toBe(true);
    expect(r.details.applicable).toBe(true);
    expect(r.details.migrationless).toBe(true);
    expect(classifyMigrationApplyState).toHaveBeenCalled();
  });

  it('treats a non-affirmative flag value as ungated (enforced, coordinator ceremony)', async () => {
    for (const v of [false, 'false', 1, null, undefined, 'yes']) {
      classifyMigrationApplyState.mockResolvedValue({ files: [], error: null });
      const r = await gate().validator(sdWith({ requires_chairman_apply: v }));
      expect(r.passed).toBe(true);
      expect(r.details.migrationless).toBe(true);
    }
  });

  it('treats the STRING "true" as gated, matching the flag\'s other consumer', async () => {
    // check-migration-readiness.mjs resolveSdGated() guards `=== 'true' || === true` because it
    // reads via raw SQL ->> which always returns text. This gate blocks completion where that one
    // only quiets a warning, so it must not be the less tolerant of the two: a string-valued flag
    // must still gate. Erring toward gating is safe; erring toward skipping is the incident.
    classifyMigrationApplyState.mockResolvedValue({ files: [], error: null });
    const r = await gate().validator(sdWith({ requires_chairman_apply: 'true' }));
    expect(r.passed).toBe(false);
    expect(classifyMigrationApplyState).toHaveBeenCalled();
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

describe('SD-LEO-INFRA-APPLY-STATE-CEREMONY-PENDING-001 TS-6: CEREMONY_PENDING blocks with zero gate changes', () => {
  it('blocks a chairman-gated migration reporting CEREMONY_PENDING, same as NOT_APPLIED/PARTIAL', async () => {
    // Proves the FR-3 contract: this gate's status !== APPLIED && status !== NO_DDL check
    // already generalizes to the new status value — no gates.js source change was required.
    classifyMigrationApplyState.mockResolvedValue({
      files: [{
        file: 'database/chairman-gated/20260807_belt_capacity_verdicts.sql',
        status: 'CEREMONY_PENDING', missing: ['table:belt_capacity_verdicts'], age_days: 4,
      }],
      error: null
    });
    const r = await gate().validator(sdWith({
      requires_chairman_apply: true,
      migration_files: ['database/chairman-gated/20260807_belt_capacity_verdicts.sql']
    }));
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    const text = r.issues.join('\n');
    expect(text).toContain('database/chairman-gated/20260807_belt_capacity_verdicts.sql');
    expect(text).toContain('CEREMONY_PENDING');
    // gated-aware remediation text (line 1446-1448) must still fire for this status.
    expect(text).toMatch(/chairman GO/i);
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

describe('a declaration can only ADD to what is checked - never subtract (shadow-bypass guard)', () => {
  it('still blocks when a declared APPLIED decoy sits alongside an undeclared SD-key NOT_APPLIED file', async () => {
    // The bypass both EXEC reviews found independently. An earlier cut used an EXCLUSIVE branch
    // (declared.length ? filter(declared) : filter(sdKey)), so declaring one already-applied file
    // skipped the SD-key fallback entirely and the real unapplied migration passed unexamined -
    // while sitting in the very files[] the gate already had. metadata is a DATABASE write, not
    // part of any git diff, so this would have been invisible to PR review.
    classifyMigrationApplyState.mockResolvedValue({
      files: [
        { file: '20260102_unrelated.sql', status: 'APPLIED' },
        { file: '20260101_SD-TEST-001_add_thing.sql', status: 'NOT_APPLIED', missing: [] }
      ],
      error: null
    });
    const r = await gate().validator(sdWith({
      requires_chairman_apply: true,
      migration_files: ['20260102_unrelated.sql']
    }));
    expect(r.passed).toBe(false);
    expect(r.issues.join('\n')).toContain('20260101_SD-TEST-001_add_thing.sql');
  });

  it('blocks a PARTIAL declaration rather than silently checking only the entries it found', async () => {
    // declared ['real','typo'] previously checked only `real` and dropped `typo` without a word -
    // a partial match reported as a full pass.
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260101_real.sql', status: 'APPLIED' }],
      error: null
    });
    const r = await gate().validator(sdWith({
      requires_chairman_apply: true,
      migration_files: ['20260101_real.sql', '20260101_typo.sql']
    }));
    expect(r.passed).toBe(false);
    expect(r.details.fail_closed).toBe(true);
    expect(r.issues.join('\n')).toContain('20260101_typo.sql');
  });

  it('still passes when the declaration and the SD-key file are both applied', async () => {
    // The union must not over-block: adding the fallback back in cannot turn a legitimately
    // fully-applied SD into a failure.
    classifyMigrationApplyState.mockResolvedValue({
      files: [
        { file: '20260102_declared.sql', status: 'APPLIED' },
        { file: '20260101_SD-TEST-001_add_thing.sql', status: 'APPLIED' }
      ],
      error: null
    });
    const r = await gate().validator(sdWith({
      requires_chairman_apply: true,
      migration_files: ['20260102_declared.sql']
    }));
    expect(r.passed).toBe(true);
    expect(r.details.verified).toHaveLength(2);
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
