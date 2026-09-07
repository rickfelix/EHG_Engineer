/**
 * SD-LEO-INFRA-WIDEN-SWALLOWED-QUERY-001 FR-6.
 *
 * .github/workflows/swallowed-query-error-lint.yml's `on.pull_request.paths` is a SEPARATE,
 * hardcoded list from the lint's own SCAN_PREFIXES array. They must be changed together in the
 * same PR, or a widened scan scope is armed but unreachable -- a PR touching only the
 * newly-widened directory would never trigger this job, so `--enforce` would never see it. A
 * comment cross-reference cannot detect drift; this test parses the real YAML and asserts it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import yaml from 'js-yaml';
import { SCAN_PREFIXES } from '../../../scripts/lint/swallowed-query-error-lint.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = resolve(__dirname, '../../../.github/workflows/swallowed-query-error-lint.yml');

describe('swallowed-query-error-lint.yml path filter stays in sync with SCAN_PREFIXES', () => {
  it('parses as valid YAML', () => {
    expect(() => yaml.load(readFileSync(WORKFLOW_PATH, 'utf8'))).not.toThrow();
  });

  it('on.pull_request.paths is a superset of every SCAN_PREFIXES directory (as a /** glob)', () => {
    const doc = yaml.load(readFileSync(WORKFLOW_PATH, 'utf8'));
    // GitHub Actions parses the `on:` key as boolean `true` in some YAML 1.1 parsers; this repo's
    // workflow uses the plain `on:` mapping form, so read it directly rather than guarding for that.
    const paths = doc.on?.pull_request?.paths;
    expect(Array.isArray(paths)).toBe(true);

    const missing = SCAN_PREFIXES.filter((prefix) => !paths.includes(`${prefix}/**`));
    expect(
      missing,
      `SCAN_PREFIXES ${JSON.stringify(missing)} has no matching '<dir>/**' entry in ` +
      'on.pull_request.paths -- add it to .github/workflows/swallowed-query-error-lint.yml ' +
      'in the same PR, or the widened scan scope is armed but unreachable.'
    ).toEqual([]);
  });

  it('runs with --enforce and no continue-on-error (FR-6: enforcing, not advisory)', () => {
    const raw = readFileSync(WORKFLOW_PATH, 'utf8');
    expect(raw).toMatch(/swallowed-query-error-lint\.mjs\s+--enforce/);
    expect(raw).not.toMatch(/continue-on-error:\s*true/);
  });
});
