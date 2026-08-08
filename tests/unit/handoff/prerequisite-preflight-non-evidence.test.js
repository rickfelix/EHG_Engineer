/**
 * Preflight must NAME the agent whose run did not complete.
 * SD-LEO-INFRA-EXPLORE-UNREGISTERED-LEO-001, FR-6 / TS-9.
 *
 * WHY THIS FILE EXISTS, and it is not a nice-to-have. Closing the tombstone laundering made the gate
 * fail with missing=[] AND failing=[], because non-evidence is a THIRD array. prerequisite-preflight
 * never read it, so its fallback would have emitted:
 *
 *     "Missing sub-agent evidence for: required agent(s)"
 *
 * No agent named, and the wrong remedy — it tells a worker to re-invoke an agent that ALREADY RAN.
 * That is verbatim the defect prerequisite-preflight.js:176-182 documents itself as fixing. The
 * advisory pass had kept that branch unreachable; closing the laundering opened it. Fixing one
 * silent misdirection by introducing another would not have been a fix.
 *
 * HOW THIS TEST WAS FOUND. A mutation run reverting the preflight change produced ZERO red — the
 * only mutation of five that did. The gap was in the suite, not the code, and this file closes it.
 */

import { describe, it, expect } from 'vitest';
import { runPrerequisitePreflight } from '../../../scripts/modules/handoff/pre-checks/prerequisite-preflight.js';

function makeMockSupabase({ sdRow, evidenceRows = [] }) {
  return {
    from: (table) => {
      if (table === 'sub_agent_execution_results') {
        return { select: () => ({ eq: () => ({ gte: async () => ({ data: evidenceRows, error: null }) }) }) };
      }
      const builder = {
        select: () => builder,
        eq: () => builder,
        or: () => builder,
        gte: () => builder,
        not: () => builder,
        order: () => builder,
        limit: async () => ({ data: [], error: null }),
        single: async () => (table === 'strategic_directives_v2' ? { data: sdRow, error: null } : { data: null, error: null })
      };
      return builder;
    }
  };
}

const BASE_SD = { id: 'SD-TEST-NONEVIDENCE-001', sd_key: 'SD-TEST-NONEVIDENCE-001', sd_type: 'infrastructure' };

// PLAN-TO-LEAD requires RETRO. A row EXISTS but its verdict is ERROR: the run crashed or never
// finished, which is the state the broken EXPLORE CLI used to manufacture.
const RETRO_TOMBSTONE = [{ sub_agent_code: 'RETRO', verdict: 'ERROR', created_at: '2099-01-01T00:00:00Z' }];

describe('preflight diagnoses non-evidence by name (SD-LEO-INFRA-EXPLORE-UNREGISTERED-LEO-001)', () => {
  it('NAMES the tombstoned agent instead of emitting the bare "required agent(s)"', async () => {
    const supabase = makeMockSupabase({ sdRow: BASE_SD, evidenceRows: RETRO_TOMBSTONE });
    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-LEAD', 'SD-TEST-NONEVIDENCE-001');

    const notRun = result.issues.find((i) => i.code === 'SUBAGENT_EVIDENCE_NOT_RUN');
    expect(notRun, 'preflight did not surface the non-evidence class at all').toBeTruthy();
    expect(notRun.message).toContain('RETRO');
    expect(notRun.message).toMatch(/ERROR/);
  });

  it('does NOT also emit the unnamed SUBAGENT_EVIDENCE_MISSING fallback', async () => {
    // The regression this guards: with missing=[] and failing=[], the old condition fired the
    // fallback anyway, so a worker saw a second, non-existent problem naming no agent.
    const supabase = makeMockSupabase({ sdRow: BASE_SD, evidenceRows: RETRO_TOMBSTONE });
    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-LEAD', 'SD-TEST-NONEVIDENCE-001');

    const bare = result.issues.find(
      (i) => i.code === 'SUBAGENT_EVIDENCE_MISSING' && /required agent\(s\)/.test(i.message)
    );
    expect(bare, 'the unnamed fallback fired alongside a named diagnosis — the wrong remedy, twice').toBeFalsy();
  });

  it('the remediation points at the sanctioned routes for a read-only built-in', async () => {
    // A diagnosis that names the agent but not the fix still strands the worker who hit this via
    // Explore, which has no CLI producer BY DESIGN.
    const supabase = makeMockSupabase({ sdRow: BASE_SD, evidenceRows: RETRO_TOMBSTONE });
    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-LEAD', 'SD-TEST-NONEVIDENCE-001');
    const notRun = result.issues.find((i) => i.code === 'SUBAGENT_EVIDENCE_NOT_RUN');
    expect(notRun.remediation).toMatch(/record-explore-evidence\.js|Task tool/);
  });

  it('CONTROL: a genuinely MISSING row still reports SUBAGENT_EVIDENCE_MISSING and names the agent', async () => {
    // Two-sided. Without this, suppressing the fallback could have suppressed it everywhere, and
    // the absence case — which was always correct — would have lost its diagnosis.
    const supabase = makeMockSupabase({ sdRow: BASE_SD, evidenceRows: [] });
    const result = await runPrerequisitePreflight(supabase, 'PLAN-TO-LEAD', 'SD-TEST-NONEVIDENCE-001');
    const missing = result.issues.find((i) => i.code === 'SUBAGENT_EVIDENCE_MISSING');
    expect(missing, 'the missing-row diagnosis was lost').toBeTruthy();
    expect(missing.message).toContain('RETRO');
    expect(result.issues.find((i) => i.code === 'SUBAGENT_EVIDENCE_NOT_RUN'), 'a missing row is not a crashed run').toBeFalsy();
  });
});
