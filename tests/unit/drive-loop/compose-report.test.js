/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — composing the drive_reports row.
 *
 * Pure by design: the producer writes, this only shapes. The interesting cases are the refusals.
 */

import { describe, it, expect } from 'vitest';
import { composeReport, SCHEMA_VERSION, CADENCES } from '../../../lib/drive-loop/compose-report.js';
import { unavailable } from '../../../lib/drive-loop/report-posture.js';

const AT = '2026-08-03T12:00:00Z';
const SECTIONS = { plan_position: { section: 'plan_position' }, belt_diagnosis: { section: 'belt_diagnosis' } };
const SCORE = { score: { value: 4 }, possible: 6 };

describe('composeReport — shapes the row, never writes it', () => {
  it('produces every column the migration declares', () => {
    const row = composeReport({ sections: SECTIONS, driveScore: SCORE, generatedAt: AT, runId: 'r1' });
    expect(row).toMatchObject({
      generated_at: AT, run_id: 'r1', cadence: 'scheduled',
      sections: SECTIONS, drive_score: SCORE, schema_version: SCHEMA_VERSION,
    });
    expect(row.metadata.section_ids).toEqual(['plan_position', 'belt_diagnosis']);
  });

  it('[C1] the row carries NO receipts field at all — the producer offers no such surface', () => {
    // A producer-stamped receipt proves only that the producer believed delivery happened, which
    // is the one thing a receipt must not do. This used to ship `consumption_receipts: {}`; under
    // the per-lane ruling (coordinator, 2026-08-04) receipts are rows in drive_report_receipts,
    // so there is nothing to ship — and an ABSENT field is strictly stronger than an empty one,
    // because an empty map is still a surface a consumer can write to.
    const row = composeReport({ sections: SECTIONS, driveScore: SCORE, generatedAt: AT });
    expect(Object.hasOwn(row, 'consumption_receipts'), 'the superseded field must be gone, not empty').toBe(false);
    expect(row.metadata.receipts_note).toMatch(/rows in drive_report_receipts/i);
    expect(row.metadata.receipts_note).toMatch(/stamped BY EACH CONSUMER/);
  });

  it('records UNAVAILABLE sections on the row rather than letting a key go quietly missing', () => {
    // An absent key is the kind of silence nobody audits. Naming the gap puts it in front of the
    // reader without them having to notice something is not there.
    const row = composeReport({
      sections: { ...SECTIONS, stall_deltas: { section: 'stall_deltas', unavailable: unavailable('no prior report') } },
      driveScore: SCORE, generatedAt: AT,
    });
    expect(row.metadata.unavailable_sections).toEqual([{ section: 'stall_deltas', reason: 'no prior report' }]);
    expect(row.metadata.section_ids).toContain('stall_deltas'); // present, and flagged
  });

  it('[VACUITY] REFUSES a report with no sections — that is a failed run, not an empty one', () => {
    // Emitting it would put a row in the trend reading "we looked and there was nothing", which is
    // the false zero this SD guards against, one level up from the individual readings.
    expect(() => composeReport({ sections: {}, driveScore: SCORE, generatedAt: AT })).toThrow(/failed run, not an empty one/);
    expect(() => composeReport({ driveScore: SCORE, generatedAt: AT })).toThrow(/failed run/);
  });

  it('refuses an implicit or malformed clock', () => {
    expect(() => composeReport({ sections: SECTIONS, generatedAt: undefined })).toThrow(/generatedAt must be an ISO timestamp/);
    expect(() => composeReport({ sections: SECTIONS, generatedAt: 'nope' })).toThrow(/generatedAt must be an ISO timestamp/);
  });

  it('refuses a cadence the column would reject, naming it here instead of at the insert', () => {
    // SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-5: 'hourly' is now VALID (CADENCES widened) — this
    // replaces the old assertion that it threw. The negative control below (a genuinely bogus
    // value) keeps CADENCES' rejection path tested, so widening the allowlist does not also
    // remove the only proof that composeReport() actually rejects an invalid cadence.
    expect(() => composeReport({ sections: SECTIONS, generatedAt: AT, cadence: 'bogus' })).toThrow(/cadence must be one of/);
    for (const c of CADENCES) {
      expect(composeReport({ sections: SECTIONS, generatedAt: AT, cadence: c }).cadence).toBe(c);
    }
    expect(CADENCES).toContain('hourly');
  });

  it('a missing drive_score becomes {} rather than undefined — the column is NOT NULL', () => {
    expect(composeReport({ sections: SECTIONS, generatedAt: AT }).drive_score).toEqual({});
  });
});
