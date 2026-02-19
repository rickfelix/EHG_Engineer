/**
 * Unit tests for scoreSDAtConception (SD-LEO-INFRA-VISION-SD-CONCEPTION-GATE-001)
 *
 * Tests the non-blocking vision pre-screen added to leo-create-sd.js.
 * scoreSD is fully mocked so tests are fast and deterministic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist-safe setup (runs before vi.mock hoisting) ───────────────────────────
// process.exit is intercepted by vitest; mock it so the CLI guard in
// leo-create-sd.js doesn't trigger an "unhandled error" when the module loads.
const mockScoreSD  = vi.hoisted(() => vi.fn());
const mockExit     = vi.hoisted(() => vi.spyOn(process, 'exit').mockImplementation(() => {}));

vi.mock('../../../scripts/eva/vision-scorer.js', () => ({ scoreSD: mockScoreSD }));

// Mock other heavy side-effect imports in leo-create-sd.js so it loads cleanly
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn(async () => 'SD-TEST-001'),
  generateChildKey: vi.fn(() => 'SD-TEST-001-A'),
  SD_SOURCES: {},
  SD_TYPES: {},
  normalizeVenturePrefix: vi.fn(),
}));
vi.mock('../../../lib/eva/venture-context-manager.js', () => ({
  VentureContextManager: vi.fn(() => ({ getActiveVenture: vi.fn(async () => null) })),
}));
vi.mock('../../../scripts/modules/phase-0/leo-integration.js', () => ({
  checkGate: vi.fn(() => ({ action: 'proceed', session: null })),
  getArtifacts: vi.fn(() => ({})),
  getStatus: vi.fn(() => ({})),
}));
vi.mock('../../../lib/utils/work-item-router.js', () => ({ routeWorkItem: vi.fn() }));
vi.mock('../../../scripts/modules/sd-next/dependency-resolver.js', () => ({
  scanMetadataForMisplacedDependencies: vi.fn(() => ({ hasMisplacedDeps: false, findings: [] })),
}));
vi.mock('../../../scripts/modules/plan-parser.js', () => ({
  parsePlanFile: vi.fn(),
  formatFilesAsScope: vi.fn(),
  formatStepsAsCriteria: vi.fn(() => []),
}));
vi.mock('../../../scripts/modules/plan-archiver.js', () => ({
  findMostRecentPlan: vi.fn(),
  archivePlanFile: vi.fn(async () => ({ success: false })),
  readPlanFile: vi.fn(),
  getDisplayPath: vi.fn(p => p),
}));
vi.mock('../../../scripts/modules/triage-gate.js', () => ({
  runTriageGate: vi.fn(async () => ({ tier: 3 })),
  formatTriageSummary: vi.fn(() => ''),
}));

// ── Import under test ─────────────────────────────────────────────────────────
import { scoreSDAtConception, VISION_PRESCREEN_TIMEOUT_MS } from '../../../scripts/leo-create-sd.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const mockSupabase = {};
const SD_KEY   = 'SD-TEST-VISION-001';
const TITLE    = 'Test SD title';
const DESC     = 'Test SD description for vision alignment';

/** Build a minimal scoreSD result */
function buildScoreResult(totalScore) {
  const thresholdMap = { accept: 93, minor_sd: 83, gap_closure_sd: 70 };
  let thresholdAction = 'escalate';
  if (totalScore >= thresholdMap.accept)        thresholdAction = 'accept';
  else if (totalScore >= thresholdMap.minor_sd) thresholdAction = 'minor_sd';
  else if (totalScore >= thresholdMap.gap_closure_sd) thresholdAction = 'gap_closure_sd';
  return { total_score: totalScore, threshold_action: thresholdAction, id: 'score-uuid', dimension_scores: {} };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('scoreSDAtConception', () => {
  it('TS-001 happy path: resolves and returns score result', async () => {
    mockScoreSD.mockResolvedValue(buildScoreResult(85));

    const result = await scoreSDAtConception(SD_KEY, TITLE, DESC, mockSupabase);

    expect(result).not.toBeNull();
    expect(result.total_score).toBe(85);
  });

  it('TS-001 passes correct arguments to scoreSD', async () => {
    mockScoreSD.mockResolvedValue(buildScoreResult(85));

    await scoreSDAtConception(SD_KEY, TITLE, DESC, mockSupabase);

    expect(mockScoreSD).toHaveBeenCalledWith({
      sdKey: SD_KEY,
      scope: `Title: ${TITLE}\nDescription: ${DESC}`,
      dryRun: false,
      supabase: mockSupabase,
    });
  });

  it('TS-004 score < 50 returns result and logs ESCALATION warning (does not throw)', async () => {
    mockScoreSD.mockResolvedValue(buildScoreResult(40));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await scoreSDAtConception(SD_KEY, TITLE, DESC, mockSupabase);

    expect(result).not.toBeNull();
    expect(result.total_score).toBe(40);

    const outputLines = consoleSpy.mock.calls.map(c => c.join(' '));
    expect(outputLines.some(l => l.includes('ESCALATION'))).toBe(true);
    expect(outputLines.some(l => l.includes('Consider revising'))).toBe(true);

    consoleSpy.mockRestore();
  });

  it('TS-005 score >= 93 (ACCEPT) logs accept label, no escalation warning', async () => {
    mockScoreSD.mockResolvedValue(buildScoreResult(95));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await scoreSDAtConception(SD_KEY, TITLE, DESC, mockSupabase);

    expect(result.total_score).toBe(95);
    const outputLines = consoleSpy.mock.calls.map(c => c.join(' '));
    expect(outputLines.some(l => l.includes('✅ ACCEPT'))).toBe(true);
    expect(outputLines.some(l => l.includes('ESCALATION'))).toBe(false);

    consoleSpy.mockRestore();
  });

  it('TS-002 LLM timeout: returns null and logs warning (does not throw)', async () => {
    vi.useFakeTimers();
    mockScoreSD.mockImplementation(
      () => new Promise(() => {}) // never resolves
    );
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const resultPromise = scoreSDAtConception(SD_KEY, TITLE, DESC, mockSupabase);
    vi.advanceTimersByTime(VISION_PRESCREEN_TIMEOUT_MS + 100);
    const result = await resultPromise;

    expect(result).toBeNull();
    const outputLines = consoleSpy.mock.calls.map(c => c.join(' '));
    expect(outputLines.some(l => l.includes('Vision pre-screen skipped'))).toBe(true);
    expect(outputLines.some(l => l.includes('timeout'))).toBe(true);

    consoleSpy.mockRestore();
    vi.useRealTimers();
  });

  it('TS-003 scoreSD throws: returns null and logs warning (does not throw)', async () => {
    mockScoreSD.mockRejectedValue(new Error('LLM connection refused'));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await scoreSDAtConception(SD_KEY, TITLE, DESC, mockSupabase);

    expect(result).toBeNull();
    const outputLines = consoleSpy.mock.calls.map(c => c.join(' '));
    expect(outputLines.some(l => l.includes('Vision pre-screen skipped'))).toBe(true);
    expect(outputLines.some(l => l.includes('LLM connection refused'))).toBe(true);

    consoleSpy.mockRestore();
  });

  it('VISION_PRESCREEN_TIMEOUT_MS is exported and equals 15000', () => {
    expect(VISION_PRESCREEN_TIMEOUT_MS).toBe(15000);
  });
});
