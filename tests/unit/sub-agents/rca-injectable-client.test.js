/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C (FR-C1/FR-C3). lib/sub-agents/rca.js previously always
 * built its own Supabase client inside execute(), making it untestable without a real DB
 * connection -- confirmed by zero prior direct unit tests for this module (PLAN-phase TESTING
 * review, evidence baded1f3). It now accepts an injected options.supabase, matching
 * scripts/record-explore-evidence.js's injected-store precedent. This proves: (1) the injection
 * seam is honored, (2) once given a REAL root_cause_reports id (the fix FR-C1 delivers upstream
 * in executor.js), execute() runs end-to-end instead of hitting the pre-fix "RCR not found"
 * failure mode, and (3) results.rcr_id echoes the given id -- which results-storage.js's
 * existing TOP_LEVEL_FIELDS_PERSISTED_TO_METADATA mapping (already tested independently in
 * results-storage-fleet-shape-census.test.js) then threads into metadata.rcr_id for citation
 * resolution (FR-C3).
 */
import { describe, it, expect, vi } from 'vitest';
import { execute } from '../../../lib/sub-agents/rca.js';

const RCR_ID = 'fixture-rcr-id-001';

function makeFixtureRcr(overrides = {}) {
  return {
    id: RCR_ID,
    failure_signature: 'fixture failure signature for a unit test',
    status: 'OPEN',
    trigger_tier: 4,
    // SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C: SUB_AGENT is the value resolveRcaDispatchTarget()
    // actually writes (EXEC-phase TESTING re-verify, evidence 28382f71, corrected from an
    // earlier value that violated the live CHECK constraint) -- keep this fixture realistic.
    trigger_source: 'SUB_AGENT',
    scope_type: 'SD',
    problem_statement: 'A fixture problem statement',
    observed: {},
    expected: {},
    analysis_attempts: 0,
    ...overrides,
  };
}

function makeMockSupabase({ rcr = makeFixtureRcr(), updateError = null } = {}) {
  const updates = [];
  return {
    updates,
    from(table) {
      if (table === 'root_cause_reports') {
        // Serves BOTH usage shapes rca.js needs from this table: the single-row fetch by id
        // (fetch + neq/eq/order/limit historical-pattern list), and the findings UPDATE.
        return {
          select() { return this; },
          eq() { return this; },
          neq() { return this; },
          order() { return this; },
          limit: async () => ({ data: [], error: null }),
          single: async () => ({ data: rcr, error: null }),
          update(payload) {
            updates.push(payload);
            return { eq: async () => ({ error: updateError }) };
          },
        };
      }
      if (table === 'rca_learning_records') {
        return { insert: async () => ({ error: null }) };
      }
      // The 5-Whys/pattern-match steps read other tables (e.g. issue_patterns) for context --
      // permissive empty results are fine for this unit's purpose (proving the injection seam
      // and the rcr_id echo, not the analysis engine's content).
      return {
        select() { return this; },
        eq() { return this; },
        gte() { return this; },
        lte() { return this; },
        order() { return this; },
        limit: async () => ({ data: [], error: null }),
        then(res) { return Promise.resolve({ data: [], error: null }).then(res); },
      };
    },
  };
}

describe('SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C FR-C1/FR-C3: rca.js accepts an injected supabase client', () => {
  it('uses options.supabase instead of building its own client, and does not hit "RCR not found" given a real fixture id', async () => {
    const supabase = makeMockSupabase();
    const results = await execute(RCR_ID, { name: 'RCA' }, { supabase, skipLearning: true });

    expect(results.verdict, 'must not be the pre-fix ERROR verdict from a failed RCR lookup').not.toBe('ERROR');
    expect(results.critical_issues.some((i) => /RCR not found/i.test(i.issue || ''))).toBe(false);
  });

  it('echoes the given id as results.rcr_id -- the value results-storage.js already maps into metadata.rcr_id for citation resolution', async () => {
    const supabase = makeMockSupabase();
    const results = await execute(RCR_ID, { name: 'RCA' }, { supabase, skipLearning: true });
    expect(results.rcr_id).toBe(RCR_ID);
  });

  it('writes real analysis fields into root_cause_reports\' own UPDATE payload (not just into the returned result object)', async () => {
    const supabase = makeMockSupabase();
    await execute(RCR_ID, { name: 'RCA' }, { supabase, skipLearning: true });
    expect(supabase.updates.length).toBe(1);
    const payload = supabase.updates[0];
    expect(payload).toHaveProperty('root_cause');
    expect(payload).toHaveProperty('causal_chain');
    expect(payload).toHaveProperty('contributing_factors');
    expect(['CAPA_PENDING', 'IN_REVIEW']).toContain(payload.status);
  });

  it('still returns a well-formed ERROR result (not a thrown exception) when the given id genuinely does not resolve', async () => {
    const supabase = makeMockSupabase();
    supabase.from = (table) => {
      if (table === 'root_cause_reports') {
        return { select() { return this; }, eq() { return this; }, single: async () => ({ data: null, error: { message: 'no rows' } }) };
      }
      return { select() { return this; }, eq() { return this; }, limit: async () => ({ data: [], error: null }) };
    };
    const results = await execute('a-nonexistent-rcr-id', { name: 'RCA' }, { supabase, skipLearning: true });
    expect(results.verdict).toBe('ERROR');
    expect(results.critical_issues[0].issue).toMatch(/RCR not found|Failed to fetch RCR/);
  });
});
