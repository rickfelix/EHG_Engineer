#!/usr/bin/env node
/**
 * One-off: write VALIDATION + Explore LEAD-phase evidence for
 * SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-C ("F3: Acceptance-tier downgrade
 * (live to unit) must be surfaced, not silent"), ahead of its LEAD-TO-PLAN handoff.
 *
 * Findings drawn from real investigation this session: an Explore pass read
 * value-authenticity-spec-gate.js in full and PROVED the SD's own embedded discovery
 * hint wrong (wrong signal: VA-T#-slug library-ID detection, not live/never-mocked
 * phrase detection; wrong phase: LEAD-TO-PLAN, before any EXEC evidence exists). A
 * follow-up validation-agent pass confirmed a revised design (new LEAD-FINAL-APPROVAL
 * gate modeled on phantom-test-audit-gate.js + activation-invariant-gate.js) is
 * feasible, observe-only-by-default is the correct LEAD call, and caught 2 real
 * correctness issues (no findings[] column on sub_agent_execution_results; bypass
 * path is dead code while observe-only) before any code was written.
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict + lib/sub-agent-executor/results-storage.js
 * storeSubAgentResults) per CLAUDE.md prologue rule 11 — no hand-rolled insert.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '0d5d239a-7dea-4ea1-919e-6a7e05dd9467';
const SD_KEY = 'SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-C';

async function writeExplore(supabase) {
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'Explore', supabase });
  let results = {
    verdict: 'PASS',
    confidence: 92,
    findings: [
      { id: 'F1-discovery-hint-disproven-wrong-signal', severity: 'WARNING', summary: "The SD's own embedded LEAD-phase discovery note claimed value-authenticity-spec-gate.js's isMockSatisfiable()/checkDeferredStubTrap()/classifyTriggerPredicate() already do most of F3's job. Disproven: isMockSatisfiable() (line 79-83) detects whether AC text contains a canonical VA-T#-slug library-ID token, NOT whether it declares a live/never-mocked tier. An AC literally reading 'live proof required, never mocked' and one reading 'should look reasonable' are both flagged isMockSatisfiable=true for the identical reason (no VA-T#-slug token) -- the gate cannot distinguish F3's target phrase class from any other unparameterized prose." },
      { id: 'F2-discovery-hint-disproven-wrong-phase', severity: 'WARNING', summary: "value-authenticity-spec-gate.js runs at LEAD-TO-PLAN (gate=L, confirmed via its leo_validation_rules DB row inserted in commit 82c15c6e1, and via its total absence from lead-final-approval/gates.js's getRequiredGates()), i.e. at PRD-authoring time before EXEC has produced any test evidence. F3's core mechanic (declared tier vs actual evidence) is structurally impossible to implement at this phase -- there is no evidence yet to cross-reference." },
      { id: 'F3-no-structured-evidence-tier-signal-exists', severity: 'INFO', summary: 'Confirmed via schema search: no column on sub_agent_execution_results, user_stories, or product_requirements_v2.functional_requirements[].acceptance_criteria distinguishes unit-vs-live/E2E test evidence at the FR/AC level. user_stories.e2e_test_status exists but is not tier-linked to a specific AC. A text-keyword heuristic (both AC-declares-live-tier and evidence-has-live-signal) is the only viable v1 mechanism -- not a shortcut, the actual available signal.' },
      { id: 'F4-real-wired-model-gates-identified', severity: 'INFO', summary: 'phantom-test-audit-gate.js (env + sd.metadata.governance_metadata.bypass_reason dual-bypass pattern, explicit non-silent warning on bypass) and activation-invariant-gate.js (loadPRD via prdRepo.getBySdUuid, loadTestingEvidence via sub_agent_execution_results filtered sd_id+sub_agent_code) are both real, already-wired LEAD-FINAL-APPROVAL gates in the exact same directory -- both read in full, both directly reusable as structural templates for the new gate.' },
      { id: 'F5-no-duplicate-inflight-work', severity: 'INFO', summary: 'Grep across lead-final-approval/gates.js and gates/ confirms no existing gate detects acceptance-tier downgrade / never-mocked / live-proof phrase matching. Sibling children -A (retro-gap surfacing) and -B (vacuous TESTING/SECURITY gate shells) are explicitly distinct, non-overlapping fixes per the parent orchestrator scope.' },
    ],
    warnings: ['This is a heuristic (keyword-match) mechanism on both detection sides, honestly scoped as such given no structured evidence-tier data exists anywhere in the schema today -- not a rigorous acceptance-tier taxonomy.'],
    recommendations: [
      'PLAN: build a new LEAD-FINAL-APPROVAL gate (not a value-authenticity-spec-gate.js modification) modeled on phantom-test-audit-gate.js + activation-invariant-gate.js.',
      'Ship observe-only by default (ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING=true to flip) -- matches this repo\'s own established rollout convention for new heuristic gates on safety-critical shared code (value-authenticity-spec-gate.js\'s own history, QF-20260704-121 false-positive precedent).',
    ],
    detailed_analysis: JSON.stringify({
      files_read: ['scripts/modules/handoff/validation/validator-registry/gates/value-authenticity-spec-gate.js', 'scripts/modules/handoff/executors/lead-final-approval/gates/phantom-test-audit-gate.js', 'scripts/modules/handoff/executors/lead-final-approval/gates/activation-invariant-gate.js', 'scripts/modules/handoff/executors/lead-final-approval/gates.js', 'scripts/modules/handoff/gates/fr-delivery-classifier.js', 'tests/unit/value-authenticity-spec-gate.test.js'],
      git_history_checked: 'value-authenticity-spec-gate.js commit history (b7266a866, 4fa716b17, 5fe177f3e, 82c15c6e1, bcf8c89bb) -- confirmed observe-only-first was a deliberate calibration-window default tied to QF-20260704-121, never flipped to binding, and its handoff_type=LEAD-TO-PLAN row was never changed.',
    }),
    metadata: { files_identified: ['scripts/modules/handoff/executors/lead-final-approval/gates/acceptance-tier-downgrade-gate.js', 'tests/unit/handoff/lead-final-approval/acceptance-tier-downgrade-gate.test.js'] },
    phase: 'LEAD',
    validation_mode: 'prospective',
    source: 'Explore',
    summary: "Disproved the SD's own embedded discovery hint on two independent grounds (wrong detection signal, wrong pipeline phase) via direct code + DB-row + git-history verification. Confirmed no structured evidence-tier data exists in this schema, making a text-keyword heuristic the honest v1 mechanism. Identified 2 real, already-wired LEAD-FINAL-APPROVAL gates as structural templates. No duplicate in-flight work.",
  };
  results = applySubAgentRepoVerdict(results, resolution);
  return storeSubAgentResults('Explore', SD_ID, { name: 'Codebase Explorer' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
}

async function writeValidation(supabase) {
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'VALIDATION', supabase });
  let results = {
    verdict: 'PASS',
    confidence: 90,
    findings: [
      { id: 'F1-feasible-small-isolated', severity: 'INFO', summary: "Verdict: FEASIBLE. New LEAD-FINAL-APPROVAL gate file + one gates.push() line in getRequiredGates() + tests -- no DB migration needed (hardcoded gates run by default in this executor, same as phantom-test-audit-gate.js and activation-invariant-gate.js, both plain pushes with no leo_validation_rules row)." },
      { id: 'F2-heuristic-is-the-only-v1-mechanism', severity: 'INFO', summary: 'Schema search confirmed decisive: no test_tier/evidence_tier/acceptance_tier column exists on sub_agent_execution_results, user_stories, or product_requirements_v2.functional_requirements[].acceptance_criteria (bare string array, no per-AC tier field per lib/artifact-contracts/prd-contract.js). A text-keyword heuristic on both sides (AC-declares-live-tier, evidence-has-live-signal) is the only viable v1 signal, not a shortcut around a better option.' },
      { id: 'F3-observe-only-confirmed-correct-LEAD-call', severity: 'INFO', summary: "Observe-only-by-default confirmed correct: touches shared completion-gating code every SD depends on; a false-positive keyword hit (e.g. 'the UI should not look mocked up' matching 'not mocked') would wrongly block completions fleet-wide if binding by default. Matches value-authenticity-spec-gate.js's own precedent (shipped observe-only after documented false-positive QF-20260704-121). Solomon's actual complaint (zero signal today) is fully satisfied even in observe-only mode -- a permanent, non-silent warnings[] line replaces total silence." },
      { id: 'F4-no-scoring-blocker-verified-in-orchestrator', severity: 'INFO', summary: 'Verified in ValidationOrchestrator.validateGates: blocking requires passed===false AND required!==false (observe-only always returns passed:true, so it can never block regardless of the static required flag); scoring is a weighted average, and a gate pinned at score:100/max_score:100 can only pull the mean up or flat, never trip a threshold check. Adding an 18th gate to getRequiredGates() carries no scoring-side blast radius as long as observe-only mode keeps score pinned at 100.' },
      { id: 'F5-correctness-fix-no-findings-column', severity: 'WARNING', summary: 'sub_agent_execution_results has NO findings column -- a select on a nonexistent column silently returns null (Supabase behavior), which would make evidence-scanning silently miss all real evidence. Must scan the columns that actually exist: evidence, test_execution, detailed_analysis, summary, critical_issues, warnings, metadata (stringify defensively, since summary is TEXT in a later ALTER but JSONB in the base schema).' },
      { id: 'F6-scope-cuts-for-v1', severity: 'INFO', summary: 'Cut the bypass mechanism from v1 (dead code while observe-only -- passed:true always, nothing to bypass; add alongside a future BINDING flip). Cut validation_audit_log emission (unnecessary while observe-only). Tighten LIVE_TIER_KEYWORDS to high-precision phrases only (e.g. "never mocked", "live proof required", "must run live") -- drop ambiguous short phrases like "no mocks"/"not mocked" that false-positive on unrelated UI-copy prose.' },
    ],
    warnings: [],
    recommendations: [
      'PLAN: scope the PRD to exactly this v1 (detection + observe-only warning, no bypass mechanism, tightened keyword list, correct evidence-column scan).',
      'EXEC: mirror phantom-test-audit-gate.js / activation-invariant-gate.js\'s existing test-file conventions (injected supabase mock, no live DB in unit tests).',
    ],
    detailed_analysis: JSON.stringify({
      sd_key: SD_KEY,
      parent_sd_key: 'SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001',
      sibling_children: ['SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-A (F1, retro-gap surfacing)', 'SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-B (F2, vacuous gate shells)'],
      model_gates: ['phantom-test-audit-gate.js', 'activation-invariant-gate.js'],
      scoring_mechanism_verified: 'ValidationOrchestrator.js weighted-average normalizedScore + passed===false&&required!==false blocking condition',
    }),
    metadata: { files_identified: ['scripts/modules/handoff/executors/lead-final-approval/gates/acceptance-tier-downgrade-gate.js', 'tests/unit/handoff/lead-final-approval/acceptance-tier-downgrade-gate.test.js'] },
    phase: 'LEAD',
    validation_mode: 'prospective',
  };
  results = applySubAgentRepoVerdict(results, resolution);
  return storeSubAgentResults('VALIDATION', SD_ID, { name: 'Principal Systems Analyst (validation-agent)' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
}

async function main() {
  const supabase = await getSupabaseClient();
  const explore = await writeExplore(supabase);
  const validation = await writeValidation(supabase);
  console.log('Explore:', explore.id, explore.verdict, explore.confidence);
  console.log('VALIDATION:', validation.id, validation.verdict, validation.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
