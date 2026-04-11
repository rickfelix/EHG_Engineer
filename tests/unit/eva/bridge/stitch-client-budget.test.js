/**
 * Unit tests for Stitch Client Budget Functions
 * SD-FIX-STITCH-BUDGET-COLUMN-001
 *
 * Covers:
 *   STCHBDG001:US-001 - Fix budget column name (artifact_data, no PGRST204)
 *   STCHBDG001:US-002 - Budget limit enforcement (throws at limit, warns at 80%)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Supabase — capture all chained calls
// ---------------------------------------------------------------------------

const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockSingle = vi.fn();
const mockEq2 = vi.fn(() => ({ single: mockSingle }));
const mockEq1 = vi.fn(() => ({ eq: mockEq2 }));
const mockSelect = vi.fn(() => ({ eq: mockEq1 }));
const mockFrom = vi.fn((table) => ({
  select: mockSelect,
  upsert: mockUpsert,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

// Dynamic import after mocks are established
const mod = await import('../../../../lib/eva/bridge/stitch-client.js');
const {
  getGenerationBudget,
  BUDGET_PER_VENTURE,
  StitchBudgetExceededError,
  setSDKLoader,
} = mod;

// generateScreens calls consumeBudget internally
const { generateScreens } = mod;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset budget cache between tests by loading a fresh budget from "DB" */
function resetMocks() {
  vi.clearAllMocks();
  mockUpsert.mockResolvedValue({ data: null, error: null });
}

// ---------------------------------------------------------------------------
// STCHBDG001:US-001 — persistBudget uses correct column name (artifact_data)
// ---------------------------------------------------------------------------

describe('STCHBDG001:US-001 — persistBudget uses artifact_data column', () => {
  beforeEach(() => {
    resetMocks();
    // Provide a mock SDK so generateScreens doesn't fail on SDK init
    setSDKLoader(async () => ({
      createProject: vi.fn(),
      listScreens: vi.fn().mockResolvedValue([{ id: 's1', name: 'Screen 1' }]),
      generateScreens: vi.fn().mockResolvedValue({ screens: [{ id: 's1' }] }),
    }));
  });

  it('upserts with artifact_data key (not "data")', async () => {
    // loadBudget: return 0 used so consumeBudget proceeds
    mockSingle.mockResolvedValue({
      data: { artifact_data: { used: 0 } },
      error: null,
    });

    // Trigger consumeBudget via getGenerationBudget + generateScreens
    // Simplest path: call getGenerationBudget first to prime cache at 0,
    // then use generateScreens which calls consumeBudget -> persistBudget.
    await getGenerationBudget('v-test-001');

    // generateScreens will call consumeBudget internally
    try {
      await generateScreens('proj-1', ['build a landing page'], 'v-test-001');
    } catch {
      // SDK call may fail — we only care about the upsert call shape
    }

    // Verify persistBudget was called (upsert on venture_artifacts)
    expect(mockFrom).toHaveBeenCalledWith('venture_artifacts');
    expect(mockUpsert).toHaveBeenCalled();

    const upsertArg = mockUpsert.mock.calls[0][0];

    // THE FIX: column must be artifact_data, NOT data
    expect(upsertArg).toHaveProperty('artifact_data');
    expect(upsertArg).not.toHaveProperty('data');
    expect(upsertArg.artifact_type).toBe('stitch_budget');
    expect(upsertArg.venture_id).toBe('v-test-001');
    expect(upsertArg.artifact_data).toHaveProperty('used');
    expect(upsertArg.artifact_data).toHaveProperty('limit', BUDGET_PER_VENTURE);
    expect(upsertArg.artifact_data).toHaveProperty('updated_at');
  });

  it('upsert uses onConflict venture_id,artifact_type', async () => {
    mockSingle.mockResolvedValue({
      data: { artifact_data: { used: 0 } },
      error: null,
    });

    await getGenerationBudget('v-test-002');

    try {
      await generateScreens('proj-2', ['build a dashboard'], 'v-test-002');
    } catch {
      // ignore SDK errors
    }

    expect(mockUpsert).toHaveBeenCalled();
    const onConflictArg = mockUpsert.mock.calls[0][1];
    expect(onConflictArg).toEqual({ onConflict: 'venture_id,artifact_type' });
  });

  it('loadBudget reads artifact_data column from venture_artifacts', async () => {
    mockSingle.mockResolvedValue({
      data: { artifact_data: { used: 12 } },
      error: null,
    });

    const result = await getGenerationBudget('v-test-003');

    expect(mockFrom).toHaveBeenCalledWith('venture_artifacts');
    expect(mockSelect).toHaveBeenCalledWith('artifact_data');
    expect(result.used).toBe(12);
    expect(result.limit).toBe(BUDGET_PER_VENTURE);
    expect(result.remaining).toBe(BUDGET_PER_VENTURE - 12);
  });
});

// ---------------------------------------------------------------------------
// STCHBDG001:US-002 — Budget limit enforcement
// ---------------------------------------------------------------------------

describe('STCHBDG001:US-002 — Budget limit enforcement', () => {
  beforeEach(() => {
    resetMocks();
    setSDKLoader(async () => ({
      createProject: vi.fn(),
      listScreens: vi.fn().mockResolvedValue([{ id: 's1', name: 'Screen 1' }]),
      generateScreens: vi.fn().mockResolvedValue({ screens: [{ id: 's1' }] }),
    }));
  });

  it('throws StitchBudgetExceededError when budget is exhausted', async () => {
    // Budget already at limit
    mockSingle.mockResolvedValue({
      data: { artifact_data: { used: BUDGET_PER_VENTURE } },
      error: null,
    });

    // Prime the cache
    await getGenerationBudget('v-over-budget');

    // generateScreens calls consumeBudget which should throw
    await expect(
      generateScreens('proj-x', ['anything'], 'v-over-budget')
    ).rejects.toThrow(StitchBudgetExceededError);
  });

  it('throws when budget would exceed limit (used + count > limit)', async () => {
    mockSingle.mockResolvedValue({
      data: { artifact_data: { used: BUDGET_PER_VENTURE - 0 } }, // exactly at limit
      error: null,
    });

    await getGenerationBudget('v-at-limit');

    await expect(
      generateScreens('proj-y', ['a prompt'], 'v-at-limit')
    ).rejects.toThrow(/budget exceeded/i);
  });

  it('warns at 80% budget threshold', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const usedAt80Pct = Math.ceil(BUDGET_PER_VENTURE * 0.8);

    mockSingle.mockResolvedValue({
      data: { artifact_data: { used: usedAt80Pct - 1 } }, // one below 80%
      error: null,
    });

    await getGenerationBudget('v-warn-test');

    try {
      await generateScreens('proj-w', ['prompt'], 'v-warn-test');
    } catch {
      // SDK may fail, we just want to check warn was called
    }

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Budget warning')
    );
    warnSpy.mockRestore();
  });

  it('loadBudget returns correct values via getGenerationBudget', async () => {
    mockSingle.mockResolvedValue({
      data: { artifact_data: { used: 25 } },
      error: null,
    });

    const result = await getGenerationBudget('v-load-test');

    expect(result).toEqual({
      used: 25,
      limit: BUDGET_PER_VENTURE,
      remaining: BUDGET_PER_VENTURE - 25,
    });
  });

  it('handles missing DB row gracefully (defaults to 0 used)', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await getGenerationBudget('v-new-venture');

    expect(result.used).toBe(0);
    expect(result.remaining).toBe(BUDGET_PER_VENTURE);
  });
});
