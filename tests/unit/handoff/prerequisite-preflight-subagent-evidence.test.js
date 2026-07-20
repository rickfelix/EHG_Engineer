/**
 * QF-20260720-851 (P2): surface missing sub-agent evidence at PREFLIGHT time
 * (before the expensive full gate run), reusing the SAME validator the real
 * GATE_SUBAGENT_EVIDENCE gate enforces.
 *
 * Solomon Mode-B sweep 90c52ff1: SUBAGENT_EVIDENCE_MISSING was 24/87 rejections
 * over 9 SDs in a 48h window, mean 12-min retry latency, 23/24 resolved on
 * retry — an ordering speed-bump, not a real quality catch. This converts that
 * into a ~10-second checklist read at preflight instead of a full gate-pipeline
 * round trip.
 */
import { describe, it, expect } from 'vitest';
import { runPrerequisitePreflight } from '../../../scripts/modules/handoff/pre-checks/prerequisite-preflight.js';

function makeMockSupabase({ sdRow, evidenceRows = [] }) {
  return {
    from: (table) => {
      if (table === 'sub_agent_execution_results') {
        return {
          select: () => ({ eq: () => ({ gte: async () => ({ data: evidenceRows, error: null }) }) })
        };
      }
      const builder = {
        select: () => builder,
        eq: () => builder,
        or: () => builder,
        gte: () => builder,
        not: () => builder,
        order: () => builder,
        limit: async () => ({ data: [], error: null }),
        single: async () => {
          if (table === 'strategic_directives_v2') return { data: sdRow, error: null };
          return { data: null, error: null };
        }
      };
      return builder;
    }
  };
}

const BASE_SD = {
  id: 'SD-TEST-EVIDENCE-001',
  sd_key: 'SD-TEST-EVIDENCE-001',
  sd_type: 'infrastructure',
};

describe('QF-20260720-851 (P2): subagent-evidence preflight', () => {
  it('surfaces SUBAGENT_EVIDENCE_MISSING when the required agent has no fresh row (PLAN-TO-LEAD needs RETRO)', async () => {
    const supabase = makeMockSupabase({ sdRow: BASE_SD, evidenceRows: [] });
    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-LEAD', 'SD-TEST-EVIDENCE-001');
    const issue = result.issues.find((i) => i.code === 'SUBAGENT_EVIDENCE_MISSING');
    expect(issue).toBeTruthy();
    expect(issue.message).toContain('RETRO');
    expect(result.passed).toBe(false);
  });

  it('does NOT surface SUBAGENT_EVIDENCE_MISSING when fresh evidence exists', async () => {
    const supabase = makeMockSupabase({
      sdRow: BASE_SD,
      evidenceRows: [{ sub_agent_code: 'RETRO', created_at: new Date().toISOString(), verdict: 'PASS' }],
    });
    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-LEAD', 'SD-TEST-EVIDENCE-001');
    expect(result.issues.find((i) => i.code === 'SUBAGENT_EVIDENCE_MISSING')).toBeUndefined();
  });

  it('never blocks LEAD-FINAL-APPROVAL (empty required set for that handoff type)', async () => {
    const supabase = makeMockSupabase({ sdRow: BASE_SD, evidenceRows: [] });
    const result = await runPrerequisitePreflight(supabase, 'LEAD-FINAL-APPROVAL', 'SD-TEST-EVIDENCE-001');
    expect(result.issues.find((i) => i.code === 'SUBAGENT_EVIDENCE_MISSING')).toBeUndefined();
  });

  it('fails open (never throws) if the evidence gate import/query itself errors', async () => {
    const brokenSupabase = {
      from: (table) => {
        if (table === 'sub_agent_execution_results') {
          return { select: () => ({ eq: () => ({ gte: () => { throw new Error('boom'); } }) }) };
        }
        return makeMockSupabase({ sdRow: BASE_SD }).from(table);
      }
    };
    const result = await runPrerequisitePreflight(brokenSupabase, 'PLAN-TO-LEAD', 'SD-TEST-EVIDENCE-001');
    // A gate-internal DB_ERROR is itself a FAIL verdict (not a throw) — the preflight
    // surfaces it as a blocking issue rather than silently passing, but must never throw.
    expect(result).toBeTruthy();
    expect(Array.isArray(result.issues)).toBe(true);
  });
});
