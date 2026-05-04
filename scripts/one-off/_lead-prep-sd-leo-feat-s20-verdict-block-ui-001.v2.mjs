import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FEAT-S20-VERDICT-BLOCK-UI-001';

const smoke_test_steps = [
  { instruction: 'Open EHG venture in Stage 20 detail page', expected_outcome: 'Stage20VerdictPanel renders with verdict badge, findings list (with severity colors), and remediation SD links' },
  { instruction: 'Set LEO_S20_VERDICT_BLOCK_ENABLED=true, reload, attempt S20->S21 advance with FAIL+critical fixture', expected_outcome: 'Advance is blocked; refusal reason rendered citing verdict + finding severities' },
  { instruction: 'Click Manual override CTA, enter reason, submit', expected_outcome: 'Advance succeeds; audit_log row inserted with action=stage_advance_override containing actor + reason + verdict_snapshot' },
  { instruction: 'Seed code_quality_report with verdict=BLOCKED (precondition), reload', expected_outcome: 'Panel renders Return-to-S19 CTA; manual override button is hidden' }
];

const success_metrics = [
  { metric: 'Stage20VerdictPanel render coverage', target: '100% of ventures with stage_number=20 + code_quality_report row show panel', actual: 'TBD - verified via E2E in EXEC' },
  { metric: 'Advance refusal correctness when flag ON', target: '100% refusal on verdict=FAIL + (high|critical) findings', actual: 'TBD - verified via vitest fixture in EXEC' },
  { metric: 'Audit trail coverage', target: '100% of manual overrides write audit_log row matching schema', actual: 'TBD - integration test in EXEC' },
  { metric: 'Feature flag rollout safety', target: 'Default OFF; verdict + findings still surface informationally', actual: 'TBD - E2E with flag off in EXEC' },
  { metric: 'Test green rate', target: '>=95% (vitest + Playwright)', actual: 'TBD' }
];

const dependencies = [
  { type: 'sd', id: 'SD-LEO-FEAT-STAGE-CODE-QUALITY-001', status: 'shipped', why: 'Backend producing code_quality_report verdicts + venture_quality_findings; FR-1/2/4/7/8 already merged. PR EHG_Engineer/feat/SD-LEO-FEAT-STAGE-CODE-QUALITY-001-engineer.' },
  { type: 'table', id: 'code_quality_report', status: 'exists', why: 'Read by Stage20VerdictPanel for verdict + remediation_sd_ids' },
  { type: 'table', id: 'venture_quality_findings', status: 'exists', why: 'Read for severity-bucketed findings list rendered in panel' },
  { type: 'table', id: 'audit_log', status: 'exists', why: 'Receives stage_advance_override rows on manual override path' },
  { type: 'env', id: 'LEO_S20_VERDICT_BLOCK_ENABLED', status: 'new', why: 'Feature flag (default OFF); enforces refusal when ON' }
];

const implementation_guidelines = [
  { area: 'Component placement', guideline: 'Stage20VerdictPanel.tsx in src/components/ventures/, mirroring existing S19/S22 panel patterns' },
  { area: 'Data fetching', guideline: 'Reuse useVentureArtifacts hook; add stage_number=20 + artifact_type=code_quality_report selector' },
  { area: 'Refusal logic location', guideline: 'src/lib/ventures/advanceStage.ts pre-RPC guard reads latest verdict; refuses BEFORE invoking advance_venture_stage RPC to avoid backend round trip' },
  { area: 'Feature flag pattern', guideline: 'Read process.env.NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED via existing config helper; default OFF' },
  { area: 'Audit log insertion', guideline: 'Use existing createAuditLogRow helper; populate action=stage_advance_override + actor (auth.uid) + reason (required non-empty) + verdict_snapshot (full code_quality_report row at time of override)' },
  { area: 'BLOCKED vs FAIL UI', guideline: 'BLOCKED state hides override button + shows distinct copy + Return-to-S19 CTA navigates to stage 19 panel' },
  { area: 'Testing', guideline: 'Vitest unit tests for advanceStage refusal logic (mocked supabase); Playwright E2E for panel render + override flow + flag toggle behavior' },
  { area: 'Accessibility', guideline: 'Severity badges use both color AND text/icon; override CTA is keyboard accessible; modal focus-trap on override dialog' }
];

(async () => {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      smoke_test_steps,
      success_metrics,
      dependencies,
      implementation_guidelines
    })
    .eq('sd_key', SD_KEY)
    .select('sd_key, smoke_test_steps, success_metrics, dependencies, implementation_guidelines');

  if (error) { console.error('UPDATE FAILED:', error); process.exit(1); }
  console.log('UPDATED OK');
  console.log(JSON.stringify(data?.[0], null, 2));
})();
