#!/usr/bin/env node
/**
 * Transport test-isolation guard lint. SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-C, FR-4/FR-5.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────
 * Three confirmed live incidents (2026-08-xx x2, 2026-09-03) had a test reach a REAL Resend/
 * Twilio send because nothing at the shared transport stopped it -- only a per-caller guard
 * existed (chairman-sms-gate/index.js:243), covering 1 of 8+ email callers and 0 of 2 SMS
 * callers. This SD closed the gap with a shared guard (lib/notifications/
 * transport-test-isolation-guard.js, consumed by both resend-adapter.js and twilio-provider.js).
 * This lint is the CI-time assertion that (a) the guard still exists at both transports, and
 * (b) any test file that imports either transport module directly also shows evidence of
 * mocking fetch -- so a FUTURE test added without a mock is caught here, not in production logs.
 *
 * ── WHAT IT CHECKS ─────────────────────────────────────────────────────────────────────────────
 * PART A (existence): lib/notifications/resend-adapter.js and
 * lib/messaging/providers/twilio-provider.js both call shouldRefuseRealSend(.
 * PART B (coverage): every file under tests/ that statically imports resend-adapter.js or
 * twilio-provider.js also contains fetch-mock evidence (vi.fn()/vi.stubGlobal referencing
 * 'fetch', or an assignment to global.fetch/globalThis.fetch) in the SAME file, or is allowlisted
 * with a reason.
 *
 * ── THE ALLOWLIST IS NOT A BYPASS ──────────────────────────────────────────────────────────────
 * Shape copied from scripts/lint/fixture-producer-guard-lint.mjs: keys are
 * '<repo-relative-file>', values are free-text reasons, and loading THROWS if any reason is
 * blank.
 *
 * ── KNOWN LIMITATION ───────────────────────────────────────────────────────────────────────────
 * A test that reaches either transport indirectly (e.g. via chairman-sms-gate/index.js, which
 * itself imports resend-adapter.js) without importing the transport module directly is not seen
 * by Part B -- the runtime guard (shouldRefuseRealSend) is what actually protects that path; this
 * lint only adds a static, CI-time second layer for the DIRECT-import case.
 *
 * Usage:
 *   node scripts/lint/transport-test-isolation-guard-lint.mjs           # report, exit 1 on findings
 *   node scripts/lint/transport-test-isolation-guard-lint.mjs --json
 *   node scripts/lint/transport-test-isolation-guard-lint.mjs --root D  # aim the scan at another tree
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const ROOT = resolve(HERE, '..', '..');
export const ALLOWLIST_PATH = join(HERE, 'transport-test-isolation-guard-allowlist.json');

export const GUARDED_FILES = Object.freeze([
  'lib/notifications/resend-adapter.js',
  'lib/messaging/providers/twilio-provider.js',
]);

const TRANSPORT_IMPORT_RE = /from\s+['"][^'"]*(?:resend-adapter|twilio-provider)\.js['"]/;
// Two independent isolation shapes both satisfy Part B: (1) fetch-mocked -- the real transport
// code runs against a stubbed network layer; (2) module-mocked (vi.mock on the transport file
// itself) -- the real transport function body never executes at all, a STRONGER isolation than
// a fetch mock. tests/unit/notifications/orchestrator.test.js uses shape (2) and is a legitimate
// pass, not a gap: vi.mock() replaces sendEmail entirely before this file's own code ever runs.
const FETCH_MOCK_EVIDENCE_RE = /vi\.stubGlobal\(\s*['"]fetch['"]|global(?:This)?\.fetch\s*=/;
const MODULE_MOCK_EVIDENCE_RE = /vi\.mock\(\s*['"][^'"]*(?:resend-adapter|twilio-provider)\.js['"]/;
const GUARD_CALL_RE = /shouldRefuseRealSend\s*\(/;
/** Files that only import a NON-network export of a guarded transport (e.g. a pure signature
 * verifier) and never reach send()/sendEmail() -- never network-capable regardless of mocking. */
const NON_NETWORK_ONLY_IMPORT_RE = /import\s*\{\s*verifyInboundSignature[^}]*\}\s*from\s+['"][^'"]*twilio-provider\.js['"]/;

export function loadAllowlist(path = ALLOWLIST_PATH) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return {}; }
  let json;
  try { json = JSON.parse(raw); } catch (e) { throw new Error(`Invalid allowlist JSON at ${path}: ${e.message}`); }
  const entries = json.allow || {};
  for (const [k, v] of Object.entries(entries)) {
    if (!v || typeof v !== 'string' || !v.trim()) {
      throw new Error(`Allowlist entry '${k}' must have a non-empty reason string`);
    }
  }
  return entries;
}

const walk = (dir, out = []) => {
  let names = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const n of names) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const full = join(dir, n);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (/\.(test|spec)\.[mc]?js$/.test(n)) out.push(full);
  }
  return out;
};

const relOf = (full, root = ROOT) => full.replace(root, '').replace(/\\/g, '/').replace(/^\//, '');

/** PART A: is the guard call present in a given file's source? */
export function guardPresent(src) {
  return GUARD_CALL_RE.test(src);
}

/** PART B: does a test file importing a transport ALSO show isolation evidence (fetch-mocked
 * OR the whole transport module mocked out)? */
export function hasFetchMockEvidence(src) {
  return FETCH_MOCK_EVIDENCE_RE.test(src) || MODULE_MOCK_EVIDENCE_RE.test(src);
}

/** True when the ONLY thing imported from twilio-provider.js is the pure, non-network
 * verifyInboundSignature export -- never reaches send(), so no isolation is needed. */
export function importsNonNetworkOnly(src) {
  return NON_NETWORK_ONLY_IMPORT_RE.test(src);
}

export function scan({ root = ROOT, allowlist = loadAllowlist() } = {}) {
  const partA = GUARDED_FILES.map((f) => {
    let src = '';
    try { src = readFileSync(join(root, f), 'utf8'); } catch { /* missing file surfaces as absent guard */ }
    return { file: f, present: guardPresent(src) };
  });

  const violations = [];
  let scannedTestFiles = 0;
  let importingTestFiles = 0;
  for (const full of walk(join(root, 'tests'))) {
    const rel = relOf(full, root);
    let src;
    try { src = readFileSync(full, 'utf8'); } catch { continue; }
    scannedTestFiles++;
    if (!TRANSPORT_IMPORT_RE.test(src)) continue;
    importingTestFiles++;
    if (importsNonNetworkOnly(src)) continue;
    if (hasFetchMockEvidence(src)) continue;
    if (allowlist[rel]) continue;
    violations.push({ file: rel, reason: 'imports a transport module directly with no fetch-mock evidence in the same file' });
  }

  return { partA, violations, scannedTestFiles, importingTestFiles };
}

/**
 * SELF-TEST: prove both extractors can still see a positive AND a negative before trusting them.
 */
export function selfTest() {
  const problems = [];
  if (!guardPresent("if (shouldRefuseRealSend()) { return refused; }")) {
    problems.push('guardPresent() failed to detect a present guard call');
  }
  if (guardPresent("// no guard here at all")) {
    problems.push('guardPresent() false-positived on source with no guard call');
  }
  if (!hasFetchMockEvidence("vi.stubGlobal('fetch', fetchMock);")) {
    problems.push('hasFetchMockEvidence() failed to detect vi.stubGlobal evidence');
  }
  if (!hasFetchMockEvidence("global.fetch = mockFetch;")) {
    problems.push('hasFetchMockEvidence() failed to detect a direct global.fetch assignment');
  }
  if (hasFetchMockEvidence("// nothing mocked here")) {
    problems.push('hasFetchMockEvidence() false-positived on source with no mock evidence');
  }
  if (!hasFetchMockEvidence("vi.mock('../../../lib/notifications/resend-adapter.js', () => ({ sendEmail: vi.fn() }));")) {
    problems.push('hasFetchMockEvidence() failed to detect a vi.mock() module-level mock');
  }
  if (!importsNonNetworkOnly("import { verifyInboundSignature } from '../../../lib/messaging/providers/twilio-provider.js';")) {
    problems.push('importsNonNetworkOnly() failed to detect a pure signature-only import');
  }
  return problems.length
    ? `extractor self-test FAILED: ${problems.join('; ')} -- this lint cannot see its own patterns and its verdict is meaningless`
    : null;
}

function main(argv = process.argv.slice(2)) {
  const asJson = argv.includes('--json');
  const rootIdx = argv.indexOf('--root');
  const root = rootIdx >= 0 && argv[rootIdx + 1] ? resolve(argv[rootIdx + 1]) : ROOT;

  const broken = selfTest();
  if (broken) { console.error(`❌ transport-test-isolation-guard-lint: ${broken}`); return 1; }

  let result;
  try { result = scan({ root }); } catch (e) { console.error(`transport-test-isolation-guard-lint: ${e.message}`); return 1; }
  const { partA, violations, scannedTestFiles, importingTestFiles } = result;

  if (asJson) {
    const missingGuards = partA.filter((p) => !p.present);
    console.log(JSON.stringify(result, null, 2));
    return violations.length || missingGuards.length ? 1 : 0;
  }

  console.log(`transport-test-isolation-guard-lint: scanned ${scannedTestFiles} test file(s); `
    + `${importingTestFiles} import a guarded transport directly.`);

  let failed = false;
  for (const p of partA) {
    if (p.present) {
      console.log(`✅ guard present in ${p.file}`);
    } else {
      console.error(`❌ guard MISSING in ${p.file} -- shouldRefuseRealSend( call not found`);
      failed = true;
    }
  }

  if (violations.length) {
    console.error(`\n❌ ${violations.length} test file(s) import a transport module with no fetch-mock evidence:\n`);
    for (const v of violations) console.error(`   ${v.file}  (${v.reason})`);
    console.error(`\n   FIX: mock fetch in the test (vi.stubGlobal('fetch', ...) or global.fetch = ...),`);
    console.error(`   or add a reason to ${relOf(ALLOWLIST_PATH)}.`);
    failed = true;
  } else {
    console.log(`✅ all ${importingTestFiles} test file(s) importing a guarded transport show fetch-mock evidence.`);
  }

  return failed ? 1 : 0;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (invokedDirectly) process.exit(main());
