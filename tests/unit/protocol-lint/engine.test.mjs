/**
 * Fixture-driven tests for the Protocol Consistency Linter engine.
 *
 * Rule IDs are derived from the fixtures directory so adding a new rule
 * (with fixtures) automatically extends coverage without test churn.
 * Coverage gate `every rule has both fixtures` enforces positive AND
 * negative fixture per rule.
 *
 * SD-PROTOCOL-LINTER-001, slice 5/n.
 */

import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProtocolLint } from '../../../scripts/protocol-lint/engine.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', '..', '..', 'scripts', 'protocol-lint', 'fixtures');

const RULE_IDS = await (async () => {
  const files = await readdir(FIXTURES_DIR);
  const ids = new Set();
  for (const f of files) {
    const m = f.match(/^(LINT-[A-Z]+-\d{3})\.(positive|negative)\.json$/);
    if (m) ids.add(m[1]);
  }
  return [...ids].sort();
})();

async function loadFixture(name) {
  return JSON.parse(await readFile(join(FIXTURES_DIR, name), 'utf8'));
}

describe('Protocol Lint Engine', () => {
  it('passes cleanly on empty context', async () => {
    const result = await runProtocolLint({ ctx: { sections: [] } });
    expect(result.passed).toBe(true);
    expect(result.critical_count).toBe(0);
    expect(result.violations).toEqual([]);
  });

  it('records duration_ms and rules_evaluated', async () => {
    const result = await runProtocolLint({ ctx: { sections: [] } });
    expect(typeof result.duration_ms).toBe('number');
    expect(result.rules_evaluated).toBeGreaterThan(0);
  });

  it('every rule ships positive AND negative fixtures', async () => {
    const files = await readdir(FIXTURES_DIR);
    for (const id of RULE_IDS) {
      expect(files, `missing positive fixture for ${id}`).toContain(`${id}.positive.json`);
      expect(files, `missing negative fixture for ${id}`).toContain(`${id}.negative.json`);
    }
  });

  it('at least 12 rules are registered', () => {
    expect(RULE_IDS.length).toBeGreaterThanOrEqual(12);
  });
});

describe.each(RULE_IDS)('Rule fixture round-trip: %s', (ruleId) => {
  it('fires on positive fixture', async () => {
    const fixture = await loadFixture(`${ruleId}.positive.json`);
    const result = await runProtocolLint({ ctx: fixture });
    const hits = result.violations.filter(v => v.rule_id === ruleId);
    expect(hits.length, `expected ${ruleId} to produce violations on positive fixture`).toBeGreaterThan(0);

    const expected = fixture.expected_violations || [];
    for (const exp of expected.filter(e => e.rule_id === ruleId && e.section_id)) {
      expect(hits.some(h => h.section_id === exp.section_id),
        `${ruleId} expected to flag section_id=${exp.section_id}`).toBe(true);
    }
  });

  it('is silent on negative fixture', async () => {
    const fixture = await loadFixture(`${ruleId}.negative.json`);
    const result = await runProtocolLint({ ctx: fixture });
    const hits = result.violations.filter(v => v.rule_id === ruleId);
    expect(hits, `${ruleId} should not fire on negative fixture`).toEqual([]);
  });
});
