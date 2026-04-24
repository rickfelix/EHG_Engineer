/**
 * Unit tests for SD-MAN-INFRA-NEXT-CONTENTION-DETECTOR-001
 * Covers checkEnrichmentSignal in scripts/modules/sd-next/claim-analysis.js
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkEnrichmentSignal } from '../../../scripts/modules/sd-next/claim-analysis.js';

const SESSION_A = '11111111-1111-1111-1111-111111111111';
const SESSION_B = '22222222-2222-2222-2222-222222222222';

function minutesAgo(min) {
  return new Date(Date.now() - min * 60_000).toISOString();
}

describe('checkEnrichmentSignal — FR for SD-MAN-INFRA-NEXT-CONTENTION-DETECTOR-001', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.CONTENTION_DETECTOR_WINDOW_MIN;
    delete process.env.CONTENTION_DETECTOR_WINDOW_MIN;
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CONTENTION_DETECTOR_WINDOW_MIN;
    else process.env.CONTENTION_DETECTOR_WINDOW_MIN = originalEnv;
  });

  it('Case (a): updated_by matches an active session within window → inProgress:true', () => {
    const sd = { updated_by: SESSION_A, updated_at: minutesAgo(3) };
    const activeSessions = [
      { session_id: SESSION_A, status: 'active', heartbeat_age_seconds: 30 },
      { session_id: SESSION_B, status: 'active', heartbeat_age_seconds: 5 },
    ];
    const result = checkEnrichmentSignal({ sd, activeSessions });
    expect(result.inProgress).toBe(true);
    expect(result.sessionId).toBe(SESSION_A);
    expect(result.ageMin).toBe(3);
    expect(result.reason).toBe('active_match_within_window');
  });

  it('Case (b): updated_by matches a released session → inProgress:false (no upgrade)', () => {
    const sd = { updated_by: SESSION_A, updated_at: minutesAgo(2) };
    const activeSessions = [
      { session_id: SESSION_A, status: 'released', heartbeat_age_seconds: 30 },
    ];
    const result = checkEnrichmentSignal({ sd, activeSessions });
    expect(result.inProgress).toBe(false);
    expect(result.reason).toBe('no_active_match');
    expect(result.sessionId).toBe(SESSION_A);
  });

  it('Case (c): updated_at older than window → inProgress:false (window expired)', () => {
    const sd = { updated_by: SESSION_A, updated_at: minutesAgo(60) };
    const activeSessions = [
      { session_id: SESSION_A, status: 'active', heartbeat_age_seconds: 30 },
    ];
    const result = checkEnrichmentSignal({ sd, activeSessions, recencyMinutes: 10 });
    expect(result.inProgress).toBe(false);
    expect(result.reason).toBe('window_expired');
    expect(result.ageMin).toBe(60);
  });

  it('returns no_sd when sd is missing or wrong type', () => {
    expect(checkEnrichmentSignal({ sd: null, activeSessions: [] }).reason).toBe('no_sd');
    expect(checkEnrichmentSignal({ sd: undefined, activeSessions: [] }).reason).toBe('no_sd');
    expect(checkEnrichmentSignal({ sd: 'not-an-object', activeSessions: [] }).reason).toBe('no_sd');
  });

  it('fail-fast on missing source columns (no silent-false fallback)', () => {
    const sd = { /* no updated_by, no updated_at */ };
    const result = checkEnrichmentSignal({ sd, activeSessions: [] });
    expect(result.inProgress).toBe(false);
    expect(result.reason).toBe('missing_source_columns');
  });

  it('returns no_enrichment when columns exist but values are null', () => {
    const sd = { updated_by: null, updated_at: null };
    const result = checkEnrichmentSignal({ sd, activeSessions: [] });
    expect(result.inProgress).toBe(false);
    expect(result.reason).toBe('no_enrichment');
  });

  it('returns invalid_updated_at on unparseable timestamp', () => {
    const sd = { updated_by: SESSION_A, updated_at: 'not-a-date' };
    const result = checkEnrichmentSignal({ sd, activeSessions: [] });
    expect(result.inProgress).toBe(false);
    expect(result.reason).toBe('invalid_updated_at');
  });

  it('respects recencyMinutes argument over the env default', () => {
    process.env.CONTENTION_DETECTOR_WINDOW_MIN = '60';
    const sd = { updated_by: SESSION_A, updated_at: minutesAgo(8) };
    const activeSessions = [{ session_id: SESSION_A, status: 'active' }];
    // Explicit recencyMinutes=5 should win over env CONTENTION_DETECTOR_WINDOW_MIN=60
    const result = checkEnrichmentSignal({ sd, activeSessions, recencyMinutes: 5 });
    expect(result.inProgress).toBe(false);
    expect(result.reason).toBe('window_expired');
  });

  it('respects CONTENTION_DETECTOR_WINDOW_MIN env when no explicit recencyMinutes', () => {
    process.env.CONTENTION_DETECTOR_WINDOW_MIN = '30';
    const sd = { updated_by: SESSION_A, updated_at: minutesAgo(20) };
    const activeSessions = [{ session_id: SESSION_A, status: 'active' }];
    const result = checkEnrichmentSignal({ sd, activeSessions });
    // 20 min < 30 min env window, and session active → upgrade
    expect(result.inProgress).toBe(true);
    expect(result.sessionId).toBe(SESSION_A);
  });

  it('disables the check when recencyMinutes <= 0 (emergency disable)', () => {
    const sd = { updated_by: SESSION_A, updated_at: minutesAgo(1) };
    const activeSessions = [{ session_id: SESSION_A, status: 'active' }];
    const result = checkEnrichmentSignal({ sd, activeSessions, recencyMinutes: 0 });
    expect(result.inProgress).toBe(false);
    expect(result.reason).toBe('window_disabled');
  });

  it('ignores activeSessions whose status is not exactly "active"', () => {
    const sd = { updated_by: SESSION_A, updated_at: minutesAgo(2) };
    const activeSessions = [
      { session_id: SESSION_A, status: 'idle' },
      { session_id: SESSION_A, status: 'stale' },
    ];
    const result = checkEnrichmentSignal({ sd, activeSessions });
    expect(result.inProgress).toBe(false);
    expect(result.reason).toBe('no_active_match');
  });
});
