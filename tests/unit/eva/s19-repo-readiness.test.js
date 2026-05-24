/**
 * Unit tests for the Stage-19 Claude-Code-ready readiness contract.
 *
 * SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-C (Child C)
 *   TS-2  pure buildReadinessSummary
 *   TS-3  async resolveRepoReadiness (build-into + create-new) with injected fake client
 *   TS-4  resilience — resolveRepoReadiness never throws
 *   TS-5  drift-lock — buildPlanSummary matches buildBuildTasks output
 *
 * TEST_REQUIRES_DB: false — every database access goes through injected fakes or
 * pure functions; no real database connection is opened.
 */
import { describe, it, expect } from 'vitest';
import {
  buildReadinessSummary,
  resolveRepoReadiness,
  SEEDED_ARTIFACTS,
} from '../../../lib/eva/bridge/repo-readiness.js';
import { buildBuildTasks } from '../../../lib/eva/bridge/build-tasks-writer.js';

const SAFE_REPO = 'https://github.com/owner/repo';

/**
 * Minimal chainable fake of the data client surface that resolveRepoReadiness and
 * resolveVentureRepoUrl touch: ventures (repo_url / name), venture_artifacts
 * (s17_approved fallback + wireframe_screens S15), and the export_blueprint_review RPC.
 */
function makeDb({ repoUrl = null, ventureName = 'Venture', groups = [], s15Screens = null, throws = false } = {}) {
  const rpc = async (name) => {
    if (throws) throw new Error('rpc boom');
    if (name === 'export_blueprint_review') return { data: { groups } };
    return { data: null };
  };
  function builder() {
    const state = { columns: '', filters: {} };
    const single = async () => ({ data: resolveSingle(state) });
    const api = {
      select(cols) { state.columns = String(cols || ''); return api; },
      eq(col, val) { state.filters[col] = val; return api; },
      order() { return api; },
      limit() { return api; },
      maybeSingle: single,
      single,
      // thenable: resolveVentureRepoUrl's s17_approved fallback awaits the builder directly
      then: (onFulfilled, onRejected) =>
        Promise.resolve({ data: resolveList(state) }).then(onFulfilled, onRejected),
    };
    return api;
  }
  function resolveSingle(state) {
    if (throws) throw new Error('from boom');
    if (state.columns.includes('repo_url')) return repoUrl ? { repo_url: repoUrl } : null;
    if (state.columns.includes('name')) return { name: ventureName };
    if (state.filters.artifact_type === 'wireframe_screens') {
      return s15Screens ? { artifact_data: { screens: s15Screens } } : null;
    }
    return null;
  }
  function resolveList() {
    return []; // s17_approved fallback → no rows (create-new path)
  }
  return { from: () => builder(), rpc };
}

function blueprintGroups(screens) {
  return [
    {
      group_key: 'how_to_build_it',
      artifacts: [{ artifact_type: 'blueprint_wireframes', content: { wireframes: { screens } } }],
    },
  ];
}

describe('buildReadinessSummary (pure) — TS-2', () => {
  it('passes repoReady through and lists the three seeded artifacts', () => {
    const s = buildReadinessSummary({ repoReady: true, ventureName: 'Canvas AI', screens: [{ name: 'A' }, { name: 'B' }] });
    expect(s.repoReady).toBe(true);
    expect(s.seededArtifacts).toEqual(['CLAUDE.md', 'docs/build-tasks.md', '.replit']);
    expect(s.seededArtifacts).toEqual(SEEDED_ARTIFACTS);
    expect(s.buildPlanSummary).toEqual({
      orchestrator: 'Canvas AI build',
      childCount: 3,
      screenCount: 2,
      featureTaskCount: 2,
      source: 'screens',
    });
  });

  it('uses a single skeleton task and source=skeleton when no screens resolve', () => {
    const s = buildReadinessSummary({ repoReady: false });
    expect(s.repoReady).toBe(false);
    expect(s.buildPlanSummary.screenCount).toBe(0);
    expect(s.buildPlanSummary.featureTaskCount).toBe(1);
    expect(s.buildPlanSummary.source).toBe('skeleton');
    expect(s.buildPlanSummary.orchestrator).toBe('Venture build');
  });

  it('does not mutate the shared SEEDED_ARTIFACTS export', () => {
    const s = buildReadinessSummary({});
    s.seededArtifacts.push('mutated');
    expect(SEEDED_ARTIFACTS).toEqual(['CLAUDE.md', 'docs/build-tasks.md', '.replit']);
  });
});

describe('resolveRepoReadiness (async) — TS-3', () => {
  it('build-into: resolvable repo + blueprint screens → repoReady true with the venture plan', async () => {
    const db = makeDb({
      repoUrl: SAFE_REPO,
      ventureName: 'Canvas AI',
      groups: blueprintGroups([{ name: 'Dashboard' }, { name: 'Studio' }, { name: 'Shop' }]),
    });
    const s = await resolveRepoReadiness('11111111-2222-3333-4444-555555555555', { supabase: db });
    expect(s.repoReady).toBe(true);
    expect(s.buildPlanSummary.orchestrator).toBe('Canvas AI build');
    expect(s.buildPlanSummary.screenCount).toBe(3);
    expect(s.buildPlanSummary.featureTaskCount).toBe(3);
    expect(s.seededArtifacts).toEqual(SEEDED_ARTIFACTS);
  });

  it('falls back to the S15 wireframe_screens artifact when blueprint screens are absent', async () => {
    const db = makeDb({
      repoUrl: SAFE_REPO,
      ventureName: 'Canvas AI',
      groups: blueprintGroups([]), // no blueprint screens → S15 fallback
      s15Screens: [{ screen_name: 'Home' }, { screen_name: 'Settings' }],
    });
    const s = await resolveRepoReadiness('11111111-2222-3333-4444-555555555555', { supabase: db });
    expect(s.repoReady).toBe(true);
    expect(s.buildPlanSummary.screenCount).toBe(2);
  });

  it('create-new: no repo + no screens → repoReady false, skeleton plan', async () => {
    const db = makeDb({ repoUrl: null, ventureName: 'Fresh', groups: [] });
    const s = await resolveRepoReadiness('11111111-2222-3333-4444-555555555555', { supabase: db });
    expect(s.repoReady).toBe(false);
    expect(s.buildPlanSummary.screenCount).toBe(0);
    expect(s.buildPlanSummary.featureTaskCount).toBe(1);
  });
});

describe('resolveRepoReadiness resilience — TS-4', () => {
  it('never throws when the client errors — returns a safe not-ready summary', async () => {
    const db = makeDb({ throws: true });
    const s = await resolveRepoReadiness('11111111-2222-3333-4444-555555555555', { supabase: db });
    expect(s.repoReady).toBe(false);
    expect(s.seededArtifacts).toEqual(SEEDED_ARTIFACTS);
    expect(s.buildPlanSummary.source).toBe('skeleton');
  });

  it('degrades to zero screens (not a throw) when only the RPC fails', async () => {
    // ventures/repo resolve fine, but export_blueprint_review throws → screens default to 0.
    const db = makeDb({ repoUrl: SAFE_REPO, ventureName: 'Partial' });
    db.rpc = async () => { throw new Error('rpc down'); };
    const s = await resolveRepoReadiness('11111111-2222-3333-4444-555555555555', { supabase: db });
    expect(s.repoReady).toBe(true); // repo still resolved
    expect(s.buildPlanSummary.screenCount).toBe(0);
    expect(s.buildPlanSummary.featureTaskCount).toBe(1);
  });
});

describe('buildPlanSummary drift-lock vs buildBuildTasks — TS-5', () => {
  const cases = [
    [],
    [{ name: 'A' }],
    [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
  ];
  it.each(cases)('childCount=3 and featureTaskCount match the generated build-tasks.md (%#)', (screens) => {
    const md = buildBuildTasks({ name: 'V', screens });
    const childCount = (md.match(/^### Child /gm) || []).length;
    const grandchildCount = (md.match(/^- \[ \] \*\*2\./gm) || []).length;
    const summary = buildReadinessSummary({ repoReady: true, ventureName: 'V', screens }).buildPlanSummary;
    expect(summary.childCount).toBe(childCount);
    expect(summary.featureTaskCount).toBe(grandchildCount);
  });
});
