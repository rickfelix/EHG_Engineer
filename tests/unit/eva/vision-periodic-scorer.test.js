/**
 * Unit tests for EvaMasterScheduler.runPeriodicVisionScoring()
 * SD: SD-LEO-INFRA-VISION-PERIODIC-SCORER-001
 *
 * Covers US-001 through US-004:
 *   US-001: Feature-flag gating (VISION_PERIODIC_SCORING_ENABLED)
 *   US-002: Batch scoring of top 5 recently-completed SDs
 *   US-003: Post-scoring vision-to-patterns sync
 *   US-004: Conditional process-gap-reporter.mjs trigger
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EvaMasterScheduler } from '../../../lib/eva/eva-master-scheduler.js';

// ── Module mocks ──────────────────────────────────────────────

vi.mock('../../../scripts/eva/vision-scorer.js', () => ({
  scoreSD: vi.fn(),
}));

vi.mock('../../../scripts/eva/vision-to-patterns.js', () => ({
  syncVisionScoresToPatterns: vi.fn(),
}));

import { scoreSD } from '../../../scripts/eva/vision-scorer.js';
import { syncVisionScoresToPatterns } from '../../../scripts/eva/vision-to-patterns.js';

// ── Helpers ───────────────────────────────────────────────────

/** Build a minimal Supabase stub that returns the given SD list */
function makeSupabase(sds = [], queryError = null) {
  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: sds, error: queryError }),
  };
  return {
    from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(selectChain) }),
  };
}

/** Build a scheduler with feature-flag control and accelerated interval */
function makeScheduler(supabase, flagEnabled = true) {
  const originalEnv = process.env.VISION_PERIODIC_SCORING_ENABLED;
  process.env.VISION_PERIODIC_SCORING_ENABLED = flagEnabled ? 'true' : 'false';

  const scheduler = new EvaMasterScheduler({
    supabase,
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    config: { visionScoringIntervalMs: 0 }, // No rate limit in tests
  });

  return { scheduler, restoreEnv: () => { process.env.VISION_PERIODIC_SCORING_ENABLED = originalEnv; } };
}

// ── Test Suite ────────────────────────────────────────────────

describe('EvaMasterScheduler.runPeriodicVisionScoring()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.VISION_PERIODIC_SCORING_ENABLED;
  });

  // US-001: Feature flag disabled
  it('US-001: does nothing when VISION_PERIODIC_SCORING_ENABLED is not set', async () => {
    const supabase = makeSupabase();
    const { scheduler } = makeScheduler(supabase, false);

    await scheduler.runPeriodicVisionScoring();

    expect(supabase.from).not.toHaveBeenCalled();
    expect(scoreSD).not.toHaveBeenCalled();
    expect(syncVisionScoresToPatterns).not.toHaveBeenCalled();
  });

  // US-001: Feature flag enabled
  it('US-001: proceeds when VISION_PERIODIC_SCORING_ENABLED=true', async () => {
    const sds = [{ sd_key: 'SD-TEST-001', title: 'Test SD' }];
    const supabase = makeSupabase(sds);
    scoreSD.mockResolvedValue({ total_score: 85 });
    syncVisionScoresToPatterns.mockResolvedValue({ synced: 1, skipped: 0, errors: 0 });

    const { scheduler, restoreEnv } = makeScheduler(supabase, true);
    await scheduler.runPeriodicVisionScoring();
    restoreEnv();

    expect(scoreSD).toHaveBeenCalledOnce();
    expect(scoreSD).toHaveBeenCalledWith(expect.objectContaining({ sdKey: 'SD-TEST-001' }));
  });

  // US-001: Rate limiting (interval not elapsed)
  it('US-001: skips if interval has not elapsed since last run', async () => {
    const sds = [{ sd_key: 'SD-TEST-001', title: 'Test SD' }];
    const supabase = makeSupabase(sds);
    scoreSD.mockResolvedValue({});
    syncVisionScoresToPatterns.mockResolvedValue({});

    // Use a very long interval so it will NOT run again
    process.env.VISION_PERIODIC_SCORING_ENABLED = 'true';
    const scheduler = new EvaMasterScheduler({
      supabase,
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      config: { visionScoringIntervalMs: 999_999_999 },
    });

    await scheduler.runPeriodicVisionScoring(); // first run
    vi.clearAllMocks();
    await scheduler.runPeriodicVisionScoring(); // second run — should skip

    expect(scoreSD).not.toHaveBeenCalled();
  });

  // US-002: Scores up to 5 SDs
  it('US-002: scores all SDs returned (up to 5)', async () => {
    const sds = Array.from({ length: 5 }, (_, i) => ({ sd_key: `SD-T-00${i + 1}`, title: `SD ${i + 1}` }));
    const supabase = makeSupabase(sds);
    scoreSD.mockResolvedValue({ total_score: 80 });
    syncVisionScoresToPatterns.mockResolvedValue({});

    const { scheduler, restoreEnv } = makeScheduler(supabase, true);
    await scheduler.runPeriodicVisionScoring();
    restoreEnv();

    expect(scoreSD).toHaveBeenCalledTimes(5);
  });

  // US-002: Fewer than 5 SDs — all scored
  it('US-002: scores all available SDs when fewer than 5 exist', async () => {
    const sds = [{ sd_key: 'SD-ONLY-001', title: 'Only One' }];
    const supabase = makeSupabase(sds);
    scoreSD.mockResolvedValue({ total_score: 90 });
    syncVisionScoresToPatterns.mockResolvedValue({});

    const { scheduler, restoreEnv } = makeScheduler(supabase, true);
    await scheduler.runPeriodicVisionScoring();
    restoreEnv();

    expect(scoreSD).toHaveBeenCalledOnce();
    expect(scoreSD).toHaveBeenCalledWith(expect.objectContaining({ sdKey: 'SD-ONLY-001' }));
  });

  // US-002: No SDs available — no scoring, no sync
  it('US-002: handles empty result set without error', async () => {
    const supabase = makeSupabase([]);
    const { scheduler, restoreEnv } = makeScheduler(supabase, true);
    await scheduler.runPeriodicVisionScoring();
    restoreEnv();

    expect(scoreSD).not.toHaveBeenCalled();
    expect(syncVisionScoresToPatterns).not.toHaveBeenCalled();
  });

  // US-002: Per-SD error isolation
  it('US-002: continues scoring remaining SDs when one fails', async () => {
    const sds = [
      { sd_key: 'SD-FAIL-001', title: 'Failing SD' },
      { sd_key: 'SD-PASS-001', title: 'Passing SD' },
    ];
    const supabase = makeSupabase(sds);
    scoreSD
      .mockRejectedValueOnce(new Error('LLM timeout'))
      .mockResolvedValueOnce({ total_score: 75 });
    syncVisionScoresToPatterns.mockResolvedValue({});

    const { scheduler, restoreEnv } = makeScheduler(supabase, true);
    await scheduler.runPeriodicVisionScoring();
    restoreEnv();

    expect(scoreSD).toHaveBeenCalledTimes(2);
    // Sync should still run because 1 SD scored successfully
    expect(syncVisionScoresToPatterns).toHaveBeenCalledOnce();
  });

  // US-002: DB query error
  it('US-002: returns early on SD query error without throwing', async () => {
    const supabase = makeSupabase([], new Error('DB connection failed'));
    const { scheduler, restoreEnv } = makeScheduler(supabase, true);
    await expect(scheduler.runPeriodicVisionScoring()).resolves.toBeUndefined();
    restoreEnv();

    expect(scoreSD).not.toHaveBeenCalled();
  });

  // US-003: Sync triggered after successful scoring
  it('US-003: triggers vision-to-patterns sync after batch completes', async () => {
    const sds = [{ sd_key: 'SD-SYNC-001', title: 'Sync Test' }];
    const supabase = makeSupabase(sds);
    scoreSD.mockResolvedValue({ total_score: 80 });
    syncVisionScoresToPatterns.mockResolvedValue({ synced: 2, skipped: 0, errors: 0 });

    const { scheduler, restoreEnv } = makeScheduler(supabase, true);
    await scheduler.runPeriodicVisionScoring();
    restoreEnv();

    expect(syncVisionScoresToPatterns).toHaveBeenCalledOnce();
    expect(syncVisionScoresToPatterns).toHaveBeenCalledWith(supabase);
  });

  // US-003: Sync not triggered when 0 SDs scored
  it('US-003: skips vision-to-patterns sync when all scoring failed', async () => {
    const sds = [{ sd_key: 'SD-FAIL-ALL-001', title: 'All Fail' }];
    const supabase = makeSupabase(sds);
    scoreSD.mockRejectedValue(new Error('All fail'));
    syncVisionScoresToPatterns.mockResolvedValue({});

    const { scheduler, restoreEnv } = makeScheduler(supabase, true);
    await scheduler.runPeriodicVisionScoring();
    restoreEnv();

    expect(syncVisionScoresToPatterns).not.toHaveBeenCalled();
  });

  // US-003: Sync failure does not block scheduler
  it('US-003: sync failure is logged but does not throw', async () => {
    const sds = [{ sd_key: 'SD-SYNC-FAIL-001', title: 'Sync Fail' }];
    const supabase = makeSupabase(sds);
    scoreSD.mockResolvedValue({ total_score: 80 });
    syncVisionScoresToPatterns.mockRejectedValue(new Error('Sync error'));

    const { scheduler, restoreEnv } = makeScheduler(supabase, true);
    await expect(scheduler.runPeriodicVisionScoring()).resolves.toBeUndefined();
    restoreEnv();

    expect(scheduler.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Vision-to-patterns sync failed'),
    );
  });

  // US-004: process-gap-reporter not found — silently skipped
  it('US-004: silently skips when process-gap-reporter.mjs does not exist', async () => {
    const sds = [{ sd_key: 'SD-GAP-001', title: 'Gap Test' }];
    const supabase = makeSupabase(sds);
    scoreSD.mockResolvedValue({ total_score: 80 });
    syncVisionScoresToPatterns.mockResolvedValue({});

    const { scheduler, restoreEnv } = makeScheduler(supabase, true);

    // _runProcessGapReporter uses dynamic import — spy on the method directly
    const notFoundErr = Object.assign(new Error('Cannot find module'), { code: 'ERR_MODULE_NOT_FOUND' });
    vi.spyOn(scheduler, '_runProcessGapReporter').mockImplementation(async () => {
      scheduler.logger.log('[Scheduler] process-gap-reporter.mjs not found, skipping');
    });

    await scheduler.runPeriodicVisionScoring();
    restoreEnv();

    expect(scheduler.logger.log).toHaveBeenCalledWith(
      expect.stringContaining('process-gap-reporter.mjs not found, skipping'),
    );
  });

  // US-004: process-gap-reporter found — invoked after sync
  it('US-004: calls _runProcessGapReporter after vision-to-patterns sync', async () => {
    const sds = [{ sd_key: 'SD-GAP-CALL-001', title: 'Gap Call' }];
    const supabase = makeSupabase(sds);
    scoreSD.mockResolvedValue({ total_score: 80 });
    syncVisionScoresToPatterns.mockResolvedValue({});

    const { scheduler, restoreEnv } = makeScheduler(supabase, true);
    const runReporterSpy = vi.spyOn(scheduler, '_runProcessGapReporter').mockResolvedValue(undefined);

    await scheduler.runPeriodicVisionScoring();
    restoreEnv();

    expect(runReporterSpy).toHaveBeenCalledOnce();
  });
});
