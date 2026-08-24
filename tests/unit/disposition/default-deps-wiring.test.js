/**
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-4.
 * EXEC-phase prospective TESTING evidence (C4): createDefaultDispositionDeps's recordLearning
 * previously did a full-object metadata overwrite, silently clobbering any pre-existing
 * metadata on the RCR row. Fixed to read-then-merge.
 */
import { describe, it, expect, vi } from 'vitest';
import { createDefaultDispositionDeps } from '../../../lib/disposition/disposition-loop.js';

function makeSupabaseMock({ existingMetadata = {} } = {}) {
  const updateSpy = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) }));
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: { metadata: existingMetadata }, error: null }),
    update: updateSpy,
  };
  return { supabase: { from: () => chain }, updateSpy };
}

describe('createDefaultDispositionDeps.recordLearning — merges, does not overwrite', () => {
  it('preserves pre-existing metadata keys alongside the new disposition_loop_* fields', async () => {
    const { supabase, updateSpy } = makeSupabaseMock({
      existingMetadata: { auto_triggered: true, trigger_sdk_version: '1.0.0' }
    });
    const deps = createDefaultDispositionDeps(supabase, 'SD-TEST');

    await deps.recordLearning({ rcrId: 'rcr-1' }, { outcome: 'ESCALATED', attempts: 3 });

    const updatePayload = updateSpy.mock.calls[0][0];
    expect(updatePayload.metadata.auto_triggered).toBe(true);
    expect(updatePayload.metadata.trigger_sdk_version).toBe('1.0.0');
    expect(updatePayload.metadata.disposition_loop_outcome).toBe('ESCALATED');
    expect(updatePayload.metadata.disposition_loop_attempts).toBe(3);
  });

  it('handles a row with no pre-existing metadata (null) without crashing', async () => {
    const { supabase, updateSpy } = makeSupabaseMock({ existingMetadata: null });
    const deps = createDefaultDispositionDeps(supabase, 'SD-TEST');

    await deps.recordLearning({ rcrId: 'rcr-2' }, { outcome: 'RESOLVED', attempts: 1 });

    const updatePayload = updateSpy.mock.calls[0][0];
    expect(updatePayload.metadata.disposition_loop_outcome).toBe('RESOLVED');
  });
});
