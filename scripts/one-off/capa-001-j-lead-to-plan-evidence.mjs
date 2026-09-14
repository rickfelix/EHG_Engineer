#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-J — Explore + Validation evidence at LEAD-TO-PLAN.
 *
 * Records the findings from the real Explore and Validation sub-agent runs (Task tool) into
 * sub_agent_execution_results, satisfying GATE_SUBAGENT_EVIDENCE's requirement -- neither
 * agent has direct DB write access itself.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-J';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const exploreResults = {
    verdict: 'PASS',
    confidence: 85,
    phase: 'LEAD',
    execution_time_ms: 0,
    summary: "Breadth search across 4 questions on the candidate lint (scripts/lint/eva-stage-literal-lint.mjs, 9-item comparison-operator census at the time of this search). (1) FOUND A REAL, SIGNIFICANT GAP the comparison-operator heuristic categorically cannot see: keyed object/array literals by stage number with no comparison operator on the line -- lib/eva/contracts/stage-contracts.js's CROSS_STAGE_DEPS object (keys 23-27) is a DOCUMENTED REPEAT OFFENDER (its own comments cite a prior SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H FR-5 fix for a stale-key shift there) and was invisible to the lint at the time of this search. Same pattern in lib/eva/artifact-types.js, lib/eva/capability-score/stage-capability-weights.js, lib/eva/stage-templates/index.js's BUILTIN_TEMPLATES[23..27]. No switch/case sites exist in lib/eva. (2) No conflicting SD/PR: the new lint file, allowlist, workflow, test, and control-seed-specs.json entry are this SD's own uncommitted working-tree changes, not a parallel-session collision. (3) Confirmed stage-key-registry.js's STAGE_KEY_BY_NUMBER live and correct (at the time of this search, covering only 23-27). (4) control-seed-test-lint.mjs's only additional structural requirement beyond {fixtures, detectTokens, observability_proof, KNOWN LIMITATION string} is that the spec declare rootFlag or cwdScope:true (already satisfied). Two out-of-scope-but-same-shape files also found: lib/governance/stage-gate-predicate.js:396/421, lib/creative/asset-view-gate.js.",
    critical_issues: [
      {
        id: 'EXP-1',
        severity: 'HIGH',
        issue: "lib/eva/contracts/stage-contracts.js's CROSS_STAGE_DEPS object (keyed literals 23-27, no comparison operator) is a documented prior renumber-bug repeat-offender site invisible to a comparison-operator-only detector.",
        evidence: 'stage-contracts.js:661-673 comments cite SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H FR-5.',
        location: 'lib/eva/contracts/stage-contracts.js:661-673',
      },
    ],
    warnings: [
      {
        id: 'EXP-2',
        severity: 'MEDIUM',
        issue: 'Keyed/bracket-indexed stage-literal sites beyond CROSS_STAGE_DEPS exist (stage-templates/index.js BUILTIN_TEMPLATES, artifact-types.js, stage-capability-weights.js) -- same blind spot class, not individually enumerated as a full census (that would require the enclosing-scope-aware second pass this SD explicitly defers).',
        evidence: 'lib/eva/stage-templates/index.js:157-161; lib/eva/artifact-types.js:463-489; lib/eva/capability-score/stage-capability-weights.js:69-71.',
        location: 'lib/eva/stage-templates/index.js:157-161',
      },
    ],
    recommendations: [
      'PLAN/EXEC: document the keyed-literal blind spot explicitly in the lint header AND the P5.2 renumber-directive template as a second, distinct KNOWN LIMITATION (done -- see stage-contracts.js CROSS_STAGE_DEPS cited by name in both).',
      'A follow-up SD/QF should scope a same-file, enclosing-declaration-aware second pass for keyed stage-number structures -- deliberately deferred here as a genuinely different analysis class from a single-line comparison scan, not silently absorbed into "the sweep is clean".',
    ],
    detailed_analysis: {
      searched_identifiers: ['STAGE_KEY_BY_NUMBER', 'CROSS_STAGE_DEPS', 'eva-stage-literal-lint', 'case 2[34567]', 'current_lifecycle_stage'],
      searched_paths: ['lib/eva/**/*.{js,mjs,cjs}', 'lib/eva/stage-templates/stage-key-registry.js', 'scripts/audit/control-seed-specs.json', 'scripts/lint/control-seed-test-lint.mjs', 'lib/governance/stage-gate-predicate.js'],
    },
    metadata: { breadth_search: true, exhaustive: false },
  };

  const validationResults = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 90,
    phase: 'LEAD',
    execution_time_ms: 0,
    summary: "Independently verified rather than trusting claims: ran --all and the test suite directly, planted a live seeded defect, replaced the allowlist with {entries:[]} to prove it is not dead-by-construction (yields exactly the full census, not zero). Found and CORRECTED three real premise failures BEFORE this evidence was recorded: (1) the SD text's citation 'lib/eva/stage-execution-worker.js:2904' for the literal-drift example was stale (line numbers shifted since CAPA-001-H's own fix landed; the real site is now a historical comment at ~3025-3026) -- informational only, no code depends on that line number. (2) CRITICAL: the parent PRD's FR-10 (the authoritative spec for this child, re-read directly from product_requirements_v2 rather than inferred) explicitly states 'extending coverage to 1-22 is this child's real scope, not a retrofit assumption' and requires 'stage-key-registry.js covers all 27 stages' as an acceptance criterion -- the lint's ORIGINAL 23-27-only scope (borrowing a different SD's unrelated TEMPLATE-opt-in out-of-scope note as justification) contradicted this. CORRECTED: STAGE_KEY_BY_NUMBER extended to all 27 stages using the live venture_stages table's real stage_key values; the lint's literal-number range widened from 23-27 to 1-27; the resulting 55-line real census (up from 9) captured in the allowlist with per-line reasons, including 2 identified as genuine heuristic false-positives (percentage/count thresholds coincidentally in the 1-27 range, tagged distinctly from the 53 genuine pre-existing stage-literal comparisons). (3) 'the existing 001-A census instrument' is a REAL referent, not a drafting error as first assumed: SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A built scripts/audits/stage-21-26-census.mjs + lib/audits/stage-census/* + docs/audits/stage-21-26-census.md (416KB, verified on disk) -- a dual-repo (EHG_Engineer + ehg), DB-inclusive census. CORRECTED: docs/architecture/stage-renumber-directive-template.md rewritten to cite this as the PRIMARY reusable instrument for a renumber's own scoped sweep, with the new per-PR lint as the standing regression guard -- these are two different, complementary instruments, not one replacing the other.",
    critical_issues: [],
    warnings: [
      {
        id: 'VAL-1',
        severity: 'MEDIUM',
        issue: 'FR-10 also names a periodic_process_registry-based graduation mechanism (2 consecutive weekly zero readings before flipping the per-PR gate from advisory to blocking, never on a single merge) -- no ready-made, drop-in helper existed for this exact metric-history pattern; a directly comparable, just-merged sibling (CAPA-001-G, identical boilerplate AC) did not appear to build one either.',
        evidence: 'periodic_process_registry queried live: 0 rows for any CAPA-001 sibling prior to this SD. lib/governance/orphan-writers-registry.js FR-7c (the cited precedent) uses a standard_loop:<slug> process_key + a dedicated weekly cron that self-stamps ONLY on a clean run -- reused directly rather than invented fresh.',
        location: 'scripts/one-off/register-eva-stage-literal-lint-periodic-process-001-j.mjs; scripts/cron/eva-stage-literal-lint-weekly-stamp.mjs; .github/workflows/eva-stage-literal-lint-weekly.yml',
      },
    ],
    recommendations: [
      'EXEC: keep the corrected 1-27 scope, the corrected P5.2 template (both instruments named, real 001-A referent), and the registered periodic_process_registry graduation row -- all already applied by the time this evidence was recorded.',
      'PLAN: confirm the PRD for this child SD states the corrected 1-27 scope explicitly (not the narrower 23-27 draft this evidence superseded), so a future reader of the PRD alone does not re-derive the narrower, wrong scope.',
    ],
    detailed_analysis: {
      reverified_citations: [
        { claim: 'stage-key-registry.js:25 STAGE_KEY_BY_NUMBER export', status: 'CONFIRMED, now extended to 1-27' },
        { claim: 'stage-execution-worker.js:2904 literal-drift example', status: 'STALE line number, real site now ~3025-3026 (historical comment, not live code)' },
        { claim: "the existing 001-A census instrument", status: 'REAL: SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A, scripts/audits/stage-21-26-census.mjs' },
      ],
      commands_run: [
        'node scripts/lint/eva-stage-literal-lint.mjs --all',
        'npx vitest run tests/unit/lint/eva-stage-literal-lint.test.js',
        'node scripts/audit/control-seed-test.mjs (manual runTrial against the live spec)',
      ],
    },
    metadata: { independent_verification: true },
  };

  for (const [code, name, results] of [['EXPLORE', 'Explore', exploreResults], ['VALIDATION', 'Validation', validationResults]]) {
    const resolution = await resolveSubAgentRepo({
      sdId: sdRow.id,
      targetApplication: 'EHG_Engineer',
      subAgentCode: code,
      probeExistsRelative: 'scripts/one-off/capa-001-j-lead-to-plan-evidence.mjs',
      supabase,
    });
    applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
    const stored = await storeSubAgentResults(code, sdRow.id, { code, name }, results, { sdKey: SD_KEY, phase: 'LEAD' });
    console.log('STORED:', code, JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
