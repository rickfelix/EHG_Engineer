/**
 * SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-B — dry-run staged-candidate verifier.
 * Pure: composes the -A predicate over a set of staged rows into a dry-run report.
 */
import { describe, it, expect } from 'vitest';
import {
  verifyStagedCandidates,
  formatVerifierReport,
  REFILL_INVALID_REASONS,
} from '../../../lib/sourcing-engine/refill-dry-run-verifier.js';

const validRow = (over = {}) => ({
  id: 'id-' + Math.round(over.n ?? 1) , // label only
  title: 'Real captured roadmap item',
  source_type: 'todoist',
  source_id: 'src-123',
  item_disposition: 'pending',
  promoted_to_sd_key: null,
  lane: 'belt-ready',
  ...over,
});

describe('verifyStagedCandidates', () => {
  it('counts a clean valid candidate as would-promote', () => {
    const r = verifyStagedCandidates([validRow()]);
    expect(r.total).toBe(1);
    expect(r.validCount).toBe(1);
    expect(r.invalidCount).toBe(0);
    expect(r.valid).toHaveLength(1);
  });

  it('buckets invalid rows by the -A predicate reason', () => {
    const rows = [
      validRow(),
      validRow({ promoted_to_sd_key: 'SD-X-001' }),       // already_promoted
      validRow({ item_disposition: 'dropped' }),           // not_staged
      validRow({ lane: 'decline' }),                       // declined_lane
      validRow({ title: '' }),                             // missing_title
      validRow({ source_id: '' }),                         // missing_provenance
      validRow({ title: 'TEST fixture row' }),             // test_fixture
    ];
    const r = verifyStagedCandidates(rows);
    expect(r.total).toBe(7);
    expect(r.validCount).toBe(1);
    expect(r.invalidCount).toBe(6);
    expect(r.byReason[REFILL_INVALID_REASONS.ALREADY_PROMOTED]).toBe(1);
    expect(r.byReason[REFILL_INVALID_REASONS.NOT_STAGED]).toBe(1);
    expect(r.byReason[REFILL_INVALID_REASONS.DECLINED_LANE]).toBe(1);
    expect(r.byReason[REFILL_INVALID_REASONS.MISSING_TITLE]).toBe(1);
    expect(r.byReason[REFILL_INVALID_REASONS.MISSING_PROVENANCE]).toBe(1);
    expect(r.byReason[REFILL_INVALID_REASONS.TEST_FIXTURE]).toBe(1);
  });

  it('is total/safe on odd input (null, non-array, malformed rows)', () => {
    expect(verifyStagedCandidates(null).total).toBe(0);
    expect(verifyStagedCandidates(undefined).total).toBe(0);
    expect(verifyStagedCandidates('nope').total).toBe(0);
    const r = verifyStagedCandidates([null, 42, {}, validRow()]);
    expect(r.total).toBe(4);
    expect(r.validCount).toBe(1); // only the well-formed row
    expect(r.invalidCount).toBe(3);
  });

  it('is read-only — does not mutate the input rows', () => {
    const row = validRow();
    const snapshot = JSON.stringify(row);
    verifyStagedCandidates([row]);
    expect(JSON.stringify(row)).toBe(snapshot);
  });
});

describe('formatVerifierReport', () => {
  it('renders a DRY-RUN summary with per-reason breakdown', () => {
    const report = verifyStagedCandidates([validRow(), validRow({ title: '' })]);
    const lines = formatVerifierReport(report);
    expect(lines[0]).toMatch(/DRY RUN/);
    expect(lines.join('\n')).toMatch(/would auto-promote: 1/);
    expect(lines.join('\n')).toMatch(/rejected: 1/);
    expect(lines.join('\n')).toMatch(/missing_title: 1/);
  });

  it('is safe on an empty/odd report', () => {
    expect(formatVerifierReport(undefined)[0]).toMatch(/0/);
  });
});
