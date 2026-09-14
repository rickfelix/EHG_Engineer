#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 — Explore evidence at LEAD phase.
 *
 * An Explore sub-agent independently verified the SD's defect premise against live code and
 * DB state, finding the core premise real and confirming a directly-analogous prior fix
 * (QF-20260702-262) plus a live security implication (trust-elevation.js). A follow-up
 * VALIDATION pass materially corrected several of this report's claims (reader census,
 * ratification characterization, fix-shape completeness) -- see the VALIDATION evidence row
 * and the LEAD-phase description addendum for the corrected understanding.
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
    confidence: 85,
    phase: 'LEAD',
    execution_time_ms: 0,
    summary: "Verified the core defect premise directly: lib/eva/archplan-upsert.js lines 121-122 unconditionally hardcode status:'active', chairman_approved:true in the write record, with no parameter anywhere in the function signature to override this -- confirmed by reading the full ~140-line file. Read lib/eva/vision-upsert.js and confirmed it implements a draft/active toggle via an 'approved' boolean parameter (default true for backward compat) but does NOT implement any approved_by/reviewer-vs-author distinction or self-approval guard. Queried information_schema.columns and confirmed eva_architecture_plans already has status (DB default 'draft'), chairman_approved (DB default false), and chairman_approved_at (nullable) columns -- app code actively overrides sane DB defaults; no approved_by column exists on this table or the sibling eva_vision_documents. Found a directly analogous PRIOR FIX in this exact codebase: QF-20260702-262 fixed this identical bug pattern on the vision side by having lib/eva/stage-templates/analysis-steps/stage-17-doc-generation.js's vision call site explicitly pass approved:false (not by flipping vision-upsert's own default) -- the equivalent architecture-plan call sites in that same file never received the analogous treatment. Found a live security implication: lib/eva/bridge/trust-elevation.js uses chairman_approved=true on this table as an AND-guard for venture trust-tier elevation, currently a rubber stamp given the unconditional hardcode. Confirmed the flagged dedup_match_sd_key (SD-MAN-INFRA-EVA-ARCHITECTURE-PLAN-001, completed) is a false positive -- it built the prerequisite /eva archplan CLI feature, not duplicate scope of this governance fix. Confirmed via chairman_ratifications that the cited rulings (a588adba, 6c263823) exist. Confirmed exactly 3 call sites of upsertArchPlan and no existing test asserting the write record's approval fields (archplan-upsert.test.js only uses status:'active' in mock RETURN values, never as an assertion on the captured write payload).",
    critical_issues: [],
    warnings: [
      {
        id: 'EXP-1',
        severity: 'MEDIUM',
        issue: 'Initial reader census (7 downstream readers filtering on status/chairman_approved) was later found by an independent VALIDATION pass to conflate readers of the SEPARATE eva_vision_documents table with true eva_architecture_plans readers -- the real count is 1 (chairman_approved) + 2 (status=active, one of which is a non-blocking warning-only gate). Corrected in the LEAD-phase description addendum before PLAN begins.',
        resolution: 'Corrected by VALIDATION sub-agent review; SD description updated to reflect the accurate reader census.',
      },
      {
        id: 'EXP-2',
        severity: 'LOW',
        issue: "Characterized ratification a588adba as a softer, personal-capacity remark rather than a crisp written policy -- a subsequent VALIDATION re-read of the full ratification row (including its EFFECT clause) found it to be a directly-applicable, explicit mandate for this SD's approved_by requirement, not an analogical stretch.",
        resolution: 'Corrected by VALIDATION sub-agent review; SD description updated with the accurate characterization.',
      },
    ],
    recommendations: [
      'Design the fix as an additive approved parameter on upsertArchPlan mirroring vision-upsert, paired with a mandatory --approved|--draft CLI choice at the dominant write path (archplan-command.mjs), not a bare unconditional default flip.',
      'Update stage-17-doc-generation.js\'s two architecture-plan call sites to pass approved:false explicitly, mirroring its own already-fixed vision call site, with a matching regression-guard test.',
      'approved_by requires a new column -- per this SD\'s own scope, name the needed migration and stop there; do not implement DDL in this SD.',
    ],
    detailed_analysis: {
      commands_run: [
        'Read lib/eva/archplan-upsert.js in full -- confirmed hardcoded status/chairman_approved at lines 121-122, no override parameter',
        'Read lib/eva/vision-upsert.js in full -- confirmed approved boolean default-true pattern, no approved_by mechanism',
        'information_schema.columns query on eva_architecture_plans and eva_vision_documents -- confirmed status/chairman_approved/chairman_approved_at exist, approved_by does not',
        'Read lib/eva/bridge/trust-elevation.js -- confirmed chairman_approved AND-guard for trust-tier elevation',
        'Read lib/eva/stage-templates/analysis-steps/stage-17-doc-generation.js and its test file -- confirmed QF-20260702-262 precedent (vision call site approved:false) and confirmed both arch-plan call sites pass nothing approval-related',
        'Queried strategic_directives_v2 for SD-MAN-INFRA-EVA-ARCHITECTURE-PLAN-001 -- confirmed completed, prerequisite scope not duplicate',
        'Queried chairman_ratifications for a588adba, 6c263823 -- confirmed both exist',
        'Grepped codebase for upsertArchPlan call sites -- exactly 3, none pass approval-related params',
        'Read lib/eva/__tests__/archplan-upsert.test.js -- confirmed no existing test asserts the write record\'s approval fields',
      ],
    },
    metadata: { independent_verification: true, corrections_applied_by_followup_validation: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    probeExistsRelative: 'scripts/one-off/archplan-lead-explore-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('Explore', sdRow.id, { code: 'Explore', name: 'Explore' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
  console.log('STORED:', 'Explore', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
