import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sdKey = 'SD-FDBK-ENH-PAT-PHANTOM-TABLE-001';

const description = [
  'Closes CAPA-2 + CAPA-3 of the PAT-PHANTOM-TABLE-TEST-MISALIGNMENT-001 RCA cluster (origin: QF-20260509-849 baseline-test cluster RCA).',
  'Adds a pre-merge gate that detects test/code call-surface misalignment when a PR removes a phantom-table reference but leaves behind orphaned tests directory assertions on the removed table name.',
  'Gate runs at LEAD-FINAL-APPROVAL alongside wire-check-gate. Scans git diff vs origin/main for commits whose subject/body matches the trigger regex /phantom.*table|dead.*query/i, extracts removed table-name string literals from the diff, scans __tests__/ and tests/ for assertions on those names, and fails loudly if any matched test files are not also edited in the same PR.',
  'Also files the PAT-PHANTOM-TABLE-TEST-MISALIGNMENT-001 issue_patterns row (CAPA-2) cross-linked to PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (closed 21st-witness by SD-FDBK-ENH-PAT-LEO-INFRA-001, PR #3700).',
  'Scope-locked: CAPA-2+CAPA-3 only. CAPA-4 (triage-baseline-failures.js + baseline-allowlist for test_failures gate budget) is deferred to a follow-up SD because its scope (~200-400 LOC) would push this PR past Tier-3 size targets.'
].join(' ');

const scope = [
  'IN SCOPE (this SD):',
  '(1) scripts/phantom-test-audit.js — audit logic: enumerate matching commits via git log, extract REMOVED table-name string literals from the diff (single-quoted or double-quoted single-line), scan __tests__/ and tests/ for assertions on those names, check same-PR test edits via git diff --name-only origin/main..HEAD, exit non-zero with diagnostic if mismatch detected.',
  '(2) scripts/modules/handoff/executors/lead-final-approval/gates/phantom-test-audit-gate.js — gate wrapper following wire-check-gate.js conventions; registers into gates.js exports + handoff pipeline.',
  '(3) tests/phantom-test-audit.test.js — unit tests for the audit logic (vitest, fs/git-fixture based).',
  '(4) tests/phantom-test-audit-gate.test.js — gate registration static-pin mirroring wire-check-gate.test.js.',
  '(5) scripts/one-off/_seed-issue-pattern-phantom-table-001.mjs — UPSERTs the PAT-PHANTOM-TABLE-TEST-MISALIGNMENT-001 issue_patterns row with cross-link to PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (closes CAPA-2).',
  'OUT OF SCOPE (deferred to follow-up SDs):',
  '(a) CAPA-4 baseline-failures triage script + baseline-allowlist consumer wiring into test_failures gate;',
  '(b) backfill audit of historical PRs for missed phantom-table-test misalignments;',
  '(c) auto-fix mode (gate emits diagnostic only, never edits tests);',
  '(d) integration with the EHG repo (this gate is EHG_Engineer-only).'
].join(' ');

const keyChanges = [
  { change: 'New script scripts/phantom-test-audit.js implementing the audit logic', impact: 'Pre-merge surface for catching test/code misalignment when phantom tables are removed' },
  { change: 'New gate scripts/modules/handoff/executors/lead-final-approval/gates/phantom-test-audit-gate.js', impact: 'Integrates audit into LEAD-FINAL-APPROVAL handoff alongside wire-check-gate' },
  { change: 'Registration in scripts/modules/handoff/executors/lead-final-approval/gates.js (import + re-export)', impact: 'Gate becomes part of the LEAD-FINAL-APPROVAL gate batch' },
  { change: 'Two test files: tests/phantom-test-audit.test.js + tests/phantom-test-audit-gate.test.js', impact: 'Pin audit logic AND gate registration against drift' },
  { change: 'One-off issue_patterns UPSERT for PAT-PHANTOM-TABLE-TEST-MISALIGNMENT-001 cross-linked to PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001', impact: 'Records the pattern for future incident matching; closes CAPA-2' }
];

const risks = [
  { risk: 'Trigger regex /phantom.*table|dead.*query/i may false-trigger on unrelated commits mentioning the word "phantom" (e.g., phantom-completion-sweep, phantom worktrees)', mitigation: 'Anchor pattern to commit subject lines only (less noisy than body); document false-positive escape hatch via PHANTOM_TEST_AUDIT_BYPASS=1 env + bypass-reason in handoff', likelihood: 'medium', impact: 'low' },
  { risk: 'Diff parsing for removed string literals may miss multi-line strings, template literals, or `.from(${tableVar})` dynamic refs', mitigation: 'Restrict to single-line single/double-quoted string literals; document limitation in script header; same-PR test edit check is the safety net if the literal extractor misses something', likelihood: 'medium', impact: 'low' },
  { risk: 'Gate may slow LEAD-FINAL-APPROVAL handoff on branches with large diff histories', mitigation: 'Early-return when no commit subject matches the trigger regex (cost near-zero for 99% of SDs); limit git log scan to origin/main..HEAD range only', likelihood: 'low', impact: 'low' },
  { risk: 'Test enumeration could miss files in tests/integration/ or tests/unit/ subdirs if naive readdir is used', mitigation: 'Scan recursively from tests/ + __tests__/ roots using fs.readdir { recursive: true } (Node 20+) or fast-glob if available', likelihood: 'low', impact: 'medium' },
  { risk: 'Wire-check-gate integration pattern may have changed since reference; gate registration could fail silently', mitigation: 'Mirror wire-check-gate.js verbatim for exports + gates.js registration; gate-registration test imports from gates.js and asserts createPhantomTestAuditGate is exported', likelihood: 'low', impact: 'medium' },
  { risk: 'CAPA-4 deferral could orphan the baseline-failures ledger requirement if the follow-up SD slips', mitigation: 'Capture in retrospective + queue placeholder DRAFT SD with explicit deferral notes referencing this SD key', likelihood: 'medium', impact: 'medium' }
];

const implementationGuidelines = [
  'Mirror wire-check-gate.js conventions for factory: createPhantomTestAuditGate({...}) returning the canonical { name, validate } shape; identical export/import shape in gates.js',
  'Use execSync from child_process for git log + git diff (consistent with other gate scripts); set { encoding: utf8 } and reasonable maxBuffer',
  'Use fs.readdir { recursive: true } (Node 20+) for test file enumeration; fall back to manual recursion if maxDepth needed',
  'Audit script must be CLI-invokable AND importable: export auditPhantomTableTests({ repoPath, baseRef, headRef }) returning { ok, diagnostics }; CLI wraps the function + process.exit',
  'Tests use vitest matching repo standard at vitest.config.js (testTimeout 60000, pool forks, environment node)',
  'Static-pin regression test for gate registration: tests/phantom-test-audit-gate.test.js reads gates.js via fs.readFileSync + regex; asserts createPhantomTestAuditGate import + re-export lines are present',
  'Issue_patterns UPSERT via one-off mjs: query first; UPSERT by pattern_id key; set related_patterns array including PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001',
  'No DB connection from the gate at runtime (git+fs-only) — keeps gate fast and offline-capable'
];

const dependencies = [
  'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 closed by SD-FDBK-ENH-PAT-LEO-INFRA-001 (PR #3700, commit b19383ed merged 2026-05-11). This SD cross-links the new issue_patterns row to that pattern.',
  'wire-check-gate.js + gates.js export/registration pattern at scripts/modules/handoff/executors/lead-final-approval/ — confirmed exists on origin/main',
  'vitest test framework + repo vitest.config.js — already in use'
];

const successMetrics = [
  { metric: 'Gate detects misalignment in synthetic test fixture', target: 'TS-1 covers fixture branch with phantom commit + orphaned test → expects audit FAIL with specific diagnostic' },
  { metric: 'Gate passes on no-phantom-commit branches', target: 'TS-2 confirms early-return pass when zero matching commits found (zero cost)' },
  { metric: 'Gate passes when test file IS edited in same PR', target: 'TS-3 covers fixture with phantom commit + edited test file → expects audit PASS' },
  { metric: 'Gate registration intact', target: 'TS-4 static-pin asserts createPhantomTestAuditGate exported from gates.js' },
  { metric: 'Issue pattern row written', target: 'TS-5 verifies issue_patterns row with pattern_id and related_patterns array including PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001' },
  { metric: 'Total test count for CAPA-2+CAPA-3 coverage', target: '5 of 5 tests (TS-1 through TS-5) PASS in CI without env gating' }
];

const acceptanceCriteria = [
  'scripts/phantom-test-audit.js exists, is CLI-invokable and importable, exports auditPhantomTableTests({ repoPath, baseRef, headRef })',
  'scripts/modules/handoff/executors/lead-final-approval/gates/phantom-test-audit-gate.js exists with createPhantomTestAuditGate factory',
  'scripts/modules/handoff/executors/lead-final-approval/gates.js imports + re-exports createPhantomTestAuditGate',
  'tests/phantom-test-audit.test.js covers TS-1 (phantom commit + orphaned test → FAIL), TS-2 (no phantom commit → PASS), TS-3 (phantom commit + same-PR test edit → PASS)',
  'tests/phantom-test-audit-gate.test.js covers TS-4 (gate registration static-pin)',
  'scripts/one-off/_seed-issue-pattern-phantom-table-001.mjs UPSERTed the issue_patterns row with related_patterns including PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001',
  'TS-5 verifies issue_patterns row existence + cross-link metadata',
  'All 5 test scenarios PASS in CI without DB_BEHAVIOR_TESTS env gating',
  'Gate registers into LEAD-FINAL-APPROVAL handoff pipeline without breaking existing gates (no regression on wire-check-gate.test.js or any other gate test)',
  'Closes feedback 9f24c164-471a-4f0c-a506-4d5762c52a55 via PR footer'
];

const smokeTestSteps = [
  { step: 'Run phantom-test-audit.js CLI on a known-clean branch', expected: 'exit 0 with no-phantom-commits diagnostic', actual: 'pending EXEC' },
  { step: 'Import createPhantomTestAuditGate from gates.js and instantiate', expected: 'gate object with name and validate fields returned', actual: 'pending EXEC' },
  { step: 'SELECT * FROM issue_patterns WHERE pattern_id=PAT-PHANTOM-TABLE-TEST-MISALIGNMENT-001', expected: '1 row with cross-link metadata in related_patterns', actual: 'pending EXEC' }
];

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({
    description,
    scope,
    key_changes: keyChanges,
    risks,
    implementation_guidelines: implementationGuidelines,
    dependencies,
    success_metrics: successMetrics,
    smoke_test_steps: smokeTestSteps,
    scope_reduction_percentage: 33
  })
  .eq('sd_key', sdKey)
  .select('sd_key, status, current_phase')
  .single();

if (error) { console.error('ERR:', error.message); process.exit(1); }
console.log('Enrichment written:', JSON.stringify(data, null, 2));
console.log('Counts: description=' + description.length + 'c, scope=' + scope.length + 'c, key_changes=' + keyChanges.length + ', risks=' + risks.length + ', impl_guidelines=' + implementationGuidelines.length + ', dependencies=' + dependencies.length + ', success_metrics=' + successMetrics.length + ', acceptance_criteria=' + acceptanceCriteria.length + ', smoke_test_steps=' + smokeTestSteps.length);
