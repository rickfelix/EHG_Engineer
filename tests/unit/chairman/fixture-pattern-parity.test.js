/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-002 (FR-2) — JS↔SQL fixture-pattern lockstep pin.
 *
 * The chairman-actionable predicate lives in TWO places by design: the canonical SQL
 * (latest get_pending_chairman_items migration) and the JS mirror
 * (lib/chairman/chairman-actionable.mjs FIXTURE_NAME_PATTERNS). This test pins them to a
 * single expected pairs table so a pattern added on one side without the other FAILS here
 * — the leak class this SD fixes shipped precisely because nothing enforced the lockstep.
 * (Recipe follows tests/integration/get-pending-chairman-items.contract.test.js: static
 * readFileSync assertions, no live DB needed.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FIXTURE_NAME_PATTERNS } from '../../../lib/chairman/chairman-actionable.mjs';

const MIGRATION = resolve(
  process.cwd(),
  'database/migrations/20260717_extend_fixture_patterns_get_pending_chairman_items.sql'
);
const sql = readFileSync(MIGRATION, 'utf-8');

/** The single source of truth for the lockstep: JS regex source ↔ SQL clause. */
const EXPECTED_PAIRS = [
  { js: '^__', sql: "v.name LIKE '\\_\\_%'" },
  { js: '^test venture', sql: "v.name ILIKE 'test venture%'" },
  { js: 'citest', sql: "v.name ILIKE '%citest%'" },
  { js: '^canonical-source-test', sql: "v.name ILIKE 'canonical-source-test%'" },
  { js: '-realdb-', sql: "v.name ILIKE '%-realdb-%'" },
  { js: '-noop-', sql: "v.name ILIKE '%-noop-%'" },
  { js: '^parity-test-', sql: "v.name ILIKE 'parity-test-%'" },
  { js: '^test-stub', sql: "v.name ILIKE 'test-stub%'" },
  { js: '^test-harness-', sql: "v.name ILIKE 'test-harness-%'" },
  { js: '^ts-fixture-', sql: "v.name ILIKE 'ts-fixture-%'" },
  { js: '^_pipeline_test_', sql: "v.name ILIKE '\\_pipeline\\_test\\_%'" },
  { js: '^pipeline-test-', sql: "v.name ILIKE 'pipeline-test-%'" },
  { js: '^gate-test-', sql: "v.name ILIKE 'gate-test-%'" },
];

describe('fixture-pattern JS↔SQL parity', () => {
  it('every expected pair exists in the JS pattern list', () => {
    const jsSources = FIXTURE_NAME_PATTERNS.map((re) => re.source);
    for (const { js } of EXPECTED_PAIRS) {
      expect(jsSources, `JS missing /${js}/`).toContain(js);
    }
  });

  it('every expected pair exists in the canonical SQL migration', () => {
    for (const { sql: clause } of EXPECTED_PAIRS) {
      expect(sql.includes(clause), `SQL missing ${clause}`).toBe(true);
    }
  });

  it('neither side has patterns beyond the expected pairs (bidirectional pin)', () => {
    // JS side: exact count.
    expect(FIXTURE_NAME_PATTERNS).toHaveLength(EXPECTED_PAIRS.length);
    // SQL side: count the name-clauses inside the fixture COALESCE block.
    const nameClauses = sql.match(/v\.name I?LIKE '/g) || [];
    expect(nameClauses).toHaveLength(EXPECTED_PAIRS.length);
  });

  it('both sides keep the fail-include NULL semantics and is_demo primary signal', () => {
    expect(sql.includes('v.is_demo IS TRUE')).toBe(true);
    expect(sql.includes(', false)')).toBe(true); // COALESCE(..., false) fail-include
  });
});
