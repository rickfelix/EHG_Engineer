/**
 * Capability Scope Unification Tests
 * SD: SD-LEO-GEN-UNIFY-VENTURE-CAPABILITIES-001 | US-002 / US-006 (FR-2, FR-6)
 *
 * Covers:
 *   - resolveCapabilityScope (pure unit, no DB) — the canonical scope derivation
 *     that the v_unified_capabilities view mirrors.
 *   - toVentureCapabilityRow (pure unit) — backfill mapping determinism.
 *   - v_unified_capabilities exposes a 3-way scope + plane1_score (DB).
 *   - sd_capabilities rows resolve to platform (EHG_Engineer) / application (EHG) (DB).
 *   - v_scanner_capabilities still resolves after the view change (DB regression).
 *   - cross-venture graph returns non-empty data after seeding shared capabilities (DB).
 *   - backfill idempotency guard detects already-present rows (DB).
 */

import { describe, it, expect, afterEach } from 'vitest';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../../lib/supabase-client.js';
import {
  resolveCapabilityScope,
  isValidCapabilityScope,
  CAPABILITY_SCOPES,
} from '../../../lib/capabilities/capability-taxonomy.js';
import { toVentureCapabilityRow, VENTURE_MATURITY_LEVELS } from '../../../scripts/one-off/backfill-venture-capabilities.mjs';
import { buildCrossVentureGraph } from '../../../lib/governance/cross-venture-capability-graph.js';

dotenv.config();

// Gate: skip DB tests when no real DB is available (mirrors scoring-lifecycle.test.js).
const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

// ─────────────────────────────────────────────────────────────────────────────
// UNIT TESTS — no DB required
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCapabilityScope — unit (no DB)', () => {
  it('US2-1: venture_id present resolves to "venture" (even with target_application set)', () => {
    expect(resolveCapabilityScope({ ventureId: 'abc-123', targetApplication: 'EHG' })).toBe('venture');
    expect(resolveCapabilityScope({ ventureId: '0e6449d9-aaa1-4de5-8aba-c81fe0238b98' })).toBe('venture');
  });

  it('US2-2: EHG_Engineer target_application resolves to "platform"', () => {
    expect(resolveCapabilityScope({ targetApplication: 'EHG_Engineer' })).toBe('platform');
  });

  it('US2-3: a non-platform application (EHG) resolves to "application"', () => {
    expect(resolveCapabilityScope({ targetApplication: 'EHG' })).toBe('application');
    expect(resolveCapabilityScope({ targetApplication: 'CronGenius' })).toBe('application');
  });

  it('US2-4: null/empty target_application defaults to "platform"', () => {
    expect(resolveCapabilityScope({})).toBe('platform');
    expect(resolveCapabilityScope({ targetApplication: null })).toBe('platform');
    expect(resolveCapabilityScope({ targetApplication: '   ' })).toBe('platform');
    expect(resolveCapabilityScope()).toBe('platform');
  });

  it('US2-5: platform match is case-insensitive and tolerates the hyphen variant', () => {
    expect(resolveCapabilityScope({ targetApplication: 'ehg_engineer' })).toBe('platform');
    expect(resolveCapabilityScope({ targetApplication: 'EHG_ENGINEER' })).toBe('platform');
    expect(resolveCapabilityScope({ targetApplication: 'ehg-engineer' })).toBe('platform');
  });

  it('US2-6: output is always a member of the closed CAPABILITY_SCOPES set', () => {
    const samples = [
      { ventureId: 'x' },
      { targetApplication: 'EHG_Engineer' },
      { targetApplication: 'EHG' },
      {},
    ];
    for (const s of samples) {
      expect(CAPABILITY_SCOPES).toContain(resolveCapabilityScope(s));
    }
    expect(CAPABILITY_SCOPES).toEqual(['platform', 'application', 'venture']);
  });

  it('US2-7: isValidCapabilityScope accepts known scopes and rejects others', () => {
    expect(isValidCapabilityScope('platform')).toBe(true);
    expect(isValidCapabilityScope('application')).toBe(true);
    expect(isValidCapabilityScope('venture')).toBe(true);
    expect(isValidCapabilityScope('galaxy')).toBe(false);
    expect(isValidCapabilityScope(undefined)).toBe(false);
  });
});

describe('toVentureCapabilityRow — unit (no DB)', () => {
  const sd = { sd_key: 'SD-VENTURE-TEST-001', venture_id: 'venture-uuid-1' };

  it('US4-1: maps name from cap.name, falling back to capability_key', () => {
    expect(toVentureCapabilityRow({ name: 'My Cap', capability_key: 'my-cap', capability_type: 'tool' }, sd).name)
      .toBe('My Cap');
    expect(toVentureCapabilityRow({ capability_key: 'my-cap', capability_type: 'tool' }, sd).name)
      .toBe('my-cap');
  });

  it('US4-2: carries origin_sd_key + origin_venture_id from the SD', () => {
    const row = toVentureCapabilityRow({ capability_key: 'k', capability_type: 'tool' }, sd);
    expect(row.origin_sd_key).toBe('SD-VENTURE-TEST-001');
    expect(row.origin_venture_id).toBe('venture-uuid-1');
  });

  it('US4-3: pulls maturity/score fields from metadata when present, else defaults', () => {
    const enriched = toVentureCapabilityRow(
      { capability_key: 'k', capability_type: 'tool', metadata: { maturity_level: 'production', reusability_score: 4 } },
      sd
    );
    expect(enriched.maturity_level).toBe('production');
    expect(enriched.reusability_score).toBe(4);

    const bare = toVentureCapabilityRow({ capability_key: 'k', capability_type: 'tool' }, sd);
    expect(bare.maturity_level).toBe('experimental');
    expect(bare.reusability_score).toBeNull();
  });

  it('US4-5: output satisfies venture_capabilities CHECK constraints (maturity in set, scores clamped)', () => {
    // 'beta' is valid for sd_capabilities but NOT for venture_capabilities → coerced.
    const coerced = toVentureCapabilityRow(
      { capability_key: 'k', capability_type: 'tool', metadata: { maturity_level: 'beta', reusability_score: 42 } },
      sd
    );
    expect(VENTURE_MATURITY_LEVELS).toContain(coerced.maturity_level);
    expect(coerced.maturity_level).toBe('experimental'); // invalid → lowest
    expect(coerced.reusability_score).toBe(10); // clamped into [0,10]
  });

  it('US4-4: mapping is deterministic (same input → same output)', () => {
    const cap = { name: 'X', capability_key: 'x', capability_type: 'agent', metadata: { maturity_level: 'beta' } };
    expect(toVentureCapabilityRow(cap, sd)).toEqual(toVentureCapabilityRow(cap, sd));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DB INTEGRATION TESTS — skipped when no real DB
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_REAL_DB)('capability scope unification — DB integration', () => {
  const supabase = createSupabaseServiceClient();
  const TEST_PREFIX = 'TEST-SCOPE-UNIFY';
  // Two real ventures (so origin_venture_id survives any FK), from existing venture SDs.
  const VENTURE_A = '0e6449d9-aaa1-4de5-8aba-c81fe0238b98';
  const VENTURE_B = '4f71b3bd-8a1e-462e-a8b2-76efb8607206';

  async function cleanup() {
    await supabase.from('venture_capabilities').delete().like('name', `${TEST_PREFIX}%`);
    await supabase.from('venture_capabilities').delete().like('origin_sd_key', `${TEST_PREFIX}%`);
  }
  afterEach(cleanup);

  it('US6-1: v_unified_capabilities exposes non-null scope ∈ {platform,application,venture} + plane1_score column', async () => {
    const { data, error } = await supabase
      .from('v_unified_capabilities')
      .select('scope, plane1_score, capability_source')
      .limit(2000);
    expect(error).toBeNull();
    expect(data.length).toBeGreaterThan(0);
    // plane1_score column is present (may be null for agent arms).
    expect(data[0]).toHaveProperty('plane1_score');
    const scopes = new Set(data.map((r) => r.scope));
    for (const scope of scopes) {
      expect(CAPABILITY_SCOPES, `unexpected scope value: ${scope}`).toContain(scope);
    }
    // No null scopes.
    expect(data.every((r) => r.scope !== null && r.scope !== undefined)).toBe(true);
  });

  it('US6-2: sd_capabilities rows split platform (EHG_Engineer) vs application (EHG)', async () => {
    const { data, error } = await supabase
      .from('v_unified_capabilities')
      .select('scope, capability_source')
      .eq('capability_source', 'sd_capability')
      .limit(2000);
    expect(error).toBeNull();
    const scopes = new Set(data.map((r) => r.scope));
    // Every sd_capability row is platform or application (never venture, since 0 have venture_id today).
    for (const s of scopes) expect(['platform', 'application']).toContain(s);
    // The 3-way revision MUST be live: EHG-sourced rows resolve to 'application'.
    expect(scopes.has('application'), 'expected application-scoped sd_capabilities (EHG); is the 3-way migration applied?').toBe(true);
    expect(scopes.has('platform'), 'expected platform-scoped sd_capabilities (EHG_Engineer)').toBe(true);
  });

  it('US6-3: v_scanner_capabilities still resolves after the view change (regression)', async () => {
    const { data, error } = await supabase
      .from('v_scanner_capabilities')
      .select('id, name, capability_type, capability_source, relevance_score, maturity_level, source_id, source_key')
      .limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    // Scanner view excludes sd_capability rows by definition.
    for (const r of data) {
      expect(['venture', 'agent_skill', 'agent_registry']).toContain(r.capability_source);
    }
  });

  it('US6-4: cross-venture graph returns non-empty shared capabilities after seeding', async () => {
    const sharedName = `${TEST_PREFIX}-shared-${Date.now()}`;
    // Same capability name shared across two ventures.
    const { error: e1 } = await supabase.from('venture_capabilities').insert([
      { name: sharedName, capability_type: 'tool', origin_venture_id: VENTURE_A, origin_sd_key: `${TEST_PREFIX}-A`, maturity_level: 'stable' },
      { name: sharedName, capability_type: 'tool', origin_venture_id: VENTURE_B, origin_sd_key: `${TEST_PREFIX}-B`, maturity_level: 'stable' },
    ]);
    expect(e1).toBeNull();

    const graph = await buildCrossVentureGraph(supabase);
    expect(graph.success).toBe(true);
    const shared = graph.sharedCapabilities.find((c) => c.capability_key === sharedName);
    expect(shared, 'seeded shared capability should appear in the cross-venture graph').toBeTruthy();
    expect(shared.venture_count).toBe(2);
  });

  it('US6-5: backfill idempotency guard detects already-present (origin_sd_key, name)', async () => {
    const sdKey = `${TEST_PREFIX}-IDEMPOTENT`;
    const capName = `${TEST_PREFIX}-cap-1`;
    await supabase.from('venture_capabilities').insert({
      name: capName, capability_type: 'tool', origin_venture_id: VENTURE_A, origin_sd_key: sdKey, maturity_level: 'experimental',
    });

    // This is exactly the existence check the backfill performs before inserting.
    const { data: existing } = await supabase
      .from('venture_capabilities')
      .select('name')
      .eq('origin_sd_key', sdKey);
    const existingNames = new Set((existing || []).map((r) => r.name));
    expect(existingNames.has(capName)).toBe(true); // → backfill would SKIP, not duplicate.
  });
});
