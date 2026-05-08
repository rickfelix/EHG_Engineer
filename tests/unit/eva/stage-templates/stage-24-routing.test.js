/**
 * SD-LEO-FEAT-STAGE-LIVE-ANNOUNCE-001 FR-7
 *
 * Vitest coverage for FR-1, FR-2, FR-4, FR-5:
 *   (a) getAnalysisStep(24) === analyzeStage24GoLive (FR-2 dispatch)
 *   (b) artifact-types.js exposes BOTH legacy + canonical (FR-1 alias preservation)
 *   (c) analyzeStage24GoLive throws on bad upstream verdict (FR-4)
 *   (d) GATE_VERIFIERS contains the 2 new entries with expected booleans (FR-5)
 *   (e) static guard: analysis-steps/index.js does NOT contain "stage-24-marketing-prep.js"
 *   (f) static guard: artifact-types.js contains BOTH literal strings
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  getAnalysisStep,
} from '../../../../lib/eva/stage-templates/analysis-steps/index.js';
import { analyzeStage24GoLive } from '../../../../lib/eva/stage-templates/analysis-steps/stage-24-go-live.js';
import { ARTIFACT_TYPES, OLD_TO_NEW_MAP, resolveArtifactType } from '../../../../lib/eva/artifact-types.js';
import { GATE_VERIFIERS, resolveVerifier } from '../../../../lib/eva/lifecycle/exit-gate-verifiers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../..');

// ─── (a) FR-2 dispatch correctness ────────────────────────────────────
describe('SD-LEO-FEAT-STAGE-LIVE-ANNOUNCE-001 FR-2 — Stage 24 dispatch', () => {
  it('getAnalysisStep(24) returns analyzeStage24GoLive', async () => {
    const fn = await getAnalysisStep(24);
    expect(fn).toBe(analyzeStage24GoLive);
  });
});

// ─── (b) FR-1 alias preservation ──────────────────────────────────────
describe('SD-LEO-FEAT-STAGE-LIVE-ANNOUNCE-001 FR-1 — artifact-types.js canonical + legacy', () => {
  it('exposes both LAUNCH_METRICS (canonical) and LAUNCH_LAUNCH_METRICS (deprecated alias)', () => {
    expect(ARTIFACT_TYPES.LAUNCH_METRICS).toBe('launch_metrics');
    expect(ARTIFACT_TYPES.LAUNCH_LAUNCH_METRICS).toBe('launch_launch_metrics');
  });

  it('OLD_TO_NEW_MAP translates the typo to the canonical key', () => {
    expect(OLD_TO_NEW_MAP.launch_launch_metrics).toBe('launch_metrics');
    expect(resolveArtifactType('launch_launch_metrics')).toBe('launch_metrics');
  });
});

// ─── (c) FR-4 entry-precondition refusal ──────────────────────────────
describe('SD-LEO-FEAT-STAGE-LIVE-ANNOUNCE-001 FR-4 — analyzeStage24GoLive entry precondition', () => {
  const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

  it('proceeds when stage23Data.verdict === "PASS" (PRD literal)', async () => {
    const result = await analyzeStage24GoLive({
      stage23Data: { verdict: 'PASS' },
      stage22Data: { channels: [] },
      ventureName: 'TestVenture',
      logger: silentLogger,
    });
    expect(result.launch_status).toBe('ready_to_launch');
    expect(result.readiness_verdict).toBe('PASS');
  });

  it('proceeds when stage23Data.verdict === "READY" (production reality)', async () => {
    const result = await analyzeStage24GoLive({
      stage23Data: { verdict: 'READY' },
      stage22Data: { channels: [] },
      ventureName: 'TestVenture',
      logger: silentLogger,
    });
    expect(result.launch_status).toBe('ready_to_launch');
    expect(result.readiness_verdict).toBe('READY');
  });

  it('throws when stage23Data.verdict === "FAIL"', async () => {
    await expect(analyzeStage24GoLive({
      stage23Data: { verdict: 'FAIL' },
      logger: silentLogger,
    })).rejects.toThrow(/verdict='FAIL'/);
  });

  it('throws when stage23Data.verdict === "NOT_READY"', async () => {
    await expect(analyzeStage24GoLive({
      stage23Data: { verdict: 'NOT_READY' },
      logger: silentLogger,
    })).rejects.toThrow(/verdict='NOT_READY'/);
  });

  it('throws when stage23Data.verdict === "HOLD" without chairman_override', async () => {
    await expect(analyzeStage24GoLive({
      stage23Data: { verdict: 'HOLD' },
      logger: silentLogger,
    })).rejects.toThrow(/verdict='HOLD'/);
  });

  it('proceeds when stage23Data.verdict === "HOLD" with chairman_override === true', async () => {
    const result = await analyzeStage24GoLive({
      stage23Data: { verdict: 'HOLD', chairman_override: true },
      stage22Data: { channels: [] },
      ventureName: 'TestVenture',
      logger: silentLogger,
    });
    expect(result.launch_status).toBe('ready_to_launch');
    expect(result.chairman_override_applied).toBe(true);
  });

  it('throws when stage23Data is missing entirely', async () => {
    await expect(analyzeStage24GoLive({ logger: silentLogger }))
      .rejects.toThrow(/MISSING/);
  });
});

// ─── (d) FR-5 GATE_VERIFIERS for Stage 24 ─────────────────────────────
describe('SD-LEO-FEAT-STAGE-LIVE-ANNOUNCE-001 FR-5 — Stage 24 exit-gate verifiers', () => {
  const VENTURE_ID = '11111111-2222-3333-4444-555555555555';

  function buildSupabase({ row, error = null } = {}) {
    const chain = {
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error }),
    };
    return {
      from: vi.fn(() => ({ select: vi.fn(() => chain) })),
    };
  }

  it('GATE_VERIFIERS contains "launch triggered" + "all channels activated" entries', () => {
    const matches = GATE_VERIFIERS.map(g => g.match);
    expect(matches).toContain('launch triggered');
    expect(matches).toContain('all channels activated');
  });

  it('resolveVerifier("Launch triggered") returns the launch_triggered verifier (case-insensitive substring)', () => {
    const v = resolveVerifier('Launch triggered');
    expect(typeof v).toBe('function');
  });

  it('verifyLaunchTriggered: launch_metrics row present + is_current → satisfied', async () => {
    const supabase = buildSupabase({ row: { id: 'art-1', artifact_type: 'launch_metrics' } });
    const verifier = resolveVerifier('Launch triggered');
    const result = await verifier({ supabase, ventureId: VENTURE_ID });
    expect(result).toEqual({ satisfied: true, reason: '' });
  });

  it('verifyLaunchTriggered: legacy artifact_type "launch_launch_metrics" still accepted (backward compat)', async () => {
    const supabase = buildSupabase({ row: { id: 'art-2', artifact_type: 'launch_launch_metrics' } });
    const verifier = resolveVerifier('Launch triggered');
    const result = await verifier({ supabase, ventureId: VENTURE_ID });
    expect(result.satisfied).toBe(true);
  });

  it('verifyLaunchTriggered: row missing → not satisfied', async () => {
    const supabase = buildSupabase({ row: null });
    const verifier = resolveVerifier('Launch triggered');
    const result = await verifier({ supabase, ventureId: VENTURE_ID });
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/launch_metrics artifact missing/);
  });

  it('verifyAllChannelsActivated: all channels status="activated" → satisfied', async () => {
    const supabase = buildSupabase({
      row: {
        artifact_type: 'launch_metrics',
        artifact_data: { channels: [{ name: 'email', status: 'activated' }, { name: 'social', status: 'activated' }] },
      },
    });
    const verifier = resolveVerifier('All channels activated');
    const result = await verifier({ supabase, ventureId: VENTURE_ID });
    expect(result.satisfied).toBe(true);
  });

  it('verifyAllChannelsActivated: mixed pending/activated → not satisfied with reason listing pending', async () => {
    const supabase = buildSupabase({
      row: {
        artifact_type: 'launch_metrics',
        artifact_data: { channels: [{ name: 'email', status: 'activated' }, { name: 'social', status: 'pending' }] },
      },
    });
    const verifier = resolveVerifier('All channels activated');
    const result = await verifier({ supabase, ventureId: VENTURE_ID });
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/1\/2 channels not activated/);
    expect(result.reason).toMatch(/pending/);
  });

  it('verifyAllChannelsActivated: artifact present but no channels → not satisfied', async () => {
    const supabase = buildSupabase({
      row: { artifact_type: 'launch_metrics', artifact_data: { channels: [] } },
    });
    const verifier = resolveVerifier('All channels activated');
    const result = await verifier({ supabase, ventureId: VENTURE_ID });
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/missing or empty/);
  });

  it('verifyAllChannelsActivated: artifact missing → not satisfied', async () => {
    const supabase = buildSupabase({ row: null });
    const verifier = resolveVerifier('All channels activated');
    const result = await verifier({ supabase, ventureId: VENTURE_ID });
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/launch_metrics artifact missing/);
  });
});

// ─── (e)+(f) Static source-code regression guards ─────────────────────
describe('SD-LEO-FEAT-STAGE-LIVE-ANNOUNCE-001 FR-7 — static regression guards', () => {
  it('lib/eva/stage-templates/analysis-steps/index.js does NOT reference archived "stage-24-marketing-prep.js"', () => {
    const indexSrc = readFileSync(
      resolve(REPO_ROOT, 'lib/eva/stage-templates/analysis-steps/index.js'),
      'utf8',
    );
    // Guard: only the production registry file. The archived copy under
    // docs/archived/orphan-stage-23-modules/ retains the original module name
    // for git-history purposes; that's not the file we're asserting on here.
    expect(indexSrc).not.toContain("'./stage-24-marketing-prep.js'");
    expect(indexSrc).toContain("'./stage-24-go-live.js'");
  });

  it('lib/eva/artifact-types.js contains BOTH "launch_launch_metrics" AND "launch_metrics" string literals', () => {
    const src = readFileSync(
      resolve(REPO_ROOT, 'lib/eva/artifact-types.js'),
      'utf8',
    );
    expect(src).toContain("'launch_launch_metrics'");
    expect(src).toContain("'launch_metrics'");
  });
});
