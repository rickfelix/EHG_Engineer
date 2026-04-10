// D1 (SD-LEO-INFRA-LEO-UPSTREAM-DECISION-001): Bugfix TDD prove-it gate logic tests
// Run: node __tests__/scripts/d1-bugfix-tdd-gate.test.cjs
//
// These tests verify the D1 enforcement logic in isolation by extracting
// the decision tree into a pure function. Integration testing of the
// full hook pipeline is manual (claim a test SD, attempt Edit, verify block).

/**
 * Pure decision function extracted from pre-tool-enforce.cjs ENFORCEMENT 10.
 * Returns one of: 'allow', 'block', 'skip' (skip = check did not apply).
 *
 * @param {Object} ctx
 * @param {string} ctx.toolName       - 'Edit' | 'Write' | 'MultiEdit' | other
 * @param {string} ctx.filePath       - Target file path (forward slashes)
 * @param {string|null} ctx.claimedSdKey - Active claim from state file
 * @param {string|null} ctx.sdType    - 'bugfix' | 'feature' | etc. or null on missing
 * @param {boolean} ctx.hasTestCommit - true if a test commit exists since claim
 */
function d1Decide(ctx) {
  // Skip if not an edit tool
  if (!['Edit', 'Write', 'MultiEdit'].includes(ctx.toolName)) return 'skip';
  // Skip if not a production path
  if (!/(^|\/)(src|lib)\//.test(ctx.filePath)) return 'skip';
  // Skip if no claimed SD
  if (!ctx.claimedSdKey || !/^SD-/.test(ctx.claimedSdKey)) return 'skip';
  // Skip if SD type is not bugfix
  if (ctx.sdType !== 'bugfix') return 'skip';
  // Bugfix on production path with no test commit → BLOCK
  if (!ctx.hasTestCommit) return 'block';
  return 'allow';
}

const tests = [
  // ── BLOCK scenarios (the gate's primary purpose) ────────────────────────────
  {
    name: 'B-1: Bugfix Edit on src/ without test commit → BLOCK',
    ctx: { toolName: 'Edit', filePath: 'src/auth/login.ts', claimedSdKey: 'SD-FIX-LOGIN-001', sdType: 'bugfix', hasTestCommit: false },
    expected: 'block'
  },
  {
    name: 'B-2: Bugfix Write on lib/ without test commit → BLOCK',
    ctx: { toolName: 'Write', filePath: 'lib/utils/parser.js', claimedSdKey: 'SD-FIX-PARSER-002', sdType: 'bugfix', hasTestCommit: false },
    expected: 'block'
  },
  {
    name: 'B-3: Bugfix MultiEdit on src/ without test commit → BLOCK',
    ctx: { toolName: 'MultiEdit', filePath: 'src/services/api.ts', claimedSdKey: 'SD-FIX-API-003', sdType: 'bugfix', hasTestCommit: false },
    expected: 'block'
  },
  // ── ALLOW scenarios (test commit exists) ────────────────────────────────────
  {
    name: 'A-1: Bugfix Edit WITH test commit → ALLOW',
    ctx: { toolName: 'Edit', filePath: 'src/auth/login.ts', claimedSdKey: 'SD-FIX-LOGIN-004', sdType: 'bugfix', hasTestCommit: true },
    expected: 'allow'
  },
  {
    name: 'A-2: Bugfix MultiEdit WITH test commit → ALLOW',
    ctx: { toolName: 'MultiEdit', filePath: 'lib/eva/scorer.js', claimedSdKey: 'SD-FIX-SCORER-005', sdType: 'bugfix', hasTestCommit: true },
    expected: 'allow'
  },
  // ── SKIP scenarios (gate does not apply) ────────────────────────────────────
  {
    name: 'S-1: Feature SD Edit on src/ → SKIP (not bugfix)',
    ctx: { toolName: 'Edit', filePath: 'src/components/Dashboard.tsx', claimedSdKey: 'SD-FEAT-DASH-001', sdType: 'feature', hasTestCommit: false },
    expected: 'skip'
  },
  {
    name: 'S-2: Infrastructure SD Edit on src/ → SKIP (not bugfix)',
    ctx: { toolName: 'Edit', filePath: 'src/cli/main.ts', claimedSdKey: 'SD-INFRA-CLI-001', sdType: 'infrastructure', hasTestCommit: false },
    expected: 'skip'
  },
  {
    name: 'S-3: Bugfix Edit on docs/ → SKIP (not src/lib path)',
    ctx: { toolName: 'Edit', filePath: 'docs/reference/auth.md', claimedSdKey: 'SD-FIX-DOCS-001', sdType: 'bugfix', hasTestCommit: false },
    expected: 'skip'
  },
  {
    name: 'S-4: Bugfix Edit on __tests__/ → SKIP (not src/lib path)',
    ctx: { toolName: 'Edit', filePath: '__tests__/auth/login.test.js', claimedSdKey: 'SD-FIX-AUTH-001', sdType: 'bugfix', hasTestCommit: false },
    expected: 'skip'
  },
  {
    name: 'S-5: Bugfix Edit on scripts/ → SKIP (not src/lib path)',
    ctx: { toolName: 'Edit', filePath: 'scripts/migrations/run.js', claimedSdKey: 'SD-FIX-SCRIPT-001', sdType: 'bugfix', hasTestCommit: false },
    expected: 'skip'
  },
  {
    name: 'S-6: Bugfix Read on src/ → SKIP (Read is not an edit tool)',
    ctx: { toolName: 'Read', filePath: 'src/auth/login.ts', claimedSdKey: 'SD-FIX-LOGIN-006', sdType: 'bugfix', hasTestCommit: false },
    expected: 'skip'
  },
  {
    name: 'S-7: Bugfix Bash on src/ → SKIP (Bash is not an edit tool)',
    ctx: { toolName: 'Bash', filePath: '', claimedSdKey: 'SD-FIX-LOGIN-007', sdType: 'bugfix', hasTestCommit: false },
    expected: 'skip'
  },
  {
    name: 'S-8: No claimed SD → SKIP (no active claim)',
    ctx: { toolName: 'Edit', filePath: 'src/auth/login.ts', claimedSdKey: null, sdType: null, hasTestCommit: false },
    expected: 'skip'
  },
  {
    name: 'S-9: Non-SD claim key (e.g. QF-) → SKIP',
    ctx: { toolName: 'Edit', filePath: 'src/auth/login.ts', claimedSdKey: 'QF-20260410-001', sdType: 'bugfix', hasTestCommit: false },
    expected: 'skip'
  },
  // ── ANTI-BYPASS: ensure src/ vs source/ etc. are correctly distinguished ──
  {
    name: 'AB-1: Path "source/auth.ts" (not "src/") → SKIP',
    ctx: { toolName: 'Edit', filePath: 'source/auth.ts', claimedSdKey: 'SD-FIX-001', sdType: 'bugfix', hasTestCommit: false },
    expected: 'skip'
  },
  {
    name: 'AB-2: Nested src/ in worktree path → BLOCK',
    ctx: { toolName: 'Edit', filePath: '.worktrees/SD-FIX-001/src/auth/login.ts', claimedSdKey: 'SD-FIX-001', sdType: 'bugfix', hasTestCommit: false },
    expected: 'block'
  }
];

let passed = 0;
let failed = 0;
const results = [];

for (const t of tests) {
  const r = d1Decide(t.ctx);
  const ok = r === t.expected;
  if (ok) passed++;
  else failed++;
  results.push({ name: t.name, expected: t.expected, actual: r, ok });
}

console.log('D1 bugfix TDD gate decision tests:');
console.log('-----------------------------------');
for (const r of results) {
  const icon = r.ok ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${r.name}`);
  console.log(`       expected=${r.expected}, actual=${r.actual}`);
}
console.log('-----------------------------------');
console.log(`Total: ${tests.length} | Passed: ${passed} | Failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
