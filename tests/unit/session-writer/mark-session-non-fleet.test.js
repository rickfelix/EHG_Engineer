/**
 * Unit tests for lib/session-writer.cjs::markSessionNonFleet
 * SD-LEO-INFRA-FIX-SESSION-REGISTER-001 (Layer 2)
 *
 * RCA 2026-07-12: a prior ad-hoc remediation full-REPLACED claude_sessions.metadata
 * when marking a row non_fleet, destroying fleet_identity/tier_rank/auto_proceed
 * with no trace. markSessionNonFleet must MERGE instead of replace, and must write
 * the human-readable reason to the top-level released_reason column, not inside
 * metadata.
 *
 * The Supabase client is passed explicitly (dependency injection) rather than
 * mocked via vi.mock, because markSessionNonFleet's internal require('./supabase-
 * client.cjs') is a native Node CJS require (this module is loaded via
 * createRequire), which Vitest's ESM-level module interception does not reach.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { markSessionNonFleet } = require('../../../lib/session-writer.cjs');

const rows = new Map();
function fakeClient() {
  return {
    from() {
      return {
        _id: null,
        select() { return this; },
        eq(col, val) { if (col === 'session_id') this._id = val; return this; },
        maybeSingle: function () {
          return Promise.resolve({ data: rows.get(this._id) || null, error: null });
        },
        update: function (patch) {
          return {
            eq(col, val) {
              const existing = rows.get(val) || {};
              rows.set(val, { ...existing, ...patch });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

describe('markSessionNonFleet (SD-LEO-INFRA-FIX-SESSION-REGISTER-001 FR-2)', () => {
  beforeEach(() => {
    rows.clear();
  });

  it('merges non_fleet:true into existing metadata rather than replacing it', async () => {
    rows.set('victim-session', {
      session_id: 'victim-session',
      metadata: {
        tier_rank: 4,
        auto_proceed: true,
        fleet_identity: { color: 'yellow', callsign: 'Alpha-4' },
        chain_orchestrators: true,
      },
    });

    await markSessionNonFleet('victim-session', 'test remediation reason', fakeClient());

    const after = rows.get('victim-session');
    expect(after.metadata.non_fleet).toBe(true);
    // Every pre-existing field must survive the merge.
    expect(after.metadata.tier_rank).toBe(4);
    expect(after.metadata.auto_proceed).toBe(true);
    expect(after.metadata.fleet_identity).toEqual({ color: 'yellow', callsign: 'Alpha-4' });
    expect(after.metadata.chain_orchestrators).toBe(true);
  });

  it('writes the reason to the top-level released_reason column, not inside metadata', async () => {
    rows.set('victim-session-2', { session_id: 'victim-session-2', metadata: { tier_rank: 2 } });

    await markSessionNonFleet('victim-session-2', 'phantom row suspected', fakeClient());

    const after = rows.get('victim-session-2');
    expect(after.released_reason).toBe('phantom row suspected');
    expect(after.metadata.released_reason).toBeUndefined();
  });

  it('handles a row with no prior metadata gracefully', async () => {
    rows.set('fresh-session', { session_id: 'fresh-session', metadata: null });

    await markSessionNonFleet('fresh-session', 'reason', fakeClient());

    const after = rows.get('fresh-session');
    expect(after.metadata).toEqual({ non_fleet: true });
  });

  it('throws when sessionId is missing', async () => {
    await expect(markSessionNonFleet(undefined, 'reason', fakeClient())).rejects.toThrow(/sessionId is required/);
  });
});
