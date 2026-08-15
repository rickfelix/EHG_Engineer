// SD-LEO-FIX-STRIP-DEAD-DB-CREDENTIAL-LITERALS-001, FR-3/FR-4.
//
// Hardened tree-at-rest guard: scans every git-tracked file for two independent, unrelated
// signals so either one alone is sufficient to fail the check.
//
// Assertion A (structural): a postgres(ql):// URL shape with something in the password slot.
// Mirrors .husky/pre-commit's own scanner pattern (scheme, then a colon-delimited credential
// slot ending in '@') — deliberately PURELY STRUCTURAL, no knowledge of any specific
// credential, so it also fires on a
// documented marker in the password slot (see VALUE_ALLOWLIST_PATTERNS) unless the value is
// recognized as a marker, or the file is a reference doc that legitimately shows connection-
// string shapes (see PATH_ALLOWLIST — narrows assertion A only, never assertion B below).
//
// Assertion B (content): the ACTUAL known-bad credential value, in either encoding, detected
// via a length-bounded sliding-window SHA-256 comparison rather than a literal string match.
// This is deliberate: embedding the plaintext anywhere in this guard's own source would be
// exactly the class of exposure this SD exists to close. Because SECRET_HASHES holds only
// {length, sha256} pairs, this file is self-exclusion-safe for assertion B BY CONSTRUCTION —
// finding a substring that hashes to a stored digest is computationally infeasible, so this
// guard can never flag itself no matter how the source is phrased or reformatted.
//
// Assertion A's self-exclusion is not as automatic (a shape regex, unlike a hash compare, COULD
// in principle match adversarial text), so SELF_PATHS adds an explicit path exclusion as a
// second, independent safeguard on top of the regex's own escaped-slash construction (see
// URL_SHAPE_RE below) never containing a literal "://" run in this file's own source text.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isMainModule } from '../../lib/utils/is-main-module.js';

// Escaped slashes (\/\/  rather than //) are not cosmetic: they mean this file's own source
// text never contains a literal "://" 3-character run, so assertion A structurally cannot
// match this file's own pattern definition even before SELF_PATHS is consulted.
export const URL_SHAPE_RE = /postgres(?:ql)?:\/\/[^\s'"`]+:[^\s'"@]+@/;

// {length, sha256} pairs for the known-dead credential (rotated 2026-08-15T22:40:46Z — see
// strategic_directives_v2.metadata.credential_validity_probe), in both encodings it appeared
// in across the tree. Never the plaintext. A sliding window of the exact LENGTH is hashed and
// compared, so this list can only ever grow by adding another {length, sha256} pair, never a
// literal value.
export const SECRET_HASHES = [
  { length: 18, sha256: '3a6157e77d6a1702c932da50c2718c74e287850c6a1d45362cdbf7c3fb6a63a7', note: 'url-encoded form' },
  { length: 14, sha256: '027815e1921626ed2078c557acf22e31b48c947a52a9829496c830ccb5c66fc4', note: 'raw-decoded form' },
];

// Bounds total scan cost on a pathological single-line file (minified bundle, generated
// lockfile) rather than any backtracking risk in the patterns above, which are linear.
const MAX_LINE_LENGTH = 4096;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export const SELF_PATHS = new Set([
  'scripts/lint/no-connection-string-literals-lint.mjs',
  'tests/unit/hygiene/no-connection-string-literals.test.js',
]);

// Assertion-A-only exemptions: reference docs whose entire purpose is illustrating connection-
// string shapes (including deliberate anti-pattern examples), the scanner's own pattern
// definition, and test fixtures that legitimately exercise parsing/redaction logic against a
// fictional example credential. Assertion B still scans every one of these files in full --
// the actual leaked value must never reappear anywhere, reference doc or test fixture or not.
// Measured against this repo's full 17.8k-file tracked tree (not guessed): every entry here
// corresponds to an actual false positive the live scan produced.
export const PATH_ALLOWLIST = [
  {
    path: 'docs/guides/supabase-connectivity.md',
    rationale: 'Connectivity reference guide: shows the connection-string shape multiple times, '
      + 'including a deliberate "what NOT to do" shell-escaping example with a fictional password.',
  },
  {
    path: 'docs/06_deployment/ci-cd-secrets-consolidated-report.md',
    rationale: 'Secrets/deployment reference doc in the same genre -- catalogs connection-string '
      + 'shapes for operational reference.',
  },
  {
    path: '.husky/pre-commit',
    rationale: 'Contains the secret scanner\'s own grep -oiE regex pattern as literal shell text '
      + '-- a pattern DEFINITION naming the shape, not an instance of it.',
  },
  {
    path: 'CONTRIBUTING.md',
    rationale: 'Contributor guide: illustrative connection-string URL with a generic user/pass example.',
  },
  {
    path: 'database/migrations/EXECUTION-GUIDE.md',
    rationale: 'Migration execution reference: illustrative connection-string URL with a fictional example password.',
  },
  {
    path: 'docs/reference/session-summary-feature.md',
    rationale: 'Feature reference doc: illustrative connection-string URL with a generic user/pass example.',
  },
  {
    pattern: /(^|\/)tests\//,
    rationale: 'Test fixtures legitimately contain fictional example connection strings to '
      + 'exercise parsing/redaction logic (e.g. tests/unit/session-summary/secret-redactor.test.js '
      + 'testing the redactor itself needs an unredacted example to redact).',
  },
  {
    pattern: /\.test\.(js|mjs|cjs|ts)$/,
    rationale: 'Same rationale as the tests/ pattern, for test files living outside the tests/ '
      + 'directory (e.g. scripts/worker-signal.test.js).',
  },
];

// Six marker/placeholder families a password slot may legitimately hold in documentation or
// code. Structural (bracket/template-expression/case convention), not tied to any specific
// wording, so future docs and code using the same conventions are covered without an
// allowlist edit.
export const VALUE_ALLOWLIST_PATTERNS = [
  { name: 'angle-bracket-marker', re: /^<[^<>]+>$/ },
  { name: 'square-bracket-marker', re: /^\[[^[\]]+\]$/ },
  { name: 'your-my-convention', re: /^(YOUR|MY)_[A-Z0-9_]+$/ },
  // Any ${...} / $VAR / %VAR% reference -- deliberately broad on the ${...} case (not just
  // ${SIMPLE_VAR}): ${encodeURIComponent(password)} and ${process.env.SUPABASE_DB_PASSWORD}
  // are live JS template-literal CODE interpolating a variable at runtime, never a literal
  // value -- exactly the "template-literal prefix, not an embedded credential" false-positive
  // class this SD's own LEAD-phase investigation found in the original (wrong) premise.
  { name: 'template-or-env-var-reference', re: /^(\$\{.+\}|\$[A-Za-z0-9_]+|%[A-Za-z0-9_]+%)$/ },
  { name: 'redaction-mask', re: /^(\*{3,}|[xX]{3,}|REDACTED)$/i },
  { name: 'bare-marker-word', re: /^(PASSWORD|SECRET|CREDENTIAL|TOKEN)$/i },
];

export function isAllowlistedValue(text) {
  return VALUE_ALLOWLIST_PATTERNS.some((p) => p.re.test(text));
}

export function isAllowlistedPath(filePath, allowlist = PATH_ALLOWLIST) {
  return allowlist.some((e) => (e.path && e.path === filePath) || (e.pattern && e.pattern.test(filePath)));
}

export function isSelfPath(filePath, selfPaths = SELF_PATHS) {
  return selfPaths.has(filePath);
}

// The password slot is the text between the LAST ':' before '@' and '@' itself -- lastIndexOf
// searches backward from just before '@', so it lands on the user:password separator rather
// than the earlier scheme "://" colon.
function extractPasswordSlot(matchText) {
  const atIdx = matchText.lastIndexOf('@');
  const colonIdx = matchText.lastIndexOf(':', atIdx - 1);
  return matchText.slice(colonIdx + 1, atIdx);
}

export function findUrlShapeMatches(line) {
  const re = new RegExp(URL_SHAPE_RE.source, 'g');
  const matches = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    matches.push({ matchText: m[0], passwordSlot: extractPasswordSlot(m[0]) });
  }
  return matches;
}

// A whole-line character-by-character slide is O(line_length) SHA-256 calls PER hash family,
// regardless of content -- measured catastrophic at repo scale (17.8k tracked files: minutes,
// not seconds). A real connection-string credential is always a single unbroken non-whitespace
// token (whitespace inside one would break the URL/env-var syntax it lives in), so restricting
// the slide to within each whitespace-delimited token cuts an ordinary line (many short tokens,
// none reaching the window length) to zero hash calls, while still finding the credential
// anywhere within a long token (a URL, an env-var value, a base64 blob). This intentionally
// cannot catch a credential word-wrapped mid-token across a line break -- not a realistic
// placement for a connection-string value, and unbounded whole-line scanning is not tractable.
export function findHashMatches(line, hashes = SECRET_HASHES) {
  const hits = [];
  if (line.length > MAX_LINE_LENGTH) return hits;
  const tokens = line.match(/\S+/g);
  if (!tokens) return hits;
  for (const entry of hashes) {
    for (const token of tokens) {
      for (let i = 0; i + entry.length <= token.length; i++) {
        const window = token.slice(i, i + entry.length);
        if (createHash('sha256').update(window, 'utf8').digest('hex') === entry.sha256) {
          hits.push({ note: entry.note });
        }
      }
    }
  }
  return hits;
}

/**
 * Pure evaluator over already-loaded {path, content} pairs, so tests can exercise allowlist /
 * self-exclusion / hash-match behavior without depending on live repo state or git.
 */
export function evaluateFiles(files, { pathAllowlist = PATH_ALLOWLIST, selfPaths = SELF_PATHS, hashes = SECRET_HASHES } = {}) {
  const violations = [];

  for (const { path: filePath, content } of files) {
    if (isSelfPath(filePath, selfPaths)) continue;
    const skipAssertionA = isAllowlistedPath(filePath, pathAllowlist);
    const lines = content.split('\n');

    lines.forEach((line, i) => {
      const lineNumber = i + 1;
      if (line.length > MAX_LINE_LENGTH) return;

      if (!skipAssertionA) {
        for (const match of findUrlShapeMatches(line)) {
          if (!isAllowlistedValue(match.passwordSlot)) {
            violations.push({ file: filePath, line: lineNumber, assertion: 'A', detail: match.matchText });
          }
        }
      }

      for (const hit of findHashMatches(line, hashes)) {
        violations.push({ file: filePath, line: lineNumber, assertion: 'B', detail: `known-bad value (${hit.note})` });
      }
    });
  }

  return { violations, ok: violations.length === 0 };
}

function loadTrackedFiles() {
  const raw = execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const paths = raw.split('\n').filter(Boolean);
  const files = [];
  for (const p of paths) {
    try {
      const buf = readFileSync(p);
      if (buf.length > MAX_FILE_BYTES) continue;
      files.push({ path: p, content: buf.toString('utf8') });
    } catch {
      continue; // binary decode failure, deleted-since-ls-files, permission error -- not a violation
    }
  }
  return files;
}

function main() {
  const files = loadTrackedFiles();
  const result = evaluateFiles(files);

  console.log(`[no-connection-string-literals-lint] scanned ${files.length} tracked file(s)`);

  if (!result.ok) {
    console.error(`\n❌ ${result.violations.length} connection-string-literal violation(s):`);
    for (const v of result.violations) {
      console.error(`   ${v.file}:${v.line} [assertion ${v.assertion}] ${v.detail}`);
    }
    console.error('   Fix: remove the literal, use an env var, or use a documented marker (see VALUE_ALLOWLIST_PATTERNS in this file).');
  } else {
    console.log('✅ OK — no connection-string literals found.');
  }

  // process.exitCode rather than process.exit(): matches this repo's other lint drivers
  // (e.g. scripts/lint/eol-renormalization-lint.mjs) to avoid a Windows libuv race that can
  // turn a clean exit into a spurious failure.
  process.exitCode = result.ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  main();
}
