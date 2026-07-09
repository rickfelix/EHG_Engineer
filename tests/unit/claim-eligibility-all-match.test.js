/**
 * SD-ARCH-HOTSPOT-SD-START-001 FR-1 / TS-1 — all-match classifier variant.
 *
 * classifyAllDispatchIneligibility returns EVERY matching axis so consumers that
 * key on a SPECIFIC axis (sd-start's human-action gate: .includes('human_action_required'))
 * see it even when an earlier axis also matches — the exact gap that made sd-start
 * avoid the first-match classifier (its historical L168-175 rationale).
 * Both exports walk ONE axis table; this suite pins their consistency.
 *
 * @module tests/unit/claim-eligibility-all-match.test
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  classifyDispatchIneligibility,
  classifyAllDispatchIneligibility,
} = require('../../lib/fleet/claim-eligibility.cjs');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('classifyAllDispatchIneligibility (FR-1 / TS-1)', () => {
  it('returns ALL matching axes for a multi-fault SD, in precedence order', () => {
    const sd = {
      sd_key: 'SD-MULTI-001',
      sd_type: 'orchestrator', // axis 1
      status: 'deferred',      // sd_deferred axis
      metadata: {
        requires_human_action: true,                          // human_action_required
        not_before: '2126-01-01T00:00:00Z',                   // not_before_hold (far future)
        door_class_note: 'one_way',                           // one_way_door_requires_supervision
      },
    };
    const all = classifyAllDispatchIneligibility(sd);
    expect(all).toEqual([
      'orchestrator_parent',
      'human_action_required',
      'not_before_hold',
      'one_way_door_requires_supervision',
      'sd_deferred',
    ]);
    // First-match export returns exactly the head of the all-match list (one table).
    expect(classifyDispatchIneligibility(sd)).toBe(all[0]);
  });

  it('surfaces human_action_required even when an earlier axis also matches (the sd-start gate unlock)', () => {
    const heldOrchestrator = {
      sd_key: 'SD-HELD-ORCH-001',
      sd_type: 'orchestrator',
      status: 'draft',
      metadata: { requires_human_action: true },
    };
    // First-match hides the hold behind orchestrator_parent…
    expect(classifyDispatchIneligibility(heldOrchestrator)).toBe('orchestrator_parent');
    // …all-match still surfaces it, which is what the human-action gate keys on.
    expect(classifyAllDispatchIneligibility(heldOrchestrator)).toContain('human_action_required');
  });

  it('returns [] for a fully eligible SD and matches the first-match null', () => {
    const clean = { sd_key: 'SD-CLEAN-001', sd_type: 'feature', status: 'draft', metadata: {} };
    expect(classifyAllDispatchIneligibility(clean)).toEqual([]);
    expect(classifyDispatchIneligibility(clean)).toBeNull();
  });

  it('applies ctx-gated tier axes identically to the first-match form', () => {
    const tierGated = {
      sd_key: 'SD-TIER-001', sd_type: 'feature', status: 'draft',
      metadata: { min_tier_rank: 4 },
    };
    const ctx = { tiering_active: true, worker_tier_rank: 2 };
    expect(classifyAllDispatchIneligibility(tierGated, ctx)).toEqual(['above_worker_tier']);
    expect(classifyDispatchIneligibility(tierGated, ctx)).toBe('above_worker_tier');
    // ctx omitted => tier axis inert in both forms.
    expect(classifyAllDispatchIneligibility(tierGated)).toEqual([]);
  });

  it('WIRING PINS (D6 + FR-6/FR-2): sd-start keys its human-action gate on axes.includes, and both CLIs consume the shared lib/claim gates', () => {
    // Same static-pin style as tests/dispatch-eligibility-convergence.test.js (C):
    // cheap, deterministic proof the call sites exist — moving them requires
    // updating these pins in the same commit (TR-5).
    const sdStart = readFileSync(resolve(repoRoot, 'scripts/sd-start.js'), 'utf8');
    // D6: the SPECIFIC-axis check — .includes('human_action_required'), never length>0.
    expect(sdStart).toMatch(/classifyAllDispatchIneligibility\(sd \|\| \{\}\)/);
    expect(sdStart).toMatch(/axes\.includes\('human_action_required'\)/);
    expect(sdStart).not.toMatch(/axes\.length\s*>\s*0/);
    // FR-6: sd-start consumes the shared gate/queue modules.
    expect(sdStart).toMatch(/lib\/claim\/gates\/dependency-gate\.cjs/);
    expect(sdStart).toMatch(/lib\/claim\/gates\/handoff-integrity\.cjs/);
    expect(sdStart).toMatch(/lib\/claim\/gates\/cadence-gate\.cjs/);
    expect(sdStart).toMatch(/lib\/claim\/queue-resolver\.cjs/);
    // FR-2: worker-checkin consumes the converged dependency gate with fail-closed polarity.
    const checkin = readFileSync(resolve(repoRoot, 'scripts/worker-checkin.cjs'), 'utf8');
    expect(checkin).toMatch(/lib\/claim\/gates\/dependency-gate\.cjs/);
    expect(checkin).toMatch(/depsSatisfiedFromVerdict\(await evaluateClaimDependencyGate\(sb, d\)\)/);
  });

  it('every first-match verdict equals element 0 of the all-match list (property pin across axis inputs)', () => {
    const cases = [
      { sd_key: 'SD-TEST-CLONE-001', metadata: { test_clone_build_tree: true } },
      { sd_key: 'SD-LEO-FIX-REMEDIATION-X-001', target_application: 'EHG', metadata: {} },
      { sd_key: 'SD-CO-001', metadata: { co_author_pending: true } },
      { sd_key: 'SD-REVIEW-001', metadata: { needs_coordinator_review: true } },
      { sd_key: 'SD-DONE-001', status: 'completed', metadata: {} },
    ];
    for (const sd of cases) {
      const all = classifyAllDispatchIneligibility(sd);
      expect(all.length).toBeGreaterThan(0);
      expect(classifyDispatchIneligibility(sd)).toBe(all[0]);
    }
  });
});
