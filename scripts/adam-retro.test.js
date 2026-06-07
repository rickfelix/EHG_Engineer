// Tests for SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001-D
// scripts/adam-retro.cjs (capture helpers) + coordinator-self-review.mjs
// partitionParticipants (default-OFF byte-identical participant split).

import { describe, it, expect } from 'vitest';

const { buildRetroKey, isAdamRetro, buildAdamRetroRow, ADAM_RETRO_CATEGORY } = require('./adam-retro.cjs');
import { partitionParticipants } from './coordinator-self-review.mjs';

describe('FR-1: adam-retro capture helpers', () => {
  it('isAdamRetro matches ADAM-RETRO / ADAM RETRO bodies, ignores others', () => {
    expect(isAdamRetro({ body: 'ADAM-RETRO: comms latency was high' })).toBe(true);
    expect(isAdamRetro({ body: 'adam retro - good dependency handling' })).toBe(true);
    expect(isAdamRetro({ message: 'FLEET-RETRO: not mine' })).toBe(false);
    expect(isAdamRetro({ body: 'unrelated advisory' })).toBe(false);
    expect(isAdamRetro(null)).toBe(false);
  });

  it('buildRetroKey is the fleet-retro-style dedup key (8-char session : 16-char ts)', () => {
    expect(buildRetroKey('abcdef1234567890', '2026-06-07T12:34:56Z')).toBe('abcdef12:2026-06-07T12:34');
  });

  it('buildAdamRetroRow mirrors the fleet-retro feedback shape with category=adam_retro', () => {
    const row = buildAdamRetroRow({ sender_session: 'sess-1234abcd', created_at: '2026-06-07T01:02:03Z', payload: { body: 'ADAM-RETRO: x' } });
    expect(row.category).toBe(ADAM_RETRO_CATEGORY);
    expect(row.category).toBe('adam_retro');
    expect(row.type).toBe('enhancement');             // NOT NULL contract
    expect(row.source_type).toBe('auto_capture');
    expect(row.source_application).toBe('EHG_Engineer');
    expect(row.metadata.retro_key).toBe('sess-123:2026-06-07T01:02'); // dedup lives in metadata, not source_id
    expect(row.description).toBe('ADAM-RETRO: x');
  });
});

describe('FR-4: partitionParticipants (default-OFF byte-identical)', () => {
  const sessions = [
    { session_id: 'coord-1', metadata: { is_coordinator: true } },
    { session_id: 'me-1', metadata: {} },
    { session_id: 'worker-1', metadata: {} },
    { session_id: 'worker-2', metadata: { role: 'worker' } },
    { session_id: 'adam-1', metadata: { role: 'adam', non_fleet: true } },
  ];

  it('flag OFF: Adam stays in workers (byte-identical to prior behavior), adamParticipants empty', () => {
    const { workers, adamParticipants } = partitionParticipants(sessions, 'me-1', false);
    expect(workers.sort()).toEqual(['adam-1', 'worker-1', 'worker-2']); // adam INCLUDED, coordinator + me excluded
    expect(adamParticipants).toEqual([]);
  });

  it('flag ON: Adam pulled out of workers into adamParticipants', () => {
    const { workers, adamParticipants } = partitionParticipants(sessions, 'me-1', true);
    expect(workers.sort()).toEqual(['worker-1', 'worker-2']); // adam EXCLUDED from worker-framed review
    expect(adamParticipants).toEqual(['adam-1']);
  });

  it('always excludes the coordinator and self', () => {
    const off = partitionParticipants(sessions, 'me-1', false);
    const on = partitionParticipants(sessions, 'me-1', true);
    for (const set of [off.workers, on.workers, on.adamParticipants]) {
      expect(set).not.toContain('coord-1');
      expect(set).not.toContain('me-1');
    }
  });
});
