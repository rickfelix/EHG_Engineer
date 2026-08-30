// QF-20260830-939: the registry-stamped backstop for THE TRIANGULATION AUDIT. The seed script
// (registers the row, additive-only) and the stamp script (updates last_fired_at on every cycle)
// must reference the SAME process_key, or the stamp becomes a permanent no-op against a row that
// was never actually registered — the exact silent-failure class this QF exists to close.
import { describe, it, expect, vi } from 'vitest';
import { PROCESS_KEY as SEED_KEY, seedTriangulationAuditRegistry } from '../../scripts/one-off/seed-triangulation-audit-registry.mjs';
import { PROCESS_KEY as STAMP_KEY } from '../../scripts/adam-triangulation-audit-stamp.mjs';

describe('QF-20260830-939: seed and stamp scripts agree on process_key', () => {
  it('both scripts reference the identical registry process_key', () => {
    expect(SEED_KEY).toBe('adam:triangulation-audit');
    expect(STAMP_KEY).toBe('adam:triangulation-audit');
    expect(SEED_KEY).toBe(STAMP_KEY);
  });
});

describe('QF-20260830-939: seedTriangulationAuditRegistry — the registry-row shape a 7-day cadence needs', () => {
  it('upserts on process_key with a 7-day expected_interval_seconds and self_stamped liveness_source', async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    const supabase = { from: () => ({ upsert }) };

    const result = await seedTriangulationAuditRegistry(supabase);

    expect(result.seeded).toBe(true);
    expect(result.process_key).toBe('adam:triangulation-audit');
    expect(upsert).toHaveBeenCalledTimes(1);
    const [payload, opts] = upsert.mock.calls[0];
    expect(payload.process_key).toBe('adam:triangulation-audit');
    expect(payload.expected_interval_seconds).toBe(7 * 24 * 60 * 60);
    expect(payload.liveness_source).toBe('self_stamped');
    expect(payload.owner).toBe('adam');
    expect(payload.currently_expected_active).toBe(true);
    expect(opts).toEqual({ onConflict: 'process_key' });
  });

  it('throws (never silently drops) a write failure', async () => {
    const supabase = { from: () => ({ upsert: () => Promise.resolve({ error: { message: 'boom' } }) }) };
    await expect(seedTriangulationAuditRegistry(supabase)).rejects.toThrow(/boom/);
  });
});
