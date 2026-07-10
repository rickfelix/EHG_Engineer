/**
 * SD-LEO-INFRA-STAGE0-POSTURE-SUCCESSOR-001 (Solomon a8eafc72; Charlie CH-2/3/4/9)
 *
 * The commission success criteria, mechanically:
 *  CH-2  ONE POSTURE RESOLVER — resolveProfile fails closed (fallback retired).
 *  CH-3  ANTI-GOALS DISQUALIFY FOR REAL — hard pre-ranking filter, reason recorded,
 *        with production consumers on EVERY ranking path (router + discovery).
 *  CH-4  TRANSITIONS ARE CHAIRMAN-GATED — identity enforced, expiry evaluated + recorded.
 *  CH-9  WIP LIMIT AT CLAIM TIME — (proven in chairman-review.test.js; the creation
 *        writer is unique, grep-asserted here).
 */

import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve as resolvePath } from 'path';
import {
  resolveProfile,
  ProfileResolutionError,
  transitionPosture,
  evaluatePhase1Expiry,
  PostureTransitionError,
} from '../../../../lib/eva/stage-zero/profile-service.js';
import { applyAntiGoalScreen, screenPathOutput, ANTI_GOAL_MATCHERS } from '../../../../lib/eva/stage-zero/anti-goal-filter.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
const __dir = dirname(fileURLToPath(import.meta.url));
const libPath = (...p) => resolvePath(__dir, '../../../../lib/eva/stage-zero', ...p);

const PHASE1_POSTURE = {
  id: 'p1',
  phase_key: 'phase_1_process_proving',
  version: 1,
  posture_version: 'phase_1_process_proving@v1',
  criteria: {
    weights: { automation_feasibility: 1.0 },
    anti_goals: ['long sales cycles', 'content moats', 'app-store distribution surface', 'regulatory surface'],
  },
};

describe('CH-3: anti-goal auto-disqualify (real consumers, recorded reasons)', () => {
  const clean = { name: 'CleanBot', problem_statement: 'Automates invoice reminders', solution: 'Email agent', target_market: 'B2B SaaS startups' };

  test.each([
    ['app-store distribution surface', { name: 'AppThing', solution: 'An iOS app distributed via the App Store' }],
    ['regulatory surface', { name: 'MedThing', problem_statement: 'HIPAA compliance automation for clinics' }],
    ['long sales cycles', { name: 'EnterpriseThing', revenue_model: 'Six-figure contracts via enterprise procurement' }],
    ['content moats', { name: 'BlogThing', solution: 'Build an SEO content library as the moat' }],
  ])('disqualifies a %s candidate with the reason recorded', (goal, fields) => {
    const candidate = { ...clean, ...fields };
    const { eligible, disqualified } = applyAntiGoalScreen([candidate, clean], PHASE1_POSTURE);
    expect(disqualified).toHaveLength(1);
    expect(disqualified[0].anti_goal).toBe(goal);
    expect(disqualified[0].matched_field).toBeTruthy();
    expect(disqualified[0].matched_text).toBeTruthy();
    expect(disqualified[0].reason).toContain(goal);
    expect(eligible.map(c => c.name)).toEqual(['CleanBot']);
  });

  test('a declared native form-factor requirement trips the app-store anti-goal', () => {
    const candidate = { ...clean, name: 'NativeThing', required_capabilities: [{ name: 'native iOS shell', kind: 'form_factor' }] };
    const { disqualified } = applyAntiGoalScreen([candidate], PHASE1_POSTURE);
    expect(disqualified).toHaveLength(1);
    expect(disqualified[0].matched_field).toBe('required_capabilities');
  });

  test('postures without anti_goals screen nothing (Phase-2 shape)', () => {
    const phase2 = { criteria: { weights: {}, anti_goals: [] } };
    const risky = { ...clean, solution: 'iOS app with HIPAA compliance and an SEO content moat' };
    const { eligible, disqualified } = applyAntiGoalScreen([risky], phase2);
    expect(disqualified).toHaveLength(0);
    expect(eligible).toHaveLength(1);
  });

  test('screenPathOutput screens routed single-candidate outputs', () => {
    const out = { suggested_name: 'RegBot', suggested_problem: 'KYC compliance for fintechs', suggested_solution: 's', target_market: 'banks' };
    const d = screenPathOutput(out, PHASE1_POSTURE);
    expect(d).toMatchObject({ anti_goal: 'regulatory surface' });
    expect(screenPathOutput({ suggested_name: 'CleanBot', suggested_problem: 'p', suggested_solution: 's', target_market: 'SMBs' }, PHASE1_POSTURE)).toBeNull();
  });

  test('ALL-PATHS reach: production consumers exist on the router choke point AND discovery pre-ranking', () => {
    const router = readFileSync(libPath('path-router.js'), 'utf8');
    const discovery = readFileSync(libPath('paths', 'discovery-mode.js'), 'utf8');
    const orchestrator = readFileSync(libPath('stage-zero-orchestrator.js'), 'utf8');
    expect(router).toMatch(/screenPathOutput\(/);          // covers all 4 entry paths
    expect(discovery).toMatch(/applyAntiGoalScreen\(/);    // covers all 5 strategies pre-ranking
    expect(orchestrator).toMatch(/anti_goal_disqualification/); // synthesis skip consumer
    // every canonical Phase-1 anti-goal has a matcher
    for (const goal of PHASE1_POSTURE.criteria.anti_goals) {
      expect(Object.keys(ANTI_GOAL_MATCHERS).some(k => k.includes(goal) || goal.includes(k))).toBe(true);
    }
  });
});

describe('CH-2: one posture resolver — resolveProfile fails closed', () => {
  test('fallback factory is retired (grep-level)', () => {
    const src = readFileSync(libPath('profile-service.js'), 'utf8');
    expect(src).not.toMatch(/makeFallbackProfile\s*\(/);
    expect(src).not.toMatch(/source:\s*'fallback'/);
  });

  test('no active profile throws typed ProfileResolutionError', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'no rows' } }),
      })),
    };
    await expect(resolveProfile({ supabase, logger: silentLogger })).rejects.toBeInstanceOf(ProfileResolutionError);
  });
});

describe('CH-4: chairman-gated transitions with expiry evaluation', () => {
  function transitionSupabase({ ventures = [], target = { id: 'p2', phase_key: 'phase_2_success_weighted', version: 1, status: 'pre_declared' } } = {}) {
    const updates = [];
    return {
      _updates: updates,
      from: vi.fn((table) => {
        if (table === 'selection_postures') {
          return {
            select: vi.fn().mockReturnThis(),
            // resolveActivePosture path: .select(...).eq('status','active') → resolved
            eq: vi.fn((col, val) => {
              if (col === 'status') {
                return Promise.resolve({ data: [{ ...PHASE1_POSTURE, status: 'active', ratified_by: 'chairman', ratified_at: 't' }], error: null });
              }
              // target lookup: .eq('phase_key',..).eq('version',..).maybeSingle()
              return {
                eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: target, error: null }) })),
              };
            }),
            update: vi.fn((payload) => ({
              eq: vi.fn((c, id) => ({
                select: vi.fn(() => ({
                  single: vi.fn().mockImplementation(() => {
                    updates.push({ id, payload });
                    return Promise.resolve({ data: { id, ...payload }, error: null });
                  }),
                })),
              })),
            })),
          };
        }
        if (table === 'ventures') {
          return {
            select: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: ventures, error: null }),
          };
        }
        return {};
      }),
    };
  }

  test('machine writers are refused; missing ratification ref is refused', async () => {
    const supabase = transitionSupabase();
    await expect(transitionPosture({ toPhaseKey: 'phase_2_success_weighted', ratifiedBy: 'eva-scheduler', ratificationRef: 'x' }, { supabase, logger: silentLogger }))
      .rejects.toMatchObject({ name: 'PostureTransitionError', reason: 'machine_writer_refused' });
    await expect(transitionPosture({ toPhaseKey: 'phase_2_success_weighted', ratifiedBy: 'chairman', ratificationRef: '  ' }, { supabase, logger: silentLogger }))
      .rejects.toMatchObject({ reason: 'missing_ratification_ref' });
  });

  test('a valid chairman transition expires Phase-1 (expiry evaluation recorded) and activates the target', async () => {
    const supabase = transitionSupabase();
    const result = await transitionPosture(
      { toPhaseKey: 'phase_2_success_weighted', toVersion: 1, ratifiedBy: 'chairman', ratificationRef: 'chairman_decisions:abc-123' },
      { supabase, logger: silentLogger },
    );
    expect(result.expiry_evaluation).toMatchObject({ met: false });
    // update 1: expire the outgoing row with the recorded evaluation
    expect(supabase._updates[0].id).toBe('p1');
    expect(supabase._updates[0].payload.status).toBe('expired');
    expect(supabase._updates[0].payload.transition_condition).toContain('expiry_evaluation');
    // update 2: activate the ratified successor
    expect(supabase._updates[1].id).toBe('p2');
    expect(supabase._updates[1].payload).toMatchObject({ status: 'active', ratified_by: 'chairman', ratification_ref: 'chairman_decisions:abc-123' });
    expect(supabase._updates[1].payload.ratified_at).toBeTruthy();
  });

  test('evaluatePhase1Expiry: met when a venture passed stage 26; insufficient data never guesses met', async () => {
    const done = transitionSupabase({ ventures: [{ id: 'v9', name: 'Winner', current_lifecycle_stage: 27 }] });
    const evalDone = await evaluatePhase1Expiry({ supabase: done, logger: silentLogger });
    expect(evalDone.met).toBe(true);
    expect(evalDone.evidence).toContain('Winner');

    const evalNoClient = await evaluatePhase1Expiry({ logger: silentLogger });
    expect(evalNoClient.met).toBe(false);
    expect(evalNoClient.evidence).toContain('insufficient_data');
  });
});

describe('CH-9: single venture-creation writer (grep-level reach)', () => {
  test('persistVentureBrief carries the WIP gate; no other stage-zero module inserts ventures', () => {
    const review = readFileSync(libPath('chairman-review.js'), 'utf8');
    expect(review).toMatch(/WipLimitExceededError/);
    expect(review).toMatch(/stage0\.wip_limit/);
    // behavioral proofs live in chairman-review.test.js; this pins the reach claim
    for (const mod of ['paths/venture-reseeding.js', 'strategy-loader.js', 'synthesis/portfolio-evaluation.js']) {
      const src = readFileSync(libPath(...mod.split('/')), 'utf8');
      const ventureWrites = src.match(/from\(['"]ventures['"]\)[\s\S]{0,120}?\.(insert|upsert)\(/g) || [];
      expect(ventureWrites).toHaveLength(0);
    }
  });
});
