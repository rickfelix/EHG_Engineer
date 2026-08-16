/**
 * Unit tests for the extracted auto-start predicate module.
 * SD: SD-LEO-INFRA-QF-SUPPLY-PREDICATE-AUTO-START-001 (FR-1)
 *
 * isAutoStartableQF/TIER3_RISK_RE/STALE_QF_DAYS moved out of scripts/worker-checkin.cjs
 * into lib/fleet/qf-auto-start.cjs so lib/fleet/belt-depth.cjs (FR-3) can share the exact
 * predicate the worker claim path uses, rather than the deliberately looser
 * lib/coordinator/qf-supply-predicate.cjs (a different consumer's contract — see
 * tests/unit/coordinator/qf-supply-gauge-agreement.test.js for why the two must diverge).
 *
 * This file tests the module DIRECTLY at its new import path — one representative case per
 * exclusion branch, not an exhaustive matrix. The exhaustive edge-case scenarios (factory_lane,
 * not_before, TIER3_RISK_RE title-vs-description) already live in
 * tests/unit/worker-checkin-qf-{factory-lane,not-before,tier3-risk-description}.test.js and
 * continue to pin the SAME code via worker-checkin.cjs's re-export (FR-2) — duplicating them
 * here would just be two places that can silently drift apart.
 */
import { describe, test, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isAutoStartableQF, TIER3_RISK_RE, STALE_QF_DAYS } = require('../../../lib/fleet/qf-auto-start.cjs');

const NOW = Date.parse('2026-08-15T12:00:00Z');

function qf(overrides = {}) {
  return {
    id: 'QF-20260815-001',
    status: 'open',
    pr_url: null,
    commit_sha: null,
    created_at: '2026-08-15T00:00:00Z',
    routing_tier: null,
    title: 'Fix a benign typo',
    description: 'No behavioral change.',
    severity: 'medium',
    not_before: null,
    factory_lane: false,
    owner: null,
    release_condition: null,
    ...overrides,
  };
}

describe('lib/fleet/qf-auto-start.cjs — module surface', () => {
  test('exports isAutoStartableQF, TIER3_RISK_RE, STALE_QF_DAYS from the new location', () => {
    expect(typeof isAutoStartableQF).toBe('function');
    expect(TIER3_RISK_RE).toBeInstanceOf(RegExp);
    expect(typeof STALE_QF_DAYS).toBe('number');
    expect(STALE_QF_DAYS).toBeGreaterThan(0);
  });
});

describe('isAutoStartableQF — one representative case per exclusion branch', () => {
  test('admits a fully-eligible open, fresh, low-risk QF (happy path)', () => {
    expect(isAutoStartableQF(qf(), NOW)).toBe(true);
  });

  test('excludes a null/undefined row and a non-open status', () => {
    expect(isAutoStartableQF(null, NOW)).toBe(false);
    expect(isAutoStartableQF(undefined, NOW)).toBe(false);
    expect(isAutoStartableQF(qf({ status: 'in_progress' }), NOW)).toBe(false);
    expect(isAutoStartableQF(qf({ status: 'completed' }), NOW)).toBe(false);
  });

  test('excludes a fixture row (QF-TEST-* id marker)', () => {
    expect(isAutoStartableQF(qf({ id: 'QF-TEST-001' }), NOW)).toBe(false);
  });

  test('excludes a row already in flight (pr_url or commit_sha set)', () => {
    expect(isAutoStartableQF(qf({ pr_url: 'https://github.com/x/y/pull/1' }), NOW)).toBe(false);
    expect(isAutoStartableQF(qf({ commit_sha: 'abc123' }), NOW)).toBe(false);
  });

  test('excludes factory_lane=true, admits factory_lane=false/undefined', () => {
    expect(isAutoStartableQF(qf({ factory_lane: true }), NOW)).toBe(false);
    expect(isAutoStartableQF(qf({ factory_lane: false }), NOW)).toBe(true);
    const noColumn = qf();
    delete noColumn.factory_lane;
    expect(isAutoStartableQF(noColumn, NOW)).toBe(true);
  });

  test('excludes a persisted Tier-3 routing_tier, admits Tier 1/2', () => {
    expect(isAutoStartableQF(qf({ routing_tier: 3 }), NOW)).toBe(false);
    expect(isAutoStartableQF(qf({ routing_tier: 1 }), NOW)).toBe(true);
    expect(isAutoStartableQF(qf({ routing_tier: 2 }), NOW)).toBe(true);
  });

  test('excludes a TIER3_RISK_RE keyword match in title or description', () => {
    expect(isAutoStartableQF(qf({ title: 'rotate auth credentials' }), NOW)).toBe(false);
    expect(isAutoStartableQF(qf({ description: 'apply the pending schema migration' }), NOW)).toBe(false);
  });

  test('excludes a not_before still in the future, admits one already past', () => {
    expect(isAutoStartableQF(qf({ not_before: '2026-08-16T00:00:00Z' }), NOW)).toBe(false);
    expect(isAutoStartableQF(qf({ not_before: '2026-08-01T00:00:00Z' }), NOW)).toBe(true);
  });

  test('excludes a chairman-gated hold (owner=chairman + non-empty release_condition)', () => {
    expect(isAutoStartableQF(qf({ owner: 'chairman', release_condition: 'EU-send-planned' }), NOW)).toBe(false);
    // fail-open: owner alone, or condition alone, is not a gate
    expect(isAutoStartableQF(qf({ owner: 'chairman', release_condition: null }), NOW)).toBe(true);
  });

  test('excludes a stale QF (age >= STALE_QF_DAYS), admits one just inside the window', () => {
    const staleCreated = new Date(NOW - (STALE_QF_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
    const freshCreated = new Date(NOW - (STALE_QF_DAYS - 1) * 24 * 60 * 60 * 1000).toISOString();
    expect(isAutoStartableQF(qf({ created_at: staleCreated }), NOW)).toBe(false);
    expect(isAutoStartableQF(qf({ created_at: freshCreated }), NOW)).toBe(true);
  });

  test('excludes an unparseable created_at rather than throwing', () => {
    expect(isAutoStartableQF(qf({ created_at: 'not-a-date' }), NOW)).toBe(false);
    expect(isAutoStartableQF(qf({ created_at: null }), NOW)).toBe(false);
  });
});

// SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001 (FR-6): verified_at is a second, more-recent
// age-source signal a disposition-sweep re-verify can stamp. The age computation takes the
// MOST RECENT of verified_at/created_at (Math.max on epoch ms), so a stale row the sweep just
// re-verified re-enters auto-start immediately rather than waiting for a fresh created_at.
describe('isAutoStartableQF — FR-6 verified_at age-source', () => {
  const staleCreated = new Date(NOW - (STALE_QF_DAYS + 30) * 24 * 60 * 60 * 1000).toISOString(); // now-60d-ish
  const recentVerified = new Date(NOW - 1 * 24 * 60 * 60 * 1000).toISOString(); // now-1d

  test('a row with verified_at=now-1d and created_at=now-60d IS auto-startable (was NOT, before this fix)', () => {
    expect(isAutoStartableQF(qf({ created_at: staleCreated }), NOW)).toBe(false); // baseline: created_at alone is stale
    expect(isAutoStartableQF(qf({ created_at: staleCreated, verified_at: recentVerified }), NOW)).toBe(true);
  });

  test('verified_at absent/undefined degrades to created_at-only (pre-migration / not-yet-selected column)', () => {
    const row = qf({ created_at: staleCreated });
    delete row.verified_at;
    expect(isAutoStartableQF(row, NOW)).toBe(false);
    expect(isAutoStartableQF(qf({ created_at: staleCreated, verified_at: null }), NOW)).toBe(false);
  });

  test('an OLDER verified_at than created_at does not resurrect staleness — created_at (the more recent) still wins', () => {
    const veryOldVerified = new Date(NOW - (STALE_QF_DAYS + 90) * 24 * 60 * 60 * 1000).toISOString();
    const freshCreated = new Date(NOW - (STALE_QF_DAYS - 1) * 24 * 60 * 60 * 1000).toISOString();
    expect(isAutoStartableQF(qf({ created_at: freshCreated, verified_at: veryOldVerified }), NOW)).toBe(true);
  });

  test('both verified_at and created_at unparseable excludes (fail-closed), never throws', () => {
    expect(isAutoStartableQF(qf({ created_at: 'not-a-date', verified_at: 'also-not-a-date' }), NOW)).toBe(false);
  });
});
