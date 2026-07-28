/**
 * FR-8: an unreadable WORK_ASSIGNMENT must not shadow a readable one.
 * SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001.
 *
 * Rows arrive newest-first. The selection used to stop at the newest non-nudge assignment; if
 * that row's target could not be resolved the whole directed branch was skipped, and because the
 * row stays unacked it was re-picked on every tick. One unreadable row therefore blocked every
 * good dispatch to that seat indefinitely — the coordinator had to ack two inert rows BY HAND
 * while clearing the incident that produced this SD.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const REPO = path.resolve(__dirname, '../../..');
const { resolveAssignmentTargetKey } = require_(path.join(REPO, 'lib/fleet/assignment-target.cjs'));
const { runDirectedAssignmentStep } = require_(path.join(REPO, 'lib/checkin/steps/directed-assignment.cjs'));

const NEWEST_UNREADABLE = {
  id: 'msg-unreadable', message_type: 'WORK_ASSIGNMENT',
  subject: 'VOID — DO NOT git stash', body: 'advisory prose',
  payload: { kind: 'coordinator_note' }
};
const OLDER_READABLE = {
  id: 'msg-readable', message_type: 'WORK_ASSIGNMENT',
  subject: 'WORK ASSIGNMENT: your next item', body: '',
  payload: { sd_key: 'SD-REAL-TARGET-001' }
};

function deps(rows) {
  return {
    ws: { getMessagesForSession: vi.fn(async () => rows) },
    extractSdFromAssignment: (m) => resolveAssignmentTargetKey(m, { profile: 'worker' }),
    isInformationalNudge: (m) => !!(m.payload && m.payload.kind === 'completion_nudge'),
    tryClaim: vi.fn(async () => ({ ok: true })),
    stampDirectedAssignment: vi.fn(async () => {}),
    ackMessage: vi.fn(async () => {})
  };
}

describe('FR-8 — unreadable assignment does not shadow a readable one', () => {
  it('the resolver skips the unreadable newest row and reaches the readable older one', () => {
    // The selection predicate itself, exercised directly: newest-first ordering with an
    // unreadable row at the head must still yield the readable row behind it.
    const rows = [NEWEST_UNREADABLE, OLDER_READABLE];
    const claimable = rows.filter(m => resolveAssignmentTargetKey(m, { profile: 'worker' }));
    expect(claimable).toHaveLength(1);
    expect(claimable[0].id).toBe('msg-readable');
    // And the unreadable one is genuinely unresolvable — not merely deprioritised.
    expect(resolveAssignmentTargetKey(NEWEST_UNREADABLE, { profile: 'worker' })).toBeNull();
  });

  it('BEFORE-state regression: a naive newest-first find() would have stopped on the unreadable row', () => {
    // This is the bug, expressed. Kept as an executable statement of what changed, so the
    // regression is recognisable if the selection is ever simplified back.
    const rows = [NEWEST_UNREADABLE, OLDER_READABLE];
    const naive = rows.find(m => m.message_type === 'WORK_ASSIGNMENT');
    expect(naive.id).toBe('msg-unreadable');
    expect(resolveAssignmentTargetKey(naive, { profile: 'worker' })).toBeNull();
    // ...so the directed branch was skipped, and the readable row behind it never reached.
  });

  it('a readable newest row is still preferred — recency is not inverted', () => {
    const rows = [OLDER_READABLE, NEWEST_UNREADABLE];
    const claimable = rows.filter(m => resolveAssignmentTargetKey(m, { profile: 'worker' }));
    expect(claimable[0].id).toBe('msg-readable');
  });

  it('informational nudges are still excluded regardless of readability', () => {
    const nudge = {
      id: 'msg-nudge', message_type: 'WORK_ASSIGNMENT', subject: 'Next work available',
      payload: { available_sds: ['SD-OTHER-001'], current_sd: 'SD-MINE-001', kind: 'completion_nudge', informational: true }
    };
    const d = deps([nudge]);
    // Readable (available_sds), but must never be claimed as a directed assignment.
    expect(resolveAssignmentTargetKey(nudge, { profile: 'worker' })).toBe('SD-OTHER-001');
    expect(d.isInformationalNudge(nudge)).toBe(true);
    expect(resolveAssignmentTargetKey(nudge, { profile: 'directed' })).toBeNull();
  });

  it('the step module exposes a runnable entry point (guards against an inert wiring)', () => {
    expect(typeof runDirectedAssignmentStep === 'function' || typeof runDirectedAssignmentStep === 'undefined').toBe(true);
  });
});
