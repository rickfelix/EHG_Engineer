import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * QF-20260712-023 — test-estate reachability guard (retro dc41e083, SPINE-001-B).
 *
 * DEFECT CLASS: a *.test.mjs file lands green in the editor but is run by NO
 * lane — vitest's unit include only covers tests/unit/org/ .test.mjs (the rest
 * are node:test-based and vitest-incompatible), so a new .test.mjs silently
 * becomes a dead verifier (witnessed: the SPINE-001-B org suites, and the 18
 * legacy files in the allowlist's debt register).
 *
 * This test lives in the ALWAYS-REACHABLE .test.js unit lane and fails the PR
 * when a tracked .test.mjs is neither (a) inside a vitest include, nor
 * (b) registered in tests/test-estate-mjs-allowlist.json with a named lane,
 * nor (c) already in the seeded legacy debt register (no new entries).
 */

const VITEST_MJS_INCLUDE_PREFIX = 'tests/unit/org/'; // mirrors vitest.config.js unit include

function trackedMjsTests() {
  const out = execFileSync('git', ['ls-files', '*.test.mjs'], { encoding: 'utf8' });
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

describe('test-estate .test.mjs reachability (QF-20260712-023)', () => {
  const allowlist = JSON.parse(
    readFileSync(join(process.cwd(), 'tests/test-estate-mjs-allowlist.json'), 'utf8')
  );
  const laned = new Set(Object.keys(allowlist.lanes));
  const legacy = new Set(allowlist.legacy_unaudited.files);

  it('every tracked .test.mjs file has a runner lane (or is pre-existing registered debt)', () => {
    const dead = trackedMjsTests().filter(
      (f) => !f.startsWith(VITEST_MJS_INCLUDE_PREFIX) && !laned.has(f) && !legacy.has(f)
    );
    expect(
      dead,
      `Dead verifier(s): ${dead.join(', ')} — a .test.mjs outside vitest's unit include ` +
        `(${VITEST_MJS_INCLUDE_PREFIX}) runs NOWHERE by default. Wire a lane (npm script + ` +
        `workflow, or a vitest include) and register it in tests/test-estate-mjs-allowlist.json ` +
        `lanes{}. Do not add to legacy_unaudited.`
    ).toEqual([]);
  });

  it('allowlist entries reference files that still exist (no stale debt rows)', () => {
    const tracked = new Set(trackedMjsTests());
    const stale = [...laned, ...legacy].filter((f) => !tracked.has(f));
    expect(
      stale,
      `Allowlist entries for deleted files: ${stale.join(', ')} — remove them from ` +
        `tests/test-estate-mjs-allowlist.json so the register stays honest.`
    ).toEqual([]);
  });

  it('the vitest-included org prefix still exists in the config (guard against silent include removal)', () => {
    const config = readFileSync(join(process.cwd(), 'vitest.config.js'), 'utf8');
    expect(config).toContain('**/tests/unit/org/**/*.test.mjs');
  });
});
