/**
 * Unit tests for the codified invariant library
 * SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (FR-2)
 *
 * Two-sided by construction: every seeded invariant is exercised with a fixture it MUST
 * catch (the gap-class it was codified from) and a fixture it MUST NOT flag (the same
 * plan with the gap closed). A check that fires on both, or on neither, is a test that
 * catches nothing.
 */
import { describe, it, expect } from 'vitest';
import {
  INVARIANTS,
  runInvariantChecks,
  assertInvariantLibraryIntegrity,
} from './invariant-library.js';

describe('invariant library integrity (anti-Goodhart)', () => {
  it('every entry carries a citation from a real caught gap', () => {
    expect(assertInvariantLibraryIntegrity()).toBe(true);
    for (const inv of INVARIANTS) {
      expect(inv.citation.source.length).toBeGreaterThan(8);
      expect(inv.citation.measured.length).toBeGreaterThan(20);
    }
  });

  it('rejects a speculative entry (no citation) at load', () => {
    const speculative = [{
      id: 'INV-999-imagined-failure',
      title: 'A rule someone thought would be nice',
      severity: 'warn',
      citation: { source: '', measured: '' },
      check: () => ({ hit: false, message: '' }),
    }];
    expect(() => assertInvariantLibraryIntegrity(speculative)).toThrow(/anti-Goodhart|citation/);
  });

  it('rejects a block-severity heuristic (regexes prove nothing)', () => {
    const overreaching = [{
      id: 'INV-998-overreach',
      title: 'x',
      severity: 'fatal',
      citation: { source: 'SD-REAL-SOMETHING-001', measured: 'a real measured consequence of a caught gap' },
      check: () => ({ hit: false, message: '' }),
    }];
    expect(() => assertInvariantLibraryIntegrity(overreaching)).toThrow(/severity/);
  });
});

describe('INV-001 control-without-could-not-check-path', () => {
  it('catches a plan that adds a gate with no could-not-run behavior', () => {
    const { findings } = runInvariantChecks({
      prdContent: 'Add a new handoff gate that validates PRD quality and a monitor for drift.',
    });
    expect(findings.some((f) => f.invariant_id === 'INV-001-control-without-could-not-check-path')).toBe(true);
  });

  it('stays quiet when the plan specifies could-not-check behavior', () => {
    const { findings } = runInvariantChecks({
      prdContent: 'Add a new handoff gate. When the gate cannot run (LLM unavailable) it reports COULD_NOT_CHECK, never pass.',
    });
    expect(findings.some((f) => f.invariant_id === 'INV-001-control-without-could-not-check-path')).toBe(false);
  });
});

describe('INV-002 repair-gated-on-code-present-not-data-present', () => {
  it('catches a seeder plan with no data-landed acceptance criterion', () => {
    const { findings } = runInvariantChecks({
      prdContent: 'Build a backfill job that populates the embeddings table. AC: the script exits 0.',
    });
    expect(findings.some((f) => f.invariant_id === 'INV-002-repair-gated-on-code-present-not-data-present')).toBe(true);
  });

  it('stays quiet when the plan verifies rows landed', () => {
    const { findings } = runInvariantChecks({
      prdContent: 'Build a backfill job. AC: table row count before/after shows 0 -> N by real count; rows landed at the consumer.',
    });
    expect(findings.some((f) => f.invariant_id === 'INV-002-repair-gated-on-code-present-not-data-present')).toBe(false);
  });
});

describe('INV-003 migration-authored-is-not-applied', () => {
  it('catches a plan referencing DDL with no applied-verification step', () => {
    const { findings } = runInvariantChecks({
      prdContent: 'Author a migration to ALTER TABLE widgets adding a status column.',
    });
    expect(findings.some((f) => f.invariant_id === 'INV-003-migration-authored-is-not-applied')).toBe(true);
  });

  it('stays quiet when the plan verifies the applied object', () => {
    const { findings } = runInvariantChecks({
      prdContent: 'Author a migration to ALTER TABLE widgets. After apply, verify the constraint via pg_get_constraintdef over the pooler.',
    });
    expect(findings.some((f) => f.invariant_id === 'INV-003-migration-authored-is-not-applied')).toBe(false);
  });
});

describe('coverage reporting (FR-3)', () => {
  it('reports every invariant class it checked, hit or not', () => {
    const { checked_classes } = runInvariantChecks({ prdContent: 'trivial' });
    expect(checked_classes).toEqual(INVARIANTS.map((i) => i.id));
  });

  it('findings carry the citation of the gap-class they encode', () => {
    const { findings } = runInvariantChecks({
      prdContent: 'Add a validator gate.',
    });
    for (const f of findings) {
      expect(f.citation).toBeTruthy();
      expect(f.category).toBe('invariant');
    }
  });
});
