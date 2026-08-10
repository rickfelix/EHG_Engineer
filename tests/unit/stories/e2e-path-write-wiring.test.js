/**
 * SD-LEO-INFRA-STORY-E2E-WRITE-001 — the write-time choke-point WIRING.
 *
 * The guard itself (lib/stories/e2e-path-guard.js) shipped under the sibling SD and is pinned
 * by its own 17 tests. These tests pin the WIRING: the live fabricating writer
 * (scripts/modules/auto-trigger-stories.mjs generateE2ETestPath) now routes its templated
 * candidate through resolveE2ePath(requireRelevance:false), so a fiction path becomes NULL at
 * write while a real file is preserved. Every positive control here INJECTS the failing input —
 * the measured baseline is already quiet (0/443 recent stories carry a path), so an assertion
 * over live rows would be green even with the wiring deleted (TR-2's green-by-default hazard).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { generateE2ETestPath } from '../../../scripts/modules/auto-trigger-stories.mjs';

const noFile = { existsSync: () => false };
const everyFile = { existsSync: () => true };

describe('TS-1 — a fabricated path is refused AT write', () => {
  it('a feature story whose templated spec does not exist persists path=NULL, status untouched', () => {
    const r = generateE2ETestPath('SD-X-001', 'feature', '001', 'add widget', { repoRoot: '/repo', deps: noFile });
    expect(r.path).toBeNull();
    expect(r.status).toBe('not_created'); // the honest intent marker is the ONLY representation left
  });

  it('every non-documentation sd_type falls to NULL on a nonexistent spec — no pattern escapes the guard', () => {
    for (const sdType of ['feature', 'security', 'infrastructure', 'database', 'api', 'unknown-type']) {
      const r = generateE2ETestPath('SD-X-001', sdType, '002', 't', { repoRoot: '/repo', deps: noFile });
      expect(r.path, sdType).toBeNull();
      expect(r.status, sdType).toBe('not_created');
    }
  });
});

describe('TS-2 — a real existing spec is preserved (real coverage never nulled)', () => {
  it('the templated candidate is returned unchanged when the file exists', () => {
    const r = generateE2ETestPath('SD-X-001', 'feature', '001', 'add widget', { repoRoot: '/repo', deps: everyFile });
    expect(r.path).toBe('tests/e2e/x-001-us-001.spec.ts');
    expect(r.status).toBe('not_created');
  });
});

describe('TS-3 — the documentation sentinel is gone', () => {
  it('documentation SDs persist NULL, never the "N/A - …" sentinel string; status semantics unchanged', () => {
    const r = generateE2ETestPath('SD-X-001', 'documentation', '001', 'write docs', { repoRoot: '/repo', deps: everyFile });
    expect(r.path).toBeNull();
    expect(r.status).toBe('not_applicable');
  });
});

describe('TS-4 — repo-root contract, exercised THROUGH the wiring', () => {
  // The guard's own two-root sensitivity is already pinned by its tests; this drives the
  // WIRING's root selection, so mutating the wiring's root handling reds here.
  const EHG_ROOT = '/repos/ehg';
  const ENGINEER_ROOT = '/repos/EHG_Engineer';
  // Only the ehg tree contains the spec: existence keys off which root the wiring passes down.
  const fsOnlyInEhg = { existsSync: (p) => String(p).replace(/\\/g, '/').startsWith(EHG_ROOT + '/') };

  it('the wiring with the CORRECT root preserves the real path', () => {
    const r = generateE2ETestPath('SD-X-001', 'feature', '001', 't', { repoRoot: EHG_ROOT, deps: fsOnlyInEhg });
    expect(r.path).toBe('tests/e2e/x-001-us-001.spec.ts');
  });

  it('the wiring with the WRONG root refuses the same path — the verdict follows the root', () => {
    const r = generateE2ETestPath('SD-X-001', 'feature', '001', 't', { repoRoot: ENGINEER_ROOT, deps: fsOnlyInEhg });
    expect(r.path).toBeNull();
  });
});

describe('TS-5 — single representation, positively asserted', () => {
  const src = readFileSync(new URL('../../../scripts/modules/auto-trigger-stories.mjs', import.meta.url), 'utf8');

  it('POSITIVE: the writer imports the guard (reds if unwired — the writer had zero fs checks before, so absence-only proves nothing)', () => {
    expect(src).toMatch(/from '\.\.\/\.\.\/lib\/stories\/e2e-path-guard\.js'/);
    expect(src).toMatch(/resolveE2ePath\(\{/);
    expect(src).toMatch(/requireRelevance: false/); // the sibling gate's deliberate existence-only bar
  });

  it('NEGATIVE: no second existence predicate in the writer', () => {
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const code = stripComments(src);
    expect(code).not.toMatch(/existsSync|statSync|accessSync/);
  });
});

describe('FR-4 — the counter-pressure instrument census, pinned', () => {
  // Measured 2026-08-10: public.validate_story_e2e_requirements (which reports a NULL
  // e2e_test_path as an ISSUE — the exact fabrication pressure this SD removes) and both its
  // relatives have ZERO code consumers: their only caller is each other inside the defining
  // migration. The write-side NULLs therefore cannot regress any live code path through them.
  // If this test reds, a consumer appeared and the recorded contradiction (feedback channel,
  // SD-LEO-INFRA-STORY-E2E-WRITE-001) must be re-evaluated BEFORE relying on that consumer.
  it('validate_story_e2e_requirements and relatives have zero callers under scripts/ and lib/', () => {
    for (const fn of ['validate_story_e2e_requirements', 'validate_sd_stories_e2e_requirements', 'get_e2e_template_for_sd']) {
      let out = '';
      try {
        out = execSync(`git grep -l "${fn}" -- scripts lib`, { encoding: 'utf8', cwd: new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
      } catch { /* non-zero exit = no matches = the pinned state */ }
      expect(out.trim(), `${fn} gained a code consumer — re-evaluate the recorded contradiction`).toBe('');
    }
  });
});

describe('status column ownership is untouched (regression pin)', () => {
  it('the wiring changed only the path owner: not_created / not_applicable stamping is byte-identical', () => {
    expect(generateE2ETestPath('SD-A-1', 'feature', '001', 't', { repoRoot: '/r', deps: noFile }).status).toBe('not_created');
    expect(generateE2ETestPath('SD-A-1', 'feature', '001', 't', { repoRoot: '/r', deps: everyFile }).status).toBe('not_created');
    expect(generateE2ETestPath('SD-A-1', 'documentation', '001', 't', { repoRoot: '/r', deps: noFile }).status).toBe('not_applicable');
  });
});
