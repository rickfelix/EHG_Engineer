#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 — PLAN-phase PRD amendments.
 *
 * A PLAN-TO-EXEC TESTING sub-agent review found the test plan's TIER assignments were wrong
 * (TS-7/TS-8 depend on a real DB trigger and cannot be unit-tested against a mock) and its
 * COVERAGE had real gaps: no stated mechanism for the CLI hard-error tests (archplan-command.mjs
 * has no isMainModule guard), a near-vacuous self-approval guard given live created_by data
 * (79% of rows share one agent label; 18 rows are NULL), and the promotion function's own
 * modeled-on precedent (_autoApproveCloneVision) would overwrite created_by -- destroying the
 * column FR-5's own guard depends on. Amending the PRD before EXEC begins.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001';

const { data: prd, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, test_scenarios, risks, smoke_test_cmd')
  .eq('id', PRD_ID)
  .single();
if (readErr) { console.error(readErr); process.exit(1); }

// --- Amend FR-5's description: correct the self-approval guard claim, add the
// don't-overwrite-created_by/content/sections constraint. ---
const newFRs = prd.functional_requirements.map((fr) => {
  if (fr.id === 'FR-5') {
    return {
      ...fr,
      description: fr.description +
        " PLAN-TO-EXEC TESTING review measured live created_by data: 202/255 (79%) rows share the single value 'eva-archplan-command', 18/255 are NULL -- a real chairman or reviewing-session promotedBy will never equal these values, so the promotedBy!==created_by guard is a provenance PLACEHOLDER (it prevents a literal same-label replay, not a meaningful human-identity check) until FR-6's deferred approved_by column exists; do not overstate its enforcement strength in code comments or the PR description. CRITICAL CONSTRAINT: the promotion function's UPDATE payload must NOT include created_by, content, or sections. The cited model (_autoApproveCloneVision) writes created_by on every UPDATE -- copying that would overwrite the very column this guard reads, making a second promotion's guard-check compare against the PROMOTER's own label instead of the original author's, and would destroy provenance. Writing content/sections also risks re-triggering trg_auto_validate_archplan_quality's recalculation, which could silently flip quality_checked and defeat the quality-advancement trigger this guard is designed to respect (only status/chairman_approved/chairman_approved_at may be written by the promotion UPDATE).",
    };
  }
  return fr;
});

// --- Amend test_scenarios: retype TS-7/TS-8 to integration, add mechanism notes to
// TS-3/TS-4, add the new scenarios the review identified as missing. ---
const newTS = prd.test_scenarios.map((ts) => {
  if (ts.id === 'TS-7') {
    return { ...ts, type: 'integration', expected: ts.expected + ' (integration tier, tests/integration/eva/ via npm run test:integration -- trg_enforce_archplan_quality_advancement is a real Postgres trigger and cannot be proven against a mocked Supabase client)' };
  }
  if (ts.id === 'TS-8') {
    return { ...ts, type: 'integration', expected: ts.expected + ' (integration tier, tests/integration/eva/ via npm run test:integration, modeled on tests/integration/eva/clone-vision-repair-dims-preserve.test.js -- a unit test against a mock would assert the mock\'s own configured return, not the real trigger, defeating the point of this scenario)' };
  }
  if (ts.id === 'TS-3') {
    return { ...ts, scenario: ts.scenario + ' -- mechanism: archplan-command.mjs has no isMainModule() guard (importing it executes the live CLI), same as vision-command.mjs; use a subprocess test (execFile) asserting exit code + stderr + zero DB writes, OR extract the flag-resolution logic into a pure exported helper (mirroring rejectStringFlagValue\'s precedent) and unit-test that plus one wiring assertion -- pick one and be consistent with TS-4' };
  }
  if (ts.id === 'TS-4') {
    return { ...ts, scenario: ts.scenario + ' -- must assert archplan-command.mjs actually CALLS rejectStringFlagValue (wiring), not just re-test the already-covered helper (vision-upsert.test.js:349 already proves the helper itself)' };
  }
  if (ts.id === 'TS-5') {
    return { ...ts, scenario: ts.scenario + ' -- prerequisite: extend stage-17-doc-generation.test.js\'s mockSupabase to capture arch-plan upsert calls (mirroring the existing _visionUpsertCalls array; today the arch branch discards the record entirely). Must independently drive BOTH call sites: the primary write (~line 373) AND the quality-retry write (~line 395, only reached when the primary write returns quality_checked:false with non-empty quality_issues) -- a test exercising only the primary path would leave the more dangerous retry-path mutant (which re-writes the plan active) undetected' };
  }
  if (ts.id === 'TS-6') {
    return { ...ts, scenario: ts.scenario + ' -- add a second case: promotedBy against a row with created_by=NULL (18/255 live rows) -- must explicitly decide and test refuse-on-null vs allow-on-null, not leave it as an accidental pass-through' };
  }
  return ts;
});

newTS.push(
  { id: 'TS-10', scenario: 'Promotion UPDATE payload does not include created_by, content, or sections', type: 'unit', expected: 'The UPDATE call captured by a mocked client contains only status/chairman_approved/chairman_approved_at (plus the WHERE-clause key) -- proves the promotion function cannot overwrite provenance or re-trigger quality recalculation' },
  { id: 'TS-11', scenario: 'FR-2 happy paths: --draft and --approved', type: 'unit_or_subprocess', expected: '--draft writes status=draft/chairman_approved=false; --approved writes status=active/chairman_approved=true with chairman_approved_at stamped (same mechanism decision as TS-3)' },
  { id: 'TS-12', scenario: 'Both --approved and --draft passed together', type: 'unit_or_subprocess', expected: 'Rejected, mirroring vision-command.mjs:96\'s existing mutual-exclusivity check' },
  { id: 'TS-13', scenario: 'archplan-command.mjs help text no longer claims "after chairman approval" unconditionally', type: 'unit', expected: 'Help text accurately describes the required --approved|--draft choice' },
  { id: 'TS-14', scenario: 'Promotion of an already-active row', type: 'unit', expected: 'Explicitly decided and tested (no-op, error, or overwrite) -- must not silently overwrite an existing chairman_approved_at, destroying original approval provenance' },
  { id: 'TS-15', scenario: 'Promotion against a non-existent plan_key', type: 'unit', expected: 'Explicitly detected and reported as zero-rows-affected, not a silent success (Supabase .update().eq() on a non-matching key returns success with an empty result by default)' },
  { id: 'TS-16', scenario: 'Scripted no-DDL check for this SD\'s diff', type: 'unit_or_script', expected: 'git diff --name-only against database/migrations/** and supabase/** for this SD\'s branch returns empty, mechanically enforcing FR-6\'s "no schema change" acceptance criterion rather than relying on manual review' }
);

const newRisks = prd.risks.map((r) => {
  if (r.risk.includes('reviewer-not-author requirement')) {
    return {
      ...r,
      mitigation: r.mitigation + ' CORRECTED (PLAN-TO-EXEC TESTING review): live created_by data shows this guard is a provenance placeholder, not a strong identity check (202/255 rows share one agent label, 18 are NULL) -- it prevents literal same-label replay, meaningfully narrower than "a real, enforced guard." Genuine identity-based enforcement arrives only with FR-6\'s deferred approved_by column.',
    };
  }
  return r;
});

const newSmokeTestCmd = "node scripts/eva/archplan-command.mjs upsert --plan-key <test-key> --vision-key <test-vision> (expect: hard error, no flags given); then --draft (expect: draft row written)";

const { data, error } = await supabase
  .from('product_requirements_v2')
  .update({
    functional_requirements: newFRs,
    test_scenarios: newTS,
    risks: newRisks,
    smoke_test_cmd: newSmokeTestCmd,
  })
  .eq('id', PRD_ID)
  .select('id')
  .single();

if (error) { console.error('UPDATE FAILED:', error); process.exit(1); }
console.log('PRD amended:', JSON.stringify(data, null, 2));
console.log('New test_scenarios count:', newTS.length);
