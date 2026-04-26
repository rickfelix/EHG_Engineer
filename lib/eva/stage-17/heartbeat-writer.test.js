/**
 * Vitest spec for the Stage 17 heartbeat writer.
 * SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001 ARM E
 *
 * The writer is tested through its public surface — startHeartbeatWriter()
 * — by mocking the artifact-persistence-service module. Fake timers drive
 * the interval cadence.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const writeArtifactMock = vi.fn(async () => 'artifact-id-stub');

vi.mock('../artifact-persistence-service.js', () => ({
  writeArtifact: writeArtifactMock,
}));

const { startHeartbeatWriter, DEFAULT_HEARTBEAT_INTERVAL_MS, DEFAULT_HEARTBEAT_TTL_DAYS } =
  await import('./heartbeat-writer.js');

describe('startHeartbeatWriter', () => {
  beforeEach(() => {
    writeArtifactMock.mockClear();
    vi.useFakeTimers();
  });
  afterEach(async () => {
    vi.useRealTimers();
  });

  it('writes a heartbeat immediately on start', async () => {
    const hb = startHeartbeatWriter({}, 'venture-uuid', {
      intervalMs: 30000,
      initialState: { phase: 'generating' },
    });
    // Allow microtasks to flush
    await vi.advanceTimersByTimeAsync(0);
    expect(writeArtifactMock).toHaveBeenCalledTimes(1);

    const call = writeArtifactMock.mock.calls[0][1];
    expect(call.artifactType).toBe('s17_heartbeat');
    expect(call.ventureId).toBe('venture-uuid');
    expect(call.artifactData.phase).toBe('generating');
    expect(call.metadata.ttlExpiresAt).toBeTypeOf('string');
    expect(call.metadata.intervalMs).toBe(30000);

    await hb.stop();
  });

  it('writes additional heartbeats at intervalMs cadence', async () => {
    const hb = startHeartbeatWriter({}, 'venture-uuid', { intervalMs: 30000 });

    await vi.advanceTimersByTimeAsync(0);   // initial write
    expect(writeArtifactMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30000);
    expect(writeArtifactMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60000);
    expect(writeArtifactMock).toHaveBeenCalledTimes(4);

    await hb.stop();
  });

  it('embeds ttlExpiresAt at the configured TTL', async () => {
    const realDate = Date.now();
    vi.setSystemTime(realDate);

    const hb = startHeartbeatWriter({}, 'venture-uuid', {
      intervalMs: 30000,
      ttlDays: 3,
    });
    await vi.advanceTimersByTimeAsync(0);

    const meta = writeArtifactMock.mock.calls[0][1].metadata;
    const ttlMs = new Date(meta.ttlExpiresAt).getTime() - realDate;
    expect(ttlMs).toBe(3 * 86400 * 1000);
    expect(meta.ttlDays).toBe(3);

    await hb.stop();
  });

  it('update(partial) merges into the next heartbeat payload', async () => {
    const hb = startHeartbeatWriter({}, 'venture-uuid', { intervalMs: 30000 });
    await vi.advanceTimersByTimeAsync(0);

    hb.update({ phase: 'generating', screenIdx: 2, variantIdx: 1 });
    await vi.advanceTimersByTimeAsync(30000);

    const second = writeArtifactMock.mock.calls[1][1].artifactData;
    expect(second.phase).toBe('generating');
    expect(second.screenIdx).toBe(2);
    expect(second.variantIdx).toBe(1);
    expect(second.lastUpdate).toBeTypeOf('string');

    await hb.stop();
  });

  it('stop() prevents further writes and is idempotent', async () => {
    const hb = startHeartbeatWriter({}, 'venture-uuid', { intervalMs: 30000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(writeArtifactMock).toHaveBeenCalledTimes(1);

    await hb.stop();
    await vi.advanceTimersByTimeAsync(120000);
    expect(writeArtifactMock).toHaveBeenCalledTimes(1);

    // Second stop() must not throw or schedule writes
    await hb.stop();
    expect(writeArtifactMock).toHaveBeenCalledTimes(1);
  });

  it('uses DEFAULT_HEARTBEAT_INTERVAL_MS / DEFAULT_HEARTBEAT_TTL_DAYS when omitted', async () => {
    expect(DEFAULT_HEARTBEAT_INTERVAL_MS).toBe(30000);
    expect(DEFAULT_HEARTBEAT_TTL_DAYS).toBe(7);

    const hb = startHeartbeatWriter({}, 'venture-uuid');
    await vi.advanceTimersByTimeAsync(0);

    const meta = writeArtifactMock.mock.calls[0][1].metadata;
    expect(meta.intervalMs).toBe(DEFAULT_HEARTBEAT_INTERVAL_MS);
    expect(meta.ttlDays).toBe(DEFAULT_HEARTBEAT_TTL_DAYS);

    await hb.stop();
  });

  it('write failures are funneled through onError, not thrown', async () => {
    writeArtifactMock.mockRejectedValueOnce(new Error('supabase boom'));
    const onError = vi.fn();

    const hb = startHeartbeatWriter({}, 'venture-uuid', {
      intervalMs: 30000,
      onError,
    });
    await vi.advanceTimersByTimeAsync(0);
    // Drain the rejection settle
    await vi.advanceTimersByTimeAsync(0);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('supabase boom');

    await hb.stop();
  });
});
