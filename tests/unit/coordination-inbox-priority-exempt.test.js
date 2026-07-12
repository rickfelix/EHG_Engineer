/**
 * Unit tests — SD-LEO-INFRA-MID-FLIGHT-DIRECTIVE-001
 *
 * FR-1: a priority-exempt directive kind (fence_notice) must never be starved out of
 * coordination-inbox.cjs's oldest-N row cap by older, lower-priority unread rows.
 * FR-2: fence_notice gets the same deliver-not-consume semantics as the rest of
 * DIRECTIVE_KINDS (persisted, re-surfaces until genuinely actioned).
 *
 * mergePriorityExempt is pure — no DB. classifyInboxMessage is pure — no DB.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { classifyInboxMessage, mergePriorityExempt } = require('../../scripts/hooks/coordination-inbox.cjs');
const { DIRECTIVE_KINDS, PRIORITY_EXEMPT_DIRECTIVE_KINDS } = require('../../lib/fleet/worker-status.cjs');

describe('mergePriorityExempt (FR-1 starvation fix)', () => {
  it('places priority rows ahead of the oldest batch', () => {
    const oldest = [{ id: 'old-1' }, { id: 'old-2' }, { id: 'old-3' }, { id: 'old-4' }, { id: 'old-5' }];
    const priority = [{ id: 'fence-1' }];
    const merged = mergePriorityExempt(priority, oldest);
    expect(merged.map((r) => r.id)).toEqual(['fence-1', 'old-1', 'old-2', 'old-3', 'old-4', 'old-5']);
  });

  it('dedupes when a row appears in both batches (never double-surfaced)', () => {
    const oldest = [{ id: 'shared' }, { id: 'old-2' }];
    const priority = [{ id: 'shared' }];
    const merged = mergePriorityExempt(priority, oldest);
    expect(merged.map((r) => r.id)).toEqual(['shared', 'old-2']);
  });

  it('preserves oldest-batch relative ordering for non-priority rows (TS-4 regression: fairness unchanged)', () => {
    const oldest = [{ id: 'a', created_at: '1' }, { id: 'b', created_at: '2' }, { id: 'c', created_at: '3' }];
    const merged = mergePriorityExempt([], oldest);
    expect(merged.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles empty priority and empty oldest gracefully', () => {
    expect(mergePriorityExempt([], [])).toEqual([]);
    expect(mergePriorityExempt(undefined, undefined)).toEqual([]);
  });

  it('the actual starvation scenario: a newer fence row surfaces even when 5 older rows exist', () => {
    // Simulates: oldest-5 query returns 5 older work_assignment rows (the fence row is
    // NOT among them because it's newer); the separate priority query DOES find it.
    const oldestFive = Array.from({ length: 5 }, (_, i) => ({ id: `old-${i}`, payload: { kind: 'work_assignment' } }));
    const fenceRow = { id: 'fence-urgent', payload: { kind: 'fence_notice' } };
    const merged = mergePriorityExempt([fenceRow], oldestFive);
    expect(merged[0].id).toBe('fence-urgent');
    expect(merged).toHaveLength(6);
  });
});

describe('fence_notice classification (FR-2)', () => {
  it('is a member of DIRECTIVE_KINDS and PRIORITY_EXEMPT_DIRECTIVE_KINDS', () => {
    expect(DIRECTIVE_KINDS).toContain('fence_notice');
    expect(PRIORITY_EXEMPT_DIRECTIVE_KINDS).toContain('fence_notice');
  });

  it('a fence_notice row stamps delivered_at, never read_at or acknowledged_at, on poll (persistent re-surfacing)', () => {
    const v = classifyInboxMessage({ message_type: 'INFO', payload: { kind: 'fence_notice' } }, { isIdle: false });
    expect(v).toEqual({ skip: false, markRead: false, markDelivered: true, markAck: false });
  });

  it('a fence_notice row is surfaced for a BUSY (non-idle) session, same as other directive kinds', () => {
    const v = classifyInboxMessage({ message_type: 'INFO', payload: { kind: 'fence_notice' } }, { isIdle: false });
    expect(v.skip).toBe(false);
  });

  it('non-fence directive kinds (e.g. work_assignment via DIRECTED_SURFACE_TYPES) are unaffected — only fence_notice is priority-exempt', () => {
    // work_assignment is a message_type, not carried via payload.kind — confirm PRIORITY_EXEMPT_DIRECTIVE_KINDS
    // is a narrow subset, not "everything in DIRECTIVE_KINDS".
    expect(PRIORITY_EXEMPT_DIRECTIVE_KINDS).not.toContain('work_assignment');
    expect(PRIORITY_EXEMPT_DIRECTIVE_KINDS).not.toContain('coordinator_request');
    expect(PRIORITY_EXEMPT_DIRECTIVE_KINDS.length).toBeLessThan(DIRECTIVE_KINDS.length);
  });
});
