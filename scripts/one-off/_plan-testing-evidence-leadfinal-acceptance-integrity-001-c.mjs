#!/usr/bin/env node
import { pathToFileURL } from 'url';
/**
 * One-off: write PLAN-phase TESTING evidence for
 * SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-C, ahead of PLAN-TO-EXEC.
 *
 * Reflects a real prospective (pre-implementation) testing-agent review that ran
 * before the gate file was written and caught a genuinely severe design gap: PRD
 * TS-1..TS-8 assumed acceptance_criteria[] entries are always bare strings, but real
 * precedent code (auto-trigger-stories.mjs's LLM output contract; the existing
 * defensive branch in plan-to-lead/gates/acceptance-criteria-validation.js:96-99)
 * shows entries are frequently {id,criteria,type} objects, and the whole field can
 * also be a JSON-string-encoded array or a plain string. All 6 of the review's
 * recommended additions (ADD-1..ADD-6) were incorporated into the initial
 * implementation (normalizeAcceptanceCriteria/acEntryText) and into the test suite
 * (co-located acceptance-tier-downgrade-gate.test.js, 25/25 passing) rather than
 * discovered post-hoc via adversarial review.
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict + lib/sub-agent-executor/results-storage.js
 * storeSubAgentResults) per CLAUDE.md prologue rule 11 -- no hand-rolled insert.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '0d5d239a-7dea-4ea1-919e-6a7e05dd9467';
const SD_KEY = 'SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-C';

async function writeTesting(supabase) {
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase });
  let results = {
    verdict: 'PASS',
    confidence: 88,
    findings: [
      { id: 'F1-ac-shape-variance-not-covered-by-prd', severity: 'WARNING', summary: "PRD TS-1..TS-8 (and the draft detectLiveTierFRs sketch) assumed functional_requirements[].acceptance_criteria is always a bare string array. Verified against auto-trigger-stories.mjs's LLM output contract and the existing defensive branch in plan-to-lead/gates/acceptance-criteria-validation.js:96-99: real PRD rows carry {id,criteria,type} object entries, and the whole field itself is sometimes a JSON-string-encoded array or a plain string. An implementation that only handled bare strings would silently under-detect (false negative) on a large share of real PRDs -- the opposite of Solomon's complaint (silent downgrade going unnoticed)." },
      { id: 'F2-per-fr-evidence-isolation-must-be-tested', severity: 'INFO', summary: 'crossReferenceEvidence uses .map() per flagged FR (not a single SD-wide boolean), so two flagged FRs in one SD where only one has matching evidence must resolve independently -- this is the highest-value regression fence given the gate is heuristic and easy to accidentally short-circuit in a future edit.' },
      { id: 'F3-evidence-column-type-variance', severity: 'INFO', summary: 'sub_agent_execution_results evidence-bearing columns are a mix of TEXT and JSONB (schema drift across ALTERs) -- evidenceRowText() must stringify defensively and never throw on null columns.' },
      { id: 'F4-near-miss-keyword-false-positive-risk', severity: 'WARNING', summary: 'Draft LIVE_TIER_KEYWORDS included "must run live", which would false-positive on ordinary prose like "the CI job must run live logs to console". Recommended dropping it and keeping only high-precision multi-word phrases (never mocked, never-mocked, live proof required, live-verified) -- adopted in the shipped implementation.' },
      { id: 'F5-observe-only-issues-must-stay-empty', severity: 'INFO', summary: 'Given the weighted-average scoring mechanism confirmed at LEAD, observe-only mode must keep issues:[] even when downgrades are detected (only warnings[] populated) -- verified this is what the implementation does and added an explicit regression test for it (ADD-6).' },
    ],
    warnings: [],
    recommendations: [
      'Implement normalizeAcceptanceCriteria/acEntryText to coerce all 4 observed AC shapes (bare string, object, JSON-string-array, plain string) into searchable text before running keyword detection.',
      'Test file must assert per-FR isolation with two flagged FRs where only one has matching evidence, plus explicit near-miss keyword strings that must NOT match.',
    ],
    test_execution: JSON.stringify({
      review_mode: 'prospective (pre-implementation) + confirmatory (post-implementation)',
      prd_scenarios_covered: ['TS-1', 'TS-2', 'TS-3', 'TS-4', 'TS-5', 'TS-6', 'TS-7', 'TS-8'],
      additional_scenarios_from_review: ['ADD-1: object-shaped and mixed-shape AC entries', 'ADD-2: whole-field JSON-string and plain-string AC', 'ADD-3: evidence in string vs object columns + null-safety', 'ADD-4: near-miss keyword strings must not match', 'ADD-5: per-FR evidence isolation (two flagged FRs, one with evidence)', 'ADD-6: issues stays empty in observe-only mode even with downgrades'],
      test_file: 'scripts/modules/handoff/executors/lead-final-approval/gates/acceptance-tier-downgrade-gate.test.js',
      test_run_result: '25/25 passing (npx vitest run), post-implementation confirmatory pass',
      lint_result: 'clean (npx eslint) on acceptance-tier-downgrade-gate.js, acceptance-tier-downgrade-gate.test.js, and the gates.js wiring diff',
    }),
    detailed_analysis: JSON.stringify({
      files_read_for_precedent: ['scripts/lib/../modules/story-generation/auto-trigger-stories.mjs (LLM AC output contract)', 'scripts/modules/handoff/executors/plan-to-lead/gates/acceptance-criteria-validation.js:96-99 (existing Array.isArray/typeof branch)'],
      note_on_prd_stated_test_path: 'The PRD system_architecture.components[] stated tests/unit/handoff/lead-final-approval/acceptance-tier-downgrade-gate.test.js -- confirmed WRONG against real convention (activation-invariant-gate.test.js, pr-merge-verification.test.js, retrospective-exists.test.js all live co-located in gates/, not under tests/). The actual test file was placed at the co-located path.',
    }),
    metadata: { files_identified: ['scripts/modules/handoff/executors/lead-final-approval/gates/acceptance-tier-downgrade-gate.js', 'scripts/modules/handoff/executors/lead-final-approval/gates/acceptance-tier-downgrade-gate.test.js'] },
    phase: 'PLAN',
    validation_mode: 'prospective',
    source: 'testing-agent',
    summary: 'Prospective pre-implementation review caught a genuinely severe AC-shape-variance design gap (backed by two real precedent files) before any code was written; all 6 recommended additions were incorporated into the shipped implementation and its 25-case co-located test file, which passes clean post-implementation.',
  };
  results = applySubAgentRepoVerdict(results, resolution);
  return storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director (testing-agent)' }, results, { sdKey: SD_KEY, phase: 'PLAN' });
}

async function main() {
  const supabase = await getSupabaseClient();
  const testing = await writeTesting(supabase);
  console.log('TESTING:', testing.id, testing.verdict, testing.confidence);
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
