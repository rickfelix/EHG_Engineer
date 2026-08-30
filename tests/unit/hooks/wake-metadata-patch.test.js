/**
 * SD-LEO-INFRA-BURN-TELEMETRY-PER-001-B — buildWakeMetadataPatch()
 * (lib/hooks/wake-metadata-patch.cjs, called from scripts/hooks/post-tool-loop-state.cjs).
 *
 * PLAN-phase TESTING sub-agent adversarial review (evidence row b8f04157-d027-4e2b-b6e0-6c99fcea6986)
 * found the originally-planned assertions could not distinguish placing wake_trigger_reason BEFORE
 * vs AFTER the ...priorMeta spread — a stale priorMeta.wake_trigger_reason value would silently win
 * if placed before the spread. The discriminating fixture (MUT-1) is the `priorMeta` with a
 * pre-existing wake_trigger_reason below.
 */

import { describe, it, expect } from 'vitest';
import { buildWakeMetadataPatch } from '../../../lib/hooks/wake-metadata-patch.cjs';

describe('buildWakeMetadataPatch', () => {
  const nowMs = 1700000000000;

  it('TS-1: includes wake_trigger_reason alongside the existing wake-arm fields', () => {
    const priorMeta = { tier_rank: 2 };
    const patch = buildWakeMetadataPatch(priorMeta, 300, nowMs);

    expect(patch.wake_trigger_reason).toBe('wakeup-timer');
    expect(patch.wake_armed_at).toBe(new Date(nowMs).toISOString());
    expect(patch.wake_delay_seconds).toBe(300);
    expect(patch.expected_wake_at).toBe(new Date(nowMs + 300 * 1000).toISOString());
  });

  it('MUT-1: the literal wins over a stale priorMeta.wake_trigger_reason, and sibling keys survive', () => {
    const priorMeta = { wake_trigger_reason: 'manual-park', tier_rank: 3 };
    const patch = buildWakeMetadataPatch(priorMeta, 60, nowMs);

    expect(patch.wake_trigger_reason).toBe('wakeup-timer');
    expect(patch.tier_rank).toBe(3);
  });

  it('TS-2: pre-existing fields are computed exactly as before this change', () => {
    const priorMeta = { model: 'sonnet-5', last_git_metric_at_ms: 123 };
    const patch = buildWakeMetadataPatch(priorMeta, 120, nowMs);

    expect(patch.model).toBe('sonnet-5');
    expect(patch.last_git_metric_at_ms).toBe(123);
    expect(patch.wake_armed_at).toBe(new Date(nowMs).toISOString());
    expect(patch.wake_delay_seconds).toBe(120);
    expect(patch.expected_wake_at).toBe(new Date(nowMs + 120 * 1000).toISOString());
  });

  it('TS-3: returns null when delaySeconds is non-positive', () => {
    expect(buildWakeMetadataPatch({ tier_rank: 1 }, 0, nowMs)).toBeNull();
    expect(buildWakeMetadataPatch({ tier_rank: 1 }, -5, nowMs)).toBeNull();
  });

  it('TS-3: returns null when delaySeconds is not finite', () => {
    expect(buildWakeMetadataPatch({ tier_rank: 1 }, NaN, nowMs)).toBeNull();
    expect(buildWakeMetadataPatch({ tier_rank: 1 }, undefined, nowMs)).toBeNull();
  });

  it('TS-3: returns null when priorMeta read failed (null)', () => {
    expect(buildWakeMetadataPatch(null, 300, nowMs)).toBeNull();
  });
});
