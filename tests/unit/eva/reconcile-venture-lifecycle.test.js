/**
 * Tests for SD-LEO-INFRA-RECONCILE-VENTURE-LIFECYCLE-001
 *
 * Covers:
 *   - FR-2: StageRegistry readers source stage config from the unified
 *           `venture_stages` table (SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-B).
 *           venture_stages has ONE canonical stage_name per stage, so the prior
 *           stage_config name-authority override + lifecycle fallback are gone;
 *           the reader returns the canonical name directly from venture_stages.
 *   - FR-6: scripts/generate-stage-config.cjs cross-table name-parity assertion
 *           detects divergence between the legacy tables and returns it (TS-1).
 *           NOTE: FR-6 validates a standalone migration-era guard script that
 *           still inspects the legacy tables directly; it is intentionally
 *           unaffected by the reader repoint.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

import { StageRegistry } from '../../../lib/eva/stage-registry/core.js';
import { loadFromDatabase } from '../../../lib/eva/stage-registry/index.js';

const require = createRequire(import.meta.url);

/**
 * Build a fake Supabase client that returns the supplied rows for
 * `venture_stages` (the unified superset the reader now uses) and for the
 * legacy `lifecycle_stage_config` / `stage_config` tables (still used by the
 * FR-6 parity-assertion script). Mirrors the minimal SDK surface the callers use.
 */
function makeFakeSupabase({ ventureStagesRows = [], ventureStagesError = null, lifecycleRows = [], stageConfigRows = [], lifecycleError = null, stageConfigError = null } = {}) {
  return {
    from(table) {
      let rows, error;
      if (table === 'venture_stages') { rows = ventureStagesRows; error = ventureStagesError; }
      else if (table === 'lifecycle_stage_config') { rows = lifecycleRows; error = lifecycleError; }
      else { rows = stageConfigRows; error = stageConfigError; }
      const chain = {
        _table: table,
        _rows: rows,
        _error: error,
        select() { return chain; },
        order() { return chain; },
        then(resolve) { return Promise.resolve({ data: chain._error ? null : chain._rows, error: chain._error }).then(resolve); },
      };
      return chain;
    },
  };
}

describe('FR-2: StageRegistry sources stage config from venture_stages (unified)', () => {
  let registry;

  beforeEach(() => {
    registry = new StageRegistry();
    // Seed a markCacheLoaded / clear / register surface compatible with the reader.
    registry.clear = () => { registry.stages.clear(); };
    registry.markCacheLoaded = () => { /* noop in tests */ };
    registry.isCacheValid = () => false; // force a fresh read
  });

  it('reads the canonical stage_name + lifecycle fields directly from venture_stages for S19', async () => {
    // SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-B: venture_stages carries the single
    // canonical name AND the lifecycle fields in one row — no override layer.
    const ventureStagesRows = [
      { stage_number: 19, stage_name: 'Sprint Planning', description: '', phase_number: 4, phase_name: 'BUILD', work_type: 'sd_required', sd_required: true, advisory_enabled: false, depends_on: [], required_artifacts: [], metadata: {} },
    ];
    const supabase = makeFakeSupabase({ ventureStagesRows });

    const result = await loadFromDatabase(registry, supabase);
    expect(result.error).toBeNull();
    expect(result.loaded).toBe(1);

    const s19 = registry.get(19);
    expect(s19).toBeTruthy();
    // Canonical name comes straight from venture_stages.
    expect(s19.stage_name).toBe('Sprint Planning');
    // Lifecycle fields also come from the same venture_stages row:
    expect(s19.work_type).toBe('sd_required');
    expect(s19.phase_name).toBe('BUILD');
  });

  it('uses a SINGLE venture_stages read (no second stage_config name-authority read)', async () => {
    const ventureStagesRows = [
      { stage_number: 14, stage_name: 'Technical Architecture', description: '', phase_number: 3, phase_name: 'BLUEPRINT', work_type: 'sd_required', sd_required: true, advisory_enabled: false, depends_on: [], required_artifacts: [], metadata: {} },
    ];
    const readTables = [];
    const base = makeFakeSupabase({ ventureStagesRows });
    const supabase = { from(table) { readTables.push(table); return base.from(table); } };

    const result = await loadFromDatabase(registry, supabase);
    expect(result.error).toBeNull();
    expect(registry.get(14).stage_name).toBe('Technical Architecture');
    // Only venture_stages is read; the legacy tables are never touched by the reader.
    expect(readTables).toEqual(['venture_stages']);
  });
});

describe('FR-6: cross-table name parity assertion', () => {
  const { _testHooks } = require('../../../scripts/generate-stage-config.cjs');
  const { assertCrossTableNameParity } = _testHooks;

  it('returns the divergent stage_number when names disagree (TS-1)', async () => {
    const supabase = makeFakeSupabase({
      lifecycleRows: [
        { stage_number: 19, stage_name: 'Build in Replit' },
        { stage_number: 20, stage_name: 'Code Quality Gate' }, // agrees
      ],
      stageConfigRows: [
        { stage_number: 19, stage_name: 'Sprint Planning' },
        { stage_number: 20, stage_name: 'Code Quality Gate' },
      ],
    });
    const divergences = await assertCrossTableNameParity(supabase);
    expect(divergences).toHaveLength(1);
    expect(divergences[0].stage_number).toBe(19);
    expect(divergences[0].lifecycle_stage_config_name).toBe('Build in Replit');
    expect(divergences[0].stage_config_name).toBe('Sprint Planning');
  });

  it('returns empty array when all stage_names agree (post-FR-1 expected state)', async () => {
    const supabase = makeFakeSupabase({
      lifecycleRows: [
        { stage_number: 14, stage_name: 'Technical Architecture' },
        { stage_number: 19, stage_name: 'Sprint Planning' },
        { stage_number: 20, stage_name: 'Code Quality Gate' },
      ],
      stageConfigRows: [
        { stage_number: 14, stage_name: 'Technical Architecture' },
        { stage_number: 19, stage_name: 'Sprint Planning' },
        { stage_number: 20, stage_name: 'Code Quality Gate' },
      ],
    });
    const divergences = await assertCrossTableNameParity(supabase);
    expect(divergences).toHaveLength(0);
  });

  it('ignores stages present in only one table (INNER-join semantics)', async () => {
    const supabase = makeFakeSupabase({
      lifecycleRows: [
        { stage_number: 19, stage_name: 'Sprint Planning' },
        { stage_number: 27, stage_name: 'Future Stage' }, // not in stage_config
      ],
      stageConfigRows: [
        { stage_number: 19, stage_name: 'Sprint Planning' },
      ],
    });
    const divergences = await assertCrossTableNameParity(supabase);
    expect(divergences).toHaveLength(0); // 27 ignored, 19 agrees
  });
});
