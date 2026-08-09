#!/usr/bin/env node
/**
 * Producer-guard COVERAGE lint. SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-D, FR-6.
 *
 * ── WHY THIS EXISTS AT ALL, stated plainly because the SD shipped a correction ──────────────────
 * The parent scope claimed scripts/lint/metadata-flag-lint.mjs already gave this SD free CI
 * enforcement. That claim was REFUTED three independent ways and deleted from the PRD:
 *   1. .github/workflows/metadata-flag-lint.yml sets continue-on-error:true and its own header
 *      says it CANNOT turn a PR red. The flip-to-blocking follow-up never happened.
 *   2. Its EXCLUDE_DIR_SEGMENTS drops tests/test/__tests__ and EXCLUDE_FILE_RE drops *.test.* —
 *      22 of the 25 real venture producers live under tests/ and are invisible to it.
 *   3. It is an EXISTENCE check, not a COVERAGE check: its live output is
 *      "HEALTHY is_fixture w=1 r=3", which is identical whether 1 producer or 25 adopt the marker.
 * (It was also measured RED on main at cdceaff1df3, while exiting 0 at this branch point — which
 * is why any citation of a lint's live state must PIN THE COMMIT.)
 *
 * So this lint is the COVERAGE half that did not exist. It answers one question: does every
 * producer that inserts a `ventures` row under the candidate roots go through the guard?
 *
 * ── WHAT IT FLAGS ──────────────────────────────────────────────────────────────────────────────
 * A direct `.from('ventures').insert(...)` / `.upsert(...)` under tests/integration,
 * tests/database, scripts/harness or scripts/canary that does NOT route through insertGuarded.
 * Reads are untouched — only writes create unguarded rows.
 *
 * ── THE ALLOWLIST IS NOT A BYPASS ──────────────────────────────────────────────────────────────
 * Shape copied from scripts/lint/fleet-liveness-select-lint.mjs: keys are '<repo-relative-file>'
 * or '<repo-relative-file>:<line>', values are free-text reasons, and loading THROWS if any reason
 * is blank. An escape hatch that accepts an empty justification has no author.
 *
 * ── KNOWN LIMITATION — what this control CANNOT see ────────────────────────────────────────────
 * Stated concretely, because a control that will not name its blind spots is asking to be read as
 * total coverage. Each of these is a write this lint will pass in silence:
 *
 *   1. A TABLE NAME THAT IS NOT A STRING LITERAL. The matcher requires a quoted 'ventures', so
 *      `const t = 'ventures'; sb.from(t).insert(row)` is invisible. This is the cheapest evasion
 *      and it is not hypothetical — it is ordinary refactoring.
 *   2. A WRITE BEHIND A WRAPPER. `db.createVenture(row)` or any helper that owns the .from() call
 *      emits no `.from('ventures')` token at the call site, so the producer is unseen.
 *   3. PRODUCERS OUTSIDE THE FOUR NAMED ROOTS. SCAN_ROOTS is enumerated, not globbed, so a
 *      ventures write in lib/, scripts/one-off/, or any new directory is out of scope by
 *      construction — deliberate, but it means "0 unguarded" is a statement about four roots.
 *   4. FK-DERIVED CHILD ROWS. Only `ventures` has a row-shaped predicate; venture_id- and
 *      sd_key-keyed children are excluded, so a synthetic child under a real parent is unseen.
 *   5. ANYTHING NOT IN SOURCE TEXT. Rows created by RPC, raw SQL, a migration, or a fixture
 *      loaded from JSON never appear to a static scan.
 *   6. IT PROVES ROUTING, NOT CORRECTNESS. A producer can route through insertGuarded and declare
 *      the WRONG classification; only the guard's own runtime asserts catch that, not this lint.
 *
 * Usage:
 *   node scripts/lint/fixture-producer-guard-lint.mjs           # report, exit 1 on findings
 *   node scripts/lint/fixture-producer-guard-lint.mjs --json
 *   node scripts/lint/fixture-producer-guard-lint.mjs --root D  # aim the scan at another tree
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const ROOT = resolve(HERE, '..', '..');
export const ALLOWLIST_PATH = join(HERE, 'fixture-producer-guard-allowlist.json');

/** The producer roots this SD scoped. Named, not globbed, so the boundary is deliberate. */
export const SCAN_ROOTS = Object.freeze([
  'tests/integration', 'tests/database', 'scripts/harness', 'scripts/canary',
]);

/** Only `ventures` has a row-shaped predicate today; the rest are FK-derived or unscoped. */
const TABLE = 'ventures';

/**
 * Strip comments and template/string bodies so prose about the pattern is never mistaken for the
 * pattern. Found the hard way elsewhere in this repo: a source assertion that cannot tell code from
 * the commentary about code reports on the wrong text.
 */
export function stripNonCode(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + m.slice(p1.length).replace(/[^\n]/g, ' '));
}

/**
 * Find unguarded venture writes. PURE over source text so it is testable without a filesystem.
 * @returns {Array<{line:number, snippet:string}>}
 */
export function findUnguardedWrites(src) {
  const clean = stripNonCode(src);
  const findings = [];
  const re = new RegExp(`\\.from\\(\\s*['"\`]${TABLE}['"\`]\\s*\\)`, 'g');
  let m;
  while ((m = re.exec(clean)) !== null) {
    // Look ahead for the verb, but ONLY within THIS statement's chain. A fixed-width window is a
    // false-positive generator: measured on the live tree, a bare 200-char lookahead flagged
    // `.from('ventures').select('id').limit(1)` in sd-completed-handler.test.js because an
    // unrelated `.insert(` sat nine lines further down. The chain ends at the first `;` or at the
    // next `.from(`, whichever comes first — a read must never be reported as an unguarded write.
    const rest = clean.slice(m.index + m[0].length, m.index + 600);
    const semi = rest.indexOf(';');
    const nextFrom = rest.search(/\.\s*from\s*\(/);
    const stops = [semi, nextFrom].filter((i) => i >= 0);
    const chain = stops.length ? rest.slice(0, Math.min(...stops)) : rest;
    if (!/\.\s*(insert|upsert)\s*\(/.test(chain)) continue;   // a read, not a write
    const line = clean.slice(0, m.index).split('\n').length;
    findings.push({ line, snippet: (m[0] + chain).replace(/\s+/g, ' ').slice(0, 110) });
  }
  return findings;
}

/**
 * Count GUARDED sites. This is the POSITIVE DENOMINATOR, and it exists because the first cut of
 * this lint had no way to tell "everything is converted" from "the extractor is blind".
 *
 * Two independent reviews landed the same finding: with only a violations count, mutating
 * findUnguardedWrites to `return []` produced output BYTE-IDENTICAL to the real green state. A
 * verdict that reads the same when the instrument is dead is not a verdict. So the run now reports
 * guarded sites too and FAILS if that number is zero — a lint that can no longer see anything says
 * so instead of congratulating itself.
 */
export function countGuardedWrites(src) {
  return (stripNonCode(src).match(/\binsertGuarded\s*\(/g) || []).length;
}

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
    else if (/\.(mjs|js|cjs)$/.test(n)) out.push(full);
  }
  return out;
};

// Root-relative, against the root ACTUALLY scanned. Hardcoding the module-level ROOT here made
// every path absolute once --root aimed the scan elsewhere, which broke both the allowlist keys
// and the seed-trial's filename-based detection.
const relOf = (full, root = ROOT) => full.replace(root, '').replace(/\\/g, '/').replace(/^\//, '');

export function scan({ root = ROOT, allowlist = loadAllowlist() } = {}) {
  const violations = [];
  let scannedFiles = 0;
  let rawWriteSites = 0;
  let guardedSites = 0;
  for (const sub of SCAN_ROOTS) {
    for (const full of walk(join(root, sub))) {
      const rel = relOf(full, root);
      let src;
      try { src = readFileSync(full, 'utf8'); } catch { continue; }
      scannedFiles++;
      guardedSites += countGuardedWrites(src);
      const writes = findUnguardedWrites(src);
      if (!writes.length) continue;
      rawWriteSites += writes.length;
      // NO WHOLE-FILE EXEMPTION. The first cut short-circuited here on `usesGuard(src)` — a
      // file-level /insertGuarded/ test — so ONE converted call site exempted every remaining raw
      // write in the same file. That made all 26 files this SD converted invisible to the gate it
      // landed, and reproduced at file granularity the exact existence-vs-coverage defect this
      // lint's own header indicts metadata-flag-lint for. Found independently by two reviews;
      // removing it is measured zero-risk, because a converted call site contains no
      // `.from('ventures')` and therefore was never counted as a raw write in the first place.
      if (allowlist[rel]) continue;                       // explicit whole-file exemption, reason required
      for (const w of writes) {
        if (allowlist[`${rel}:${w.line}`]) continue;      // per-site exemption
        violations.push({ file: rel, ...w });
      }
    }
  }
  return { violations, scannedFiles, rawWriteSites, guardedSites };
}

/**
 * SELF-TEST: prove the extractor can still SEE a violation before trusting it not to find one.
 *
 * A clean tree and a blind extractor print the same green — mutating findUnguardedWrites to
 * `return []` produced output byte-identical to a healthy pass. The guarded-site counter catches a
 * dead COUNTER but not a dead FINDER, so the finder gets its own positive control: a synthetic
 * unguarded write that MUST be flagged, and a read that must NOT be. Runs on every invocation
 * because a control you have to remember to run is one you eventually don't.
 */
export function selfTest() {
  const mustFlag = findUnguardedWrites("sb.from('ventures').insert({ name: 'x' });");
  const mustNotFlag = findUnguardedWrites("sb.from('ventures').select('id').limit(1);");
  if (mustFlag.length !== 1 || mustNotFlag.length !== 0) {
    return `extractor self-test FAILED (flagged ${mustFlag.length} write, ${mustNotFlag.length} read) `
      + '— this lint cannot see its own pattern and its verdict is meaningless';
  }
  return null;
}

function main(argv = process.argv.slice(2)) {
  const asJson = argv.includes('--json');
  // --root AIMS the scan at another tree. Required by the control-seed-test harness, which plants
  // a seeded defect in a scratch dir and must be able to point this lint at it: without a flag the
  // root is derived from this file's own location, so the lint would scan the REAL repo and report
  // a confident green about a tree the seed never touched.
  const rootIdx = argv.indexOf('--root');
  const root = rootIdx >= 0 && argv[rootIdx + 1] ? resolve(argv[rootIdx + 1]) : ROOT;
  const broken = selfTest();
  if (broken) { console.error(`❌ fixture-producer-guard-lint: ${broken}`); return 1; }
  let result;
  try { result = scan({ root }); } catch (e) { console.error(`fixture-producer-guard-lint: ${e.message}`); return 1; }
  const { violations, scannedFiles, rawWriteSites, guardedSites } = result;
  if (asJson) { console.log(JSON.stringify(result, null, 2)); return violations.length || !guardedSites ? 1 : 0; }

  console.log(`fixture-producer-guard-lint: scanned ${scannedFiles} file(s) across ${SCAN_ROOTS.length} root(s); `
    + `${guardedSites} guarded site(s), ${rawWriteSites} unguarded ${TABLE} write-site(s).`);

  // SELF-CHECK, and it is two-sided on purpose. Zero guarded sites means either every producer was
  // deleted or this extractor has gone blind — and a blind run would otherwise print the same green
  // as a healthy one. Refusing to pass on zero is what makes the ✅ mean something.
  if (!guardedSites) {
    console.error('\n❌ ZERO guarded sites found. Either every producer was removed, or this lint '
      + 'can no longer see its own pattern. Refusing to report success on an unverifiable scan.');
    return 1;
  }
  if (!violations.length) {
    console.log(`✅ all ${guardedSites} ${TABLE} write(s) under the scanned roots route through insertGuarded (or are allowlisted with a reason).`);
    return 0;
  }
  console.error(`\n❌ ${violations.length} unguarded ${TABLE} write(s) — each creates a row no producer-side assert ever checked:\n`);
  for (const v of violations) console.error(`   ${v.file}:${v.line}  ${v.snippet}`);
  console.error('\n   FIX: route the write through insertGuarded() from lib/governance/fixture-producer-guard.mjs,');
  console.error('   declaring the intended classification. Prefer fixing over allowlisting; an allowlist entry');
  console.error(`   requires a non-empty reason in ${relOf(ALLOWLIST_PATH)}.`);
  return 1;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (invokedDirectly) process.exit(main());
