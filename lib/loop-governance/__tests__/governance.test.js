/**
 * Governance tests (FR-4 registration enforcement, FR-6 verifier-health, FR-7 digest).
 * (SD-LEO-INFRA-UNIVERSAL-LOOP-GOVERNANCE-001)
 */
import { describe, it, expect } from 'vitest';
import {
  assertLoopRegistrationHasPredicate,
  verifierHealth,
  buildLoopHealthDigest,
  registerDigestCadence,
  DIGEST_PROCESS_KEY,
} from '../governance.js';
import { PREDICATE_TYPES, LOOP_STATUS } from '../closure-engine.js';

const NOW = new Date('2026-07-13T12:00:00.000Z');
const ago = (s) => new Date(NOW.getTime() - s * 1000).toISOString();

describe('assertLoopRegistrationHasPredicate (FR-4)', () => {
  it('passes a loop registering with a valid closure predicate', () => {
    const r = assertLoopRegistrationHasPredicate({ predicate_type: PREDICATE_TYPES.EDGE_FRESHNESS, closure_predicate: { window_seconds: 3600 } });
    expect(r.ok).toBe(true);
    expect(r.reason).toMatch(/PRESENT/);
  });
  it('BLOCKS a loop registering with no closure predicate', () => {
    const r = assertLoopRegistrationHasPredicate({ predicate_type: null, closure_predicate: null });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/LOOP_CLOSURE_PREDICATE_MISSING/);
    expect(r.missing.length).toBeGreaterThan(0);
  });
});

describe('verifierHealth (FR-6 — D4 verifier-alive watch)', () => {
  it('DARK when the verifier is not registered', () => {
    const r = verifierHealth(null, NOW);
    expect(r.dark).toBe(true);
    expect(r.process_key).toBe('g3-armed-loop-closure-verifier');
  });
  it('alive-but-not-yet-fired when ARMED with a null witness', () => {
    const r = verifierHealth({ expected_interval_seconds: 86400, last_fired_at: null }, NOW);
    expect(r.alive).toBe(true);
    expect(r.dark).toBe(false);
  });
  it('alive when the witness is recent', () => {
    const r = verifierHealth({ expected_interval_seconds: 86400, last_fired_at: ago(3600) }, NOW);
    expect(r.alive).toBe(true);
  });
  it('DARK when the witness is stale beyond tolerance', () => {
    const r = verifierHealth({ expected_interval_seconds: 86400, last_fired_at: ago(86400 * 5) }, NOW, 2);
    expect(r.dark).toBe(true);
    expect(r.reason).toMatch(/DARK/);
  });
});

describe('buildLoopHealthDigest (FR-7 — monthly chairman digest)', () => {
  const loops = [
    { loop_key: 'L1', status: LOOP_STATUS.OPEN, vision_ladder_rung_id: 'v1' },
    { loop_key: 'L3', status: LOOP_STATUS.CLOSED, vision_ladder_rung_id: 'v1' },
    { loop_key: 'L5', status: LOOP_STATUS.STARVED, vision_ladder_rung_id: 'v2' },
  ];

  it('summarizes closed/open/starved and distance-to-V1', () => {
    const d = buildLoopHealthDigest(loops, { v1RungId: 'v1' });
    expect(d.summary.total).toBe(3);
    expect(d.summary.closed).toBe(1);
    expect(d.distanceToV1.total).toBe(2); // only v1-rung loops
    expect(d.distanceToV1.closed).toBe(1);
    expect(d.distanceToV1.distance).toBe(1);
  });

  it('surfaces exceptions (open/starved) for govern-by-exception', () => {
    const d = buildLoopHealthDigest(loops, {});
    expect(d.exceptions).toContain('L1:open');
    expect(d.exceptions).toContain('L5:starved');
    expect(d.exceptions).not.toContain('L3:closed');
  });

  it('detects DRIFT (a loop that regressed closed→open since the last snapshot)', () => {
    const d = buildLoopHealthDigest(
      [{ loop_key: 'L3', status: LOOP_STATUS.OPEN, vision_ladder_rung_id: 'v1' }],
      { previous: [{ loop_key: 'L3', status: LOOP_STATUS.CLOSED }] },
    );
    expect(d.drift).toContain('L3');
  });
});

describe('registerDigestCadence (FR-7 monthly cadence)', () => {
  it('arms the monthly digest with a ~30d interval', async () => {
    let upserted = null;
    const supabase = { from: () => ({ upsert: async (row) => { upserted = row; return { error: null }; } }) };
    const r = await registerDigestCadence(supabase);
    expect(r.ok).toBe(true);
    expect(upserted.expected_interval_seconds).toBe(30 * 86400);
    expect(DIGEST_PROCESS_KEY).toBe('g3-armed-loop-health-monthly-digest');
  });
});
