/**
 * Tests for SD-LEO-INFRA-RECONCILE-VENTURE-LIFECYCLE-001
 *
 * Covers:
 *   - FR-2: StageRegistry readers source stage_name from stage_config (not
 *           lifecycle_stage_config), proving that even if lifecycle_stage_config
 *           drifts back to a stale name in the future, the reader returns the
 *           canonical name from the name-authoritative table.
 *   - FR-6: scripts/generate-stage-config.cjs cross-table name-parity assertion
 *           detects divergence and returns it (TS-1 from the PRD).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

import { StageRegistry } from '../../../lib/eva/stage-registry/core.js';
import { loadFromDatabase } from '../../../lib/eva/stage-registry/index.js';

const require = createRequire(import.meta.url);

/**
 * Build a fake Supabase client that returns the supplied rows for
 * `lifecycle_stage_config` and `stage_config` respectively. Mirrors the
 * minimal slice of the SDK surface that the reader / assertion call.
 */
function makeFakeSupabase({ lifecycleRows = [], stageConfigRows = [], lifecycleError = null, stageConfigError = null } = {}) {
  return {
    from(table) {
      const rows = table === 'lifecycle_stage_config' ? lifecycleRows : stageConfigRows;
      const error = table === 'lifecycle_stage_config' ? lifecycleError : stageConfigError;
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

describe('FR-2: StageRegistry sources stage_name from stage_config', () => {
  let registry;

  beforeEach(() => {
    registry = new StageRegistry();
    // Seed a markCacheLoaded / clear / register surface compatible with the reader.
    registry.clear = () => { registry.stages.clear(); };
    registry.markCacheLoaded = () => { /* noop in tests */ };
    registry.isCacheValid = () => false; // force a fresh read
  });

  it('overrides lifecycle_stage_config.stage_name with stage_config.stage_name for S19', async () => {
    const lifecycleRows = [
      { stage_number: 19, stage_name: 'Build in Replit', description: '', phase_number: 4, phase_name: 'BUILD', work_type: 'sd_required', sd_required: true, advisory_enabled: false, depends_on: [], required_artifacts: [], metadata: {} },
    ];
    const stageConfigRows = [
      { stage_number: 19, stage_name: 'Sprint Planning' },
    ];
    const supabase = makeFakeSupabase({ lifecycleRows, stageConfigRows });

    const result = await loadFromDatabase(registry, supabase);
    expect(result.error).toBeNull();
    expect(result.loaded).toBe(1);

    const s19 = registry.get(19);
    expect(s19).toBeTruthy();
    // The whole point of FR-2: stage_config wins over lifecycle_stage_config for the NAME field.
    expect(s19.stage_name).toBe('Sprint Planning');
    // Other lifecycle-only fields still come from lifecycle_stage_config:
    expect(s19.work_type).toBe('sd_required');
    expect(s19.phase_name).toBe('BUILD');
  });

  it('falls back to lifecycle_stage_config.stage_name when stage_config is unreachable', async () => {
    const lifecycleRows = [
      { stage_number: 14, stage_name: 'Technical Architecture', description: '', phase_number: 3, phase_name: 'BLUEPRINT', work_type: 'sd_required', sd_required: true, advisory_enabled: false, depends_on: [], required_artifacts: [], metadata: {} },
    ];
    const supabase = makeFakeSupabase({ lifecycleRows, stageConfigError: { message: 'stage_config unreachable' } });

    const result = await loadFromDatabase(registry, supabase);
    expect(result.error).toBeNull(); // primary read succeeded
    const s14 = registry.get(14);
    expect(s14.stage_name).toBe('Technical Architecture'); // fallback worked
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
