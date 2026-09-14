#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 — LEAD-TO-PLAN precheck remediation.
 *
 * Fixes GATE_MECHANISM_CLAIM_VERIFIER (adds metadata.mechanism_verifications with real
 * file:line citations for every file+function pair named in the spine) and
 * SMOKE_TEST_SPECIFICATION (replaces the generic auto-generated placeholder with a real,
 * SD-specific 30-second demo).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001';

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error(readErr); process.exit(1); }

const mechanismVerifications = [
  {
    verified_by: 'Explore + VALIDATION sub-agents (LEAD phase)',
    verified_at: 'lib/eva/archplan-upsert.js:121-122',
    claim: "upsertArchPlan() unconditionally hardcodes status:'active', chairman_approved:true on every write, with no parameter to override it",
  },
  {
    verified_by: 'VALIDATION sub-agent (LEAD phase)',
    verified_at: 'lib/eva/bridge/trust-elevation.js:60',
    claim: 'The sole live reader of eva_architecture_plans.chairman_approved -- an AND-guard for venture trust-tier elevation, currently a rubber stamp',
  },
  {
    verified_by: 'VALIDATION sub-agent (LEAD phase)',
    verified_at: 'scripts/modules/handoff/executors/plan-to-exec/gates/planning-completeness.js:354,384',
    claim: "Filters eva_architecture_plans on status='active' -- a non-blocking, venture-scoped warning only (score -15), not an issue",
  },
  {
    verified_by: 'VALIDATION sub-agent (LEAD phase)',
    verified_at: 'scripts/cron/cascade-watcher.mjs:146',
    claim: 'References a metadata column on eva_architecture_plans that does not exist (a pre-existing, out-of-scope phantom-column defect); does not filter on status or chairman_approved',
  },
  {
    verified_by: 'VALIDATION sub-agent (LEAD phase)',
    verified_at: 'scripts/eva/archplan-command.mjs:15,320-321',
    claim: "The CLI (source of 200/235 live rows) calls upsertArchPlan with no approval-related flag; its own help text claims 'after chairman approval' with nothing enforcing it",
  },
  {
    verified_by: 'VALIDATION sub-agent (LEAD phase)',
    verified_at: 'lib/eva/vision-upsert.js:63,101-104',
    claim: "upsertVision's approved parameter (default true) and GOVERNED_VISION_KEYS chairmanRatified gate -- the pattern this SD's fix mirrors, confirmed to have no approved_by/self-approval-guard mechanism",
  },
  {
    verified_by: 'VALIDATION sub-agent (LEAD phase)',
    verified_at: 'scripts/eva/vision-command.mjs:126,140',
    claim: "The mandatory --approved|--draft CLI choice (hard-errors if omitted, via rejectStringFlagValue) -- the second leg of the vision pattern this SD's archplan-command.mjs fix must also mirror",
  },
  {
    verified_by: 'VALIDATION sub-agent (LEAD phase)',
    verified_at: 'lib/eva/stage-templates/analysis-steps/stage-17-doc-generation.js:181,284,373,395',
    claim: "The already-fixed vision call site (approved:false, QF-20260702-262) versus the two still-unfixed architecture-plan call sites (upsertArchPlan calls at 373/395, no approval param passed) -- confirms the asymmetry this SD closes",
  },
  {
    verified_by: 'VALIDATION sub-agent (LEAD phase)',
    verified_at: 'lib/eva/stage-execution-worker.js:3935,4017',
    claim: "_autoApproveCloneVision's UPDATE-based promotion path (chairman_approved:true, chairman_approved_at set) outside upsertVision -- the precedent for the separate gated updater this SD's PLAN phase should design for architecture plans",
  },
  {
    verified_by: 'VALIDATION sub-agent (LEAD phase)',
    verified_at: 'lib/eva/feedback-dimension-classifier.js:69,74',
    claim: "References a key column on what resolves to eva_architecture_plans/eva_vision_documents-adjacent lookups that does not exist -- a separate, out-of-scope phantom-column defect noted for a future ticket",
  },
];

const newMetadata = {
  ...sd.metadata,
  mechanism_verifications: mechanismVerifications,
};

const smokeTestSteps = [
  {
    step_number: 1,
    instruction: "Run scripts/eva/archplan-command.mjs's upsert subcommand for a plan-key WITHOUT --approved or --draft",
    expected_outcome: "Command hard-errors with 'Approval decision required: pass --approved ... or --draft', mirroring vision-command.mjs's existing behavior -- no row is written",
  },
  {
    step_number: 2,
    instruction: "Re-run with --draft",
    expected_outcome: "eva_architecture_plans row is written with status='draft', chairman_approved=false, chairman_approved_at=null",
  },
  {
    step_number: 3,
    instruction: "SELECT status, chairman_approved, chairman_approved_at FROM eva_architecture_plans WHERE plan_key = '<the test key>'",
    expected_outcome: "Confirms the draft row from step 2 -- no plan is ever recorded chairman-approved without an explicit approval action",
  },
];

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: newMetadata, smoke_test_steps: smokeTestSteps })
  .eq('sd_key', SD_KEY)
  .select('id, sd_key')
  .single();

if (error) { console.error('UPDATE FAILED:', error); process.exit(1); }
console.log('Precheck remediation applied:', JSON.stringify(data, null, 2));
