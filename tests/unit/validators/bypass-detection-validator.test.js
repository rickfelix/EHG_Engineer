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
import { validateSDTimeline } from '../../../scripts/modules/bypass-detection-validator.js';

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
