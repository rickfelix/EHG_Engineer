/**
 * SD-LEO-FIX-STRATEGIC-DIRECTIVES-UPDATED-001 (FR-4) — two-sided acceptance for the
 * unsafe-sd-metadata-full-blob-write lint.
 * (a) alone would pass a lint that fires on everything; (b) alone would pass today's no-op.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findUnsafeMetadataFullBlobWrite, changedLineNumbers } from '../../../scripts/lint/unsafe-sd-metadata-full-blob-write-lint.mjs';

describe('findUnsafeMetadataFullBlobWrite', () => {
  it('(a) FIRES on the exact defect shape: read-spread-write against strategic_directives_v2', () => {
    const src = `
      const { data: row } = await supabase.from('strategic_directives_v2').select('metadata').eq('id', id).maybeSingle();
      await supabase.from('strategic_directives_v2').update({ metadata: { ...row.metadata, foo: 1 } }).eq('id', id);
    `;
    const findings = findUnsafeMetadataFullBlobWrite(src, 'fixture.js');
    expect(findings).toHaveLength(1);
  });

  it('(a) FIRES on a spread of a locally-built variable, not just a direct property spread', () => {
    const src = `
      const md = { ...(sd.metadata || {}) };
      await supabase.from('strategic_directives_v2').update({ metadata: md }).eq('id', id);
    `;
    // this shape has no spread INSIDE the .update({...}) call itself -- confirm the companion
    // shape (spread inside the update literal) still fires, matching the real historical defects.
    const src2 = `
      await supabase.from('strategic_directives_v2').update({ metadata: { ...md, journey_walk_result: r } }).eq(column, sdId);
    `;
    expect(findUnsafeMetadataFullBlobWrite(src, 'fixture.js')).toHaveLength(0); // no spread in the update() call
    expect(findUnsafeMetadataFullBlobWrite(src2, 'fixture.js')).toHaveLength(1);
  });

  it('(b) PASSES a pure literal .update({ metadata: {...} }) with no spread (a different, rarer shape)', () => {
    const src = `
      await supabase.from('strategic_directives_v2').update({ metadata: { only_this_key: true } }).eq('id', id);
    `;
    expect(findUnsafeMetadataFullBlobWrite(src, 'fixture.js')).toHaveLength(0);
  });

  it('(b) PASSES a spread update against an unrelated table (file-level gate requires the table name present)', () => {
    const src = "await supabase.from('other_table').update({ metadata: { ...x, y: 1 } }).eq('id', id);";
    expect(findUnsafeMetadataFullBlobWrite(src, 'fixture.js')).toHaveLength(0);
  });

  it('(b) PASSES the sanctioned mergeMetadataKeys() call itself (no .update() call at all)', () => {
    const src = `
      // strategic_directives_v2 mentioned here for file-level gate purposes
      await mergeMetadataKeys(sdKey, { ...patch, extra: 1 });
    `;
    expect(findUnsafeMetadataFullBlobWrite(src, 'fixture.js')).toHaveLength(0);
  });

  it('escape hatch: a trailing metadata-fullblob-lint-disable-line comment suppresses the finding', () => {
    const src = "// strategic_directives_v2\nawait supabase.from('strategic_directives_v2').update({ metadata: { ...x, y: 1 } }).eq('id', id); // metadata-fullblob-lint-disable-line: reviewed, row-locked elsewhere";
    expect(findUnsafeMetadataFullBlobWrite(src, 'fixture.js')).toHaveLength(0);
  });

  it('reports the correct 1-indexed line number', () => {
    const src = "// strategic_directives_v2\nconst x = 1;\nawait supabase.from('strategic_directives_v2').update({ metadata: { ...x, y: 1 } }).eq('id', id);";
    const findings = findUnsafeMetadataFullBlobWrite(src, 'fixture.js');
    expect(findings[0].line).toBe(3);
  });
});

// SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001: --diff mode's changedFiles() named FILES,
// not LINES -- main() then scanned a whole matched file's content, so a PR editing one function
// in a large file inherited every PRE-EXISTING violation elsewhere in that same file as a "new"
// finding (measured breaking this exact promise on PR #8226: 3 unrelated findings at lines the
// PR never touched). changedLineNumbers() scopes findings to the actual git diff hunks.
describe('changedLineNumbers', () => {
  let repo;
  function run(cmd, args) {
    return execFileSync(cmd, args, { cwd: repo, encoding: 'utf8' });
  }
  afterEach(() => {
    if (repo) { try { rmSync(repo, { recursive: true, force: true }); } catch { /* best effort */ } repo = null; }
  });

  it('returns exactly the added/changed NEW-file line numbers, excluding untouched lines', () => {
    repo = mkdtempSync(path.join(tmpdir(), 'changed-lines-'));
    run('git', ['init', '-q']);
    run('git', ['config', 'user.email', 'test@example.com']);
    run('git', ['config', 'user.name', 'Test']);
    const file = path.join(repo, 'fixture.js');
    const baseLines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
    writeFileSync(file, baseLines.join('\n') + '\n');
    run('git', ['add', 'fixture.js']);
    run('git', ['commit', '-q', '-m', 'base']);
    run('git', ['branch', 'base-ref']);

    const updated = baseLines.slice();
    updated[4] = 'line 5 CHANGED';
    updated.push('line 11 NEW', 'line 12 NEW');
    writeFileSync(file, updated.join('\n') + '\n');
    run('git', ['add', 'fixture.js']);
    run('git', ['commit', '-q', '-m', 'edit']);

    const priorCwd = process.cwd();
    process.chdir(repo);
    try {
      const result = changedLineNumbers('fixture.js', 'base-ref');
      expect(result).toEqual(new Set([5, 11, 12]));
    } finally {
      process.chdir(priorCwd);
    }
  });
});
