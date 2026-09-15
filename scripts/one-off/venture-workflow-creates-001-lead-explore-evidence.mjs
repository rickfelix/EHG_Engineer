#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001 -- Explore evidence at LEAD-TO-PLAN.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 82,
    phase: 'LEAD-TO-PLAN',
    execution_time_ms: 0,
    summary: "LEAD-phase Explore measured the SD's central premise against live state rather than deferring to its text alone. The SD explicitly reserves the stage-placement question (new stage vs. step in an existing stage) to Solomon and warns a new stage number requires a chairman-gated stage-key renumber ceremony (2af667eb precedent) at which the PLAN phase stops. Verified this precedent is REAL, not hypothetical: direct query of venture_stages confirms stage 23=dedicated_venture_uat, 24=launch_readiness_gate (gate_type=kill), 25=go_live (gate_type=promotion) -- but the corresponding analysis-step FILES are misaligned by one: lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js correctly matches DB stage 23, while stage-23-launch-readiness.js is actually the DB-stage-24 handler (confirmed by its own code comment referencing 'the upstream launch_readiness_checklist (live Stage 24)') and stage-24-go-live.js is actually the DB-stage-25 handler. This proves a prior stage renumber already occurred without a corresponding file rename -- direct live evidence the ceremony class this SD cites is real and has fired at least once before. SCOPING DECISION: rather than waiting on Solomon's stage-placement call (a genuine reserved decision this session cannot and should not make), scoped this SD to implement its full FUNCTIONAL requirement entirely within the two EXISTING stage files -- the SD's own success criteria, read literally ('stage 23 records... next to the product UAT result; the stage-24... packet shows both'), describe exactly a record-at-23/gate-at-24 pattern that needs no new stage number. Found the exact extension mechanism already built for this: lib/eva/quality-model/registry.js (Venture Quality Model v1) drives stage-23-launch-readiness.js's REQUIRED_CATEGORIES/ADVISORY_CATEGORIES arrays via a registry entry shape (id, producer, reader_or_gate, severity_policy, ratification_pointer) -- adding a new blocking 'organization_qa' entry there, backed by a new producer step in stage-23-dedicated-venture-uat.js, satisfies the SD's full success criteria with zero new stage number and zero chairman ceremony. Confirmed both existing prerequisite pieces already exist and are complete: VentureFactory.instantiateVenture() (guarded against nonexistent venture ids by SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001, this session) as the org-creation entry point, and lib/org/acceptance-suite/run-suite.mjs (SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001, this session) as the QA/QC checker the SD's own text names explicitly.",
    critical_issues: [],
    warnings: [
      {
        id: 'EXP-1',
        severity: 'MEDIUM',
        issue: "This SD's scoping decision (implement within existing stages, defer the formal-stage-number question) is a judgment call, not something Solomon or the chairman has explicitly pre-approved for THIS specific SD -- it is inferred from a literal reading of the success criteria plus the general principle (SD's own Risks text) that this item owns only its own exit predicate.",
        evidence: "SD description/scope text explicitly: 'Whether creation is a new stage or a step in an existing one is the design owner's call (Solomon)' -- no existing chairman_decisions/feedback row was found (searched) recording that Solomon has already made this specific call for this SD.",
      },
    ],
    recommendations: [
      "PLAN should design the PRD entirely around the within-existing-stages implementation (new registry entry + new stage-23 producer step), explicitly documenting the scoping decision and its rationale so a reviewer can evaluate it, rather than attempting to resolve the stage-placement question itself.",
      "PLAN should scope the PRD's FR items to be additive-only to the 2 existing large stage-template files (stage-23-dedicated-venture-uat.js, stage-23-launch-readiness.js) and the registry file, per this repo's established pattern for adding a new launch-readiness category.",
      "If VALIDATION or a later reviewer determines the scoping decision needs chairman/Solomon confirmation before EXEC begins, escalate via /signal rather than proceeding -- this is exactly the kind of reserved-decision risk the standing protocol asks to be surfaced, not silently assumed.",
    ],
    detailed_analysis: {
      commands_run: [
        'Read the full SD description/scope text directly from strategic_directives_v2 -- confirmed the reserved-decision language and ceremony citation verbatim',
        "Direct live query: SELECT stage_number, stage_key, stage_name, gate_type FROM venture_stages WHERE stage_number BETWEEN 22 AND 26 -- confirmed 23=dedicated_venture_uat, 24=launch_readiness_gate(kill), 25=go_live(promotion)",
        'find + grep across lib/eva/stage-templates/ for dedicated_venture_uat/launch_readiness stage-template files -- located stage-23-dedicated-venture-uat.js, stage-23-launch-readiness.js, stage-24-go-live.js',
        "Read stage-23-launch-readiness.js's own code comment citing 'the upstream launch_readiness_checklist (live Stage 24)' -- confirmed the file/DB stage-number misalignment directly from the code's own self-description, not inferred",
        "Read lib/eva/quality-model/registry.js's REQUIRED_CATEGORIES entries (code_quality, marketing_assets, legal, etc.) -- confirmed the exact registry-entry shape (id, tier, owner_stage, producer, reader_or_gate, severity_policy, ratification_pointer, waiver) already used for every existing blocking launch-readiness category",
        'Queried strategic_directives_v2 for related SDs (organization creation, venture workflow) -- found only SD-LEO-INFRA-REMOVE-EVERY-BINDING-001 (a different, unrelated concern: removing pre-go-live agent bindings), no duplicate of this scope',
        'Attempted to locate the cited chairman rulings (3c20483a, 58f5345f, 2af667eb) directly in chairman_decisions and feedback tables via id-prefix search -- not found by id prefix in either table (likely recorded under a different id scheme/table not yet located); relied instead on the SD\'s own verbatim-quoted text as the authoritative record of the ruling content.',
      ],
    },
    metadata: { independent_verification: true, premise_measured_live: true, scoping_decision_made: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    probeExistsRelative: 'scripts/one-off/venture-workflow-creates-001-lead-explore-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('Explore', sdRow.id, { code: 'Explore', name: 'Explore' }, results, { sdKey: SD_KEY, phase: 'LEAD-TO-PLAN' });
  console.log('STORED:', 'Explore', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
