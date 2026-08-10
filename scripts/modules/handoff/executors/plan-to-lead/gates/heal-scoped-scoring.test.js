/**
 * SD-LEO-INFRA-HEAL-BEFORE-COMPLETE-001 — SD-scoped heal on every path, reachable remediation.
 *
 * Two defects, both measured live before fixing:
 *   1. CIRCULAR: the gate's printed fix `/heal sd --sd-id <K>` selected completed SDs only
 *      (heal-command.mjs status filter), so it returned not-found at exactly the pre-completion
 *      moment it was prescribed.
 *   2. REPO-WIDE: with no sd-heal row, the verdict fell back to allScores[0] — often a
 *      vision-scorer row whose repo/vision-wide gauge a small SD cannot move (the stable 79/87
 *      HEAL_EXHAUSTED class) — and the Tier-2 fallback scored vision dimensions via scoreSD().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Controllable git behaviour for resolveSdChangedFiles + fastAutoHeal's git log call.
let execSyncImpl = () => '';
vi.mock('child_process', () => ({
  execSync: (...a) => execSyncImpl(...a),
}));

// Deterministic semantic scorer — no network.
let semanticResponse = { content: '{"score": 90, "reasoning": "delivers key changes"}' };
vi.mock('../../../../../../lib/llm/client-factory.js', () => ({
  getFastClient: () => ({ model: 'mock-fast', complete: async () => semanticResponse }),
}));

import {
  createHealBeforeCompleteGate,
  resolveSdChangedFiles,
  buildFastHealDimensionScores,
} from './heal-before-complete.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const gateSource = () => fs.readFileSync(path.join(here, 'heal-before-complete.js'), 'utf8');

beforeEach(() => {
  execSyncImpl = () => '';
  semanticResponse = { content: '{"score": 90, "reasoning": "delivers key changes"}' };
});

/**
 * Supabase mock: eva_vision_scores list returns `existingRows`; inserts are captured and echoed
 * back so the gate's verdict row is whatever IT created, observable via capturedInserts.
 */
function makeSupabase({ existingRows = [], sdType = 'infrastructure' }) {
  const capturedInserts = [];
  const handlers = {
    strategic_directives_v2: () => ({
      select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
      async single() {
        return {
          data: {
            id: 'sd-uuid', sd_key: 'SD-TEST-001', sd_type: sdType, parent_sd_id: null,
            title: 'test SD', metadata: {},
            key_changes: [{ change: 'do the thing' }], success_criteria: [{ criterion: 'thing done' }], success_metrics: [],
          },
          error: null,
        };
      },
      then(r) { return Promise.resolve({ data: [], error: null }).then(r); },
    }),
    eva_vision_scores: () => ({
      _opts: null,
      select(_f, opts) { this._opts = opts; return this; },
      eq() { return this; }, is() { return this; }, order() { return this; }, limit() { return this; },
      async single() { return { data: existingRows[0] || null, error: null }; },
      then(r) {
        if (this._opts?.head) return Promise.resolve({ count: existingRows.length + capturedInserts.length, error: null }).then(r);
        return Promise.resolve({ data: existingRows, error: null }).then(r);
      },
      insert(payload) {
        capturedInserts.push(payload);
        return {
          select: () => Promise.resolve({
            data: [{ id: 'inserted-' + capturedInserts.length, ...payload, scored_at: new Date().toISOString() }],
            error: null,
          }),
        };
      },
      update() { return { eq: () => Promise.resolve({ data: null, error: null }) }; },
    }),
    eva_vision_documents: () => ({
      select() { return this; }, order() { return this; }, limit() { return this; },
      then(r) { return Promise.resolve({ data: [{ id: 'vision-1' }], error: null }).then(r); },
    }),
    user_stories: () => ({
      select() { return this; }, eq() { return this; },
      then(r) { return Promise.resolve({ data: [], error: null }).then(r); },
    }),
    sd_phase_handoffs: () => ({
      select() { return this; }, eq() { return this; },
      then(r) { return Promise.resolve({ data: [{ id: 'h1' }, { id: 'h2' }], error: null }).then(r); },
    }),
    product_requirements_v2: () => ({
      select() { return this; }, eq() { return this; }, limit() { return this; },
      async single() { return { data: { id: 'prd-1', status: 'approved' }, error: null }; },
    }),
    retrospectives: () => ({
      select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
      async single() { return { data: { id: 'r1', status: 'PUBLISHED', quality_score: 90 }, error: null }; },
    }),
    audit_log: () => ({ insert: () => Promise.resolve({ data: null, error: null }) }),
    app_config: () => ({
      select() { return this; }, eq() { return this; },
      async single() { return { data: null, error: { code: 'PGRST116' } }; },
    }),
  };
  return {
    from: (t) => (handlers[t] ? handlers[t]() : {
      select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
      single: () => Promise.resolve({ data: null, error: null }),
      then(r) { return Promise.resolve({ data: [], error: null }).then(r); },
    }),
    _capturedInserts: capturedInserts,
  };
}

const ctx = { sd: { id: 'sd-uuid', sd_key: 'SD-TEST-001', sd_type: 'infrastructure' }, sdId: 'sd-uuid' };

describe('FR-1: a vision-mode row is never the verdict row', () => {
  it('vision-only rows -> gate runs SD-scoped auto-heal instead of adopting allScores[0]', async () => {
    const visionRow = {
      id: 'vision-row-1', total_score: 79, threshold_action: 'gap_closure_sd',
      rubric_snapshot: { vision_key: 'VISION-X', criteria: [] }, // no mode: 'sd-heal'
      scored_at: new Date().toISOString(),
    };
    const supabase = makeSupabase({ existingRows: [visionRow] });
    execSyncImpl = () => 'abc123 feat(SD-TEST-001): did the thing';

    const result = await createHealBeforeCompleteGate(supabase).validator(ctx);

    // The gate created its own sd-heal row rather than judging by the vision row.
    expect(supabase._capturedInserts.length).toBeGreaterThan(0);
    expect(supabase._capturedInserts[0].rubric_snapshot.mode).toBe('sd-heal');
    expect(result.details.score_id).not.toBe('vision-row-1');
    // Semantic 90 * 0.7 + structural (high, all checks green) — comfortably over the 80-3 bar.
    expect(result.passed).toBe(true);
  });

  it('an existing sd-heal row is still selected exactly as before (no behaviour change)', async () => {
    const sdHealRow = {
      id: 'sdheal-row-1', total_score: 95, threshold_action: 'accept',
      rubric_snapshot: { mode: 'sd-heal', source: 'fast-auto-heal' },
      scored_at: new Date().toISOString(),
    };
    const supabase = makeSupabase({ existingRows: [sdHealRow] });
    const result = await createHealBeforeCompleteGate(supabase).validator(ctx);
    expect(result.passed).toBe(true);
    expect(result.details.score_id).toBe('sdheal-row-1');
    expect(supabase._capturedInserts.length).toBe(0);
  });
});

describe('FR-2: fallback scoring is scoped to the SD changed files', () => {
  it('records the resolved changed-file set in rubric_snapshot.details.scored_files', async () => {
    const supabase = makeSupabase({ existingRows: [] });
    execSyncImpl = (cmd) => {
      if (String(cmd).includes('git log --all --grep')) return 'c1\nc2';
      if (String(cmd).includes('git show')) return 'lib/a.js\nlib/b.js\n';
      return '';
    };
    // Force the non-fast path so Tier-2 (scoped) produces the row: feature type skips Tier-1.
    const supabaseF = makeSupabase({ existingRows: [], sdType: 'feature' });
    const r = await createHealBeforeCompleteGate(supabaseF).validator({ sd: { id: 'sd-uuid', sd_key: 'SD-TEST-001', sd_type: 'feature' }, sdId: 'sd-uuid' });
    expect(supabaseF._capturedInserts.length).toBeGreaterThan(0);
    const snap = supabaseF._capturedInserts[0].rubric_snapshot;
    expect(snap.source).toBe('scoped-fallback-heal');
    expect(snap.details.scored_files).toEqual(['lib/a.js', 'lib/b.js']);
    expect(r.details).toBeDefined();
    expect(supabase._capturedInserts.length).toBe(0); // unused first mock untouched
  });

  it('degrades to key_changes-only when git is unavailable — never blocks on git state', async () => {
    const supabase = makeSupabase({ existingRows: [], sdType: 'feature' });
    execSyncImpl = () => { throw new Error('git unavailable'); };
    const r = await createHealBeforeCompleteGate(supabase).validator({ sd: { id: 'sd-uuid', sd_key: 'SD-TEST-001', sd_type: 'feature' }, sdId: 'sd-uuid' });
    expect(supabase._capturedInserts.length).toBeGreaterThan(0);
    expect(supabase._capturedInserts[0].rubric_snapshot.details.scored_files).toBe('degraded:key_changes_only');
    expect(typeof r.passed).toBe('boolean'); // verdict still produced
  });

  it('no vision-scorer import remains anywhere in the gate', () => {
    expect(gateSource()).not.toContain("import('../../../../../../scripts/eva/vision-scorer.js')");
  });
});

describe('resolveSdChangedFiles ladder', () => {
  it('SD-key commits -> their file lists, deduped', () => {
    execSyncImpl = (cmd) => {
      if (String(cmd).includes('git log --all --grep')) return 'c1\nc2\n';
      if (String(cmd).includes('git show')) return 'a.js\nb.js\na.js\n';
      return '';
    };
    expect(resolveSdChangedFiles('SD-TEST-001')).toEqual(['a.js', 'b.js']);
  });

  it('no SD-key commits -> merge-base diff fallback', () => {
    execSyncImpl = (cmd) => {
      const c = String(cmd);
      if (c.includes('git log --all --grep')) return '';
      if (c.includes('merge-base')) return 'basehash';
      if (c.includes('git diff --name-only')) return 'x.js\ny.js\n';
      return '';
    };
    expect(resolveSdChangedFiles('SD-TEST-001')).toEqual(['x.js', 'y.js']);
  });

  it('git failure -> null (degradation, not a throw)', () => {
    execSyncImpl = () => { throw new Error('boom'); };
    expect(resolveSdChangedFiles('SD-TEST-001')).toBeNull();
  });
});

describe('provenance never leaks into dimension_scores', () => {
  it('scored_files and elapsed_ms are both excluded', () => {
    const dims = buildFastHealDimensionScores({
      details: { structural: { score: 80 }, semantic: { score: 90 }, elapsed_ms: 1234, scored_files: ['a.js'] },
    });
    expect(dims).toEqual({ structural: { score: 80 }, semantic: { score: 90 } });
  });
});

describe('FR-3: printed remediation is reachable pre-completion', () => {
  it('every /heal remediation string in the gate carries --in-progress', () => {
    const src = gateSource();
    const bare = src.match(/\/heal sd --sd-id \$\{sdKey\}(?! --in-progress)/g) || [];
    expect(bare).toEqual([]);
    expect((src.match(/--in-progress/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('heal-command.mjs honors an explicit --sd-id regardless of completion status', () => {
    const cli = fs.readFileSync(path.join(here, '../../../../../../scripts/eva/heal-command.mjs'), 'utf8');
    expect(cli).toMatch(/opts\.inProgress \|\| opts\.sdId/);
  });
});
