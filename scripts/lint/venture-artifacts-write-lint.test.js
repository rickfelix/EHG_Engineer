// SD-FDBK-FIX-FIX-RESIDUAL-VENTURE-001 — unit tests for the venture_artifacts write-path lint.
// Exercise the static parser's robustness: explicit + shorthand keys, comments, brackets/parens
// inside strings, missing NOT-NULL columns, and non-existent columns.

import { describe, it, expect } from 'vitest';
import {
  extractVentureArtifactWrites,
  topLevelKeys,
  stripComments,
  lintFile,
  VENTURE_ARTIFACTS_COLUMNS,
  REQUIRED_NOT_NULL,
} from './venture-artifacts-write-lint.mjs';

describe('stripComments', () => {
  it('removes // line comments but keeps code', () => {
    expect(stripComments('a = 1; // note\nb = 2;')).toContain('a = 1;');
    expect(stripComments('a = 1; // note\nb = 2;')).not.toContain('note');
  });
  it('removes /* block */ comments', () => {
    expect(stripComments('a /* x */ b')).not.toContain('x');
  });
  it('does NOT treat // inside a string as a comment', () => {
    expect(stripComments("const u = 'http://x';")).toContain('http://x');
  });
});

describe('topLevelKeys', () => {
  it('detects explicit keys', () => {
    expect(topLevelKeys('venture_id: a, title: b')).toEqual(['venture_id', 'title']);
  });
  it('detects ES6 shorthand keys', () => {
    expect(topLevelKeys('venture_id, artifact_type, title')).toEqual(['venture_id', 'artifact_type', 'title']);
  });
  it('ignores keys nested in sub-objects / arrays', () => {
    const keys = topLevelKeys('venture_id: a, metadata: { inner: 1 }, title: b');
    expect(keys).toContain('venture_id');
    expect(keys).toContain('metadata');
    expect(keys).toContain('title');
    expect(keys).not.toContain('inner');
  });
  it('is not corrupted by brackets/parens inside string values', () => {
    const keys = topLevelKeys("artifact_type: 'visual_final_assets', title: 'Final (chairman upload)', is_current: true");
    expect(keys).toEqual(['artifact_type', 'title', 'is_current']);
  });
  it('recognizes a key that follows a comment (after stripComments)', () => {
    const stripped = stripComments("artifact_type: 'x', // residual (0 rows)\ntitle: 'T'");
    expect(topLevelKeys(stripped)).toContain('title');
  });
});

describe('lintFile', () => {
  it('flags a venture_artifacts insert missing NOT-NULL title', () => {
    const src = "await sb.from('venture_artifacts').insert({ venture_id: v, lifecycle_stage: 22, artifact_type: 'x' });";
    const v = lintFile('foo.js', src);
    expect(v.some((x) => /missing NOT-NULL 'title'/.test(x))).toBe(true);
  });
  it('passes a complete insert', () => {
    const src = "await sb.from('venture_artifacts').insert({ venture_id: v, lifecycle_stage: 22, artifact_type: 'x', title: 'T', is_current: true });";
    expect(lintFile('foo.js', src)).toEqual([]);
  });
  it('passes an insert using ES6 shorthand for the required cols', () => {
    const src = "await sb.from('venture_artifacts').insert({ venture_id, lifecycle_stage, artifact_type, title, content });";
    expect(lintFile('foo.js', src)).toEqual([]);
  });
  it('flags a non-existent column (artifact_id)', () => {
    const src = "await sb.from('venture_artifacts').insert({ venture_id: v, lifecycle_stage: 1, artifact_type: 'x', title: 'T', artifact_id: y });";
    const v = lintFile('foo.js', src);
    expect(v.some((x) => /non-existent column 'artifact_id'/.test(x))).toBe(true);
  });
  it('passes an insert whose title follows an inline comment', () => {
    const src = "await sb.from('venture_artifacts').insert({ venture_id: v, lifecycle_stage: 22, artifact_type: 'visual_assets_skipped', // NOT NULL (0 rows)\n title: 'S21 Visual Assets — Skipped', is_current: true });";
    expect(lintFile('foo.js', src)).toEqual([]);
  });
  it('ignores .select()/.update() on venture_artifacts (only insert/upsert checked)', () => {
    const src = "await sb.from('venture_artifacts').select('version').eq('venture_id', v);";
    expect(lintFile('foo.js', src)).toEqual([]);
  });
});

describe('exported schema constants', () => {
  it('REQUIRED_NOT_NULL covers the four NOT-NULL columns', () => {
    expect(REQUIRED_NOT_NULL).toEqual(['venture_id', 'lifecycle_stage', 'artifact_type', 'title']);
  });
  it('VENTURE_ARTIFACTS_COLUMNS includes title and excludes artifact_id/stage_number', () => {
    expect(VENTURE_ARTIFACTS_COLUMNS.has('title')).toBe(true);
    expect(VENTURE_ARTIFACTS_COLUMNS.has('artifact_id')).toBe(false);
    expect(VENTURE_ARTIFACTS_COLUMNS.has('stage_number')).toBe(false);
  });
});
