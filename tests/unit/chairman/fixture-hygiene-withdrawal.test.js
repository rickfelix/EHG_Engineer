/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-VALUE-001 FR-4 — planFixtureHygieneWithdrawal.
 * Pure planner, no DB. Mirrors the acceptance specimen: chairman_decisions row d87a7018
 * (decision_type='review', venture 8344c34b linked, venture.is_demo=true, live-verified 2026-09-07).
 */
import { describe, it, expect } from 'vitest';
import { planFixtureHygieneWithdrawal } from '../../../lib/chairman/fixture-hygiene-withdrawal.mjs';

const FIXTURE_VENTURE = { id: '8344c34b-e587-4382-96f4-c53a883cbcdc', is_demo: true };
const REAL_VENTURE = { id: 'real-venture-1', is_demo: false };
const REVIEW_ROW = { id: 'd87a7018-b442-4e90-8e93-ab244a76e9cc', status: 'pending', decision_type: 'review', venture_id: FIXTURE_VENTURE.id };
const OPTS = { decidedBy: 'test-actor', reason: 'known test fixture, removing from queue' };

describe('planFixtureHygieneWithdrawal — TR-3 structural distinctness', () => {
  it('the acceptance specimen (review row, fixture venture, pending) succeeds', () => {
    const plan = planFixtureHygieneWithdrawal(REVIEW_ROW, FIXTURE_VENTURE, OPTS);
    expect(plan).toBeTruthy();
    expect(plan.verdict).toBe('retire');
    expect(plan.table).toBe('chairman_decisions');
    expect(plan.patch).toEqual({ status: 'cancelled' });
    expect(plan.retirementBasis.disposition).toBe('fixture_hygiene_withdrawal');
    expect(plan.retirementBasis.decided_by).toBe('test-actor');
    expect(plan.retirementBasis.hygiene_reason).toBe(OPTS.reason);
  });

  it('refuses a row whose venture is NOT fixture-flagged — the guard that keeps this out of merits territory', () => {
    const row = { ...REVIEW_ROW, venture_id: REAL_VENTURE.id };
    expect(planFixtureHygieneWithdrawal(row, REAL_VENTURE, OPTS)).toBeNull();
  });

  it('refuses a row with no venture_id at all', () => {
    const row = { ...REVIEW_ROW, venture_id: null };
    expect(planFixtureHygieneWithdrawal(row, null, OPTS)).toBeNull();
  });

  it('refuses when venture lookup failed (null venture object) even if venture_id is set', () => {
    expect(planFixtureHygieneWithdrawal(REVIEW_ROW, null, OPTS)).toBeNull();
  });

  it('refuses a non-pending row — never touches an already-decided decision', () => {
    const row = { ...REVIEW_ROW, status: 'approved' };
    expect(planFixtureHygieneWithdrawal(row, FIXTURE_VENTURE, OPTS)).toBeNull();
  });

  it('refuses without decidedBy — an unattributed hygiene action is refused, never defaulted', () => {
    expect(planFixtureHygieneWithdrawal(REVIEW_ROW, FIXTURE_VENTURE, { reason: OPTS.reason })).toBeNull();
  });

  it('refuses without reason — an unjustified hygiene action is refused, never defaulted', () => {
    expect(planFixtureHygieneWithdrawal(REVIEW_ROW, FIXTURE_VENTURE, { decidedBy: OPTS.decidedBy })).toBeNull();
  });

  it('refuses a decision_type this module cannot route (arm6 / flag_enablement)', () => {
    const row = { ...REVIEW_ROW, decision_type: 'flag_enablement' };
    expect(planFixtureHygieneWithdrawal(row, FIXTURE_VENTURE, OPTS)).toBeNull();
  });

  it('refuses an unrecognised decision_type (armOf -> unknown)', () => {
    const row = { ...REVIEW_ROW, decision_type: 'session_question' };
    expect(planFixtureHygieneWithdrawal(row, FIXTURE_VENTURE, OPTS)).toBeNull();
  });

  it('never asserts an approve/reject/proceed/kill verb — patch is always {status: cancelled}, the honest terminal value', () => {
    const plan = planFixtureHygieneWithdrawal(REVIEW_ROW, FIXTURE_VENTURE, OPTS);
    expect(Object.values(plan.patch)).not.toContain('approve');
    expect(Object.values(plan.patch)).not.toContain('reject');
    expect(Object.values(plan.patch)).not.toContain('proceed');
    expect(Object.values(plan.patch)).not.toContain('kill');
  });

  it('chairman_approval (arm4, non-fixture-specific type) also routes correctly when its venture is fixture-flagged', () => {
    const row = { id: 'x', status: 'pending', decision_type: 'chairman_approval', venture_id: FIXTURE_VENTURE.id };
    const plan = planFixtureHygieneWithdrawal(row, FIXTURE_VENTURE, OPTS);
    expect(plan.verdict).toBe('retire');
    expect(plan.arm).toBe('arm4');
  });
});
