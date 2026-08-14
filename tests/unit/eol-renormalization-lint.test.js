// SD-ALTIFYAI-FDBK-FIX-HOUSEKEEPING-WEEKLY-REPORT-001, FR-2 / TS-1..TS-6.
// Fixture lines match the EXACT `git ls-files --eol` output format captured live from this repo
// (padded columns, tab before the path, attr field sometimes containing an internal space) --
// not an idealized shape. See scripts/lint/eol-renormalization-lint.mjs for the parsing contract.
import { describe, it, expect } from 'vitest';
import { parseEolLine, isEolManaged, isRenormalizationDirty, evaluate, ALLOWLIST } from '../../scripts/lint/eol-renormalization-lint.mjs';

function line(index, worktree, attr, filePath) {
  const iField = `i/${index}`.padEnd(8);
  const wField = `w/${worktree}`.padEnd(8);
  const attrField = attr ? `attr/${attr}`.padEnd(23) : 'attr/'.padEnd(23);
  return `${iField}${wField}${attrField}\t${filePath}`;
}

describe('parseEolLine', () => {
  it('parses the real 3-field format, including an attr value containing an internal space', () => {
    const parsed = parseEolLine(line('mixed', 'mixed', 'text eol=lf', 'database/migrations/x.sql'));
    expect(parsed).toEqual({ index: 'mixed', attr: 'text eol=lf', path: 'database/migrations/x.sql' });
  });

  it('parses an unmanaged path (no attr) without truncating on the empty attr field', () => {
    const parsed = parseEolLine(line('crlf', 'crlf', '', 'README.md'));
    expect(parsed).toEqual({ index: 'crlf', attr: '', path: 'README.md' });
  });

  it('returns null for a line that does not match the format', () => {
    expect(parseEolLine('not a git ls-files --eol line')).toBeNull();
  });
});

describe('TS-1: legitimate core.autocrlf=true contributor state must not trip', () => {
  it('i/lf w/crlf (clean index, CRLF only in the local working tree) is not flagged dirty', () => {
    const parsed = parseEolLine(line('lf', 'crlf', 'text eol=lf', 'lib/example.js'));
    expect(isRenormalizationDirty(parsed)).toBe(false);
  });
});

describe('TS-2: binary/NUL-containing files must not trip', () => {
  it('i/-text (git binary detection) is not flagged, even though it is not i/lf', () => {
    const parsed = parseEolLine(line('-text', '-text', 'text eol=lf', 'lib/example.js'));
    expect(parsed.index).not.toBe('lf');
    expect(isRenormalizationDirty(parsed)).toBe(false);
  });
});

describe('TS-3: empty files must not trip', () => {
  it('i/none (empty file) is not flagged', () => {
    const parsed = parseEolLine(line('none', 'none', 'text eol=lf', 'lib/empty.js'));
    expect(isRenormalizationDirty(parsed)).toBe(false);
  });
});

describe('TS-4: whole-line/substring parsing is provably wrong; positional field-1 parsing is required', () => {
  const fixtureLines = [
    line('lf', 'crlf', 'text eol=lf', 'lib/autocrlf-legit.js'),  // real: clean.  naive 'crlf': FALSE POSITIVE (matches w/crlf)
    line('crlf', 'crlf', 'text eol=lf', 'lib/dirty-crlf.js'),    // real: dirty.  naive 'crlf': true positive
    line('mixed', 'mixed', 'text eol=lf', 'lib/dirty-mixed.js'), // real: dirty.  naive 'crlf': FALSE NEGATIVE ("mixed" has no "crlf" substring)
    line('lf', 'lf', 'text eol=lf', 'lib/clean.js'),             // real: clean.  naive 'crlf': true negative
  ];

  it('the real field-1-positional detector flags exactly the genuinely dirty paths', () => {
    const flagged = fixtureLines.map(parseEolLine).filter(isRenormalizationDirty).map((p) => p.path);
    expect(flagged.sort()).toEqual(['lib/dirty-crlf.js', 'lib/dirty-mixed.js']);
  });

  it('a naive whole-line includes("crlf") gets the SAME COUNT but the WRONG SET -- ' +
     'false-positives on a legitimate autocrlf line and false-negatives on an i/mixed line', () => {
    const naiveFlagged = fixtureLines.filter((l) => l.includes('crlf'));
    // The count coincidentally matches the true positive count (2) -- which is precisely why a
    // count-only sanity check would not have caught this: the SET is wrong even when the COUNT
    // looks right.
    expect(naiveFlagged).toHaveLength(2);
    const naivePaths = naiveFlagged.map((l) => l.split('\t')[1]);
    expect(naivePaths).toContain('lib/autocrlf-legit.js'); // false positive: legitimate autocrlf state wrongly flagged
    expect(naivePaths).not.toContain('lib/dirty-mixed.js'); // false negative: genuinely dirty i/mixed missed entirely
  });

  it('a naive whole-line !includes("lf") never fires -- the attr field always contains "lf"', () => {
    const naiveFlagged = fixtureLines.filter((l) => !l.includes('lf'));
    expect(naiveFlagged).toHaveLength(0);
  });
});

describe('TS-5: stale allowlist entry fails the check instead of silently passing', () => {
  it('flags an allowlist entry whose path is no longer dirty (already fixed) as stale', () => {
    const lines = [line('lf', 'lf', 'text eol=lf', 'database/migrations/already-fixed.sql')];
    const testAllowlist = [{ path: 'database/migrations/already-fixed.sql', rationale: 'test fixture' }];
    const result = evaluate(lines, testAllowlist);
    expect(result.ok).toBe(false);
    expect(result.staleEntries).toHaveLength(1);
    expect(result.staleEntries[0].path).toBe('database/migrations/already-fixed.sql');
  });

  it('flags an allowlist entry whose path no longer exists (renamed/deleted) as stale', () => {
    const lines = [line('crlf', 'crlf', 'text eol=lf', 'some/other/file.sql')];
    const testAllowlist = [{ path: 'database/migrations/gone.sql', rationale: 'test fixture' }];
    const result = evaluate(lines, testAllowlist);
    expect(result.ok).toBe(false);
    expect(result.staleEntries.map((e) => e.path)).toContain('database/migrations/gone.sql');
  });

  it('a currently-dirty, currently-existing allowlist entry is NOT stale', () => {
    const lines = [line('mixed', 'mixed', 'text eol=lf', 'database/migrations/still-dirty.sql')];
    const testAllowlist = [{ path: 'database/migrations/still-dirty.sql', rationale: 'test fixture' }];
    const result = evaluate(lines, testAllowlist);
    expect(result.staleEntries).toHaveLength(0);
    expect(result.violations).toHaveLength(0); // allowlisted, so not a violation either
    expect(result.ok).toBe(true);
  });
});

describe('TS-6: end-to-end -- detector reports dirty pre-fix, clean post-fix', () => {
  const preFixLines = [
    line('crlf', 'crlf', 'text eol=lf', 'src/a.js'),
    line('mixed', 'mixed', 'text eol=lf', 'src/b.js'),
    line('crlf', 'crlf', 'text eol=lf', 'src/c.mjs'),
  ];
  const postFixLines = [
    line('lf', 'lf', 'text eol=lf', 'src/a.js'),
    line('lf', 'lf', 'text eol=lf', 'src/b.js'),
    line('lf', 'lf', 'text eol=lf', 'src/c.mjs'),
  ];

  it('reports exactly the known-dirty set before renormalization', () => {
    const result = evaluate(preFixLines, []);
    expect(result.violations).toHaveLength(3);
    expect(result.ok).toBe(false);
  });

  it('reports zero violations after renormalization of the same paths', () => {
    const result = evaluate(postFixLines, []);
    expect(result.violations).toHaveLength(0);
    expect(result.ok).toBe(true);
  });
});

describe('allowlist contract', () => {
  it('has exactly 2 entries (fails loudly if silently grown)', () => {
    expect(ALLOWLIST).toHaveLength(2);
  });

  it('every entry has a non-empty rationale', () => {
    for (const entry of ALLOWLIST) {
      expect(typeof entry.rationale).toBe('string');
      expect(entry.rationale.trim().length).toBeGreaterThan(0);
    }
  });

  it('every entry is a .sql path (this SD only defers the approval-hash-sensitive migration class)', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.path.endsWith('.sql')).toBe(true);
    }
  });
});

describe('isEolManaged: attribute-derived scope', () => {
  it('a path with no eol=lf attribute is out of scope regardless of index state', () => {
    const parsed = parseEolLine(line('crlf', 'crlf', '', 'README.md'));
    expect(isEolManaged(parsed)).toBe(false);
  });

  it('a path with an eol=lf attribute is in scope', () => {
    const parsed = parseEolLine(line('crlf', 'crlf', 'text eol=lf', 'lib/example.js'));
    expect(isEolManaged(parsed)).toBe(true);
  });
});
