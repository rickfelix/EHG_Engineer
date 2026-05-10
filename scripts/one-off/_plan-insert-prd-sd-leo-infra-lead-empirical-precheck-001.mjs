// PRECHECK_EXEMPT: One-off PRD insert covering INLINE-catch-22 harness gap (SD-FDBK-INFRA-ADD-PRD-DATABASE-001) — script-side LLM did not insert the row but emitted the prompt
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sdUuid = '653364ba-cfd0-4151-9257-218d2aab3569';
const sdKey = 'SD-LEO-INFRA-LEAD-EMPIRICAL-PRECHECK-001';

const functional_requirements = [
  {
    id: 'FR-1',
    title: 'lead-precheck-helpers.js — three verification primitives',
    description: 'Implement scripts/lib/lead-precheck-helpers.js exporting three pure functions, each returning {ok: true|false|null, evidence: object}. The helpers are side-effect-free (zero supabase write calls) and idempotent.',
    acceptance_criteria: [
      'verifyOriginMainPremise({claim, witnessFile, expectedAbsent}) composes over getMainRef() from scripts/modules/handoff/shared-git-context.js — does NOT re-implement fetch/fallback chain.',
      'verifyOriginMainPremise returns {ok: null, evidence: {network_error: true, git_exit_code, stderr_first_line}} on git fetch failure — MUST NOT throw. Honors LEAD_PRECHECK_FETCH_TIMEOUT_MS env (default 5000ms) and LEAD_PRECHECK_OFFLINE_OK env gate.',
      'verifyJoinShape({leftTable, leftCol, rightTable, rightCol, supabase, sampleSize=100}) samples sampleSize rows from each side, classifies values via shape histograms (UUID regex, hex, SD-prefix, numeric, null), exports DEFAULT_JOIN_THRESHOLDS = {leftMatchMin: 0.5, rightMatchMax: 0.05}, returns {ok: true|false, evidence: {left_histogram, right_histogram, threshold_evaluation}}.',
      'verifyJoinShape accepts supabase=null parameter — returns {ok: null, evidence: {test_mode: true}} (mock-supabase contract for unit tests).',
      'verifyHelperCoverage({helperFile, table, repoRoot}) greps for from(table).insert/update/upsert call sites across lib/ and scripts/, default-excluding tests/, __tests__/, archived-*/, .worktrees/, helper file itself, canonical template, .md/.txt/node_modules/. Returns {ok: bool, evidence: {bypass_sites: string[], canonical_imports: string[], files_scanned, ms_elapsed}}.',
      'verifyHelperCoverage uses 3-axis classifier (WRITE-NOW / CLEAR-NULL / READ) with line-anchored regex per call site. ≥8 adversarial fixtures present in unit tests (template-literal table, dynamic table, comment-only, multi-line chain, nested .update inside .rpc, etc.).',
      'JSDoc on every exported function documents {ok, evidence} contract. Module exports `EVIDENCE_SCHEMAS` constant for downstream consumers.',
    ]
  },
  {
    id: 'FR-2',
    title: '_lead-enrich-template.mjs — canonical template',
    description: 'Implement scripts/templates/_lead-enrich-template.mjs as the starter for new LEAD-enrichment scripts. Imports lead-precheck-helpers, requires a populated claims[] array (one verification per claim), default-fails if any verification ok=false without explicit override.',
    acceptance_criteria: [
      'Template imports lead-precheck-helpers via static ESM import.',
      'Template requires claims[] array; empty claims[] fails the conformance test (FR-3).',
      'Default-fail-with-override pattern: if any verify returns ok=false, the template exits non-zero unless an explicit override block with rationale text is provided.',
      'Output structured to metadata.lead_evaluation.precheck_evidence (consumed by validation-agent).',
      'Template file annotated with `// PRECHECK_EXEMPT: canonical template — verifies via test fixtures` to avoid self-referential conformance failure.',
      'Worked example in JSDoc shows the pattern (one origin-main verification + one join-shape + one helper-coverage).'
    ]
  },
  {
    id: 'FR-3',
    title: 'lead-enrich-template-conformance.test.js — AST static guard',
    description: 'Implement tests/unit/lib/lead-enrich-template-conformance.test.js. Uses AST parsing (acorn or @babel/parser, NOT regex) to scan every _lead-enrich-*.mjs in the repo (via globby with explicit exclude allowlist).',
    acceptance_criteria: [
      'Scans repo-wide via globby pattern: scripts/**/_lead-enrich-*.mjs (NOT hardcoded scripts/one-off path).',
      'AST detects BOTH static `import { verifyXxx } from ...` AND dynamic `await import(...)` — uses acorn/@babel/parser, NOT regex.',
      'Asserts each scanned file (a) imports lead-precheck-helpers AND has ≥1 verify* call, OR (b) contains a `// PRECHECK_EXEMPT:` comment block.',
      'PRECHECK_EXEMPT rationale must be ≥30 chars; rubber-stamp blocklist rejects rationales matching /^(TODO|fix later|no time|temporary)$/i.',
      'Excludes the canonical template itself by allowlist.',
      'Provides a 1-line failure message per non-conforming file with file path + reason (missing-import / missing-verify-call / weak-rationale / blocklist-match).'
    ]
  },
  {
    id: 'FR-4',
    title: 'canonical-write-paths.md + JSON sidecar — writer registry',
    description: 'Create docs/reference/canonical-write-paths.md (markdown registry of {table → canonical helper, exempt_writers[]}) AND a generated docs/reference/canonical-write-paths.json sidecar with the same data. Schema-validating parser ships in scripts/lib/registry-parser.js.',
    acceptance_criteria: [
      'Markdown registry has at least 4 mandatory initial entries (feedback → emit-feedback.js, plus 3 more selected from existing canonical helpers in lib/governance/).',
      'JSON sidecar generated by registry-parser.js auto-runs whenever the .md changes (CI step or pre-commit).',
      'Parser validates each row schema-style (table name regex, helper path exists, exempt_writers[] entries are valid file paths) — fails CI if registry malformed.',
      'lead-precheck-helpers.js itself is listed in registry exempt_writers[] day-1 (avoids self-referential failure since it consumes audit_log telemetry).',
      'Registry includes one worked example with prose explaining the writer/consumer asymmetry and why the helper exists (seeds future-reader understanding).'
    ]
  },
  {
    id: 'FR-5',
    title: 'canonical-helper-bypass-guard.test.js — registry-driven bypass scan',
    description: 'Implement tests/unit/governance/canonical-helper-bypass-guard.test.js that reads the JSON sidecar registry and runs verifyHelperCoverage against each {table, helper} entry. Each bypass site must either (a) match registry exempt_writers[] or (b) cause the test to fail.',
    acceptance_criteria: [
      'Reads docs/reference/canonical-write-paths.json (NOT the .md — JSON is canonical at test-time).',
      'For each registry entry, runs verifyHelperCoverage and compares bypass_sites against exempt_writers[].',
      'Failure message lists each unexempt bypass site with file:line and recommends adding to exempt_writers[] OR refactoring to use canonical helper.',
      'Default-excludes tests/, __tests__/, archived-*/, .worktrees/, node_modules/ via verifyHelperCoverage default exclude allowlist.',
      'Exits non-zero on first registry-divergence; CI fails loudly.'
    ]
  },
  {
    id: 'FR-6',
    title: 'canonical-helper-registry-freshness.test.js — registry-freshness meta-test',
    description: 'Implement tests/unit/governance/canonical-helper-registry-freshness.test.js that independently DISCOVERS writers via grep (not registry) and asserts setEquals(discovered, registry). Closes the writer/consumer asymmetry the bypass-guard would otherwise re-create. ~80 LOC.',
    acceptance_criteria: [
      'Independently discovers writers via grep for `from(<TABLE>).insert/update/upsert` across lib/, scripts/, NOT reading the registry first.',
      'Computes set difference: discovered - registry = orphan writers (registry incomplete); registry - discovered = stale entries (registry pinned to deleted helpers).',
      'Fails loudly with diff list when sets diverge.',
      'Includes its own PRECHECK_EXEMPT annotation to avoid recursion into FR-3 conformance test.'
    ]
  },
  {
    id: 'FR-7',
    title: 'lead-precheck-helpers.test.js — unit tests for three primitives',
    description: 'Implement tests/unit/lib/lead-precheck-helpers.test.js with comprehensive coverage of all three helpers: deterministic fixtures for verifyJoinShape (ok:true / ok:false), mock-supabase (ok:null), git-fetch failure paths for verifyOriginMainPremise (ok:null + offline scenarios), 3-axis classifier coverage for verifyHelperCoverage with ≥8 adversarial fixtures.',
    acceptance_criteria: [
      'verifyOriginMainPremise: 5 cases — happy path, claim-contradicted, fetch-fail offline, fetch-timeout, missing witnessFile.',
      'verifyJoinShape: 6 cases — compatible histograms, incompatible histograms, supabase=null mock-mode, sample empty, sample single-row, threshold boundary.',
      'verifyHelperCoverage: ≥8 adversarial fixtures — template-literal table, dynamic table from variable, comment-only insert reference, multi-line chain, nested .update inside .rpc, archived/test exclusions, helper-self-reference, canonical-import detection.',
      'Uses vi.mock for @supabase/supabase-js and child_process — NEVER depends on .env at unit-test layer.',
      '100% line coverage on lead-precheck-helpers.js.'
    ]
  },
  {
    id: 'FR-8',
    title: 'Legacy migration — annotate existing _lead-enrich-*.mjs',
    description: 'Add PRECHECK_EXEMPT annotation with ≥30-char rationale to existing scripts/one-off/_lead-enrich-sd-leo-infra-wire-feedback-table-001.mjs (the only existing legacy file per VALIDATION corpus check). Forward-only migration; no retroactive backfill of premise verifications.',
    acceptance_criteria: [
      '_lead-enrich-sd-leo-infra-wire-feedback-table-001.mjs has `// PRECHECK_EXEMPT: <rationale ≥30 chars>` at file top.',
      'Rationale references the SD it was authored for, why retroactive verification is out-of-scope, and the policy of forward-only PRECHECK_EXEMPT.',
      'Conformance test (FR-3) passes against the annotated file.'
    ]
  },
  {
    id: 'FR-9',
    title: 'Staged rollout — feature flag for guard enforcement',
    description: 'Bypass-guard test (FR-5) ships in dry-run/warn-only mode for first 24-48h or behind LEAD_PRECHECK_GUARD_DISABLE feature flag. Mirrors PR-A/PR-B pattern from SESSION-IDENTITY-RECONCILIATION-001.',
    acceptance_criteria: [
      'LEAD_PRECHECK_GUARD_DISABLE=1 env makes bypass-guard test PASS with warning output (does not fail build).',
      'Default behavior (no env): test FAILS on bypass-without-exemption.',
      'Documented in canonical-write-paths.md README section: "Disabling the guard temporarily — env flag, audit trail expectations, when to use".',
      'Audit_log entry on each guard-disable invocation (category: lead_precheck_guard_disabled).'
    ]
  }
];

const technical_requirements = [
  {
    id: 'TR-1',
    title: 'Module structure',
    description: 'scripts/lib/lead-precheck-helpers.js is ESM module with named exports for verifyOriginMainPremise, verifyJoinShape, verifyHelperCoverage, EVIDENCE_SCHEMAS, DEFAULT_JOIN_THRESHOLDS. Module is side-effect-free at import time.'
  },
  {
    id: 'TR-2',
    title: 'AST parsing dependency',
    description: 'FR-3 conformance test uses acorn (already in node_modules via several existing test files) OR @babel/parser. Verify presence at scripts/prd/llm-generator.js or similar before adding new dep. Prefer acorn for ESM-first.'
  },
  {
    id: 'TR-3',
    title: 'Registry sidecar generation',
    description: 'JSON sidecar at docs/reference/canonical-write-paths.json regenerated by scripts/lib/registry-parser.js. Pre-commit hook OR npm script `npm run registry:gen` produces sidecar from .md. Sidecar is committed to repo (not gitignored).'
  },
  {
    id: 'TR-4',
    title: 'Performance budget for verifyHelperCoverage',
    description: 'verifyHelperCoverage scan budget: 5s timeout, ≤2000 files traversed (Windows-junction safety). Reports {files_scanned, ms_elapsed} in evidence object so CI can flag perf regressions.'
  },
  {
    id: 'TR-5',
    title: 'Composition over duplication',
    description: 'verifyOriginMainPremise MUST compose over getMainRef({skipFetch}) at scripts/modules/handoff/shared-git-context.js:33-70 — do NOT re-implement fetch/fallback chain. Reference VALIDATION evidence row 3b4cb9be.'
  },
  {
    id: 'TR-6',
    title: 'Reference canonical AST-guard test patterns',
    description: 'FR-3 conformance test follows the readFileSync+regex template proven in tests/unit/stderr-leak-static-guard.test.js (PR #3658) and tests/unit/lib/worktree-rmsync-junction-safety.test.js (PR #3667). Use AST-based detection NOT regex per TESTING recommendation TR-AST-002.'
  }
];

const test_scenarios = [
  {
    id: 'TS-1',
    title: 'verifyOriginMainPremise happy path',
    description: 'Given a falsifiable claim ("X helper does not exist on origin/main") and witnessFile="lib/foo.js", when origin/main contains lib/foo.js with the helper, expect ok:false with evidence.contradicting_commits[].',
    type: 'unit'
  },
  {
    id: 'TS-2',
    title: 'verifyOriginMainPremise offline degraded',
    description: 'Given network unavailable (mock child_process.spawn returns ENOTFOUND), expect verifyOriginMainPremise returns {ok: null, evidence: {network_error: true}} — MUST NOT throw.',
    type: 'unit'
  },
  {
    id: 'TS-3',
    title: 'verifyJoinShape histogram mismatch',
    description: 'Given leftCol samples are 100% UUIDs and rightCol samples are 100% sd_key strings (regex /^SD-/), expect ok:false with evidence.threshold_evaluation showing leftMatch < rightMatchMax violation.',
    type: 'unit'
  },
  {
    id: 'TS-4',
    title: 'verifyHelperCoverage 3-axis classifier — adversarial fixture',
    description: 'Given a fake source file with a template-literal `from(\\`${tableName}\\`).insert(...)` line, expect verifyHelperCoverage classifies it as bypass site (per WRITE-NOW axis) but flagged as DYNAMIC_TABLE_NAME in evidence so reviewer can decide.',
    type: 'unit'
  },
  {
    id: 'TS-5',
    title: 'AST conformance — dynamic import detection',
    description: 'Given a fake _lead-enrich-foo.mjs with `await import("../lib/lead-precheck-helpers.js")` and a verifyOriginMainPremise call, expect FR-3 test passes (dynamic-import path covered).',
    type: 'unit'
  },
  {
    id: 'TS-6',
    title: 'PRECHECK_EXEMPT rationale floor',
    description: 'Given a fake _lead-enrich-foo.mjs with `// PRECHECK_EXEMPT: TODO`, expect FR-3 test FAILS with rubber-stamp-blocklist-match error message.',
    type: 'unit'
  },
  {
    id: 'TS-7',
    title: 'Registry-freshness meta-test divergence detection',
    description: 'Given the registry .md lists 4 entries but grep discovers 5 writers (one new), expect FR-6 test FAILS with diff showing the missing entry.',
    type: 'unit'
  },
  {
    id: 'TS-8',
    title: 'Bypass-guard staged rollout',
    description: 'Given LEAD_PRECHECK_GUARD_DISABLE=1, expect FR-5 test PASSES with warning output (does not fail build).',
    type: 'unit'
  },
  {
    id: 'TS-9',
    title: 'Self-validation: re-run today\'s falsifiable LEAD-enrichment',
    description: 'End-to-end smoke test: deliberately introduce a falsifiable claim (matching today\'s C1 stale-origin-main case) into a test _lead-enrich script, run template, observe FAIL with structured evidence — proves the SD\'s premise that this WOULD have caught today\'s 3 falsified claims at LEAD pre-enrichment.',
    type: 'integration'
  }
];

const acceptance_criteria = [
  '[ ] All 9 functional requirements (FR-1 through FR-9) implemented and merged',
  '[ ] FR-7 unit tests achieve 100% line coverage on lead-precheck-helpers.js',
  '[ ] FR-3 conformance test passes against repository (existing _lead-enrich-sd-leo-infra-wire-feedback-table-001.mjs annotated per FR-8)',
  '[ ] FR-5 bypass-guard test passes with empty bypass list OR all bypass sites listed in registry exempt_writers[]',
  '[ ] FR-6 registry-freshness meta-test passes (registry matches grep-discovered writers)',
  '[ ] TS-9 self-validation smoke test passes (template would have caught today\'s C1 falsified claim)',
  '[ ] No new direct supabase.from(\'feedback\').insert() sites introduced (no regression)',
  '[ ] Vitest run passes; net-new tests must add ≥9 passing test cases',
  '[ ] Smoke test evidence section in PRD (Baseline Observation) demonstrates running canonical template and observing the expected pass/fail behavior'
];

const risks = [
  {
    id: 'R-1',
    risk: 'Conformance test breaks CI on existing _lead-enrich scripts without retroactive annotations',
    mitigation: 'Per FR-8: only 1 legacy file exists; annotate it forward-only. Per FR-9: feature flag staged rollout.',
    likelihood: 'low',
    impact: 'medium'
  },
  {
    id: 'R-2',
    risk: 'verifyOriginMainPremise hard-fails in sandbox/offline CI',
    mitigation: 'Per FR-1: 5s timeout (LEAD_PRECHECK_FETCH_TIMEOUT_MS) + return {ok:null, evidence: {network_error:true}} on failure rather than throwing. LEAD_PRECHECK_OFFLINE_OK env gate.',
    likelihood: 'medium',
    impact: 'medium'
  },
  {
    id: 'R-3',
    risk: 'verifyJoinShape sample size 100 too small for false-negative-resistant classification',
    mitigation: 'Per FR-1: DEFAULT_JOIN_THRESHOLDS exported; configurable via param. Adversarial fixtures in FR-7 cover boundary cases.',
    likelihood: 'low',
    impact: 'low'
  },
  {
    id: 'R-4',
    risk: 'verifyHelperCoverage greedy regex re-creates writer/consumer asymmetry it tries to close (R5 from RISK)',
    mitigation: 'Per FR-1: 3-axis classifier (WRITE-NOW/CLEAR-NULL/READ) with line-anchored regex. Per FR-7: ≥8 adversarial fixtures covering template-literal, dynamic, comment-only, nested-rpc cases.',
    likelihood: 'medium',
    impact: 'high'
  },
  {
    id: 'R-5',
    risk: 'Bypass-guard test alone re-creates writer/consumer asymmetry (registry can drift)',
    mitigation: 'Per FR-6: separate registry-freshness meta-test independently discovers writers, asserts setEquals(discovered, registry).',
    likelihood: 'medium',
    impact: 'high'
  },
  {
    id: 'R-6',
    risk: 'Self-referential failure: helpers using supabase.insert() for telemetry get banned by their own bypass-guard',
    mitigation: 'Per FR-4: lead-precheck-helpers.js listed in registry exempt_writers[] day-1. Documented in registry README.',
    likelihood: 'low',
    impact: 'high'
  },
  {
    id: 'R-7',
    risk: 'Test isolation: vi.mock @supabase/supabase-js and child_process required to keep unit tests deterministic and offline',
    mitigation: 'Per FR-7: explicit vi.mock for both — never depend on .env at unit-test layer. mock-supabase contract documented in TR-1.',
    likelihood: 'low',
    impact: 'medium'
  }
];

const integration_operationalization = {
  consumers: [
    'LEAD agent (this Claude session pattern): runs scripts/templates/_lead-enrich-template.mjs (or copy thereof) before any UPDATE to strategic_directives_v2 metadata. The template runs verifyOriginMainPremise / verifyJoinShape / verifyHelperCoverage and emits evidence consumed by validation-agent at LEAD-TO-PLAN gate.',
    'validation-agent (Principal Systems Analyst): reads metadata.lead_evaluation.precheck_evidence at LEAD-TO-PLAN handoff. Failed precheck = sub-agent verdict downgrade.',
    'CI (vitest): runs FR-3, FR-5, FR-6 tests on every PR. Bypass-guard failures block merge unless registry updated.'
  ],
  dependencies: [
    {name: 'getMainRef() in scripts/modules/handoff/shared-git-context.js', direction: 'upstream', failure_mode: 'verifyOriginMainPremise can return {ok:null} but cannot fully verify origin/main if shared-git-context.js helper is broken — surface in evidence'},
    {name: 'globby (package)', direction: 'upstream', failure_mode: 'AST conformance test depends on globby for repo-wide glob; if globby unavailable, fall back to fs.readdir + recursion'},
    {name: 'acorn or @babel/parser', direction: 'upstream', failure_mode: 'AST parser dependency — if not present, conformance test cannot detect dynamic imports'},
    {name: 'docs/reference/canonical-write-paths.md / .json', direction: 'downstream', failure_mode: 'FR-5 bypass-guard reads .json sidecar — if registry-parser.js fails to regenerate sidecar, guard test reads stale data'},
    {name: 'audit_log table', direction: 'downstream', failure_mode: 'FR-9 staged-rollout writes audit_log entries on guard-disable; if audit_log unavailable, guard-disable still works but no audit trail'}
  ],
  data_contracts: [
    'No new tables. No schema changes. lead-precheck-helpers.js reads supabase tables (sampleSize=100 SELECT only) for verifyJoinShape.',
    'audit_log entries on FR-9 guard-disable: category=lead_precheck_guard_disabled, action=disable, metadata={env_flag_set: true, sd_key, session_id}.'
  ],
  runtime_config: [
    'LEAD_PRECHECK_FETCH_TIMEOUT_MS (default 5000ms): timeout for git fetch in verifyOriginMainPremise.',
    'LEAD_PRECHECK_OFFLINE_OK (default 0 in dev, 1 in CI/sandbox): controls whether {ok:null} from verifyOriginMainPremise is treated as PASS (offline_ok=1) or treated as FAIL (offline_ok=0).',
    'LEAD_PRECHECK_GUARD_DISABLE (default 0): when 1, FR-5 bypass-guard test PASSES with warning instead of failing.',
    'No deployment sequence changes. Helpers ship in same commit as registry + tests + legacy annotation.'
  ],
  observability_rollout: [
    'Metrics: ms_elapsed and files_scanned in verifyHelperCoverage evidence — surface in CI test output for trend tracking.',
    'Rollout: PR ships all 9 FRs together. Staged rollout (FR-9) provides 24-48h soft-fail period via LEAD_PRECHECK_GUARD_DISABLE=1.',
    'Rollback: revert PR — no schema changes, no data migration, no breaking interface changes. Existing _lead-enrich-* scripts continue to work without precheck (just slower-feedback CAPA when premises drift).',
    'Evidence: every verify*() call emits structured {ok, evidence} object — auditable via metadata.lead_evaluation.precheck_evidence on each SD.'
  ]
};

const baseline_observation = `## Baseline Observation

**Command run**: \`grep -r "from.\\'feedback\\').insert(" lib/ scripts/ --exclude-dir=tests --exclude-dir=__tests__\`

**Actual output (2026-05-10, before SD)**:
- 5+ direct \`supabase.from('feedback').insert()\` sites bypass the canonical \`emitFeedback\` helper
- signal-router.cjs (only writer populating \`contributing_workers\`)
- worker-signal.cjs (subset writer)
- 3+ other one-off scripts

**First failure observed**: \`verifyHelperCoverage({helperFile: 'lib/governance/emit-feedback.js', table: 'feedback'})\` would return \`{ok: false, evidence: {bypass_sites: [...5 paths...], canonical_imports: [...]}\` — exactly what the registry-driven bypass-guard test (FR-5) needs to surface at PR time, not 17 witnesses later.

**Expected output (after SD)**: All bypass sites either listed in registry \`exempt_writers[]\` with rationale OR refactored to use \`emitFeedback\`. New direct-insert sites fail CI loudly via FR-5 + FR-6 cross-checking.

**Self-validation smoke test (TS-9)**: Re-run today's falsified C1 claim against the canonical template — verifyOriginMainPremise would return \`{ok: false, evidence: {contradicting_commits: ['30b156938d shipped LEGACY_HARNESS_BACKLOG_FALLBACK 24h before claim']}}\` — exactly the falsified-premise detection LEAD failed to perform retroactively.
`;

(async () => {
  const prdContent = `# PRD: LEAD Empirical Precheck Infrastructure

${baseline_observation}

## Executive Summary
Build canonical premise-verification infrastructure that mechanically validates LEAD-enrichment claims before SD scope-lock. Closes 17-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 by shipping three composable verification primitives (origin-main, join-shape, helper-coverage) + a canonical \`_lead-enrich-template.mjs\` + AST static-guard conformance test + writer registry + bypass-guard test + registry-freshness meta-test.

## Goal
Replace ad-hoc memory-trust at LEAD enrichment with mechanical pre-commit gates that fail loudly when claims contradict origin/main, when join shapes mismatch, or when canonical helpers have unexempted bypass sites.

## Non-Goal
This SD ships preventive controls only. Fixing individual writer/consumer pairs (5+ direct feedback.insert sites in lib/) is OUT OF SCOPE — those land in their own SDs after the registry surfaces them.

## Architecture
- \`scripts/lib/lead-precheck-helpers.js\` — three pure verifications, ~120 LOC
- \`scripts/templates/_lead-enrich-template.mjs\` — canonical template, ~80 LOC
- \`tests/unit/lib/lead-precheck-helpers.test.js\` — unit tests with ≥8 adversarial fixtures, ~200 LOC
- \`tests/unit/lib/lead-enrich-template-conformance.test.js\` — AST static guard, ~120 LOC
- \`docs/reference/canonical-write-paths.md\` + \`.json\` sidecar — writer registry, ~80 LOC
- \`scripts/lib/registry-parser.js\` — registry parser/validator + sidecar generator, ~80 LOC
- \`tests/unit/governance/canonical-helper-bypass-guard.test.js\` — registry-driven bypass scan, ~100 LOC
- \`tests/unit/governance/canonical-helper-registry-freshness.test.js\` — registry-freshness meta-test, ~80 LOC
- \`scripts/one-off/_lead-enrich-sd-leo-infra-wire-feedback-table-001.mjs\` — UPDATE: add PRECHECK_EXEMPT annotation

**Total**: ~860 LOC source + ~200 LOC tests = ~1060 LOC. Tier-3 SD.

## Composition
- verifyOriginMainPremise composes over \`getMainRef({skipFetch})\` from \`scripts/modules/handoff/shared-git-context.js:33-70\` (do NOT re-implement fetch/fallback)
- AST static-guard test follows pattern from \`tests/unit/stderr-leak-static-guard.test.js\` (PR #3658) + \`tests/unit/lib/worktree-rmsync-junction-safety.test.js\` (PR #3667), but uses AST not regex per TR-6
- Canonical helper template references \`lib/governance/emit-feedback.js\` (192 LOC)

## Reference materials
- LEAD evaluation metadata at strategic_directives_v2.metadata.lead_evaluation (this SD)
- VALIDATION evidence row \`3b4cb9be-aed4-417c-a0d5-91fdaf5a5b2e\` (PASS conf=85)
- RISK evidence row \`79835bc0-1f8e-4e98-aaa7-8ea9ffa0ef7f\` (PASS_WITH_WARNINGS conf=84 MEDIUM)
- TESTING prospective evidence row \`a026358e-568f-4823-b172-238669d587d6\` (PASS conf=86)
- Memory \`feedback_rca_check_origin_main_before_qf.md\` — direct origin of verifyOriginMainPremise pattern
`;

  const prdRow = {
    id: randomUUID(),
    directive_id: sdKey,  // legacy column - use sd_key string
    sd_id: sdUuid,
    title: 'PRD: LEAD Empirical Precheck Infrastructure',
    version: '1.0',
    status: 'planning',
    category: 'infrastructure',
    priority: 'medium',
    executive_summary: 'Build canonical premise-verification infrastructure that mechanically validates LEAD-enrichment claims before SD scope-lock. Three composable primitives (verifyOriginMainPremise, verifyJoinShape, verifyHelperCoverage) + canonical template + AST static guard + writer registry + bypass-guard + registry-freshness meta-test. Closes 17-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.',
    business_context: 'Pattern PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 has 17 documented witnesses across 12+ months; today (2026-05-10) it produced 3 falsified premises at LEAD enrichment of SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 caught only retroactively. Continuing the retrospective-CAPA-per-pair pattern is empirically validated to fail. Tier-3 bundle ships safer than 3 future RCA→QF cycles.',
    technical_context: 'Composition over duplication: verifyOriginMainPremise composes over getMainRef() in scripts/modules/handoff/shared-git-context.js:33-70. AST static-guard pattern from tests/unit/stderr-leak-static-guard.test.js (PR #3658) and tests/unit/lib/worktree-rmsync-junction-safety.test.js (PR #3667). Canonical helper template: lib/governance/emit-feedback.js (192 LOC).',
    functional_requirements: functional_requirements,
    technical_requirements: technical_requirements,
    test_scenarios: test_scenarios,
    acceptance_criteria: acceptance_criteria,
    risks: risks,
    integration_operationalization: integration_operationalization,
    content: prdContent,
    document_type: 'prd',
    phase: 'PLAN',
    progress: 0,
    created_by: 'PLAN_53ffcdbd',
    metadata: {
      lead_evaluation_evidence: {
        validation_row_id: '3b4cb9be-aed4-417c-a0d5-91fdaf5a5b2e',
        risk_row_id: '79835bc0-1f8e-4e98-aaa7-8ea9ffa0ef7f',
        testing_prospective_row_id: 'a026358e-568f-4823-b172-238669d587d6'
      },
      sub_agent_orchestration: {
        database: 'b9fbd889-7132-4ffc-b5fd-f0d8a75edc0c',
        risk: '5026bf6d-0e4b-4d48-95e1-31176a9f7385',
        stories: '513819d5-1814-430e-85a8-c8a9ee36a551'
      },
      corpus_resolution: 'NARROW_TO_FORWARD_ONLY_PLUS_ONE_LEGACY_EXEMPT (only 1 _lead-enrich-*.mjs exists per VALIDATION glob)',
      design_informed: false,
      database_informed: true,
      stories_informed: true,
      created_via: 'inline_catch22_workaround_per_SD-FDBK-INFRA-ADD-PRD-DATABASE-001',
      created_at: new Date().toISOString()
    }
  };

  // UPDATE existing PRD row (created by add-prd-to-database.js LLM path with id="PRD-<sdkey>")
  // Strip id field — keep existing primary key
  delete prdRow.id;
  delete prdRow.created_by;
  prdRow.updated_by = 'PLAN_53ffcdbd';
  prdRow.updated_at = new Date().toISOString();

  const { data: prd, error } = await supabase
    .from('product_requirements_v2')
    .update(prdRow)
    .eq('sd_id', sdUuid)
    .select('id, directive_id, title, status')
    .single();
  if (error) {
    console.error('PRD update error:', error);
    process.exit(1);
  }
  console.log('✅ PRD updated:', prd.id);
  console.log('   directive_id:', prd.directive_id);
  console.log('   title:', prd.title);
  console.log('   status:', prd.status);

  // Verify user_stories already point to this PRD
  const { data: stories } = await supabase
    .from('user_stories')
    .select('id, prd_id')
    .eq('sd_id', sdUuid);
  console.log('   user_stories count:', stories?.length, '— prd_id values:', [...new Set((stories||[]).map(s=>s.prd_id))]);
})();
