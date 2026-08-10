/**
 * FR-4 invariant + FR-5 armed two-sided tests — SD-LEO-INFRA-PUBLISH-SHELL-INJECTION-001-A.
 *
 * THE INVARIANT (mechanical, not a prose site list): every file in the frozen adoption census
 * routes git through the published hardened runner and contains NO direct git spawn of its own.
 * This replaces the "BOTH production call sites" fact-pin shape (PAT-TEST-PINS-FACT-NOT-
 * BEHAVIOUR-001): adding a 15th census file extends CENSUS below; a census file regressing to a
 * private runner fails loudly here.
 *
 * RECORDED REMAINDER (measured 2026-08-10): 88 further files under lib/ and scripts/ spawn git
 * DIRECTLY but in the argv-safe shape (execFileSync/spawnSync('git', [...])). They are outside
 * this SD's frozen census — the dangerous shapes among them (template-literal exec, shell:true)
 * are child B's advisory-lint ledger, and wholesale factory adoption is a future wave. This
 * comment exists so the bound is a recorded decision, not a silent cap.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { OPT_OUTS, assertOptOutReasons } = require_('./hardened-runner.cjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The frozen census (R-2): 8 definition sites + 6 call-site runners, adopted by this SD. */
const CENSUS = [
  'scripts/docmon.js',
  'scripts/lint/schema-reference-lint.mjs',
  'lib/gates/operator-contract/harness-adapter.js',
  'lib/fleet/tree-currency.cjs',
  'lib/governance/checkout-freshness.js',
  'lib/worktree/stale-base-guard.mjs',
  'scripts/lint/no-process-cwd-in-sub-agents-lint.mjs',
  'scripts/log-harness-bug.js',
  'lib/worktree-reapability.js',
  'lib/claim/wip-detector.cjs',
  'lib/fleet/inflight-git-state.cjs',
  'scripts/worktree-reaper.mjs',
  'lib/governance/measurement-provenance.js',
  'scripts/phantom-test-audit.js',
];

/** A direct git spawn: the private-runner shape the census files must never regrow. */
const DIRECT_GIT_SPAWN = /(?:spawnSync|execFileSync|execFile|exec)\s*\(\s*['"]git['"]|execSync\s*\(\s*`git /;
/** Importing the published runner (either export form, either module system). */
const FACTORY_REF = /hardened-runner\.cjs|makeHardenedGitRunner|runHardenedGit/;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('FR-4: no-private-runner invariant over the frozen census', () => {
  for (const rel of CENSUS) {
    it(`${rel} is factory-sourced with no direct git spawn`, () => {
      const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      expect(FACTORY_REF.test(src), `${rel} must reference the published runner`).toBe(true);
      expect(DIRECT_GIT_SPAWN.test(src), `${rel} must not carry a private git spawn`).toBe(false);
    });
  }

  it('every recorded opt-out carries a non-empty reason (the ledger contract)', () => {
    expect(() => assertOptOutReasons(OPT_OUTS)).not.toThrow();
  });
});

describe('FR-5 armed two-sided: measurement-provenance defaultGit', () => {
  it('RUNS: benign literal returns a real sha through the adopted runner', async () => {
    const mod = await import('../governance/measurement-provenance.js');
    const out = mod.defaultGit('rev-parse --short HEAD');
    expect(out).toMatch(/^[0-9a-f]{4,40}$/);
  });

  it('NO SHELL: a command-chain payload creates no marker and returns empty', async () => {
    const mod = await import('../governance/measurement-provenance.js');
    const marker = path.join(ROOT, `.armed-marker-mp-${process.pid}`);
    try {
      // Under the OLD template-literal execSync this string reached a shell where the separator
      // spawns a second command; under argv it is a bogus git arg -> error -> '' (fail-soft).
      const payload = `rev-parse HEAD; node -e "require('fs').writeFileSync('${marker.replace(/\\/g, '/')}','x')"`;
      const out = mod.defaultGit(payload);
      expect(out).toBe('');
      expect(fs.existsSync(marker), 'the payload must never execute').toBe(false);
    } finally {
      try { fs.unlinkSync(marker); } catch { /* not created — the point */ }
    }
  });
});

describe('FR-5 armed two-sided: phantom-test-audit safeGit (via resolveAuditBase default path)', () => {
  it('RUNS: the default seam resolves a real merge-base in this repo', async () => {
    const mod = await import('../../scripts/phantom-test-audit.js');
    // resolveAuditBase default git is safeGit; a real repo resolves a real sha or falls back.
    const base = mod.resolveAuditBase({ repoPath: ROOT, baseRef: 'HEAD' });
    expect(typeof base).toBe('string');
    expect(base.length).toBeGreaterThan(0);
  });

  it('NO SHELL: a hostile baseRef becomes a literal git arg, never a second command', async () => {
    const mod = await import('../../scripts/phantom-test-audit.js');
    const marker = path.join(ROOT, `.armed-marker-pt-${process.pid}`);
    try {
      const hostile = `HEAD & node -e "require('fs').writeFileSync('${marker.replace(/\\/g, '/')}','x')"`;
      // Fail-soft contract: unresolvable merge-base falls back to the baseRef string itself.
      const base = mod.resolveAuditBase({ repoPath: ROOT, baseRef: hostile });
      expect(base).toBe(hostile);
      expect(fs.existsSync(marker), 'the payload must never execute').toBe(false);
    } finally {
      try { fs.unlinkSync(marker); } catch { /* not created — the point */ }
    }
  });
});
