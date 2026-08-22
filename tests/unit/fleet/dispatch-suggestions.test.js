/**
 * SD-LEO-INFRA-INTELLIGENT-ROUTING-RANK-001 — per-FR tests for the advisory dispatch-suggestion
 * engine.
 *
 *   FR-1 advisory-only invariant + ranking          — TS-1
 *   FR-1 fail-open fit-resolution error handling     — TS-7
 *
 * FR-2 (worker self-claim "pickup intelligence") is NOT tested here — it was descoped from this
 * module after investigating a real bug it produced surfaced that lib/fleet/tier-backlog.cjs's
 * lowerTierBacklog() + claim-eligibility.cjs's tierAxes 'reserved_no_lower_backlog' branch
 * already implement this concern (see dispatch-suggestions.cjs header for the full account).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  candidateFitScore,
  rankCandidatesForItem,
  fitErrorFallback,
  generateAndPersistSuggestions,
} from '../../../lib/fleet/dispatch-suggestions.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, '..', '..', '..', 'lib', 'fleet', 'dispatch-suggestions.cjs'), 'utf8');

// ---- TS-1: FR-1 advisory-only structural invariant -----------------------
describe('FR-1 advisory-only invariant (structural)', () => {
  it('contains zero calls to tryClaim/claim_sd/sd-start — this module can never assign', () => {
    expect(SRC).not.toMatch(/tryClaim\s*\(/);
    expect(SRC).not.toMatch(/claim_sd\s*\(/);
    // Excludes the module's own doc-comment PROSE mentioning "sd-start" (describing the
    // invariant) — this checks for an actual require/import/exec of the script, not the word.
    expect(SRC).not.toMatch(/(require|import|execSync|spawn)\([^)]*sd-start/);
  });

  it('does not redefine a parallel capability-scoring formula (consumes tier-ladder ranks only)', () => {
    expect(SRC).not.toMatch(/MODEL_STRENGTH\s*=/);
    expect(SRC).not.toMatch(/EFFORT_STRENGTH\s*=/);
    expect(SRC).toContain("require('./tier-ladder.cjs')");
  });
});

// ---- TS-1: FR-1 ranking behavior ------------------------------------------
describe('FR-1 candidateFitScore / rankCandidatesForItem', () => {
  it('scores an exact-floor match higher than an over-qualified worker', () => {
    const perfect = candidateFitScore({ workerRank: 2, minTierRank: 2, workerModel: 'sonnet' });
    const overQualified = candidateFitScore({ workerRank: 4, minTierRank: 2, workerModel: 'opus' });
    expect(perfect.score).toBeGreaterThan(overQualified.score);
    expect(perfect.why.eligible).toBe(true);
    expect(overQualified.why.over_qualification).toBe(2);
  });

  it('marks a below-floor worker ineligible (score -Infinity)', () => {
    const below = candidateFitScore({ workerRank: 1, minTierRank: 3, workerModel: 'haiku' });
    expect(below.score).toBe(-Infinity);
    expect(below.why.eligible).toBe(false);
  });

  it('penalizes a Fable worker only when quota posture is lean-Fable', () => {
    const leanPenalized = candidateFitScore({ workerRank: 4, minTierRank: 1, workerModel: 'fable', quotaPosture: { leanFable: true } });
    const notLean = candidateFitScore({ workerRank: 4, minTierRank: 1, workerModel: 'fable', quotaPosture: { leanFable: false } });
    expect(leanPenalized.score).toBeLessThan(notLean.score);
    expect(leanPenalized.why.quota_penalty).toBeGreaterThan(0);
    expect(notLean.why.quota_penalty).toBe(0);
  });

  it('rankCandidatesForItem sorts best-fit first and drops ineligible candidates', () => {
    const item = { sd_key: 'SD-X', sd_type: 'infrastructure', metadata: { min_tier_rank: 2 } };
    const liveWorkers = [
      { session_id: 'weak', model: 'haiku', effort: 'low', rank: 1 },   // below floor -> dropped
      { session_id: 'exact', model: 'sonnet', effort: 'medium', rank: 2 }, // best fit
      { session_id: 'over', model: 'opus', effort: 'xhigh', rank: 4 },  // eligible but over-qualified
    ];
    const ranked = rankCandidatesForItem({ item, liveWorkers });
    expect(ranked.map((r) => r.session_id)).toEqual(['exact', 'over']);
  });
});

// ---- TS-7: fail-open on fit-resolution error -------------------------------
describe('FR-1/TR-7 fail-open on fit-resolution error', () => {
  it('fitErrorFallback returns an eligible, non-crashing fallback shape', () => {
    const fb = fitErrorFallback('synthetic fault');
    expect(fb.why.quota_or_fit_error).toBe(true);
    expect(fb.why.reason).toBe('synthetic fault');
    expect(Number.isFinite(fb.score)).toBe(true);
  });

  it('generateAndPersistSuggestions never throws even when every I/O dependency is broken', async () => {
    const brokenSb = {
      from() {
        throw new Error('synthetic DB fault');
      },
    };
    await expect(generateAndPersistSuggestions(brokenSb, { limit: 5 })).resolves.toEqual({
      items_considered: 0,
      suggestions_written: 0,
      results: [],
    });
  });
});
