/**
 * Tests for Claim Health modules
 * SD-LEO-INFRA-INTELLIGENT-CLAIM-HEALTH-001
 */

import { describe, it, expect } from 'vitest';
import { shouldCreateNewSession } from '../scripts/modules/claim-health/collision-guard.js';

describe('collision-guard: shouldCreateNewSession', () => {
  it('returns false when no existing session', () => {
    const result = shouldCreateNewSession(null);
    expect(result.shouldCreateNew).toBe(false);
    expect(result.reason).toBe('no_existing_session');
  });

  it('returns false when existing session has no SD claim', () => {
    const result = shouldCreateNewSession({
      session_id: 'session_abc',
      sd_id: null,
      status: 'active'
    });
    expect(result.shouldCreateNew).toBe(false);
    expect(result.reason).toBe('no_active_claim');
  });

  it('returns true when existing session has active SD claim', () => {
    const result = shouldCreateNewSession({
      session_id: 'session_abc',
      sd_id: 'SD-FEATURE-001',
      status: 'active'
    });
    expect(result.shouldCreateNew).toBe(true);
    expect(result.reason).toBe('existing_session_has_claim');
    expect(result.claimedSd).toBe('SD-FEATURE-001');
  });

  it('returns true when existing session has idle SD claim', () => {
    const result = shouldCreateNewSession({
      session_id: 'session_abc',
      sd_id: 'SD-FIX-002',
      status: 'idle'
    });
    expect(result.shouldCreateNew).toBe(true);
  });

  it('returns false when existing session is released with SD', () => {
    const result = shouldCreateNewSession({
      session_id: 'session_abc',
      sd_id: 'SD-FIX-002',
      status: 'released'
    });
    expect(result.shouldCreateNew).toBe(false);
    expect(result.reason).toBe('no_active_claim');
  });
});
