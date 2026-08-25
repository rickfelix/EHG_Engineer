import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { walkRepoForStageLiterals } from '../../lib/audits/stage-census/corpus-walker.mjs';

// Regression test for the self-referential feedback loop caught live during EXEC: an earlier
// version swept docs/audits/ (its own committed output directory), so every re-run counted the
// previous run's report as new findings, compounding without bound across runs.
describe('walkRepoForStageLiterals', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-census-walker-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('finds a stage literal in a live source file', async () => {
    fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'src', 'Stage22DistributionSetup.tsx'), '// component for Stage 22\n');

    const findings = await walkRepoForStageLiterals(tmpRoot, { repoLabel: 'test-repo' });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.file === 'src/Stage22DistributionSetup.tsx')).toBe(true);
  });

  it('excludes docs/audits/ so it never re-ingests its own prior census output', async () => {
    fs.mkdirSync(path.join(tmpRoot, 'docs', 'audits'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, 'docs', 'audits', 'stage-21-26-census.md'),
      '| EHG_Engineer | src/Stage22DistributionSetup.tsx | 1 | `Stage22` | hand-written |\nstage 21\nstage 23\nstage 24\n'
    );

    const findings = await walkRepoForStageLiterals(tmpRoot, { repoLabel: 'test-repo' });
    expect(findings).toEqual([]);
  });

  it('excludes scripts/one-off/ and scripts/temp/ (scratch, not renumber-relevant)', async () => {
    fs.mkdirSync(path.join(tmpRoot, 'scripts', 'one-off'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'scripts', 'temp'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'scripts', 'one-off', 'x.mjs'), 'stage 21\n');
    fs.writeFileSync(path.join(tmpRoot, 'scripts', 'temp', 'y.mjs'), 'stage 22\n');

    const findings = await walkRepoForStageLiterals(tmpRoot, { repoLabel: 'test-repo' });
    expect(findings).toEqual([]);
  });

  it('does not blow up or double-count when re-run twice against the same unchanged corpus', async () => {
    fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'src', 'a.ts'), 'stage 21\n');

    const first = await walkRepoForStageLiterals(tmpRoot, { repoLabel: 'test-repo' });
    const second = await walkRepoForStageLiterals(tmpRoot, { repoLabel: 'test-repo' });
    expect(second.length).toBe(first.length);
  });
});
