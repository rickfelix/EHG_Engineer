/**
 * SD-LEO-FIX-FIX-STAGE-SKIP-001 — regression tests for the Stage 21 skip-marker bloat.
 *
 * Root cause (RCA, supersedes the SD's stated replit-reentry-adapter.js:219 diagnosis):
 *   The worker re-runs S21 every ~30s while a precondition stays unmet. Each run wrote a
 *   NEW venture_artifacts row, accumulating 380+ duplicates over 6.6 days, AND the row was
 *   mislabeled `build_security_audit` (the generic orchestrator fallback resolved
 *   artifactType via the stale stage_artifact_requirements id=18 exit-gate type).
 *
 * The fix makes the skip marker idempotent (one row, refreshed in place) and the skip type
 * is always the canonical `visual_assets_skipped` — never `build_security_audit`. The
 * orchestrator-side suppression of the generic fallback for `_skip` payloads is verified
 * separately by inspection (eva-orchestrator.js: the `_skip` branch persists nothing).
 *
 * Network-free: the LLM is mocked to throw (forcing the deterministic path) and supabase is
 * a recording stub that tracks venture_artifacts INSERT vs UPDATE.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../llm/index.js', () => ({
  getLLMClient: () => ({ complete: async () => { throw new Error('no-llm-in-test'); } }),
}));

const { analyzeStage21VisualAssets } = await import('../stage-templates/analysis-steps/stage-21-visual-assets.js');

const COMPLETE_S17 = { s17_approved: true, s17_strategy_recommendation: 'ship' };
const silent = { info() {}, warn() {}, log() {}, error() {} };

/**
 * Recording supabase stub. Tracks every venture_artifacts INSERT/UPDATE so the test can
 * assert idempotency (1 insert + N-1 updates, never N inserts) and that no write ever uses
 * artifact_type='build_security_audit'. Simulates a single current skip row that the second
 * call finds and updates.
 */
function makeRecordingSupabase() {
  const writes = []; // { op, table, values }
  let currentSkipRow = null; // the one is_current visual_assets_skipped row, if any
  const makeQuery = (table) => {
    const state = { table, op: 'select', payload: null, filters: {} };
    const resolve = () => {
      if (state.op === 'insert') {
        writes.push({ op: 'insert', table, values: state.payload });
        if (table === 'venture_artifacts' && state.payload?.artifact_type === 'visual_assets_skipped') {
          currentSkipRow = { id: 'skip-row-1' };
        }
        return { data: null, error: null };
      }
      if (state.op === 'update') {
        writes.push({ op: 'update', table, values: state.payload });
        return { data: null, error: null };
      }
      // select for the existing current skip marker
      if (table === 'venture_artifacts' && state.filters.artifact_type === 'visual_assets_skipped') {
        return { data: currentSkipRow ? [currentSkipRow] : [], error: null };
      }
      if (table === 'venture_resources') return { data: [], error: null };
      if (table === 'ventures') return { data: null, error: null };
      return { data: null, error: null };
    };
    const q = {
      select() { return q; },
      insert(v) { state.op = 'insert'; state.payload = v; return q; },
      update(v) { state.op = 'update'; state.payload = v; return q; },
      eq(col, val) { state.filters[col] = val; return q; },
      in() { return q; },
      order() { return q; },
      limit() { return q; },
      maybeSingle() { return Promise.resolve(resolve()); },
      single() { return Promise.resolve(resolve()); },
      then(onF, onR) { return Promise.resolve(resolve()).then(onF, onR); },
    };
    return q;
  };
  return { from: (t) => makeQuery(t), __writes: writes };
}

describe('SD-LEO-FIX-FIX-STAGE-SKIP-001 — S21 skip marker is idempotent and correctly typed', () => {
  it('writes ONE visual_assets_skipped row across repeated skips (no per-poll bloat)', async () => {
    const sb = makeRecordingSupabase();
    const params = {
      stage11Data: COMPLETE_S17 /* present S17, absent S11 → skip */, stage17Data: COMPLETE_S17,
      stage10Data: {}, ventureName: 'TestCo', ventureId: 'v1', supabase: sb, logger: silent,
    };
    // Simulate three consecutive worker polls on the same unmet-precondition state.
    await analyzeStage21VisualAssets({ ...params, stage11Data: undefined });
    await analyzeStage21VisualAssets({ ...params, stage11Data: undefined });
    await analyzeStage21VisualAssets({ ...params, stage11Data: undefined });

    const skipWrites = sb.__writes.filter(
      (w) => w.table === 'venture_artifacts' &&
        (w.values?.artifact_type === 'visual_assets_skipped' || w.op === 'update')
    );
    const inserts = skipWrites.filter((w) => w.op === 'insert');
    const updates = skipWrites.filter((w) => w.op === 'update');
    expect(inserts).toHaveLength(1);        // exactly one INSERT (first poll)
    expect(updates.length).toBeGreaterThanOrEqual(2); // subsequent polls UPDATE in place
  });

  it('NEVER persists a skip marker typed build_security_audit', async () => {
    const sb = makeRecordingSupabase();
    await analyzeStage21VisualAssets({
      stage17Data: COMPLETE_S17, stage10Data: {},
      ventureName: 'TestCo', ventureId: 'v1', supabase: sb, logger: silent,
    });
    const badTypes = sb.__writes.filter((w) => w.values?.artifact_type === 'build_security_audit');
    expect(badTypes).toHaveLength(0);
    const insertedSkip = sb.__writes.find((w) => w.op === 'insert' && w.table === 'venture_artifacts');
    expect(insertedSkip?.values?.artifact_type).toBe('visual_assets_skipped');
  });
});
