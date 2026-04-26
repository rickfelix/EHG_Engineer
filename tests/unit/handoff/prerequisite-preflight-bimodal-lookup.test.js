/**
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-134
 *
 * Tests the bimodal id/sd_key resolver wired into runPrerequisitePreflight
 * via the PR #3367 lookupSdIdForFk helper. Covers PRD test_scenarios TS-1
 * through TS-5: sd_key resolution, UUID-id resolution (the regression case),
 * miss path, dispatch through PLAN-TO-EXEC, and autoFix UPDATE writeback
 * after id-keyed load.
 */
import { describe, it, expect, vi } from 'vitest';
import { runPrerequisitePreflight } from '../../../scripts/modules/handoff/pre-checks/prerequisite-preflight.js';

// Lightweight Supabase stub: shapes responses per .from(table).select().eq().single()
// and per the .or().single() shape used by lookupSdIdForFk. Records every .eq()
// and .or() filter so tests can assert dispatch ordering.
function makeSupabase({ resolveRow, fullRow, prdRow, plan2leadRow, retroRow, updateError = null, captureUpdate = null }) {
  const calls = { eqs: [], ors: [], updates: [], inFilters: [] };
  const make = (overrides = {}) => ({
    select() { return this; },
    eq(col, val) {
      calls.eqs.push({ col, val });
      return this;
    },
    or(filter) {
      calls.ors.push(filter);
      return this;
    },
    in(col, vals) {
      calls.inFilters.push({ col, vals });
      return this;
    },
    limit() { return this; },
    update(payload) {
      calls.updates.push({ payload, eq: null });
      return {
        eq(col, val) {
          calls.updates[calls.updates.length - 1].eq = { col, val };
          if (captureUpdate) captureUpdate({ payload, eq: { col, val } });
          return Promise.resolve({ error: updateError });
        }
      };
    },
    async single() {
      return overrides.payload || { data: null, error: null };
    }
  });

  return {
    _calls: calls,
    from(table) {
      if (table === 'strategic_directives_v2') {
        // Two roles: lookupSdIdForFk uses .or().single() returning resolveRow;
        // preflight's full-row load uses .eq('id', X).single() returning fullRow;
        // autoFix writeback uses .update(...).eq('sd_key', X).
        let lastWasOr = false;
        return {
          select() { return this; },
          or(filter) {
            calls.ors.push(filter);
            lastWasOr = true;
            return this;
          },
          eq(col, val) {
            calls.eqs.push({ col, val });
            lastWasOr = false;
            return this;
          },
          update(payload) {
            calls.updates.push({ payload, eq: null });
            return {
              eq(col, val) {
                calls.updates[calls.updates.length - 1].eq = { col, val };
                if (captureUpdate) captureUpdate({ payload, eq: { col, val } });
                return Promise.resolve({ error: updateError });
              }
            };
          },
          async single() {
            if (lastWasOr) {
              return resolveRow || { data: null, error: { message: 'no row' } };
            }
            return fullRow || { data: null, error: null };
          }
        };
      }
      if (table === 'product_requirements_v2') {
        return {
          ...make({ payload: prdRow || { data: null, error: null } }),
          eq(col, val) { calls.eqs.push({ col, val }); return this; }
        };
      }
      if (table === 'sd_phase_handoffs') {
        return {
          select() { return this; },
          eq(col, val) { calls.eqs.push({ col, val }); return this; },
          in(col, vals) { calls.inFilters.push({ col, vals }); return this; },
          limit() { return Promise.resolve(plan2leadRow || { data: [], error: null }); }
        };
      }
      if (table === 'retrospectives') {
        return {
          select() { return this; },
          eq(col, val) { calls.eqs.push({ col, val }); return this; },
          limit() { return Promise.resolve(retroRow || { data: [], error: null }); }
        };
      }
      if (table === 'user_stories') {
        return {
          select() { return this; },
          eq(col, val) {
            calls.eqs.push({ col, val });
            return Promise.resolve({ data: [], error: null });
          }
        };
      }
      return make();
    }
  };
}

// A "complete" SD that satisfies all autoFix preconditions so we can assert on
// the resolution path without preflight tripping on autoFix details.
const COMPLETE_SD = {
  id: 'SD-FOO-001',
  sd_key: 'SD-FOO-001',
  sd_type: 'infrastructure',
  description: 'A '.repeat(120) + 'thorough description that exceeds the infrastructure minimum word count threshold so that DESCRIPTION_TOO_SHORT does not fire during these resolution tests.',
  risks: [{ risk: 'r', mitigation: 'm' }],
  key_principles: ['p1', 'p2'],
  implementation_guidelines: ['g1'],
  dependencies: [],
  smoke_test_steps: [{ instruction: 'i', expected_outcome: 'e' }]
};

// =============================================================================
// TS-1: sd_key resolves (legacy SDs where id == sd_key)
// =============================================================================
describe('TS-1: sd_key resolution still works', () => {
  it('resolves sd_key input and proceeds to LEAD-TO-PLAN checks', async () => {
    const supabase = makeSupabase({
      resolveRow: { data: { id: 'SD-FOO-001', sd_key: 'SD-FOO-001' }, error: null },
      fullRow: { data: COMPLETE_SD, error: null }
    });
    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', 'SD-FOO-001');
    expect(result.issues.find(i => i.code === 'SD_NOT_FOUND')).toBeUndefined();
    // lookupSdIdForFk used the OR filter
    expect(supabase._calls.ors[0]).toContain('id.eq.SD-FOO-001');
    expect(supabase._calls.ors[0]).toContain('sd_key.eq.SD-FOO-001');
    // Then full-row select keyed on resolved id
    expect(supabase._calls.eqs.some(e => e.col === 'id' && e.val === 'SD-FOO-001')).toBe(true);
  });
});

// =============================================================================
// TS-2: UUID id resolution (the regression case)
// =============================================================================
describe('TS-2: UUID-id resolution (the bug fix)', () => {
  it('resolves a UUID-shaped legacy id and does not emit SD_NOT_FOUND', async () => {
    const uuidId = 'db86fb73-b572-4a19-98d7-a1193c1299ed';
    const sdRow = { ...COMPLETE_SD, id: uuidId, sd_key: 'SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001' };
    const supabase = makeSupabase({
      resolveRow: { data: { id: uuidId, sd_key: 'SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001' }, error: null },
      fullRow: { data: sdRow, error: null }
    });
    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', uuidId);
    expect(result.issues.find(i => i.code === 'SD_NOT_FOUND')).toBeUndefined();
    expect(supabase._calls.ors[0]).toContain(`id.eq.${uuidId}`);
    expect(supabase._calls.eqs.some(e => e.col === 'id' && e.val === uuidId)).toBe(true);
  });
});

// =============================================================================
// TS-3: both id and sd_key miss → SD_NOT_FOUND with refreshed remediation
// =============================================================================
describe('TS-3: true-miss error path', () => {
  it('returns SD_NOT_FOUND when neither id nor sd_key matches', async () => {
    const supabase = makeSupabase({
      resolveRow: { data: null, error: { message: 'no row' } }
    });
    const result = await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', 'NOT-A-REAL-SD-9999');
    expect(result.passed).toBe(false);
    const miss = result.issues.find(i => i.code === 'SD_NOT_FOUND');
    expect(miss).toBeDefined();
    expect(miss.message).toContain('NOT-A-REAL-SD-9999');
    expect(miss.remediation).toMatch(/id or sd_key/);
  });
});

// =============================================================================
// TS-4: PLAN-TO-EXEC dispatch via UUID id
// =============================================================================
describe('TS-4: PLAN-TO-EXEC reaches PRD/stories checks via UUID id', () => {
  it('dispatches to checkPlanToExecPrereqs after id-keyed load', async () => {
    const uuidId = 'fc41919c-3610-4a26-a143-caf06c9d0a80';
    const sdRow = { ...COMPLETE_SD, id: uuidId, sd_key: 'SD-LEO-INFRA-HANDOFF-MERGE-MAIN-001' };
    const supabase = makeSupabase({
      resolveRow: { data: { id: uuidId, sd_key: 'SD-LEO-INFRA-HANDOFF-MERGE-MAIN-001' }, error: null },
      fullRow: { data: sdRow, error: null },
      prdRow: { data: null, error: null }
    });
    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-EXEC', uuidId);
    expect(result.issues.find(i => i.code === 'SD_NOT_FOUND')).toBeUndefined();
    // PLAN-TO-EXEC dispatch must reach the PRD check
    expect(result.issues.some(i => i.code === 'PRD_MISSING')).toBe(true);
  });
});

// =============================================================================
// TS-5: autoFix UPDATE writeback after id-keyed load uses canonical sd_key
// =============================================================================
describe('TS-5: autoFix UPDATE keys on canonical sd_key, not the input identifier', () => {
  it('writeback after UUID-id load targets the canonical sd_key', async () => {
    const uuidId = 'db86fb73-b572-4a19-98d7-a1193c1299ed';
    const canonicalKey = 'SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001';
    // Incomplete SD: missing risks → autoFix triggers
    const incomplete = {
      id: uuidId,
      sd_key: canonicalKey,
      sd_type: 'infrastructure',
      description: 'short',
      risks: [],
      key_principles: [],
      implementation_guidelines: [],
      dependencies: []
    };
    const captured = [];
    const supabase = makeSupabase({
      resolveRow: { data: { id: uuidId, sd_key: canonicalKey }, error: null },
      fullRow: { data: incomplete, error: null },
      captureUpdate: (e) => captured.push(e)
    });
    await runPrerequisitePreflight(supabase, 'LEAD-TO-PLAN', uuidId);
    expect(captured.length).toBeGreaterThan(0);
    // Every UPDATE must key on the canonical sd_key — not the UUID-id input
    for (const c of captured) {
      expect(c.eq.col).toBe('sd_key');
      expect(c.eq.val).toBe(canonicalKey);
      expect(c.eq.val).not.toBe(uuidId);
    }
  });
});
