/**
 * One-off: write VALIDATION sub-agent evidence for the LEAD-TO-PLAN handoff of
 * SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-A.
 *
 * Manual Principal-Systems-Analyst review of the enriched SD row against its
 * parent plan (docs/plans/archived/sd-leo-orch-capa-contract-truth-001-plan.md).
 * Uses the canonical writer (storeSubAgentResults) + the canonical repo-evidence
 * helper (applySubAgentRepoVerdict) per CLAUDE.md item 11 — no hand-rolled
 * repo_path/local_path columns.
 */
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { createSupabaseServiceClient } from '../lib/supabase-connection.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-A';

async function main() {
  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  const results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 70,
    summary: 'Child A description/scope/success_criteria accurately reflect Child A of the parent CAPA plan and do not absorb sibling B/C/D scope; the ENF-17 shared-root risk is explicitly carried into scope item 1 and Success Criterion 1. One real gap: parent Success Criterion #1\'s own MEASURE requires check-claude-md-drift to run "in CI and on the regen hook" — Child A\'s Success Criterion 2 and scope item 2 wire the drift check into CI only, with no commitment to invoking/enforcing it from inside the regen-on-write hook itself. Recommend PLAN close this before PRD authorship.',
    critical_issues: [],
    warnings: [
      {
        severity: 'HIGH',
        issue: 'Parent SC#1 MEASURE requires check-claude-md-drift to run "in CI AND on the regen hook", but Child A scope item 2 / success_criteria[1] (0-indexed) commit only to CI wiring ("wired into CI"). No scope line or success criterion commits the regen-on-write hook itself to invoking/asserting zero drift as part of its own operation.',
        recommendation: 'Add an explicit scope line + success criterion (or amend existing SC2) requiring the regen hook to self-verify zero drift post-regeneration, matching the parent\'s "in CI and on the regen hook" MEASURE verbatim, before PLAN authors the PRD.'
      },
      {
        severity: 'MEDIUM',
        issue: 'Description promises regeneration runs "atomically in a worktree" but no success criterion independently measures atomicity (e.g., no partial-regen / crash-mid-regen state). SC1 only tests that regen is triggered and that it refuses to write the shared root.',
        recommendation: 'PLAN should decide whether atomicity is implicitly covered by the worktree+PR pattern (git merge is atomic) or needs its own test (e.g., simulated failure mid-regen leaves no partial file in the shared root).'
      },
      {
        severity: 'MEDIUM',
        issue: 'sd_type is "bugfix" for what is new corrective machinery (a write-triggered hook plus two refusal/enforcement paths in existing tools). This is a LEAD classification call outside VALIDATION scope, but it affects downstream LOC/PR-size norms and test-strategy expectations (e.g., default TESTING gate expectation of unit+E2E evidence) — flagging for PLAN/EXEC awareness given this SD has no UI surface for a traditional E2E user-journey test.',
        recommendation: 'PLAN should state in the PRD that test evidence for this SD is unit + CI-assertion based (no UI/E2E applicable) so the TESTING sub-agent gate is not applied against a UI E2E expectation that does not fit an infra/tooling SD.'
      }
    ],
    recommendations: [
      'Amend scope item 2 / success_criteria[1] to explicitly require drift-check invocation from the regen-on-write hook itself, not CI alone, to fully close parent SC#1.',
      'Carry forward the falsification requirement already present in success_criteria[1].measure ("a deliberately mutated section must turn the check red") into the regen-hook-invoked instance of the same check, so both invocation sites are proven non-vacuous.'
    ],
    detailed_analysis: {
      plan_source: 'docs/plans/archived/sd-leo-orch-capa-contract-truth-001-plan.md',
      child_a_declared_scope: 'regen-on-write hook plus refuse-while-stale in the drift check and the ratification writer',
      governing_parent_criterion: 'Parent Success Criterion #1: "Regeneration follows every database write to leo_protocol_sections and the drift check refuses while stale... MEASURE: check-claude-md-drift run in CI and on the regen hook, asserting 0 drifted sections; a stale render blocks the ratification writer with a named refusal."',
      checks: {
        description_matches_child_a_scope_without_absorbing_siblings: {
          verdict: 'PASS',
          note: 'Description covers regen-on-write, worktree/PR-not-root (ENF-17), drift-check refusal, ratification-writer named refusal, and same-PR CI assertion of the preventive. No mention of Child B (N-target marker / manifest-hash verification), Child C (F7 section 601/611 moves, one-claim definition), or Child D (ratification ledger columns) — scope explicitly lists these as OUT OF SCOPE by name.'
        },
        success_criteria_measurable_with_real_instruments: {
          verdict: 'PASS',
          note: 'All 4 criteria name concrete instruments (specific tests driving a section write / staling a render / calling markRatificationEncoded; a CI job with a falsification requirement; a CI workflow run-conclusion check that explicitly excludes continue-on-error as satisfying). None merely restates its own criterion text as the MEASURE.'
        },
        shared_root_risk_reflected: {
          verdict: 'PASS',
          note: 'Parent Risks section ("the hook must regenerate in a worktree and land by PR, never in the root, ENF-17 precedent") is carried near-verbatim into scope item 1 and into success_criteria[0], including a dedicated worktree-or-refuse test requirement.'
        },
        drift_check_dual_invocation_site: {
          verdict: 'GAP',
          note: 'Parent MEASURE names two invocation sites for check-claude-md-drift ("in CI and on the regen hook"). Child A currently commits only to the CI site. This is the one place the enrichment appears to undershoot its governing parent criterion rather than merely decompose it.'
        }
      }
    },
    metadata: {
      sd_key: SD_KEY,
      reviewed_fields: ['title', 'description', 'scope', 'success_criteria', 'strategic_objectives', 'key_principles', 'rationale'],
      parent_sd_key: 'SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001',
      governing_parent_criterion_index: 0,
    },
  };

  applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });

  const stored = await storeSubAgentResults('VALIDATION', SD_KEY, null, results, { phase: 'LEAD', sdKey: SD_KEY });
  console.log('Stored VALIDATION evidence row:', stored.id, 'verdict:', stored.verdict);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exitCode = 1;
});
