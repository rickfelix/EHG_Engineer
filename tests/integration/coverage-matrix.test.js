/**
 * SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001 -- live-DB smoke tests for the coverage-matrix
 * regeneration job, retrodiction, and referent-audit rotation. Skips cleanly when no real
 * Supabase credentials are present.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { HAS_REAL_DB } from '../helpers/db-available.js';
import { regenerateCoverageMatrix, loadJsonConfig } from '../../lib/governance/coverage-matrix.js';
import { retrodictSpecimens, RETRODICTION_SPECIMENS } from '../../lib/governance/coverage-matrix-retrodiction.js';
import { runRotation } from '../../lib/governance/coverage-matrix-referent-audit.js';
import { GAUGE_REGISTRY } from '../../lib/governance/gauge-registry.js';

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIVE = HAS_REAL_DB && !!process.env.SUPABASE_POOLER_URL;
const supabase = LIVE ? createClient(URL, KEY) : null;
let pgClient;

describe.skipIf(!LIVE)('Coverage matrix (live DB): regeneration, retrodiction, referent-audit', () => {
  beforeAll(async () => {
    pgClient = new Client({ connectionString: process.env.SUPABASE_POOLER_URL });
    await pgClient.connect();
  });

  afterAll(async () => {
    if (pgClient) await pgClient.end();
  });

  it('regeneration run inserts a periodic_process placeholder row referencing the dependency SD, never queries a non-existent registry', async () => {
    const exclusions = loadJsonConfig('config/coverage-matrix-exclusions.json');
    const checkerMap = loadJsonConfig('config/coverage-matrix-checker-map.json');
    await regenerateCoverageMatrix(supabase, pgClient, { exclusions, checkerMapEntries: checkerMap.entries, gaugeRegistry: GAUGE_REGISTRY });

    const { data, error } = await supabase
      .from('coverage_matrix')
      .select('surface_key, status, is_active, metadata')
      .eq('surface_class', 'periodic_process')
      .eq('surface_key', 'periodic-process-registry')
      .single();

    expect(error).toBeNull();
    expect(data.status).toBe('pending_dependency');
    expect(data.is_active).toBe(false);
    expect(data.metadata.depends_on_sd_key).toBe('SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001');
  });

  it('regeneration run enumerates real work_item_type tables (strategic_directives_v2, quick_fixes)', async () => {
    const { data, error } = await supabase
      .from('coverage_matrix')
      .select('surface_key, is_active')
      .eq('surface_class', 'work_item_type')
      .in('surface_key', ['strategic_directives_v2', 'quick_fixes']);

    expect(error).toBeNull();
    expect(data.map((r) => r.surface_key).sort()).toEqual(['quick_fixes', 'strategic_directives_v2']);
    // strategic_directives_v2 has thousands of live rows -- must read as active, not a placeholder
    expect(data.find((r) => r.surface_key === 'strategic_directives_v2').is_active).toBe(true);
  });

  it('db_table surface class is populated from real information_schema introspection (not empty)', async () => {
    const { count, error } = await supabase.from('coverage_matrix').select('*', { count: 'exact', head: true }).eq('surface_class', 'db_table');
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(50); // this project has hundreds of real public tables
  });

  it('message_lane surface class includes structural coordination_message_type enum labels', async () => {
    const { data, error } = await supabase.from('coverage_matrix').select('surface_key').eq('surface_class', 'message_lane');
    expect(error).toBeNull();
    expect(data.length).toBeGreaterThan(0);
  });

  it('a second consecutive regeneration run is idempotent: row count for a stable surface class does not change', async () => {
    const { count: before } = await supabase.from('coverage_matrix').select('*', { count: 'exact', head: true }).eq('surface_class', 'work_item_type');

    const exclusions = loadJsonConfig('config/coverage-matrix-exclusions.json');
    const checkerMap = loadJsonConfig('config/coverage-matrix-checker-map.json');
    await regenerateCoverageMatrix(supabase, pgClient, { exclusions, checkerMapEntries: checkerMap.entries, gaugeRegistry: GAUGE_REGISTRY });

    const { count: after } = await supabase.from('coverage_matrix').select('*', { count: 'exact', head: true }).eq('surface_class', 'work_item_type');
    expect(after).toBe(before);
  });

  it('retrodicts all 4 chairman-caught specimens against the real, freshly-regenerated matrix', async () => {
    const results = await retrodictSpecimens(supabase);
    expect(results).toHaveLength(RETRODICTION_SPECIMENS.length);
    // None of the 4 specimens' surface_keys have a curated checker-map entry today, so each
    // must retrodict as 'pass' (genuinely unchecked) -- a real, non-trivial live assertion.
    for (const result of results) {
      expect(result.verdict).toBe('pass');
    }
  });

  it('referent-audit rotation cold-starts or runs without throwing, and a second run in the same period is a no-op', async () => {
    const first = await runRotation(supabase);
    expect(first).toBeDefined();

    const second = await runRotation(supabase);
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('already_ran_this_period');
  });
});
