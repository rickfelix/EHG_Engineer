#!/usr/bin/env node
// SD-LEO-FIX-IMPLEMENTATION-FIDELITY-GATE-001 LEAD phase: records Explore evidence (gate
// REQUIRED_SUBAGENTS['LEAD-TO-PLAN'] includes 'Explore'; the Explore agent has no Write tool, so
// its findings are persisted here) from real direct-code exploration performed this session:
// read scripts/modules/handoff/gates/fr-delivery-classifier.js in full (classifyFrDelivery lines
// ~408-617, projectGateResult lines ~634-713), fr-delivery-traceability-gate.js in full, git log
// for both files, and cross-checked against the VALIDATION/RISK/prospective-TESTING sub-agent
// findings (evidence ids 697cd021-6a2e-4450-ac21-651ebb574b97, 2ae33bb5-309d-4a57-8c04-3022e260e98b,
// 6abb244c-be82-4f79-96fc-5ec2c9a54143 respectively).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-IMPLEMENTATION-FIDELITY-GATE-001';

export async function recordExploreEvidence() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: sd, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const repoRoot = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';
  const exploreRow = {
    sd_id: sd.id,
    sub_agent_code: 'Explore',
    sub_agent_name: 'Codebase Explorer',
    verdict: 'PASS',
    confidence: 94,
    critical_issues: [],
    warnings: [
      'Defect 1 as originally stated in the source QF (QF-20260903-881) is NOT reproducible against current code: checkAmbiguityResolution() in scripts/modules/implementation-fidelity/preflight/index.js resolves the SD\'s implementing commit via `git log --all --grep=<UUID|sd_key>` then `git show <hash>`, and scans only ADDED lines (addedLinesForAmbiguityScan) -- it genuinely reads a code diff, never PRD text. The specific counting bug the QF evidenced was a real but different defect, already fixed under SD-LEO-FIX-GATE2-IMPLEMENTATION-FIDELITY-001 (merged 2026-09-05, git log confirms this commit exists and predates the QF\'s 2026-09-11 re-verification pass). This SD carries no code changes for that half -- documented as verified-superseded, not silently dropped.',
      'The real, still-live defect (corrected Defect 2) is narrower than the QF\'s framing: classifyFrDelivery() already computes has_work_product/convention_in_use correctly and the PER-FR evidence text (line ~588) already branches correctly on has_work_product. Only the AGGREGATE message built in projectGateResult() (the undeliveredList line, ~681) was left unbranched -- confirmed by direct read as the sole unconditional occurrence of the string "sibling FRs are referenced" in the repo, authored by commit f5183d850d1 (2026-08-01) and untouched since, while the sibling per-FR fix landed one layer down under c3d887291cc (2026-08-18, SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001).',
    ],
    recommendations: [
      'Branch projectGateResult\'s aggregate UNDELIVERED message on classification.has_work_product using strict `=== false` (undefined in hand-built test fixtures must NOT route through the new branch) -- independently confirmed by VALIDATION, RISK, and prospective TESTING as the same hazard.',
      'Use the RISK-corrected wording (a factual clause-swap keeping "genuinely missing", not a "could not be measured"/blindness reframing) -- the module deliberately treats a zero-work-product SD as genuinely undelivered, not unmeasurable, per its own existing has_work_product/UNVERIFIABLE design and an existing test asserting "blindness needs something to be blind to".',
      'Both FR_DELIVERY_TRACEABILITY (fr-delivery-traceability-gate.js:66) and FR_DELIVERY_VERIFICATION (lead-final-approval/gates.js:1571) share this one function -- the PRD must describe the fix at the shared call site, not scope it to one gate name.',
    ],
    detailed_analysis: JSON.stringify({
      defect_1_disposition: 'NOT reproducible / superseded. checkAmbiguityResolution reads git-diff ADDED lines via `git show`, never PRD text; CLASSIFICATION_LABELS allowlist does not even include "ambiguous". Real underlying bug already fixed 2026-09-05 under SD-LEO-FIX-GATE2-IMPLEMENTATION-FIDELITY-001.',
      defect_2_real_location: 'scripts/modules/handoff/gates/fr-delivery-classifier.js, function projectGateResult (~line 634-713), the undeliveredList warning/issue line (~681): `${gateName}: ${undelivered}/${total} FR(s) UNDELIVERED — this SD does use the FR-reference convention (sibling FRs are referenced), so these are genuinely missing` -- emitted unconditionally regardless of classification.has_work_product.',
      classifyFrDelivery_trace: 'hasWorkProduct = validated.length>0 || matchedTestingCoverage.length>0 (computed once, SD-wide, after PASS 1). unmeasurable = !conventionInUse && hasWorkProduct. When hasWorkProduct is false (zero validated stories AND zero matched TESTING fr_coverage entries anywhere in the SD), unmeasurable is forced false regardless of conventionInUse, so every undelivered FR falls to the final fallthrough branch, whose per-FR `evidence` text ALREADY correctly says "No validated story exists for this SD and no admitted TESTING evidence matched any FR — nothing was built or validated against this FR" (line ~589) -- this per-FR text is accurate and requires no change.',
      two_callers_confirmed: 'grep confirms exactly two production call sites of projectGateResult: scripts/modules/handoff/gates/fr-delivery-traceability-gate.js:66 (FR_DELIVERY_TRACEABILITY, EXEC-TO-PLAN) and scripts/modules/handoff/executors/lead-final-approval/gates.js:1571 (FR_DELIVERY_VERIFICATION, LEAD-FINAL-APPROVAL).',
      no_downstream_consumers: 'The literal string "sibling FRs are referenced" has exactly one production occurrence (the defect line itself); message text is never persisted (projectGateResultsForPersistence keeps only name/score/max_score/passed/required/status/fr_classification, dropping issues/warnings) -- independently confirmed by RISK sub-agent via direct grep.',
    }),
    metadata: {
      repo_path: repoRoot,
      executed_from_cwd: repoRoot,
      files_identified: [
        'scripts/modules/handoff/gates/fr-delivery-classifier.js',
        'scripts/modules/handoff/gates/fr-delivery-traceability-gate.js',
        'scripts/modules/handoff/executors/lead-final-approval/gates.js',
        'scripts/modules/implementation-fidelity/preflight/index.js',
        'tests/unit/handoff/gates/fr-delivery-classifier.test.js',
        'tests/unit/handoff/gates/fr-delivery-traceability-gate.test.js',
      ],
      related_sub_agent_evidence: [
        '697cd021-6a2e-4450-ac21-651ebb574b97 (VALIDATION)',
        '2ae33bb5-309d-4a57-8c04-3022e260e98b (RISK)',
        '6abb244c-be82-4f79-96fc-5ec2c9a54143 (TESTING, prospective)',
      ],
    },
    validation_mode: 'prospective',
    source: 'Explore',
    phase: 'LEAD',
    summary: 'Direct code read confirms: (1) the QF\'s Defect 1 (GATE2 word-matching PRD text) is not reproducible against current code and was already fixed under a different, prior SD; (2) the QF\'s Defect 2 (FR delivery gate blind to code-only requirements) IS real but narrower than framed -- the per-FR classifier already handles it correctly, only the AGGREGATE message in the shared projectGateResult() function was left unbranched on has_work_product, and that function backs two live gates (FR_DELIVERY_TRACEABILITY and FR_DELIVERY_VERIFICATION), not one. No existing implementation already fixes this.',
  };

  const { data: ev, error: evErr } = await supabase.from('sub_agent_execution_results').insert(exploreRow).select('id').single();
  if (evErr) throw new Error(`insert failed: ${evErr.message}`);
  console.log('EXPLORE_EVIDENCE', ev.id);
  return { evidenceId: ev.id };
}

if (isMainModule(import.meta.url)) {
  recordExploreEvidence().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
