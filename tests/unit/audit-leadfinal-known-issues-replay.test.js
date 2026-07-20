/**
 * SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-D
 *
 * Regression guard for the Solomon checkpoint-3 PIN's literal acceptance bar: the
 * replay audit must flag all 5 named historical SDs, or it does not work. Fixtures
 * below are REAL data captured from a live run against the actual 5 historical rows
 * (sd_phase_handoffs.known_issues, retrospectives.what_needs_improvement, and the
 * relevant timestamps) -- not synthetic placeholders. The fake Supabase client routes
 * by table name + sd_id since extractRetroKnownIssues/getFilteredRetrospective fan out
 * to 3 distinct tables (strategic_directives_v2, sd_phase_handoffs, retrospectives) --
 * a single canned response would silently break 2 of 3 calls (PLAN-TO-EXEC TESTING
 * review finding).
 */
import { describe, it, expect } from 'vitest';
import { runReplayAudit, TARGET_SDS } from '../../scripts/audit-leadfinal-known-issues-replay.mjs';

// Real captured content (2026-07-20) for the 5 named historical SDs.
const FIXTURES = {
  '4aabbb45-65ba-4171-b0be-acf75a07eccf': {
    sd_key: 'SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001',
    sd_created_at: '2026-07-19T19:25:47.644669',
    lead_to_plan_accepted_at: '2026-07-19T20:37:51.149Z',
    lfa_known_issues: '[{"issue":"None at approval time"}]',
    lfa_accepted_at: '2026-07-20T14:59:23.576',
    retrospective: {
      created_at: '2026-07-20T14:44:46.911464+00:00',
      retro_type: 'SD_COMPLETION',
      retrospective_type: null,
      what_needs_improvement: [
        'Initial retrospective template was too generic, triggering quality validation failures',
        'Documentation could better explain the relationship between constraints and trigger functions',
        'Error messages from constraint violations should hint at trigger-based recalculation of quality scores',
        'Automated retrospective generation should query actual handoff data for richer content',
      ],
    },
  },
  '5f346c78-7aad-4f15-8eb7-a8072ab79c76': {
    sd_key: 'SD-LEO-INFRA-FLEET-WATCHDOG-001',
    sd_created_at: '2026-07-19T19:25:59.922215',
    lead_to_plan_accepted_at: '2026-07-20T15:19:52.840Z',
    lfa_known_issues: '[{"issue":"None at approval time"}]',
    lfa_accepted_at: '2026-07-20T15:47:40.762',
    retrospective: {
      created_at: '2026-07-20T15:35:15.89852+00:00',
      retro_type: 'SD_COMPLETION',
      retrospective_type: null,
      what_needs_improvement: [
        'Initial retrospective template was too generic, triggering quality validation failures',
        'Documentation could better explain the relationship between constraints and trigger functions',
        'Error messages from constraint violations should hint at trigger-based recalculation of quality scores',
        'Automated retrospective generation should query actual handoff data for richer content',
        'SD-LEO-INFRA-FLEET-WATCHDOG-001 proceeded without PRD - scope defined informally',
        'SD-LEO-INFRA-FLEET-WATCHDOG-001 missing handoffs: PLAN-TO-LEAD',
        'SD-LEO-INFRA-FLEET-WATCHDOG-001 had blocking issues from: EXPLORE',
        'SD-LEO-INFRA-FLEET-WATCHDOG-001 lacks unified test evidence in database',
      ],
    },
  },
  '44d87b37-9582-428a-90bb-fa0e3cd32b4c': {
    sd_key: 'SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001',
    sd_created_at: '2026-07-19T19:25:50.307872',
    lead_to_plan_accepted_at: '2026-07-20T15:40:23.518Z',
    lfa_known_issues: '[{"issue":"None at approval time"}]',
    lfa_accepted_at: '2026-07-20T17:46:52.163',
    retrospective: {
      created_at: '2026-07-20T16:38:05.245574+00:00',
      retro_type: 'SD_COMPLETION',
      retrospective_type: null,
      what_needs_improvement: [
        'FR-5\'s dedup-by-callsign was NOT wired into spawn() at the initial commit despite the commit message and an inline code comment explicitly claiming it happened',
        'FR-9\'s event payload carried an open allowlist that is unenforced and untested',
        'FR-6\'s mandated grep-pin regression test was skipped in the initial commit even though the underlying code was already correct',
        'The live OS-spawn surface has never been exercised against a real Windows Terminal process in this SD',
        'The initial commit self-reported "62 new unit tests"; the independent TESTING review measured 50 actually-new tests',
      ],
    },
  },
  '9f137714-cd39-4dff-9f9b-84ae9b111151': {
    sd_key: 'SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-A',
    sd_created_at: '2026-07-20T17:01:50.330023',
    lead_to_plan_accepted_at: '2026-07-20T17:29:00.823Z',
    lfa_known_issues: '[{"issue":"None at approval time"}]',
    lfa_accepted_at: '2026-07-20T18:50:36.853',
    retrospective: {
      created_at: '2026-07-20T18:49:44.426+00:00',
      retro_type: 'SD_COMPLETION',
      retrospective_type: null,
      what_needs_improvement: [
        'The core profile-isolation invariant (FR-1) shipped without an adversarial/malformed-input acceptance criterion',
        'FR-3 AC1 was originally checked via source inspection rather than a proper spy/mock on the actual call',
        'This child SD proceeded without its own product_requirements_v2 row',
        'SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-A proceeded without PRD - scope defined informally',
        'SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-A lacks unified test evidence in database',
      ],
    },
  },
  'adaa690d-8950-4bd3-9e35-3d8c95bcbfdc': {
    sd_key: 'SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-B',
    sd_created_at: '2026-07-20T17:02:30.991337',
    lead_to_plan_accepted_at: '2026-07-20T18:11:10.846Z',
    lfa_known_issues: '[{"issue":"None at approval time"}]',
    lfa_accepted_at: '2026-07-20T19:04:26.044',
    retrospective: {
      created_at: '2026-07-20T18:29:15.139357+00:00',
      retro_type: 'SD_COMPLETION',
      retrospective_type: null,
      what_needs_improvement: [
        'Risk managed: SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001 (dependency, PR #6360) not yet merged at PRD time',
        'Documentation could be enhanced with more visual diagrams',
        'Testing coverage could be expanded to include edge cases',
        'Performance benchmarks could be added for future comparison',
      ],
    },
  },
};

/** Table-routing fake Supabase client. Each .from(table) returns a fluent builder that
 * resolves against FIXTURES[sd_id] regardless of exact chain shape, keyed by the sd_id
 * captured from the first .eq('sd_id', ...) or .eq('id', ...) call in the chain. */
function makeFakeSupabase() {
  function builder(table) {
    let filterSdId = null;
    const eqFilters = {};
    const chain = {
      select() {
        return chain;
      },
      eq(col, val) {
        if (col === 'sd_id' || col === 'id') filterSdId = val;
        eqFilters[col] = val;
        return chain;
      },
      or() {
        return chain;
      },
      gt() {
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      async maybeSingle() {
        const fx = FIXTURES[filterSdId];
        if (!fx) return { data: null, error: null };
        if (table === 'strategic_directives_v2') {
          return { data: { id: filterSdId, sd_key: fx.sd_key, created_at: fx.sd_created_at }, error: null };
        }
        if (table === 'sd_phase_handoffs') {
          // Two distinct query shapes hit this table: resolveLeadToPlanAcceptedAt
          // filters by from_phase='LEAD'/to_phase='PLAN', replayOne's own LFA lookup
          // filters by handoff_type='LEAD-FINAL-APPROVAL'. Route on the actual filter
          // used, so each call gets its own real accepted_at value (PLAN-TO-EXEC
          // TESTING review finding: a mock must route by table/filter, not just carry
          // canned content -- collapsing both into one shape silently mixed the two
          // distinct timestamps).
          if (eqFilters.handoff_type === 'LEAD-FINAL-APPROVAL') {
            return { data: { accepted_at: fx.lfa_accepted_at, known_issues: fx.lfa_known_issues }, error: null };
          }
          return { data: { accepted_at: fx.lead_to_plan_accepted_at }, error: null };
        }
        if (table === 'retrospectives') {
          return { data: fx.retrospective, error: null };
        }
        return { data: null, error: null };
      },
      single() {
        return chain.maybeSingle();
      },
    };
    return chain;
  }
  return { from: (table) => builder(table) };
}

describe('runReplayAudit — Solomon PIN S3 replay-must-flag-5', () => {
  it('flags all 5 named historical SDs given their real captured content', async () => {
    const supabase = makeFakeSupabase();
    const report = await runReplayAudit({ supabase, targets: TARGET_SDS });
    expect(report.total).toBe(5);
    expect(report.flaggedCount).toBe(5); // regression guard: must never drop below 5
    expect(report.results.every((r) => r.flagged)).toBe(true);
    // The retro predates its LEAD-FINAL approval for all 5 (real captured timestamps) --
    // a genuine "visible at approval time" claim, not just "currently reads as genuine".
    expect(report.results.every((r) => r.approvalTimeValid === true)).toBe(true);
  });

  it('does NOT flag an SD whose actual known_issues already matches the recomputed genuine caveat', async () => {
    const supabase = {
      from: (table) => ({
        select: () => supabase.from(table),
        eq: () => supabase.from(table),
        or: () => supabase.from(table),
        gt: () => supabase.from(table),
        order: () => supabase.from(table),
        limit: () => supabase.from(table),
        maybeSingle: async () => {
          if (table === 'strategic_directives_v2') {
            return { data: { id: 'clean-sd', sd_key: 'SD-CLEAN-001', created_at: '2026-01-01T00:00:00Z' }, error: null };
          }
          if (table === 'sd_phase_handoffs') {
            return {
              data: { accepted_at: '2026-01-02T00:00:00Z', known_issues: JSON.stringify([{ issue: 'a real caveat that was correctly surfaced' }]) },
              error: null,
            };
          }
          if (table === 'retrospectives') {
            return { data: { created_at: '2026-01-01T12:00:00Z', what_needs_improvement: ['a real caveat that was correctly surfaced'] }, error: null };
          }
          return { data: null, error: null };
        },
      }),
    };
    const report = await runReplayAudit({ supabase, targets: [{ sd_key: 'SD-CLEAN-001', sd_id: 'clean-sd' }] });
    expect(report.flaggedCount).toBe(0);
  });

  it('handles known_issues returned as an already-parsed array (not just a JSON string)', async () => {
    // sd_phase_handoffs.known_issues is a TEXT column, so production always returns a
    // string -- but isFallbackKnownIssuesShape() defensively handles a pre-parsed array
    // too. Exercise that branch explicitly so it isn't purely untested defensive code.
    const supabase = {
      from: (table) => ({
        select: () => supabase.from(table),
        eq: () => supabase.from(table),
        or: () => supabase.from(table),
        gt: () => supabase.from(table),
        order: () => supabase.from(table),
        limit: () => supabase.from(table),
        maybeSingle: async () => {
          if (table === 'strategic_directives_v2') {
            return { data: { id: 'array-sd', sd_key: 'SD-ARRAY-001', created_at: '2026-01-01T00:00:00Z' }, error: null };
          }
          if (table === 'sd_phase_handoffs') {
            return {
              data: { accepted_at: '2026-01-02T00:00:00Z', known_issues: [{ issue: 'None at approval time' }] },
              error: null,
            };
          }
          if (table === 'retrospectives') {
            return { data: { created_at: '2026-01-01T12:00:00Z', what_needs_improvement: ['a genuine caveat dropped as the placeholder'] }, error: null };
          }
          return { data: null, error: null };
        },
      }),
    };
    const report = await runReplayAudit({ supabase, targets: [{ sd_key: 'SD-ARRAY-001', sd_id: 'array-sd' }] });
    expect(report.flaggedCount).toBe(1);
  });
});
