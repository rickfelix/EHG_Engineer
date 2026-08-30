/**
 * SD-LEO-INFRA-BREAKAGE-ESCAPE-INSTRUMENT-001 (FR-5) — source-pin test.
 *
 * Direct execution of gatherFridayPulseData()/buildNarrative() requires the full DB dep
 * tree of management-review-generator.js (established pattern elsewhere in this codebase
 * for that file — see tests/management-reviews-purge.test.js, which also source-pins
 * rather than executing). This file pins: the pulse-data gatherer reads key_results for
 * KR-2026-07-02 and fails soft (never throws) when absent, and the narrative renders the
 * catch-rate line with the not-yet-computed fallback message.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

describe('management-review-generator.js — breakage-escape catch-rate wiring', () => {
  let source;
  test('setup: read the generator', () => {
    source = readFileSync(path.join(ROOT, 'scripts/pipeline/management-review-generator.js'), 'utf8');
    expect(source.length).toBeGreaterThan(0);
  });

  test('gatherFridayPulseData queries key_results by code=KR-2026-07-02 and fails soft', () => {
    expect(source).toMatch(/\.from\('key_results'\)/);
    expect(source).toMatch(/\.eq\('code',\s*'KR-2026-07-02'\)/);
    expect(source).toMatch(/catchRate = null/);
  });

  test('gatherFridayPulseData returns catchRate in its result object', () => {
    expect(source).toMatch(/return\s*\{\s*blocked,\s*stageCrossings,\s*ventureFacing,\s*harnessWork,\s*overrideCount,\s*catchRate\s*\}/);
  });

  test('buildNarrative renders the catch-rate line with a not-yet-computed fallback', () => {
    expect(source).toContain('Breakage catch-rate (KR-2026-07-02)');
    expect(source).toContain('not yet computed — run scripts/breakage-escape/compute-catch-rate.mjs --bank');
  });

  test('the pre-existing Blocked-time attribution UNKNOWN line is left untouched (a different, unrelated standing question)', () => {
    expect(source).toContain('Blocked-time attribution (chairman/tooling/fleet): UNKNOWN — no instrument exists');
  });
});
