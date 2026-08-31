/**
 * Regression tests for bypass-detection-validator::validateSDTimeline
 *
 * QF-20260423-000: Covers the multi-chain false-positive fix.
 *
 * Scenario motivation: infrastructure SDs re-handoff after PR merge per
 * "Shipping != Completing an SD". A single SD can therefore have 2+ complete
 * accepted chains of the same handoff types. The previous map-by-type logic
 * paired Chain 1 artifacts with Chain 2 prerequisites and false-flagged them.
 * The chain-aware pairing should recognize that an earlier artifact has its
 * own earlier prerequisite.
 */

import { describe, it, expect } from 'vitest';
import { validateSDTimeline, logValidationAuditEvents } from '../../../scripts/modules/bypass-detection-validator.js';

// Post-grandfather-date timestamps (BYPASS_DETECTION_DEPLOYMENT_DATE = 2026-02-01)
const T = (iso) => new Date(iso).toISOString();

function makeSupabaseMock(handoffs, retros = []) {
  return {
    from(table) {
      const rowsForTable = table === 'sd_phase_handoffs' ? handoffs : retros;
      let rows = rowsForTable;
      const chain = {
        select() { return chain; },
        eq(_col, _val) { return chain; },
        order() { return Promise.resolve({ data: rows, error: null }); }
      };
      return chain;
    }
  };
}

function makeHandoff({ id, type, createdAt, acceptedAt }) {
  return {
    id,
    sd_id: 'test-sd',
    handoff_type: type,
    status: 'accepted',
    created_at: T(createdAt),
    accepted_at: acceptedAt ? T(acceptedAt) : null
  };
}

describe('bypass-detection-validator: chain-aware pairing (QF-20260423-000)', () => {
  it('returns zero findings for a single well-ordered chain', async () => {
    const handoffs = [
      makeHandoff({ id: 'h1', type: 'LEAD-TO-PLAN', createdAt: '2026-04-24T00:50:00Z', acceptedAt: '2026-04-24T00:51:00Z' }),
      makeHandoff({ id: 'h2', type: 'PLAN-TO-EXEC', createdAt: '2026-04-24T00:57:00Z', acceptedAt: '2026-04-24T00:58:00Z' }),
      makeHandoff({ id: 'h3', type: 'EXEC-TO-PLAN', createdAt: '2026-04-24T01:06:00Z', acceptedAt: '2026-04-24T01:07:00Z' }),
      makeHandoff({ id: 'h4', type: 'PLAN-TO-LEAD', createdAt: '2026-04-24T01:08:00Z', acceptedAt: '2026-04-24T01:09:00Z' })
    ];
    const findings = await validateSDTimeline('test-sd', makeSupabaseMock(handoffs));
    expect(findings).toEqual([]);
  });

  it('returns zero findings for two complete chains (multi-chain regression)', async () => {
    // Chain 1: original work
    // Chain 2: post-merge re-handoff (common for infrastructure SDs)
    const handoffs = [
      // Chain 1
      makeHandoff({ id: 'c1-lead-plan',   type: 'LEAD-TO-PLAN', createdAt: '2026-04-24T00:50:00Z', acceptedAt: '2026-04-24T00:51:00Z' }),
      makeHandoff({ id: 'c1-plan-exec',   type: 'PLAN-TO-EXEC', createdAt: '2026-04-24T00:57:00Z', acceptedAt: '2026-04-24T00:58:00Z' }),
      makeHandoff({ id: 'c1-exec-plan',   type: 'EXEC-TO-PLAN', createdAt: '2026-04-24T01:06:00Z', acceptedAt: '2026-04-24T01:07:00Z' }),
      makeHandoff({ id: 'c1-plan-lead',   type: 'PLAN-TO-LEAD', createdAt: '2026-04-24T01:08:00Z', acceptedAt: '2026-04-24T01:09:00Z' }),
      // Chain 2 (starts 18 minutes after chain 1 finishes)
      makeHandoff({ id: 'c2-lead-plan',   type: 'LEAD-TO-PLAN', createdAt: '2026-04-24T01:26:00Z', acceptedAt: '2026-04-24T01:26:30Z' }),
      makeHandoff({ id: 'c2-plan-exec',   type: 'PLAN-TO-EXEC', createdAt: '2026-04-24T01:26:40Z', acceptedAt: '2026-04-24T01:26:45Z' }),
      makeHandoff({ id: 'c2-exec-plan',   type: 'EXEC-TO-PLAN', createdAt: '2026-04-24T01:27:50Z', acceptedAt: '2026-04-24T01:27:52Z' }),
      makeHandoff({ id: 'c2-plan-lead',   type: 'PLAN-TO-LEAD', createdAt: '2026-04-24T01:28:10Z', acceptedAt: '2026-04-24T01:28:15Z' })
    ];
    const findings = await validateSDTimeline('test-sd', makeSupabaseMock(handoffs));
    expect(findings).toEqual([]);
  });

  it('flags a real bypass: PLAN-TO-LEAD created before any EXEC-TO-PLAN is accepted', async () => {
    // Only PLAN-TO-LEAD exists, no prerequisite EXEC-TO-PLAN at all — genuine bypass.
    const handoffs = [
      makeHandoff({ id: 'h1', type: 'EXEC-TO-PLAN', createdAt: '2026-04-24T02:00:00Z', acceptedAt: '2026-04-24T02:00:30Z' }),
      makeHandoff({ id: 'h2', type: 'PLAN-TO-LEAD', createdAt: '2026-04-24T01:58:00Z', acceptedAt: '2026-04-24T01:58:30Z' })
    ];
    const findings = await validateSDTimeline('test-sd', makeSupabaseMock(handoffs));
    expect(findings).toHaveLength(1);
    expect(findings[0].artifact_type).toBe('handoff_plan_to_lead');
    expect(findings[0].artifact_id).toBe('h2');
    expect(findings[0].failure_category).toBe('bypass');
  });

  it('allows artifact within 60-second clock skew tolerance', async () => {
    // PLAN-TO-LEAD created 30 seconds before EXEC-TO-PLAN accepted_at — within skew.
    const handoffs = [
      makeHandoff({ id: 'e1', type: 'EXEC-TO-PLAN', createdAt: '2026-04-24T03:00:00Z', acceptedAt: '2026-04-24T03:00:00Z' }),
      makeHandoff({ id: 'p1', type: 'PLAN-TO-LEAD', createdAt: '2026-04-24T02:59:30Z', acceptedAt: '2026-04-24T03:00:30Z' })
    ];
    const findings = await validateSDTimeline('test-sd', makeSupabaseMock(handoffs));
    expect(findings).toEqual([]);
  });

  it('skips grandfathered artifacts (pre-2026-02-01 deployment)', async () => {
    // Artifact is before the bypass-detection deployment date → should be skipped.
    const handoffs = [
      makeHandoff({ id: 'e1', type: 'EXEC-TO-PLAN', createdAt: '2026-01-20T00:00:00Z', acceptedAt: '2026-01-20T00:05:00Z' }),
      makeHandoff({ id: 'p1', type: 'PLAN-TO-LEAD', createdAt: '2026-01-15T00:00:00Z', acceptedAt: '2026-01-15T00:01:00Z' })
    ];
    const findings = await validateSDTimeline('test-sd', makeSupabaseMock(handoffs));
    expect(findings).toEqual([]);
  });

  it('returns empty findings when no handoffs exist', async () => {
    const findings = await validateSDTimeline('test-sd', makeSupabaseMock([]));
    expect(findings).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SD-FDBK-FIX-HARNESS-REVIEW-BYPASS-001: logValidationAuditEvents() dedup on
// (validator_name, artifact_id) -- 238/238 rows measured as one repeated finding
// before this fix, because nothing prevented a re-insert on every qualifying push.
// ────────────────────────────────────────────────────────────────────────────
function makeAuditLogMock({ existingArtifactIds = [] } = {}) {
  const insertCalls = [];
  const selectCalls = [];
  return {
    insertCalls,
    selectCalls,
    from(table) {
      if (table !== 'validation_audit_log') throw new Error(`unexpected table: ${table}`);
      const state = { validatorName: null, artifactId: null };
      const chain = {
        select() { return chain; },
        eq(col, val) {
          if (col === 'validator_name') state.validatorName = val;
          if (col === 'artifact_id') state.artifactId = val;
          return chain;
        },
        limit() { return chain; },
        maybeSingle() {
          selectCalls.push({ validator_name: state.validatorName, artifact_id: state.artifactId });
          const exists = existingArtifactIds.includes(state.artifactId);
          return Promise.resolve({ data: exists ? { id: 'existing-row' } : null, error: null });
        },
        insert(payload) {
          insertCalls.push(payload);
          return Promise.resolve({ data: null, error: null });
        }
      };
      return chain;
    }
  };
}

function makeFinding(overrides = {}) {
  return {
    sd_id: 'test-sd',
    sd_type: 'infrastructure',
    artifact_type: 'handoff_plan_to_lead',
    artifact_id: 'artifact-1',
    prerequisite_type: 'EXEC-TO-PLAN',
    failure_category: 'bypass',
    time_delta_seconds: -120,
    ...overrides
  };
}

describe('logValidationAuditEvents dedup (SD-FDBK-FIX-HARNESS-REVIEW-BYPASS-001)', () => {
  it('does not re-insert a finding whose artifact_id already has a bypass_detection row', async () => {
    const supabase = makeAuditLogMock({ existingArtifactIds: ['artifact-1'] });
    await logValidationAuditEvents([makeFinding()], supabase);

    expect(supabase.insertCalls).toHaveLength(0);
    expect(supabase.selectCalls).toEqual([{ validator_name: 'bypass_detection', artifact_id: 'artifact-1' }]);
  });

  it('inserts a finding for a genuinely new artifact_id', async () => {
    const supabase = makeAuditLogMock({ existingArtifactIds: ['some-other-artifact'] });
    await logValidationAuditEvents([makeFinding({ artifact_id: 'artifact-2' })], supabase);

    expect(supabase.insertCalls).toHaveLength(1);
    expect(supabase.insertCalls[0].artifact_id).toBe('artifact-2');
    expect(supabase.insertCalls[0].validator_name).toBe('bypass_detection');
  });

  it('still emits the console.log structured event even when the insert is skipped as a duplicate', async () => {
    // tests/setup.unit.js already replaces global.console with a shared vi.fn() (not reset
    // between tests in this file) -- clear it here rather than vi.spyOn a second layer on top,
    // which would only capture calls made after the spy, on a mock whose call history from
    // OTHER tests in this file is otherwise still accumulating.
    console.log.mockClear();
    const supabase = makeAuditLogMock({ existingArtifactIds: ['artifact-1'] });
    await logValidationAuditEvents([makeFinding()], supabase);

    const structuredCalls = console.log.mock.calls
      .map(([arg]) => { try { return JSON.parse(arg); } catch { return null; } })
      .filter((parsed) => parsed?.event === 'validation_failure');
    expect(structuredCalls).toHaveLength(1);
    expect(structuredCalls[0].artifact_id).toBe('artifact-1');
  });

  it('scopes the dedup check to validator_name=bypass_detection, not artifact_id alone', async () => {
    // Simulates the measured shape: most validation_audit_log rows belong to OTHER
    // validators and never match on validator_name, so they must not suppress a real
    // bypass_detection insert even if an artifact_id happened to coincide.
    const supabase = makeAuditLogMock({ existingArtifactIds: [] });
    await logValidationAuditEvents([makeFinding({ artifact_id: 'artifact-3' })], supabase);

    expect(supabase.selectCalls[0].validator_name).toBe('bypass_detection');
    expect(supabase.insertCalls).toHaveLength(1);
  });

  it('handles multiple findings independently -- some deduped, some new', async () => {
    const supabase = makeAuditLogMock({ existingArtifactIds: ['artifact-1'] });
    await logValidationAuditEvents(
      [makeFinding({ artifact_id: 'artifact-1' }), makeFinding({ artifact_id: 'artifact-4' })],
      supabase
    );

    expect(supabase.insertCalls).toHaveLength(1);
    expect(supabase.insertCalls[0].artifact_id).toBe('artifact-4');
  });
});
