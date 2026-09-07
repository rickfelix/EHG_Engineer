/**
 * QF-20260906-553 — a released seat kept rendering status=stale badge=WORKING for up to an
 * hour after release. Chairman-facing: asked "is there an issue here" at /builder/sessions.
 *
 * ROOT CAUSE: server/routes/fleet-panel.js never selected released_at/released_reason from
 * v_active_sessions, and computed_status was measured NOT to flip to 'released' when
 * released_at is set (it stayed 'stale') — so heartbeat recency AND computed_status both fail
 * to discriminate a released seat whose orphan session-tick daemon keeps it heartbeating.
 *
 * Fix: select released_at/released_reason, drop released rows from the default view (mirrors
 * the existing identity-less-ghost filter), and pass releasedAt independently into
 * computeSessionBadge so even a ?all=1 request never renders WORKING for a released seat.
 */
import { describe, it, expect } from 'vitest';
import { formatSessionRow } from '../../../server/routes/fleet-panel.js';
import { computeSessionBadge } from '../../../lib/fleet/fleet-view-badges.cjs';

const row = (over = {}) => ({
  session_id: 'sess-released',
  sd_key: null,
  computed_status: 'stale', // measured: v_active_sessions does NOT flip this to 'released'
  heartbeat_age_human: '12m ago',
  heartbeat_age_seconds: 720,
  metadata: {},
  ...over,
});

describe('computeSessionBadge — releasedAt is checked independently (QF-20260906-553)', () => {
  it('ACCEPTANCE: a released-but-heartbeating row never renders badge WORKING', () => {
    const badge = computeSessionBadge({
      loopState: 'active', pAlive: 0.9, isSilent: false, computedStatus: 'stale',
      releasedAt: '2026-09-06T11:20:00Z',
    });
    expect(badge).toBe('OFF');
  });

  it('releasedAt wins even over a HIGH p_alive and active loop_state', () => {
    const badge = computeSessionBadge({ loopState: 'active', pAlive: 1, releasedAt: '2026-09-06T11:20:00Z' });
    expect(badge).toBe('OFF');
  });

  it('an UNRELEASED row (releasedAt null/absent) is unaffected — normal badge logic applies', () => {
    expect(computeSessionBadge({ loopState: 'active', pAlive: 0.9 })).toBe('WORKING');
    expect(computeSessionBadge({ loopState: 'active', pAlive: 0.9, releasedAt: null })).toBe('WORKING');
  });
});

describe('formatSessionRow — released_at travels through to the badge computation', () => {
  it('THE MEASURED DEFECT: a released row with computed_status still "stale" gets badge OFF, not WORKING', () => {
    const out = formatSessionRow(row({
      released_at: '2026-09-06T11:20:00Z',
      released_reason: 'sweep_stale_pid',
      metadata: { loop_state: 'active', p_alive: 0.95 },
    }));
    expect(out.badge).toBe('OFF');
    expect(out.released_at).toBe('2026-09-06T11:20:00Z');
  });

  it('a non-released row is unaffected and released_at is present-but-null', () => {
    const out = formatSessionRow(row({ metadata: { loop_state: 'active', p_alive: 0.9 } }));
    expect(out.released_at).toBeNull();
    expect(out.badge).not.toBe('OFF');
  });
});
