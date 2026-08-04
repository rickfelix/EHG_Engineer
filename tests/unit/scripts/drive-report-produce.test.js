/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B (TR-1) — the Drive Report producer.
 *
 * The question this file exists to answer is "did it write, and did it write TWICE?" — which is
 * only answerable because persist is injected. Every test therefore counts writes rather than
 * trusting a return value.
 */

import { describe, it, expect } from 'vitest';
import { produceDriveReport } from '../../../scripts/drive-report-produce.mjs';

const AT = '2026-08-03T12:00:00Z';
const SECTIONS = { plan_position: { section: 'plan_position' } };
const SCORE = { score: { value: 2 }, possible: 2 };

/** Records every write, so double-insertion is observed rather than assumed. */
function writer() {
  const rows = [];
  return { rows, persist: async (r) => { rows.push(r); return { id: `row-${rows.length}` }; } };
}
const gatherOk = async () => ({ sections: SECTIONS, driveScore: SCORE });

describe('producer — one row per run', () => {
  it('writes exactly one row and returns its id', async () => {
    const { rows, persist } = writer();
    const r = await produceDriveReport({ gather: gatherOk, persist, runId: 'run-1', generatedAt: AT });
    expect(rows).toHaveLength(1);
    expect(r).toMatchObject({ written: true, id: 'row-1', run_id: 'run-1' });
    expect(rows[0]).toMatchObject({ run_id: 'run-1', generated_at: AT, cadence: 'scheduled' });
  });

  it('[IDEMPOTENCE] a retry of the SAME run writes NOTHING', async () => {
    // A cron retries and GitHub re-runs failed jobs. A second row for one run makes section 5
    // compute a delta between a report and itself — guaranteed zero movement, reported as a stall
    // that is not there. The duplicate corrupts the one section that reads history.
    const { rows, persist } = writer();
    const findExisting = async (id) => (rows.find((x) => x.run_id === id) ? { id: 'row-1' } : null);

    await produceDriveReport({ gather: gatherOk, persist, findExisting, runId: 'run-1', generatedAt: AT });
    const second = await produceDriveReport({ gather: gatherOk, persist, findExisting, runId: 'run-1', generatedAt: AT });

    expect(rows).toHaveLength(1);                    // still one
    expect(second.written).toBe(false);
    expect(second.skipped).toBe('already_produced'); // skipping is REPORTED, not disguised as success
    expect(second.existing_id).toBe('row-1');
  });

  it('a DIFFERENT run still writes', async () => {
    // The idempotence key must not be so blunt that it suppresses legitimate later runs.
    const { rows, persist } = writer();
    const findExisting = async (id) => (rows.find((x) => x.run_id === id) ? { id: 'x' } : null);
    await produceDriveReport({ gather: gatherOk, persist, findExisting, runId: 'run-1', generatedAt: AT });
    await produceDriveReport({ gather: gatherOk, persist, findExisting, runId: 'run-2', generatedAt: AT });
    expect(rows.map((r) => r.run_id)).toEqual(['run-1', 'run-2']);
  });

  it('REFUSES to run without a runId — there would be no idempotence key', async () => {
    const { rows, persist } = writer();
    await expect(produceDriveReport({ gather: gatherOk, persist, generatedAt: AT })).rejects.toThrow(/runId is required/);
    await expect(produceDriveReport({ gather: gatherOk, persist, runId: '  ', generatedAt: AT })).rejects.toThrow(/runId is required/);
    expect(rows, 'a refusal must not have written anything first').toHaveLength(0);
  });

  it('a TOTAL gather failure writes nothing — a failed run is not an empty report', async () => {
    // composeReport refuses a sectionless report, so this throws instead of persisting a row that
    // reads as "we looked and there was nothing".
    const { rows, persist } = writer();
    const gatherEmpty = async () => ({ sections: {}, driveScore: SCORE });
    await expect(produceDriveReport({ gather: gatherEmpty, persist, runId: 'r', generatedAt: AT }))
      .rejects.toThrow(/failed run, not an empty one/);
    expect(rows).toHaveLength(0);
  });

  it('a PARTIAL failure still writes, with the unavailable section named on the row', async () => {
    // The opposite error from the one above: losing a whole report because one section failed.
    const { rows, persist } = writer();
    const gatherPartial = async () => ({
      sections: { ...SECTIONS, stall_deltas: { section: 'stall_deltas', unavailable: { available: false, reason: 'no prior report' } } },
      driveScore: SCORE,
    });
    await produceDriveReport({ gather: gatherPartial, persist, runId: 'r', generatedAt: AT });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.unavailable_sections).toEqual([{ section: 'stall_deltas', reason: 'no prior report' }]);
  });

  it('refuses hidden dependencies rather than writing through a client nobody can observe', async () => {
    await expect(produceDriveReport({ runId: 'r', generatedAt: AT })).rejects.toThrow(/must be injected/);
    await expect(produceDriveReport({ gather: gatherOk, runId: 'r', generatedAt: AT })).rejects.toThrow(/must be injected/);
  });
});
