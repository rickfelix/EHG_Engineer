/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-4.
 *
 * Fixture shapes mirror AltifyAI's real, EXEC-time-verified data exactly:
 * screens 2-5 built_and_walked (journey steps reference them, matching
 * uat_test_results via metadata.source_id -> step_id -> screen_ref), screens
 * 0/1/6/7/8 unreachable (no journey step references them).
 */
import { describe, it, expect } from 'vitest';
import { buildScreenReconciliation, readScreenReconciliation } from '../../../../lib/eva/stage-templates/screen-reconciliation-builder.js';

const silentLogger = { info: () => {}, warn: () => {}, log: () => {}, error: () => {} };

const WIREFRAME_SCREENS = [
  { screen_id: 'screen-0', screen_name: 'Landing Page' },
  { screen_id: 'screen-1', screen_name: 'Signup/Registration' },
  { screen_id: 'screen-2', screen_name: 'Dashboard' },
  { screen_id: 'screen-6', screen_name: 'Integrations' },
];

const JOURNEYS = [
  {
    journey_id: 'jny-upload',
    steps: [{ step_id: 'stp-upload', screen_ref: 'screen-2' }],
  },
];

// The production module fires both venture_artifacts reads (wireframe_screens,
// then blueprint_user_journey) as the first two entries of one Promise.all array
// literal -- JS evaluates array elements left-to-right synchronously before
// Promise.all runs, so the .maybeSingle() CALLS happen in that fixed order even
// though the array resolves in parallel. This mock relies on that call order,
// verified against the real module (dry-run against live AltifyAI data, EXEC-time).
function buildTwoCallVentureArtifactsMock({ screens, journeys, unreachableScreens }) {
  let callIndex = 0;
  return {
    select() {
      return {
        eq() { return this; },
        maybeSingle: () => {
          callIndex += 1;
          if (callIndex === 1) return Promise.resolve({ data: { artifact_data: { screens } }, error: null });
          return Promise.resolve({ data: { artifact_data: { journeys, coverage_selfcheck: { unreachable_screens: unreachableScreens } } }, error: null });
        },
      };
    },
  };
}

function buildMockSupabase({
  screens = WIREFRAME_SCREENS,
  journeys = JOURNEYS,
  unreachableScreens = ['screen-0', 'screen-1', 'screen-6'],
  dispositionRows = [],
  uatRunId = 'run-1',
  uatResults = [{ status: 'pass', metadata: { source_id: 'stp-upload' } }],
  upsertShouldFail = false,
} = {}) {
  const upserts = [];
  const ventureArtifactsMock = buildTwoCallVentureArtifactsMock({ screens, journeys, unreachableScreens });
  return {
    _upserts: upserts,
    from(table) {
      if (table === 'venture_artifacts') return ventureArtifactsMock;
      if (table === 'venture_screen_dispositions') {
        return { select() { return { eq() { return this; }, limit: () => Promise.resolve({ data: dispositionRows, error: null }) }; } };
      }
      if (table === 'uat_test_runs') {
        return {
          select() {
            return {
              eq() { return this; },
              order() { return this; },
              limit() { return this; },
              maybeSingle: () => Promise.resolve(uatRunId ? { data: { id: uatRunId }, error: null } : { data: null, error: null }),
            };
          },
        };
      }
      if (table === 'uat_test_results') {
        return { select() { return { eq() { return this; }, limit: () => Promise.resolve({ data: uatResults, error: null }) }; } };
      }
      if (table === 'venture_screen_reconciliation') {
        return {
          upsert(rows) {
            upserts.push(rows);
            return Promise.resolve({ error: upsertShouldFail ? { message: 'upsert failed' } : null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('buildScreenReconciliation', () => {
  it('AltifyAI-shaped: writes exactly 4 rows, screen-2 built_and_walked, unreferenced screens unreachable', async () => {
    const supabase = buildMockSupabase();
    const result = await buildScreenReconciliation({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result.ok).toBe(true);
    expect(result.rowsWritten).toBe(4);
    const rows = supabase._upserts[0];
    const screen2 = rows.find((r) => r.screen_id === 'screen-2');
    expect(screen2.journey_ids).toEqual(['jny-upload']);
    expect(screen2.walked_step_evidence).toEqual({ stepIds: ['stp-upload'], allPassed: true });
    expect(screen2.reconciliation_status).toBe('built_and_walked');
    const screen0 = rows.find((r) => r.screen_id === 'screen-0');
    expect(screen0.reconciliation_status).toBe('unreachable');
    expect(screen0.journey_ids).toEqual([]);
  });

  it('a journey-referenced screen with no UAT run at all reads built_not_walked, never a false built_and_walked', async () => {
    const supabase = buildMockSupabase({ uatRunId: null });
    const result = await buildScreenReconciliation({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result.ok).toBe(true);
    const screen2 = supabase._upserts[0].find((r) => r.screen_id === 'screen-2');
    expect(screen2.reconciliation_status).toBe('built_not_walked');
    expect(screen2.walked_step_evidence).toBeNull();
  });

  it('a journey-referenced screen with a FAILING UAT result reads built_not_walked, not built_and_walked', async () => {
    const supabase = buildMockSupabase({ uatResults: [{ status: 'fail', metadata: { source_id: 'stp-upload' } }] });
    const result = await buildScreenReconciliation({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result.ok).toBe(true);
    const screen2 = supabase._upserts[0].find((r) => r.screen_id === 'screen-2');
    expect(screen2.reconciliation_status).toBe('built_not_walked');
    expect(screen2.walked_step_evidence.allPassed).toBe(false);
  });

  it('an ENTRY_POINT disposition supplies built_surface_artifact_type and flips an unreachable screen to built_not_walked', async () => {
    const supabase = buildMockSupabase({
      dispositionRows: [{ screen_id: 'screen-0', disposition_class: 'ENTRY_POINT', evidence_ref: 'marketing_landing_hero' }],
    });
    const result = await buildScreenReconciliation({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result.ok).toBe(true);
    const screen0 = supabase._upserts[0].find((r) => r.screen_id === 'screen-0');
    expect(screen0.built_surface_artifact_type).toBe('marketing_landing_hero');
    expect(screen0.reconciliation_status).toBe('built_not_walked');
  });

  it('does not throw when wireframe_screens is empty', async () => {
    const supabase = buildMockSupabase({ screens: [] });
    const result = await buildScreenReconciliation({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result.ok).toBe(true);
    expect(result.rowsWritten).toBe(0);
  });

  it('does not throw when supabase or ventureId is missing', async () => {
    await expect(buildScreenReconciliation({ supabase: null, ventureId: 'v1' })).resolves.toEqual({ ok: false, reason: 'missing_supabase_or_ventureId' });
  });

  it('reports upsert_failed without throwing when the write fails', async () => {
    const supabase = buildMockSupabase({ upsertShouldFail: true });
    const result = await buildScreenReconciliation({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('upsert_failed');
  });
});

describe('readScreenReconciliation', () => {
  it('returns rows for the sitting packet to consume', async () => {
    const rows = [{ screen_id: 'screen-2', screen_name: 'Dashboard', reconciliation_status: 'built_and_walked' }];
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: rows, error: null }) }) }) }) };
    const result = await readScreenReconciliation({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result).toEqual(rows);
  });

  it('returns an empty array (never throws) on missing supabase/ventureId or a DB error', async () => {
    expect(await readScreenReconciliation({ supabase: null, ventureId: 'v1' })).toEqual([]);
    const erroring = { from: () => ({ select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }) };
    expect(await readScreenReconciliation({ supabase: erroring, ventureId: 'v1', logger: silentLogger })).toEqual([]);
  });
});
