/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C (FR-C2). No test in the repo previously drove
 * createRcaRequiredAfterRetriesGate directly (tests/unit/rca-gate-validation.test.js and
 * tests/integration/rca-gate-enforcement.test.js target a DIFFERENT gate, checkRCAGate from
 * root-cause-agent.js -- zero references to this module). Before this SD, the gate passed on
 * bare sub_agent_execution_results row-existence regardless of verdict/content; a hollow or
 * failed RCA row satisfied it identically to a genuine analysis. This suite proves the content
 * predicate (linked root_cause_reports.root_cause non-empty AND confidence >= 60) actually
 * discriminates the two cases, guards both RCA gates' advisory-by-default enforcement mode
 * (PLAN-phase RISK review, evidence 0cae276e), and closes two SECURITY findings from the
 * EXEC-phase re-verify (evidence c49ce1e0): SEC-1 (a malformed rcr_id used to hit a Postgres
 * error and fail-open cheaper than a well-formed-but-wrong id) and SEC-2 (no sd_id scope on the
 * RCR lookup made any unrelated SD's genuine analysis a universal gate-passing token).
 */
import { describe, it, expect } from 'vitest';
import { createRcaRequiredAfterRetriesGate, readEnforcementMode } from '../../../scripts/modules/handoff/gates/rca-required-after-retries-gate.js';

const SD_ID = '00000000-0000-0000-0000-0000000000c2';
const OTHER_SD_ID = '00000000-0000-0000-0000-0000000000c3';
const HANDOFF_TYPE = 'EXEC-TO-PLAN';

function makeSupabase({ appConfigValue = null, rejections = [], rcaRows = [], rcrRowsBySdId = {} } = {}) {
  const rcrEqCalls = [];
  return {
    rcrEqCalls,
    from(table) {
      if (table === 'app_config') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: appConfigValue ? { value: appConfigValue } : null, error: null }),
        };
      }
      if (table === 'sd_phase_handoffs') {
        return {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit: async () => ({ data: rejections, error: null }),
        };
      }
      if (table === 'sub_agent_execution_results') {
        return {
          select() { return this; },
          eq() { return this; },
          gt() { return this; },
          order() { return this; },
          limit: async () => ({ data: rcaRows, error: null }),
        };
      }
      if (table === 'root_cause_reports') {
        // Faithfully honors .eq('sd_id', X) scoping -- only rows registered under that sd_id
        // in rcrRowsBySdId are ever returned, matching real Postgres row-level filtering.
        let scopedSdId = null;
        return {
          select() { return this; },
          eq(col, val) {
            if (col === 'sd_id') { scopedSdId = val; rcrEqCalls.push(['sd_id', val]); }
            return this;
          },
          in() {
            return { limit: async () => ({ data: rcrRowsBySdId[scopedSdId] || [], error: null }) };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

function threeRejections() {
  return [
    { rejection_reason: 'first', created_at: '2026-01-01T00:00:00Z' },
    { rejection_reason: 'second', created_at: '2026-01-02T00:00:00Z' },
  ];
}

const RCR_OPEN = '11111111-1111-1111-1111-111111111111';
const RCR_ANALYZED = '22222222-2222-2222-2222-222222222222';
const RCR_IN_REVIEW = '33333333-3333-3333-3333-333333333333';
const RCR_LOW_CONFIDENCE = '44444444-4444-4444-4444-444444444444';
const RCR_OTHER_SD = '55555555-5555-5555-5555-555555555555';

describe('SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C FR-C2: RCA_REQUIRED_AFTER_2_RETRIES content predicate', () => {
  it('BLOCKS (in blocking mode) when the linked root_cause_reports row has an empty root_cause', async () => {
    const supabase = makeSupabase({
      appConfigValue: 'blocking',
      rejections: threeRejections(),
      rcaRows: [{ id: 'row-1', created_at: '2026-01-03T00:00:00Z', metadata: { rcr_id: RCR_OPEN } }],
      rcrRowsBySdId: { [SD_ID]: [{ id: RCR_OPEN, root_cause: null, confidence: 0 }] },
    });
    const gate = createRcaRequiredAfterRetriesGate(supabase);
    const result = await gate.validator({ sd_id: SD_ID, handoffType: HANDOFF_TYPE });
    expect(result.passed).toBe(false);
    expect(result.details.content_verified_evidence).toEqual([]);
  });

  it('PASSES (in blocking mode) when the linked root_cause_reports row has a populated root_cause and confidence >= 60', async () => {
    const supabase = makeSupabase({
      appConfigValue: 'blocking',
      rejections: threeRejections(),
      rcaRows: [{ id: 'row-1', created_at: '2026-01-03T00:00:00Z', metadata: { rcr_id: RCR_ANALYZED } }],
      rcrRowsBySdId: { [SD_ID]: [{ id: RCR_ANALYZED, root_cause: 'The root cause was X', confidence: 75 }] },
    });
    const gate = createRcaRequiredAfterRetriesGate(supabase);
    const result = await gate.validator({ sd_id: SD_ID, handoffType: HANDOFF_TYPE });
    expect(result.passed).toBe(true);
    expect(result.details.content_verified_evidence).toEqual(['row-1']);
  });

  it('BLOCKS a populated root_cause below the confidence floor -- non-empty text alone is not proof of genuine analysis (SECURITY evidence c49ce1e0: rca.js\'s templated root_cause is near-universal regardless of quality)', async () => {
    const supabase = makeSupabase({
      appConfigValue: 'blocking',
      rejections: threeRejections(),
      rcaRows: [{ id: 'row-1', created_at: '2026-01-03T00:00:00Z', metadata: { rcr_id: RCR_LOW_CONFIDENCE } }],
      rcrRowsBySdId: { [SD_ID]: [{ id: RCR_LOW_CONFIDENCE, root_cause: 'A generic templated root cause string', confidence: 40 }] },
    });
    const gate = createRcaRequiredAfterRetriesGate(supabase);
    const result = await gate.validator({ sd_id: SD_ID, handoffType: HANDOFF_TYPE });
    expect(result.passed).toBe(false);
  });

  it('PASSES with status=IN_REVIEW, populated root_cause, confidence >= 60 -- the predicate is content-based, not status-based (rca.js never writes status=RESOLVED)', async () => {
    const supabase = makeSupabase({
      appConfigValue: 'blocking',
      rejections: threeRejections(),
      rcaRows: [{ id: 'row-1', created_at: '2026-01-03T00:00:00Z', metadata: { rcr_id: RCR_IN_REVIEW } }],
      rcrRowsBySdId: { [SD_ID]: [{ id: RCR_IN_REVIEW, root_cause: 'A genuine analysis', status: 'IN_REVIEW', confidence: 65 }] },
    });
    const gate = createRcaRequiredAfterRetriesGate(supabase);
    const result = await gate.validator({ sd_id: SD_ID, handoffType: HANDOFF_TYPE });
    expect(result.passed).toBe(true);
  });

  it('SEC-1: a malformed (non-UUID) metadata.rcr_id does NOT satisfy the gate and does NOT trigger the query-error fail-open -- it is simply filtered out as unverifiable', async () => {
    const supabase = makeSupabase({
      appConfigValue: 'blocking',
      rejections: threeRejections(),
      rcaRows: [{ id: 'row-1', created_at: '2026-01-03T00:00:00Z', metadata: { rcr_id: 'not-a-real-uuid; DROP TABLE x' } }],
      rcrRowsBySdId: {},
    });
    const gate = createRcaRequiredAfterRetriesGate(supabase);
    const result = await gate.validator({ sd_id: SD_ID, handoffType: HANDOFF_TYPE });
    expect(result.passed, 'a malformed id must be treated as non-satisfying, never as a free pass').toBe(false);
    expect(result.issues[0]).not.toMatch(/error/i);
  });

  it('SEC-2: an rcr_id belonging to a DIFFERENT SD (even with a genuine analysis) does NOT satisfy this SD\'s gate', async () => {
    const supabase = makeSupabase({
      appConfigValue: 'blocking',
      rejections: threeRejections(),
      rcaRows: [{ id: 'row-1', created_at: '2026-01-03T00:00:00Z', metadata: { rcr_id: RCR_OTHER_SD } }],
      // RCR_OTHER_SD is only registered under OTHER_SD_ID's scope, never SD_ID's.
      rcrRowsBySdId: { [OTHER_SD_ID]: [{ id: RCR_OTHER_SD, root_cause: 'A real analysis for a different SD entirely', confidence: 90 }] },
    });
    const gate = createRcaRequiredAfterRetriesGate(supabase);
    const result = await gate.validator({ sd_id: SD_ID, handoffType: HANDOFF_TYPE });
    expect(result.passed, 'a universal cross-SD gate-passing token must not exist').toBe(false);
    expect(supabase.rcrEqCalls).toContainEqual(['sd_id', SD_ID]);
  });

  it('does not throw and fails OPEN (passed:true) when the root_cause_reports content lookup itself errors (genuine infra error, well-formed id)', async () => {
    const supabase = {
      from(table) {
        if (table === 'app_config') return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { value: 'blocking' }, error: null }) };
        if (table === 'sd_phase_handoffs') return { select() { return this; }, eq() { return this; }, order() { return this; }, limit: async () => ({ data: threeRejections(), error: null }) };
        if (table === 'sub_agent_execution_results') return { select() { return this; }, eq() { return this; }, gt() { return this; }, order() { return this; }, limit: async () => ({ data: [{ id: 'row-1', created_at: '2026-01-03T00:00:00Z', metadata: { rcr_id: RCR_ANALYZED } }], error: null }) };
        if (table === 'root_cause_reports') return { select() { return this; }, eq() { return this; }, in() { return { limit: async () => ({ data: null, error: { message: 'db boom' } }) }; } };
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const gate = createRcaRequiredAfterRetriesGate(supabase);
    const result = await gate.validator({ sd_id: SD_ID, handoffType: HANDOFF_TYPE });
    expect(result.passed).toBe(true);
    expect(result.issues[0]).toMatch(/rcr-content-read-error/);
  });

  it('is a no-op (passed:true) below attempt 3, regardless of content', async () => {
    const supabase = makeSupabase({ appConfigValue: 'blocking', rejections: [] });
    const gate = createRcaRequiredAfterRetriesGate(supabase);
    const result = await gate.validator({ sd_id: SD_ID, handoffType: HANDOFF_TYPE });
    expect(result.passed).toBe(true);
    expect(result.details.attempt_index).toBe(1);
  });

  it('PASSES on a content-free row when NOT in blocking mode (advisory is the default)', async () => {
    const supabase = makeSupabase({
      appConfigValue: null,
      rejections: threeRejections(),
      rcaRows: [{ id: 'row-1', created_at: '2026-01-03T00:00:00Z', metadata: { rcr_id: RCR_OPEN } }],
      rcrRowsBySdId: { [SD_ID]: [{ id: RCR_OPEN, root_cause: null, confidence: 0 }] },
    });
    const gate = createRcaRequiredAfterRetriesGate(supabase);
    const result = await gate.validator({ sd_id: SD_ID, handoffType: HANDOFF_TYPE });
    expect(result.passed).toBe(true);
  });
});

describe('SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C: both RCA gates remain advisory by default', () => {
  it('rca-required-after-retries-gate.js reads advisory when app_config has no row for its key (RISK evidence 0cae276e)', async () => {
    const supabase = {
      from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }),
    };
    expect(await readEnforcementMode(supabase)).toBe('advisory');
  });

  it('readEnforcementMode falls back to advisory on any unexpected value or error, never defaulting open to blocking', async () => {
    const supabaseBadValue = {
      from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { value: 'not-a-real-mode' }, error: null }) }),
    };
    expect(await readEnforcementMode(supabaseBadValue)).toBe('advisory');

    const supabaseError = {
      from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: { message: 'boom' } }) }),
    };
    expect(await readEnforcementMode(supabaseError)).toBe('advisory');
  });
});
