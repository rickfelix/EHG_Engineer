#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 — VALIDATION evidence at LEAD phase.
 *
 * An independent validation-agent re-verified every Explore claim from first principles
 * (reading files and querying the DB directly, not trusting the prior report) and found
 * three material corrections: the downstream-reader census was over-counted (7 -> 1+2, a
 * table-conflation error), the a588adba ratification is a crisp written mandate rather than
 * a soft remark, and Explore's recommended fix shape undershoots the SD's own stated
 * requirement (missing the CLI's mandatory-choice leg, which is where 200/235 live rows
 * actually originate). Also independently resolved the trust-elevation operational-risk
 * question (fix is safe; no venture can become stuck) and found a genuine compounding
 * defect (stage-17 writes an approved plan against an unapproved parent vision).
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 90,
    phase: 'LEAD',
    execution_time_ms: 0,
    summary: "Independently re-verified every Explore claim from first principles rather than trusting the prior report. CONFIRMED: hardcoded status/chairman_approved at archplan-upsert.js:121-122 with no override parameter; vision-upsert.js's approved-boolean pattern with no approved_by mechanism; the exact schema state (status/chairman_approved/chairman_approved_at exist on both tables, approved_by exists on neither, with a NEW finding Explore missed -- chairman_approved_at is written by NEITHER helper today: only 4/211 approved arch plans and 12/213 approved visions carry a timestamp, a real provenance gap under 6c263823); the QF-20260702-262 precedent and its asymmetric application (vision call site fixed, both arch call sites in the same file untouched); the dedup false-positive; both cited ratifications exist. CORRECTED three material errors: (1) the downstream-reader census was over-counted at 7 -- direct enumeration of every eva_architecture_plans call site found exactly ONE chairman_approved reader (trust-elevation.js) and TWO status='active' readers (artifact-persistence-service.js; planning-completeness.js, which is a non-blocking venture-scoped warning, not an issue), with the other 7 'readers' Explore cited actually filtering the SEPARATE eva_vision_documents table -- also found cascade-watcher.mjs filters on NEITHER field (its cited read-back risk doesn't exist, and its own metadata-column reference is a separate phantom-column defect). (2) a588adba is a crisp, ratified, directly-applicable written policy (verified the full row including its EFFECT clause, which explicitly cites 6c263823 in exactly the reviewer-not-author role this SD requires) -- not a soft personal-capacity remark as initially characterized. (3) Explore's recommended fix shape (additive approved param, default true) undershoots the SD's own stated requirement: 200 of 235 live rows come from the CLI (archplan-command.mjs), which has zero approval flags today -- mirroring vision properly requires ALSO adding vision-command.mjs's mandatory --approved|--draft CLI choice, not just the helper-level default. INDEPENDENTLY RESOLVED the trust-elevation operational-risk question (the one open item LEAD needed answered before PLAN could safely proceed): the fix is SAFE -- measured that every real venture's trust elevation is carried by the vision limb of the OR-guard regardless of the arch limb (only 7 arch plans are both chairman_approved and venture-linked, all throwaway fixtures or covered redundantly by an also-approved vision), only 2 elevations have ever occurred (both vision-attributed), and the check is mint-time-only and idempotent so no already-trusted venture can be affected. FOUND a genuine compounding defect Explore missed: stage-17-doc-generation.js today writes a DRAFT, unapproved vision and then immediately writes an ACTIVE, chairman-approved architecture plan claiming alignment to it -- including on ARCH-ALTIFYAI-001, the live AltifyAI test-cargo venture (ratification 4730357d), currently chairman_approved=true and never seen by a human. Also found no existing promotion (draft->active) code path exists for architecture plans at all (only 3 INSERT/upsert writes total, zero UPDATEs touching status/chairman_approved), unlike the vision side which has one (stage-execution-worker.js's _autoApproveCloneVision) -- PLAN must design the analogous updater using existing columns (no DDL) or risk a real regression (ADR-attachment and the planning-completeness gate silently degrading forever if plans are written draft-only with no promotion path).",
    critical_issues: [],
    warnings: [
      {
        id: 'VAL-1',
        severity: 'MEDIUM',
        issue: 'eva_architecture_plans has an UPDATE-only quality-advancement trigger (trg_enforce_archplan_quality_advancement, requiring quality_checked=true) but lacks the INSERT-leg equivalent that eva_vision_documents has -- an INSERT with status=active, chairman_approved=true, quality_checked=false sails through unchecked today. Measured: 38 live arch plans are chairman_approved=true with quality_checked=false. Any promotion updater PLAN designs will hit the existing UPDATE trigger and must account for it; the missing INSERT-leg trigger is a separate, independent gap this SD does not need to close but should be aware of.',
        evidence: 'Live query of eva_architecture_plans for chairman_approved=true AND quality_checked=false -- 38 rows. Trigger definitions confirmed via information_schema/pg_trigger.',
      },
      {
        id: 'VAL-2',
        severity: 'LOW',
        issue: 'cascade-watcher.mjs:146 selects a metadata column on eva_architecture_plans that does not exist (confirmed against information_schema; independently documented elsewhere in the codebase as a known phantom-column class of defect). Its MANUAL_OVERRIDE_DETECTED guard is dead by construction. Out of scope for this SD -- flagged as a separate ticket.',
        evidence: 'information_schema.columns query on eva_architecture_plans -- no metadata column present.',
      },
    ],
    recommendations: [
      'Add the mandatory --approved|--draft CLI choice to scripts/eva/archplan-command.mjs (mirroring vision-command.mjs), not just an additive helper-level parameter -- this is the leg that actually closes the gap for the dominant 200/235-row write path.',
      'Design a separate, gated promotion updater (draft->active, chairman_approved) for architecture plans mirroring stage-execution-worker.js\'s _autoApproveCloneVision pattern, using only existing columns.',
      'Stamp chairman_approved_at whenever chairman_approved flips true, on both the arch-plan and (as a cheap bonus fix) the vision path -- currently unwritten by either helper.',
      'File separate tickets for the phantom metadata/key column defects found in cascade-watcher.mjs and feedback-dimension-classifier.js -- do not absorb into this SD\'s scope.',
    ],
    detailed_analysis: {
      commands_run: [
        'Re-read lib/eva/archplan-upsert.js and lib/eva/vision-upsert.js in full independently',
        'information_schema.columns query on eva_architecture_plans and eva_vision_documents -- confirmed exact column/default/nullability state',
        'Live query: chairman_approved_at population across both tables (4/211 arch, 12/213 vision)',
        'Read lib/eva/bridge/trust-elevation.js in full -- confirmed exact guard logic',
        'Live query: arch plans that are chairman_approved AND venture-linked (7), and their venture/application linkage (throwaway fixtures or vision-covered)',
        'Live query: historical trust-tier elevation count and attribution (2 total, both vision-attributed)',
        'Read lib/eva/stage-templates/analysis-steps/stage-17-doc-generation.js and its test file -- confirmed the vision/arch-call-site asymmetry and the QF-262 regression guard shape',
        'Grepped every from(\'eva_architecture_plans\') call site in live code to build the corrected reader census',
        'Grepped every UPDATE targeting eva_architecture_plans -- zero found (only 3 INSERT/upsert writes total)',
        'Read stage-execution-worker.js\'s _autoApproveCloneVision as the promotion-path precedent',
        'Queried strategic_directives_v2 for SD-MAN-INFRA-EVA-ARCHITECTURE-PLAN-001 -- confirmed dedup false positive',
        'Queried chairman_ratifications for a588adba (full row, including EFFECT clause) and 6c263823',
        'Grepped scripts/eva/archplan-command.mjs and scripts/eva/vision-command.mjs -- confirmed the CLI mandatory-choice asymmetry',
        'Live query: quality_checked=false AND chairman_approved=true on eva_architecture_plans -- 38 rows',
        'information_schema.columns check for metadata column on eva_architecture_plans -- absent, confirming cascade-watcher.mjs phantom reference',
      ],
    },
    metadata: { independent_verification: true, corrected_prior_report: true, operational_risk_resolved: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'scripts/one-off/archplan-lead-validation-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'Validation' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
  console.log('STORED:', 'VALIDATION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
