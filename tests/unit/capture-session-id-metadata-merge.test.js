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

  // SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-B (FR-8): persist model to the DB, not just the
  // local marker file.
  it('FR-8: persists model into metadata when provided', () => {
    const merged = buildSessionMetadata({}, '9', 'sessionstart', 'sonnet');
    expect(merged.model).toBe('sonnet');
  });

  it('FR-8: omitting model (4th arg absent) does NOT add a model key — backward compatible with pre-FR-8 call sites', () => {
    const merged = buildSessionMetadata({}, '9', 'sessionstart');
    expect(merged).not.toHaveProperty('model');
  });

  it('FR-8: an already-DB-stamped metadata.model is never clobbered by an absent/null model this call', () => {
    const existing = { model: 'opus', callsign: 'Golf' };
    const merged = buildSessionMetadata(existing, '9', 'recapture', null);
    expect(merged.model).toBe('opus'); // preserved, not overwritten by the null 4th arg
  });

  it('FR-8: a fresh model self-report DOES update a previously-stamped model', () => {
    const existing = { model: 'opus' };
    const merged = buildSessionMetadata(existing, '9', 'sessionstart', 'fable');
    expect(merged.model).toBe('fable');
  });

  // QF-20260710-406: a SessionStart-observed model CHANGE must re-derive tier_rank so a
  // mid-session /model switch self-heals at the next natural session-lifecycle boundary.
  describe('QF-20260710-406: tier_rank re-derives on a genuine model change', () => {
    it('demotes a stale fable/4 stamp when SessionStart reports a downgrade to sonnet', () => {
      const existing = { model: 'fable', effort: 'high', tier_rank: 4 };
      const merged = buildSessionMetadata(existing, '9', 'compact', 'sonnet');
      expect(merged.model).toBe('sonnet');
      expect(merged.tier_rank).toBe(2); // rankForModelEffort('sonnet', 'high')
    });

    it('does NOT touch tier_rank when the reported model is unchanged from the prior stamp', () => {
      const existing = { model: 'fable', effort: 'high', tier_rank: 4 };
      const merged = buildSessionMetadata(existing, '9', 'compact', 'fable');
      expect(merged.tier_rank).toBe(4);
    });

    it('resolves a raw/versioned model identifier via family-substring match, not the fail-safe fallback', () => {
      const existing = { model: 'fable', effort: 'high', tier_rank: 4 };
      const merged = buildSessionMetadata(existing, '9', 'resume', 'claude-sonnet-5-20260601');
      expect(merged.tier_rank).toBe(2); // resolved to 'sonnet', not conservative-up to fable's rank
    });

    it('derives tier_rank using the already-stamped effort, not a default', () => {
      const existing = { model: 'fable', effort: 'low', tier_rank: 4 };
      const merged = buildSessionMetadata(existing, '9', 'clear', 'sonnet');
      expect(merged.tier_rank).toBe(1); // rankForModelEffort('sonnet', 'low')
    });
  });
});
