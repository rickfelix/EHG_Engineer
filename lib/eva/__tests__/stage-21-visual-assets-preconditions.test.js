/**
 * SD-LEO-FIX-FIX-STAGE-VISUAL-001 — regression tests for the Stage 21 Visual Assets
 * NO_PRECONDITIONS skip-for-all-ventures bug.
 *
 * Root cause (verify_before_build_finding_v2):
 *   1. CROSS_STAGE_DEPS[21] was the stale [19,20] — the engine never fetched S11/S17,
 *      so stage11Data/stage17Data never reached the analyzer.
 *   2. The analyzer read granular keys (stage11ColorData/…/deploymentUrl) nothing
 *      populated, and checked an s17_archetypes artifact_type S17 doesn't emit.
 *
 * These tests pin the corrected contract: Stage 21 RUNS (not skips) for a venture with
 * S11 brand identity + S17 designs + a resolvable deployment, and SKIPS with the right
 * skip_reason when each precondition is absent. Network-free: the LLM is mocked to throw
 * (forcing the deterministic fallback) and supabase is a hand-rolled chainable stub.
 */
import { describe, it, expect, vi } from 'vitest';

// Force the LLM fallback path so the test never makes a network call.
// Resolves to the same module the analyzer imports (lib/llm/index.js).
vi.mock('../../llm/index.js', () => ({
  getLLMClient: () => ({ complete: async () => { throw new Error('no-llm-in-test'); } }),
}));

const {
  analyzeStage21VisualAssets,
  validateEntryPreconditions,
  resolveDeploymentUrl,
} = await import('../stage-templates/analysis-steps/stage-21-visual-assets.js');

/**
 * Minimal chainable supabase stub. Every builder method returns the same thenable;
 * awaiting it resolves to a response derived from the table + operation.
 *   config = { ventureResources: [...], ventures: {...}|null }
 */
function makeSupabase(config = {}) {
  const makeQuery = (table) => {
    const state = { table, op: 'select' };
    const resolve = () => {
      if (state.op === 'insert' || state.op === 'update') return { data: null, error: null };
      if (table === 'venture_resources') return { data: config.ventureResources ?? [], error: null };
      if (table === 'ventures') return { data: config.ventures ?? null, error: null };
      if (table === 'leo_feature_flags') return { data: null, error: null };
      return { data: null, error: null };
    };
    const q = {
      select() { return q; },
      insert() { state.op = 'insert'; return q; },
      update() { state.op = 'update'; return q; },
      eq() { return q; },
      in() { return q; },
      order() { return q; },
      limit() { return q; },
      maybeSingle() { return Promise.resolve(resolve()); },
      single() { return Promise.resolve(resolve()); },
      then(onF, onR) { return Promise.resolve(resolve()).then(onF, onR); },
    };
    return q;
  };
  return { from: (t) => makeQuery(t) };
}

const COMPLETE_S11 = { visualIdentity: { primary: '#0A0A0A', accent: '#22D3EE' }, logoSpec: { mark: 'wordmark' }, brandExpression: { tone: 'confident' } };
const COMPLETE_S17 = { s17_approved: true, s17_strategy_recommendation: 'ship' };
const silent = { info() {}, warn() {}, log() {}, error() {} };

describe('validateEntryPreconditions (pure)', () => {
  it('passes when S11 identity + S17 designs + deployment are all present', () => {
    const r = validateEntryPreconditions({ stage11Data: COMPLETE_S11, stage17Data: COMPLETE_S17, deploymentUrl: 'https://x.repl.co' });
    expect(r.ok).toBe(true);
    expect(r.missing).toHaveLength(0);
  });

  it('flags S11 (source_stage 11) when stage11Data has no visual identity content', () => {
    const r = validateEntryPreconditions({ stage11Data: { __byType: {} }, stage17Data: COMPLETE_S17, deploymentUrl: 'https://x' });
    expect(r.ok).toBe(false);
    expect(r.missing.some((m) => m.source_stage === 11)).toBe(true);
  });

  it('flags S17 (source_stage 17) when stage17Data is empty', () => {
    const r = validateEntryPreconditions({ stage11Data: COMPLETE_S11, stage17Data: {}, deploymentUrl: 'https://x' });
    expect(r.missing.some((m) => m.source_stage === 17)).toBe(true);
  });

  it('flags deployment when deploymentUrl is blank', () => {
    const r = validateEntryPreconditions({ stage11Data: COMPLETE_S11, stage17Data: COMPLETE_S17, deploymentUrl: '' });
    expect(r.missing.some((m) => m.artifact_type === 'venture_resources.deployment_url')).toBe(true);
  });
});

describe('resolveDeploymentUrl', () => {
  it('returns the venture_resources replit_deployment deployment_url', async () => {
    const sb = makeSupabase({ ventureResources: [{ deployment_url: 'https://app.repl.co', metadata: {} }] });
    expect(await resolveDeploymentUrl(sb, 'v1')).toBe('https://app.repl.co');
  });

  it('falls back to ventures.deployment_url when venture_resources has none', async () => {
    const sb = makeSupabase({ ventureResources: [], ventures: { deployment_url: 'https://fallback.example' } });
    expect(await resolveDeploymentUrl(sb, 'v1')).toBe('https://fallback.example');
  });

  it('returns empty string when no deployment exists anywhere', async () => {
    const sb = makeSupabase({ ventureResources: [], ventures: null });
    expect(await resolveDeploymentUrl(sb, 'v1')).toBe('');
  });

  // SD-LEO-FIX-FIX-STAGE-DEPLOYMENT-001 regression guards: the resolver read a
  // non-existent venture_resources.resource_url column → always '' → S21 false-skip.
  it('SELECTs the deployment_url column, not resource_url (column-name pin)', async () => {
    let vrSelect = null;
    const sb = {
      from(table) {
        const q = {
          select(cols) { if (table === 'venture_resources') vrSelect = cols; return q; },
          eq() { return q; },
          limit() { return Promise.resolve({ data: [{ deployment_url: 'https://x.dev/' }], error: null }); },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        };
        return q;
      },
    };
    await resolveDeploymentUrl(sb, 'v1');
    expect(vrSelect).toContain('deployment_url');
    expect(vrSelect).not.toContain('resource_url');
  });

  it('does NOT resolve a row carrying only the old resource_url column → "" (guards against reverting)', async () => {
    const sb = makeSupabase({ ventureResources: [{ resource_url: 'https://wrong.dev/' }], ventures: null });
    expect(await resolveDeploymentUrl(sb, 'v1')).toBe('');
  });
});

describe('analyzeStage21VisualAssets — RUN vs SKIP', () => {
  it('RUNS (not skips) for a venture with S11 + S17 + deployment, emitting assets', async () => {
    const sb = makeSupabase({ ventureResources: [{ deployment_url: 'https://app.repl.co' }] });
    const out = await analyzeStage21VisualAssets({
      stage11Data: COMPLETE_S11, stage17Data: COMPLETE_S17, stage10Data: {},
      ventureName: 'TestCo', ventureId: 'v1', supabase: sb, logger: silent,
    });
    expect(out._skip).not.toBe(true);
    expect(out.device_screenshots.length).toBeGreaterThanOrEqual(2);
    expect(out.social_graphics.length).toBeGreaterThanOrEqual(4);
  });

  it('SKIPS NO_S11_VISUAL_IDENTITY when S11 brand identity is absent', async () => {
    const sb = makeSupabase({ ventureResources: [{ deployment_url: 'https://app.repl.co' }] });
    const out = await analyzeStage21VisualAssets({
      stage17Data: COMPLETE_S17, stage10Data: {},
      ventureName: 'TestCo', ventureId: 'v1', supabase: sb, logger: silent,
    });
    expect(out._skip).toBe(true);
    expect(out.skip_reason).toBe('NO_S11_VISUAL_IDENTITY');
  });

  it('SKIPS NO_S17_APPROVED_DESIGNS when S17 designs are absent', async () => {
    const sb = makeSupabase({ ventureResources: [{ deployment_url: 'https://app.repl.co' }] });
    const out = await analyzeStage21VisualAssets({
      stage11Data: COMPLETE_S11, stage10Data: {},
      ventureName: 'TestCo', ventureId: 'v1', supabase: sb, logger: silent,
    });
    expect(out._skip).toBe(true);
    expect(out.skip_reason).toBe('NO_S17_APPROVED_DESIGNS');
  });

  it('SKIPS NO_DEPLOYMENT_URL when no deployment resolves', async () => {
    const sb = makeSupabase({ ventureResources: [], ventures: null });
    const out = await analyzeStage21VisualAssets({
      stage11Data: COMPLETE_S11, stage17Data: COMPLETE_S17, stage10Data: {},
      ventureName: 'TestCo', ventureId: 'v1', supabase: sb, logger: silent,
    });
    expect(out._skip).toBe(true);
    expect(out.skip_reason).toBe('NO_DEPLOYMENT_URL');
  });
});
