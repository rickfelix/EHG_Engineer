/**
 * Tests for SD-LEO-INFRA-RECONCILE-VENTURE-LIFECYCLE-001
 *
 * Covers:
 *   - FR-2: StageRegistry readers source stage config from the unified
 *           `venture_stages` table (SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-B).
 *           venture_stages has ONE canonical stage_name per stage, so the prior
 *           name-authority override + lifecycle fallback are gone;
 *           the reader returns the canonical name directly from venture_stages.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { StageRegistry } from '../../../lib/eva/stage-registry/core.js';
import { loadFromDatabase } from '../../../lib/eva/stage-registry/index.js';


/**
 * Build a fake Supabase client that returns the supplied rows for
 * `venture_stages` (the unified superset the reader uses). Mirrors the minimal
 * SDK surface the callers use.
 */
function makeFakeSupabase({ ventureStagesRows = [], ventureStagesError = null } = {}) {
  return {
    from(table) {
      const rows = table === 'venture_stages' ? ventureStagesRows : [];
      const error = table === 'venture_stages' ? ventureStagesError : null;
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

  it('uses a SINGLE venture_stages read (no second name-authority read)', async () => {
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
