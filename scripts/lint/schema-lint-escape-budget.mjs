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
 */

import { execFileSync } from 'node:child_process';

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

const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

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
  } catch {
    return new Map(); // no matches at all -> git grep exits 1
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
  // Mirrors the lint's refusal (schema-reference-lint.mjs:160-165): an option-shaped base is an
  // attack indicator, not a transient fault, and must never be absorbed by a fail-open path.
  if (/^-/.test(raw) || /[\s;|&$`]/.test(raw)) {
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
  const result = compareBudgets(snapshot(base), snapshot('HEAD'));
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
