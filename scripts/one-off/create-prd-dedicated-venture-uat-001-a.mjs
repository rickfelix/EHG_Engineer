#!/usr/bin/env node
// SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A -- PLAN phase PRD creation.
// Uses the canonical createPRDWithValidatedContent() helper (scripts/prd/prd-creator.js)
// per CLAUDE_PLAN.md's "generate first, then insert" inline-mode pattern, incorporating
// the VALIDATION sub-agent's LEAD-TO-PLAN findings (regex hazard, 2-repos-1-database
// scoping, reuse guidance, negative-control-as-assertion).
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { createPRDWithValidatedContent } from '../prd/prd-creator.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A';
const SD_UUID = '97447674-35bb-4af1-ba65-089f76beee08';
const PRD_ID = 'PRD-SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A';
const PRD_TITLE = 'Census + Negative-Control Instrument for Stage 21-26 Renumber';

const llmContent = {
  executive_summary: 'Deliver a table-data-aware census instrument sweeping 2 repos and 1 shared database for stage 21-26 literals, proven via a non-zero-exit negative control against the live stage 21/22 component_path swap.',

  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Enumerate every named surface where stage numbers 21-26 can be spelled out literally, across both filesystem repos and the shared database',
      description: 'The instrument sweeps: both repo trees (EHG_Engineer + sibling ehg) code/docs/CI; information_schema stage-bearing columns on ventures, venture_stages, eva_stage_gate_attempts, venture_stage_transitions; jsonb metadata paths (gating_decision, stage_ratification, outreach ruling); pg_proc function bodies; views/matviews; array-typed columns (venture_stages.depends_on, lifecycle_phases.stages, chairman_dashboard_config.hard_gate_stages); leo_protocol_sections; CLAUDE_*.md; GHA workflow args; e2e fixtures. Each surface produces an explicit row count in the output.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: Census output lists every one of the ~10 named surfaces with an explicit count',
        'AC-2: A surface with zero findings states 0 explicitly rather than being omitted from output',
        'AC-3: Re-running the instrument against an unchanged corpus reproduces identical counts'
      ]
    },
    {
      id: 'FR-2',
      requirement: 'Assert the known-live stage 21/22 negative control as a hard, non-zero-exit check, not a manual eyeball review',
      description: 'The instrument must detect BOTH venture_stages rows carrying the deliberate stage 21/22 component_path swap from database/migrations/20260607_swap_stage_21_22_full_content.sql (stage_number=21 -> component_path=\'Stage22DistributionSetup.tsx\'; stage_number=22 -> component_path=\'Stage21VisualAssets.tsx\'). If either row is absent from the findings, the instrument process exits non-zero.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: Instrument process.exit(1) when either known-live mismatch row is missing from its own findings',
        'AC-2: Instrument process.exit(0) with both rows present in a normal run against the live database',
        'AC-3: A dedicated unit test simulates the missing-row case and asserts the non-zero exit'
      ]
    },
    {
      id: 'FR-3',
      requirement: 'Forbid \\d/\\w/\\s/\\m/\\M regex escapes in every SQL-embedded pattern the instrument uses; bracket classes only',
      description: 'A live VALIDATION probe on this SD (sub_agent_execution_results id d9679646-dd38-44b6-8cd5-d8d7fb3c9e68) reproduced a naive regexp_match(text, \'Stage(\\\\d+)\') silently returning 0 rows on a corpus known to contain 2 matches, while the [0-9] bracket-class equivalent correctly matched. The mechanism is undetermined; the reproducible failure is not. Every SQL-embedded regex in this instrument must use bracket classes (e.g. [0-9]) exclusively.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: grep of the instrument source for SQL-embedded regex literals finds zero \\d/\\w/\\s/\\m/\\M escapes',
        'AC-2: A self-test reproduces the hazard on a fixture (asserts a naive \\d pattern fails to match while [0-9] succeeds), documenting why the constraint exists',
        'AC-3: Code review checklist item added: any new SQL-embedded regex must pass the bracket-class-only rule before merge'
      ]
    },
    {
      id: 'FR-4',
      requirement: 'Classify every finding as generated-from-SSOT or hand-written',
      description: 'Two stage-number surfaces (venture_stages.stage_number and lifecycle_stage_config.stage_number) are already regenerable from a source-of-truth script (scripts/generate-stage-config.cjs). Findings that a regen script would auto-correct are labeled generated-from-SSOT; findings requiring manual intervention (e.g. hardcoded literals in application code, migration files, protocol docs) are labeled hand-written.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: Every row in the committed census carries exactly one of the two classification labels',
        'AC-2: The classification rationale (which regen script, or why manual) is stated per finding, not just the label'
      ]
    },
    {
      id: 'FR-5',
      requirement: 'Commit the census as a durable, re-runnable document under docs/audits/ following the established scripts/audits/* -> docs/audits/*-census.md convention',
      description: 'The committed markdown document carries a Generated timestamp, this SD key, the literal re-run command, and the full per-surface breakdown with classifications. This is the artifact Child B (SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B) cites as its blast-radius contract before writing any renumber DDL.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: File exists under docs/audits/ with a filename ending in -census.md',
        'AC-2: Document header contains a Generated timestamp, the SD key, and the literal re-run command',
        'AC-3: Document is committed to the branch (not left as an uncommitted local artifact)'
      ]
    },
    {
      id: 'FR-6',
      requirement: 'Reuse existing instruments and helpers rather than rebuilding them from scratch',
      description: 'scripts/audit-stage-classifier-sets.mjs (its own header explicitly defers cross-repo findings to this SD) supplies the regex set and code walker for EHG_Engineer; lib/repo-paths.cjs resolveRepoPath resolves the sibling ehg repo path; scripts/rls/literal-email-policy-sweep.mjs is the precedent for the pg_catalog/information_schema half. The new instrument extends these rather than duplicating their logic.',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'AC-1: The instrument imports or directly extends scripts/audit-stage-classifier-sets.mjs\'s regex set rather than redefining an equivalent one',
        'AC-2: Sibling-repo path resolution goes through lib/repo-paths.cjs resolveRepoPath, not a hardcoded path'
      ]
    },
    {
      id: 'FR-7',
      requirement: 'Explicitly scope and label the census as 2 filesystem repos plus 1 shared database, never as 2 separate databases',
      description: 'VALIDATION measured that createDatabaseClient(\'engineer\') and createDatabaseClient(\'ehg\') resolve to the identical Postgres instance (same host, same database, identical row counts, identical stage-column type histogram, identical pg_proc count). The instrument must connect once via a single resolved DB client for the database sweep, and the committed census document must state the topology explicitly to prevent a future reader double-counting or attempting a phantom second-database sweep.',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'AC-1: The database sweep in the instrument source connects via one client, not two independent connections treated as separate databases',
        'AC-2: The committed census document states "2 repos, 1 shared database" explicitly in its scope section'
      ]
    }
  ],

  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'All SQL-embedded regular expressions in the instrument use POSIX bracket classes only ([0-9], [a-zA-Z]) -- \\d, \\w, \\s, \\m, \\M are prohibited',
      rationale: 'A naive \\d-based regexp_match was independently reproduced live, twice in this program, silently returning zero findings on a corpus known to contain matches. A census that finds nothing is otherwise indistinguishable from a census that works.'
    },
    {
      id: 'TR-2',
      requirement: 'Database access goes through the existing createDatabaseClient() connection helper (lib/supabase-connection.js), never a new ad hoc client',
      rationale: 'The engineer and ehg client aliases already resolve to the same Postgres instance via this helper; introducing a second connection path risks accidental double-counting or divergent connection semantics.'
    },
    {
      id: 'TR-3',
      requirement: 'Sibling-repo filesystem resolution goes through lib/repo-paths.cjs resolveRepoPath(), which fails loudly (throws) rather than silently returning an empty tree when the sibling repo cannot be located',
      rationale: 'A silent skip on an unresolved repo path would produce a false "0 findings" for that repo, exactly the failure mode this SD exists to prevent (per the DESIGN sub-agent\'s own warning during PRD generation: "an empty/wrong tree yields zero violations and must not pass as green").'
    },
    {
      id: 'TR-4',
      requirement: 'The instrument is a standalone, idempotent Node.js CLI script under scripts/audits/, re-runnable without side effects (no schema DDL, no data mutation)',
      rationale: 'This SD is a pure census -- it must never itself alter venture_stages or any swept table, since Child B (the actual renumber migration) is a separate, chairman-gated SD.'
    }
  ],

  system_architecture: {
    overview: 'A single Node.js CLI script sweeps both filesystem repos and the one shared Postgres database for every literal reference to stage numbers 21-26, asserts a hard negative control, classifies each finding, and writes a committed markdown census document.',
    components: [
      {
        name: 'CorpusWalker',
        responsibility: 'Filesystem sweep of both repo trees (code, docs, CI, e2e fixtures), reusing scripts/audit-stage-classifier-sets.mjs\'s regex set and extending it cross-repo via lib/repo-paths.cjs resolveRepoPath',
        technology: 'Node.js, fs/path traversal'
      },
      {
        name: 'DbSweeper',
        responsibility: 'information_schema, jsonb metadata path, pg_proc body, view/matview, and array-column queries against the single shared Postgres instance, using bracket-class-only regex throughout',
        technology: 'Node.js + existing createDatabaseClient() helper (lib/supabase-connection.js), raw SQL via pg'
      },
      {
        name: 'NegativeControlAsserter',
        responsibility: 'Hard-coded assertion that the 2 known-live component_path mismatch rows (stage 21/22) appear in the merged findings; process.exit(1) if either is missing',
        technology: 'Node.js'
      },
      {
        name: 'ClassificationEngine',
        responsibility: 'Labels each finding generated-from-SSOT (auto-fixable by scripts/generate-stage-config.cjs regen) or hand-written (requires manual follow-up)',
        technology: 'Node.js'
      },
      {
        name: 'CensusReportWriter',
        responsibility: 'Renders the committed docs/audits/*-census.md document with a Generated timestamp, the SD key, the literal re-run command, and the full per-surface breakdown',
        technology: 'Node.js, markdown templating'
      }
    ],
    data_flow: 'CorpusWalker and DbSweeper independently enumerate findings across their respective surfaces -> results are merged into one per-surface finding list -> NegativeControlAsserter validates the 2 known-live rows are present (exits non-zero otherwise) -> ClassificationEngine labels each finding -> CensusReportWriter commits the markdown document under docs/audits/.',
    integration_points: [
      'scripts/audit-stage-classifier-sets.mjs (existing regex set + code walker, extended cross-repo per its own deferred-scope header)',
      'lib/repo-paths.cjs resolveRepoPath (sibling ehg repo resolution)',
      'lib/supabase-connection.js createDatabaseClient (single shared Postgres instance)',
      'docs/audits/ census document convention (5 existing precedent pairs)'
    ]
  },

  test_scenarios: [
    {
      id: 'TS-1',
      scenario: 'Negative control detects both known-live component_path mismatches',
      test_type: 'integration',
      given: 'The live database with the stage 21/22 component_path swap already applied (from 20260607_swap_stage_21_22_full_content.sql)',
      when: 'The instrument\'s negative-control check runs against the live corpus',
      then: 'Both known mismatch rows (stage 21 -> Stage22DistributionSetup.tsx; stage 22 -> Stage21VisualAssets.tsx) appear in the findings and the process exits 0'
    },
    {
      id: 'TS-2',
      scenario: 'Negative control fails loudly when a known-live mismatch is missing from findings',
      test_type: 'unit',
      given: 'A stubbed findings list with one of the two known-live mismatch rows deliberately omitted',
      when: 'NegativeControlAsserter runs against the stubbed findings',
      then: 'The function signals a non-zero exit / throws, rather than silently passing'
    },
    {
      id: 'TS-3',
      scenario: 'Bracket-class regex correctly matches where a naive \\d pattern silently fails',
      test_type: 'unit',
      given: 'A text fixture containing "Stage22DistributionSetup.tsx" and "Stage21VisualAssets.tsx"',
      when: 'The fixture is matched with the instrument\'s [0-9] bracket-class pattern versus a naive \\d pattern run in the same SQL context as the reproduced hazard',
      then: 'The bracket-class pattern matches both known-live strings; the naive \\d pattern is documented (via the self-test) as the one that silently failed in the original VALIDATION reproduction'
    },
    {
      id: 'TS-4',
      scenario: 'Full corpus sweep enumerates every named surface with an explicit count',
      test_type: 'e2e',
      given: 'The full corpus (both repo trees + the one shared database)',
      when: 'The census instrument runs end-to-end',
      then: 'Every one of the ~10 named surfaces appears in the output with an explicit count, including surfaces expected to yield 0 (e.g. e2e fixtures)'
    },
    {
      id: 'TS-5',
      scenario: 'Sibling repo resolution failure is loud, not silent',
      test_type: 'integration',
      given: 'A misconfigured or missing sibling ehg repo checkout',
      when: 'CorpusWalker attempts to resolve the sibling repo path via lib/repo-paths.cjs resolveRepoPath',
      then: 'The instrument throws a clear, actionable error rather than silently skipping that repo\'s sweep and reporting a false "0 findings"'
    },
    {
      id: 'TS-6',
      scenario: 'Generated-vs-handwritten classification is correct for a known SSOT-generated column',
      test_type: 'unit',
      given: 'A finding on venture_stages.stage_number, which is regenerable via scripts/generate-stage-config.cjs',
      when: 'ClassificationEngine labels the finding',
      then: 'The finding is labeled generated-from-SSOT, not hand-written'
    },
    {
      id: 'TS-7',
      scenario: 'Committed census document is reproducible via its own documented re-run command',
      test_type: 'integration',
      given: 'A committed docs/audits/*-census.md document from a prior run',
      when: 'The literal re-run command stated in the document header is executed against an unchanged corpus',
      then: 'The regenerated output matches the committed counts (or any diff is explainable by a genuine corpus change since the last commit)'
    }
  ],

  acceptance_criteria: [
    'The instrument exits non-zero if either of the 2 known-live negative-control mismatch rows is absent from its findings',
    'The census output states an explicit count for every one of the ~10 named surfaces, including 0 where a surface has no findings',
    'A markdown census document is committed under docs/audits/ with a Generated timestamp, this SD key, and the literal re-run command',
    'Every finding in the committed census carries an explicit generated-from-SSOT or hand-written classification label',
    'Zero occurrences of \\d/\\w/\\s/\\m/\\M escapes exist in any SQL-embedded regex within the instrument source'
  ],

  risks: [
    {
      risk: 'A SQL-embedded regex using \\d/\\w/\\s escapes silently returns 0 findings instead of erroring, producing a census that reads as clean while being blind (the exact hazard VALIDATION reproduced live on this SD)',
      probability: 'MEDIUM',
      impact: 'HIGH',
      mitigation: 'Mandate bracket-class-only regex (TR-1/FR-3) and ship a self-test (TS-3) that reproduces the hazard on a known fixture, so the constraint is enforced by a running test rather than a code-review convention alone',
      rollback_plan: 'No schema or runtime impact to roll back -- this is a read-only census instrument; a defective regex is fixed by editing and re-running the script, with no data consequence'
    },
    {
      risk: 'The sibling ehg repo is not checked out at the expected relative path on a given machine or CI runner, causing that repo\'s sweep to silently return 0 findings',
      probability: 'MEDIUM',
      impact: 'HIGH',
      mitigation: 'Route all sibling-repo resolution through lib/repo-paths.cjs resolveRepoPath (TR-3), which fails loudly rather than degrading to an empty tree; verified by TS-5',
      rollback_plan: 'No data impact -- fix the repo path configuration and re-run the instrument'
    },
    {
      risk: 'The "dual-repo" framing in the original SD language is misread as "2 databases", causing a future maintainer to build a redundant second-database sweep or double-count findings that exist once in a shared instance',
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'FR-7 requires the instrument to connect once via a single resolved DB client and the committed document to state "2 repos, 1 shared database" explicitly, per VALIDATION\'s measured finding that the engineer/ehg client aliases resolve to the identical Postgres instance',
      rollback_plan: 'Documentation-only risk -- correct the census document wording and re-commit; no code or data change required'
    },
    {
      risk: 'The committed census becomes stale immediately after commit as new code/schema changes introduce fresh stage-21-26 literals, giving false confidence that the corpus is fully known',
      probability: 'HIGH',
      impact: 'LOW',
      mitigation: 'The census document commits its own literal re-run command (FR-5/AC-2) so re-verifying freshness is one command away; the document is explicitly scoped as a point-in-time artifact, not a permanent guarantee',
      rollback_plan: 'N/A -- re-run the instrument and re-commit an updated census when needed; no rollback semantics apply to a documentation artifact'
    }
  ],

  implementation_approach: {
    phases: [
      {
        phase: 'Phase 1: Corpus walker + DB sweeper',
        description: 'Build CorpusWalker (extending scripts/audit-stage-classifier-sets.mjs cross-repo via lib/repo-paths.cjs) and DbSweeper (information_schema + jsonb + pg_proc + view/array queries via the existing createDatabaseClient helper), producing raw per-surface findings with explicit counts including zeros',
        deliverables: ['Raw per-surface finding list covering all ~10 named surfaces', 'Explicit 0-counts for empty surfaces']
      },
      {
        phase: 'Phase 2: Negative-control assertion + classification',
        description: 'Implement NegativeControlAsserter (hard non-zero-exit check for the 2 known-live component_path mismatches) and ClassificationEngine (generated-from-SSOT vs hand-written labeling)',
        deliverables: ['Non-zero-exit self-test for the negative control', 'Generated-vs-handwritten label on every finding']
      },
      {
        phase: 'Phase 3: Census document generation + commit',
        description: 'Implement CensusReportWriter to render and commit the docs/audits/*-census.md document with Generated timestamp, SD key, and re-run command',
        deliverables: ['Committed census document under docs/audits/', 'Documented, literal re-run command in the document header']
      }
    ],
    technical_decisions: [
      'Bracket-class-only regex ([0-9]) is mandated everywhere a SQL-embedded stage-number pattern is needed, never \\d/\\w/\\s/\\m/\\M, because a naive \\d probe was reproduced live returning 0 findings on a 2-row known corpus (VALIDATION sub-agent, sub_agent_execution_results id d9679646-dd38-44b6-8cd5-d8d7fb3c9e68) -- the mechanism is undetermined but the reproducible failure is not',
      'Reuse scripts/audit-stage-classifier-sets.mjs as the code-sweep base rather than rewriting a walker from scratch, since its own header explicitly defers cross-repo work to this SD',
      'Treat the census explicitly as "2 repos, 1 shared database" in both code (single DB client) and output labeling, since createDatabaseClient(\'engineer\') and createDatabaseClient(\'ehg\') were measured to resolve to the identical Postgres instance'
    ]
  },

  integration_operationalization: {
    consumers: [
      {
        name: 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B (sibling child, stage-key SSOT migration)',
        interaction: 'Cites the committed census document as its blast-radius contract before writing any stage 23-26 renumber DDL',
        frequency: 'Once, at the start of Child B\'s PLAN phase'
      },
      {
        name: 'Future chairman-supervised renumber ceremony',
        interaction: 'Re-runs the instrument via the documented re-run command to confirm the corpus has not drifted before applying the actual renumber migration',
        frequency: 'On-demand, immediately before any migration apply'
      }
    ],
    dependencies: [
      {
        name: 'Shared Postgres instance (engineer/ehg client aliases)',
        type: 'upstream',
        contract: 'Read-only queries against information_schema, pg_proc, jsonb metadata columns, views/matviews, and array-typed columns',
        failure_handling: 'Instrument fails loudly (non-zero exit) if the DB connection cannot be established; never silently reports 0 findings on a connection failure'
      },
      {
        name: 'Sibling ehg repo checkout',
        type: 'upstream',
        contract: 'Resolved via lib/repo-paths.cjs resolveRepoPath',
        failure_handling: 'Fails loudly if the sibling repo path cannot be resolved, rather than silently skipping that repo\'s sweep (TR-3, TS-5)'
      }
    ],
    data_contracts: [
      {
        contract_name: 'Census markdown document',
        schema: 'A per-surface section listing an explicit finding count (including 0) plus a generated-from-SSOT/hand-written classification per finding row',
        validation: 'Presence of a Generated timestamp header, the SD key, and the literal re-run command (FR-5)',
        versioning: 'Re-run and re-commit; git history is the version log for the document'
      }
    ],
    runtime_config: {
      environment_variables: [],
      feature_flags: [],
      deployment_considerations: 'Read-only, no schema DDL, no runtime behavior change; the instrument is a one-shot/re-runnable CLI script under scripts/audits/, not a deployed service'
    },
    observability_rollout: {
      monitoring: ['Optional future CI job could re-run the instrument and diff against the committed document; not required for this SD'],
      alerts: [],
      rollout_strategy: 'Direct commit of the instrument script and the census document; no phased rollout needed since it introduces no runtime behavior change',
      rollback_trigger: 'N/A -- no live behavior change to roll back',
      rollback_procedure: 'Revert the commit; no data or schema impact to unwind'
    }
  },

  exploration_summary: {
    files_read: [
      'database/migrations/20260607_swap_stage_21_22_full_content.sql',
      'database/migrations/20260322_stage_renumbering_blueprint_review.sql',
      'scripts/audit-stage-classifier-sets.mjs',
      'lib/repo-paths.cjs',
      'scripts/rls/literal-email-policy-sweep.mjs'
    ],
    patterns_identified: [
      'scripts/audits/* -> docs/audits/*-census.md is an established 5-pair convention for committed census documents',
      'Bracket-class-only regex is required for any SQL-embedded stage-number pattern after a live-reproduced \\d hazard (independently rediscovered twice in this program)',
      'The engineer and ehg database client aliases resolve to the same physical Postgres instance -- this is a 2-repo, 1-database sweep, not a 2-database sweep'
    ],
    key_decisions: [
      'Reuse scripts/audit-stage-classifier-sets.mjs rather than rebuild the code walker, per its own explicit cross-repo deferral to this SD',
      'Corrected the SD\'s own citation of the negative-control cause during LEAD Explore: the original text cited 20260322_stage_renumbering_blueprint_review.sql, which is chronologically impossible and never touches venture_stages; the real, deliberate, reconciled cause is 20260607_swap_stage_21_22_full_content.sql'
    ],
    exploration_date: '2026-08-25'
  }
};

async function run() {
  const supabase = createSupabaseServiceClient();

  const { data: sdData, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, scope, sd_type')
    .eq('id', SD_UUID)
    .single();
  if (sdErr) throw new Error(`fetch SD failed: ${sdErr.message}`);

  const stakeholderPersonas = ['Chairman (Solo Entrepreneur)', 'EVA (AI Chief of Staff)', 'DevOps Engineer'];

  const prd = await createPRDWithValidatedContent(
    supabase,
    PRD_ID,
    SD_KEY,
    SD_UUID,
    PRD_TITLE,
    sdData,
    llmContent,
    stakeholderPersonas
  );

  console.log('PRD created/updated:', prd.id, '| status:', prd.status, '| progress:', prd.progress);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
