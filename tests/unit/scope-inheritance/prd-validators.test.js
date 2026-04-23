/**
 * Unit tests for PRD file-extension validation and parent-scope leakage heuristic.
 * SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-A (US-003, US-004)
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import {
  validateFileExtensions,
  detectParentScopeLeakage,
} from '../../../scripts/prd/validate-prd-fields.js';

// Mock fs: only these paths exist. Paths are relative; suffix-match handles abs resolution.
function makeMockFs(existingPaths) {
  const set = new Set(existingPaths.map(p => p.replace(/\\/g, '/')));
  const byDir = new Map();
  for (const p of existingPaths) {
    const norm = p.replace(/\\/g, '/');
    const lastSlash = norm.lastIndexOf('/');
    const dir = lastSlash >= 0 ? norm.slice(0, lastSlash) : '';
    const base = lastSlash >= 0 ? norm.slice(lastSlash + 1) : norm;
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(base);
  }
  const suffixMatch = (needle, absNorm) =>
    absNorm === needle || absNorm.endsWith('/' + needle);
  return {
    existsSync: (abs) => {
      const norm = abs.replace(/\\/g, '/');
      for (const p of set) if (suffixMatch(p, norm)) return true;
      for (const dir of byDir.keys()) if (dir && suffixMatch(dir, norm)) return true;
      return false;
    },
    readdirSync: (abs) => {
      const norm = abs.replace(/\\/g, '/');
      for (const [dir, files] of byDir) {
        if (dir && suffixMatch(dir, norm)) return files;
      }
      return [];
    },
  };
}

describe('validateFileExtensions', () => {
  it('emits no warnings when all referenced files exist', () => {
    const mockFs = makeMockFs(['scripts/foo.ts', 'src/bar.tsx']);
    const prd = {
      executive_summary: 'Modify `scripts/foo.ts` and `src/bar.tsx` to add feature X.',
    };
    const result = validateFileExtensions(prd, { fs: mockFs, path, projectRoot: '/repo' });
    expect(result.missing).toBe(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.checked).toBeGreaterThanOrEqual(2);
  });

  it('warns when a .ts reference does not exist but a .tsx sibling does', () => {
    // repo has Foo.tsx but not Foo.ts; PRD references Foo.ts
    const mockFs = makeMockFs(['src/components/Foo.tsx']);
    const prd = {
      system_architecture: 'Update src/components/Foo.ts to render the new field.',
    };
    const result = validateFileExtensions(prd, { fs: mockFs, path, projectRoot: '/repo' });
    expect(result.missing).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some(w => w.includes('Foo.ts') && w.includes('Foo.tsx'))).toBe(true);
  });

  it('returns zero checked when PRD has no file-path-like tokens', () => {
    const mockFs = makeMockFs([]);
    const prd = {
      executive_summary: 'Add authentication system with JWT tokens and refresh flow.',
    };
    const result = validateFileExtensions(prd, { fs: mockFs, path, projectRoot: '/repo' });
    expect(result.checked).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('scans multiple fields (acceptance_criteria, test_scenarios, risks)', () => {
    const mockFs = makeMockFs([]);
    const prd = {
      acceptance_criteria: [{ criterion: 'Update scripts/a.js' }],
      test_scenarios: [{ given: 'Edit lib/b.ts' }],
      risks: [{ risk: 'Breaking change in database/migrations/c.sql' }],
    };
    const result = validateFileExtensions(prd, { fs: mockFs, path, projectRoot: '/repo' });
    expect(result.checked).toBe(3);
    expect(result.missing).toBe(3); // all three are missing (mockFs empty)
  });
});

describe('detectParentScopeLeakage', () => {
  it('skips when SD has no parent_sd_id', () => {
    const result = detectParentScopeLeakage({}, { scope_slice: { stages: [18] } });
    expect(result.skipped).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('skips when SD has no scope_slice', () => {
    const result = detectParentScopeLeakage({}, { parent_sd_id: 'p', scope_slice: null });
    expect(result.skipped).toBe(true);
  });

  it('skips when scope_slice has no stages or globs', () => {
    const result = detectParentScopeLeakage(
      { acceptance_criteria: ['src/stage20/leaked.ts'] },
      { parent_sd_id: 'p', scope_slice: {} }
    );
    expect(result.skipped).toBe(true);
  });

  it('does not warn when leakage is below 50%', () => {
    const prd = {
      acceptance_criteria: [
        'Implement src/stage18/a.ts',
        'Implement src/stage18/b.ts',
        'Add util in src/stage20/leaked.ts',
      ],
    };
    const sd = { parent_sd_id: 'p', scope_slice: { stages: [18] } };
    const result = detectParentScopeLeakage(prd, sd);
    expect(result.warnings).toHaveLength(0);
    expect(result.leaked).toBe(1);
    expect(result.total).toBe(3);
  });

  it('warns when leakage exceeds 50%', () => {
    const prd = {
      acceptance_criteria: [
        'Implement src/stage18/a.ts',
        'Add util in src/stage20/leaked.ts',
        'Fix src/stage21/other.ts',
      ],
    };
    const sd = { parent_sd_id: 'p', scope_slice: { stages: [18] } };
    const result = detectParentScopeLeakage(prd, sd);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('2/3');
    expect(result.leaked).toBe(2);
  });

  it('respects deliverable_globs filter', () => {
    const prd = {
      acceptance_criteria: [
        'src/stage18/in.ts',
        'scripts/stage18/out.ts',
        'scripts/stage18/also-out.ts',
      ],
    };
    const sd = { parent_sd_id: 'p', scope_slice: { deliverable_globs: ['src/stage18/**'] } };
    const result = detectParentScopeLeakage(prd, sd);
    expect(result.leaked).toBe(2);
    expect(result.total).toBe(3);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
