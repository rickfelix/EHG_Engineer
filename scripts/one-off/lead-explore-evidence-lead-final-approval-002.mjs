#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-FIX-LEAD-FINAL-APPROVAL-002, LEAD-TO-PLAN phase.
 *
 * Records the discovery work actually performed: locating the existing lead-final-approval gate
 * files (one-gate-per-file convention), the gates.js registration pattern, checking for a
 * collision with the active sibling SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G, and confirming the
 * existing lib/sd-fields/unpopulated.js primitive is already proven at LEAD-TO-PLAN (disclosure
 * only) but never wired as a blocking consumer at LEAD-FINAL-APPROVAL.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-LEAD-FINAL-APPROVAL-002';

const findings = [
  {
    id: 'gate-file-convention-confirmed',
    severity: 'INFO',
    summary: 'scripts/modules/handoff/executors/lead-final-approval/gates/ holds one file per gate, naming <kebab-name>-gate.js (or a bare noun phrase, e.g. smoke-test-gate.js), with a colocated <same-name>.test.js when a test exists. Export shape confirmed via phantom-test-audit-gate.js:26-103 and acceptance-tier-downgrade-gate.js: export function create<Name>Gate(supabase, [prdRepo]) returning { name: GATE_NAME, validator: async (ctx) => ({ passed, score, max_score, issues, warnings, details }), required: true }.',
  },
  {
    id: 'gates-js-registration-pattern',
    severity: 'INFO',
    summary: 'gates.js imports each gate factory near the top (e.g. :48 createAutomatedUatGate, :89 createAcceptanceTierDowngradeGate) and registers it inside getRequiredGates(supabase, prdRepo, sd) via a one-line comment naming the SD that added it, immediately followed by gates.push(create<Name>Gate(...)) (e.g. :2007 automated UAT gate, :2025 acceptance-tier downgrade gate, :2056 activation invariant gate -- the current last entry). Gates array returned at :2086.',
  },
  {
    id: 'no-collision-with-active-sibling-capa-gate-evidence-001-g',
    severity: 'INFO',
    summary: 'Local branch feat/SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G exists (local-only, not pushed, no open PR). git diff HEAD..G -- gates.js is EMPTY: the G branch does not touch gates.js at all. Its changes are confined to index.js (deriveCanonicalLfaFields/deriveReconciledLfaFields around bypass-metadata stamping) -- a different, unrelated concern (who authored the evidence, not whether a completion criterion was ever measured). No collision on the file this SD adds a gate registration to.',
  },
  {
    id: 'unpopulated-sentinel-already-proven-but-never-a-blocking-consumer',
    severity: 'HIGH',
    summary: 'lib/sd-fields/unpopulated.js exports classifyEntry(entry, valueKey) and VALUE_KEY_BY_FIELD ({success_criteria:"measure", key_changes:"impact", success_metrics:"target"}), built by SD-LEO-INFRA-STRUCTURED-FIELDS-HONEST-001. Already imported at scripts/modules/handoff/executors/lead-to-plan/gates/placeholder-content.js:24 and run over success_criteria.measure at LEAD-TO-PLAN -- but that gate\'s blocking predicate reads the LABEL side (criterion vs template regexes) only; the classifyEntry-on-measure output is explicitly commented "FR-4: disclosure only -- never affects pass" (placeholder-content.js:257). Zero hits for success_criteria anywhere under scripts/modules/handoff/executors/lead-final-approval/. The primitive this SD needs is proven and already imported elsewhere in the codebase; it has simply never been wired as a BLOCKING consumer at the final-approval stage, which is exactly the bookend this SD adds.',
  },
  {
    id: 'observe-only-precedent-for-a-new-gate-with-fleet-wide-blast-radius',
    severity: 'HIGH',
    summary: 'gates/acceptance-tier-downgrade-gate.js ships observe-only by default behind an env-var *_BINDING=true flip, always scoring 100/max_score:100, naming every finding in warnings[] without ever blocking unless explicitly bound. validation-agent independently measured that an unconditional ANY-entry-blocks version of this SD\'s proposed gate would immediately block 24 of 52 (46%) live non-terminal SDs -- including this SD itself (3/3 success_criteria entries were [UNPOPULATED] before LEAD corrected them). Mirroring the acceptance-tier-downgrade-gate.js observe-only pattern is the only shape that adds real visibility without breaking the fleet on merge.',
  },
  {
    id: 'no-duplicate-or-overlapping-open-sd',
    severity: 'INFO',
    summary: 'Searched strategic_directives_v2/issue_patterns/feedback/git log for "success_criteria measured", "[UNPOPULATED]" + "LEAD-FINAL-APPROVAL", "completion_pending_acceptance", "DONE-PENDING". Only this SD\'s own scope matches. SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001 (parent, children A-H, child G active) is the implementation vehicle for the SAME ratification 6c263823 but targets sub_agent_execution_results provenance grading -- a different mechanism (who authored evidence) than this SD (was a stated completion criterion ever measured at all). Adjacent, not duplicate.',
  },
];

const warnings = [
  'F-4 (from validation-agent, carried forward): the root producer defect is still live -- SD-FDBK-ENH-MINT-PIPELINE-WRITES-001 was supposed to stop new SDs from being minted with [UNPOPULATED] measures, but 88 of 226 SDs (39%) minted since it completed still carry the sentinel, including this SD itself at creation time and all ten SD-MICHAEL-ROLE-FORMALIZATION-002-B..J children. This SD\'s consumer-side visibility gate does not fix that producer-side leak; it is a separate, already-existing SD\'s regression, worth its own follow-up ticket.',
  'F-5 (from validation-agent, carried forward): the sentinel-detection gate is a narrowed, PARTIAL remediation. It catches the literal [UNPOPULATED] string only -- a hand-written but still-unverified measure (e.g. "the stage-23 walk passed" with zero real uat_test_runs rows) would pass this gate while still reproducing the ORIGINAL QF\'s full concern (an evidence-artifact pointer that never resolves to a real, provenance-backed row). Full resolution of that concern needs a strategic_directives_v2.status schema migration (verified live 9-value CHECK constraint) and producer/run-id/hash columns on the relevant evidence tables -- both explicitly out of scope for this SD per LEAD\'s scope-reduction call.',
];

const recommendations = [
  'PLAN should author the new gate as scripts/modules/handoff/executors/lead-final-approval/gates/success-criteria-unpopulated-gate.js, factory create<Name>Gate(supabase, prdRepo), classifying only success_criteria (not key_changes/success_metrics -- out of scope) via classifyEntry(entry, "measure"), flagging only the "unpopulated" verdict (not "legacy_filler" -- that class has its own already-ratified, deliberately-narrow blocking rule elsewhere; relitigating it is out of scope here).',
  'PLAN should require the gate observe-only (passed:true, score:100/max_score:100) unless an explicit env var (mirroring *_BINDING=true) is set, with every offending SD/criterion-index/criterion-text named in warnings[] regardless of binding state.',
  'PLAN should include gate-result-schema.js compatibility in the acceptance criteria (return both max_score and maxScore per the sibling files\' pattern; passed is the load-bearing key ValidationOrchestrator.js reads, per validation-agent\'s F-7).',
  'PLAN should NOT attempt the full evidence-artifact-pointer resolution, the completion_pending_acceptance status value, or any schema migration in this SD -- explicitly deferred, with the reason (450+ call-site blast radius on strategic_directives_v2.status) recorded in the PRD.',
];

const summary = 'Explore-phase discovery for SD-LEO-FIX-LEAD-FINAL-APPROVAL-002 located the exact one-gate-per-file convention and gates.js registration pattern to follow, confirmed no collision with the active sibling SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G (different files touched), and found the load-bearing precedent: lib/sd-fields/unpopulated.js\'s classifyEntry/VALUE_KEY_BY_FIELD is already proven and already imported at LEAD-TO-PLAN for disclosure only -- this SD\'s entire deliverable is wiring that same, already-tested primitive as an observe-only BLOCKING-capable consumer at LEAD-FINAL-APPROVAL, mirroring acceptance-tier-downgrade-gate.js\'s env-flip pattern so it does not break the 46% of the live fleet independently measured (by validation-agent) to currently carry an unpopulated or legacy-filler success_criteria entry.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 92,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'scripts/modules/handoff/executors/lead-final-approval/gates.js',
        'scripts/modules/handoff/executors/lead-final-approval/gates/acceptance-tier-downgrade-gate.js',
        'scripts/modules/handoff/executors/lead-final-approval/gates/acceptance-tier-downgrade-gate.test.js',
        'scripts/modules/handoff/executors/lead-to-plan/gates/placeholder-content.js',
        'lib/sd-fields/unpopulated.js',
      ],
      git_commands: [
        'git branch -a | grep -i capa-gate-evidence',
        'git diff HEAD..feat/SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G -- gates.js',
        'gh pr list --search "CAPA-GATE-EVIDENCE-001-G"',
      ],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
