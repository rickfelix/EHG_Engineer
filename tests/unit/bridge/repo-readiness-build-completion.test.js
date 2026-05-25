/**
 * Unit tests for lib/eva/bridge/repo-readiness.js — FR-3 build-task completion.
 * SD-LEO-FEAT-FINALIZE-CLAUDE-CODE-001.
 *
 * Covers:
 *   - normalizeBuildTaskCompletion (PURE) — degrade-safe normalization to {total,complete,ratio}|null.
 *   - buildReadinessSummary (PURE) — new buildTaskCompletion field; existing buildPlanSummary shape unchanged.
 *   - resolveRepoReadiness (ASYNC, injected mock supabase — NO real DB/server) — end-to-end plumbing
 *     of the build_mvp_build artifact through to summary.buildTaskCompletion (TS-5 / TS-6).
 *   - The stage19 register-deployment completion-count derivation contract (TS-5 / TS-6), exercised
 *     against the same pure functions the route consumes, plus a faithful re-implementation of the
 *     route's derivation expression so the [0,total]-clamp / default-to-total / degrade-safe-omit
 *     behavior is asserted without a live Express server.
 *
 * Scenario mapping:
 *   TS-5: artifact carries build_tasks_total / build_tasks_complete.
 *   TS-6: absent fields -> no throw, behaves as today (null / omitted).
 *   TS-7: build_method enum unchanged — verified by the migration script
 *         scripts/one-off/_update-s19-stage-config-description.mjs (asserts build_method stays
 *         'replit_agent'). Documented here; intentionally NOT exercised against prod DB.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeBuildTaskCompletion,
  buildReadinessSummary,
  resolveRepoReadiness,
  SEEDED_ARTIFACTS,
} from '../../../lib/eva/bridge/repo-readiness.js';

const VID = '4f71b3bd-8a1e-462e-a8b2-76efb8607206';

// ---------------------------------------------------------------------------
// normalizeBuildTaskCompletion (PURE)
// ---------------------------------------------------------------------------
describe('normalizeBuildTaskCompletion', () => {
  it('returns null for null / undefined / non-object input (TS-6 degrade-safe)', () => {
    expect(normalizeBuildTaskCompletion(null)).toBeNull();
    expect(normalizeBuildTaskCompletion(undefined)).toBeNull();
    expect(normalizeBuildTaskCompletion('nope')).toBeNull();
    expect(normalizeBuildTaskCompletion(42)).toBeNull();
    expect(normalizeBuildTaskCompletion(true)).toBeNull();
  });

  it('returns null when total is 0 (no finite positive total)', () => {
    expect(normalizeBuildTaskCompletion({ build_tasks_total: 0 })).toBeNull();
    expect(normalizeBuildTaskCompletion({ total: 0 })).toBeNull();
  });

  it('returns null when total is missing / non-numeric / negative', () => {
    expect(normalizeBuildTaskCompletion({})).toBeNull();
    expect(normalizeBuildTaskCompletion({ build_tasks_total: 'x' })).toBeNull();
    expect(normalizeBuildTaskCompletion({ build_tasks_total: -3 })).toBeNull();
    expect(normalizeBuildTaskCompletion({ build_tasks_total: NaN })).toBeNull();
  });

  it('computes {total, complete, ratio} for a partial build (TS-5)', () => {
    expect(normalizeBuildTaskCompletion({ build_tasks_total: 4, build_tasks_complete: 2 }))
      .toEqual({ total: 4, complete: 2, ratio: 0.5 });
  });

  it('clamps complete > total down to total (ratio 1)', () => {
    expect(normalizeBuildTaskCompletion({ build_tasks_total: 4, build_tasks_complete: 9 }))
      .toEqual({ total: 4, complete: 4, ratio: 1 });
  });

  it('clamps negative complete up to 0 (ratio 0)', () => {
    expect(normalizeBuildTaskCompletion({ build_tasks_total: 4, build_tasks_complete: -2 }))
      .toEqual({ total: 4, complete: 0, ratio: 0 });
  });

  it('defaults missing complete to 0 (ratio 0)', () => {
    expect(normalizeBuildTaskCompletion({ build_tasks_total: 5 }))
      .toEqual({ total: 5, complete: 0, ratio: 0 });
  });

  it('treats non-numeric complete as 0', () => {
    expect(normalizeBuildTaskCompletion({ build_tasks_total: 5, build_tasks_complete: 'two' }))
      .toEqual({ total: 5, complete: 0, ratio: 0 });
  });

  it('accepts {total, complete} alias keys', () => {
    expect(normalizeBuildTaskCompletion({ total: 4, complete: 2 }))
      .toEqual({ total: 4, complete: 2, ratio: 0.5 });
  });

  it('rounds ratio to 2 decimals', () => {
    // 1/3 -> 0.33
    expect(normalizeBuildTaskCompletion({ total: 3, complete: 1 }).ratio).toBe(0.33);
    // 2/3 -> 0.67
    expect(normalizeBuildTaskCompletion({ total: 3, complete: 2 }).ratio).toBe(0.67);
  });

  it('prefers {total} alias when both alias and build_tasks_* are present (?? precedence)', () => {
    // input.total ?? input.build_tasks_total -> total wins when defined
    expect(normalizeBuildTaskCompletion({ total: 2, build_tasks_total: 99, complete: 1 }))
      .toEqual({ total: 2, complete: 1, ratio: 0.5 });
  });
});

// ---------------------------------------------------------------------------
// buildReadinessSummary (PURE)
// ---------------------------------------------------------------------------
describe('buildReadinessSummary', () => {
  it('includes buildTaskCompletion when given a complete build (TS-5)', () => {
    const out = buildReadinessSummary({
      repoReady: true,
      ventureName: 'Acme',
      screens: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
      buildTaskCompletion: { build_tasks_total: 3, build_tasks_complete: 3 },
    });
    expect(out.buildTaskCompletion).toEqual({ total: 3, complete: 3, ratio: 1 });
  });

  it('buildTaskCompletion === null when no buildTaskCompletion arg (TS-6 degrade-safe)', () => {
    const out = buildReadinessSummary({ repoReady: true, ventureName: 'Acme', screens: [] });
    expect(out.buildTaskCompletion).toBeNull();
  });

  it('keeps the existing buildPlanSummary shape unchanged (childCount:3, featureTaskCount from screens)', () => {
    const out = buildReadinessSummary({
      repoReady: true,
      ventureName: 'Acme',
      screens: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
    });
    expect(out.buildPlanSummary).toEqual({
      orchestrator: 'Acme build',
      childCount: 3,
      screenCount: 3,
      featureTaskCount: 3,
      source: 'screens',
    });
    expect(out.repoReady).toBe(true);
    expect(out.seededArtifacts).toEqual([...SEEDED_ARTIFACTS]);
  });

  it('skeleton path: zero screens -> featureTaskCount 1, source skeleton (unchanged)', () => {
    const out = buildReadinessSummary({ repoReady: false, ventureName: '', screens: [] });
    expect(out.buildPlanSummary).toEqual({
      orchestrator: 'Venture build',
      childCount: 3,
      screenCount: 0,
      featureTaskCount: 1,
      source: 'skeleton',
    });
    expect(out.repoReady).toBe(false);
  });

  it('defaults safely with no args at all (degrade-safe not-ready summary)', () => {
    const out = buildReadinessSummary();
    expect(out.repoReady).toBe(false);
    expect(out.buildTaskCompletion).toBeNull();
    expect(out.buildPlanSummary.childCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// resolveRepoReadiness (ASYNC) — injected mock supabase, NO real DB.
// Verifies the build_mvp_build artifact plumbing end-to-end (never throws).
// ---------------------------------------------------------------------------

// Chainable supabase mock keyed by table; mirrors tests/unit/bridge/resolve-venture-repo.test.js.
// `responses` maps table -> { data, error }. rpc() returns rpcResponse.
function makeSupabase({ tables = {}, rpcResponse = { data: null, error: null } } = {}) {
  return {
    from(table) {
      const resp = tables[table] ?? { data: null, error: null };
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve(resp),
        single: () => Promise.resolve(resp),
      };
      return builder;
    },
    rpc: () => Promise.resolve(rpcResponse),
  };
}

describe('resolveRepoReadiness (mock supabase, no DB)', () => {
  it('surfaces buildTaskCompletion from the latest build_mvp_build artifact (TS-5)', async () => {
    const supabase = makeSupabase({
      tables: {
        ventures: { data: { name: 'Acme', repo_url: 'https://github.com/x/y' }, error: null },
        venture_artifacts: {
          data: { artifact_data: { build_tasks_total: 4, build_tasks_complete: 2 } },
          error: null,
        },
      },
    });
    const out = await resolveRepoReadiness(VID, { supabase });
    expect(out.buildTaskCompletion).toEqual({ total: 4, complete: 2, ratio: 0.5 });
    // never-throw contract: a well-formed summary is always returned
    expect(out.buildPlanSummary.childCount).toBe(3);
    expect(out.seededArtifacts).toEqual([...SEEDED_ARTIFACTS]);
  });

  it('buildTaskCompletion is null when the build_mvp_build artifact has no completion fields (TS-6)', async () => {
    const supabase = makeSupabase({
      tables: {
        ventures: { data: { name: 'Acme' }, error: null },
        venture_artifacts: { data: { artifact_data: { repo_url: 'https://github.com/x/y' } }, error: null },
      },
    });
    const out = await resolveRepoReadiness(VID, { supabase });
    expect(out.buildTaskCompletion).toBeNull();
  });

  it('buildTaskCompletion is null when no artifact exists at all (TS-6)', async () => {
    const supabase = makeSupabase({
      tables: {
        ventures: { data: { name: 'Acme' }, error: null },
        venture_artifacts: { data: null, error: null },
      },
    });
    const out = await resolveRepoReadiness(VID, { supabase });
    expect(out.buildTaskCompletion).toBeNull();
  });

  it('NEVER throws — a supabase that rejects yields a safe not-ready summary (FR-3 contract)', async () => {
    const exploding = {
      from() { throw new Error('db is down'); },
      rpc() { throw new Error('db is down'); },
    };
    const out = await resolveRepoReadiness(VID, { supabase: exploding });
    expect(out).toMatchObject({ repoReady: false, buildTaskCompletion: null });
    expect(out.buildPlanSummary.childCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// stage19 register-deployment completion-count DERIVATION contract (TS-5 / TS-6).
//
// The route (server/routes/stage19.js, register-deployment handler) derives the
// build_tasks_total / build_tasks_complete it writes into the build_mvp_build
// artifact_data from:
//   total = readiness.buildPlanSummary.featureTaskCount
//   if Number.isFinite(total):
//     buildTasksTotal = total
//     reported = Number(req.body.build_tasks_complete)
//     buildTasksComplete = Number.isFinite(reported) ? clamp(reported, 0, total) : total
//     -> artifact gets { build_tasks_total, build_tasks_complete }
//   else:
//     -> completion fields OMITTED entirely (degrade-safe)
//
// A full Express integration test would need a live server + service-role DB and
// would be brittle, so we assert this contract two ways:
//   (1) faithful re-implementation of the derivation expression (below), and
//   (2) round-trip: feed the derived fields back through normalizeBuildTaskCompletion
//       (what resolveRepoReadiness later does) to prove the artifact is consumable.
// ---------------------------------------------------------------------------

/** Faithful mirror of the route's derivation (stage19.js lines ~189-199). */
function deriveArtifactCompletion({ featureTaskCount, bodyBuildTasksComplete } = {}) {
  const total = featureTaskCount;
  if (!Number.isFinite(total)) return {}; // degrade-safe: completion fields omitted
  const reported = Number(bodyBuildTasksComplete);
  const buildTasksComplete = Number.isFinite(reported)
    ? Math.max(0, Math.min(reported, total))
    : total;
  return { build_tasks_total: total, build_tasks_complete: buildTasksComplete };
}

describe('stage19 register-deployment completion derivation', () => {
  it('TS-5: default build_tasks_complete = total when body omits it (registering asserts done)', () => {
    const fields = deriveArtifactCompletion({ featureTaskCount: 3, bodyBuildTasksComplete: undefined });
    expect(fields).toEqual({ build_tasks_total: 3, build_tasks_complete: 3 });
    // consumable: round-trips through the readiness normalizer to a complete build
    expect(normalizeBuildTaskCompletion(fields)).toEqual({ total: 3, complete: 3, ratio: 1 });
  });

  it('TS-5: honors an explicit body build_tasks_complete', () => {
    const fields = deriveArtifactCompletion({ featureTaskCount: 4, bodyBuildTasksComplete: 2 });
    expect(fields).toEqual({ build_tasks_total: 4, build_tasks_complete: 2 });
    expect(normalizeBuildTaskCompletion(fields)).toEqual({ total: 4, complete: 2, ratio: 0.5 });
  });

  it('clamps an explicit body value above total down to total', () => {
    const fields = deriveArtifactCompletion({ featureTaskCount: 3, bodyBuildTasksComplete: 99 });
    expect(fields).toEqual({ build_tasks_total: 3, build_tasks_complete: 3 });
  });

  it('clamps a negative explicit body value up to 0', () => {
    const fields = deriveArtifactCompletion({ featureTaskCount: 3, bodyBuildTasksComplete: -5 });
    expect(fields).toEqual({ build_tasks_total: 3, build_tasks_complete: 0 });
  });

  it('treats a non-numeric body value as "not reported" -> defaults to total', () => {
    const fields = deriveArtifactCompletion({ featureTaskCount: 3, bodyBuildTasksComplete: 'all' });
    expect(fields).toEqual({ build_tasks_total: 3, build_tasks_complete: 3 });
  });

  it('TS-6: degrade-safe — omits completion fields when featureTaskCount is not finite', () => {
    expect(deriveArtifactCompletion({ featureTaskCount: undefined, bodyBuildTasksComplete: 2 })).toEqual({});
    expect(deriveArtifactCompletion({ featureTaskCount: NaN, bodyBuildTasksComplete: 2 })).toEqual({});
    expect(deriveArtifactCompletion({})).toEqual({});
  });
});
