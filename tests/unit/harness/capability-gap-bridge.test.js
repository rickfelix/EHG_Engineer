/**
 * Tests for the CANNOT_DRIVE -> capability-gap feedback bridge.
 * (SD-LEO-GEN-SATELLITE-CAPABILITY-EXTRACTION-001, FR-1, TS-1/TS-2)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bridgeCannotDriveFindings, CAPABILITY_GAP_CATEGORY } from '../../../lib/harness/capability-gap-bridge.mjs';

vi.mock('../../../lib/governance/emit-feedback.js', () => ({
  emitFeedback: vi.fn().mockResolvedValue({ id: 'feedback-id', deduped: false }),
}));

import { emitFeedback } from '../../../lib/governance/emit-feedback.js';

const supabase = {}; // opaque -- bridgeCannotDriveFindings only forwards it to emitFeedback

describe('bridgeCannotDriveFindings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits one feedback row per cannotDrive entry (TS-1)', async () => {
    const result = await bridgeCannotDriveFindings(
      supabase,
      { cannotDrive: ['O5', 'O6'] },
      { harnessSource: 's20-run', runId: 'run-1' },
    );

    expect(result.emitted).toBe(2);
    expect(emitFeedback).toHaveBeenCalledTimes(2);
    expect(emitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        supabase,
        category: CAPABILITY_GAP_CATEGORY,
        metadata: expect.objectContaining({ requirement_id: 'O5', harness_source: 's20-run', run_id: 'run-1' }),
      }),
    );
    expect(emitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ requirement_id: 'O6' }) }),
    );
  });

  it('emits zero rows and does not throw when cannotDrive is empty (TS-2)', async () => {
    const result = await bridgeCannotDriveFindings(supabase, { cannotDrive: [] }, {});
    expect(result.emitted).toBe(0);
    expect(emitFeedback).not.toHaveBeenCalled();
  });

  it('emits zero rows when cannotDrive is absent from the coverage result', async () => {
    const result = await bridgeCannotDriveFindings(supabase, {}, {});
    expect(result.emitted).toBe(0);
    expect(emitFeedback).not.toHaveBeenCalled();
  });

  it('never writes to venture_capabilities (regression guard)', async () => {
    await bridgeCannotDriveFindings(supabase, { cannotDrive: ['O8'] }, {});
    for (const call of emitFeedback.mock.calls) {
      expect(call[0].category).not.toBe('venture_capabilities');
    }
  });

  it('isolates a single failing entry: siblings still emit, the failure is reported, nothing throws', async () => {
    emitFeedback
      .mockResolvedValueOnce({ id: '1', deduped: false })
      .mockRejectedValueOnce(new Error('RLS denied'))
      .mockResolvedValueOnce({ id: '3', deduped: false });

    const result = await bridgeCannotDriveFindings(supabase, { cannotDrive: ['O5', 'O6', 'O8'] }, {});

    expect(result.emitted).toBe(2);
    expect(result.failed).toEqual([{ requirementId: 'O6', reason: 'RLS denied' }]);
    expect(emitFeedback).toHaveBeenCalledTimes(3);
  });
});
