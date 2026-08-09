/**
 * SD-LEO-INFRA-FLEET-WIDE-VITEST-001 — the membership-completeness guard.
 *
 * Two-sided throughout. The pure-logic arms run on injected fixtures so they are fast and
 * deterministic; the LIVE arm runs vitest's own collection against the real repo, because a
 * guard that only ever sees a fixture cannot see the config it is meant to police.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyTrackedFile, findUnmembered, splitAdvisory, EXCLUSION_REASONS } from '../../../lib/testing/vitest-membership.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Authorities, DERIVED — never hand-listed. Guessing the manifest shape is what would make the count wrong. */
function loadAuthorities() {
  const cfg = fs.readFileSync(path.join(REPO, 'vitest.config.js'), 'utf8');
  const pw = fs.readFileSync(path.join(REPO, 'playwright.config.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'tests/quarantine-manifest.json'), 'utf8'));

  const playwrightDir = (pw.match(/testDir:\s*['"]\.?\/?([^'"]+)['"]/) || [])[1] || 'tests/e2e';
  // The config's NARROW .mjs include anchors, e.g. '**/tests/unit/org/**/*.test.mjs'.
  const vitestMjsAnchors = [...cfg.matchAll(/'\*\*\/([^']+?)\/\*\*\/\*\.test\.mjs'/g)].map((m) => m[1]);
  return {
    playwrightDir,
    quarantined: (manifest.quarantined || []).map((e) => e.file),
    vitestMjsAnchors,
    // SHARED_EXCLUDE entries that are SOURCE trees, not test locations. lib/agents holds
    // product code; tests/unit/agents does NOT and must stay in the population (FR-3).
    productTrees: ['lib/agents', 'applications', 'archive', 'press-kit', 'scratch', 'test'],
    namedExcludes: ['tests/integration.test.js', 'tests/a11y.spec.js'],
  };
}

function enumerateCollected() {
  const out = execFileSync('npx', ['vitest', 'list', '--filesOnly'], {
    cwd: REPO, encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024, shell: true,
  });
  return [...new Set(out.split('\n')
    .map((l) => l.trim())
    .filter((l) => /\.(test|spec)\.(js|mjs|cjs|ts|tsx)$/.test(l))
    .map((l) => l.replace(/^\[[a-z-]+\]\s*/, '').replace(/\\/g, '/')))];
}

function enumerateTracked() {
  const out = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\n').map((l) => l.trim()).filter((l) => /\.(test|spec)\.(js|mjs|cjs|ts|tsx)$/.test(l));
}

const AUTH = {
  playwrightDir: 'tests/e2e',
  quarantined: ['tests/unit/flaky.test.js'],
  vitestMjsAnchors: ['tests/unit/org'],
  productTrees: ['lib/agents'],
  namedExcludes: ['tests/integration.test.js'],
};

describe('classifyTrackedFile — the exclusion set is CLOSED and each arm is named', () => {
  it('a plain unit test SHOULD be collected (returns null)', () => {
    expect(classifyTrackedFile('tests/unit/thing.test.js', AUTH)).toBe(null);
  });

  it('KEEPS tests/unit/agents/** in the population — the 12 files this SD fixes must NOT be exempted', () => {
    // If this ever returns a reason, the guard has been widened to hide the defect it found.
    expect(classifyTrackedFile('tests/unit/agents/agent-registry.test.js', AUTH)).toBe(null);
  });

  it('excludes Playwright-owned specs, derived from testDir', () => {
    expect(classifyTrackedFile('tests/e2e/login.spec.ts', AUTH)).toBe(EXCLUSION_REASONS.PLAYWRIGHT);
  });

  it('excludes quarantined files, matched the way vitest.config globs them', () => {
    expect(classifyTrackedFile('tests/unit/flaky.test.js', AUTH)).toBe(EXCLUSION_REASONS.QUARANTINE);
  });

  it('excludes node:test .mjs OUTSIDE the config anchors, but KEEPS .mjs inside them', () => {
    expect(classifyTrackedFile('tests/unit/adam-startup.test.mjs', AUTH)).toBe(EXCLUSION_REASONS.NON_VITEST_SUITE);
    expect(classifyTrackedFile('tests/unit/org/spine.test.mjs', AUTH)).toBe(null);
  });

  it('excludes product source trees but NOT test trees that merely share a name', () => {
    expect(classifyTrackedFile('lib/agents/api.test.js', AUTH)).toBe(EXCLUSION_REASONS.PRODUCT_TREE);
    // The distinction FR-3 turns on: same word, different tree.
    expect(classifyTrackedFile('tests/unit/agents/api.test.js', AUTH)).toBe(null);
  });

  it('excludes literal paths named in SHARED_EXCLUDE', () => {
    expect(classifyTrackedFile('tests/integration.test.js', AUTH)).toBe(EXCLUSION_REASONS.NAMED_SHARED_EXCLUDE);
  });
});

describe('findUnmembered — two-sided, and it cannot pass on a failed enumeration', () => {
  const tracked = ['tests/unit/a.test.js', 'tests/unit/b.test.js'];

  it('AC-1 POSITIVE CONTROL: an orphan that should be collected but is not makes the guard RED', () => {
    const res = findUnmembered({ collected: ['tests/unit/a.test.js'], tracked, authorities: AUTH });
    expect(res).toEqual(['tests/unit/b.test.js']);
  });

  it('AC-2 NEGATIVE CONTROL: nothing unmembered when everything in the population is collected', () => {
    const res = findUnmembered({ collected: tracked, tracked, authorities: AUTH });
    expect(res).toEqual([]);
  });

  it('AC-3 SOURCE SWAP: feeding a tracked-file glob as the "collection" flips the verdict to a false clean', () => {
    // The blind implementation: use the tracked list as if it were the collection. It reports
    // clean while b.test.js is stranded — which is exactly why the population must come from
    // vitest's own enumeration and never from a glob.
    const blind = findUnmembered({ collected: tracked, tracked, authorities: AUTH });
    const honest = findUnmembered({ collected: ['tests/unit/a.test.js'], tracked, authorities: AUTH });
    expect(blind).toEqual([]);
    expect(honest).toEqual(['tests/unit/b.test.js']);
    expect(blind).not.toEqual(honest);
  });

  it('an EMPTY collection throws rather than passing — a failed enumeration is an error, not a clean bill', () => {
    expect(() => findUnmembered({ collected: [], tracked, authorities: AUTH })).toThrow(/refusing to report a pass/);
  });

  it('NARROWNESS CONTROL: widening the exclusion set to a catch-all would hide a real orphan', () => {
    // Simulates the tempting "exempt anything not currently collected" formulation.
    const catchAll = { ...AUTH, productTrees: ['tests'] };
    const hidden = findUnmembered({ collected: ['tests/unit/a.test.js'], tracked, authorities: catchAll });
    const real = findUnmembered({ collected: ['tests/unit/a.test.js'], tracked, authorities: AUTH });
    expect(hidden).toEqual([]);      // the catch-all reports clean...
    expect(real).toEqual(['tests/unit/b.test.js']); // ...while the honest set still sees the orphan
  });
});

describe('splitAdvisory — the waiver is PATTERN-scoped, not a snapshot of what happens to fail', () => {
  it('waives the gated-db class', () => {
    const { waived, blocking } = splitAdvisory(['tests/database/x.test.js', 'lib/y.db.test.js']);
    expect(waived).toHaveLength(2);
    expect(blocking).toEqual([]);
  });

  it('BLOCKS anything outside that class — a NEW orphan fails on day one', () => {
    const { waived, blocking } = splitAdvisory(['tests/unit/brand-new-orphan.test.js']);
    expect(waived).toEqual([]);
    expect(blocking).toEqual(['tests/unit/brand-new-orphan.test.js']);
  });

  it('the 12 agents files would NOT have been waived — the advisory split could not have hidden them', () => {
    // Proves the waiver is scoped by DB_INCLUDE patterns and not by "currently unmembered".
    // Had it been a snapshot, FR-3's defect would have been absorbed instead of fixed.
    const { waived, blocking } = splitAdvisory(['tests/unit/agents/agent-registry.test.js']);
    expect(waived).toEqual([]);
    expect(blocking).toHaveLength(1);
  });
});

describe('LIVE: every tracked test file that should be collected IS collected', () => {
  // ADVISORY for the gated-db class ONLY, until the sibling data-integrity SD lands the runtime
  // gate in tests/setup.db.js. That class cannot be repaired here without running 125
  // non-self-guarding suites against a live database (vitest.config.js:163; coordinator
  // verified independently). Everything else is BLOCKING from day one.
  it('no tracked test file outside the waived gated-db class belongs to zero collected projects', () => {
    const collected = enumerateCollected();
    const tracked = enumerateTracked();
    const unmembered = findUnmembered({ collected, tracked, authorities: loadAuthorities() });
    const { waived, blocking } = splitAdvisory(unmembered);

    if (waived.length > 0) {
      // Reported every run so the debt stays visible instead of decaying into background noise.
      console.warn(
        `[vitest-membership] ADVISORY: ${waived.length} gated-db test file(s) are members of zero ` +
        'collected projects and never run. Not blocked here — repairing this requires a runtime ' +
        'gate in tests/setup.db.js (sibling data-integrity SD). Promote this guard to blocking ' +
        'when that lands.'
      );
    }
    if (blocking.length > 0) {
      throw new Error(
        `${blocking.length} tracked test file(s) belong to ZERO collected vitest projects — ` +
        `they never run and the suite still reports green:\n  ${blocking.slice(0, 40).join('\n  ')}` +
        (blocking.length > 40 ? `\n  …and ${blocking.length - 40} more` : '')
      );
    }
    expect(blocking).toEqual([]);
  }, 900000);
});
