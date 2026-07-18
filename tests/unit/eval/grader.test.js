/**
 * grader.test.js — FR-2 split-verb fresh-context grader
 * (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-002-B, child B of the model-capability eval).
 *
 * Covers: results-only reference rows (trusted_for_routing=false, pairwise-ranked);
 * fresh-context request excludes candidate reasoning; split-verb tier routing
 * (borderline→deep, clear→cheap); and the inherited CONTAMINATION GUARD — no answer
 * key or task_text ever reaches a tracked file, proven by a runtime sentinel + repo scan.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  gradeGoldenTasks,
  buildFreshContextRequest,
  classifyGradingTier,
  tierStrength,
  rankPairwise,
  CLEARS_BAR_THRESHOLD,
  BORDERLINE_MARGIN,
  DEEP_TIER,
  CHEAP_TIER,
} from '../../../lib/eval/grader.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = join(__dirname, '..', '..', '..');
const GRADER_SRC_PATH = join(__dirname, '..', '..', '..', 'lib', 'eval', 'grader.mjs');

/**
 * Answer-key sentinel assembled AT RUNTIME (mirrors child A's guard) so the full
 * literal never appears verbatim in any tracked file — the repo scan can then grep
 * the whole tree and legitimately find zero hits.
 */
const KEY_TOKEN = ['ANSWERKEY', 'SENTINEL', 'DONOTCOMMIT'].join('-');
const sentinelFor = (taskId) => `${KEY_TOKEN}::${taskId}::b2c4d6e8`;

const SHAPE_OF = {
  'FAB5-R2-01': 'R2-negative-space',
  'FAB5-R5-01': 'R5-reversal',
  'FAB5-MECH-01': 'mechanical-baseline',
};
const EFFORTS = ['high', 'medium', 'low'];
const TASK_IDS = ['FAB5-R2-01', 'FAB5-R5-01', 'FAB5-MECH-01'];

/** A loader stub returning the child-A set shape (task_text present; NO answer_key). */
function makeLoader(taskIds = TASK_IDS) {
  return async () => ({
    source: 'system_events',
    integrityErrors: [],
    sets: taskIds.map((t) => ({
      task_id: t,
      shape: SHAPE_OF[t],
      task_text: `PROMPT for ${t}`,
      sealed_runs: EFFORTS.map((effort, i) => ({
        effort,
        model_id: 'fable-5',
        tokens: 1000 + i * 100,
        wall_clock: 5000 + i,
        run_at: '2026-07-16T00:00:00Z',
        output: `run output ${t}/${effort}`,
      })),
    })),
  });
}

/** keyAccessor stub — the only sanctioned key read; returns the runtime sentinel. */
const makeKeyAccessor = () => async (_supabase, taskId) => sentinelFor(taskId);

/** A grade factory: deterministic quality by effort so pairwise ranking is testable. */
function gradeFor(request, { tier }) {
  // Quality rises with effort (high>medium>low); deep tier nudges up (proves re-grade wins).
  const effortRank = request.candidate_output.endsWith('/high') ? 0.9
    : request.candidate_output.endsWith('/medium') ? 0.75 : 0.6;
  const quality = tier === 'deep' ? Math.min(1, effortRank + 0.05) : effortRank;
  return {
    clears_bar: quality >= CLEARS_BAR_THRESHOLD,
    quality_score: quality,
    grader: tier === 'deep' ? 'fable:xhigh' : 'sonnet:medium',
    graded_at: '2026-07-16T01:00:00Z',
  };
}

/** git grep for a sentinel across tracked files; [] when zero matches. */
function trackedTreeContains(sentinel) {
  try {
    const out = execSync(`git grep -F -l -- ${JSON.stringify(sentinel)}`, {
      cwd: WORKTREE_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').filter(Boolean);
  } catch (e) {
    if (e.status === 1 && !e.stdout) return [];
    throw e;
  }
}

describe('gradeGoldenTasks (FR-2 scoring engine)', () => {
  it('TS-1: emits one results-only reference row per sealed_run, trusted_for_routing=false, pairwise-ranked', async () => {
    const calls = [];
    const gradeFn = (req, ctx) => { calls.push(ctx.tier); return gradeFor(req, ctx); };
    const { rows, ranked, stats, source } = await gradeGoldenTasks(null, {
      gradeFn, loader: makeLoader(), keyAccessor: makeKeyAccessor(),
    });

    expect(source).toBe('system_events');
    expect(rows).toHaveLength(TASK_IDS.length * EFFORTS.length); // 3 tasks × 3 efforts
    expect(stats.runs).toBe(9);
    expect(stats.cheap_grades).toBe(9); // every run gets a cheap first pass

    for (const r of rows) {
      // Results-only reference row: routing trust is NEVER set here (child C's gate).
      expect(r.trusted_for_routing).toBe(false);
      expect(typeof r.quality_score).toBe('number');
      expect(typeof r.content_hash).toBe('string');
      // CONTAMINATION GUARD (structural): no key or prompt text on the emitted row.
      expect('answer_key' in r).toBe(false);
      expect('task_text' in r).toBe(false);
    }

    // Ranked best-first per task: high-effort run (highest quality) leads its group.
    for (const t of TASK_IDS) {
      expect(ranked[t][0].effort).toBe('high');
    }
  });

  it('TS-2: buildFreshContextRequest carries the task, final output, and key — but NOT candidate reasoning', () => {
    const req = buildFreshContextRequest({
      task_text: 'PROMPT', output: 'FINAL ANSWER', answerKey: sentinelFor('FAB5-R2-01'),
    });
    // Exactly the three fresh-context fields — no chain-of-thought / candidate reasoning.
    expect(Object.keys(req).sort()).toEqual(['answer_key', 'candidate_output', 'task_text']);
    expect(req.candidate_output).toBe('FINAL ANSWER');
    expect('candidate_reasoning' in req).toBe(false);
    expect('reasoning' in req).toBe(false);
    expect('chain_of_thought' in req).toBe(false);
    expect(Object.isFrozen(req)).toBe(true);
  });

  it('TS-3: classifyGradingTier routes borderline→deep and clear-cut→cheap; deep tier is the stronger ladder rung', () => {
    // At the bar exactly and within the margin → deep.
    expect(classifyGradingTier({ quality_score: CLEARS_BAR_THRESHOLD })).toBe('deep');
    expect(classifyGradingTier({ quality_score: CLEARS_BAR_THRESHOLD + BORDERLINE_MARGIN - 0.001 })).toBe('deep');
    // Comfortably clear (well above) or comfortably failing → cheap.
    expect(classifyGradingTier({ quality_score: 0.98 })).toBe('cheap');
    expect(classifyGradingTier({ quality_score: 0.2 })).toBe('cheap');
    expect(classifyGradingTier(null)).toBe('cheap'); // no grade → treated as clear-fail
    // The deep tier outranks the cheap seat on the canonical model×effort ladder.
    expect(tierStrength('deep')).toBeGreaterThan(tierStrength('cheap'));
    expect(DEEP_TIER.model).toBe('fable');
    expect(CHEAP_TIER.model).toBe('sonnet');
  });

  it('TS-4: split-verb — a BORDERLINE first-pass escalates to the deep tier and the deep re-grade is what is emitted', async () => {
    // Loader with a single run whose cheap grade lands borderline (medium effort → 0.75, |0.75-0.70|=0.05 ≤ margin).
    const loader = async () => ({
      source: 'system_events', integrityErrors: [],
      sets: [{
        task_id: 'FAB5-R2-01', shape: SHAPE_OF['FAB5-R2-01'], task_text: 'PROMPT for FAB5-R2-01',
        sealed_runs: [{ effort: 'medium', model_id: 'fable-5', tokens: 1000, wall_clock: 5000, run_at: '2026-07-16T00:00:00Z', output: 'run output FAB5-R2-01/medium' }],
      }],
    });
    const seen = [];
    const gradeFn = (req, ctx) => { seen.push(ctx.tier); return gradeFor(req, ctx); };
    const { rows, stats } = await gradeGoldenTasks(null, { gradeFn, loader, keyAccessor: makeKeyAccessor() });

    expect(seen).toEqual(['cheap', 'deep']); // cheap first pass, then deep escalation
    expect(stats.deep_regrades).toBe(1);
    expect(rows).toHaveLength(1);
    // Emitted row reflects the DEEP re-grade (0.75 + 0.05 = 0.80), not the cheap first pass.
    expect(rows[0].quality_score).toBeCloseTo(0.80, 5);
    expect(rows[0].grader).toBe('fable:xhigh');

    // A comfortably-clear run stays cheap (no deep escalation).
    const clearLoader = async () => ({
      source: 'system_events', integrityErrors: [],
      sets: [{
        task_id: 'FAB5-R5-01', shape: SHAPE_OF['FAB5-R5-01'], task_text: 'PROMPT for FAB5-R5-01',
        sealed_runs: [{ effort: 'high', model_id: 'fable-5', tokens: 1000, wall_clock: 5000, run_at: '2026-07-16T00:00:00Z', output: 'run output FAB5-R5-01/high' }],
      }],
    });
    const seen2 = [];
    const { stats: stats2 } = await gradeGoldenTasks(null, {
      gradeFn: (req, ctx) => { seen2.push(ctx.tier); return gradeFor(req, ctx); },
      loader: clearLoader, keyAccessor: makeKeyAccessor(),
    });
    expect(seen2).toEqual(['cheap']); // 0.9 is >margin from 0.70 → no deep call
    expect(stats2.deep_regrades).toBe(0);
  });

  it('TS-5: throws when gradeFn is missing (the grading verb is required, no silent no-op)', async () => {
    await expect(gradeGoldenTasks(null, { loader: makeLoader(), keyAccessor: makeKeyAccessor() }))
      .rejects.toThrow(/gradeFn/);
  });
});

describe('CONTAMINATION GUARD (FR-2, inherited absolute)', () => {
  it('TS-6a: graded rows serialized to JSON contain NONE of the answer_key values or task_text', async () => {
    const { rows } = await gradeGoldenTasks(null, {
      gradeFn: gradeFor, loader: makeLoader(), keyAccessor: makeKeyAccessor(),
    });
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(KEY_TOKEN);
    for (const t of TASK_IDS) {
      expect(serialized).not.toContain(sentinelFor(t));
      expect(serialized).not.toContain(`PROMPT for ${t}`); // task_text never persisted
    }
  });

  it('TS-6b: repo-scan — NO answer_key sentinel appears in ANY tracked file', () => {
    for (const t of [...TASK_IDS, 'FAB5-R4-02', 'FAB5-R1-01']) {
      expect(trackedTreeContains(sentinelFor(t))).toEqual([]);
    }
  });

  it('TS-6c: the grader module performs NO filesystem write of any material', () => {
    const src = readFileSync(GRADER_SRC_PATH, 'utf8');
    expect(src).not.toMatch(/from\s+['"]node:fs['"]|require\(['"]fs['"]\)|from\s+['"]fs['"]/);
    expect(src).not.toMatch(/writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream/);
  });

  it('TS-6d: the grader NEVER sets trusted_for_routing true — only child C may bind routing', async () => {
    const src = readFileSync(GRADER_SRC_PATH, 'utf8');
    // No literal that would flip routing trust on inside the grader.
    expect(src).not.toMatch(/trusted_for_routing\s*[:=]\s*true/);
    const { rows } = await gradeGoldenTasks(null, {
      gradeFn: gradeFor, loader: makeLoader(), keyAccessor: makeKeyAccessor(),
    });
    expect(rows.every((r) => r.trusted_for_routing === false)).toBe(true);
  });
});

describe('rankPairwise (comparator SSOT)', () => {
  it('ranks rows within a task by cost-normalized quality using capability-scorer.pairwise', () => {
    const rows = [
      { task_id: 'T1', model_id: 'm', effort: 'low', quality_score: 0.9, tokens: 2000 },  // cost_norm 0.45
      { task_id: 'T1', model_id: 'm', effort: 'high', quality_score: 0.9, tokens: 1000 }, // cost_norm 0.90 (better)
    ];
    const ranked = rankPairwise(rows);
    expect(ranked.T1[0].effort).toBe('high'); // higher cost-normalized quality leads
  });

  it('is a TOTAL, deterministic order on ties (equal cost_norm) — stable across input permutations', () => {
    // Three runs with IDENTICAL cost_norm (same quality & tokens) but distinct labels.
    const mk = (effort) => ({ task_id: 'T1', model_id: 'm', effort, quality_score: 0.8, tokens: 1000 });
    const a = rankPairwise([mk('low'), mk('medium'), mk('high')]).T1.map((r) => r.effort);
    const b = rankPairwise([mk('high'), mk('low'), mk('medium')]).T1.map((r) => r.effort);
    expect(a).toEqual(b); // deterministic regardless of input order (label tiebreak)
    expect(a).toEqual(['high', 'low', 'medium']); // localeCompare of 'm:<effort>'
  });
});

describe('gradeGoldenTasks robustness', () => {
  it('skips a single malformed run (missing model_id) without rejecting the whole batch', async () => {
    const loader = async () => ({
      source: 'system_events', integrityErrors: [],
      sets: [{
        task_id: 'FAB5-R2-01', shape: SHAPE_OF['FAB5-R2-01'], task_text: 'PROMPT for FAB5-R2-01',
        sealed_runs: [
          { effort: 'high', model_id: 'fable-5', tokens: 1000, wall_clock: 5000, run_at: '2026-07-16T00:00:00Z', output: 'run output FAB5-R2-01/high' },
          { effort: 'low', model_id: null, tokens: 1000, wall_clock: 5000, run_at: '2026-07-16T00:00:00Z', output: 'run output FAB5-R2-01/low' }, // malformed: no model_id
        ],
      }],
    });
    const { rows, stats, integrityErrors } = await gradeGoldenTasks(null, {
      gradeFn: gradeFor, loader, keyAccessor: makeKeyAccessor(),
    });
    expect(rows).toHaveLength(1); // the good run still emits
    expect(rows[0].effort).toBe('high');
    expect(stats.skipped).toBe(1);
    expect(integrityErrors).toEqual([
      expect.objectContaining({ task_id: 'FAB5-R2-01', effort: 'low', error: 'REFERENCE_ROW_INVALID' }),
    ]);
  });
});
