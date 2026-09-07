/**
 * QF-20260710-435: fixture ventures cannot sit active+undeleted (fence-6 residue class).
 */

import { describe, test, expect, vi } from 'vitest';
import {
  isFixtureClassVenture,
  isLiveResidue,
  sweepFixtureResidue,
  CANARY_NAME,
} from '../../scripts/sweep-fixture-residue.mjs';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

describe('fixture-class predicate (QF-435 named classes)', () => {
  test.each([
    ['is_demo flag', { name: 'Anything', is_demo: true }],
    ['metadata.is_fixture', { name: 'Anything', metadata: { is_fixture: true } }],
    ['__e2e_ prefix', { name: '__e2e_product_review_gate_adv_123__' }],
    ['TEST- key prefix', { name: 'TEST-HARNESS-S20-run42' }],
    ['parity-test- prefix', { name: 'parity-test-foo' }],
    ['test-stub prefix', { name: 'test-stub-bar' }],
    ['Test Venture for prefix', { name: 'Test Venture for Owned-Audience Loop' }],
    // QF-20260905-720: six RealDB test-suite families measured 09-05 (caught only via is_demo
    // before this fix) plus three stall-alert specimens measured 09-07 (Adam's quiet tick).
    ['HCGate-RealDB- prefix', { name: 'HCGate-RealDB-daemon-unclassified-1788745800000' }],
    ['ProductReviewGate-RealDB- prefix', { name: 'ProductReviewGate-RealDB-adv-1788745800000' }],
    ['StageArtifactGate-RealDB- prefix', { name: 'StageArtifactGate-RealDB-deviated-1788745800000' }],
    ['TS-fixture- prefix', { name: 'TS-fixture-3f8e1c2a-9b4d-4a6e-8f1a-2c3d4e5f6a7b' }],
    ['artifact-gate-test- prefix', { name: 'artifact-gate-test-1788745800000' }],
    ['Pipeline-Test- prefix', { name: 'Pipeline-Test-1788745800000' }],
    ['Critical Attention prefix', { name: 'Critical Attention 1788745814692' }],
    ['Launch Checklist Test prefix', { name: 'Launch Checklist Test 1788745814737' }],
    ['Phase 6 Test Venture prefix (medial "Test Venture", not the leading "Test Venture for " alternative)', { name: 'Phase 6 Test Venture 1788745824906' }],
  ])('matches %s', (_label, row) => {
    expect(isFixtureClassVenture(row)).toBe(true);
  });

  test('real ventures and the canary are excluded', () => {
    expect(isFixtureClassVenture({ name: 'MarketLens', is_demo: false })).toBe(false);
    expect(isFixtureClassVenture({ name: CANARY_NAME, is_demo: true })).toBe(false);
  });
});

describe('live-residue predicate (fence-6 class: live + undeleted)', () => {
  test('active/paused undeleted fixtures are residue; cancelled or soft-deleted are not', () => {
    expect(isLiveResidue({ name: '__e2e_x__', status: 'active', deleted_at: null })).toBe(true);
    expect(isLiveResidue({ name: '__e2e_x__', status: 'paused', deleted_at: null })).toBe(true);
    expect(isLiveResidue({ name: '__e2e_x__', status: 'cancelled', deleted_at: null })).toBe(false);
    expect(isLiveResidue({ name: '__e2e_x__', status: 'active', deleted_at: '2026-07-10T00:00:00Z' })).toBe(false);
    expect(isLiveResidue({ name: 'RealCo', status: 'active', deleted_at: null })).toBe(false);
  });
});

describe('sweep: assert and fix modes', () => {
  function mockSupabase(rows, updates = []) {
    return {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: sweepFixtureResidue now
        // paginates via fetchAllPaginated, which appends .order()/.range() to the builder.
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: rows, error: null }),
        update: vi.fn((payload) => ({
          eq: vi.fn((col, id) => {
            updates.push({ id, payload });
            return Promise.resolve({ error: null });
          }),
        })),
      })),
    };
  }

  test('assert mode reports residue without touching rows', async () => {
    const rows = [{ id: 'v1', name: '__e2e_x__', status: 'paused', deleted_at: null }];
    const updates = [];
    const { residue, fixed } = await sweepFixtureResidue(mockSupabase(rows, updates), { logger: silentLogger });
    expect(residue).toHaveLength(1);
    expect(fixed).toBe(0);
    expect(updates).toHaveLength(0);
  });

  test('--fix soft-deletes residue (deleted_at + cancelled) — the sanctioned teardown', async () => {
    const rows = [
      { id: 'v1', name: '__e2e_x__', status: 'paused', deleted_at: null },
      { id: 'v2', name: 'RealCo', status: 'active', deleted_at: null }, // not residue
    ];
    const updates = [];
    const { residue, fixed } = await sweepFixtureResidue(mockSupabase(rows, updates), { fix: true, logger: silentLogger });
    expect(residue).toHaveLength(1);
    expect(fixed).toBe(1);
    expect(updates).toEqual([
      { id: 'v1', payload: expect.objectContaining({ status: 'cancelled', deleted_at: expect.any(String) }) },
    ]);
  });
});
