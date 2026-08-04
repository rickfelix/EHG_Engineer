// SD-LEO-INFRA-FIVE-GUARDS-WIRED-001 (FR-3, FR-4).
//
// The guard flags brace-alternation entries in workflow paths:/paths-ignore: blocks, because
// GitHub Actions does not expand braces and such an entry matches NOTHING — the workflow
// stays green and never fires on the source it polices.
//
// EVERY FLAGGING TEST HERE HAS A NON-FLAGGING TWIN. That is deliberate and is the whole
// point: the defect under repair is a guard that could not fail, so a suite proving only
// that this guard PASSES would reproduce the exact problem one level up.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  findBraceGlobEntries,
  hasBraceAlternation,
  expandBraceEntry,
  collectPathEntries,
  resolveWorkflowFiles,
  GHA_MATCH_OPTS,
} from '../../../scripts/lint/workflow-path-filter-lint.mjs';

const FIXTURE = 'tests/fixtures/workflow-yaml/bad-brace-glob-paths.yml';

describe('GHA_MATCH_OPTS — the calibration that must not drift', () => {
  // minimatch EXPANDS BRACES BY DEFAULT, which is the opposite of GitHub Actions. A matcher
  // built with default options reports 4729 matches for a filter that really matches zero
  // files, and goes green on the bug. Losing nobrace does not break a test elsewhere — it
  // silently makes the whole instrument agree with the defect. So it is pinned here.
  it('sets nobrace, without which the instrument commits the defect it detects', () => {
    expect(GHA_MATCH_OPTS.nobrace).toBe(true);
  });

  it('sets dot, so a dotfile path like .github/** is matchable', () => {
    expect(GHA_MATCH_OPTS.dot).toBe(true);
  });

  it('is frozen, so a caller cannot mutate the shared calibration', () => {
    expect(Object.isFrozen(GHA_MATCH_OPTS)).toBe(true);
  });
});

describe('hasBraceAlternation', () => {
  it('FLAGS the exact shape that broke five workflows in this repo', () => {
    expect(hasBraceAlternation('scripts/**/*.{js,mjs,cjs,ts}')).toBe(true);
  });

  it('FLAGS a two-alternative brace group', () => {
    expect(hasBraceAlternation('lib/**/*.{ts,tsx}')).toBe(true);
  });

  // The non-flagging twin. These are the entries that DO fire today and must stay untouched.
  it('does NOT flag a literal per-extension glob', () => {
    expect(hasBraceAlternation('scripts/**/*.js')).toBe(false);
  });

  it('does NOT flag a plain path or a bare ** glob', () => {
    expect(hasBraceAlternation('database/migrations/**/*.sql')).toBe(false);
    expect(hasBraceAlternation('.github/workflows/some-lint.yml')).toBe(false);
    expect(hasBraceAlternation('**.md')).toBe(false);
  });

  it('does NOT throw or flag on a non-string entry', () => {
    expect(hasBraceAlternation(null)).toBe(false);
    expect(hasBraceAlternation(42)).toBe(false);
    expect(hasBraceAlternation(undefined)).toBe(false);
  });
});

describe('expandBraceEntry', () => {
  it('expands to exactly the entries the filter was MEANT to be — no more, no fewer', () => {
    expect(expandBraceEntry('scripts/**/*.{js,mjs,cjs,ts}')).toEqual([
      'scripts/**/*.js',
      'scripts/**/*.mjs',
      'scripts/**/*.cjs',
      'scripts/**/*.ts',
    ]);
  });

  it('preserves the prefix and suffix around the brace group', () => {
    expect(expandBraceEntry('a/b/**/*.{x,y}.bak')).toEqual(['a/b/**/*.x.bak', 'a/b/**/*.y.bak']);
  });

  it('tolerates whitespace inside the group', () => {
    expect(expandBraceEntry('lib/**/*.{ts, tsx}')).toEqual(['lib/**/*.ts', 'lib/**/*.tsx']);
  });

  it('returns the entry unchanged when there is nothing to expand', () => {
    expect(expandBraceEntry('scripts/**/*.js')).toEqual(['scripts/**/*.js']);
  });

  it('does not widen coverage — expansion count equals the alternative count', () => {
    // Coverage preservation is a stated acceptance criterion: the fix must be an expansion,
    // never a widening. If this ever returns more entries than there were alternatives, the
    // suggestion is telling someone to broaden a filter they only meant to repair.
    const entry = 'server/**/*.{js,mjs,cjs,ts,tsx}';
    expect(expandBraceEntry(entry)).toHaveLength(5);
  });
});

describe('collectPathEntries', () => {
  it('reads BOTH paths and paths-ignore, across multiple triggers', () => {
    const doc = {
      on: {
        pull_request: { paths: ['a/**/*.js'] },
        push: { branches: ['main'], 'paths-ignore': ['docs/**/*.md'] },
      },
    };
    const got = collectPathEntries(doc);
    expect(got).toHaveLength(2);
    expect(got.map((e) => e.key).sort()).toEqual(['paths', 'paths-ignore']);
  });

  it('returns nothing for a workflow with no path filters at all', () => {
    // FR-4: the meta-lint's own workflow carries NO paths: key by design, so this is the
    // shape it must handle without complaint.
    const doc = { on: { pull_request: {}, push: { branches: ['main'] }, workflow_dispatch: null } };
    expect(collectPathEntries(doc)).toEqual([]);
  });

  it('survives a YAML 1.1 parse where the `on` key came through as boolean true', () => {
    expect(collectPathEntries({ true: { pull_request: { paths: ['a/*.{js,ts}'] } } })).toHaveLength(1);
  });

  it('does not throw on a malformed or empty document', () => {
    expect(collectPathEntries(null)).toEqual([]);
    expect(collectPathEntries({})).toEqual([]);
    expect(collectPathEntries({ on: 'push' })).toEqual([]);
  });

  // REGRESSION — this shape was SILENTLY SKIPPED by the first implementation, which guarded
  // on Array.isArray and moved on. A scalar `paths:` is off-spec for GitHub Actions, but
  // declining to examine it is the very behaviour this lint exists to abolish: the failure is
  // never "the guard said no", it is "the guard never looked". Found by adversarial review,
  // not by the original suite, which is why it now has a test of its own.
  it('examines a SCALAR paths: value instead of skipping it', () => {
    const got = collectPathEntries({ on: { pull_request: { paths: 'scripts/**/*.{js,ts}' } } });
    expect(got).toHaveLength(1);
    expect(got[0].entry).toBe('scripts/**/*.{js,ts}');
  });

  it('flags a brace-glob written as a scalar paths-ignore value', () => {
    const yamlSrc = "name: S\non:\n  push:\n    paths-ignore: 'docs/**/*.{md,mdx}'\njobs:\n  n:\n    runs-on: ubuntu-latest\n";
    const res = findBraceGlobEntries(yamlSrc, { filename: 'scalar.yml' });
    expect(res.ok).toBe(false);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].key).toBe('paths-ignore');
  });

  it('still ignores a scalar that is perfectly legal', () => {
    // The non-flagging twin, so the normalisation cannot be mistaken for flag-everything.
    const got = collectPathEntries({ on: { pull_request: { paths: 'scripts/**/*.js' } } });
    expect(got).toHaveLength(1);
    expect(hasBraceAlternation(got[0].entry)).toBe(false);
  });
});

describe('findBraceGlobEntries — the two-sided control over the fixture', () => {
  const raw = readFileSync(FIXTURE, 'utf8');

  it('DETECTS the deliberately broken entries', () => {
    const res = findBraceGlobEntries(raw, { filename: FIXTURE });
    expect(res.parsed).toBe(true);
    expect(res.ok).toBe(false);
    expect(res.violations).toHaveLength(3);
  });

  it('does NOT flag the literal entries sitting in the SAME paths block', () => {
    // The half that makes the previous test mean something. A guard that flagged the whole
    // block would also make that test pass.
    const flagged = findBraceGlobEntries(raw, { filename: FIXTURE }).violations.map((v) => v.entry);
    expect(flagged).not.toContain('lib/**/*.js');
    expect(flagged).not.toContain('.github/workflows/fixture.yml');
  });

  it('reads paths-ignore too — a dead exclusion over-fires rather than under-fires', () => {
    const keys = findBraceGlobEntries(raw, { filename: FIXTURE }).violations.map((v) => v.key);
    expect(keys).toContain('paths-ignore');
  });

  it('reports a real 1-indexed line number pointing at the offending entry', () => {
    const v = findBraceGlobEntries(raw, { filename: FIXTURE }).violations
      .find((x) => x.entry === 'scripts/**/*.{js,mjs,cjs,ts}');
    expect(v.line).toBeGreaterThan(0);
    const lineText = raw.split(/\r?\n/)[v.line - 1];
    // Assert the reported line actually CONTAINS the entry. A line number that merely looks
    // plausible sends a reader to the wrong place, which is worse than naming only the file.
    expect(lineText).toContain('scripts/**/*.{js,mjs,cjs,ts}');
  });

  it('carries the corrected expansion with each violation', () => {
    const v = findBraceGlobEntries(raw, { filename: FIXTURE }).violations
      .find((x) => x.entry === 'server/**/*.{ts,tsx}');
    expect(v.expansion).toEqual(['server/**/*.ts', 'server/**/*.tsx']);
  });
});

describe('findBraceGlobEntries — clean and unparseable inputs', () => {
  it('passes a workflow whose filters are all literal', () => {
    const clean = [
      'name: Clean',
      'on:',
      '  pull_request:',
      '    paths:',
      "      - 'scripts/**/*.js'",
      "      - 'scripts/**/*.mjs'",
      'jobs:',
      '  noop:',
      '    runs-on: ubuntu-latest',
    ].join('\n');
    const res = findBraceGlobEntries(clean, { filename: 'clean.yml' });
    expect(res.ok).toBe(true);
    expect(res.violations).toEqual([]);
  });

  it('reports parsed:false on unparseable YAML rather than reporting it CLEAN', () => {
    // The critical distinction. A file that could not be read has NOT been shown to be
    // clean, and folding it into a zero is the false-assurance shape this SD is about.
    const res = findBraceGlobEntries('name: Broken\non:\n  bad: : :\n', { filename: 'broken.yml' });
    expect(res.parsed).toBe(false);
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('detects the real defect in the actual bad-plain-scalar fixture, which must not parse', () => {
    const res = findBraceGlobEntries(
      readFileSync('tests/fixtures/workflow-yaml/bad-plain-scalar.yml', 'utf8'),
      { filename: 'bad-plain-scalar.yml' }
    );
    expect(res.parsed).toBe(false);
  });
});

describe('the repo itself', () => {
  it('has zero brace-alternation path filters across every workflow', () => {
    // The always-on half: this is what turns the guard from a unit-tested function into an
    // actual standing constraint on the repository.
    const files = resolveWorkflowFiles([]);
    expect(files.length).toBeGreaterThan(100);
    const offenders = [];
    for (const f of files) {
      const res = findBraceGlobEntries(readFileSync(f, 'utf8'), { filename: f });
      expect(res.parsed, `${f} must parse`).toBe(true);
      offenders.push(...res.violations.map((v) => `${v.file}:${v.line} ${v.entry}`));
    }
    expect(offenders).toEqual([]);
  });

  it('reports forward-slash paths on every platform, matching GHA filter idiom', () => {
    expect(resolveWorkflowFiles([]).every((f) => !f.includes('\\'))).toBe(true);
  });
});
