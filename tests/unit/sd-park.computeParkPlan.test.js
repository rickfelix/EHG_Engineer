/**
 * Pure-logic unit tests for lib/sd-park.js computeParkPlan().
 *
 * No DB: exercises the terminal-status guard, the non-EXEC actor guard, the
 * reason guard, and the progress>=100 EXEC/PLAN edge detection + metadata patch
 * that auto_transition_status would otherwise flip to 'pending_approval'.
 *
 * SD-LEO-INFRA-PARKED-STATUS-REPLACE-001 — covers the pure portion of TS-3 and TS-6.
 */
import { describe, it, expect } from 'vitest';
import { computeParkPlan, PARK_STATUS } from '../../lib/sd-park.js';

const NOW = '2026-06-05T00:00:00.000Z';

describe('computeParkPlan — guards', () => {
  it('PARK_STATUS is the existing deferred enum (no new status value)', () => {
    expect(PARK_STATUS).toBe('deferred');
  });

  it('throws when no reason is provided', () => {
    expect(() => computeParkPlan(
      { sd_key: 'SD-X', status: 'active', current_phase: 'EXEC', progress: 50 },
      '', 'PLAN', NOW,
    )).toThrow(/reason/i);
  });

  it('throws when actor is EXEC (non-EXEC actor guard — TS-6)', () => {
    expect(() => computeParkPlan(
      { sd_key: 'SD-X', status: 'active', current_phase: 'EXEC', progress: 50 },
      'parking it', 'EXEC', NOW,
    )).toThrow(/non-EXEC actor/i);
  });

  it('throws when actor is empty/undefined (treated like EXEC)', () => {
    expect(() => computeParkPlan(
      { sd_key: 'SD-X', status: 'active', current_phase: 'EXEC', progress: 50 },
      'parking it', undefined, NOW,
    )).toThrow(/non-EXEC actor/i);
  });

  it('throws when SD is in a terminal status (completed)', () => {
    expect(() => computeParkPlan(
      { sd_key: 'SD-X', status: 'completed', current_phase: 'EXEC', progress: 100 },
      'parking it', 'PLAN', NOW,
    )).toThrow(/terminal status/i);
  });

  it('throws when SD is in a terminal status (cancelled)', () => {
    expect(() => computeParkPlan(
      { sd_key: 'SD-X', status: 'cancelled', current_phase: 'LEAD', progress: 0 },
      'parking it', 'LEAD', NOW,
    )).toThrow(/terminal status/i);
  });
});

describe('computeParkPlan — edge detection + metadata patch', () => {
  it('flags edge=true and records original progress when progress>=100 in EXEC (TS-3)', () => {
    const plan = computeParkPlan(
      { sd_key: 'SD-X', status: 'in_progress', current_phase: 'EXEC', progress: 100 },
      'set aside', 'PLAN', NOW,
    );
    expect(plan.edge).toBe(true);
    expect(plan.parkMetaPatch.parked_progress_original).toBe(100);
    expect(plan.parkMetaPatch.parked_from_status).toBe('in_progress');
    expect(plan.parkMetaPatch.park_reason).toBe('set aside');
    expect(plan.parkMetaPatch.parked_by).toBe('PLAN');
    expect(plan.parkMetaPatch.parked_at).toBe(NOW);
  });

  it('flags edge=true when progress>=100 in PLAN', () => {
    const plan = computeParkPlan(
      { sd_key: 'SD-X', status: 'in_progress', current_phase: 'PLAN', progress: 100 },
      'set aside', 'LEAD', NOW,
    );
    expect(plan.edge).toBe(true);
    expect(plan.parkMetaPatch.parked_progress_original).toBe(100);
  });

  it('edge=false (no normalization) when progress<100 even in EXEC', () => {
    const plan = computeParkPlan(
      { sd_key: 'SD-X', status: 'in_progress', current_phase: 'EXEC', progress: 99 },
      'set aside', 'PLAN', NOW,
    );
    expect(plan.edge).toBe(false);
    expect(plan.parkMetaPatch.parked_progress_original).toBeNull();
  });

  it('edge=false when progress>=100 but phase is LEAD (auto_transition only triggers in EXEC/PLAN)', () => {
    const plan = computeParkPlan(
      { sd_key: 'SD-X', status: 'active', current_phase: 'LEAD', progress: 100 },
      'set aside', 'LEAD', NOW,
    );
    expect(plan.edge).toBe(false);
    expect(plan.parkMetaPatch.parked_progress_original).toBeNull();
  });
});
