/**
 * SD-LEO-INFRA-GAUGE-FINDING-KNOWN-STATE-ACK-001 (FR-2) — dedup_key propagation tests.
 * Pins: a feedback row's metadata.dedup_key survives buildCorpus() as candidate.dedupKey and lands in
 * the staged roadmap_wave_items row as metadata.dedup_key, giving the suppression axis (FR-3) something
 * to match against. A feedback row with no dedup_key stages exactly as before (no regression).
 */
import { describe, it, expect } from 'vitest';
import { buildCorpus, stageCorpus } from '../../../lib/sourcing-engine/proactive-populator.js';

const fakeDb = () => {
  const inserted = [];
  return { inserted, from: () => ({ insert: (row) => { inserted.push(row); return Promise.resolve({ error: null }); } }) };
};

describe('dedup_key propagation — buildCorpus (FR-2)', () => {
  it('carries feedback.metadata.dedup_key into candidate.dedupKey', () => {
    const corpus = buildCorpus({
      backlog: [{ id: 'b1', title: 'WAVE_LINKAGE_STARVATION: wave-linkage coverage 62% < 80%', metadata: { dedup_key: 'WAVE_LINKAGE_STARVATION' } }],
    });
    expect(corpus[0].dedupKey).toBe('WAVE_LINKAGE_STARVATION');
  });

  it('is null when the feedback row has no dedup_key (no regression for un-fingerprinted findings)', () => {
    const corpus = buildCorpus({ backlog: [{ id: 'b2', title: 'Ordinary backlog item' }] });
    expect(corpus[0].dedupKey).toBeNull();
  });
});

describe('dedup_key propagation — stageCorpus (FR-2)', () => {
  it('writes candidate.dedupKey into the staged row metadata.dedup_key', async () => {
    const db = fakeDb();
    const routed = [{ corpus: 'harness_backlog', source_type: 'brainstorm', source_id: 'b1',
      title: 'WAVE_LINKAGE_STARVATION: wave-linkage coverage 62% < 80%', lane: 'belt-ready', dedupKey: 'WAVE_LINKAGE_STARVATION' }];
    await stageCorpus(db, routed, { apply: true, chairmanApproved: true, waveId: 'wave-1', lanePresent: true });
    expect(db.inserted[0].metadata.dedup_key).toBe('WAVE_LINKAGE_STARVATION');
  });

  it('omits metadata.dedup_key when the candidate has none (no empty key forced)', async () => {
    const db = fakeDb();
    const routed = [{ corpus: 'harness_backlog', source_type: 'brainstorm', source_id: 'b1', title: 'X', lane: 'belt-ready' }];
    await stageCorpus(db, routed, { apply: true, chairmanApproved: true, waveId: 'wave-1', lanePresent: true });
    expect(db.inserted[0].metadata).not.toHaveProperty('dedup_key');
  });
});
