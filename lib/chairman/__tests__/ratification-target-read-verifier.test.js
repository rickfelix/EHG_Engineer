/**
 * SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-B FR-4 (Q4 target-read verification, TS-5, TS-6).
 */
import { describe, it, expect } from 'vitest';
import { verifyRatificationTargetRead } from '../ratification-target-read-verifier.mjs';

describe('verifyRatificationTargetRead', () => {
  it('TS-6: a genuine ref whose target contains marker_text passes', async () => {
    const fetchers = { section_id: async () => 'preamble ... the ratified clause ... trailer' };
    const row = { encoded_ref: { type: 'section_id', section_id: '1' }, marker_text: 'the ratified clause' };
    const result = await verifyRatificationTargetRead({}, row, { fetchers });
    expect(result.verified).toBe(true);
  });

  it('TS-5: a fabricated ref (target exists but does not contain marker_text) fails', async () => {
    const fetchers = { section_id: async () => 'unrelated content entirely' };
    const row = { encoded_ref: { type: 'section_id', section_id: '1' }, marker_text: 'the ratified clause' };
    const result = await verifyRatificationTargetRead({}, row, { fetchers });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/does not contain marker_text/);
  });

  it('TS-5: a stale ref (target unreachable, e.g. deleted row) fails', async () => {
    const fetchers = { section_id: async () => null };
    const row = { encoded_ref: { type: 'section_id', section_id: '1' }, marker_text: 'x' };
    const result = await verifyRatificationTargetRead({}, row, { fetchers });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/unreachable/);
  });

  it('fails closed on a missing encoded_ref', async () => {
    const result = await verifyRatificationTargetRead({}, { encoded_ref: null, marker_text: 'x' });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/encoded_ref is missing/);
  });

  it('fails closed on empty marker_text', async () => {
    const result = await verifyRatificationTargetRead({}, { encoded_ref: { type: 'section_id', section_id: '1' }, marker_text: '' });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/marker_text is missing/);
  });

  it('fails closed on an unknown encoded_ref.type', async () => {
    const result = await verifyRatificationTargetRead({}, { encoded_ref: { type: 'bogus' }, marker_text: 'x' });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/no target-read fetcher/);
  });

  it('fails closed when the fetcher throws', async () => {
    const fetchers = { section_id: async () => { throw new Error('db down'); } };
    const row = { encoded_ref: { type: 'section_id', section_id: '1' }, marker_text: 'x' };
    const result = await verifyRatificationTargetRead({}, row, { fetchers });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/db down/);
  });

  it('exercises the sd_row, venture_metadata, and memory_marker fetchers with injected values', async () => {
    const fetchers = {
      sd_row: async () => 'the sd description text includes: the ratified clause',
      venture_metadata: async () => 'the ratified clause',
      memory_marker: async () => 'preamble the ratified clause trailer',
    };
    for (const type of ['sd_row', 'venture_metadata', 'memory_marker']) {
      const row = { encoded_ref: { type }, marker_text: 'the ratified clause' };
      const result = await verifyRatificationTargetRead({}, row, { fetchers });
      expect(result.verified).toBe(true);
    }
  });
});
