/**
 * SD-LEO-INFRA-VDR-GREP-SEAM-CROSSREPO-001 (FR-5 / activation test).
 *
 * The PURE core of the VDR code-grep seam: repo-name→filesystem-root resolution (incl. the
 * VDR_EHG_REPO_ROOT override), the git-grep adapter (matched/accessible) with archive/test
 * pathspec exclusions, and the END-TO-END honesty contract through codeGrepProbe — a match is
 * 'partial' (never 'built'), an inaccessible checkout is 'unknown' (excluded, never guessed).
 * All IO (exec/existsSync) is injected; no real git, FS, or DB.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  resolveRepoRoots,
  makeGrepSeam,
  makeDefaultGrepSeam,
  GREP_EXCLUDES,
} from '../../lib/vision/vdr-grep-seam.js';
import { codeGrepProbe } from '../../lib/vision/vdr-probes.js';

const ENGINEER = '/repo/EHG_Engineer';

describe('resolveRepoRoots — repo-name → filesystem-root map', () => {
  it('maps EHG_Engineer to engineerRoot and ehg to the sibling checkout by default', () => {
    const roots = resolveRepoRoots({ engineerRoot: ENGINEER, env: {} });
    expect(roots.EHG_Engineer).toBe(ENGINEER);
    expect(roots.ehg).toBe(path.resolve(ENGINEER, '..', 'ehg'));
  });

  it('honors an explicit ehgRoot over the sibling default', () => {
    const roots = resolveRepoRoots({ engineerRoot: ENGINEER, ehgRoot: '/custom/ehg', env: {} });
    expect(roots.ehg).toBe('/custom/ehg');
  });

  it('VDR_EHG_REPO_ROOT env override wins over ehgRoot and the sibling default', () => {
    const roots = resolveRepoRoots({ engineerRoot: ENGINEER, ehgRoot: '/custom/ehg', env: { VDR_EHG_REPO_ROOT: '/env/ehg' } });
    expect(roots.ehg).toBe('/env/ehg');
  });

  it('falls back to a module-derived engineerRoot when none is passed', () => {
    const roots = resolveRepoRoots({ env: {} });
    expect(typeof roots.EHG_Engineer).toBe('string');
    expect(roots.EHG_Engineer.length).toBeGreaterThan(0);
  });
});

describe('makeGrepSeam — git-grep adapter (matched / accessible), both directions', () => {
  const repoRoots = { EHG_Engineer: ENGINEER, ehg: '/repo/ehg' };

  it('exit 0 (a tracked file matched) => { matched:true, accessible:true }', () => {
    const grep = makeGrepSeam({ repoRoots, exec: () => 'src/x.tsx\n', existsSync: () => true });
    expect(grep('PerformanceGauge', 'src', 'ehg')).toEqual({ matched: true, accessible: true });
  });

  it('git grep exit 1 (no match) => { matched:false, accessible:true } (built denominator, just unbuilt)', () => {
    const grep = makeGrepSeam({ repoRoots, exec: () => { const e = new Error('no match'); e.status = 1; throw e; }, existsSync: () => true });
    expect(grep('nope', 'src', 'ehg')).toEqual({ matched: false, accessible: true });
  });

  it('unexpected git error (status 128) => { accessible:false } (fail-open → unknown, NEVER a guessed match)', () => {
    const grep = makeGrepSeam({ repoRoots, exec: () => { const e = new Error('fatal: not a git repo'); e.status = 128; throw e; }, existsSync: () => true });
    expect(grep('x', 'src', 'ehg')).toEqual({ matched: false, accessible: false });
  });

  it('a timeout-style error (no status 1) => { accessible:false }', () => {
    const grep = makeGrepSeam({ repoRoots, exec: () => { const e = new Error('ETIMEDOUT'); e.status = null; throw e; }, existsSync: () => true });
    expect(grep('x', 'src', 'ehg').accessible).toBe(false);
  });

  it('unknown repo key => { accessible:false } (never a path guess)', () => {
    const grep = makeGrepSeam({ repoRoots, exec: () => '', existsSync: () => true });
    expect(grep('x', 'src', 'no-such-repo')).toEqual({ matched: false, accessible: false });
  });

  it('absent repo root => { accessible:false } (honest unknown for an absent checkout)', () => {
    const grep = makeGrepSeam({ repoRoots, exec: () => '', existsSync: (p) => p !== '/repo/ehg' && p !== path.join('/repo/ehg', 'src') });
    expect(grep('x', 'src', 'ehg').accessible).toBe(false);
  });

  it('root present but sub path absent => { accessible:false } (do not grep a missing subtree)', () => {
    const grep = makeGrepSeam({ repoRoots, exec: () => '', existsSync: (p) => p === '/repo/ehg' }); // root exists, target does not
    expect(grep('x', 'src', 'ehg').accessible).toBe(false);
  });

  it('passes the archive/test pathspec exclusions to git grep (dead-code hits cannot credit a capability)', () => {
    let captured = null;
    const grep = makeGrepSeam({ repoRoots, exec: (cmd, args) => { captured = { cmd, args }; return ''; }, existsSync: () => true });
    grep('CANONICAL_SURFACES', 'src', 'ehg');
    expect(captured.cmd).toBe('git');
    expect(captured.args).toContain('grep');
    expect(captured.args).toContain('-lE');
    for (const ex of GREP_EXCLUDES) expect(captured.args).toContain(ex);
    // scoped to the repo root + subpath
    expect(captured.args).toContain('-C');
    expect(captured.args).toContain('/repo/ehg');
    expect(captured.args).toContain('src');
  });
});

describe('makeDefaultGrepSeam — one-liner wiring (resolve roots + build seam)', () => {
  it('returns a working grep bound to resolved roots', () => {
    const grep = makeDefaultGrepSeam({ engineerRoot: ENGINEER, env: {}, exec: () => 'lib/x.js\n', existsSync: () => true });
    expect(grep('calibration_cohort', 'lib', 'EHG_Engineer')).toEqual({ matched: true, accessible: true });
  });
});

describe('honesty contract end-to-end (seam → codeGrepProbe) — the gauge must never lie high', () => {
  const repoRoots = { EHG_Engineer: ENGINEER, ehg: '/repo/ehg' };
  const def = { type: 'code_grep', repo: 'ehg', path: 'src', pattern: 'distance-to-broke', builtWhen: 'present' };

  it('a code MATCH yields PARTIAL (intent, not realization) — NEVER built', async () => {
    const grep = makeGrepSeam({ repoRoots, exec: () => 'src/x.tsx\n', existsSync: () => true });
    const r = await codeGrepProbe(def, { grep });
    expect(r.status).toBe('partial');
  });

  it('no match yields UNBUILT', async () => {
    const grep = makeGrepSeam({ repoRoots, exec: () => { const e = new Error('nm'); e.status = 1; throw e; }, existsSync: () => true });
    const r = await codeGrepProbe(def, { grep });
    expect(r.status).toBe('unbuilt');
  });

  it('an absent checkout yields UNKNOWN (excluded from the denominator), never a guessed number', async () => {
    const grep = makeGrepSeam({ repoRoots, exec: () => '', existsSync: () => false }); // checkout absent
    const r = await codeGrepProbe(def, { grep });
    expect(r.status).toBe('unknown');
  });

  it('builtWhen:absent — a clean ABSENCE is built; a match is unbuilt (the inverse contract holds)', async () => {
    const absentDef = { ...def, builtWhen: 'absent' };
    const noMatch = makeGrepSeam({ repoRoots, exec: () => { const e = new Error('nm'); e.status = 1; throw e; }, existsSync: () => true });
    const match = makeGrepSeam({ repoRoots, exec: () => 'x\n', existsSync: () => true });
    expect((await codeGrepProbe(absentDef, { grep: noMatch })).status).toBe('built');
    expect((await codeGrepProbe(absentDef, { grep: match })).status).toBe('unbuilt');
  });
});
