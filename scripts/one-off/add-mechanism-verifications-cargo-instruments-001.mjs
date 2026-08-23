#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER requires metadata.mechanism_verifications for
 * SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001's spine, which names specific file
 * mechanisms (thesis-kill-evaluator.js, thesis-kill-gate.js, stage-governance.js,
 * corrective-finding-recorder.js, gap-class.js). The Explore + RISK sub-agents'
 * own genuine, live-verified investigation is the verifier.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('Fetch failed:', fetchErr.message); process.exit(1); }

const metadata = {
  ...existing.metadata,
  mechanism_verifications: [
    {
      verified_by: 'sub_agent_execution_results:1b15d5b9-1510-4795-9a30-891a00a5df9b (Explore, phase=LEAD)',
      verified_at: 'lib/eva/lifecycle/thesis-kill-evaluator.js:29 (defaultResolveObservedValue permanent no-op), :42 (classifyVerdict), :70 (toStrictObservedValue), :86 (evaluateThesisKillCriteria)',
      claim: 'defaultResolveObservedValue() always returns undefined -- K1-K3 are structurally unmeasurable today; the per-criterion coercion/classification logic (toStrictObservedValue, classifyVerdict) is already correct and fails closed to HOLD on non-finite input.',
      reproduction: 'Direct source read of thesis-kill-evaluator.js line-by-line; confirmed against live AltifyAI venture metadata.kill_criteria (3 entries, all stage_by=21).'
    },
    {
      verified_by: 'sub_agent_execution_results:1b15d5b9-1510-4795-9a30-891a00a5df9b (Explore, phase=LEAD); sub_agent_execution_results:ebd3534d-7273-4c9d-a31a-c395e6c34426 (RISK, phase=LEAD)',
      verified_at: 'lib/eva/lifecycle/thesis-kill-gate.js:56 (logThesisKillEvent, writes only to system_events), :129 (checkThesisKillGate)',
      claim: 'checkThesisKillGate() wraps the entire evaluateThesisKillCriteria() call in one try/catch; a throwing resolver silently discards verdicts for ALL criteria on a venture, returns {allowed:true, fired:[], held:[]}, and emits zero system_events rows. Independently confirmed by RISK as R2 (HIGH/likely): in binding mode this is a kill-bypass, not a robustness gap.',
      reproduction: 'Direct source read of the try/catch scope in checkThesisKillGate; RISK sub-agent independently re-derived the same defect via static analysis of the wrapper.'
    },
    {
      verified_by: 'sub_agent_execution_results:ebd3534d-7273-4c9d-a31a-c395e6c34426 (RISK, phase=LEAD)',
      verified_at: 'lib/eva/stage-governance.js (on main via PR #7460, OPEN/MERGEABLE, purely additive diff); venture_stages table (gate_type=kill -> {3,5,13,23})',
      claim: 'stage-governance.js already exists on main (not vaporware/unmerged) -- PR #7460 only adds killStagesRaw/promotionStagesRaw/blockingStagesRaw alongside untouched existing sets; kill stages are identical under old and new views ({3,5,13,23}). AltifyAI live criteria are stage_by=21, which is NOT in killStages -- stage_by is a due-date, not gate-type membership, so FR-4 must not filter the due-set via governance.isKill(toStage).',
      reproduction: 'Live gh pr view/diff of PR #7460; direct read of stage-governance.js on main; live query of venture_stages where gate_type=kill; live query of AltifyAI venture metadata.kill_criteria stage_by values.'
    },
    {
      verified_by: 'sub_agent_execution_results:1b15d5b9-1510-4795-9a30-891a00a5df9b (Explore, phase=LEAD); sub_agent_execution_results:ebd3534d-7273-4c9d-a31a-c395e6c34426 (RISK, phase=LEAD)',
      verified_at: 'lib/eva/corrective-finding-recorder.js:75 (recordCorrectiveFinding), :110 (dedup SELECT .eq(category,corrective_finding)), :134 (insert)',
      claim: 'category=corrective_finding is hardcoded at both the dedup lookup and the insert; feedback table holds exactly 36 live corrective_finding rows today, confirming this is an active, load-bearing writer, not dead code -- a new factory_defect category needs a sibling writer reusing only the exported computeDedupHash helper, not an extension of this writer.',
      reproduction: 'Direct source read of both hardcoded call sites; live count query against feedback where category=corrective_finding (36 rows) and category=factory_defect (0 rows, confirming no migration/CHECK-constraint conflict).'
    },
    {
      verified_by: 'sub_agent_execution_results:ebd3534d-7273-4c9d-a31a-c395e6c34426 (RISK, phase=LEAD)',
      verified_at: 'lib/eva/findings/gap-class.js (NEW FILE, does not exist yet -- this SD is its origin, not a claim about pre-existing behavior)',
      claim: 'The ratified 8-value gap_class enum (GATE_CANNOT_FAIL, NO_DEFINITION_OF_DONE, UNPREDICTED_CHAIRMAN_KEYSTROKE, PAPER_STAGE_NO_MACHINERY, UNCOVERED_OPERATIONAL_NEED, GATE_BYPASSED, CRITERIA_DRIFT, INSTRUMENT_LIE) currently has zero code references and its only provenance is an archived plan doc (docs/plans/archived/sd-leo-infra-minus-cargo-instruments-001-plan.md) -- RISK confirmed no other SD owns this enum, so this SD becomes its code source of truth, minting only the 3 codes its own defects produce.',
      reproduction: 'Grep for gap_class / GATE_CANNOT_FAIL / INSTRUMENT_LIE / GATE_BYPASSED across the repo returned zero code hits, only the archived plan doc.'
    }
  ]
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY);
if (updateErr) { console.error('Update failed:', updateErr.message); process.exit(1); }
console.log('mechanism_verifications recorded for', SD_KEY);
