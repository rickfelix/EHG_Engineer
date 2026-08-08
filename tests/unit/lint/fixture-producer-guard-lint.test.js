/**
 * Coverage-lint acceptance. SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-D, FR-6.
 *
 * This file is allowlisted in fixture-producer-guard-allowlist.json because the fixtures below are
 * deliberately-unguarded write literals — the lint must not flag its own test.
 */
import { describe, it, expect } from 'vitest';
import {
  findUnguardedWrites, countGuardedWrites, loadAllowlist, SCAN_ROOTS, selfTest, scan,
} from '../../../scripts/lint/fixture-producer-guard-lint.mjs';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('it detects an unguarded ventures write', () => {
  it('flags a direct insert', () => {
    const hits = findUnguardedWrites("await sb.from('ventures').insert({ name: 'x' });");
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(1);
  });

  it('flags an upsert too — insert is not the only way to create a row', () => {
    expect(findUnguardedWrites("sb.from('ventures').upsert({ name: 'x' });")).toHaveLength(1);
  });

  it('flags a write whose verb sits on a later line of the same chain', () => {
    const src = "await sb\n  .from('ventures')\n  .insert({ name: 'x' })\n  .select('id');";
    expect(findUnguardedWrites(src)).toHaveLength(1);
  });
});

describe('it does NOT flag reads — the false positive this lint shipped with, then fixed', () => {
  /**
   * MEASURED ON THE LIVE TREE, not imagined. The first cut used a fixed 200-character lookahead and
   * reported tests/integration/sd-completed-handler.test.js:56 — a `.select('id').limit(1)` read —
   * because an unrelated `.insert(` sat nine lines below. The chain now ends at the first `;` or
   * the next `.from(`. A lint that cries wolf on reads would be abandoned, which is the failure
   * mode this whole SD is about.
   */
  it('does not flag a select', () => {
    expect(findUnguardedWrites("sb.from('ventures').select('id').limit(1);")).toEqual([]);
  });

  it('does not let a LATER insert bleed into an earlier read', () => {
    const src = "const a = sb.from('ventures').select('id').limit(1);\n"
      + '// nine lines of other code\n\n\n\n\n\n\n\n'
      + "const b = sb.from('ventures').insert({ name: 'x' });";
    const hits = findUnguardedWrites(src);
    // Exactly one — the real insert, not the read above it.
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBeGreaterThan(5);
  });

  it('does not flag a different table', () => {
    expect(findUnguardedWrites("sb.from('venture_artifacts').insert({ id: 1 });")).toEqual([]);
  });
});

describe('prose about the pattern is not the pattern', () => {
  it('ignores a write inside a line comment', () => {
    expect(findUnguardedWrites("// sb.from('ventures').insert({ name: 'x' })")).toEqual([]);
  });

  it('ignores a write inside a block comment', () => {
    expect(findUnguardedWrites("/*\n sb.from('ventures').insert({})\n*/")).toEqual([]);
  });

  it('stripNonCode preserves line numbering so reported lines stay accurate', () => {
    const src = "/* a\n b */\nsb.from('ventures').insert({});";
    expect(findUnguardedWrites(src)[0].line).toBe(3);
  });
});

describe('countGuardedWrites is the positive denominator', () => {
  it('counts real guarded call sites', () => {
    expect(countGuardedWrites("insertGuarded(sb,'ventures',r,{});insertGuarded(sb,'ventures',r2,{});")).toBe(2);
  });

  it('does not count a comment mentioning it — narration is not adoption', () => {
    expect(countGuardedWrites('// one day this should use insertGuarded(')).toBe(0);
  });
});

describe('the extractor self-test is the finder control', () => {
  it('passes while the finder can see a write and ignore a read', () => {
    // A blind finder and a clean tree print the same green; this is what tells them apart.
    expect(selfTest()).toBeNull();
  });
});

describe('the allowlist refuses a blank justification', () => {
  const mk = (obj) => {
    const dir = mkdtempSync(join(tmpdir(), 'fpg-'));
    const p = join(dir, 'allow.json');
    writeFileSync(p, JSON.stringify(obj));
    return p;
  };

  it('THROWS on an empty reason', () => {
    expect(() => loadAllowlist(mk({ allow: { 'a.js': '' } }))).toThrow(/non-empty reason/);
  });

  it('THROWS on a whitespace-only reason', () => {
    expect(() => loadAllowlist(mk({ allow: { 'a.js': '   ' } }))).toThrow(/non-empty reason/);
  });

  it('accepts a real reason', () => {
    expect(loadAllowlist(mk({ allow: { 'a.js': 'because X' } }))).toEqual({ 'a.js': 'because X' });
  });

  it('returns empty rather than throwing when the file is absent', () => {
    expect(loadAllowlist(join(tmpdir(), 'definitely-not-here-fpg.json'))).toEqual({});
  });
});

describe('the scanned boundary is deliberate', () => {
  it('names its roots explicitly rather than globbing the tree', () => {
    expect(SCAN_ROOTS).toEqual([
      'tests/integration', 'tests/database', 'scripts/harness', 'scripts/canary',
    ]);
  });
});

/**
 * The scan must be AIMABLE, and its paths must be relative to the root it actually scanned.
 *
 * Without this the root is derived from the lint's own file location, so pointing it at another
 * tree silently rescanned the real repo — a confident verdict about a tree the caller never named.
 * The control-seed-test harness depends on exactly this: it plants a seeded defect in a scratch
 * directory and can only prove the control fires if the control can be aimed there.
 */
describe('scan is aimable via root', () => {
  const plant = (rel, src) => {
    const dir = mkdtempSync(join(tmpdir(), 'fpg-root-'));
    mkdirSync(join(dir, rel.split('/').slice(0, -1).join('/')), { recursive: true });
    writeFileSync(join(dir, rel), src);
    return dir;
  };

  it('finds a planted violation in the named root, reported root-relative', () => {
    const dir = plant('tests/integration/planted.js', "sb.from('ventures').insert({ name: 'x' });\n");
    const { violations, scannedFiles } = scan({ root: dir, allowlist: {} });
    expect(scannedFiles).toBe(1);
    expect(violations).toHaveLength(1);
    // Root-relative, not absolute: an absolute path breaks allowlist keys AND the seed trial's
    // filename-based detection.
    expect(violations[0].file).toBe('tests/integration/planted.js');
  });

  it('counts guarded sites in the named root', () => {
    const dir = plant('scripts/harness/ok.js', "insertGuarded(sb, 'ventures', row, decl);\n");
    const { violations, guardedSites } = scan({ root: dir, allowlist: {} });
    expect(guardedSites).toBe(1);
    expect(violations).toHaveLength(0);
  });

  it('does not fall back to the real repo when the named root is empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fpg-empty-'));
    const { scannedFiles, guardedSites, violations } = scan({ root: dir, allowlist: {} });
    expect(scannedFiles).toBe(0);
    expect(guardedSites).toBe(0);
    expect(violations).toHaveLength(0);
  });
});
