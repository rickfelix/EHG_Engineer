#!/usr/bin/env node
import { pathToFileURL } from 'url';
/**
 * One-off: write PLAN-TO-LEAD RETRO evidence for
 * SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-C.
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

async function writeRetro(supabase) {
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'RETRO', supabase });
  let results = {
    verdict: 'PASS',
    confidence: 92,
    findings: [
      { id: 'F1-lesson-schema-belief-must-be-live-verified', severity: 'INFO', summary: 'This session\'s own compaction summary asserted evidence/test_execution were real columns on sub_agent_execution_results -- a belief carried forward from earlier work without re-verification. A fresh adversarial-review agent, working only from the diff + a live query, caught it. LESSON: for a shared table touched repeatedly across a long session, a live `select(\'*\').limit(1)` column check is cheap and should be the default before writing a new query against it, not an assumption inherited from memory/summary.' },
      { id: 'F2-adversarial-review-caught-a-dead-on-arrival-mechanism', severity: 'INFO', summary: "This is the 3rd deep-tier adversarial review this session, and the most consequential: the first implementation's entire cross-reference mechanism (this gate's actual purpose) was silently non-functional -- it would have shipped, passed its own (mock-hiding) tests, and done nothing. Reinforces the standing pattern (already in memory: 'ADVERSARIAL-VERIFY wins') of pasting the COMPLETE real diff into a genuinely fresh agent rather than trusting either self-review or a tool-truncated review prompt." },
      { id: 'F3-observe-only-design-worked-as-intended-even-mid-bug', severity: 'INFO', summary: 'Despite the critical column bug, the gate never would have blocked a real handoff in production -- because it shipped observe-only (score:100 always) and the bug only affected the CONTENT of a warning, not the pass/fail outcome. This validates the LEAD-phase design call to ship observe-only-by-default for a new heuristic gate on shared completion-gating infrastructure: even a real implementation defect had zero blast radius on other SDs.' },
      { id: 'F4-fail-open-error-handling-is-a-reusable-pattern', severity: 'INFO', summary: 'The fail-open (try/catch -> passing result + warning, never let an exception reach the orchestrator) pattern added to this gate is a good template for any future OBSERVE-ONLY-BY-DEFAULT gate in this directory -- activation-invariant-gate.js and other hard-requirement gates correctly fail CLOSED on lookup errors, but that is only correct for gates that are genuine compliance requirements, not best-effort heuristics.' },
    ],
    warnings: [],
    recommendations: ['Consider a repo-wide lightweight lint/CI check that flags any new .select(...) call against sub_agent_execution_results naming a column not in a known-good allowlist -- would have caught this bug at commit time instead of adversarial review.'],
    detailed_analysis: JSON.stringify({
      sd_key: SD_KEY,
      parent_sd_key: 'SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001',
      sibling_children: ['SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-A (F1)', 'SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-B (F2)'],
      timeline: ['LEAD: Explore+VALIDATION disproved the SD\'s own discovery hint, confirmed feasible design', 'PLAN: prospective testing-agent review caught AC-shape variance before code existed', 'EXEC: implementation + 25 unit tests', 'EXEC: adversarial testing-agent review found 2 CRITICAL bugs (dead evidence query, missing fail-open) + 1 WARNING (substring false-positive) -- all fixed, re-verified live, test suite grew to 32', 'EXEC-TO-PLAN: score 91'],
      commits: ['9619515479f', 'a304dd66f87', 'ef6e43cade8'],
    }),
    metadata: { files_identified: ['scripts/modules/handoff/executors/lead-final-approval/gates/acceptance-tier-downgrade-gate.js', 'scripts/modules/handoff/executors/lead-final-approval/gates/acceptance-tier-downgrade-gate.test.js', 'scripts/modules/handoff/executors/lead-final-approval/gates.js'] },
    phase: 'PLAN',
    validation_mode: 'retrospective',
    source: 'retro-agent',
    summary: 'Clean delivery with one real, consequential catch: a live-DB-verified adversarial review found the initial implementation\'s core mechanism was dead due to nonexistent columns inherited from a stale session belief, plus a fail-open safety gap. Both fixed and re-verified before EXEC-TO-PLAN. Observe-only-by-default design meant the bug had zero production blast radius even before the fix.',
  };
  results = applySubAgentRepoVerdict(results, resolution);
  return storeSubAgentResults('RETRO', SD_ID, { name: 'Continuous Improvement Lead (retro-agent)' }, results, { sdKey: SD_KEY, phase: 'PLAN' });
}

async function main() {
  const supabase = await getSupabaseClient();
  const retro = await writeRetro(supabase);
  console.log('RETRO:', retro.id, retro.verdict, retro.confidence);
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
