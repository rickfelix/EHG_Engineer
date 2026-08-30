/**
 * tests/unit/backfill-completed-unapplied-migration-001.test.js
 * SD-LEO-INFRA-COMPLETED-UNAPPLIED-MIGRATION-001 FR-6/PRD TS-9.
 *
 * Calls the ACTUAL exported runBackfill() from the shipped one-off script (not a re-derived
 * mimicry), with classifyMigrationApplyState/recordPendingDecision/supabase all injected --
 * exercises the real write logic (idempotency, additive-only metadata merge, sub-class routing)
 * without touching a live database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runBackfill, SPECIMENS } from '../../scripts/one-off/backfill-completed-unapplied-migration-001.mjs';

function makeSupabase({ smsRelaySd, rejectPathSd, existingDecision } = {}) {
  const updates = [];
  return {
    updates,
    from: vi.fn((table) => {
      if (table === 'strategic_directives_v2') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation(function (_col, val) { this._key = val; return this; }),
          maybeSingle: vi.fn(async function () {
            if (this._key === 'SD-LEO-INFRA-CHAIRMAN-SMS-RELAY-001') return { data: smsRelaySd, error: null };
            if (this._key === 'SD-LEO-INFRA-REJECT-PATH-VENTURE-001') return { data: rejectPathSd, error: null };
            return { data: null, error: null };
          }),
          update: vi.fn((payload) => ({
            eq: vi.fn(async (_col, id) => { updates.push({ id, payload }); return { error: null }; }),
          })),
        };
      }
      if (table === 'chairman_decisions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn(async () => ({ data: existingDecision ? [existingDecision] : [], error: null })),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

const classifyOk = vi.fn().mockResolvedValue({
  files: [
    { file: '20260829_sms_relay_staging_routed_at_column.sql', status: 'NOT_APPLIED', missing: [] },
    { file: 'database/chairman-gated/20260829_reject_path_type_aware_and_live_kill_gate.sql', status: 'CEREMONY_PENDING', missing: [], age_days: 5 },
  ],
  error: null
});

beforeEach(() => classifyOk.mockClear());

describe('SD-LEO-INFRA-COMPLETED-UNAPPLIED-MIGRATION-001 backfill script — runBackfill (FR-6/TS-9)', () => {
  it('SPECIMENS names exactly the two 2026-08-29 specimen SDs with their correct sub-class', () => {
    expect(SPECIMENS).toHaveLength(2);
    expect(SPECIMENS.find((s) => s.sdKey === 'SD-LEO-INFRA-CHAIRMAN-SMS-RELAY-001').subClass).toBe('A');
    expect(SPECIMENS.find((s) => s.sdKey === 'SD-LEO-INFRA-REJECT-PATH-VENTURE-001').subClass).toBe('B');
  });

  it('is idempotent — a second run skips both specimens entirely once completion_integrity_flag is present', async () => {
    const sb = makeSupabase({
      smsRelaySd: { id: 'sd-a', sd_key: 'SD-LEO-INFRA-CHAIRMAN-SMS-RELAY-001', metadata: { completion_integrity_flag: { ruling: '967e551d' } } },
      rejectPathSd: { id: 'sd-b', sd_key: 'SD-LEO-INFRA-REJECT-PATH-VENTURE-001', metadata: { completion_integrity_flag: { ruling: '967e551d' } } },
    });
    const recordPendingDecision = vi.fn();
    const outcomes = await runBackfill(sb, { classifyMigrationApplyState: classifyOk, recordPendingDecision });
    expect(outcomes.every((o) => o.action === 'skip_already_flagged')).toBe(true);
    expect(sb.updates).toHaveLength(0);
    expect(recordPendingDecision).not.toHaveBeenCalled();
  });

  it('flags sub-class A (ungated ordinary migration) additively, WITHOUT minting a chairman_decisions row', async () => {
    const sb = makeSupabase({
      smsRelaySd: { id: 'sd-a', sd_key: 'SD-LEO-INFRA-CHAIRMAN-SMS-RELAY-001', metadata: { some_other_key: 'preserved' } },
      rejectPathSd: { id: 'sd-b', sd_key: 'SD-LEO-INFRA-REJECT-PATH-VENTURE-001', metadata: { completion_integrity_flag: { ruling: '967e551d' } } },
    });
    const recordPendingDecision = vi.fn().mockResolvedValue({ recorded: true, id: 'dec-new' });
    const outcomes = await runBackfill(sb, { classifyMigrationApplyState: classifyOk, recordPendingDecision });

    const smsOutcome = outcomes.find((o) => o.sdKey === 'SD-LEO-INFRA-CHAIRMAN-SMS-RELAY-001');
    expect(smsOutcome.action).toBe('flagged_sub_class_a');
    expect(sb.updates).toHaveLength(1);
    // Additive merge: pre-existing metadata key survives alongside the new flag.
    expect(sb.updates[0].payload.metadata.some_other_key).toBe('preserved');
    expect(sb.updates[0].payload.metadata.completion_integrity_flag).toMatchObject({
      sub_class: 'A', ruling: '967e551d', status_at_backfill: 'NOT_APPLIED',
    });
    expect(recordPendingDecision).not.toHaveBeenCalled();
  });

  it('flags sub-class B (chairman-gated) AND mints a chairman_decisions row when none exists yet', async () => {
    const sb = makeSupabase({
      smsRelaySd: { id: 'sd-a', sd_key: 'SD-LEO-INFRA-CHAIRMAN-SMS-RELAY-001', metadata: { completion_integrity_flag: { ruling: '967e551d' } } },
      rejectPathSd: { id: 'sd-b', sd_key: 'SD-LEO-INFRA-REJECT-PATH-VENTURE-001', metadata: {} },
    });
    const recordPendingDecision = vi.fn().mockResolvedValue({ recorded: true, id: 'dec-new' });
    const outcomes = await runBackfill(sb, { classifyMigrationApplyState: classifyOk, recordPendingDecision });

    const rejectOutcome = outcomes.find((o) => o.sdKey === 'SD-LEO-INFRA-REJECT-PATH-VENTURE-001');
    expect(rejectOutcome.action).toBe('flagged_sub_class_b_decision_minted');
    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    expect(recordPendingDecision).toHaveBeenCalledWith(sb, expect.objectContaining({
      decisionType: 'migration_apply', recommendation: 'fix', blocking: false,
      title: expect.stringContaining('SD-LEO-INFRA-REJECT-PATH-VENTURE-001'),
    }));
  });

  it('does NOT mint a second chairman_decisions row when one already exists for this (sd, file) — idempotent decision minting', async () => {
    const sb = makeSupabase({
      smsRelaySd: { id: 'sd-a', sd_key: 'SD-LEO-INFRA-CHAIRMAN-SMS-RELAY-001', metadata: { completion_integrity_flag: { ruling: '967e551d' } } },
      rejectPathSd: { id: 'sd-b', sd_key: 'SD-LEO-INFRA-REJECT-PATH-VENTURE-001', metadata: {} },
      existingDecision: { id: 'dec-existing' },
    });
    const recordPendingDecision = vi.fn();
    const outcomes = await runBackfill(sb, { classifyMigrationApplyState: classifyOk, recordPendingDecision });

    const rejectOutcome = outcomes.find((o) => o.sdKey === 'SD-LEO-INFRA-REJECT-PATH-VENTURE-001');
    expect(rejectOutcome.action).toBe('flagged_sub_class_b_decision_already_exists');
    expect(rejectOutcome.decisionId).toBe('dec-existing');
    expect(recordPendingDecision).not.toHaveBeenCalled();
  });

  it('dryRun performs zero writes for either specimen', async () => {
    const sb = makeSupabase({
      smsRelaySd: { id: 'sd-a', sd_key: 'SD-LEO-INFRA-CHAIRMAN-SMS-RELAY-001', metadata: {} },
      rejectPathSd: { id: 'sd-b', sd_key: 'SD-LEO-INFRA-REJECT-PATH-VENTURE-001', metadata: {} },
    });
    const recordPendingDecision = vi.fn();
    const outcomes = await runBackfill(sb, { classifyMigrationApplyState: classifyOk, recordPendingDecision, dryRun: true });
    expect(outcomes.every((o) => o.action === 'dry_run')).toBe(true);
    expect(sb.updates).toHaveLength(0);
    expect(recordPendingDecision).not.toHaveBeenCalled();
  });

  it('aborts (no writes) when the classifier reports an error — a backfill must never write against unverifiable state', async () => {
    const sb = makeSupabase({});
    const classifyErr = vi.fn().mockResolvedValue({ files: [], error: 'connect ECONNREFUSED' });
    const recordPendingDecision = vi.fn();
    const outcomes = await runBackfill(sb, { classifyMigrationApplyState: classifyErr, recordPendingDecision });
    expect(outcomes).toEqual([{ sdKey: null, action: 'aborted_classifier_error', error: 'connect ECONNREFUSED' }]);
    expect(sb.updates).toHaveLength(0);
    expect(recordPendingDecision).not.toHaveBeenCalled();
  });
});
