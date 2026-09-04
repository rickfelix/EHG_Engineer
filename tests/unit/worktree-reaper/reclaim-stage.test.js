/**
 * Unit tests for lib/worktree-reaper/reclaim-stage.js
 * SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001 FR-1b.
 */

import { describe, it, expect } from 'vitest';
import { isHolderPidResident, evaluateReclaimEligibility, RECLAIM_VERDICT } from '../../../lib/worktree-reaper/reclaim-stage.js';

const NOW = Date.parse('2026-09-04T12:00:00.000Z');

describe('isHolderPidResident()', () => {
  it('is false when there is no holder record', () => {
    expect(isHolderPidResident(null)).toBe(false);
  });

  it('checks the marker-dir UNION, not just the first directory', () => {
    const seen = [];
    const result = isHolderPidResident(
      { session_id: 's1' },
      {
        markerDirsFn: () => ['local-dir', 'main-worktree-dir'],
        getMarkerSessionIdsFn: (dir) => { seen.push(dir); return dir === 'main-worktree-dir' ? { s1: { alive: true } } : {}; },
      }
    );
    expect(seen).toEqual(['local-dir', 'main-worktree-dir']);
    expect(result).toBe(true);
  });

  it('is false when no marker dir reports the holder alive', () => {
    const result = isHolderPidResident(
      { session_id: 's1' },
      { markerDirsFn: () => ['dir1'], getMarkerSessionIdsFn: () => ({}) }
    );
    expect(result).toBe(false);
  });
});

describe('evaluateReclaimEligibility()', () => {
  const baseOpts = { markerDirsFn: () => ['dir1'], getMarkerSessionIdsFn: () => ({}) };

  it('is eligible when content is safe, no resident PID, holder released, and audit accepted', () => {
    const result = evaluateReclaimEligibility(
      { contentSafe: true, holder: { session_id: 's1', released_at: '2026-09-04T11:00:00.000Z' }, auditAccepted: true, nowMs: NOW },
      baseOpts
    );
    expect(result).toEqual({ eligible: true, reason: 'reclaim_eligible' });
  });

  it('is eligible with no holder record at all (vacuously not resident, not stale-gated)', () => {
    const result = evaluateReclaimEligibility(
      { contentSafe: true, holder: null, auditAccepted: true, nowMs: NOW },
      baseOpts
    );
    expect(result).toEqual({ eligible: true, reason: 'reclaim_eligible' });
  });

  it('refuses when the audit sink did not accept the classification row (FR-3 dependency)', () => {
    const result = evaluateReclaimEligibility(
      { contentSafe: true, holder: null, auditAccepted: false, nowMs: NOW },
      baseOpts
    );
    expect(result).toEqual({ eligible: false, reason: 'audit_not_accepted' });
  });

  it('refuses when content is not yet safe (no verified preserve, tree not clean)', () => {
    const result = evaluateReclaimEligibility(
      { contentSafe: false, holder: null, auditAccepted: true, nowMs: NOW },
      baseOpts
    );
    expect(result).toEqual({ eligible: false, reason: 'content_not_safe' });
  });

  it('TS-3: a live owner (fresh last_tool_at pair, <30min) is never reclaimed, even with content safe', () => {
    const holder = { session_id: 's1', released_at: null, loop_state: 'active', last_tool_at: new Date(NOW - 2 * 60000).toISOString() };
    const result = evaluateReclaimEligibility({ contentSafe: true, holder, auditAccepted: true, nowMs: NOW }, baseOpts);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('holder_not_stale');
  });

  it('TS-6: a resident PID blocks reclaim regardless of tool-clock staleness', () => {
    const holder = { session_id: 's1', released_at: null, loop_state: 'active', last_tool_at: new Date(NOW - 999 * 60000).toISOString() };
    const result = evaluateReclaimEligibility(
      { contentSafe: true, holder, auditAccepted: true, nowMs: NOW },
      { markerDirsFn: () => ['dir1'], getMarkerSessionIdsFn: () => ({ s1: { alive: true } }) }
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('holder_pid_resident');
  });

  it('is eligible when the tool clock is frozen past the freeze-cut and no PID is resident', () => {
    const holder = { session_id: 's1', released_at: null, loop_state: 'active', last_tool_at: new Date(NOW - 999 * 60000).toISOString() };
    const result = evaluateReclaimEligibility({ contentSafe: true, holder, auditAccepted: true, nowMs: NOW, freezeCutMinutes: 60 }, baseOpts);
    expect(result).toEqual({ eligible: true, reason: 'reclaim_eligible' });
  });

  it('RECLAIM_VERDICT.REMOVED is the exact literal reclaim_removed', () => {
    expect(RECLAIM_VERDICT.REMOVED).toBe('reclaim_removed');
  });
});
