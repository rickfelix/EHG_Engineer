/**
 * SD-LEO-INFRA-ONE-BELT-CENSUS-001 — TS-1/TS-1b (bucketFor precedence) and formatComplementProse
 * (FR-6) unit tests. Pure, synchronous, DB-free per TR-2 — bucketFor never touches ctx/supabase.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { bucketFor, formatComplementProse, BUCKETS, SD_TERMINAL_STATUSES, SD_VALID_STATUSES, QF_TERMINAL_STATUSES, QF_VALID_STATUSES } =
  require_('../../../lib/fleet/belt-census.cjs');

describe('TS-1 — bucketFor() single-axis fixtures', () => {
  it('an escalated QF with no other signal buckets stranded', () => {
    expect(bucketFor({ kind: 'qf', status: 'escalated' }, [], null)).toBe('stranded');
  });

  it('a deferred SD with no other signal buckets deferred', () => {
    expect(bucketFor({ kind: 'sd', status: 'deferred' }, ['sd_deferred'], null)).toBe('deferred');
  });

  it('an SD with an active hold (resolveHoldProvenance non-null) buckets gated, reason surfaced by the caller', () => {
    const holdProvenance = { reason: 'requires human review', set_by: 'chairman', set_at: '2026-09-01T00:00:00Z', source_key: 'requires_human_action_reason' };
    expect(bucketFor({ kind: 'sd', status: 'in_progress' }, ['human_action_required'], holdProvenance)).toBe('gated');
  });

  it('an SD with an open PR/remote branch (inflight axis) buckets in_flight', () => {
    expect(bucketFor({ kind: 'sd', status: 'in_progress' }, ['inflight_open_pr'], null)).toBe('in_flight');
  });

  it('a QF with a live directed assignment (reserved_for_other_session axis) buckets directed_only', () => {
    expect(bucketFor({ kind: 'qf', status: 'open' }, ['reserved_for_other_session'], null)).toBe('directed_only');
  });

  it('a QF with no matching axis and open status buckets claimable', () => {
    expect(bucketFor({ kind: 'qf', status: 'open' }, [], null)).toBe('claimable');
  });

  it('an SD with no matching axis and draft status buckets claimable', () => {
    expect(bucketFor({ kind: 'sd', status: 'draft' }, [], null)).toBe('claimable');
  });

  it('a dep-gate-blocked SD (axes includes dep_blocked) buckets gated even with no holdProvenance', () => {
    expect(bucketFor({ kind: 'sd', status: 'draft' }, ['dep_blocked'], null)).toBe('gated');
  });

  it('an orchestrator-parent-pending SD (axes includes parent_lead_pending) buckets gated', () => {
    expect(bucketFor({ kind: 'sd', status: 'draft' }, ['parent_lead_pending'], null)).toBe('gated');
  });
});

describe('TS-1b — bucketFor() overlapping-axis precedence (in_flight > gated > stranded > deferred > directed_only > claimable)', () => {
  it('an escalated QF that is ALSO gated -> gated wins over stranded', () => {
    const holdProvenance = { reason: 'not_before hold until 2099-01-01', set_by: null, set_at: null, source_key: 'not_before' };
    expect(bucketFor({ kind: 'qf', status: 'escalated' }, [], holdProvenance)).toBe('gated');
  });

  it('a directed-assignment QF that is ALSO in_flight -> in_flight wins over directed_only', () => {
    expect(bucketFor({ kind: 'qf', status: 'open' }, ['reserved_for_other_session', 'inflight_open_pr'], null)).toBe('in_flight');
  });

  it('a deferred SD that is ALSO held -> gated wins over deferred', () => {
    const holdProvenance = { reason: 'requires human review', set_by: 'chairman', set_at: null, source_key: 'requires_human_action_reason' };
    expect(bucketFor({ kind: 'sd', status: 'deferred' }, ['sd_deferred', 'human_action_required'], holdProvenance)).toBe('gated');
  });

  it('an escalated QF that is ALSO in_flight -> in_flight wins over stranded', () => {
    expect(bucketFor({ kind: 'qf', status: 'escalated' }, ['inflight_open_pr'], null)).toBe('in_flight');
  });
});

describe('FR-6 — formatComplementProse()', () => {
  it('returns the plain count when the acted-on buckets are non-zero', () => {
    const result = { countsByBucket: { claimable: 3, directed_only: 0, gated: 2, stranded: 1, deferred: 0, in_flight: 0 } };
    expect(formatComplementProse(result, ['claimable'])).toBe('3');
  });

  it('names the non-zero complement buckets when the acted-on bucket is zero', () => {
    const result = { countsByBucket: { claimable: 0, directed_only: 0, gated: 2, stranded: 1, deferred: 0, in_flight: 0 } };
    expect(formatComplementProse(result, ['claimable'])).toBe('0 (2 gated, 1 stranded)');
  });

  it('combines multiple acted-on buckets (claimable + directed_only) for adam-quiet-tick/coordinator-quiet-tick', () => {
    const result = { countsByBucket: { claimable: 0, directed_only: 2, gated: 0, stranded: 0, deferred: 0, in_flight: 0 } };
    expect(formatComplementProse(result, ['claimable', 'directed_only'])).toBe('2');
  });

  it('returns "0" (no parenthetical) when every bucket is genuinely zero', () => {
    const result = { countsByBucket: { claimable: 0, directed_only: 0, gated: 0, stranded: 0, deferred: 0, in_flight: 0 } };
    expect(formatComplementProse(result, ['claimable'])).toBe('0');
  });
});

describe('TS-2b (matrix half) — the normative status matrix matches the live CHECK constraints', () => {
  it('SD terminal statuses are exactly {completed, cancelled}', () => {
    expect([...SD_TERMINAL_STATUSES].sort()).toEqual(['cancelled', 'completed']);
  });

  it('SD valid statuses are exactly the 9 values in strategic_directives_v2_status_check', () => {
    expect([...SD_VALID_STATUSES].sort()).toEqual(
      ['active', 'cancelled', 'completed', 'deferred', 'draft', 'in_progress', 'pending_approval', 'planning', 'review'].sort()
    );
  });

  it('QF terminal statuses are exactly {completed, cancelled, closed}', () => {
    expect([...QF_TERMINAL_STATUSES].sort()).toEqual(['cancelled', 'closed', 'completed']);
  });

  it('QF valid statuses are exactly the 6 values in quick_fixes_status_check', () => {
    expect([...QF_VALID_STATUSES].sort()).toEqual(['cancelled', 'closed', 'completed', 'escalated', 'in_progress', 'open'].sort());
  });

  it('BUCKETS enumerates exactly the 6 required buckets', () => {
    expect([...BUCKETS].sort()).toEqual(['claimable', 'deferred', 'directed_only', 'gated', 'in_flight', 'stranded'].sort());
  });
});
