// SD-ALTIFYAI-FDBK-FIX-HOUSEKEEPING-WEEKLY-REPORT-001, FR-2.
//
// Detects tracked files whose committed content is renormalization-dirty relative to a
// .gitattributes eol=lf rule -- the exact class of debt that broke the Housekeeping Weekly
// Report workflow (191488677): a checkout normalizes eol=lf paths to LF, but the committed
// blob still carries CRLF, so any stash/restore choreography sees a spurious conflict.
//
import { execFileSync } from 'node:child_process';
import { isMainModule } from '../../lib/utils/is-main-module.js';

// PARSING CONTRACT (do not "simplify" this): `git ls-files --eol` emits
//   "i/<state> w/<state> attr/<attrs...>\t<path>"
// with variable padding and attrs itself sometimes containing a space ("text eol=lf"). A
// prospective testing-agent review (evidence a4d4ba87-2a56-4912-a8b0-cbd3e3d16a2e) measured
// two naive parses against this repo's actual output and both were wrong: `grep crlf` over the
// whole line over-reports by ~339x (it also matches the w/crlf half of a legitimate i/lf w/crlf
// autocrlf-contributor line), and `grep -v lf` never fires because "attr/text eol=lf" always
// contains the substring "lf". EOL_LINE_RE anchors on the TAB before the path and captures the
// three fields positionally so the attr field's internal space can never be mistaken for a
// field boundary.
const EOL_LINE_RE = /^(i\/\S+)\s+(w\/\S+)\s+attr\/(.*?)\t(.*)$/;

export function parseEolLine(line) {
  const m = line.match(EOL_LINE_RE);
  if (!m) return null;
  const [, iField, , attr, filePath] = m;
  return { index: iField.slice(2), attr: attr.trim(), path: filePath };
}

// Attribute-derived scope, not a hardcoded extension glob: this repo has already added an
// eol=lf pin once (*.sql, after *.js/*.mjs/*.cjs), and a glob-scoped detector would have missed
// it silently the same way the original SD's root cause went unnoticed for two weeks.
export function isEolManaged(parsed) {
  return /\beol=lf\b/.test(parsed.attr);
}

// INCLUSION list, never exclusion of "lf": excluding only `!= lf` permanently false-positives on
// i/-text (binary/NUL-containing) paths, which --renormalize can never fix, and would newly
// false-positive on the first i/none (empty file) committed under an eol=lf path.
const DIRTY_INDEX_STATES = new Set(['crlf', 'mixed']);

export function isRenormalizationDirty(parsed) {
  return DIRTY_INDEX_STATES.has(parsed.index);
}

// Deliberately-deferred paths, out of THIS SD's renormalization scope. Each entry requires a
// non-empty rationale (enforced below) and the list's length is asserted by a test
// (tests/unit/eol-renormalization-lint.test.js) -- so a silent, unreviewed addition fails loudly
// instead of the allowlist rotting into a blanket suppression.
export const ALLOWLIST = [
  {
    path: 'database/migrations/20251221_rls_delete_policy_fixes.sql',
    rationale: 'Migration file: a line-ending-only change could still alter a chairman-approval '
      + 'content hash (see .gitattributes’ own comment on its *.sql eol=lf pin). Deferred to a '
      + 'separate follow-up, not fixed by SD-ALTIFYAI-FDBK-FIX-HOUSEKEEPING-WEEKLY-REPORT-001.',
  },
  {
    path: 'docs/chairman-decision-queue-capture-2026-08-03/fn_chairman_decide.LIVE.sql',
    rationale: 'Same approval-hash sensitivity as the migration file above.',
  },
];

/**
 * Pure evaluator over already-split `git ls-files --eol` lines. Takes an injectable allowlist so
 * tests can exercise stale-entry / missing-rationale behavior without depending on live repo
 * state (see TS-1..TS-6 in the paired test file).
 */
export function evaluate(lines, allowlist = ALLOWLIST) {
  const managed = lines.map(parseEolLine).filter(Boolean).filter(isEolManaged);
  const managedPaths = new Set(managed.map((p) => p.path));
  const dirty = managed.filter(isRenormalizationDirty);
  const dirtyPaths = new Set(dirty.map((p) => p.path));
  const allowlistedPaths = new Set(allowlist.map((a) => a.path));

  const violations = dirty.filter((p) => !allowlistedPaths.has(p.path));

  // Stale in either direction: already fixed (no longer dirty) or gone entirely (renamed,
  // deleted, or the eol=lf attribute itself was removed from the path).
  const staleEntries = allowlist.filter(
    (entry) => !managedPaths.has(entry.path) || !dirtyPaths.has(entry.path)
  );
  const missingRationale = allowlist.filter((e) => !e.rationale || !e.rationale.trim());

  return {
    violations,
    staleEntries,
    missingRationale,
    managedCount: managed.length,
    dirtyCount: dirty.length,
    ok: violations.length === 0 && staleEntries.length === 0 && missingRationale.length === 0,
  };
}

function main() {
  const raw = execFileSync('git', ['ls-files', '--eol'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const lines = raw.split('\n').filter(Boolean);
  const result = evaluate(lines);

  console.log(`[eol-renormalization-lint] scanned ${result.managedCount} eol=lf-managed path(s), ${result.dirtyCount} renormalization-dirty, allowlist=${ALLOWLIST.length} entries`);

  if (result.violations.length > 0) {
    console.error(`\n❌ ${result.violations.length} un-allowlisted file(s) are eol=lf-managed but not renormalized:`);
    for (const v of result.violations) console.error(`   ${v.path} (index=${v.index})`);
    console.error('   Fix: git add --renormalize -- <paths>, verify via `git diff --cached --ignore-cr-at-eol` is empty, commit.');
  }
  if (result.staleEntries.length > 0) {
    console.error(`\n❌ ${result.staleEntries.length} ALLOWLIST entry(ies) are stale (already fixed, renamed, or no longer eol=lf-managed):`);
    for (const s of result.staleEntries) console.error(`   ${s.path} — remove from ALLOWLIST in scripts/lint/eol-renormalization-lint.mjs`);
  }
  if (result.missingRationale.length > 0) {
    console.error(`\n❌ ${result.missingRationale.length} ALLOWLIST entry(ies) missing a non-empty rationale string.`);
  }
  if (result.ok) {
    console.log('✅ OK — no renormalization debt outside the reviewed allowlist.');
  }

  // process.exitCode rather than process.exit(): matches this repo's other lint drivers
  // (e.g. scripts/lint/no-process-cwd-in-sub-agents-lint.mjs) to avoid a Windows libuv race
  // that can turn a clean exit into a spurious 127.
  process.exitCode = result.ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  main();
}
