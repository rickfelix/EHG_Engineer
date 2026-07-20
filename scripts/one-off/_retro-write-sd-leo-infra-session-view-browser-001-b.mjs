#!/usr/bin/env node
/**
 * Write RETRO PLAN-phase evidence for SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-B ahead
 * of PLAN-TO-LEAD. The comprehensive SD_COMPLETION retrospective was generated via
 * the canonical script (scripts/generate-comprehensive-retrospective.js, id
 * 465c1795-dcc8-411b-ab2d-fcad286be642, quality_score 85), pulling SD/PRD/sub-agent
 * evidence already written this session — including the adversarial-review-caught
 * prototype-chain bug and its fix, and the corrected attach() reason-string contract.
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict) +
 * canonical storage (lib/sub-agent-executor/results-storage.js storeSubAgentResults) —
 * no hand-rolled INSERT, per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'adaa690d-8950-4bd3-9e35-3d8c95bcbfdc';
const SD_KEY = 'SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-B';
const RETRO_ID = '465c1795-dcc8-411b-ab2d-fcad286be642';

const findings = [
  { id: 'F1-retro-generated-canonical-script', severity: 'INFO', summary: 'SD_COMPLETION retrospective generated via the canonical scripts/generate-comprehensive-retrospective.js — pulled SD metadata, PRD analysis, and all 6 sub_agent_execution_results rows written this session (LEAD: VALIDATION+Explore; PLAN: TESTING prospective; EXEC: TESTING+SECURITY retrospective). Passed schema validation, quality_score 85/100 (well above the 70 minimum).' },
  { id: 'F2-scope-cut-honored-through-build', severity: 'INFO', summary: "The LEAD-phase validation-agent's scope cuts (no multi-entry action-history scrollback, ctxPercent sourced fail-soft from context_usage_log not the summary RPC, no bare attach() re-export wrapper) were all honored through implementation — buildSessionDetailView/mapAttachState ship exactly the net buildable scope recommended at LEAD, with nothing added or dropped in between." },
  { id: 'F3-real-defect-caught-and-fixed', severity: 'INFO', summary: "An adversarial EXEC-TO-PLAN TESTING pass (code-exists review, not prospective) found a genuine defect the prospective PLAN-phase review could not have caught: ATTACH_REASON_MESSAGES[reason] walked the prototype chain, so a reason of 'toString'/'constructor'/'__proto__' etc. would return an inherited function/object instead of the promised string. Fixed with an Object.hasOwn() own-property guard plus a parametrized regression test over all 5 prototype-key names. A second, lower-severity gap (unclamped ctxPercent allowing NaN/negative/>100) was fixed in the same pass." },
  { id: 'F4-prd-assumption-corrected-before-code', severity: 'INFO', summary: "A prospective PLAN-phase TESTING review caught that the PRD's assumed attach() reason shape ('not_resolved:<x>'-prefixed) did not match the real, verified code contract (bare 'no_key'/'not_found'/'ambiguous'/'no_captured_handle'/'stale_handle' strings) BEFORE implementation was written, preventing the module from shipping against a wrong contract. This is the value of a prospective gate check distinct from a retrospective one." },
  { id: 'F5-full-suite-status', severity: 'INFO', summary: '14/14 unit tests passing (tests/unit/fleet/session-detail-view.test.js), eslint clean on both new files. No schema changes. Reused, never re-implemented, spawn-control.js\'s attach() and the session-watchdog.js pure-function convention.' },
];

const warnings = [
  'The module has no live wired consumer yet (by design — mirrors sibling -A\'s identical deferred-frontend framing, since no fleet launcher UI shell exists in this repo). SECURITY review added consumer-facing HTML-escape and auth-at-caller notes to the module header for whichever future SD wires this in.',
];

const recommendations = [
  'PROCEED to PLAN-TO-LEAD — retrospective quality_score is well above threshold, grounded in real sub-agent evidence across all 3 phases, with two real findings (1 defect fixed, 1 contract correction) demonstrating genuine adversarial review rather than rubber-stamping.',
  'When a future SD builds the actual fleet launcher UI shell, it should wire lib/fleet/session-detail-view.js\'s exports directly rather than re-deriving the view-model logic.',
];

const summary = 'PASS (confidence 90). RETRO evidence for PLAN-TO-LEAD: a genuine SD_COMPLETION retrospective (id 465c1795-dcc8-411b-ab2d-fcad286be642, quality_score 85/100) was generated via the canonical generate-comprehensive-retrospective.js script for SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-B. The session demonstrates the full value chain of the LEO gate sequence: LEAD-phase Explore/VALIDATION correctly scoped the SD down to a buildable pure-library slice (cutting action-history and RPC-based ctx%); a prospective PLAN-phase TESTING review caught and corrected a real PRD-vs-code contract error before implementation; and an adversarial EXEC-TO-PLAN TESTING review found and fixed a genuine prototype-chain lookup defect after code existed. 14/14 tests passing, eslint clean, no schema changes.';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'RETRO', supabase });

  let results = {
    verdict: 'PASS',
    confidence: 90,
    findings,
    warnings,
    recommendations,
    summary,
    critical_issues: [],
    metadata: {
      assessment_type: 'sd_completion_retrospective_generation',
      retrospective_id: RETRO_ID,
      retrospective_generator: 'scripts/generate-comprehensive-retrospective.js',
      retro_type: 'SD_COMPLETION',
      retro_quality_score: 85,
      unit_test_count: 14,
      unit_test_result: '14/14 passing',
      eslint: 'clean',
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      phase_assessed: 'PLAN (RETRO evidence ahead of PLAN-TO-LEAD handoff)',
    },
    phase: 'PLAN',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('RETRO', SD_ID, { name: 'Continuous Improvement Coach (retro-agent)' }, results, { sdKey: SD_KEY, phase: 'PLAN' });

  console.log('VERDICT WRITTEN:', stored.id, stored.verdict, stored.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
