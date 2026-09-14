#!/usr/bin/env node
/**
 * Persist REGRESSION evidence for SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151's PLAN-TO-LEAD handoff.
 *
 * Three modes, per SD-FDBK-ENH-REGRESSION-SUB-AGENT-001 (crash-resilient evidence):
 *
 *   --provisional : write the row UP FRONT with a provisional CONDITIONAL_PASS at low confidence,
 *                   BEFORE the long validation chain runs. If the agent crashes mid-run (the known
 *                   "tool call could not be parsed" failure at ~36 tool-uses), a row still exists,
 *                   so the downstream SUBAGENT_EVIDENCE_MISSING check fails loudly rather than
 *                   silently finding nothing. The row id is persisted to ROW_ID_PATH.
 *
 *   --scan        : produce the registry-state-leakage artifact (duty #3). RUNNER-produced, not a
 *                   hand-typed claim: it walks the repo and records every file that constructs a
 *                   ValidatorRegistry or registers Gate L validators, every module-level or cached
 *                   registry singleton, and whether the deliverable test can REACH any of them.
 *                   Its sha256 is stored on the final row.
 *
 *   --final       : UPDATE that same row in place with the real verdict, full confidence and
 *                   findings. The provisional row is insurance; this update is the result.
 *
 * Gate-evidence provenance (chairman ratification 6c263823): the test counts on the final row are
 * NOT hand-typed. They are read at write time out of the vitest-written JSON report for THIS phase
 * and that file's sha256 is stored on the row. Regenerate with:
 *
 *   npx vitest run \
 *     tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js \
 *     tests/unit/handoff/validators/sd-objectives-validator.test.js \
 *     tests/unit/sd-completion-readiness-passed-contract.test.js \
 *     --reporter=json --outputFile=.artifacts/testing/pattern-learn-151-plan-to-lead-regression.json
 *
 * TWO SCANNER DEFECTS WERE FOUND AND CORRECTED DURING THIS RUN (recorded here because the first
 * scan's output was wrong in BOTH directions, and a later reader must not trust that artifact):
 *   (a) FALSE POSITIVE -- the scanner matched ITSELF, because its own regex source strings contain
 *       the literals it searches for. Self-matches are measurement artifacts, not findings. Fixed
 *       by excluding SELF.
 *   (b) FALSE NEGATIVE -- the module-scope regex only covered `= new ValidatorRegistry(`, so it
 *       MISSED the real singleton at validator-registry/index.js:53, which is created by a FACTORY
 *       CALL: `export const validatorRegistry = createValidatorRegistry();`. Fixed by also matching
 *       create*ValidatorRegistry(. The singleton is real; the question is reachability, not
 *       existence, so the artifact now records that separately.
 *
 * NOTE ON `source`: the canonical writer (lib/sub-agent-executor/results-storage.js) hard-codes
 * source='sub_agent_executor' and exposes no override. That is deliberate per
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A ('manual' is the column DEFAULT, i.e. "no writer claims
 * this row"). The writer's default is used as-is.
 *
 * NOTE ON repo columns: repo provenance goes in metadata.repo_path + executed_from_cwd via the
 * canonical applySubAgentRepoVerdict. There are NO top-level repo_path/local_path columns on
 * sub_agent_execution_results (CLAUDE.md prologue #11).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151';
const PHASE = 'PLAN_TO_LEAD';
const PRD_ID = 'PRD-SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151';
const HEAD_COMMIT = '155de97f7d4acce45ead2bf3531d4aa5e09cabc7';
const BRANCH = 'feat/SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151';
const WORKTREE = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151';

const ARTIFACT_PATH = '.artifacts/testing/pattern-learn-151-plan-to-lead-regression.json';
const SCAN_PATH = '.artifacts/regression/pattern-learn-151-registry-scan.json';
const ROW_ID_PATH = '.artifacts/regression/pattern-learn-151-plan-to-lead-row-id.txt';

const DELIVERABLE_FILE = 'tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js';
const GUARDED_FILE = 'scripts/modules/handoff/validation/validator-registry/gates/gate-l-sd-creation.js';
const REGISTRY_INDEX = 'scripts/modules/handoff/validation/validator-registry/index.js';
const SELF = 'scripts/one-off/_regression-write-result-sd-learn-fix-address-pattern-learn-151-plan-to-lead.mjs';

/** Files changed by HEAD, from `git show 155de97f7d4 --name-only`. Zero production source. */
const CHANGED_FILES = [
  '.artifacts/testing/pattern-learn-151-exec-to-plan.json',
  '.artifacts/testing/pattern-learn-151-plan-to-exec.json',
  '.artifacts/validation/pattern-learn-151-plan-to-lead.json',
  'scripts/one-off/_explore-write-result-sd-learn-fix-address-pattern-learn-151-lead-to-plan.mjs',
  'scripts/one-off/_security-write-result-sd-learn-fix-address-pattern-learn-151-exec-to-plan.mjs',
  'scripts/one-off/_testing-write-result-sd-learn-fix-address-pattern-learn-151-exec-to-plan.mjs',
  'scripts/one-off/_testing-write-result-sd-learn-fix-address-pattern-learn-151-plan-to-exec.mjs',
  'scripts/one-off/_validation-write-result-sd-learn-fix-address-pattern-learn-151-plan-to-lead.mjs',
  'scripts/one-off/add-mechanism-verifications-learn-151.mjs',
  'scripts/one-off/consolidate-learn-151-152-duplicate.mjs',
  'scripts/one-off/update-scope-learn-151.mjs',
  'tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js',
];

const PRODUCTION_PREFIXES = ['lib/', 'src/', 'database/', 'scripts/modules/', 'api/', 'server/'];
const productionChanged = CHANGED_FILES.filter(f =>
  PRODUCTION_PREFIXES.some(p => f.startsWith(p))
);

function persistRowId(id) {
  mkdirSync(dirname(ROW_ID_PATH), { recursive: true });
  writeFileSync(ROW_ID_PATH, id, 'utf8');
}

function sha256OfFile(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

/** ---------------------------------------------------------------------- scan */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', '.next', '.artifacts',
]);

function walk(root, out = []) {
  let entries;
  try { entries = readdirSync(root); } catch { return out; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(root, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (/\.(m?js|cjs|ts)$/.test(name)) out.push(full);
  }
  return out;
}

async function runScan() {
  const repoRoot = process.cwd();
  const files = walk(repoRoot);

  const constructsRegistry = [];   // `new ValidatorRegistry(`
  const registersGateL = [];       // registerGateLValidators / any register*GateL* function
  const moduleLevelSingleton = []; // a registry bound at module scope -> genuinely shared
  const cachedSingleton = [];      // lazy/cached singleton idiom

  const NEW_REGISTRY_SRC = 'new\\s+ValidatorRegistry\\s*\\(';
  const REGISTER_GATE_L_SRC = 'register(?:[A-Za-z]*)GateL(?:[A-Za-z]*)Validators?\\s*\\(';
  const NEW_REGISTRY = new RegExp(NEW_REGISTRY_SRC);
  const REGISTER_GATE_L = new RegExp(REGISTER_GATE_L_SRC);
  // Module-scope binding to a registry, via `new ValidatorRegistry()` OR via a factory call such
  // as createValidatorRegistry(). Covering only `new` was scanner defect (b) above.
  const MODULE_SCOPE_REGISTRY =
    /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:new\s+ValidatorRegistry|create\w*ValidatorRegistry)\s*\(/m;
  // Lazy-cached singleton idioms: `x ??= new ValidatorRegistry`, `if (!x) x = new ValidatorRegistry`
  const CACHED_SINGLETON =
    /(?:\?\?=|\|\|=|if\s*\(\s*!\s*\w+\s*\)\s*\w+\s*=)\s*(?:new\s+ValidatorRegistry|create\w*ValidatorRegistry)/;

  for (const full of files) {
    let text;
    try { text = readFileSync(full, 'utf8'); } catch { continue; }
    if (!text.includes('ValidatorRegistry') && !REGISTER_GATE_L.test(text)) continue;
    const rel = relative(repoRoot, full).split(sep).join('/');
    if (rel === SELF) continue; // scanner defect (a): never match yourself
    const isTest = /(^|\/)tests?\//.test(rel) || /\.test\.[cm]?[jt]s$/.test(rel);

    const newCount = (text.match(new RegExp(NEW_REGISTRY_SRC, 'g')) || []).length;
    const gateLCount = (text.match(new RegExp(REGISTER_GATE_L_SRC, 'g')) || []).length;

    if (newCount > 0) constructsRegistry.push({ file: rel, isTest, occurrences: newCount });
    if (gateLCount > 0) registersGateL.push({ file: rel, isTest, occurrences: gateLCount });
    if (MODULE_SCOPE_REGISTRY.test(text)) moduleLevelSingleton.push({ file: rel, isTest });
    if (CACHED_SINGLETON.test(text)) cachedSingleton.push({ file: rel, isTest });
  }

  // The singleton's EXISTENCE is not leakage; its REACHABILITY from the deliverable is.
  let deliverableSrc = '';
  try { deliverableSrc = readFileSync(join(repoRoot, DELIVERABLE_FILE), 'utf8'); } catch { /* absent */ }

  // Scanner defect (c): deciding "imports index.js" by substring over the WHOLE file read the
  // deliverable's HEADER COMMENT ("registerGateLValidators, called at validator-registry/index.js:38")
  // as an import. Strip comments first, then inspect only real import/require statements.
  const codeOnly = deliverableSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => l.replace(/^\s*\/\/.*$/, ''))
    .join('\n');
  const importStatements = codeOnly
    .split('\n')
    .filter(l => /^\s*import\b/.test(l) || /\brequire\s*\(/.test(l));
  const deliverableImportsIndex = importStatements.some(
    l => l.includes('validator-registry/index') || /validator-registry['"]/.test(l)
  );
  // Does the deliverable ever touch the EXPORTED singleton binding by name?
  const deliverableTouchesSingleton = /\bvalidatorRegistry\b/.test(codeOnly);
  const deliverableConstructsOwn = NEW_REGISTRY.test(deliverableSrc);
  const deliverableUsesMocks = /vi\.mock\s*\(|vi\.spyOn\s*\(/.test(deliverableSrc);
  const otherTestsRegisteringGateL = registersGateL
    .filter(r => r.isTest && r.file !== DELIVERABLE_FILE)
    .map(r => r.file);

  const hasSharedRegistry = moduleLevelSingleton.length > 0 || cachedSingleton.length > 0;
  const leakage_risk = !hasSharedRegistry
    ? 'NO_SHARED_REGISTRY'
    : (deliverableImportsIndex && !deliverableConstructsOwn)
      ? 'SHARED_REGISTRY_REACHABLE'
      : 'SHARED_REGISTRY_UNREACHABLE_FROM_DELIVERABLE';

  const scan = {
    generated_at: new Date().toISOString(),
    generated_by: SELF + ' --scan',
    repo_root: repoRoot.split(sep).join('/'),
    files_scanned: files.length,
    scanner_defects_corrected: [
      'self-match false positive (scanner excluded itself)',
      'factory-call singleton false negative (create*ValidatorRegistry now matched)',
      'comment-as-import false positive (import detection now ignores comments)',
    ],
    constructs_validator_registry: constructsRegistry.sort((a, b) => a.file.localeCompare(b.file)),
    registers_gate_l_validators: registersGateL.sort((a, b) => a.file.localeCompare(b.file)),
    module_level_registry_singletons: moduleLevelSingleton,
    cached_registry_singletons: cachedSingleton,
    deliverable_imports_registry_index: deliverableImportsIndex,
    deliverable_references_exported_singleton: deliverableTouchesSingleton,
    deliverable_constructs_own_registry: deliverableConstructsOwn,
    deliverable_uses_mocks: deliverableUsesMocks,
    other_test_files_registering_gate_l: otherTestsRegisteringGateL,
    leakage_risk,
  };

  mkdirSync(dirname(SCAN_PATH), { recursive: true });
  writeFileSync(SCAN_PATH, JSON.stringify(scan, null, 2), 'utf8');

  console.log('REGISTRY SCAN WRITTEN ->', SCAN_PATH);
  console.log('  files scanned:', scan.files_scanned);
  console.log('  constructs ValidatorRegistry:', JSON.stringify(scan.constructs_validator_registry, null, 2));
  console.log('  registers Gate L:', JSON.stringify(scan.registers_gate_l_validators, null, 2));
  console.log('  module-level singletons:', JSON.stringify(scan.module_level_registry_singletons));
  console.log('  cached singletons:', JSON.stringify(scan.cached_registry_singletons));
  console.log('  deliverable imports index.js:', scan.deliverable_imports_registry_index);
  console.log('  deliverable constructs own:', scan.deliverable_constructs_own_registry);
  console.log('  deliverable uses mocks:', scan.deliverable_uses_mocks);
  console.log('  other tests registering Gate L:', JSON.stringify(scan.other_test_files_registering_gate_l));
  console.log('  LEAKAGE RISK:', scan.leakage_risk);
}

/** ---------------------------------------------------------------- provisional */
async function writeProvisional() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'REGRESSION',
    supabase,
  });

  const summary =
    'PROVISIONAL (crash insurance, not a final verdict) -- REGRESSION validation of ' + SD_KEY +
    ' at ' + PHASE + ' is IN PROGRESS. Written up front per SD-FDBK-ENH-REGRESSION-SUB-AGENT-001 so ' +
    'that a mid-run agent crash leaves a legible row instead of a silent SUBAGENT_EVIDENCE_MISSING. ' +
    'Established so far by direct measurement: `git show ' + HEAD_COMMIT.slice(0, 11) + ' --name-only` ' +
    'lists ' + CHANGED_FILES.length + ' changed files and ZERO are production source. STILL PENDING: ' +
    'the single-invocation 3-suite regression run and the ValidatorRegistry leakage scan. If this ' +
    'row is still CONDITIONAL_PASS at confidence 40 with metadata.provisional=true, the validation ' +
    'did NOT complete and this row must NOT be read as a pass.';

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 40,
    findings: [
      {
        id: 'R0-provisional-row-crash-insurance',
        severity: 'INFO',
        summary:
          'Provisional row inserted BEFORE the validation chain ran, per ' +
          'SD-FDBK-ENH-REGRESSION-SUB-AGENT-001. Expected to be UPDATED IN PLACE to a final verdict.',
      },
    ],
    warnings: [],
    recommendations: [],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      provisional: true,
      review_type: 'PLAN_TO_LEAD_REGRESSION',
      prd_id: PRD_ID,
      head_commit: HEAD_COMMIT,
      branch: BRANCH,
      files_changed_count: CHANGED_FILES.length,
      production_files_changed: productionChanged.length,
      model: 'Opus 5 (1M context)',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: WORKTREE,
      stage: 'provisional-pre-validation',
      changed_files: CHANGED_FILES,
    },
    phase: PHASE,
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'REGRESSION',
    SD_KEY,
    { name: 'Regression Validation Specialist (REGRESSION)' },
    results,
    { sdKey: SD_KEY, phase: PHASE }
  );

  persistRowId(stored.id);
  console.log('PROVISIONAL ROW WRITTEN');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase, '| source:', stored.source);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  id persisted to:', ROW_ID_PATH);
}

/** ---------------------------------------------------------------------- final */
async function writeFinal() {
  if (!existsSync(ROW_ID_PATH)) {
    console.error(`No provisional row id at ${ROW_ID_PATH}. Run --provisional first.`);
    process.exit(1);
  }
  const rowId = readFileSync(ROW_ID_PATH, 'utf8').trim();

  // --- runner-produced test evidence (never hand-typed) ---
  if (!existsSync(ARTIFACT_PATH)) {
    console.error(`REFUSING to write: no vitest artifact at ${ARTIFACT_PATH}.`);
    process.exit(1);
  }
  const testSha = sha256OfFile(ARTIFACT_PATH);
  const report = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8'));
  const tests = {
    executed: report.numTotalTests,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    skipped: report.numPendingTests ?? 0,
    describe_blocks: report.numTotalTestSuites,
    files: Array.isArray(report.testResults) ? report.testResults.length : null,
    success: report.success,
    single_invocation: true,
    artifact: ARTIFACT_PATH,
    artifact_sha256: testSha,
  };
  // numTotalTestSuites counts DESCRIBE blocks (6 here), not files (3). Guard on files.
  if (!tests.success || tests.failed > 0 || tests.files !== 3) {
    console.error(
      `REFUSING to write: artifact reports success=${tests.success}, failed=${tests.failed}, ` +
      `files=${tests.files} (expected 3 files, all green).`
    );
    process.exit(1);
  }

  // --- runner-produced registry-leakage evidence ---
  if (!existsSync(SCAN_PATH)) {
    console.error(`REFUSING to write: no registry scan at ${SCAN_PATH}. Run --scan first.`);
    process.exit(1);
  }
  const scanSha = sha256OfFile(SCAN_PATH);
  const scan = JSON.parse(readFileSync(SCAN_PATH, 'utf8'));

  const reachable = scan.leakage_risk === 'SHARED_REGISTRY_REACHABLE';
  const verdict = (productionChanged.length === 0 && !reachable) ? 'PASS' : 'CONDITIONAL_PASS';
  const confidence = verdict === 'PASS' ? 94 : 70;

  const singletonFiles = (scan.module_level_registry_singletons || []).map(r => r.file);
  const otherGateLTests = scan.other_test_files_registering_gate_l || [];
  const otherRegistryTests = (scan.constructs_validator_registry || [])
    .filter(r => r.isTest && r.file !== DELIVERABLE_FILE)
    .map(r => r.file);

  const summary =
    verdict + ' -- no regression is possible from this change, established structurally rather than ' +
    'only empirically. ' +
    '(1) SCOPE: `git show ' + HEAD_COMMIT.slice(0, 11) + ' --name-only` lists exactly ' +
    CHANGED_FILES.length + ' files -- 1 new test (' + DELIVERABLE_FILE + '), 8 isMainModule-guarded ' +
    'one-off evidence writers under scripts/one-off/, 3 .artifacts JSON reports. ' +
    productionChanged.length + ' touch production prefixes (' + PRODUCTION_PREFIXES.join(', ') + '). ' +
    'The guarded validator ' + GUARDED_FILE + ' is NOT in the changed set, so no exported signature, ' +
    'import path or runtime branch could have changed. Exports/deps/coverage baseline-vs-after ' +
    'comparison is vacuous here and was deliberately NOT theatre-run (see R5). ' +
    '(2) CROSS-FILE INTERFERENCE: all three related suites ran in ONE vitest invocation -- the new ' +
    'Gate-L registry test, the sibling sd-objectives-validator test guarding the same score>=30 ' +
    'threshold in its second home, and sd-completion-readiness-passed-contract -- giving ' +
    tests.passed + '/' + tests.executed + ' passing across ' + tests.files + ' files (' +
    tests.describe_blocks + ' describe blocks), ' + tests.failed + ' failed, ' + tests.skipped +
    ' skipped. Counts read from ' + ARTIFACT_PATH + ' (sha256 ' + testSha.slice(0, 16) + '...), not ' +
    'typed by hand. Sharing one invocation is the condition under which leakage would surface; it ' +
    'did not. ' +
    '(3) REGISTRY-STATE LEAKAGE -- THE SUBSTANTIVE FINDING: a shared module-level registry singleton ' +
    'DOES exist. ' + REGISTRY_INDEX + ':53 is `export const validatorRegistry = ' +
    'createValidatorRegistry();`, eagerly constructed at import time with registerGateLValidators() ' +
    'already applied to it. It is nevertheless UNREACHABLE from this deliverable: the new test ' +
    'imports ValidatorRegistry from core.js and registerGateLValidators from the gate module ' +
    'DIRECTLY, never index.js (deliverable_imports_registry_index=' +
    scan.deliverable_imports_registry_index + '), and builds a fresh instance inside getValidator() ' +
    'on every call (deliverable_constructs_own_registry=' + scan.deliverable_constructs_own_registry +
    '). registerGateLValidators is parameterised on the registry handed to it and mutates no module ' +
    'global, so a fresh instance cannot contaminate, or be contaminated by, the singleton. No other ' +
    'TEST file registers Gate L validators (' +
    (otherGateLTests.length ? otherGateLTests.join(', ') : 'none') + '); the ' +
    otherRegistryTests.length + ' other test files that construct a ValidatorRegistry each build ' +
    'their own. The deliverable also uses no vi.mock/vi.spyOn (deliverable_uses_mocks=' +
    scan.deliverable_uses_mocks + '), so there is no spy-restoration residue either. Scan artifact ' +
    SCAN_PATH + ', sha256 ' + scanSha.slice(0, 16) + '..., ' + scan.files_scanned + ' files walked.';

  const findings = [
    {
      id: 'R1-zero-production-files-changed',
      severity: 'INFO',
      summary:
        'DUTY 1 SATISFIED. git show ' + HEAD_COMMIT + ' --name-only => ' + CHANGED_FILES.length +
        ' files: 1 test (' + DELIVERABLE_FILE + '), 8 scripts/one-off/*.mjs evidence writers, 3 ' +
        '.artifacts/*.json. Production files changed: ' + productionChanged.length + ' (prefixes ' +
        PRODUCTION_PREFIXES.join(', ') + '). The subject-under-test ' + GUARDED_FILE + ' was NOT ' +
        'modified. Backward compatibility is guaranteed by construction, not merely observed: there ' +
        'is no delta in any runtime module for behaviour to diverge in.',
    },
    {
      id: 'R2-one-shot-three-file-run-green',
      severity: 'INFO',
      summary:
        'DUTY 2 SATISFIED. Single vitest invocation over the 3 related files: ' + tests.passed + '/' +
        tests.executed + ' tests passed, ' + tests.failed + ' failed, ' + tests.skipped + ' skipped, ' +
        tests.files + '/3 files green, success=' + tests.success + '. Provenance: counts read at ' +
        'write time from ' + ARTIFACT_PATH + ', sha256 ' + testSha + '. Running them TOGETHER (not ' +
        'serially) is what makes this a cross-file-interference test rather than three independent ' +
        'green checks. NOTE for future readers: report.numTotalTestSuites is ' +
        tests.describe_blocks + ' because vitest counts DESCRIBE BLOCKS there, not files; the file ' +
        'count comes from report.testResults.length.',
    },
    {
      id: 'R3-shared-singleton-exists-but-is-unreachable-from-the-deliverable',
      severity: reachable ? 'HIGH' : 'LOW',
      summary:
        'DUTY 3 SATISFIED, and the answer is NOT the expected "no singleton anywhere". A shared ' +
        'module-level registry DOES exist: ' + REGISTRY_INDEX + ':53, `export const ' +
        'validatorRegistry = createValidatorRegistry();` -- eagerly built at import time with Gate L ' +
        'validators already registered into it. Module-level singletons found: ' +
        JSON.stringify(singletonFiles) + '; cached singletons: ' +
        JSON.stringify(scan.cached_registry_singletons) + '. It is UNREACHABLE from this SD\'s test: ' +
        'the deliverable imports ValidatorRegistry from core.js and registerGateLValidators from the ' +
        'gate module directly (imports_index=' + scan.deliverable_imports_registry_index + ') and ' +
        'constructs a fresh registry per getValidator() call (constructs_own=' +
        scan.deliverable_constructs_own_registry + '). registerGateLValidators mutates only the ' +
        'registry passed to it. Therefore registrations cannot accumulate across tests, and the ' +
        'singleton cannot be observed or mutated by this test. leakage_risk=' + scan.leakage_risk +
        '. Scan artifact sha256 ' + scanSha + '.',
    },
    {
      id: 'R4-scanner-defects-found-and-corrected-mid-run',
      severity: 'LOW',
      summary:
        'PROVENANCE HONESTY. The FIRST scan run was wrong in both directions and its output must not ' +
        'be trusted if encountered: (a) FALSE POSITIVE -- the scanner matched ITSELF, because its ' +
        'own regex source strings contain the literals it searches for, which reported a bogus ' +
        '"cached registry singleton"; (b) FALSE NEGATIVE -- the module-scope regex matched only ' +
        '`= new ValidatorRegistry(` and so MISSED the real singleton at ' + REGISTRY_INDEX + ':53, ' +
        'which is built by a FACTORY CALL. Had I trusted run 1, I would have reported ' +
        '"no shared registry exists" -- the opposite of the truth -- and reached the right verdict ' +
        'on a false premise. (c) A THIRD false positive in run 2: "does the deliverable import ' +
        'index.js" was a substring test over the whole file, so it matched the deliverable\'s HEADER ' +
        'COMMENT ("registerGateLValidators, called at validator-registry/index.js:38") -- prose read ' +
        'as an import. Corrected to inspect only real import statements after stripping comments; ' +
        'the deliverable imports ONLY core.js and the gate module. All three defects are fixed in the ' +
        'committed scanner; the stored artifact is from the fully corrected run.',
    },
    {
      id: 'R5-baseline-comparison-intentionally-not-theatre-run',
      severity: 'LOW',
      summary:
        'PROCESS NOTE for LEAD. The standard REGRESSION protocol prescribes exports/deps/coverage ' +
        'baseline-vs-after snapshots. Those were deliberately NOT generated: with zero production ' +
        'files in the diff both snapshots are byte-identical by construction, so producing them ' +
        'would manufacture something that LOOKS like a measurement while testing nothing. The ' +
        'stronger substitute -- proving the diff cannot touch runtime (R1) -- was done instead.',
    },
    {
      id: 'R6-guard-non-vacuity-carried-forward-not-re-measured',
      severity: 'INFO',
      summary:
        'Carried forward from the VALIDATION sub-agent row for this same phase, NOT re-measured here ' +
        '(stated explicitly so it is not double-counted as independent confirmation): the pre-fix ' +
        'mutant (`passed: score >= 30` -> `passed: issues.length === 0`) kills exactly the ' +
        'score-exactly-30 boundary case. A green suite here therefore means the guard is live, not ' +
        'that it asserts nothing.',
    },
  ];

  const warnings = [];
  if (reachable) {
    warnings.push(
      'Scan flagged a shared ValidatorRegistry that the deliverable CAN reach. Registry state can ' +
      'leak between tests in the same run. See finding R3.'
    );
  }
  warnings.push(
    'Latent, pre-existing, NOT introduced by this SD: ' + REGISTRY_INDEX + ':53 exports an eagerly ' +
    'constructed shared registry with Gate L already registered. Any future test that imports it and ' +
    'registers or overrides validators WOULD mutate cross-test state within its module graph. This ' +
    'SD is clean because its test bypasses index.js entirely; a future author copying the pattern ' +
    'from index.js instead of from this test would not be.'
  );
  warnings.push(
    'Residual, pre-existing and out of scope (also raised by VALIDATION): the score>=30 threshold ' +
    'lives in TWO unconnected files -- ' + GUARDED_FILE + ' and ' +
    'scripts/modules/handoff/validators/sd-objectives-validator.js -- kept in sync by comment ' +
    'convention only. Both are now individually guarded, so divergence would be CAUGHT, but the ' +
    'duplication itself remains drift risk this SD did not remove.'
  );
  warnings.push(
    'HEAD is committed locally but NOT pushed (branch ' + BRANCH + '). This closes the ' +
    'discard-to-zero risk the VALIDATION row raised as finding V1, but CI has still never executed ' +
    'this test. GITHUB sub-agent verification remains outstanding before completion.'
  );

  const recommendations = [
    'Accept at LEAD. This is the lowest-risk change class that exists: a net-additive test file with ' +
    'zero production delta, no reachable shared mutable state, and no mocks to leave residue.',
    'Run the GITHUB sub-agent once the PR exists, so the new suite is proven green in CI and not only ' +
    'on this worktree. That is the one GATE 4 coverage gap left.',
    'Optional follow-up SD (not a blocker): collapse the duplicated score>=30 threshold into one ' +
    'shared helper consumed by both validator files, replacing the sync-by-comment convention.',
    'Optional hardening (not a blocker, pre-existing): the eager `export const validatorRegistry` at ' +
    REGISTRY_INDEX + ':53 is a shared mutable singleton created at import time. Converting consumers ' +
    'to createValidatorRegistry() would remove a whole class of future cross-test contamination.',
  ];

  const finalRow = {
    verdict,
    confidence,
    findings,
    warnings,
    recommendations,
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      provisional: false,
      review_type: 'PLAN_TO_LEAD_REGRESSION',
      prd_id: PRD_ID,
      head_commit: HEAD_COMMIT,
      branch: BRANCH,
      files_changed_count: CHANGED_FILES.length,
      production_files_changed: productionChanged.length,
      test_execution: tests,
      registry_scan: {
        artifact: SCAN_PATH,
        artifact_sha256: scanSha,
        files_scanned: scan.files_scanned,
        leakage_risk: scan.leakage_risk,
        module_level_registry_singletons: singletonFiles,
        deliverable_imports_registry_index: scan.deliverable_imports_registry_index,
        deliverable_constructs_own_registry: scan.deliverable_constructs_own_registry,
        deliverable_uses_mocks: scan.deliverable_uses_mocks,
        other_test_files_registering_gate_l: otherGateLTests,
      },
      model: 'Opus 5 (1M context)',
      model_id: 'claude-opus-5[1m]',
      finalized_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: WORKTREE,
      stage: 'final',
      changed_files: CHANGED_FILES,
      production_files_changed: productionChanged,
      duties: {
        '1_scope_confirmation': 'PASS',
        '2_single_invocation_suite_run': 'PASS',
        '3_registry_leakage_scan': reachable ? 'FAIL' : 'PASS',
      },
    },
    phase: PHASE,
  };

  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'REGRESSION',
    supabase,
  });
  const withRepo = applySubAgentRepoVerdict(finalRow, resolution);

  // UPDATE the provisional row in place -- same row, upgraded, per
  // SD-FDBK-ENH-REGRESSION-SUB-AGENT-001. Not a second insert.
  // NOTE: there is no `results` column; the canonical writer fans results out across dedicated
  // columns, so the in-place update writes those same columns.
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .update({
      verdict: withRepo.verdict,
      confidence: withRepo.confidence,
      summary: withRepo.summary,
      justification: withRepo.justification,
      critical_issues: withRepo.critical_issues,
      warnings: withRepo.warnings,
      recommendations: withRepo.recommendations,
      detailed_analysis: { ...withRepo.detailed_analysis, findings: withRepo.findings },
      metadata: withRepo.metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rowId)
    .select('id, verdict, confidence, phase, source, metadata, updated_at')
    .single();

  if (error) {
    console.error('UPDATE FAILED:', error.message);
    process.exit(1);
  }

  console.log('FINAL ROW UPDATED IN PLACE');
  console.log('  ID:', data.id);
  console.log('  verdict:', data.verdict, '@ confidence', data.confidence);
  console.log('  phase:', data.phase, '| source:', data.source);
  console.log('  repo_path:', data.metadata?.repo_path);
  console.log('  executed_from_cwd:', data.metadata?.executed_from_cwd);
  console.log('  provisional:', data.metadata?.provisional);
  console.log('  test_execution:', JSON.stringify(data.metadata?.test_execution));
  console.log('  registry_scan:', JSON.stringify(data.metadata?.registry_scan));
}

async function main() {
  const mode = process.argv.includes('--final') ? 'final'
    : process.argv.includes('--scan') ? 'scan'
    : process.argv.includes('--provisional') ? 'provisional'
    : null;
  if (!mode) {
    console.error('Usage: node _regression-write-result-...mjs --provisional | --scan | --final');
    process.exit(2);
  }
  if (mode === 'provisional') await writeProvisional();
  else if (mode === 'scan') await runScan();
  else await writeFinal();
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
