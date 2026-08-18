/**
 * Unit-tier, DB-free conformance gauge.
 *
 * SD-FDBK-FIX-EXIT-GATE-CONFORMANCE-001 (FR-2, TS-1/TS-2/TS-7).
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM tests/db-invariants/venture-stages-gate-verifier-conformance.test.js:
 * that DB-gated test is CORRECTLY skipped in normal CI (per tests/helpers/db-available.js,
 * QF-20260726-459 — no designated non-prod Supabase target is provisioned, so it never runs
 * against the live 148+-venture production DB). Making it "run unskipped" would mean defeating
 * that deliberate safety control (testing-agent finding F1, BLOCKING as originally scoped for
 * this SD). Instead, this file unit-tests the SAME pure comparison logic
 * (lib/eva/lifecycle/gate-conformance.js's computeGateConformance) over a COMMITTED FIXTURE
 * (tests/fixtures/venture-stages-gate-strings.json, a snapshot of the live data at authoring
 * time) — this runs unskipped, every time, in normal CI.
 *
 * TS-9/TS-10 note: this fixture-based test intentionally does NOT assert the live count stays
 * exactly the fixture's snapshot count forever — the fixture is a point-in-time input for
 * testing the FUNCTION, not a live regression guard (that job belongs to the DB-gated test,
 * which IS a regression guard against current live data). What this file DOES assert never
 * regresses is the FUNCTION's correctness against a known, fixed input.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { computeGateConformance } from '../../../../lib/eva/lifecycle/gate-conformance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, '../../../fixtures/venture-stages-gate-strings.json');
const fixtureStages = JSON.parse(readFileSync(fixturePath, 'utf-8'));

describe('computeGateConformance (pure, DB-free, unit tier — TS-1/TS-2/TS-7)', () => {
  it('TS-1: reports the exact unresolvable-binding count and affected stage/string pairs for the committed fixture', () => {
    const report = computeGateConformance(fixtureStages);
    // Snapshot at fixture-capture time (post-FR-1): 5 unresolvable of 21 binding strings.
    expect(report.unresolvableCount).toBe(5);
    expect(report.totalBindingCount).toBe(21);
    const affected = report.unresolvableBinding.map((e) => `S${e.stage}: ${e.gateString}`).sort();
    expect(affected).toEqual([
      'S1: Category assigned',
      'S2: Contrarian review done',
      'S2: Multi-model pass complete',
      'S2: Top-5 risks identified',
      'S3: Validation score >= 6',
    ]);
  });

  it('TS-2: reports 0 unresolvable when every binding string resolves (synthetic all-resolved fixture)', () => {
    const allResolved = [
      { stage_number: 1, stage_name: 'Test Stage', metadata: { gates: { exit: ['Application deployed'] } } },
    ];
    const report = computeGateConformance(allResolved);
    expect(report.unresolvableCount).toBe(0);
    expect(report.unresolvableBinding).toEqual([]);
  });

  it('is a pure function: identical input produces identical output, no mutation of the input', () => {
    const input = JSON.parse(JSON.stringify(fixtureStages));
    const inputCopy = JSON.parse(JSON.stringify(fixtureStages));
    const reportA = computeGateConformance(input);
    const reportB = computeGateConformance(input);
    expect(reportA).toEqual(reportB);
    expect(input).toEqual(inputCopy);
  });

  it('handles malformed/missing metadata gracefully (no throw, treated as zero gates)', () => {
    const malformed = [
      { stage_number: 99, metadata: {} },
      { stage_number: 100 },
      { stage_number: 101, metadata: { gates: { exit: 'not-an-array' } } },
    ];
    expect(() => computeGateConformance(malformed)).not.toThrow();
    const report = computeGateConformance(malformed);
    expect(report.unresolvableCount).toBe(0);
  });
});
