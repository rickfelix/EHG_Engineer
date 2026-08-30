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
// SD-LEO-INFRA-COMPLETED-UNAPPLIED-MIGRATION-001 (FR-1): the gate now consults a THIRD ownership
// source, the SD's merged-PR file list. Default to empty/no-error so every pre-existing test
// (none of which is testing the PR-file-list path) sees byte-identical behavior; the new PR-1
// describe block below overrides this per-test.
const findMergedPrFileList = vi.fn().mockResolvedValue({ files: [], error: null });
vi.mock(
  '../../scripts/modules/handoff/executors/lead-final-approval/chairman-apply-state.js',
  () => ({
    classifyMigrationApplyState: (...a) => classifyMigrationApplyState(...a),
    findMergedPrFileList: (...a) => findMergedPrFileList(...a)
  })
);

const { createChairmanApplyVerificationGate } = await import(
  '../../scripts/modules/handoff/executors/lead-final-approval/gates.js'
);

const gate = () => createChairmanApplyVerificationGate();
const sdWith = (metadata) => ({ sd: { sd_key: 'SD-TEST-001', metadata } });

beforeEach(() => {
  classifyMigrationApplyState.mockReset();
  findMergedPrFileList.mockReset().mockResolvedValue({ files: [], error: null });
});

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
    // SD-LEO-INFRA-COMPLETED-UNAPPLIED-MIGRATION-001 (FR-3): now a WAIT, not a hard FAIL --
    // same information, now carried in wait_reason/remediation instead of issues[].
    expect(r.wait).toBe(true);
    expect(r.score).toBe(0);
    const text = `${r.wait_reason || ''}\n${r.remediation || ''}`;
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
    expect(r.wait).toBe(true);
    expect(r.wait_reason).toContain('PARTIAL');
  });
});

describe('SD-LEO-INFRA-COMPLETED-UNAPPLIED-MIGRATION-001 TS-2/rewritten-TS-6: CEREMONY_PENDING routes to WAIT + mints a chairman queue item', () => {
  // REWRITTEN (was 'CEREMONY_PENDING blocks with zero gate changes'): that title asserted the
  // OLD contract this SD deliberately changes -- CEREMONY_PENDING now gets a distinct nonterminal
  // WAIT disposition (not folded into the same hard-FAIL bucket as ordinary NOT_APPLIED), plus a
  // real chairman_decisions row so the awaiting-chairman-apply state has a named, tested consumer.
  it('returns WAIT (not FAIL) for a chairman-gated CEREMONY_PENDING migration, and mints a pending migration_apply decision', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [{
        file: 'database/chairman-gated/20260807_belt_capacity_verdicts.sql',
        status: 'CEREMONY_PENDING', missing: ['table:belt_capacity_verdicts'], age_days: 4,
      }],
      error: null
    });
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null })
    };
    const insertChain = { select: vi.fn().mockResolvedValue({ data: [{ id: 'dec-1' }], error: null }) };
    const sb = {
      from: vi.fn((table) => {
        if (table === 'chairman_decisions') {
          return { select: vi.fn(() => selectChain), insert: vi.fn(() => insertChain) };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
      })
    };
    const g = createChairmanApplyVerificationGate(sb);
    const r = await g.validator(sdWith({
      requires_chairman_apply: true,
      migration_files: ['database/chairman-gated/20260807_belt_capacity_verdicts.sql']
    }));
    expect(r.passed).toBe(false);
    expect(r.wait).toBe(true);
    expect(r.score).toBe(0);
    const text = `${r.wait_reason || ''}\n${r.remediation || ''}`;
    expect(text).toContain('database/chairman-gated/20260807_belt_capacity_verdicts.sql');
    expect(text).toMatch(/ceremony/i);
    expect(text).toMatch(/migration_apply/i);
    // A chairman_decisions row was minted for the ceremony-pending item.
    expect(sb.from).toHaveBeenCalledWith('chairman_decisions');
    expect(insertChain.select).toHaveBeenCalled();
  });

  it('is idempotent — does not insert a second chairman_decisions row when a pending one already exists for this (sd, file)', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: 'database/chairman-gated/20260807_belt_capacity_verdicts.sql', status: 'CEREMONY_PENDING', missing: [], age_days: 1 }],
      error: null
    });
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: 'existing-dec' }], error: null })
    };
    const insertChain = { select: vi.fn() };
    const sb = { from: vi.fn(() => ({ select: vi.fn(() => selectChain), insert: vi.fn(() => insertChain) })) };
    const g = createChairmanApplyVerificationGate(sb);
    const r = await g.validator(sdWith({
      requires_chairman_apply: true,
      migration_files: ['database/chairman-gated/20260807_belt_capacity_verdicts.sql']
    }));
    expect(r.wait).toBe(true);
    expect(insertChain.select).not.toHaveBeenCalled();
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
    expect(r.wait).toBe(true);
    expect(r.wait_reason).toContain('20260101_SD-TEST-001_add_thing.sql');
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
    expect(r.wait).toBe(true);
    expect(r.wait_reason).toContain('20260101_SD-TEST-001_add_thing.sql');
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

describe('SD-LEO-INFRA-COMPLETED-UNAPPLIED-MIGRATION-001 FR-1: PR-file-list is a THIRD ownership source', () => {
  it('TS-1: replays SD-LEO-INFRA-CHAIRMAN-SMS-RELAY-001\'s exact shape — filename does not embed the SD key, undeclared, found only via the PR file list', async () => {
    // REAL shape: classifyMigrationApplyState records database/migrations/ files by BASENAME
    // ONLY (confirmed live via scripts/verify-migration-apply-state.mjs --json), while
    // findMergedPrFileList (gh pr view --json files) returns the FULL repo-relative path. The
    // union must match across this basename-vs-fullpath convention gap, or this exact fix
    // silently fails to catch the specimen it was written for.
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260829_sms_relay_staging_routed_at_column.sql', status: 'NOT_APPLIED', missing: ['sms_relay_staging.routed_at'] }],
      error: null
    });
    findMergedPrFileList.mockResolvedValue({ files: ['database/migrations/20260829_sms_relay_staging_routed_at_column.sql'], error: null });
    const r = await gate().validator(sdWith({})); // ungated, undeclared -- exactly the SMS-RELAY shape
    expect(r.passed).toBe(false);
    expect(r.wait).toBe(true);
    // NOT the old trivial pass ("no migration associated") -- this is the exact defect being fixed.
    expect(r.details.migrationless).not.toBe(true);
    expect(r.wait_reason).toContain('20260829_sms_relay_staging_routed_at_column.sql');
  });

  it('TS-6: an APPLIED migration found ONLY via the PR file list still passes normally (widened detection is not just for catching MORE unapplied ones)', async () => {
    // Basename-only classifier entry vs full-path PR list entry, same convention gap as TS-1.
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260829_unrelated_named_file.sql', status: 'APPLIED' }],
      error: null
    });
    findMergedPrFileList.mockResolvedValue({ files: ['database/migrations/20260829_unrelated_named_file.sql'], error: null });
    const r = await gate().validator(sdWith({}));
    expect(r.passed).toBe(true);
    expect(r.details.verified).toEqual(['20260829_unrelated_named_file.sql']);
  });

  it('TS-5: a PR file list matching nothing in the classifier corpus does not manufacture a false positive', async () => {
    classifyMigrationApplyState.mockResolvedValue({ files: [{ file: '20260102_unrelated.sql', status: 'APPLIED' }], error: null });
    findMergedPrFileList.mockResolvedValue({ files: [], error: null });
    const r = await gate().validator(sdWith({}));
    expect(r.passed).toBe(true);
    expect(r.details.migrationless).toBe(true);
  });

  it('a PR-file-list lookup error fails closed for a GATED SD (TR-2)', async () => {
    classifyMigrationApplyState.mockResolvedValue({ files: [], error: null });
    findMergedPrFileList.mockResolvedValue({ files: [], error: 'gh CLI error' });
    const r = await gate().validator(sdWith({ requires_chairman_apply: true }));
    expect(r.passed).toBe(false);
    expect(r.wait).toBe(false);
    expect(r.details.fail_closed).toBe(true);
  });

  it('a PR-file-list lookup error degrades to declared/sdKeyOwnsFile-only detection for an UNGATED SD (TR-2) — does not newly block', async () => {
    classifyMigrationApplyState.mockResolvedValue({ files: [{ file: '20260102_unrelated.sql', status: 'APPLIED' }], error: null });
    findMergedPrFileList.mockResolvedValue({ files: [], error: 'gh CLI error' });
    const r = await gate().validator(sdWith({}));
    expect(r.passed).toBe(true);
    expect(r.details.migrationless).toBe(true);
  });

  it('existing declared[]/sdKeyOwnsFile() detection remains byte-unchanged when the PR file list is empty (regression guard)', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260101_SD-TEST-001_add_thing.sql', status: 'APPLIED' }],
      error: null
    });
    findMergedPrFileList.mockResolvedValue({ files: [], error: null });
    const r = await gate().validator(sdWith({}));
    expect(r.passed).toBe(true);
    expect(r.details.verified).toEqual(['20260101_SD-TEST-001_add_thing.sql']);
  });

  it('TS-2: replays SD-LEO-INFRA-REJECT-PATH-VENTURE-001\'s exact shape — chairman-gated migration, filename does not embed the SD key, undeclared, found only via the PR file list, status CEREMONY_PENDING', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: 'database/chairman-gated/20260829_reject_path_type_aware_and_live_kill_gate.sql', status: 'CEREMONY_PENDING', missing: ['fn_chairman_decide'], age_days: 1 }],
      error: null
    });
    findMergedPrFileList.mockResolvedValue({ files: ['database/chairman-gated/20260829_reject_path_type_aware_and_live_kill_gate.sql'], error: null });
    const insertChain = { select: vi.fn().mockResolvedValue({ data: [{ id: 'dec-1' }], error: null }) };
    const selectChain = { eq: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const sb = { from: vi.fn(() => ({ select: vi.fn(() => selectChain), insert: vi.fn(() => insertChain) })) };
    const r = await createChairmanApplyVerificationGate(sb).validator(sdWith({})); // ungated at SD level -- exactly the REJECT-PATH shape
    expect(r.passed).toBe(false);
    expect(r.wait).toBe(true);
    expect(r.details.migrationless).not.toBe(true);
    expect(sb.from).toHaveBeenCalledWith('chairman_decisions');
    expect(insertChain.select).toHaveBeenCalled();
  });

  it('TS-8: an ungated ordinary PARTIAL migration also routes through WAIT, not the chairman-decisions path (exclusive to CEREMONY_PENDING)', async () => {
    classifyMigrationApplyState.mockResolvedValue({
      files: [{ file: '20260101_SD-TEST-001_partial.sql', status: 'PARTIAL', missing: ['some_column'] }],
      error: null
    });
    const sb = { from: vi.fn() };
    const r = await createChairmanApplyVerificationGate(sb).validator(sdWith({}));
    expect(r.passed).toBe(false);
    expect(r.wait).toBe(true);
    expect(r.wait_reason).toContain('some_column');
    expect(sb.from).not.toHaveBeenCalled();
  });
});
