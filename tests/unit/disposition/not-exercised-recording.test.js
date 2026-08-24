/**
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-4.
 * TS-7: if no natural (non-manufactured) defect occurs, the outcome must be explicitly
 * recorded as O3=NOT_EXERCISED — never silently absent, and never faked by manufacturing
 * a defect to force the loop to run.
 *
 * The loop module itself has no concept of "did a natural defect occur" — that judgment is
 * made by whatever decides WHETHER to call runDispositionLoop at all. This file tests the
 * recording contract: a caller that finds zero eligible defects during the SD's build/verify
 * window records O3=NOT_EXERCISED as a first-class, explicit result — not the absence of a
 * record, and not a call into runDispositionLoop with synthetic data.
 */
import { describe, it, expect } from 'vitest';
import { recordDispositionLoopExerciseStatus } from '../../../lib/disposition/disposition-loop.js';

describe('recordDispositionLoopExerciseStatus', () => {
  it('records O3=NOT_EXERCISED when zero natural defects occurred', () => {
    const record = recordDispositionLoopExerciseStatus({ naturalDefectCount: 0 });
    expect(record.status).toBe('NOT_EXERCISED');
    expect(record.label).toBe('O3=NOT_EXERCISED');
    expect(record.naturalDefectCount).toBe(0);
  });

  it('records EXERCISED with a count when at least one natural defect occurred', () => {
    const record = recordDispositionLoopExerciseStatus({ naturalDefectCount: 3 });
    expect(record.status).toBe('EXERCISED');
    expect(record.naturalDefectCount).toBe(3);
  });

  it('never accepts a manufactured defect as satisfying exercise — manufactured=true forces NOT_EXERCISED regardless of count', () => {
    const record = recordDispositionLoopExerciseStatus({ naturalDefectCount: 5, manufactured: true });
    expect(record.status).toBe('NOT_EXERCISED');
    expect(record.label).toBe('O3=NOT_EXERCISED');
    expect(record.note).toMatch(/manufactured/i);
  });

  it('defaults naturalDefectCount to 0 (NOT_EXERCISED) when omitted, rather than assuming exercise', () => {
    const record = recordDispositionLoopExerciseStatus({});
    expect(record.status).toBe('NOT_EXERCISED');
  });

  it('includes a timestamp for the record', () => {
    const record = recordDispositionLoopExerciseStatus({ naturalDefectCount: 0 });
    expect(record.recorded_at).toBeDefined();
    expect(Number.isFinite(Date.parse(record.recorded_at))).toBe(true);
  });
});
