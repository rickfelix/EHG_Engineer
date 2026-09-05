/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C (FR-C2). No test in the repo previously drove
 * createRcaRequiredAfterRetriesGate directly (tests/unit/rca-gate-validation.test.js and
 * tests/integration/rca-gate-enforcement.test.js target a DIFFERENT gate, checkRCAGate from
 * root-cause-agent.js -- zero references to this module). Before this SD, the gate passed on
 * bare sub_agent_execution_results row-existence regardless of verdict/content; a hollow or
 * failed RCA row satisfied it identically to a genuine analysis. This suite proves the new
 * content predicate (linked root_cause_reports.root_cause must be non-empty) actually
 * discriminates the two cases, and guards both RCA gates' advisory-by-default enforcement mode
 * (PLAN-phase RISK review, evidence 0cae276e) so a later flip to blocking is deliberate.
 */
import { describe, it, expect } from 'vitest';
import { createRcaRequiredAfterRetriesGate, readEnforcementMode } from '../../../scripts/modules/handoff/gates/rca-required-after-retries-gate.js';

const SD_ID = 'sd-test-c-uuid';
const HANDOFF_TYPE = 'EXEC-TO-PLAN';

function makeSupabase({ appConfigValue = null, rejections = [], rcaRows = [], rcrRows = [] } = {}) {
  return {
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
          limit: async () => ({ data: rcaRows, error: null }),
        };
      }
      if (table === 'root_cause_reports') {
        return {
          select() { return this; },
          in() { return { limit: async () => ({ data: rcrRows, error: null }) }; },
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

describe('SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C FR-C2: RCA_REQUIRED_AFTER_2_RETRIES content predicate', () => {
  it('BLOCKS (in blocking mode) when the linked root_cause_reports row has an empty root_cause', async () => {
    const supabase = makeSupabase({
      appConfigValue: 'blocking',
      rejections: threeRejections(),
      rcaRows: [{ id: 'row-1', created_at: '2026-01-03T00:00:00Z', metadata: { rcr_id: 'rcr-open' } }],
      rcrRows: [{ id: 'rcr-open', root_cause: null }],
    });
    const gate = createRcaRequiredAfterRetriesGate(supabase);
    const result = await gate.validator({ sd_id: SD_ID, handoffType: HANDOFF_TYPE });
    expect(result.passed).toBe(false);
    expect(result.details.content_verified_evidence).toEqual([]);
  });

  it('PASSES (in blocking mode) when the linked root_cause_reports row has a populated root_cause', async () => {
    const supabase = makeSupabase({
      appConfigValue: 'blocking',
      rejections: threeRejections(),
      rcaRows: [{ id: 'row-1', created_at: '2026-01-03T00:00:00Z', metadata: { rcr_id: 'rcr-analyzed' } }],
      rcrRows: [{ id: 'rcr-analyzed', root_cause: 'The root cause was X' }],
    });
    const gate = createRcaRequiredAfterRetriesGate(supabase);
    const result = await gate.validator({ sd_id: SD_ID, handoffType: HANDOFF_TYPE });
    expect(result.passed).toBe(true);
    expect(result.details.content_verified_evidence).toEqual(['row-1']);
  });

  it('PASSES with status=IN_REVIEW and a populated root_cause -- the predicate is content-based, not status-based (rca.js never writes status=RESOLVED)', async () => {
    const supabase = makeSupabase({
      appConfigValue: 'blocking',
      rejections: threeRejections(),
      rcaRows: [{ id: 'row-1', created_at: '2026-01-03T00:00:00Z', metadata: { rcr_id: 'rcr-in-review' } }],
      rcrRows: [{ id: 'rcr-in-review', root_cause: 'A genuine low-confidence analysis', status: 'IN_REVIEW' }],
    });
    const gate = createRcaRequiredAfterRetriesGate(supabase);
    const result = await gate.validator({ sd_id: SD_ID, handoffType: HANDOFF_TYPE });
    expect(result.passed).toBe(true);
  });

  it('does not throw and fails OPEN (passed:true) when the root_cause_reports content lookup errors', async () => {
    const supabase = {
      from(table) {
        if (table === 'app_config') return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { value: 'blocking' }, error: null }) };
        if (table === 'sd_phase_handoffs') return { select() { return this; }, eq() { return this; }, order() { return this; }, limit: async () => ({ data: threeRejections(), error: null }) };
        if (table === 'sub_agent_execution_results') return { select() { return this; }, eq() { return this; }, gt() { return this; }, limit: async () => ({ data: [{ id: 'row-1', created_at: '2026-01-03T00:00:00Z', metadata: { rcr_id: 'rcr-x' } }], error: null }) };
        if (table === 'root_cause_reports') return { select() { return this; }, in() { return { limit: async () => ({ data: null, error: { message: 'db boom' } }) }; } };
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
      rcaRows: [{ id: 'row-1', created_at: '2026-01-03T00:00:00Z', metadata: { rcr_id: 'rcr-open' } }],
      rcrRows: [{ id: 'rcr-open', root_cause: null }],
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
