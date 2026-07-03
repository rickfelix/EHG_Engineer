/**
 * Unit tests for lib/governance/work-boundary-gauges.js's pure detectors.
 *
 * SD-LEO-INFRA-009-LEAF-WORK-001 (C-009 leaf 5): work-boundary gauges generalized from the
 * coordinator lesson (coordinator never sources, Adam never claims/builds, Solomon never dispatches).
 *
 * @module tests/unit/governance/work-boundary-gauges.test.js
 */

import { describe, it, expect } from 'vitest';
import {
  detectCoordinatorSourced,
  detectRoleClaimed,
  detectRoleDispatched,
} from '../../../lib/governance/work-boundary-gauges.js';

describe('detectCoordinatorSourced', () => {
  it('flags a row sourced by "coordinator-<hash>" and a row sourced by bare "coordinator"', () => {
    const rows = [
      { sd_key: 'SD-A', sourced_by: 'coordinator-8ba91784' },
      { sd_key: 'SD-B', sourced_by: 'coordinator' },
    ];
    const result = detectCoordinatorSourced(rows);
    expect(result.count).toBe(2);
    expect(result.flagged.sort()).toEqual(['SD-A', 'SD-B']);
  });

  it('does not flag an adam-sourced row or a row with no sourced_by', () => {
    const rows = [
      { sd_key: 'SD-C', sourced_by: 'adam-9300782d' },
      { sd_key: 'SD-D', sourced_by: null },
      { sd_key: 'SD-E' },
    ];
    expect(detectCoordinatorSourced(rows)).toEqual({ count: 0, flagged: [] });
  });

  it('is case-insensitive on the prefix match', () => {
    const rows = [{ sd_key: 'SD-F', sourced_by: 'Coordinator-abc' }];
    expect(detectCoordinatorSourced(rows)).toEqual({ count: 1, flagged: ['SD-F'] });
  });

  it('handles an empty/undefined row list defensively', () => {
    expect(detectCoordinatorSourced([])).toEqual({ count: 0, flagged: [] });
    expect(detectCoordinatorSourced(undefined)).toEqual({ count: 0, flagged: [] });
  });
});

describe('detectRoleClaimed', () => {
  const ADAM_SESSIONS = ['adam-session-1', 'adam-session-2'];

  it('flags a row via its live claiming_session_id matching a role session id', () => {
    const rows = [{ sd_key: 'SD-A', claiming_session_id: 'adam-session-1', claim_history: [] }];
    expect(detectRoleClaimed(rows, ADAM_SESSIONS)).toEqual({ count: 1, flagged: ['SD-A'] });
  });

  it('flags a row via a historical claim_history entry even when claiming_session_id is null (released-but-still-flagged)', () => {
    const rows = [{
      sd_key: 'SD-B',
      claiming_session_id: null,
      claim_history: [{ claimed_at: '2026-01-01T00:00:00Z', session_id: 'adam-session-2' }],
    }];
    expect(detectRoleClaimed(rows, ADAM_SESSIONS)).toEqual({ count: 1, flagged: ['SD-B'] });
  });

  it('flags a row via claim_history even when the CURRENT claiming_session_id belongs to a different session', () => {
    const rows = [{
      sd_key: 'SD-C',
      claiming_session_id: 'some-worker-session',
      claim_history: [{ session_id: 'adam-session-1' }, { session_id: 'some-worker-session' }],
    }];
    expect(detectRoleClaimed(rows, ADAM_SESSIONS)).toEqual({ count: 1, flagged: ['SD-C'] });
  });

  it('does not flag a row with no matching session anywhere', () => {
    const rows = [{
      sd_key: 'SD-D',
      claiming_session_id: 'some-worker-session',
      claim_history: [{ session_id: 'some-other-worker' }],
    }];
    expect(detectRoleClaimed(rows, ADAM_SESSIONS)).toEqual({ count: 0, flagged: [] });
  });

  it('handles missing claim_history / empty role set defensively', () => {
    const rows = [{ sd_key: 'SD-E', claiming_session_id: null }];
    expect(detectRoleClaimed(rows, ADAM_SESSIONS)).toEqual({ count: 0, flagged: [] });
    expect(detectRoleClaimed(rows, [])).toEqual({ count: 0, flagged: [] });
    expect(detectRoleClaimed([], ADAM_SESSIONS)).toEqual({ count: 0, flagged: [] });
  });
});

describe('detectRoleDispatched', () => {
  const SOLOMON_SESSIONS = ['solomon-session-1'];

  it('flags a row whose dispatch_rank_by matches a role session id', () => {
    const rows = [{ sd_key: 'SD-A', dispatch_rank_by: 'solomon-session-1' }];
    expect(detectRoleDispatched(rows, SOLOMON_SESSIONS)).toEqual({ count: 1, flagged: ['SD-A'] });
  });

  it('does not flag null or non-matching dispatch_rank_by', () => {
    const rows = [
      { sd_key: 'SD-B', dispatch_rank_by: null },
      { sd_key: 'SD-C', dispatch_rank_by: 'coordinator-session-1' },
    ];
    expect(detectRoleDispatched(rows, SOLOMON_SESSIONS)).toEqual({ count: 0, flagged: [] });
  });

  it('handles an empty/undefined row list defensively', () => {
    expect(detectRoleDispatched([], SOLOMON_SESSIONS)).toEqual({ count: 0, flagged: [] });
    expect(detectRoleDispatched(undefined, SOLOMON_SESSIONS)).toEqual({ count: 0, flagged: [] });
  });
});
