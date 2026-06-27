// QF-20260627-531: capture-session-id.cjs upserts claude_sessions with
// Prefer: resolution=merge-duplicates, which REPLACES the whole jsonb metadata column on conflict.
// Writing a fresh { cc_pid, source } object blanked coordinator-stamped fields (callsign, tier_rank)
// on every SessionStart recapture — the 2nd callsign-churn source (sibling to QF-20260627-108).
// buildSessionMetadata must spread the existing metadata first so those fields survive.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildSessionMetadata } = require('../../scripts/hooks/capture-session-id.cjs');

describe('QF-20260627-531: buildSessionMetadata merge-preserves stamped fields', () => {
  it('preserves coordinator-stamped callsign + tier_rank while stamping telemetry fields', () => {
    const existing = { callsign: 'Golf', tier_rank: 2, fleet_identity: { callsign: 'Golf', color: 'blue' } };
    const merged = buildSessionMetadata(existing, '12345', 'sessionstart');
    expect(merged.callsign).toBe('Golf');
    expect(merged.tier_rank).toBe(2);
    expect(merged.fleet_identity).toEqual({ callsign: 'Golf', color: 'blue' });
    expect(merged.cc_pid).toBe('12345');
    expect(merged.source).toBe('sessionstart');
  });

  it('overwrites stale telemetry fields but keeps everything else', () => {
    const existing = { callsign: 'Foxtrot', tier_rank: 3, cc_pid: 'OLD', source: 'old' };
    const merged = buildSessionMetadata(existing, 'NEW', 'recapture');
    expect(merged.cc_pid).toBe('NEW');
    expect(merged.source).toBe('recapture');
    expect(merged.callsign).toBe('Foxtrot');
    expect(merged.tier_rank).toBe(3);
  });

  it('defaults source to "unknown" and tolerates missing/invalid existing metadata (new session)', () => {
    expect(buildSessionMetadata(null, '9', undefined)).toEqual({ cc_pid: '9', source: 'unknown' });
    expect(buildSessionMetadata(undefined, '9', '')).toEqual({ cc_pid: '9', source: 'unknown' });
    // An array/other non-object is ignored (treated as empty base) — never spreads garbage.
    expect(buildSessionMetadata(['x'], '9', 's')).toEqual({ cc_pid: '9', source: 's' });
  });
});
