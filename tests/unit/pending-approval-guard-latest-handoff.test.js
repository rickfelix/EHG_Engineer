/**
 * SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-LANES-001 (FR-5) — the pending_approval reset guard must key
 * on the LATEST PLAN-TO-LEAD handoff, not merely "does an accepted one EVER exist".
 *
 * BUG FIXED: the original query was `.eq('status','accepted')` with no recency filter at all --
 * an OLD, superseded accepted PLAN-TO-LEAD row permanently suppressed the reset (and kept emitting
 * a misleading "awaiting LEAD-FINAL-APPROVAL" message) even after the SD's state had since
 * regressed to 'blocked'/'rejected'. Mirrors the SAME "replicate the gate rules here rather than
 * stubbing supabase in production" pattern as tests/unit/pending-approval-guard.test.js (QF-20260423-909),
 * updated for the new latest-per-SD resolution added by this SD.
 */
import { describe, it, expect } from 'vitest';

/**
 * Mirrors scripts/stale-session-sweep.cjs's acceptedPlanToLeadSet construction: resolve dual-keyed
 * (uuid or sd_key) handoff rows to their LOGICAL sd_key, take the latest (rows arrive created_at
 * DESC), and include only those whose latest PLAN-TO-LEAD is genuinely 'accepted'.
 */
function buildAcceptedPlanToLeadSet(stuckApproval, p2lHandoffsDescByCreatedAt) {
  const idToSdKey = new Map();
  for (const sd of stuckApproval) {
    if (sd.id) idToSdKey.set(sd.id, sd.sd_key);
    if (sd.sd_key) idToSdKey.set(sd.sd_key, sd.sd_key);
  }
  const latestBySdKey = new Map();
  for (const h of p2lHandoffsDescByCreatedAt) {
    const logicalKey = idToSdKey.get(h.sd_id);
    if (logicalKey && !latestBySdKey.has(logicalKey)) latestBySdKey.set(logicalKey, h);
  }
  const set = new Set();
  for (const [sdKey, h] of latestBySdKey) {
    if (h.status === 'accepted') set.add(sdKey);
  }
  return set;
}

describe('stale-session-sweep — pending_approval guard keys on the LATEST PLAN-TO-LEAD, not "ever accepted" (FR-5)', () => {
  it('regression: an OLD accepted P2L followed by a LATER blocked P2L is correctly RESET-eligible (was incorrectly SKIPped before this fix)', () => {
    const sd = { id: 'uuid-h', sd_key: 'SD-SPECIMEN-H' };
    // Rows arrive created_at DESC (newest first), matching the real query's .order().
    const handoffs = [
      { sd_id: 'uuid-h', status: 'blocked', created_at: '2026-08-15T01:00:00Z' }, // latest
      { sd_id: 'uuid-h', status: 'accepted', created_at: '2026-08-10T01:00:00Z' }, // older, superseded
    ];
    const set = buildAcceptedPlanToLeadSet([sd], handoffs);
    expect(set.has('SD-SPECIMEN-H')).toBe(false); // latest wins -- NOT skipped
  });

  it('an SD whose LATEST P2L is accepted is still correctly skipped', () => {
    const sd = { id: 'uuid-c', sd_key: 'SD-SPECIMEN-C' };
    const handoffs = [
      { sd_id: 'uuid-c', status: 'accepted', created_at: '2026-08-15T01:00:00Z' }, // latest
      { sd_id: 'uuid-c', status: 'rejected', created_at: '2026-08-10T01:00:00Z' },
    ];
    const set = buildAcceptedPlanToLeadSet([sd], handoffs);
    expect(set.has('SD-SPECIMEN-C')).toBe(true);
  });

  it('dual-keying: the latest row is keyed by UUID while an older row for the SAME logical SD is keyed by sd_key -- resolves to one logical SD, latest wins', () => {
    const sd = { id: 'uuid-d', sd_key: 'SD-SPECIMEN-D' };
    const handoffs = [
      { sd_id: 'uuid-d', status: 'blocked', created_at: '2026-08-15T01:00:00Z' }, // latest, uuid-keyed
      { sd_id: 'SD-SPECIMEN-D', status: 'accepted', created_at: '2026-08-10T01:00:00Z' }, // older, sd_key-keyed era
    ];
    const set = buildAcceptedPlanToLeadSet([sd], handoffs);
    expect(set.has('SD-SPECIMEN-D')).toBe(false); // the genuinely-latest row (blocked) wins
  });

  it('no PLAN-TO-LEAD rows at all -- not in the set (falls through to the broader accepted-handoff-past-LEAD guard, not this one)', () => {
    const sd = { id: 'uuid-e', sd_key: 'SD-SPECIMEN-E' };
    const set = buildAcceptedPlanToLeadSet([sd], []);
    expect(set.has('SD-SPECIMEN-E')).toBe(false);
  });

  it('multiple unrelated SDs resolve independently -- no cross-contamination', () => {
    const sds = [{ id: 'uuid-x', sd_key: 'SD-X' }, { id: 'uuid-y', sd_key: 'SD-Y' }];
    const handoffs = [
      { sd_id: 'uuid-x', status: 'accepted', created_at: '2026-08-15T01:00:00Z' },
      { sd_id: 'uuid-y', status: 'blocked', created_at: '2026-08-15T01:00:00Z' },
    ];
    const set = buildAcceptedPlanToLeadSet(sds, handoffs);
    expect(set.has('SD-X')).toBe(true);
    expect(set.has('SD-Y')).toBe(false);
  });
});
