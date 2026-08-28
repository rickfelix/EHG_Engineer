import { describe, it, expect } from 'vitest';
import { capFindingsPerRoot } from '../../../scripts/eva/health-dimensions/codebase-health-scan.mjs';

function makeFindings(root, count) {
  return Array.from({ length: count }, (_, i) => ({ file: `${root}/file${i}.mjs`, strategy: 'unused_export' }));
}

describe('capFindingsPerRoot', () => {
  it('returns all findings untruncated when under the cap', () => {
    const findings = makeFindings('lib', 10);
    const result = capFindingsPerRoot(findings, 100);
    expect(result.truncated).toBe(false);
    expect(result.capped).toHaveLength(10);
    expect(result.byRoot).toBeNull();
  });

  it('represents every scan root when findings exceed the cap (regression: alphabetical slice excluded non-lib roots)', () => {
    // 700 lib/* findings sort before any scripts/* finding alphabetically —
    // a plain slice(0, 100) would contain zero scripts/* entries.
    const findings = [...makeFindings('lib', 700), ...makeFindings('scripts', 9)];
    const result = capFindingsPerRoot(findings, 100);

    expect(result.truncated).toBe(true);
    expect(result.capped.length).toBeLessThanOrEqual(100);
    expect(result.capped.some(f => f.file.startsWith('lib/'))).toBe(true);
    expect(result.capped.some(f => f.file.startsWith('scripts/'))).toBe(true);
    expect(result.byRoot).toEqual({ lib: 700, scripts: 9 });
  });

  it('contains all findings when every finding falls under a single root (negative test from QF-20260729-252)', () => {
    const findings = makeFindings('scripts', 150);
    const result = capFindingsPerRoot(findings, 100);

    expect(result.truncated).toBe(true);
    expect(result.capped.every(f => f.file.startsWith('scripts/'))).toBe(true);
    expect(result.capped).toHaveLength(100);
  });

  it('never returns more than the cap even with many distinct roots', () => {
    const findings = Array.from({ length: 150 }, (_, i) => ({ file: `root${i}/file.mjs` }));
    const result = capFindingsPerRoot(findings, 100);
    expect(result.capped.length).toBeLessThanOrEqual(100);
  });
});
