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
//
// KNOWN LIMITATION: assertion B cannot catch a credential that is word-wrapped mid-token
// across a line break, or constructed at runtime via string concatenation/decoding rather than
// appearing as a literal contiguous token (verified during an adversarial review of an earlier
// draft: recovering the real rotated credential from git history and testing both encodings
// confirmed neither is split by whitespace in any of its actual occurrences, so this gap is
// real but not observed to matter for the incident this guard exists to prevent). Assertion A
// is a heuristic covering unknown-future secrets by SHAPE; it is not the security backstop
// (assertion B is) and can be defeated by a credential built entirely from runtime expressions
// with no literal shape at all -- e.g. `new URL(scheme + host).toString()`.
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
// literal value. ROTATED/DEAD VALUES ONLY: a sha256 digest of an unsalted secret is a crackable
// offline oracle for anyone who reads this file, so never add a hash for a value that is still
// live -- rotate first, then add the digest here as a permanent regression check.
export const SECRET_HASHES = [
  { length: 18, sha256: '3a6157e77d6a1702c932da50c2718c74e287850c6a1d45362cdbf7c3fb6a63a7', note: 'url-encoded form' },
  { length: 14, sha256: '027815e1921626ed2078c557acf22e31b48c947a52a9829496c830ccb5c66fc4', note: 'raw-decoded form' },
];

// Assertion A's regex cost is linear in line length (no backtracking risk -- the character
// classes are all negated, single-step matches), so it is run against every line regardless of
// length. Assertion B is bounded per TOKEN, not per line (see MAX_TOKEN_LENGTH below) --
// tokenizing first already makes an ordinary long line cheap, so a line-wide cutoff would only
// ever discard genuine coverage (a real credential can sit anywhere in a long line, e.g. a long
// comment or a long list) without buying back any real cost protection.
const MAX_TOKEN_LENGTH = 16384;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

// Assertion-A-only, same rule as PATH_ALLOWLIST below: assertion B is NEVER path-exempted,
// including for these two files. An adversarial review of an earlier draft caught a real bug
// here -- evaluateFiles() used to `continue` past a self-path entirely, silently disabling
// assertion B for exactly the file (this guard's own test) a future maintainer is most likely
// to paste the real plaintext into "to check the hash matches".
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
    path: 'CLAUDE_CORE.md',
    rationale: 'Protocol doc: an explicit "wrong, do not do this" connection example with a literal '
      + 'PROJECT placeholder token in both the username and host positions.',
  },
  {
    path: 'scripts/__tests__/replay/README.md',
    rationale: 'Documents a DIFFERENT pattern-detection system\'s own regex convention '
      + '(postgres_conn_with_password) as a reference table -- a pattern DEFINITION, same class '
      + 'as the .husky/pre-commit entry above, not an instance of the shape.',
  },
  {
    path: 'scripts/audit/control-seed-specs.json',
    rationale: 'The control-seed-test-lint gate registry: this control\'s own entry commits a '
      + 'deliberately fake, structurally-shaped credential as a seeded-defect fixture, proving '
      + 'this guard can fire (see scripts/lint/control-seed-test-lint.mjs). Found by this guard '
      + 'flagging its own registry entry on the first live scan after that spec was committed --'
      + ' correct behavior for an un-allowlisted file, which is exactly what this entry fixes.',
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
  // [^{}]+ (not .+) is load-bearing: a greedy .+ lets this match SPAN two separate ${...}
  // expressions with a real secret sandwiched between them (e.g. "${a}REALSECRET${b}") --
  // excluding brace characters forces exactly one balanced expression per match.
  { name: 'template-or-env-var-reference', re: /^(\$\{[^{}]+\}|\$[A-Za-z0-9_]+|%[A-Za-z0-9_]+%)$/ },
  { name: 'redaction-mask', re: /^(\*{3,}|[xX]{3,}|REDACTED)$/i },
  // Case-SENSITIVE (no /i): the all-caps convention is what documentation markers actually use
  // (PASSWORD, YOUR_PASSWORD); a real weak credential is far more likely spelled "password" or
  // "Password123", which this deliberately does NOT exempt.
  { name: 'bare-marker-word', re: /^(PASSWORD|SECRET|CREDENTIAL|TOKEN)$/ },
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

// The password slot is the text between the FIRST ':' after the scheme separator and '@'.
// Deliberately the FIRST colon, not the last one before '@': a real user:password delimiter
// never repeats, so using the LAST colon let a value like "user:REALSECRET:MARKER@" extract
// only the trailing "MARKER" as the checked slot, silently allowlisting the embedded real
// secret sitting in what this parse would otherwise treat as part of the username.
function extractPasswordSlot(matchText) {
  const schemeEnd = matchText.indexOf('://') + 3;
  const colonIdx = matchText.indexOf(':', schemeEnd);
  const atIdx = matchText.lastIndexOf('@');
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
//
// Bounded per TOKEN (MAX_TOKEN_LENGTH), not per line: an ordinary long line (many short tokens)
// costs nothing extra regardless of its total length, so only a single pathologically long
// unbroken token (a minified blob, a giant base64 chunk) is ever skipped -- and that skip is
// reported via `skipped`, never silent.
export function findHashMatches(line, hashes = SECRET_HASHES) {
  const hits = [];
  const skipped = [];
  const tokens = line.match(/\S+/g);
  if (!tokens) return { hits, skipped };
  for (const token of tokens) {
    if (token.length > MAX_TOKEN_LENGTH) {
      skipped.push({ length: token.length });
      continue;
    }
    for (const entry of hashes) {
      for (let i = 0; i + entry.length <= token.length; i++) {
        const window = token.slice(i, i + entry.length);
        if (createHash('sha256').update(window, 'utf8').digest('hex') === entry.sha256) {
          hits.push({ note: entry.note });
        }
      }
    }
  }
  return { hits, skipped };
}

/**
 * Pure evaluator over already-loaded {path, content} pairs, so tests can exercise allowlist /
 * self-exclusion / hash-match behavior without depending on live repo state or git.
 *
 * SELF_PATHS and PATH_ALLOWLIST both narrow assertion A ONLY. Assertion B is never
 * path-exempted for ANY file, including the guard's own source and test: B is
 * self-exclusion-safe by construction (finding a substring that hashes to a stored digest is
 * computationally infeasible without the plaintext), so it needs no exemption -- and the guard's
 * own test file is exactly where a future maintainer is most likely to paste the real value "to
 * check the hash matches", which a path exemption would silently swallow.
 */
export function evaluateFiles(files, { pathAllowlist = PATH_ALLOWLIST, selfPaths = SELF_PATHS, hashes = SECRET_HASHES } = {}) {
  const violations = [];
  const skippedTokens = [];

  for (const { path: filePath, content } of files) {
    const skipAssertionA = isSelfPath(filePath, selfPaths) || isAllowlistedPath(filePath, pathAllowlist);
    const lines = content.split('\n');

    lines.forEach((line, i) => {
      const lineNumber = i + 1;

      if (!skipAssertionA) {
        for (const match of findUrlShapeMatches(line)) {
          if (!isAllowlistedValue(match.passwordSlot)) {
            violations.push({ file: filePath, line: lineNumber, assertion: 'A', detail: match.matchText });
          }
        }
      }

      const { hits, skipped } = findHashMatches(line, hashes);
      for (const hit of hits) {
        violations.push({ file: filePath, line: lineNumber, assertion: 'B', detail: `known-bad value (${hit.note})` });
      }
      for (const s of skipped) {
        skippedTokens.push({ file: filePath, line: lineNumber, length: s.length });
      }
    });
  }

  return { violations, ok: violations.length === 0, skippedTokens };
}

function loadTrackedFiles() {
  // -z: NUL-delimited output. Plain `git ls-files` quote-escapes any path with non-ASCII or
  // special characters (core.quotePath, on by default) as e.g. "caf\303\251.md" -- a string
  // readFileSync can't open, silently dropping that file via the catch below with zero
  // indication. -z sidesteps quoting entirely and hands back raw path bytes.
  const raw = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const paths = raw.split('\0').filter(Boolean);
  const files = [];
  const skippedFiles = [];
  for (const p of paths) {
    try {
      const buf = readFileSync(p);
      if (buf.length > MAX_FILE_BYTES) {
        skippedFiles.push({ path: p, bytes: buf.length });
        continue;
      }
      files.push({ path: p, content: buf.toString('utf8') });
    } catch {
      continue; // binary decode failure, deleted-since-ls-files, permission error -- not a violation
    }
  }
  return { files, skippedFiles };
}

function main() {
  const { files, skippedFiles } = loadTrackedFiles();
  const result = evaluateFiles(files);

  console.log(`[no-connection-string-literals-lint] scanned ${files.length} tracked file(s)`);

  // No silent caps: a bounded scan that never reports what it dropped reads as "covered
  // everything" when it didn't.
  if (skippedFiles.length > 0) {
    console.log(`⚠ skipped ${skippedFiles.length} file(s) over the ${MAX_FILE_BYTES}-byte cap (not scanned):`);
    for (const s of skippedFiles) console.log(`   ${s.path} (${s.bytes} bytes)`);
  }
  if (result.skippedTokens.length > 0) {
    console.log(`⚠ skipped ${result.skippedTokens.length} token(s) over the ${MAX_TOKEN_LENGTH}-char cap for assertion B (not hash-scanned):`);
    for (const s of result.skippedTokens) console.log(`   ${s.file}:${s.line} (token length ${s.length})`);
  }

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
