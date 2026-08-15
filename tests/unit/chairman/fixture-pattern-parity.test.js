/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-002 (FR-2) — JS↔SQL fixture-pattern lockstep pin.
 * Extended by SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001 (FR-3) for ZZZ_/UAT[-_]/epoch-tail.
 *
 * The chairman-actionable predicate lives in TWO places by design: the canonical SQL
 * (latest get_pending_chairman_items migration) and the JS mirror
 * (lib/chairman/chairman-actionable.mjs FIXTURE_NAME_PATTERNS). This test pins them to a
 * single expected pairs table so a pattern added on one side without the other FAILS here
 * — the leak class this SD fixes shipped precisely because nothing enforced the lockstep.
 * (Recipe follows tests/integration/get-pending-chairman-items.contract.test.js: static
 * readFileSync assertions, no live DB needed.)
 *
 * PAIRING IS NOT ALWAYS 1:1: `sql` is an array because UAT[-_] needs 2 SQL ILIKE clauses
 * (LIKE has no character-class syntax), and the epoch-tail pattern has NO ILIKE form at all
 * (it needs a POSIX `~` operator, tracked separately via `sqlOperator: 'posix'`).
 */
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { FIXTURE_NAME_PATTERNS, isFixtureVenture } from '../../../lib/chairman/chairman-actionable.mjs';
import { resolveLatestMigration } from '../../helpers/latest-migration.js';

// Resolved by content marker, not a hardcoded filename — see tests/helpers/latest-migration.js
// for why a hardcoded pin here is the exact bug class this SD's FR-4 fixes elsewhere.
const { sql } = resolveLatestMigration(
  resolve(process.cwd()),
  'CREATE OR REPLACE FUNCTION public.get_pending_chairman_items('
);

/** The single source of truth for the lockstep: JS regex source ↔ SQL clause(s). */
const EXPECTED_PAIRS = [
  { js: '^__', sql: ["v.name LIKE '\\_\\_%'"] },
  { js: '^test venture', sql: ["v.name ILIKE 'test venture%'"] },
  { js: 'citest', sql: ["v.name ILIKE '%citest%'"] },
  { js: '^canonical-source-test', sql: ["v.name ILIKE 'canonical-source-test%'"] },
  { js: '-realdb-', sql: ["v.name ILIKE '%-realdb-%'"] },
  { js: '-noop-', sql: ["v.name ILIKE '%-noop-%'"] },
  { js: '^parity-test-', sql: ["v.name ILIKE 'parity-test-%'"] },
  { js: '^test-stub', sql: ["v.name ILIKE 'test-stub%'"] },
  { js: '^test-harness-', sql: ["v.name ILIKE 'test-harness-%'"] },
  { js: '^ts-fixture-', sql: ["v.name ILIKE 'ts-fixture-%'"] },
  { js: '^_pipeline_test_', sql: ["v.name ILIKE '\\_pipeline\\_test\\_%'"] },
  { js: '^pipeline-test-', sql: ["v.name ILIKE 'pipeline-test-%'"] },
  { js: '^gate-test-', sql: ["v.name ILIKE 'gate-test-%'"] },
  { js: '^ZZZ_', sql: ["v.name ILIKE 'ZZZ\\_%'"] },
  { js: '^UAT[-_]', sql: ["v.name ILIKE 'UAT-%'", "v.name ILIKE 'UAT\\_%'"] },
  { js: '[-:]\\d{10,}$', sql: ["v.name ~ '[-:][0-9]{10,}$'"], sqlOperator: 'posix' },
];

describe('fixture-pattern JS↔SQL parity', () => {
  it('every expected pair exists in the JS pattern list', () => {
    const jsSources = FIXTURE_NAME_PATTERNS.map((re) => re.source);
    for (const { js } of EXPECTED_PAIRS) {
      expect(jsSources, `JS missing /${js}/`).toContain(js);
    }
  });

  it('every expected pair exists in the canonical SQL migration', () => {
    for (const { sql: clauses } of EXPECTED_PAIRS) {
      for (const clause of clauses) {
        expect(sql.includes(clause), `SQL missing ${clause}`).toBe(true);
      }
    }
  });

  it('neither side has patterns beyond the expected pairs (bidirectional pin)', () => {
    // JS side: exact count (1 JS pattern per EXPECTED_PAIRS entry, even where 1 JS pattern
    // maps to multiple SQL clauses).
    expect(FIXTURE_NAME_PATTERNS).toHaveLength(EXPECTED_PAIRS.length);
    // SQL side: ILIKE/LIKE clauses and POSIX `~` clauses are counted separately, since a
    // regex counting only `I?LIKE` would silently never notice a missing `~` clause.
    const ilikeClauses = sql.match(/v\.name I?LIKE '/g) || [];
    const posixClauses = sql.match(/v\.name ~ '/g) || [];
    const expectedIlikeCount = EXPECTED_PAIRS
      .filter((p) => p.sqlOperator !== 'posix')
      .reduce((n, p) => n + p.sql.length, 0);
    const expectedPosixCount = EXPECTED_PAIRS
      .filter((p) => p.sqlOperator === 'posix')
      .reduce((n, p) => n + p.sql.length, 0);
    expect(ilikeClauses).toHaveLength(expectedIlikeCount);
    expect(posixClauses).toHaveLength(expectedPosixCount);
  });

  it('both sides keep the fail-include NULL semantics and is_demo primary signal', () => {
    expect(sql.includes('v.is_demo IS TRUE')).toBe(true);
    expect(sql.includes(', false)')).toBe(true); // COALESCE(..., false) fail-include
  });
});

describe('fixture-pattern: ZZZ_/UAT/epoch-tail exclusion (SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001)', () => {
  it('excludes ZZZ_-prefixed, UAT-prefixed, and epoch-tail-suffixed venture names', () => {
    expect(isFixtureVenture({ name: 'ZZZ_scratch_venture' })).toBe(true);
    expect(isFixtureVenture({ name: 'UAT-thing' })).toBe(true);
    expect(isFixtureVenture({ name: 'UAT_thing' })).toBe(true);
    expect(isFixtureVenture({ name: 'job-1786000000000' })).toBe(true);
  });

  // Negative cases for the 3 NEW patterns only. QF-20260807-014 (my-app-realdb-check,
  // svc-noop-probe, citest-runner false-positiving via the PRE-EXISTING unanchored
  // -realdb-/-noop-/citest patterns) is a separate, still-open, cancelled-not-resolved
  // issue this SD does NOT fix — anchoring those 3 existing patterns is out of this SD's
  // verified scope (see PRD FR-5 scope correction). Named here, not silently dropped.
  it('does NOT exclude real venture names that merely contain "uat" as a substring', () => {
    expect(isFixtureVenture({ name: 'situation-tracker' })).toBe(false);
    expect(isFixtureVenture({ name: 'evaluate-q3-venture' })).toBe(false);
    expect(isFixtureVenture({ name: 'graduate-program-app' })).toBe(false);
  });
});
