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
 * Usage:
 *   node scripts/lint/fixture-producer-guard-lint.mjs           # report, exit 1 on findings
 *   node scripts/lint/fixture-producer-guard-lint.mjs --json
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

/** True when the file routes its writes through the guard. */
export function usesGuard(src) {
  return /insertGuarded/.test(stripNonCode(src));
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

const relOf = (full) => full.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, '');

export function scan({ root = ROOT, allowlist = loadAllowlist() } = {}) {
  const violations = [];
  let scannedFiles = 0;
  let writeSites = 0;
  for (const sub of SCAN_ROOTS) {
    for (const full of walk(join(root, sub))) {
      const rel = relOf(full);
      let src;
      try { src = readFileSync(full, 'utf8'); } catch { continue; }
      scannedFiles++;
      const writes = findUnguardedWrites(src);
      if (!writes.length) continue;
      writeSites += writes.length;
      if (usesGuard(src)) continue;                       // converted
      if (allowlist[rel]) continue;                       // whole-file exemption, reason required
      for (const w of writes) {
        if (allowlist[`${rel}:${w.line}`]) continue;      // per-site exemption
        violations.push({ file: rel, ...w });
      }
    }
  }
  // COVERAGE, not existence: these counts are the point. A lint that reported only "the guard
  // exists" would give an identical verdict for 1 adopter and for 25.
  return { violations, scannedFiles, writeSites };
}

function main(argv = process.argv.slice(2)) {
  const asJson = argv.includes('--json');
  let result;
  try { result = scan(); } catch (e) { console.error(`fixture-producer-guard-lint: ${e.message}`); return 1; }
  const { violations, scannedFiles, writeSites } = result;
  if (asJson) { console.log(JSON.stringify(result, null, 2)); return violations.length ? 1 : 0; }

  console.log(`fixture-producer-guard-lint: scanned ${scannedFiles} file(s) across ${SCAN_ROOTS.length} root(s); `
    + `${writeSites} ${TABLE} write-site(s) found.`);
  if (!violations.length) {
    console.log('✅ every ventures write under the scanned roots routes through insertGuarded (or is allowlisted with a reason).');
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
