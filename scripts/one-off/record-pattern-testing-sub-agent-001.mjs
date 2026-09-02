// SD-FDBK-INFRA-TESTING-SUB-AGENT-001 -- retro action item: document the
// isE2EApplicabilityExempt / buildTestExecution pattern in issue_patterns as a reusable
// template for the "two private lists disagree" class of defect.
import { createSupabaseServiceClient } from '../../lib/supabase-client.cjs';

const sb = createSupabaseServiceClient();

const { data: sdRow, error: sdErr } = await sb
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', 'SD-FDBK-INFRA-TESTING-SUB-AGENT-001')
  .maybeSingle();
if (sdErr || !sdRow) { console.error('SD_LOOKUP_FAILED', sdErr); process.exit(1); }

const { error } = await sb.from('issue_patterns').insert({
  pattern_id: 'PAT-SINGLE-REP-TESTING-SUBAGENT-001',
  category: 'code_quality',
  severity: 'medium',
  issue_summary: 'Two independent private allowlists/exemption-lists for the same policy question drift apart and one of them silently fabricates a PASS verdict before any measurement runs.',
  occurrence_count: 2,
  first_seen_sd_id: sdRow.id,
  last_seen_sd_id: sdRow.id,
  proven_solutions: [
    {
      description: 'Collapse both lists into one exported predicate function derived from the single canonical policy source, then have both call sites import it. Never let a second file re-encode the same yes/no decision as its own literal list.',
      example_files: [
        'scripts/modules/handoff/validation/sd-type-applicability-policy.js (isE2EApplicabilityExempt)',
        'lib/sub-agents/testing/index.js (consumer 1, deleted skipE2ESdTypes)',
        'lib/sub-agents/testing/phases/phase4-evidence.js (consumer 2, deleted E2E_EXEMPT_SD_TYPES)',
      ],
      sd_ref: sdRow.id,
    },
    {
      description: 'When a verdict is genuinely not measured (nothing executed), never let it read as an unqualified PASS. Attach an explicit measured:false + a single structured test_execution shape so downstream gates can distinguish "passed" from "not run".',
      example_files: [
        'lib/sub-agents/testing/test-execution-record.js (buildTestExecution / isMeasuredExecution)',
      ],
      sd_ref: sdRow.id,
    },
  ],
  prevention_checklist: [
    'Before adding a hardcoded type/category list for a policy decision, grep the codebase for an existing list answering the same question.',
    'If two lists must exist temporarily, add a unit test asserting they produce identical membership for the shared type space, not just that each list individually "looks right".',
    'A verdict of PASS must never be reachable through a code path that skipped execution — require an explicit measured flag on the result shape.',
  ],
  related_sub_agents: ['TESTING'],
  trend: 'new',
  status: 'resolved',
  source: 'manual',
  metadata: {
    recorded_by: 'Golf-4 (worker)',
    recorded_at: new Date().toISOString(),
    retro_id: '09fc7103-4eec-459c-b23d-a66d806984bd',
    same_defect_class_as: 'QF-20260901-479 (adam-advisory.cjs/solomon-advisory.cjs dedup-refusal divergence)',
  },
});
if (error) { console.error('WRITE_ERROR', error); process.exit(1); }
console.log('PATTERN_RECORDED=true');
