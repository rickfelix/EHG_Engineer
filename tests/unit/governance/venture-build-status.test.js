// SD-LEO-INFRA-VENTURE-STATUS-LANGUAGE-001.
//
// TS-1: the witnessed incident venture (Image Alt Text Generator) must render an honest
// not-built status despite having 7 completed venture_stage_work rows -- that table is a
// different axis (planning/artifact progress) and must never flip the verdict to built.
// TS-2: a genuinely deployed/live venture must still assert built/live -- no over-correction.
// TS-3: a DB read failure must render 'unknown', never a fabricated true/false.
import { describe, it, expect } from 'vitest';
import {
  deriveVentureBuildStatus,
  fetchVentureBuildStatus,
  fetchVentureBuildStatusBatch,
  fetchCauseLineForVenture,
  BUILD_STATUS,
  ASSERTS_BUILT,
} from '../../../lib/governance/venture-build-status.mjs';

// SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001 FR-5 fixtures.
const CAUSE_LEG = { producer: 'p', run_id: 'run-id-1', content_hash: 'h', item_count: 1, items: ['x'], items_truncated: false, absent: false, absent_reason: null };
const FAILED_ORCHESTRATOR_WITH_CAUSE = (ventureId) => ({
  metadata: {
    venture_id: ventureId,
    journey_walk_result: {
      status: 'fail',
      captured_cause: { window: { from: 'a', to: 'b' }, worker_logs: CAUSE_LEG, venture_errors: CAUSE_LEG, d1_failures: CAUSE_LEG, summary: 'captured cause: worker_logs=1' },
    },
  },
});

// The exact measured shape of the witnessed venture (ventures row), captured live
// 2026-08-11 for SD-LEO-INFRA-VENTURE-STATUS-LANGUAGE-001's LEAD strategic review.
const WITNESSED_VENTURE_ROW = Object.freeze({
  workflow_status: 'pending',
  workflow_started_at: null,
  deployment_url: null,
  repo_url: null,
  launch_mode: 'simulated',
});

/** Minimal fake Supabase query-builder: .from(t).select(c).eq(k,v)[.in(k,v)][.limit(n)].maybeSingle() */
function fakeSupabase(tableHandlers) {
  return {
    from(table) {
      const handler = tableHandlers[table];
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        limit: () => builder,
        order: () => builder,
        maybeSingle: async () => (handler ? handler.maybeSingle() : { data: null, error: new Error(`no handler for ${table}`) }),
        then: (resolve) => resolve(handler ? handler.list() : { data: [], error: new Error(`no handler for ${table}`) }),
      };
      return builder;
    },
  };
}

describe('deriveVentureBuildStatus — pure (TS-1, TS-2)', () => {
  it('TS-1 positive control: the witnessed venture (7 stage-work rows, workflow never started) renders not_started, never built', () => {
    const result = deriveVentureBuildStatus(WITNESSED_VENTURE_ROW, { hasRoutedDeployment: false });
    expect(result.status).toBe(BUILD_STATUS.NOT_STARTED);
    expect(ASSERTS_BUILT.has(result.status)).toBe(false);
    expect(result.evidence.real_build_started).toBe(false);
    // The function signature has no venture_stage_work / current_lifecycle_stage parameter at
    // all -- this assertion documents that omission is deliberate, not an oversight.
    expect(Object.keys(result.evidence)).not.toContain('venture_stage_work');
    expect(Object.keys(result.evidence)).not.toContain('current_lifecycle_stage');
  });

  it('TS-2: a genuinely deployed+live venture still asserts live -- no over-correction', () => {
    const result = deriveVentureBuildStatus(
      { workflow_status: 'completed', workflow_started_at: '2026-07-01T00:00:00Z', deployment_url: 'https://example.com', repo_url: 'https://github.com/x/y', launch_mode: 'live' },
      { hasRoutedDeployment: true }
    );
    expect(result.status).toBe(BUILD_STATUS.LIVE);
    expect(ASSERTS_BUILT.has(result.status)).toBe(true);
  });

  it('workflow_status=completed with NO real-build evidence still renders not_started -- a label is not evidence', () => {
    const result = deriveVentureBuildStatus({ workflow_status: 'completed', workflow_started_at: null, deployment_url: null, repo_url: null, launch_mode: 'simulated' }, {});
    expect(result.status).toBe(BUILD_STATUS.NOT_STARTED);
  });

  it('real-build evidence present but no routed deployment renders built_not_deployed', () => {
    const result = deriveVentureBuildStatus({ workflow_status: 'completed', repo_url: 'https://github.com/x/y', launch_mode: 'simulated' }, { hasRoutedDeployment: false });
    expect(result.status).toBe(BUILD_STATUS.BUILT_NOT_DEPLOYED);
  });

  it('workflow_status=in_progress with no build evidence yet renders not_started (not in_progress) -- real_build_started still wins', () => {
    const result = deriveVentureBuildStatus({ workflow_status: 'in_progress', workflow_started_at: null, deployment_url: null, repo_url: null, launch_mode: 'simulated' }, {});
    expect(result.status).toBe(BUILD_STATUS.NOT_STARTED);
  });

  it('workflow_status=in_progress WITH build evidence renders in_progress (not yet deployed)', () => {
    const result = deriveVentureBuildStatus({ workflow_status: 'in_progress', workflow_started_at: '2026-08-01T00:00:00Z', deployment_url: null, repo_url: null, launch_mode: 'simulated' }, {});
    expect(result.status).toBe(BUILD_STATUS.IN_PROGRESS);
  });

  it('null venture row renders unknown, never not_started or built', () => {
    const result = deriveVentureBuildStatus(null);
    expect(result.status).toBe(BUILD_STATUS.UNKNOWN);
    expect(ASSERTS_BUILT.has(result.status)).toBe(false);
  });

  it('measured_at is a fresh ISO timestamp on every call', () => {
    const a = deriveVentureBuildStatus(WITNESSED_VENTURE_ROW);
    expect(() => new Date(a.measured_at).toISOString()).not.toThrow();
  });
});

describe('fetchVentureBuildStatus — IO shell (TS-3)', () => {
  it('TS-3: an injected failing Supabase client renders unknown, never a fabricated true/false', async () => {
    const failing = fakeSupabase({
      ventures: { maybeSingle: async () => ({ data: null, error: new Error('connection refused') }) },
    });
    const result = await fetchVentureBuildStatus(failing, 'v-1');
    expect(result.status).toBe(BUILD_STATUS.UNKNOWN);
  });

  it('a venture row that does not exist renders unknown, not not_started', async () => {
    const empty = fakeSupabase({
      ventures: { maybeSingle: async () => ({ data: null, error: null }) },
    });
    const result = await fetchVentureBuildStatus(empty, 'ghost-venture');
    expect(result.status).toBe(BUILD_STATUS.UNKNOWN);
  });

  it('missing ventureId renders unknown without querying', async () => {
    const result = await fetchVentureBuildStatus(fakeSupabase({}), null);
    expect(result.status).toBe(BUILD_STATUS.UNKNOWN);
  });

  it('a successful ventures read with a failing venture_deployments read still derives a real status (deployment degrades to not-confirmed, not overall unknown)', async () => {
    const partial = fakeSupabase({
      ventures: { maybeSingle: async () => ({ data: { ...WITNESSED_VENTURE_ROW }, error: null }) },
      venture_deployments: { maybeSingle: async () => { throw new Error('deployments table unavailable'); } },
    });
    const result = await fetchVentureBuildStatus(partial, 'v-1');
    expect(result.status).toBe(BUILD_STATUS.NOT_STARTED);
  });
});

describe('fetchVentureBuildStatusBatch — batched IO shell', () => {
  it('returns unknown for every id when the ventures batch read fails, and returns a map keyed by every requested id', async () => {
    const failing = fakeSupabase({
      ventures: { list: async () => ({ data: null, error: new Error('batch read failed') }) },
      venture_deployments: { list: async () => ({ data: [], error: null }) },
    });
    const result = await fetchVentureBuildStatusBatch(failing, ['v-1', 'v-2']);
    expect(result.size).toBe(2);
    expect(result.get('v-1').status).toBe(BUILD_STATUS.UNKNOWN);
    expect(result.get('v-2').status).toBe(BUILD_STATUS.UNKNOWN);
  });

  it('empty ventureIds returns an empty map without querying', async () => {
    const result = await fetchVentureBuildStatusBatch(fakeSupabase({}), []);
    expect(result.size).toBe(0);
  });
});

describe('fetchCauseLineForVenture — FR-5 (SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001)', () => {
  it('returns null when no orchestrator row exists for the venture', async () => {
    const empty = fakeSupabase({ strategic_directives_v2: { list: async () => ({ data: [], error: null }) } });
    expect(await fetchCauseLineForVenture(empty, 'v-1')).toBeNull();
  });

  it('returns null (fail-soft) on a read error, never throws', async () => {
    const failing = fakeSupabase({ strategic_directives_v2: { list: async () => ({ data: null, error: new Error('boom') }) } });
    await expect(fetchCauseLineForVenture(failing, 'v-1')).resolves.toBeNull();
  });

  it('returns null when the most recent orchestrator has no failed walk (a clean walk is not a cause)', async () => {
    const clean = fakeSupabase({ strategic_directives_v2: { list: async () => ({ data: [{ metadata: { venture_id: 'v-1', journey_walk_result: { status: 'pass' } } }], error: null }) } });
    expect(await fetchCauseLineForVenture(clean, 'v-1')).toBeNull();
  });

  it('renders the formatted cause line for a failed walk carrying captured_cause', async () => {
    const withCause = fakeSupabase({ strategic_directives_v2: { list: async () => ({ data: [FAILED_ORCHESTRATOR_WITH_CAUSE('v-1')], error: null }) } });
    const line = await fetchCauseLineForVenture(withCause, 'v-1');
    expect(line).toContain('cause: captured cause: worker_logs=1');
  });

  it('missing ventureId or supabase returns null without querying', async () => {
    expect(await fetchCauseLineForVenture(null, 'v-1')).toBeNull();
    expect(await fetchCauseLineForVenture(fakeSupabase({}), null)).toBeNull();
  });
});

describe('FR-5 additive cause field — never alters the BUILD_STATUS enum (TS-10 regression guard)', () => {
  it('fetchVentureBuildStatus: a venture with a captured cause gets an additive `cause` key, status unchanged', async () => {
    const withCause = fakeSupabase({
      ventures: { maybeSingle: async () => ({ data: { ...WITNESSED_VENTURE_ROW }, error: null }) },
      venture_deployments: { maybeSingle: async () => ({ data: null, error: null }) },
      strategic_directives_v2: { list: async () => ({ data: [FAILED_ORCHESTRATOR_WITH_CAUSE('v-1')], error: null }) },
    });
    const result = await fetchVentureBuildStatus(withCause, 'v-1');
    expect(result.status).toBe(BUILD_STATUS.NOT_STARTED); // byte-identical to the no-cause fixture above
    expect(result.cause).toContain('cause: captured cause: worker_logs=1');
  });

  it('fetchVentureBuildStatus: no `cause` key at all when there is nothing to show (additive-only, never a placeholder)', async () => {
    const noCause = fakeSupabase({
      ventures: { maybeSingle: async () => ({ data: { ...WITNESSED_VENTURE_ROW }, error: null }) },
      venture_deployments: { maybeSingle: async () => ({ data: null, error: null }) },
      strategic_directives_v2: { list: async () => ({ data: [], error: null }) },
    });
    const result = await fetchVentureBuildStatus(noCause, 'v-1');
    expect(result.status).toBe(BUILD_STATUS.NOT_STARTED);
    expect('cause' in result).toBe(false);
  });

  it('fetchVentureBuildStatusBatch: additive cause per-venture, every other fixture byte-identical', async () => {
    const batch = fakeSupabase({
      ventures: { list: async () => ({ data: [{ id: 'v-1', ...WITNESSED_VENTURE_ROW }, { id: 'v-2', ...WITNESSED_VENTURE_ROW }], error: null }) },
      venture_deployments: { list: async () => ({ data: [], error: null }) },
      strategic_directives_v2: { list: async () => ({ data: [FAILED_ORCHESTRATOR_WITH_CAUSE('v-1')], error: null }) },
    });
    const result = await fetchVentureBuildStatusBatch(batch, ['v-1', 'v-2']);
    expect(result.get('v-1').status).toBe(BUILD_STATUS.NOT_STARTED);
    expect(result.get('v-1').cause).toContain('captured cause: worker_logs=1');
    expect(result.get('v-2').status).toBe(BUILD_STATUS.NOT_STARTED);
    expect('cause' in result.get('v-2')).toBe(false);
  });
});
