/**
 * QF-20260726-175 — triggerRCA must NEVER reject.
 *
 * THE OUTAGE THIS PINS: on 2026-07-26 an RLS denial (code 42501) on the diagnostic insert into
 * root_cause_reports threw out of triggerRCA. All six call sites are `await triggerRCA(...)`
 * inside Supabase realtime subscription callbacks, so the throw became an unhandled rejection and
 * Node's default --unhandled-rejections=throw terminated the whole API process for 1h45m. Port
 * 8080 stayed up, so the app looked alive while the control plane was gone.
 *
 * These tests exercise the REAL exported triggerRCA. The pre-existing suite in
 * rca-runtime-triggers.test.js declares its own local createRCR copy, which cannot catch a
 * regression in the shipped function — that is the trap this file deliberately avoids.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';

const createSupabaseClient = vi.fn();
vi.mock('../../lib/supabase-client.js', () => ({ createSupabaseClient: () => createSupabaseClient() }));
// The RCA sub-agent is irrelevant here and must not reach the network on the happy path.
vi.mock('../../lib/sub-agents/rca.js', () => ({ execute: vi.fn(async () => ({ ok: true })) }));

const { triggerRCA } = await import('../../lib/rca-runtime-triggers.js');

/** Minimal chain stub: .from().select().eq().maybeSingle() for dedup, .insert().select().single() for create. */
function clientWithInsertResult(insertResult) {
  // NB: `.in()` is required — the dedup query is
  // .select(...).eq('failure_signature', ...).in('status', ['OPEN','IN_REVIEW']).maybeSingle().
  // Omitting it made every call throw "….in is not a function", which the fail-soft wrapper duly
  // caught — so the tests failed for a scaffolding reason while LOOKING like a code failure.
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => insertResult,
    insert: () => chain,
    update: () => chain,
  };
  return { from: () => chain };
}

const PARAMS = {
  scope_type: 'RUNTIME',
  trigger_source: 'RUNTIME',
  trigger_tier: 1,
  failure_signature: 'rls-denial-fixture',
  problem_statement: 'fixture',
  observed: {},
  expected: {},
  evidence_refs: {},
  impact_level: 'CRITICAL',
  likelihood_level: 'RARE',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('triggerRCA fail-soft (QF-20260726-175)', () => {
  test('THE REGRESSION GUARD: an RLS denial resolves to null instead of rejecting', async () => {
    // The exact shape from the crash log: .../engineer-20260726-185743.log
    //   Failed to create RCR: { code: '42501', message: 'new row violates row-level security policy...' }
    // The OLD implementation threw here, which killed the process. If the throw is restored, this
    // test fails — it is the falsifiable half.
    createSupabaseClient.mockReturnValue(clientWithInsertResult({
      data: null,
      error: { code: '42501', message: 'new row violates row-level security policy for table "root_cause_reports"' },
    }));

    await expect(triggerRCA(PARAMS)).resolves.toBeNull();
  });

  test('the failure is LOUD — a dropped RCR is still a real loss of diagnostic coverage', async () => {
    // Fail-soft must not mean fail-silent: the QF is explicit that silently losing RCRs is the
    // same class of invisible failure as the crash itself.
    createSupabaseClient.mockReturnValue(clientWithInsertResult({
      data: null,
      error: { code: '42501', message: 'denied' },
    }));

    await triggerRCA(PARAMS);

    const logged = console.error.mock.calls.flat().join(' ');
    expect(logged).toMatch(/RCR NOT RECORDED/);
    expect(logged).toContain('42501');
    expect(logged).toContain('rls-denial-fixture');
  });

  test('a thrown (non-Supabase-error) failure is also contained', async () => {
    // Covers the class, not just the one error shape — e.g. the client itself blowing up.
    createSupabaseClient.mockImplementation(() => { throw new Error('client exploded'); });

    await expect(triggerRCA(PARAMS)).resolves.toBeNull();
    expect(console.error.mock.calls.flat().join(' ')).toContain('client exploded');
  });

  test('CONTROL: a successful write still returns the RCR id and is not swallowed', async () => {
    // Proves the tests above pass because failures are contained, NOT because triggerRCA has
    // stopped doing its job and returns null unconditionally.
    createSupabaseClient.mockReturnValue(clientWithInsertResult({
      data: { id: 'rcr-abc-123' },
      error: null,
    }));

    await expect(triggerRCA(PARAMS)).resolves.toBe('rcr-abc-123');
  });
});
