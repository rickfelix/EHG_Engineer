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
