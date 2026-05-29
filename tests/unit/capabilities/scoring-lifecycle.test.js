/**
 * Scoring Lifecycle Tests
 * SD: SD-LEO-INFRA-ACTIVATE-CAPABILITY-SCORING-001 | FR-7
 *
 * Tests the full scoring lifecycle: deriveCapabilityScores (pure unit) and
 * scoreAndPersistCapabilities + recordReuseEvent (DB integration).
 *
 * Evidence row ID referenced in prospective TESTING evidence: 249afb00
 * 13 scenarios: TS-1 through TS-13.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../../lib/supabase-client.js';
import { deriveCapabilityScores, scoreAndPersistCapabilities } from '../../../lib/capabilities/plane1-scoring.js';
import { recordReuseEvent } from '../../../lib/capabilities/capability-reuse-tracker.js';

dotenv.config();

// Gate: skip DB tests when no real DB is available.
// Mirrors the pattern in tests/unit/blocked-state-detector.test.js (CA-1 CAPA).
const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

// ─────────────────────────────────────────────────────────────────────────────
// UNIT TESTS — no DB required
// ─────────────────────────────────────────────────────────────────────────────

describe('deriveCapabilityScores — unit (no DB)', () => {
  // TS-1: Determinism — same input always yields same output
  it('TS-1: returns identical scores for identical inputs (determinism)', () => {
    const capability = { capability_type: 'agent', source_files: ['a.js', 'b.js'], reuse_count: 2 };
    const first = deriveCapabilityScores(capability);
    const second = deriveCapabilityScores(capability);
    expect(first).toEqual(second);
  });

  // TS-2: Type differentiation — 'agent' vs 'database_schema' with equal evidence must differ
  it('TS-2: different capability_types with equal evidence yield different scores', () => {
    const evidence = { source_files: ['a.js'], reuse_count: 0 };
    const agentScore = deriveCapabilityScores({ ...evidence, capability_type: 'agent' });
    const dbSchemaScore = deriveCapabilityScores({ ...evidence, capability_type: 'database_schema' });
    // 'agent' category=ai_automation maturity_baseline=3, extraction_baseline=3
    // 'database_schema' category=infrastructure maturity_baseline=4, extraction_baseline=2
    // So at least one score dimension must differ.
    const hasDifference =
      agentScore.maturity_score !== dbSchemaScore.maturity_score ||
      agentScore.extraction_score !== dbSchemaScore.extraction_score;
    expect(hasDifference).toBe(true);
  });

  // TS-3: Bounds — all outputs are integers in [0, 5]
  it('TS-3: all outputs are integers in [0,5] for extreme inputs', () => {
    const types = ['agent', 'database_schema'];
    for (const capability_type of types) {
      // Zero evidence
      const low = deriveCapabilityScores({ capability_type, source_files: [], reuse_count: 0 });
      // High evidence
      const high = deriveCapabilityScores({ capability_type, source_files: Array(10).fill('x.js'), reuse_count: 100 });

      for (const { maturity_score, extraction_score } of [low, high]) {
        expect(Number.isInteger(maturity_score)).toBe(true);
        expect(Number.isInteger(extraction_score)).toBe(true);
        expect(maturity_score).toBeGreaterThanOrEqual(0);
        expect(maturity_score).toBeLessThanOrEqual(5);
        expect(extraction_score).toBeGreaterThanOrEqual(0);
        expect(extraction_score).toBeLessThanOrEqual(5);
      }
    }
  });

  // TS-4: Coverage — all 19 capability types yield non-zero scores for at least one input
  it('TS-4: all 19 capability types yield non-zero scores for at least one input', () => {
    const ALL_TYPES = [
      'agent', 'crew', 'tool', 'skill',
      'database_schema', 'database_function', 'rls_policy', 'migration',
      'api_endpoint', 'component', 'hook', 'service', 'utility',
      'workflow', 'webhook', 'external_integration',
      'validation_rule', 'quality_gate', 'protocol',
    ];
    expect(ALL_TYPES.length).toBe(19);

    for (const capability_type of ALL_TYPES) {
      const scores = deriveCapabilityScores({ capability_type, source_files: [], reuse_count: 0 });
      const hasNonZero = scores.maturity_score > 0 || scores.extraction_score > 0;
      expect(hasNonZero, `Expected non-zero score for capability_type '${capability_type}'`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DB INTEGRATION TESTS — skipped when no real DB
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_REAL_DB)('scoring lifecycle — DB integration', () => {
  const supabase = createSupabaseServiceClient();

  // Unique prefixes so these rows are isolated and cleanable.
  const TEST_PREFIX = 'TEST-SCORING-LIFECYCLE';
  const TEST_SD_ID = 'SD-TEST-SCORING-LIFECYCLE';
  // FK-valid SD uuid: strategic_directives_v2.id for SD-LEO-INFRA-ACTIVATE-CAPABILITY-SCORING-001
  const TEST_SD_UUID = 'c26f3f6d-69b4-4338-bd7f-c898c43a1717';

  // Track inserted row IDs for cleanup
  let insertedIds = [];

  /**
   * Helper: insert a test sd_capabilities row and track its id for cleanup.
   * Returns the inserted row.
   */
  async function insertTestCapability(overrides = {}) {
    const defaults = {
      sd_uuid: TEST_SD_UUID,
      sd_id: TEST_SD_ID,
      capability_type: 'database_function',
      capability_key: `${TEST_PREFIX}-CAP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action: 'registered',
      maturity_score: 0,
      extraction_score: 0,
    };
    const row = { ...defaults, ...overrides };
    const { data, error } = await supabase
      .from('sd_capabilities')
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(`insertTestCapability failed: ${error.message}`);
    insertedIds.push(data.id);
    return data;
  }

  /** Clean up all test rows: reuse_log first (FK), then capabilities. */
  async function cleanup() {
    if (insertedIds.length === 0) return;
    // Delete reuse log rows for our capability ids.
    await supabase
      .from('capability_reuse_log')
      .delete()
      .in('capability_id', insertedIds);
    // Delete the capability rows.
    await supabase
      .from('sd_capabilities')
      .delete()
      .in('id', insertedIds);
    // Belt-and-suspenders: also sweep by key prefix.
    await supabase
      .from('sd_capabilities')
      .delete()
      .like('capability_key', `${TEST_PREFIX}%`);
    insertedIds = [];
  }

  // Self-heal orphans left by prior process-killed runs (>1 h old).
  beforeAll(async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: stale } = await supabase
      .from('sd_capabilities')
      .select('id')
      .like('capability_key', `${TEST_PREFIX}%`)
      .lt('created_at', oneHourAgo);
    if (stale && stale.length > 0) {
      const staleIds = stale.map((r) => r.id);
      await supabase.from('capability_reuse_log').delete().in('capability_id', staleIds);
      await supabase.from('sd_capabilities').delete().in('id', staleIds);
    }
  });

  afterAll(async () => {
    await cleanup();
  });

  afterEach(async () => {
    // Reset after each test so state doesn't bleed.
    await cleanup();
  });

  // TS-5: Backfill idempotency — calling scoreAndPersistCapabilities twice yields identical results
  it('TS-5: backfill is idempotent (second run makes no changes)', async () => {
    await insertTestCapability({ capability_type: 'database_function', maturity_score: 0, extraction_score: 0 });
    await insertTestCapability({ capability_type: 'tool', maturity_score: 0, extraction_score: 0 });

    const firstRun = await scoreAndPersistCapabilities(supabase, { sdId: TEST_SD_ID });
    expect(firstRun.scored).toBeGreaterThan(0);

    const secondRun = await scoreAndPersistCapabilities(supabase, { sdId: TEST_SD_ID });
    // Second run should skip all already-scored rows (not re-score without force).
    expect(secondRun.scored).toBe(0);
    expect(secondRun.skipped).toBe(firstRun.scored);
  });

  // TS-6: Trigger recompute — plane1_score = (maturity+extraction+centrality)*category_weight
  // For database_function: category=infrastructure, weight=1.2, reuse_count=4 → centrality=LEAST(5,FLOOR(4/2))=2
  // plane1_score = (3 + 2 + 2) * 1.2 = 8.4
  it('TS-6: trigger recomputes plane1_score after maturity/extraction update', async () => {
    const cap = await insertTestCapability({ capability_type: 'database_function', reuse_count: 4 });

    const { error } = await supabase
      .from('sd_capabilities')
      .update({ maturity_score: 3, extraction_score: 2 })
      .eq('id', cap.id);
    expect(error).toBeNull();

    const { data: updated } = await supabase
      .from('sd_capabilities')
      .select('plane1_score, graph_centrality_score')
      .eq('id', cap.id)
      .single();

    // graph_centrality = LEAST(5, FLOOR(4/2)) = 2
    expect(updated.graph_centrality_score).toBe(2);
    // plane1_score = (3 + 2 + 2) * 1.2 = 8.4
    expect(updated.plane1_score).toBeCloseTo(8.4, 1);
  });

  // TS-7: Centrality formula — reuse_count 4→centrality 2; 10→centrality 5
  it('TS-7: graph_centrality_score follows LEAST(5, FLOOR(reuse_count/2))', async () => {
    const cap4 = await insertTestCapability({ capability_type: 'utility', reuse_count: 4 });
    const cap10 = await insertTestCapability({ capability_type: 'utility', reuse_count: 10 });

    // Trigger fires on UPDATE; do a no-op update to force recompute.
    for (const id of [cap4.id, cap10.id]) {
      await supabase.from('sd_capabilities').update({ maturity_score: 1, extraction_score: 1 }).eq('id', id);
    }

    const { data: row4 } = await supabase.from('sd_capabilities').select('graph_centrality_score').eq('id', cap4.id).single();
    const { data: row10 } = await supabase.from('sd_capabilities').select('graph_centrality_score').eq('id', cap10.id).single();

    expect(row4.graph_centrality_score).toBe(2); // FLOOR(4/2)=2
    expect(row10.graph_centrality_score).toBe(5); // LEAST(5, FLOOR(10/2))=5
  });

  // TS-8: No double-count — recording same (capability_key, sd_id) twice increments reuse_count only once
  it('TS-8: duplicate (capability_key, sd_id) reuse events are idempotent (ON CONFLICT DO NOTHING)', async () => {
    const cap = await insertTestCapability({ capability_type: 'tool', reuse_count: 0 });

    const firstResult = await recordReuseEvent(supabase, cap.capability_key, TEST_SD_ID, 'test context', 'direct');
    expect(firstResult.success).toBe(true);

    const secondResult = await recordReuseEvent(supabase, cap.capability_key, TEST_SD_ID, 'test context', 'direct');
    // ON CONFLICT DO NOTHING — second call must still return success (no error).
    expect(secondResult.success).toBe(true);

    // Verify exactly 1 log row for this capability+sd combination.
    const { data: logRows } = await supabase
      .from('capability_reuse_log')
      .select('id')
      .eq('capability_id', cap.id)
      .eq('reusing_sd_id', TEST_SD_ID);
    expect(logRows.length).toBe(1);

    // reuse_count should be incremented exactly once.
    const { data: updated } = await supabase.from('sd_capabilities').select('reuse_count').eq('id', cap.id).single();
    expect(updated.reuse_count).toBe(1);
  });

  // TS-9: Unknown key surfaced — recordReuseEvent with unknown key returns {notFound:true}
  it('TS-9: unknown capability_key returns {notFound:true} with no log row created', async () => {
    const unknownKey = `${TEST_PREFIX}-DOES-NOT-EXIST-${Date.now()}`;
    const result = await recordReuseEvent(supabase, unknownKey, TEST_SD_ID, null, 'direct');
    expect(result.success).toBe(false);
    expect(result.notFound).toBe(true);

    // No log row should have been created.
    const { data: logRows } = await supabase
      .from('capability_reuse_log')
      .select('id')
      .eq('reusing_sd_id', TEST_SD_ID);
    // Filter further in JS since sd_id is not FK-enforced on log.
    expect(logRows).toHaveLength(0);
  });

  // TS-10: Valid increment — recordReuseEvent with known key + valid sd_key → 1 log row + reuse_count+1
  it('TS-10: valid reuse event creates exactly 1 log row and increments reuse_count', async () => {
    const cap = await insertTestCapability({ capability_type: 'service', reuse_count: 0 });

    const result = await recordReuseEvent(supabase, cap.capability_key, TEST_SD_ID, 'integration context', 'direct');
    expect(result.success).toBe(true);

    // Verify 1 log row.
    const { data: logRows } = await supabase
      .from('capability_reuse_log')
      .select('id, reusing_sd_id')
      .eq('capability_id', cap.id);
    expect(logRows.length).toBe(1);
    expect(logRows[0].reusing_sd_id).toBe(TEST_SD_ID);

    // Verify reuse_count incremented.
    const { data: updated } = await supabase.from('sd_capabilities').select('reuse_count').eq('id', cap.id).single();
    expect(updated.reuse_count).toBe(1);
  });

  // TS-11: Distinct distribution — after scoring >=10 rows of 2+ types, COUNT(DISTINCT plane1_score) > 1
  it('TS-11: scoring >=10 rows of 2+ capability types produces distinct plane1_scores', async () => {
    // Insert 6 'agent' rows and 5 'database_schema' rows — different baselines = different scores.
    const types = [
      ...Array(6).fill('agent'),
      ...Array(5).fill('database_schema'),
    ];
    for (const capability_type of types) {
      await insertTestCapability({ capability_type, reuse_count: 0 });
    }

    const result = await scoreAndPersistCapabilities(supabase, { sdId: TEST_SD_ID });
    expect(result.scored).toBeGreaterThanOrEqual(10);

    const { data: rows } = await supabase
      .from('sd_capabilities')
      .select('plane1_score')
      .eq('sd_id', TEST_SD_ID)
      .like('capability_key', `${TEST_PREFIX}%`);

    const distinctScores = new Set(rows.map((r) => r.plane1_score));
    expect(distinctScores.size).toBeGreaterThan(1);
  });

  // TS-12: Trigger overwrites category — insert 'tool' row with no explicit category → category becomes 'ai_automation'
  it('TS-12: trigger sets category="ai_automation" for capability_type="tool"', async () => {
    // Insert without category (null/omitted) and trigger must set it.
    const cap = await insertTestCapability({ capability_type: 'tool' });

    // Trigger fires on INSERT; fetch the row.
    const { data: fetched } = await supabase
      .from('sd_capabilities')
      .select('category')
      .eq('id', cap.id)
      .single();

    expect(fetched.category).toBe('ai_automation');
  });

  // TS-13: Reuse-before-score ordering — record reuse THEN score; plane1_score reflects updated centrality
  it('TS-13: recording reuse before scoring results in plane1_score that reflects updated reuse_count centrality', async () => {
    const cap = await insertTestCapability({ capability_type: 'workflow', reuse_count: 0 });

    // Step 1: record reuse (increments reuse_count from 0 to 1)
    const reuseResult = await recordReuseEvent(supabase, cap.capability_key, TEST_SD_ID, null, 'direct');
    expect(reuseResult.success).toBe(true);

    // Verify reuse_count is now 1
    const { data: afterReuse } = await supabase.from('sd_capabilities').select('reuse_count').eq('id', cap.id).single();
    expect(afterReuse.reuse_count).toBe(1);

    // Step 2: score (now reuse_count=1, so extraction gets +1 boost and maturity gets +1 boost)
    const scoreResult = await scoreAndPersistCapabilities(supabase, { sdId: TEST_SD_ID });
    expect(scoreResult.scored).toBeGreaterThan(0);

    // Fetch the final row to confirm plane1_score is non-zero and reflects centrality
    const { data: final } = await supabase
      .from('sd_capabilities')
      .select('plane1_score, graph_centrality_score, maturity_score, extraction_score')
      .eq('id', cap.id)
      .single();

    // graph_centrality = LEAST(5, FLOOR(1/2)) = 0 (reuse_count=1)
    expect(final.graph_centrality_score).toBe(0);
    // plane1_score should be non-zero (maturity+extraction scored >0)
    expect(final.plane1_score).toBeGreaterThan(0);
    // The scoring function should have boosted maturity and extraction for reuse_count>=1
    // workflow: category=integration, maturity_baseline=3, extraction_baseline=3;
    // reuse>=1 adds +1 to both => maturity=4, extraction=4
    expect(final.maturity_score).toBe(4);
    expect(final.extraction_score).toBe(4);
  });
});
