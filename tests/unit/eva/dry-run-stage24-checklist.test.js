/**
 * SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 FR-7 AC#1.
 */
import { describe, it, expect, vi } from 'vitest';
import { withReadOnlyEventsGuard } from '../../../scripts/eva/dry-run-stage24-checklist.mjs';

describe('withReadOnlyEventsGuard', () => {
  it('no-ops eva_orchestration_events.insert() without touching the real client', async () => {
    const realInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const otherInsert = vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null });
    const realClient = {
      from: vi.fn((table) => (table === 'eva_orchestration_events' ? { insert: realInsert } : { insert: otherInsert })),
      rpc: vi.fn().mockResolvedValue({ data: 'ok', error: null }),
    };

    const guarded = withReadOnlyEventsGuard(realClient);

    const result = await guarded.from('eva_orchestration_events').insert({ event_type: 'custom' });
    expect(result).toEqual({ data: null, error: null });
    expect(realInsert).not.toHaveBeenCalled();
  });

  it('passes every other table through to the real client untouched', async () => {
    const otherInsert = vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null });
    const realClient = {
      from: vi.fn((table) => ({ insert: otherInsert, table })),
      rpc: vi.fn().mockResolvedValue({ data: 'ok', error: null }),
    };

    const guarded = withReadOnlyEventsGuard(realClient);
    await guarded.from('venture_artifacts').insert({ x: 1 });
    expect(realClient.from).toHaveBeenCalledWith('venture_artifacts');
    expect(otherInsert).toHaveBeenCalledWith({ x: 1 });
  });

  it('preserves prototype methods (e.g. .rpc) that an object-spread copy would lose', async () => {
    const realClient = {
      from: vi.fn(() => ({ insert: vi.fn() })),
      rpc: vi.fn().mockResolvedValue({ data: 42, error: null }),
    };

    const guarded = withReadOnlyEventsGuard(realClient);
    const result = await guarded.rpc('some_function', { arg: 1 });
    expect(result).toEqual({ data: 42, error: null });
    expect(realClient.rpc).toHaveBeenCalledWith('some_function', { arg: 1 });
  });
});
