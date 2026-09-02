/**
 * SD-LEO-INFRA-CLAIM-VALIDITY-ISALIVE-LAG-001 (FR-4) — tests for the canonical
 * reactivate-sd routine's PURE core: the status flip out of 'deferred', the
 * metadata.blocker sync (reactivated_at stamped + blocker cleared), and the
 * sd_transition_audit row shape (transition_type='REACTIVATE', pre/post_state).
 * No DB — the IO wrapper is exercised via its pure building blocks.
 */
import { describe, it, expect } from 'vitest';
import {
  computeReactivation,
  buildReactivationAudit,
  VALID_REACTIVATION_TARGETS,
  resolveArgs,
} from '../../scripts/reactivate-sd.js';

const NOW_ISO = '2026-06-16T03:00:00.000Z';

const deferredSd = (overrides = {}) => ({
  id: '3c9ebdcc-3620-43f9-bd26-c7e007ef77b1',
  sd_key: 'SD-LEO-FIX-FOO-001',
  status: 'deferred',
  current_phase: 'LEAD',
  metadata: { blocker: { kind: 'chairman_migration', status: 'open', note: 'awaiting attest' }, foo: 'bar' },
  ...overrides,
});

describe('computeReactivation — status flip out of deferred (FR-3/FR-4)', () => {
  it('flips status to the default target (draft) when deferred', () => {
    const r = computeReactivation(deferredSd(), { nowIso: NOW_ISO });
    expect(r.ok).toBe(true);
    expect(r.updates.status).toBe('draft');
  });

  it('honors an explicit --to target', () => {
    const r = computeReactivation(deferredSd(), { toStatus: 'in_progress', nowIso: NOW_ISO });
    expect(r.updates.status).toBe('in_progress');
  });

  it('stamps metadata.reactivated_at and marks the blocker cleared (synced, not dropped)', () => {
    const r = computeReactivation(deferredSd(), { nowIso: NOW_ISO });
    expect(r.updates.metadata.reactivated_at).toBe(NOW_ISO);
    expect(r.updates.metadata.blocker.status).toBe('cleared');
    expect(r.updates.metadata.blocker.cleared_at).toBe(NOW_ISO);
    // prior metadata preserved
    expect(r.updates.metadata.foo).toBe('bar');
    expect(r.updates.metadata.blocker.kind).toBe('chairman_migration');
    expect(r.blockerCleared).toBe(true);
  });

  it('records a reactivation_reason when provided (capped)', () => {
    const r = computeReactivation(deferredSd(), { reason: 'chairman cleared the gate', nowIso: NOW_ISO });
    expect(r.updates.metadata.reactivation_reason).toBe('chairman cleared the gate');
  });

  it('handles an SD with no blocker (just stamps reactivated_at)', () => {
    const r = computeReactivation(deferredSd({ metadata: { foo: 'bar' } }), { nowIso: NOW_ISO });
    expect(r.ok).toBe(true);
    expect(r.updates.metadata.reactivated_at).toBe(NOW_ISO);
    expect(r.updates.metadata.blocker).toBeUndefined();
    expect(r.blockerCleared).toBe(false);
  });

  it('tolerates null/array/missing metadata without throwing', () => {
    for (const meta of [null, undefined, [], 'nope']) {
      const r = computeReactivation(deferredSd({ metadata: meta }), { nowIso: NOW_ISO });
      expect(r.ok).toBe(true);
      expect(r.updates.metadata.reactivated_at).toBe(NOW_ISO);
    }
  });

  it('pre_state/post_state capture the transition for the audit row', () => {
    const r = computeReactivation(deferredSd(), { nowIso: NOW_ISO });
    expect(r.pre_state).toEqual({ status: 'deferred', current_phase: 'LEAD', blocker_status: 'open' });
    expect(r.post_state).toEqual({ status: 'draft', reactivated_at: NOW_ISO, blocker_status: 'cleared' });
  });
});

describe('computeReactivation — guards (FR-3)', () => {
  it('returns ok:false for a non-deferred SD (idempotent no-op signal)', () => {
    const r = computeReactivation(deferredSd({ status: 'draft' }), { nowIso: NOW_ISO });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_deferred');
    expect(r.terminal).toBe(false);
  });

  it('flags terminal statuses (completed/cancelled) for a loud refusal', () => {
    expect(computeReactivation(deferredSd({ status: 'completed' })).terminal).toBe(true);
    expect(computeReactivation(deferredSd({ status: 'cancelled' })).terminal).toBe(true);
  });

  it('throws on an invalid --to target', () => {
    expect(() => computeReactivation(deferredSd(), { toStatus: 'deferred' })).toThrow(/invalid --to/);
    expect(() => computeReactivation(deferredSd(), { toStatus: 'bogus' })).toThrow(/invalid --to/);
  });

  it('exposes the valid reactivation targets (does NOT allow re-deferring)', () => {
    expect([...VALID_REACTIVATION_TARGETS].sort()).toEqual(['active', 'draft', 'in_progress']);
    expect(VALID_REACTIVATION_TARGETS.has('deferred')).toBe(false);
  });
});

// SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-5/FR-7): the guarded, audited path to uncomplete a
// falsely-completed SD -- completed -> active at current_phase=LEAD_FINAL, gated on
// metadata.completion_evidence_invalid===true, never on status alone.
describe('computeReactivation — uncomplete a false pass (SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 FR-5)', () => {
  const falselyCompletedSd = (overrides = {}) => ({
    id: '64cba683-adb9-47f0-ae62-8238f4e3b9c0',
    sd_key: 'SD-LEO-FIX-HUMAN-ACTION-FENCES-001',
    status: 'completed',
    current_phase: 'COMPLETED',
    completion_date: '2026-09-02T14:32:07.000Z',
    metadata: { completion_evidence_invalid: true, some_other_key: 'preserved' },
    ...overrides,
  });

  it('succeeds when status=completed AND completion_evidence_invalid=true: active/LEAD_FINAL, completion_date cleared', () => {
    const r = computeReactivation(falselyCompletedSd(), { toStatus: 'active', reason: 'run 1a1b3087 bypass false pass', nowIso: NOW_ISO });
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('uncomplete_false_pass');
    expect(r.guardStatus).toBe('completed');
    expect(r.updates.status).toBe('active');
    expect(r.updates.current_phase).toBe('LEAD_FINAL');
    expect(r.updates.completion_date).toBeNull();
    expect(r.updates.metadata.uncompleted_at).toBe(NOW_ISO);
    expect(r.updates.metadata.uncomplete_reason).toBe('run 1a1b3087 bypass false pass');
  });

  it('leaves completion_evidence_invalid=true (durable marker, never cleared)', () => {
    const r = computeReactivation(falselyCompletedSd(), { toStatus: 'active', nowIso: NOW_ISO });
    expect(r.updates.metadata.completion_evidence_invalid).toBe(true);
    // Prior unrelated metadata preserved, not clobbered.
    expect(r.updates.metadata.some_other_key).toBe('preserved');
  });

  it('REFUSES (terminal) when status=completed but completion_evidence_invalid is absent', () => {
    const r = computeReactivation(falselyCompletedSd({ metadata: {} }), { toStatus: 'active', nowIso: NOW_ISO });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_deferred');
    expect(r.terminal).toBe(true);
    expect(r.currentStatus).toBe('completed');
  });

  it('REFUSES when completion_evidence_invalid is false (not just absent)', () => {
    const r = computeReactivation(falselyCompletedSd({ metadata: { completion_evidence_invalid: false } }), { toStatus: 'active', nowIso: NOW_ISO });
    expect(r.ok).toBe(false);
    expect(r.terminal).toBe(true);
  });

  it('does NOT take this path for a --to target other than active (e.g. draft) — falls through to the terminal refusal', () => {
    const r = computeReactivation(falselyCompletedSd(), { toStatus: 'draft', nowIso: NOW_ISO });
    expect(r.ok).toBe(false);
    expect(r.terminal).toBe(true);
  });

  it('pre_state/post_state capture the transition for the audit row', () => {
    const r = computeReactivation(falselyCompletedSd(), { toStatus: 'active', nowIso: NOW_ISO });
    expect(r.pre_state).toEqual({ status: 'completed', current_phase: 'COMPLETED', completion_date: '2026-09-02T14:32:07.000Z' });
    expect(r.post_state).toEqual({ status: 'active', current_phase: 'LEAD_FINAL', completion_date: null, uncompleted_at: NOW_ISO });
  });
});

describe('buildReactivationAudit — transitionType for the uncomplete path (FR-5)', () => {
  it('emits transition_type=UNCOMPLETE_FALSE_PASS when explicitly requested', () => {
    const row = buildReactivationAudit({
      sdId: 'uuid-1',
      pre_state: { status: 'completed' },
      post_state: { status: 'active' },
      requestId: 'req-1',
      nowIso: NOW_ISO,
      transitionType: 'UNCOMPLETE_FALSE_PASS',
    });
    expect(row.transition_type).toBe('UNCOMPLETE_FALSE_PASS');
  });

  it('defaults to REACTIVATE when transitionType is omitted (unchanged for the existing path)', () => {
    const row = buildReactivationAudit({ sdId: 'uuid-1', pre_state: { status: 'deferred' }, requestId: 'req-1', nowIso: NOW_ISO });
    expect(row.transition_type).toBe('REACTIVATE');
  });
});

describe('resolveArgs — argv parsing (SD-LEO-INFRA-REACTIVATE-SD-ARGV-FIX-001)', () => {
  // BUG 1/2 regression: the documented default-to-draft invocation (no --to) must
  // resolve the SD-key positional and default target=draft, instead of dropping it.
  it('resolves the SD key and defaults target=draft when --to is omitted (--reason present)', () => {
    const r = resolveArgs(['SD-LEO-FIX-FOO-001', '--reason', 'x']);
    expect(r.sdInput).toBe('SD-LEO-FIX-FOO-001');
    expect(r.toStatus).toBe('draft');
    expect(r.reason).toBe('x');
  });

  it('resolves a bare SD key (no flags at all) and defaults target=draft', () => {
    const r = resolveArgs(['SD-LEO-FIX-FOO-001']);
    expect(r.sdInput).toBe('SD-LEO-FIX-FOO-001');
    expect(r.toStatus).toBe('draft');
    expect(r.reason).toBeNull();
  });

  it('honors an explicit --to and does not consume the positional', () => {
    const r = resolveArgs(['SD-LEO-FIX-FOO-001', '--to', 'in_progress']);
    expect(r.sdInput).toBe('SD-LEO-FIX-FOO-001');
    expect(r.toStatus).toBe('in_progress');
  });

  it('resolves the positional regardless of flag order (SD key last)', () => {
    const r = resolveArgs(['--reason', 'cleared', '--to', 'active', 'SD-LEO-FIX-FOO-001']);
    expect(r.sdInput).toBe('SD-LEO-FIX-FOO-001');
    expect(r.toStatus).toBe('active');
    expect(r.reason).toBe('cleared');
  });

  it('does not mistake a flag value for the SD positional', () => {
    // 'draft' here is the --to value, not the SD key; with no real positional sdInput is undefined.
    const r = resolveArgs(['--to', 'draft', '--reason', 'note']);
    expect(r.sdInput).toBeUndefined();
  });

  it('resolves a UUID positional with --reason and no --to', () => {
    const uuid = '3c9ebdcc-3620-43f9-bd26-c7e007ef77b1';
    const r = resolveArgs([uuid, '--reason', 'chairman cleared']);
    expect(r.sdInput).toBe(uuid);
    expect(r.toStatus).toBe('draft');
  });
});

describe('buildReactivationAudit — sd_transition_audit row shape (FR-3/FR-4)', () => {
  const pre = { status: 'deferred', current_phase: 'LEAD', blocker_status: 'open' };
  const post = { status: 'draft', reactivated_at: NOW_ISO, blocker_status: 'cleared' };

  it('emits transition_type=REACTIVATE with status=completed + pre/post_state', () => {
    const row = buildReactivationAudit({ sdId: 'uuid-1', pre_state: pre, post_state: post, requestId: 'req-1', nowIso: NOW_ISO });
    expect(row.transition_type).toBe('REACTIVATE');
    expect(row.status).toBe('completed');
    expect(row.sd_id).toBe('uuid-1');
    expect(row.pre_state).toEqual(pre);
    expect(row.post_state).toEqual(post);
    expect(row.started_at).toBe(NOW_ISO);
    expect(row.completed_at).toBe(NOW_ISO);
  });

  it('carries the session_id (nullable) and a non-null request_id', () => {
    const row = buildReactivationAudit({ sdId: 'uuid-1', pre_state: pre, sessionId: 'sess-9', requestId: 'req-1', nowIso: NOW_ISO });
    expect(row.session_id).toBe('sess-9');
    expect(row.request_id).toBe('req-1');
    expect(row.post_state).toBeNull();
  });

  it('throws when the NOT NULL fields (sdId, requestId, pre_state) are missing', () => {
    expect(() => buildReactivationAudit({ pre_state: pre, requestId: 'r' })).toThrow(/sdId/);
    expect(() => buildReactivationAudit({ sdId: 'u', pre_state: pre })).toThrow(/requestId/);
    expect(() => buildReactivationAudit({ sdId: 'u', requestId: 'r' })).toThrow(/pre_state/);
  });
});
