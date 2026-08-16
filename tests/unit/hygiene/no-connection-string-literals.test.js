// SD-LEO-FIX-STRIP-DEAD-DB-CREDENTIAL-LITERALS-001, FR-3/FR-4.
//
// Assertion B's fixtures are SYNTHETIC throwaway strings, never the real known-bad credential.
// Each test computes its own fixture's sha256 at test time and injects it via the `hashes`
// param that findHashMatches/evaluateFiles both accept -- the real SECRET_HASHES constant
// (holding the actual incident's digests) is exercised only by its own shape-contract test
// below, which checks {length, sha256-hex-format}, never a value that could satisfy it.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  URL_SHAPE_RE,
  SECRET_HASHES,
  PATH_ALLOWLIST,
  VALUE_ALLOWLIST_PATTERNS,
  SELF_PATHS,
  isAllowlistedValue,
  isAllowlistedPath,
  isSelfPath,
  findUrlShapeMatches,
  findHashMatches,
  evaluateFiles,
} from '../../../scripts/lint/no-connection-string-literals-lint.mjs';

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// Builds a fake connection-string fixture from parts so this file's own SOURCE never contains
// the literal scheme://user:pass@ shape as a contiguous run. .husky/pre-commit's structural
// secret scanner has no allowlist of its own (unlike the guard under test here) and correctly
// flags ANY match in an added diff line, fictional test fixture or not.
function pgUrl(user, password, hostPath, scheme = 'postgresql') {
  return [scheme, '://', user, ':', password, '@', hostPath].join('');
}

describe('URL_SHAPE_RE / findUrlShapeMatches: assertion A shape detection', () => {
  it('matches a postgresql:// URL with a credential-shaped password slot', () => {
    const matches = findUrlShapeMatches(`psql '${pgUrl('postgres.ref', 'somesecret', 'host:5432/db')}'`);
    expect(matches).toHaveLength(1);
    expect(matches[0].passwordSlot).toBe('somesecret');
  });

  it('matches a bare postgres:// scheme too', () => {
    const matches = findUrlShapeMatches(pgUrl('user', 'pw', 'host/db', 'postgres'));
    expect(matches).toHaveLength(1);
    expect(matches[0].passwordSlot).toBe('pw');
  });

  it('does not match a URL with no password slot', () => {
    expect(findUrlShapeMatches('postgresql://host:5432/db')).toHaveLength(0);
  });

  it('does not match plain prose mentioning "postgres" without a URL shape', () => {
    expect(findUrlShapeMatches('We migrated postgres to the pooler last year.')).toHaveLength(0);
  });

  it('extracts the user:password separator, not the scheme "://" colon', () => {
    const matches = findUrlShapeMatches(pgUrl('postgres.dedlbzhpgkmetvhbkyzq', 'Fake123', 'aws-1.pooler.supabase.com:5432/postgres'));
    expect(matches[0].passwordSlot).toBe('Fake123');
  });

  it('URL_SHAPE_RE source contains no literal "://" run (self-exclusion by construction)', () => {
    expect(URL_SHAPE_RE.source.includes('://')).toBe(false);
  });

  // F4 from an adversarial review of an earlier draft: extracting text after the LAST colon
  // before '@' (rather than the FIRST colon after the scheme) let a real secret embedded
  // earlier in the credential slot hide behind a trailing marker-shaped decoy.
  it('extracts everything after the FIRST colon, not just the text after the last one -- ' +
     'a real secret cannot hide behind a trailing marker-shaped decoy', () => {
    const line = pgUrl('user', 'REALSECRETVALUE:REDACTED', 'host/db');
    const matches = findUrlShapeMatches(line);
    expect(matches[0].passwordSlot).toBe('REALSECRETVALUE:REDACTED');
    // and therefore does NOT match any allowlist family (unlike the bare "REDACTED" it would
    // have extracted under the old last-colon logic)
    expect(isAllowlistedValue(matches[0].passwordSlot)).toBe(false);
  });
});

describe('isAllowlistedValue: the 6 documented marker families', () => {
  it.each([
    ['angle-bracket-marker', '<URL_ENCODED_PASSWORD>'],
    ['square-bracket-marker', '[PASSWORD]'],
    ['your-my-convention', 'YOUR_PASSWORD'],
    ['env-var-reference (${...})', '${SUPABASE_DB_PASSWORD}'],
    ['env-var-reference ($VAR)', '$SUPABASE_DB_PASSWORD'],
    ['redaction-mask (***)', '****'],
    ['redaction-mask (REDACTED)', 'REDACTED'],
    ['bare-marker-word', 'PASSWORD'],
  ])('recognizes %s: %s', (_label, value) => {
    expect(isAllowlistedValue(value)).toBe(true);
  });

  it('does not allowlist an unwrapped fictional example password', () => {
    expect(isAllowlistedValue('Pass!word!')).toBe(false);
  });

  it('does not allowlist an empty string', () => {
    expect(isAllowlistedValue('')).toBe(false);
  });

  // Discovered via a live scan of this repo's full tracked tree (17.8k files), not guessed --
  // ${encodeURIComponent(password)}-style expressions are live JS template-literal CODE
  // interpolating a variable at runtime, never a literal credential. See scripts/lib/
  // supabase-connection.js, src/services/pool-manager.js, and the scripts/archive/one-time/
  // apply-*-migration.js family for real occurrences of this exact shape.
  it.each([
    '${encodeURIComponent(password)}',
    '${process.env.SUPABASE_DB_PASSWORD}',
    '${password}',
  ])('recognizes a JS template-literal expression as code, not a value: %s', (value) => {
    expect(isAllowlistedValue(value)).toBe(true);
  });

  // F4 from an adversarial review of an earlier draft: a greedy `.+` inside `${...}` let the
  // pattern span TWO separate template expressions with a real secret sandwiched between them.
  it('does NOT allowlist a real secret sandwiched between two separate ${...} expressions', () => {
    expect(isAllowlistedValue('${a}REALSECRETVALUE${b}')).toBe(false);
  });

  // F5 from the same review: the marker-word family used to be case-insensitive, exempting
  // real (if weak) lowercase credentials that happen to spell the word "password".
  it.each(['password', 'Password', 'secret', 'Token'])(
    'does NOT allowlist a lowercase/mixed-case bare word (real weak credential, not a marker): %s',
    (value) => {
      expect(isAllowlistedValue(value)).toBe(false);
    },
  );
});

describe('isAllowlistedPath / isSelfPath', () => {
  it('recognizes a PATH_ALLOWLIST entry', () => {
    expect(isAllowlistedPath('docs/guides/supabase-connectivity.md')).toBe(true);
  });

  it('does not allowlist an arbitrary path', () => {
    expect(isAllowlistedPath('scripts/some-other-file.mjs')).toBe(false);
  });

  // Discovered via the same live scan: the scanner definition file and every *.test.* / tests/
  // path are legitimate assertion-A exemptions (assertion B still covers them -- see the
  // evaluateFiles test below proving the pattern-based tests/ exemption does NOT suppress B).
  it.each([
    '.husky/pre-commit',
    'CONTRIBUTING.md',
    'database/migrations/EXECUTION-GUIDE.md',
    'docs/reference/session-summary-feature.md',
    'tests/e2e/session-summary.test.js',
    'tests/unit/checkin/resume-final-reads-holds.test.js',
    'scripts/worker-signal.test.js',
  ])('allowlists %s (exact path or tests/*.test.* pattern)', (path) => {
    expect(isAllowlistedPath(path)).toBe(true);
  });

  it('recognizes the guard file and its own test as self-paths', () => {
    expect(isSelfPath('scripts/lint/no-connection-string-literals-lint.mjs')).toBe(true);
    expect(isSelfPath('tests/unit/hygiene/no-connection-string-literals.test.js')).toBe(true);
  });
});

describe('findHashMatches: assertion B sliding-window hash detection (synthetic fixtures)', () => {
  const fixture = 'Zq9!fakeSecret1'; // 15 chars, throwaway, never the real credential
  const testHashes = [{ length: fixture.length, sha256: sha256(fixture), note: 'synthetic-fixture' }];

  it('finds the fixture value embedded inside a longer line', () => {
    const { hits } = findHashMatches(`SUPABASE_DB_PASSWORD=${fixture}`, testHashes);
    expect(hits).toHaveLength(1);
    expect(hits[0].note).toBe('synthetic-fixture');
  });

  it('finds the fixture value when it IS the whole line', () => {
    expect(findHashMatches(fixture, testHashes).hits).toHaveLength(1);
  });

  it('does not match a different string of the identical length', () => {
    const decoy = 'Zq9!fakeSecret2'; // same length, last char differs
    expect(decoy).toHaveLength(fixture.length);
    expect(findHashMatches(decoy, testHashes).hits).toHaveLength(0);
  });

  it('never matches a line shorter than the window length', () => {
    expect(findHashMatches(fixture.slice(0, -1), testHashes).hits).toHaveLength(0);
  });

  it('finds multiple independent hash families in the same line', () => {
    const other = 'AnotherFake99'; // 13 chars
    const multiHashes = [...testHashes, { length: other.length, sha256: sha256(other), note: 'second-fixture' }];
    const { hits } = findHashMatches(`${fixture} and ${other}`, multiHashes);
    expect(hits.map((h) => h.note).sort()).toEqual(['second-fixture', 'synthetic-fixture']);
  });

  it('finds the fixture inside a long line as long as no SINGLE token exceeds the cap ' +
     '(assertion B is bounded per token, not per line)', () => {
    const longButNormal = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' '); // ~2800 chars, short tokens
    const { hits, skipped } = findHashMatches(`${longButNormal} ${fixture}`, testHashes);
    expect(hits).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it('skips (and reports) a single token that exceeds the token-length cap, without affecting other tokens', () => {
    const giantToken = 'x'.repeat(20000); // over MAX_TOKEN_LENGTH (16384)
    const { hits, skipped } = findHashMatches(`${giantToken} ${fixture}`, testHashes);
    expect(hits).toHaveLength(1); // the fixture, in its own separate token, is still found
    expect(skipped).toEqual([{ length: giantToken.length }]);
  });
});

describe('evaluateFiles: end-to-end, both assertions, allowlist interplay', () => {
  const fixture = 'Zq9!fakeSecret1';
  const testHashes = [{ length: fixture.length, sha256: sha256(fixture), note: 'synthetic-fixture' }];

  it('flags a plain assertion-A violation in an ordinary tracked file', () => {
    const files = [{ path: 'scripts/example.mjs', content: `const url = '${pgUrl('u', 'realsecretvalue', 'host/db')}';` }];
    const result = evaluateFiles(files, { hashes: testHashes });
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].assertion).toBe('A');
  });

  it('suppresses assertion A when the password slot is an allowlisted marker', () => {
    const files = [{ path: 'scripts/example.mjs', content: `const url = '${pgUrl('u', '[PASSWORD]', 'host/db')}';` }];
    const result = evaluateFiles(files, { hashes: testHashes });
    expect(result.ok).toBe(true);
  });

  it('suppresses assertion A for a PATH_ALLOWLIST file even with a non-marker password slot', () => {
    const files = [{
      path: 'docs/guides/supabase-connectivity.md',
      content: `psql '${pgUrl('postgres.ref', 'Pass!word!', 'host/db')}'`,
    }];
    const result = evaluateFiles(files, { hashes: testHashes });
    expect(result.ok).toBe(true);
  });

  it('suppresses assertion A for a pattern-matched test file (tests/ dir), non-marker password slot', () => {
    const files = [{
      path: 'tests/unit/example.test.js',
      content: `const conn = '${pgUrl('admin', 's3cr3t', 'host/db')}';`,
    }];
    const result = evaluateFiles(files, { hashes: testHashes });
    expect(result.ok).toBe(true);
  });

  it('does NOT suppress assertion B inside a pattern-matched test file either', () => {
    const files = [{ path: 'tests/unit/example.test.js', content: fixture }];
    const result = evaluateFiles(files, { hashes: testHashes });
    expect(result.ok).toBe(false);
    expect(result.violations[0].assertion).toBe('B');
  });

  it('does NOT suppress assertion B inside a PATH_ALLOWLIST file (path-allowlist narrows A only)', () => {
    const files = [{
      path: 'docs/guides/supabase-connectivity.md',
      content: `some unrelated line\n${fixture}\nanother line`,
    }];
    const result = evaluateFiles(files, { hashes: testHashes });
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].assertion).toBe('B');
    expect(result.violations[0].line).toBe(2);
  });

  it('suppresses assertion A for a self-path file (a fictional example in the guard\'s own comments)', () => {
    const files = [{
      path: 'scripts/lint/no-connection-string-literals-lint.mjs',
      content: `const url = '${pgUrl('u', 'realsecretvalue', 'host/db')}';`,
    }];
    const result = evaluateFiles(files, { hashes: testHashes });
    expect(result.ok).toBe(true);
  });

  // F1 from an adversarial review of an earlier draft: evaluateFiles() used to `continue` past
  // a self-path entirely, silently disabling assertion B too -- exactly the file (the guard's
  // own test) a future maintainer is most likely to paste the real plaintext into.
  it('does NOT suppress assertion B for a self-path file (F1 regression -- this must never ' +
     'go back to `continue`-ing past self-paths entirely)', () => {
    const files = [{
      path: 'scripts/lint/no-connection-string-literals-lint.mjs',
      content: fixture,
    }];
    const result = evaluateFiles(files, { hashes: testHashes });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      { file: 'scripts/lint/no-connection-string-literals-lint.mjs', line: 1, assertion: 'B', detail: expect.stringContaining('synthetic-fixture') },
    ]);
  });

  it('assertion A is not line-length-bounded -- a violation deep inside a long line is still caught', () => {
    const longPadding = 'x'.repeat(5000);
    const files = [{
      path: 'scripts/example.mjs',
      content: `${longPadding} ${pgUrl('u', 'realsecretvalue', 'host/db')}`,
    }];
    const result = evaluateFiles(files, { hashes: testHashes });
    expect(result.ok).toBe(false);
    expect(result.violations[0].assertion).toBe('A');
  });

  it('assertion B skips only a pathologically long TOKEN, not the whole line, and reports it via skippedTokens', () => {
    const giantToken = 'y'.repeat(20000);
    const files = [{
      path: 'scripts/example.mjs',
      content: `${giantToken} ${fixture}`,
    }];
    const result = evaluateFiles(files, { hashes: testHashes });
    expect(result.ok).toBe(false); // fixture, in its own token, is still found
    expect(result.violations[0].assertion).toBe('B');
    expect(result.skippedTokens).toEqual([{ file: 'scripts/example.mjs', line: 1, length: giantToken.length }]);
  });

  it('reports correct file/line across multiple files evaluated together', () => {
    const files = [
      { path: 'a.mjs', content: 'clean line one\nclean line two' },
      { path: 'b.mjs', content: `clean\nconst url = '${pgUrl('u', 'realsecretvalue', 'host/db')}';` },
    ];
    const result = evaluateFiles(files, { hashes: testHashes });
    expect(result.violations).toEqual([
      { file: 'b.mjs', line: 2, assertion: 'A', detail: expect.stringContaining('postgresql://') },
    ]);
  });

  it('reports zero violations for an all-clean file set', () => {
    const files = [{ path: 'a.mjs', content: 'nothing to see here\nreally, nothing' }];
    expect(evaluateFiles(files, { hashes: testHashes }).ok).toBe(true);
  });
});

describe('SECRET_HASHES contract (real constant — shape only, never a satisfying value)', () => {
  it('has exactly 2 entries (fails loudly if silently grown)', () => {
    expect(SECRET_HASHES).toHaveLength(2);
  });

  it('every entry is a well-formed 64-hex-char sha256 digest with a positive integer length', () => {
    for (const entry of SECRET_HASHES) {
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isInteger(entry.length)).toBe(true);
      expect(entry.length).toBeGreaterThan(0);
      expect(typeof entry.note).toBe('string');
      expect(entry.note.length).toBeGreaterThan(0);
    }
  });

  it('the two entries cover distinct lengths (the two known encodings)', () => {
    const lengths = SECRET_HASHES.map((e) => e.length);
    expect(new Set(lengths).size).toBe(lengths.length);
  });
});

describe('VALUE_ALLOWLIST_PATTERNS / PATH_ALLOWLIST / SELF_PATHS contracts', () => {
  it('has exactly 6 marker families', () => {
    expect(VALUE_ALLOWLIST_PATTERNS).toHaveLength(6);
  });

  it('every marker family has a name and a RegExp', () => {
    for (const entry of VALUE_ALLOWLIST_PATTERNS) {
      expect(typeof entry.name).toBe('string');
      expect(entry.re).toBeInstanceOf(RegExp);
    }
  });

  it('every PATH_ALLOWLIST entry has a non-empty rationale', () => {
    for (const entry of PATH_ALLOWLIST) {
      expect(entry.rationale.trim().length).toBeGreaterThan(0);
    }
  });

  it('SELF_PATHS contains exactly the guard file and its own test', () => {
    expect(SELF_PATHS.size).toBe(2);
  });
});
