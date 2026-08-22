#!/usr/bin/env node
/**
 * One-off: Write RETRO sub-agent evidence row for the PLAN-TO-LEAD
 * GATE_SUBAGENT_EVIDENCE check on SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001.
 *
 * The handoff precheck rejected with SUBAGENT_EVIDENCE_MISSING: RETRO --
 * scripts/modules/handoff/required-subagents.js declares RETRO required for
 * PLAN-TO-LEAD. A Task-tool retro-agent run already published a genuine,
 * gate-verified SD_COMPLETION retrospective (row a1a71d54-4491-42fa-9b2d-
 * caf90fbc4748, quality_score=96/100, RetrospectiveQualityRubric.
 * detectBoilerplate()=0 matches, real validateSDCompletionReadiness() call:
 * blended gate score=94, passed=true) -- but per EVIDENCE_WRITER_CONTRACT in
 * scripts/modules/handoff/gates/subagent-evidence-gate.js, a Task-tool run
 * does NOT itself write sub_agent_execution_results. This script is writer
 * (2) from that contract: persist via storeSubAgentResults with
 * source='manual', recording the ALREADY-COMPLETED, ALREADY-VERIFIED work --
 * not re-deriving it.
 *
 * Uses the canonical evidence pipeline per CLAUDE.md prologue rule 11 --
 * resolveSubAgentRepo -> applySubAgentRepoVerdict (lib/sub-agents/
 * resolve-repo.js) -> storeSubAgentResults (lib/sub-agent-executor/
 * results-storage.js) -- the same mechanism TESTING/SECURITY/VALIDATION/
 * REGRESSION used for their own rows on this SD. Mirrors
 * scripts/one-off/_retro-evidence-hourly-drive-score-001-plan-to-lead.mjs,
 * the clearest precedent for this exact gap.
 *
 * phase='PLAN_VERIFICATION' -- matches this SD's own live current_phase
 * (confirmed via handoff.js precheck's own Gate 0 output) and the phase
 * every other sub-agent row on this SD (TESTING/SECURITY/VALIDATION/
 * REGRESSION/VISION_FIDELITY) already used.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'c99ee371-055f-46ea-9f39-837325f6f797';
const SD_KEY = 'SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001';
const RETRO_ID = 'a1a71d54-4491-42fa-9b2d-caf90fbc4748';
const RETRO_QUALITY_SCORE = 96;
const BLENDED_GATE_SCORE = 94;

const findings = [
  {
    id: 'RETRO-sdcompletion-row-published-gate-verified',
    severity: 'INFO',
    summary: `Published a retro_type=SD_COMPLETION retrospective (retrospectives.id=${RETRO_ID}, sd_id=${SD_ID}, created_at=2026-08-21T23:04:42Z -- after the LEAD-TO-PLAN acceptance freshness cutoff of 2026-08-21T15:57:16.646Z, so it passes retro-filters.js's freshness check). The retro-agent read the actual DB rows rather than transcribing an orientation prompt: the full PRD (functional_requirements/acceptance_criteria, including their inline ROUND-N correction annotations) and all 38 sub_agent_execution_results rows for this SD across the LEO fleet's full sub-agent roster. Verified against the real gate, not eyeballed: RetrospectiveQualityRubric.detectBoilerplate() returned 0 matches / 0 penalty, and an actual end-to-end validateSDCompletionReadiness(sd, retrospective) call (not simulated) returned retroQuality.score=${RETRO_QUALITY_SCORE}/100 (threshold 55 for this infrastructure SD), passed=true, blended gate score=${BLENDED_GATE_SCORE}, passed=true. Criterion breakdown: learning_specificity 10/10, improvement_area_depth 10/10, action_item_actionability 9/10, lesson_applicability 9/10. Zero issues, zero warnings.`
  },
  {
    id: 'RETRO-content-cites-primary-evidence-not-summary',
    severity: 'INFO',
    summary: 'The five what_went_well, five improvement_areas (root_cause/prevention pairs), and five key_learnings each cite specific sub_agent_execution_results row IDs, commit SHAs, and file paths rather than generic process language -- including direct quotes from SECURITY\'s own "conjunction blindness" addendum (row 1c4bd6a7-a098-4e4b-804d-7bce38cceadf: "an AC is one sentence with two conjoined requirements, I verified the interesting half exhaustively and never read the second half") and TESTING\'s self-retraction of a stale head_sha finding (row 8482ca7b-08ea-4af0-bb10-1cb1009be46c). Concrete instances captured: the isSyntheticActor predicate\'s zero-production-callers gap (EXEC-TO-PLAN, corrected to make contamination-scan.mjs the real consumer rather than retrofit decorative wiring), the FR-7 doc text\'s own self-inflicted verbatim drift (the SD committing the exact defect class it existed to prevent), SEC-56\'s unreachable inverse-ownership check (an early-exit branch that fired in exactly the scenario the check existed to catch), FR-3\'s stale premise found by VALIDATION during PLAN_VERIFICATION (an acceptance criterion premised on a chairman-facing aggregate that was already known not to exist, surviving an earlier sibling-FR correction unreconciled), the FR-6 staleness-window conjunction-blindness miss, and REGRESSION\'s catch of a sess_ redaction regex that excluded base64url characters and could leave a credential fragment unredacted.'
  },
  {
    id: 'RETRO-recurring-defect-class-named-as-action-item',
    severity: 'INFO',
    summary: 'The retrospective names the recurring pattern across this SD\'s life as its central lesson rather than treating each finding as isolated: something repeatedly READ as wired/tested/protected but genuinely was not, and none of the instances would have surfaced from reading a diff -- each needed someone to trace actual control flow or measure live state. Action items are SD-specific rather than generic ("improve testing"): concrete guidance on conjunction-blindness for multi-clause acceptance criteria, and on re-verifying architecture-correction propagation across sibling FRs whenever one gets retargeted.'
  }
];

const warnings = [
  'GATE_SUBAGENT_EVIDENCE resolves the PLAN-TO-LEAD freshness anchor to the most recently accepted handoff INTO phase=PLAN for this SD, which may differ from RETROSPECTIVE_QUALITY_GATE\'s own cutoff (LEAD-TO-PLAN acceptance). Both this evidence row and the retrospective were written well after both cutoffs, so neither gate\'s freshness check is at risk here, but the two gates do not share one anchor.'
];

const recommendations = [
  'GO for PLAN-TO-LEAD on the RETRO axis -- a genuinely SD-specific, non-boilerplate SD_COMPLETION retrospective is published and independently gate-verified, and this evidence row records that for GATE_SUBAGENT_EVIDENCE.',
  'Re-run the PLAN-TO-LEAD precheck after this row lands to confirm both previously-failing gates (RETROSPECTIVE_QUALITY_GATE, GATE_SUBAGENT_EVIDENCE) now pass, rather than assuming from the write alone.'
];

const summary = `RETRO PASS for ${SD_KEY} PLAN-TO-LEAD handoff. SD_COMPLETION retrospective published (id=${RETRO_ID}, quality_score=${RETRO_QUALITY_SCORE}/100, blended gate score=${BLENDED_GATE_SCORE}, boilerplate detection=0 matches) satisfying RETROSPECTIVE_QUALITY_GATE, built from the actual PRD + all 38 sub_agent_execution_results rows on this SD rather than a prompt summary, with direct citations to SECURITY's conjunction-blindness self-correction and TESTING's own retraction among its five what_went_well / five improvement_area / five key_learning entries. GO.`;

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'RETRO',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: RETRO_QUALITY_SCORE,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      branch: 'feat/SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001',
      go_no_go: 'GO',
      retro_contribution: {
        retrospective_id: RETRO_ID,
        retro_type: 'SD_COMPLETION',
        quality_score: RETRO_QUALITY_SCORE,
        blended_gate_score: BLENDED_GATE_SCORE,
        criterion_breakdown: {
          learning_specificity: '10/10',
          improvement_area_depth: '10/10',
          action_item_actionability: '9/10',
          lesson_applicability: '9/10',
        },
        source_rows_read: 38,
      },
    },
    retro_contribution: {
      retrospective_id: RETRO_ID,
      quality_score: RETRO_QUALITY_SCORE,
    },
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'RETRO',
    SD_ID,
    { name: 'Continuous Improvement Coach (retro-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_VERIFICATION' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
