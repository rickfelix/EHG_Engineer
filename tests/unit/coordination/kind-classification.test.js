/**
 * Every coordination row must resolve to an EXPLICIT classification.
 * SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-3, AC-8.
 *
 * THE REFRAME THIS ENCODES. The SD began from "kinds sitting at 100% unactioned prove a broken
 * drain". Measurement refuted that: `actioned_at` is a PER-LANE ack convention with four
 * kind-scoped owners, not a table-wide drain, so a kind at 100% unactioned means NO LANE OWNS IT —
 * which is CORRECT for informational kinds (roll_call alone is ~1,295 rows, deliberately undrained
 * so the friction router never scoops it) and a genuine gap only for actionable-but-ownerless ones.
 * The deliverable was therefore never "widen a drain"; it is this classification.
 *
 * WHY A POSITIVE ASSERTION IS REQUIRED (AC-8). The existing shadow-registry guard passes TODAY, so
 * it can only prove nobody created a SECOND registry — it can never demonstrate that FR-3 landed.
 * A test that only re-ran it would be green before and after the change. So each measured
 * ownerless kind is asserted BY NAME to resolve to an explicit classification, and the suite
 * carries the inverse control: an unregistered kind must come back UNRECOGNIZED, because silently
 * absorbing unknown kinds into a default is the failure this whole SD is about.
 *
 * TRAP (a), handled explicitly rather than by omission: 162 rows (4.3%) carry NO payload.kind at
 * all — including the WORKER_SIGNAL friction channel, which keys on signal_type. A kind-ONLY
 * scheme silently excludes them, so classification falls back to signal_type before giving up.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const { classifyCoordinationRow, INFORMATIONAL_KINDS } =
  createRequire(import.meta.url)('../../../lib/fleet/worker-status.cjs');

/** The kinds measured as ownerless on the live lane — the exact population FR-3 must dispose of. */
const MEASURED_OWNERLESS = [
  'ping_on_silence',
  'adam_channel_health_probe',
  'adam_action_wake',
  'inert_worker_alert',
  'completion_boundary_exit_alert',
  'claim_reconciliation',
  'periodic_liveness_ladder',
  'account_switch_notice',
  'row_growth_anomaly',
  'review_supply'
];

describe('FR-3 delivery — every measured ownerless kind is explicitly classified (AC-8)', () => {
  it.each(MEASURED_OWNERLESS)('%s resolves to an explicit classification, not "unrecognized"', (kind) => {
    const v = classifyCoordinationRow({ payload: { kind } });
    expect(v.classification).not.toBe('unrecognized');
    expect(['actionable', 'informational']).toContain(v.classification);
    expect(v.basis).toBeTruthy();
  });

  it('the high-volume deliberately-undrained kinds are classified informational, not left ambiguous', () => {
    // roll_call is the single largest kind in the table and is undrained BY DESIGN — the /checkin
    // availability record, carrying no signal_type so routers never scoop it. If the classification
    // called it actionable it would manufacture a permanent ~1,295-row backlog out of correct behaviour.
    for (const kind of ['roll_call', 'periodic_liveness_flag']) {
      expect(classifyCoordinationRow({ payload: { kind } }).classification).toBe('informational');
    }
  });
});

describe('actionable kinds still classify as actionable', () => {
  it.each(['adam_advisory', 'chairman_directive', 'coordinator_request'])('%s is actionable', (kind) => {
    expect(classifyCoordinationRow({ payload: { kind } }).classification).toBe('actionable');
  });

  it('a kind cannot be BOTH — informational and actionable sets are disjoint', () => {
    // Overlap would make the verdict depend on evaluation order, which is how a classifier starts
    // silently disagreeing with itself.
    for (const kind of INFORMATIONAL_KINDS) {
      expect(classifyCoordinationRow({ payload: { kind } }).classification).toBe('informational');
    }
  });
});

describe('TRAP (a) — rows carrying no payload.kind', () => {
  it('a friction signal with NO kind is classified via signal_type, not dropped', () => {
    const row = { payload: { signal_type: 'harness-bug' } };
    const v = classifyCoordinationRow(row);
    expect(v.classification).toBe('actionable');
    expect(v.basis).toBe('signal_type');
  });

  it('a top-level signal_type is honoured too (the column, not just the payload)', () => {
    const v = classifyCoordinationRow({ signal_type: 'stuck' });
    expect(v.classification).toBe('actionable');
    expect(v.basis).toBe('signal_type');
  });

  it('a row with NEITHER kind nor signal_type is UNRECOGNIZED — surfaced, never silently absorbed', () => {
    const v = classifyCoordinationRow({ payload: {} });
    expect(v.classification).toBe('unrecognized');
  });
});

describe('the surfacing property (controls — the classifier must be able to say "I do not know")', () => {
  it('CONTROL: an unregistered kind comes back unrecognized', () => {
    // Without this the classifier could satisfy every assertion above by defaulting everything to
    // informational, and an actionable-but-ownerless kind would vanish into the default forever.
    const v = classifyCoordinationRow({ payload: { kind: 'totally_invented_kind_xyz' } });
    expect(v.classification).toBe('unrecognized');
    expect(v.kind).toBe('totally_invented_kind_xyz');
  });

  it('CONTROL: a null/undefined row does not throw and is unrecognized', () => {
    expect(classifyCoordinationRow(null).classification).toBe('unrecognized');
    expect(classifyCoordinationRow(undefined).classification).toBe('unrecognized');
  });

  it('INFORMATIONAL_KINDS is frozen, so a caller cannot mutate the registry at runtime', () => {
    expect(Object.isFrozen(INFORMATIONAL_KINDS)).toBe(true);
  });
});
