#!/usr/bin/env node
/**
 * Escape-budget freeze for the schema-reference lint.
 * SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-C (FR-3).
 *
 * THE FAILURE THIS EXISTS FOR — a zero that was bought rather than earned. The lint has exactly two
 * escape hatches: an allowlist (scripts/lint/schema-reference-allowlist.json) and an inline
 * `schema-lint-disable-line` pragma. Both are legitimate for a genuinely dynamic reference, and both
 * are indistinguishable, in the final "0 violations" line, from actually fixing the code. Once the
 * whole-tree count reaches zero and `--all` becomes blocking, the cheapest way past a red build
 * stops being "repair the reference" and becomes "add one line to the allowlist". Nothing observed
 * that drift, so the number would keep reading zero while the thing it measures quietly emptied out.
 *
 * WHAT IT DOES: recomputes both budgets at the MERGE BASE and at HEAD and fails when either grew,
 * naming what was added. Removals always pass — this is a ceiling, not a fixed value, so repairing
 * a suppressed reference is never punished.
 *
 * WHY THE BASELINE IS COMPUTED, NEVER COMMITTED (TR-3): a stored count is a number that goes stale
 * silently and then means nothing. This SD watched its own pragma baseline move DURING its LEAD
 * phase — a sibling agent's untracked script quoted the pragma string and the tree-wide count went
 * 232 -> 233 with no schema change whatsoever. A literal committed that morning would already have
 * been wrong by lunchtime. Deriving both sides from git at run time makes the comparison immune to
 * that, and makes "the baseline" mean the same thing on every branch.
 *
 * KNOWN LIMITATION — what this check CANNOT see:
 *  1. IT COUNTS OCCURRENCES, NOT SUPPRESSION. A pragma on a line with no schema reference, or an
 *     allowlist entry for a file that no longer exists, counts exactly like a live suppression.
 *     Equally, MOVING a pragma from one real violation to another is invisible: the total is flat.
 *  2. IT CANNOT SEE A WIDENED ENTRY. An allowlist `tables` entry changed from one narrow table to a
 *     broader one, or a file entry rewritten to cover a whole directory, keeps the COUNT identical
 *     while covering more. Only growth in NUMBER is detected, never growth in REACH.
 *  3. IT CANNOT SEE THE THIRD ESCAPE. Deleting or renaming a file removes its violations without
 *     touching either budget, and so does moving code into a directory the lint does not scan
 *     (anything outside RUNTIME_DIRS, or matching SKIP_DIR_RE such as one-off/ or archive/).
 *  4. IT DOES NOT COUNT PRAGMAS INSIDE THE LINT'S OWN SOURCES. PRAGMA_DEFINITION_FILES below is
 *     excluded from the census because those occurrences declare and document the pragma rather
 *     than suppress anything. The hole this leaves is real and narrow: a GENUINE suppression added
 *     inside one of those three files would not move the budget. The alternative was worse — this
 *     check failed itself on its own first PR, reporting its own introduction as escape growth.
 *  5. IT IS BLIND WHEN THE BASE IS UNRESOLVABLE. A shallow or partial clone makes the baseline
 *     unknowable; this reports that and exits 0 rather than inventing a comparison. That is a
 *     deliberate fail-open, and it is a real hole: a PR whose base cannot be fetched is unchecked.
 *     NOTE the deliberate ASYMMETRY with the pragma census below: an unresolvable BASE is a
 *     known-and-announced environment condition, whereas a census that FAILED MID-MEASUREMENT is an
 *     absent reading that would otherwise be reported as a count. The first fails open and says so;
 *     the second fails CLOSED (SEC-1). A guard may decline to run; it may never report a number it
 *     did not take.
 */

// SEC-2 (security review 16fd6043): use the PUBLISHED hardened runner rather than re-deriving
// base-ref validation and a bare execFileSync by hand. The sibling schema-reference-lint.mjs already
// does this; hand-rolling it here is the exact re-derivation that module was published to abolish,
// and it skipped the fsmonitor / pager / textconv / env-scrub hardening the rest of the repo treats
// as mandatory.
import { VALID_BASE_REF, makeHardenedGitRunner } from '../../lib/git/hardened-runner.cjs';

const ALLOWLIST_PATH = 'scripts/lint/schema-reference-allowlist.json';
const PRAGMA = 'schema-lint-disable-line';
// Mirrors scripts/lint/schema-reference-lint.mjs:52-54 — a pragma outside the scanned set suppresses
// nothing, so counting it would make the budget respond to files the lint never reads.
const RUNTIME_DIRS = ['scripts', 'lib', 'src', 'server', 'api', 'app'];
const CODE_EXTS = ['js', 'cjs', 'mjs', 'ts', 'tsx', 'jsx'];

/**
 * Files that DEFINE or DOCUMENT the pragma rather than being suppressed by it. Their occurrences
 * are the constant declaration and its prose explanation — not suppression sites.
 *
 * THIS EXCLUSION EXISTS BECAUSE THIS CHECK FAILED ITSELF ON ITS OWN FIRST PR, and the original
 * reasoning was wrong in an instructive way. The first version noted that definitional occurrences
 * "are counted on both sides so they cancel" — true only for a file present on BOTH revs. A NEW
 * file exists only at HEAD, so its 2 definitional occurrences were pure growth, and this check
 * reported its own introduction as someone widening an escape. That is the same shape as the FR-1
 * defect in this SD: a control matching its own documentation.
 */
export const PRAGMA_DEFINITION_FILES = new Set([
  'scripts/lint/schema-reference-extract.mjs',  // const PRAGMA + the skip-rule docblock
  'scripts/lint/schema-reference-lint.mjs',     // the escape-hatch guidance printed on failure
  'scripts/lint/schema-lint-escape-budget.mjs', // this file
]);

const git = makeHardenedGitRunner(process.cwd(), {
  literalPathspecs: false, // pathspec globs below are intentional; matches the sibling lint's recorded opt-out
  timeout: 60000,
  maxBuffer: 64 * 1024 * 1024,
});

/**
 * SEC-1 discriminator, exported so the distinction is TESTED rather than asserted in a comment.
 *
 * git grep's contract: exit status 1 means "searched successfully, found nothing" — a real zero.
 * Any other failure (maxBuffer kill, timeout, bad rev, git missing) means the search did not
 * complete, and its result is ABSENT, not zero. Everything hinges on this being strict: treating a
 * crashed search as an empty result is how a control reports clean because it could not look.
 *
 * @param {any} e error thrown by the git runner
 * @returns {boolean} true ONLY for a completed search that matched nothing
 */
export function isNoMatchesError(e) {
  return !!e && e.status === 1;
}

/** Pathspecs restricting the pragma census to files the lint actually scans. */
export function pragmaPathspecs() {
  return RUNTIME_DIRS.flatMap((d) => CODE_EXTS.map((e) => `${d}/**/*.${e}`));
}

/**
 * Allowlist entry counts at a git rev. A missing/unparseable file yields zeros — at the BASE that
 * correctly reads as "the budget started empty", and at HEAD a malformed allowlist is the lint's
 * own problem to report, not this check's to guess at.
 */
export function allowlistCountsAt(rev) {
  let raw;
  try { raw = git(['show', `${rev}:${ALLOWLIST_PATH}`]); } catch { return { files: 0, tables: 0 }; }
  try {
    const j = JSON.parse(raw);
    return { files: (j.files || []).length, tables: (j.tables || []).length };
  } catch { return { files: 0, tables: 0 }; }
}

/** The allowlist's actual entries at a rev, so a growth failure can NAME what was added. */
export function allowlistEntriesAt(rev) {
  let raw;
  try { raw = git(['show', `${rev}:${ALLOWLIST_PATH}`]); } catch { return { files: [], tables: [] }; }
  try {
    const j = JSON.parse(raw);
    return { files: j.files || [], tables: j.tables || [] };
  } catch { return { files: [], tables: [] }; }
}

/**
 * Total pragma occurrences at a rev, as a Map<file, count>, so growth can be attributed to a file
 * rather than reported as a bare number. `git grep -o` prints one line per occurrence, which is why
 * a file with two pragmas on different lines counts twice — matching how the lint applies them.
 */
export function pragmaCountsAt(rev) {
  let out = '';
  try {
    out = git(['grep', '-o', '-F', PRAGMA, rev, '--', ...pragmaPathspecs()]);
  } catch (e) {
    // SEC-1 (security review 16fd6043): DISTINGUISH "no matches" FROM "could not look".
    //
    // This catch previously swallowed EVERY failure and returned an empty Map, so a
    // maxBuffer-exceeded throw read as "zero pragmas at HEAD" — compareBudgets would then see the
    // count DROP and report "neither escape budget grew". A PR large enough to blow the 64MB buffer
    // would defeat this control by SCALE rather than by counter-gaming it, and it would pass while
    // reporting success. That is precisely the reporting-clean-because-you-could-not-look shape this
    // whole workstream exists to abolish, and it was sitting inside the control built to enforce it.
    //
    // git grep's contract: exit 1 means "no matches" (a real, trustworthy zero) and status > 1 means
    // the search itself failed. Anything without status === 1 — a maxBuffer kill (e.code
    // ERR_CHILD_PROCESS_STDIO_MAXBUFFER), a timeout, a missing rev — is an ABSENT MEASUREMENT and
    // must never be reported as a count.
    if (isNoMatchesError(e)) return new Map(); // genuinely no matches
    const detail = e && (e.code || e.message) ? (e.code || e.message) : 'unknown';
    const err = new Error(
      `PRAGMA_CENSUS_UNMEASURABLE at ${rev}: git grep did not complete (${detail}). `
      + 'Refusing to report a count that was never taken — an unmeasurable census is ABSENT, not zero.'
    );
    err.unmeasurable = true;
    throw err;
  }
  const counts = new Map();
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    // `<rev>:<path>:<match>` — split on the first two colons only; a path cannot contain a colon here.
    const rest = line.slice(line.indexOf(':') + 1);
    const file = rest.slice(0, rest.indexOf(':'));
    if (!file) continue;
    if (PRAGMA_DEFINITION_FILES.has(file)) continue; // defines/documents the pragma, is not suppressed by it
    counts.set(file, (counts.get(file) || 0) + 1);
  }
  return counts;
}

const total = (m) => [...m.values()].reduce((a, b) => a + b, 0);

/**
 * Pure comparison, so the verdict is unit-testable without a git repo.
 * @returns {{ok:boolean, failures:string[], summary:object}}
 */
export function compareBudgets(base, head) {
  const failures = [];
  if (head.allowlist.files > base.allowlist.files) {
    const added = head.entries.files.filter((f) => !base.entries.files.includes(f));
    failures.push(
      `allowlist \`files\` grew ${base.allowlist.files} -> ${head.allowlist.files}`
      + (added.length ? `: added ${added.map((a) => JSON.stringify(a)).join(', ')}` : '')
    );
  }
  if (head.allowlist.tables > base.allowlist.tables) {
    const added = head.entries.tables.filter((t) => !base.entries.tables.includes(t));
    failures.push(
      `allowlist \`tables\` grew ${base.allowlist.tables} -> ${head.allowlist.tables}`
      + (added.length ? `: added ${added.map((a) => JSON.stringify(a)).join(', ')}` : '')
    );
  }
  const baseTotal = total(base.pragmas);
  const headTotal = total(head.pragmas);
  if (headTotal > baseTotal) {
    const perFile = [];
    for (const [file, n] of head.pragmas) {
      const was = base.pragmas.get(file) || 0;
      if (n > was) perFile.push(`${file} (${was} -> ${n})`);
    }
    failures.push(
      `inline \`${PRAGMA}\` pragmas grew ${baseTotal} -> ${headTotal}`
      + (perFile.length ? `: ${perFile.join('; ')}` : '')
    );
  }
  return {
    ok: failures.length === 0,
    failures,
    summary: {
      allowlist_files: { base: base.allowlist.files, head: head.allowlist.files },
      allowlist_tables: { base: base.allowlist.tables, head: head.allowlist.tables },
      pragmas: { base: baseTotal, head: headTotal },
    },
  };
}

function resolveBase() {
  const raw = process.env.SCHEMA_LINT_BASE || 'origin/main';
  // SEC-2: use the PUBLISHED allowlist (VALID_BASE_REF) rather than a hand-rolled blocklist. A
  // blocklist enumerates the bad shapes someone thought of; the allowlist states what is permitted.
  // Same predicate the sibling lint uses at schema-reference-lint.mjs:161 — one representation.
  if (!VALID_BASE_REF.test(raw)) {
    console.error(`schema-lint-escape-budget: refusing SCHEMA_LINT_BASE with option-like or unsafe shape: ${raw}`);
    process.exit(2);
  }
  try { return git(['merge-base', raw, 'HEAD']).trim(); } catch { return null; }
}

function main() {
  const base = resolveBase();
  if (!base) {
    // KNOWN LIMITATION 5: an unknowable baseline is reported, never invented.
    console.warn('⚠️  schema-lint-escape-budget: could not resolve a merge base — SKIPPING (advisory, exit 0). The escape budgets were NOT checked for this run.');
    return 0;
  }
  const snapshot = (rev) => ({
    allowlist: allowlistCountsAt(rev),
    entries: allowlistEntriesAt(rev),
    pragmas: pragmaCountsAt(rev),
  });
  let result;
  try {
    result = compareBudgets(snapshot(base), snapshot('HEAD'));
  } catch (e) {
    // SEC-1: an UNMEASURABLE census must BLOCK, never pass. The failure this guards is a control
    // that could not look and said "nothing grew" — the same shape as an endpoint answering
    // "no items found" when the truth is "I could not check". Exit 1 so a human sees it.
    if (e && e.unmeasurable) {
      console.error(`\n❌ ${e.message}`);
      console.error('   The escape budgets were NOT compared. Treat this as BLOCKING, not as a pass.');
      return 1;
    }
    throw e;
  }
  const s = result.summary;
  console.log(
    `schema-lint-escape-budget: base=${base.slice(0, 8)} `
    + `allowlist files ${s.allowlist_files.base}->${s.allowlist_files.head}, `
    + `tables ${s.allowlist_tables.base}->${s.allowlist_tables.head}, `
    + `pragmas ${s.pragmas.base}->${s.pragmas.head}`
  );
  if (result.ok) {
    console.log('✅ schema-lint-escape-budget: neither escape budget grew.');
    return 0;
  }
  console.error('\n❌ schema-lint-escape-budget: an escape budget GREW. A finding silenced by an escape is not a finding fixed.\n');
  for (const f of result.failures) console.error(`   ${f}`);
  console.error(
    '\nIf the reference is genuinely dynamic or cross-schema, say so on the PR and a reviewer can accept the growth deliberately.\n'
    + 'Otherwise fix the reference instead of suppressing it — that is the whole point of the frozen budget.'
  );
  return 1;
}

// Only run when invoked directly, so the pure helpers above stay importable by tests.
if (process.argv[1] && process.argv[1].endsWith('schema-lint-escape-budget.mjs')) {
  process.exitCode = main();
}
