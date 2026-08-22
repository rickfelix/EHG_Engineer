/**
 * SD-LEO-INFRA-INTELLIGENT-ROUTING-RANK-001 (FR-3): belt admission awareness.
 *
 *   reorderByQuotaPosture reorders creative_design ("Fable-heavy") rows below         — TS-3
 *   non-creative_design rows ONLY when quotaPosture.leanFable is true, and is
 *   byte-identical to today's order when quotaPosture is absent/false (fail-safe).
 */
import { describe, it, expect } from 'vitest';
import { reorderByQuotaPosture, selectRefillBatch } from '../../../lib/sourcing-engine/refill-auto-promote.js';

// A creative_design row per lib/fleet/work-class.cjs's CREATIVE_RE (title match).
const creativeRow = (over = {}) => ({
  id: over.id || 'creative-1',
  title: 'Design a new landing page hero',
  source_type: 'conversion_ledger',
  source_id: 'led-c1',
  item_disposition: 'pending',
  promoted_to_sd_key: null,
  lane: 'belt',
  disposition: 'build',
  ...over,
});

// A general_harness row per GENERAL_RE (title match).
const generalRow = (over = {}) => ({
  id: over.id || 'general-1',
  title: 'Fix a flaky migration script',
  source_type: 'conversion_ledger',
  source_id: 'led-g1',
  item_disposition: 'pending',
  promoted_to_sd_key: null,
  lane: 'belt',
  disposition: 'build',
  ...over,
});

describe('reorderByQuotaPosture (FR-3)', () => {
  it('is a no-op (byte-identical order) when quotaPosture is absent', () => {
    const rows = [creativeRow({ id: 'c' }), generalRow({ id: 'g' })];
    expect(reorderByQuotaPosture(rows, undefined).map((r) => r.id)).toEqual(['c', 'g']);
  });

  it('is a no-op when quotaPosture.leanFable is false', () => {
    const rows = [creativeRow({ id: 'c' }), generalRow({ id: 'g' })];
    expect(reorderByQuotaPosture(rows, { leanFable: false }).map((r) => r.id)).toEqual(['c', 'g']);
  });

  it('sinks creative_design rows below non-creative_design rows when leanFable is true', () => {
    const rows = [creativeRow({ id: 'c1' }), generalRow({ id: 'g1' }), creativeRow({ id: 'c2' }), generalRow({ id: 'g2' })];
    const ordered = reorderByQuotaPosture(rows, { leanFable: true });
    expect(ordered.map((r) => r.id)).toEqual(['g1', 'g2', 'c1', 'c2']); // stable within each group
  });

  it('is total on empty/malformed input', () => {
    expect(reorderByQuotaPosture(null, { leanFable: true })).toEqual([]);
    expect(reorderByQuotaPosture(undefined, { leanFable: true })).toEqual([]);
  });
});

describe('selectRefillBatch + quotaPosture integration (FR-3)', () => {
  it('a lean-Fable week reorders the capped batch away from creative_design work', () => {
    const rows = [creativeRow({ id: 'c1' }), creativeRow({ id: 'c2' }), generalRow({ id: 'g1' })];
    const sel = selectRefillBatch(rows, { limit: 2, quotaPosture: { leanFable: true } });
    // Without reordering, insertion order would cap at [c1, c2] (both creative); with FR-3 the
    // general row is admitted into the capped batch instead.
    expect(sel.batch.map((r) => r.id)).toEqual(['g1', 'c1']);
  });

  it('omitted quotaPosture reproduces the pre-FR-3 batch exactly (fail-safe default)', () => {
    const rows = [creativeRow({ id: 'c1' }), creativeRow({ id: 'c2' }), generalRow({ id: 'g1' })];
    const withoutQuota = selectRefillBatch(rows, { limit: 2 });
    expect(withoutQuota.batch.map((r) => r.id)).toEqual(['c1', 'c2']);
  });
});
