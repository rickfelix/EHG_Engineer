/**
 * Unit tests for scope-completion-gate filter logic.
 * SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-A (US-001, US-002)
 */

import { describe, it, expect } from 'vitest';
import {
  filterBySlice,
  globToRegExp,
  isInheritedWithoutSlice,
  extractDeliverables,
} from '../../../scripts/modules/handoff/gates/scope-completion-gate.js';

describe('globToRegExp', () => {
  it('matches simple star as a single segment', () => {
    const rx = globToRegExp('src/*.js');
    expect(rx.test('src/foo.js')).toBe(true);
    expect(rx.test('src/nested/foo.js')).toBe(false);
  });

  it('matches double star across segments', () => {
    const rx = globToRegExp('src/**/*.ts');
    expect(rx.test('src/foo.ts')).toBe(true);
    expect(rx.test('src/a/b/c.ts')).toBe(true);
    expect(rx.test('other/foo.ts')).toBe(false);
  });

  it('escapes regex metacharacters in literal path', () => {
    const rx = globToRegExp('src/foo.bar.js');
    expect(rx.test('src/foo.bar.js')).toBe(true);
    expect(rx.test('src/fooxbar.js')).toBe(false);
  });
});

describe('isInheritedWithoutSlice', () => {
  it('returns true when inherited_from_parent is a non-empty array and scope_slice is null', () => {
    expect(isInheritedWithoutSlice({ metadata: { inherited_from_parent: ['title', 'desc'] }, scope_slice: null })).toBe(true);
  });

  it('returns true when inherited_from_parent === true and scope_slice is undefined', () => {
    expect(isInheritedWithoutSlice({ metadata: { inherited_from_parent: true } })).toBe(true);
  });

  it('returns false when scope_slice is set (even if inheritance flag is also set)', () => {
    expect(isInheritedWithoutSlice({ metadata: { inherited_from_parent: true }, scope_slice: { stages: [1] } })).toBe(false);
  });

  it('returns false when no inheritance flag and no scope_slice', () => {
    expect(isInheritedWithoutSlice({ metadata: {}, scope_slice: null })).toBe(false);
  });

  it('returns false when inherited_from_parent is an empty array', () => {
    expect(isInheritedWithoutSlice({ metadata: { inherited_from_parent: [] }, scope_slice: null })).toBe(false);
  });

  it('returns false on missing SD object', () => {
    expect(isInheritedWithoutSlice(null)).toBe(false);
    expect(isInheritedWithoutSlice(undefined)).toBe(false);
  });
});

describe('filterBySlice', () => {
  const deliverables = [
    { name: 'src/stage18/foo.tsx', type: 'file', checkPattern: 'src/stage18/foo.tsx' },
    { name: 'src/stage19/bar.ts', type: 'file', checkPattern: 'src/stage19/bar.ts' },
    { name: 'Table: stage_18_results', type: 'table', checkPattern: 'stage_18_results' },
    { name: 'Function: handleStage20', type: 'function', checkPattern: 'handleStage20' },
    { name: 'scripts/shared/util.js', type: 'file', checkPattern: 'scripts/shared/util.js' },
  ];

  it('returns input unchanged when scope_slice is null', () => {
    expect(filterBySlice(deliverables, null)).toEqual(deliverables);
  });

  it('returns input unchanged when scope_slice is empty object', () => {
    expect(filterBySlice(deliverables, {})).toEqual(deliverables);
  });

  it('filters by stages: keeps only deliverables referencing stage 18', () => {
    const result = filterBySlice(deliverables, { stages: [18] });
    expect(result).toHaveLength(2);
    expect(result.map(d => d.checkPattern)).toEqual(['src/stage18/foo.tsx', 'stage_18_results']);
  });

  it('filters by multiple stages (OR-union across stages)', () => {
    const result = filterBySlice(deliverables, { stages: [18, 19] });
    expect(result).toHaveLength(3);
  });

  it('filters by deliverable_globs: keeps only files under src/stage18/**', () => {
    const result = filterBySlice(deliverables, { deliverable_globs: ['src/stage18/**'] });
    expect(result).toHaveLength(1);
    expect(result[0].checkPattern).toBe('src/stage18/foo.tsx');
  });

  it('combines stages AND globs (intersection)', () => {
    const result = filterBySlice(deliverables, {
      stages: [18, 19],
      deliverable_globs: ['src/stage18/**'],
    });
    expect(result).toHaveLength(1);
    expect(result[0].checkPattern).toBe('src/stage18/foo.tsx');
  });

  it('empty stages array is treated as absent (no filter)', () => {
    const result = filterBySlice(deliverables, { stages: [] });
    expect(result).toEqual(deliverables);
  });
});

describe('extractDeliverables backward compat', () => {
  it('still extracts file paths from arch plan content', () => {
    const content = '- `scripts/foo.js`\n- `lib/bar.ts`\n';
    const items = extractDeliverables(content);
    expect(items).toHaveLength(2);
    expect(items.find(i => i.checkPattern === 'scripts/foo.js')).toBeDefined();
    expect(items.find(i => i.checkPattern === 'lib/bar.ts')).toBeDefined();
  });
});
