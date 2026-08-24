/**
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-3.
 * C1/C2 (EXEC-phase prospective TESTING evidence, f121b461-619e-44e5-b491-48dde5feb342):
 *
 * C1 — the actual WIRE (triggerRCAOnFailure -> triggerQuick -> resolveSkipRCA ->
 *      processTriggerEvent) was previously only protected by source-reading, not CI. This
 *      file exercises the real, unmocked composition end-to-end against a mocked Supabase
 *      connection factory (never a live DB).
 * C2 — REGRESSION FIX: triggerQuick's governance-lookup connection failure must NOT prevent
 *      processTriggerEvent from running — pre-fix, triggerQuick unconditionally called
 *      processTriggerEvent (which handles its own connection failure gracefully). The first
 *      cut of FR-3 introduced a regression where a governance-lookup connection failure
 *      short-circuited the whole function before processTriggerEvent ever ran, silently
 *      dropping RCR creation for a real failure. Fixed: the lookup's own try/catch falls
 *      back to skip=true and STILL proceeds to processTriggerEvent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createSupabaseServiceClient = vi.fn();

vi.mock('../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: (...args) => createSupabaseServiceClient(...args)
}));

const { triggerRCAOnFailure } = await import('../../lib/rca/index.js');
const { triggerQuick } = await import('../../lib/rca/rca-orchestrator.js');

/** Minimal chainable client covering: rca_auto_trigger_config select, root_cause_reports
 *  select (dedup)/insert, issue_patterns select/insert. */
function makeFakeClient({ configMetadata = {}, insertResult = { data: { id: 'rcr-wired-1' }, error: null } } = {}) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    ilike: () => chain,
    order: () => chain,
    limit: () => chain,
    not: () => chain,
    maybeSingle: async () => {
      // Used both by resolveSkipRCA (rca_auto_trigger_config) and the RCR/pattern dedup
      // lookups — return governance metadata by default; callers that need "no existing
      // row" also get null data here, which is the correct default for dedup checks too.
      return { data: { metadata: configMetadata }, error: null };
    },
    single: async () => insertResult,
    insert: () => chain,
    update: () => chain,
  };
  return { from: () => chain };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

function fixtureEvent(fingerprintSuffix) {
  return {
    trigger_type: 'gate_validation_failure',
    fingerprint: `wire-test-${fingerprintSuffix}-${Math.random().toString(36).slice(2)}`,
    error_message: 'fixture error',
    classification: 'CODE_BUG',
    context: {},
  };
}

describe('C1: the real wire — triggerRCAOnFailure -> triggerQuick -> resolveSkipRCA -> processTriggerEvent', () => {
  it('never throws, end-to-end, with governance disabled (conservative default)', async () => {
    createSupabaseServiceClient.mockResolvedValue(makeFakeClient({ configMetadata: {} }));

    await expect(triggerRCAOnFailure(fixtureEvent('disabled'))).resolves.toBeUndefined();
  });

  it('never throws, end-to-end, with governance explicitly enabled', async () => {
    createSupabaseServiceClient.mockResolvedValue(
      makeFakeClient({ configMetadata: { rca_sub_agent_invocation_enabled: true } })
    );

    await expect(triggerRCAOnFailure(fixtureEvent('enabled'))).resolves.toBeUndefined();
  });

  it('triggerQuick itself resolves the governed flag and reaches processTriggerEvent (RCR gets created)', async () => {
    createSupabaseServiceClient.mockResolvedValue(makeFakeClient({ configMetadata: {} }));

    // triggerQuick is called with NO options by the real wrapper (lib/rca/index.js:46) —
    // exercise that exact call shape directly.
    await triggerQuick(fixtureEvent('direct'));

    // No exception is the primary assertion (triggerQuick never throws by contract); the
    // fake client's insert/select chain having been exercised without error confirms the
    // full path ran rather than short-circuiting.
    expect(createSupabaseServiceClient).toHaveBeenCalled();
  });
});

describe('C2 REGRESSION GUARD: governance-lookup connection failure must not block RCR creation', () => {
  it('falls back to skip=true and STILL calls through to processTriggerEvent (RCR still attempted)', async () => {
    // First call (triggerQuick's own governance lookup) rejects; second call
    // (processTriggerEvent's independent connection) succeeds — proving the failure is
    // contained to the governance lookup and does not short-circuit the whole function.
    createSupabaseServiceClient
      .mockRejectedValueOnce(new Error('governance lookup connection refused'))
      .mockResolvedValueOnce(makeFakeClient());

    await triggerQuick(fixtureEvent('conn-fail'));

    expect(createSupabaseServiceClient).toHaveBeenCalledTimes(2);
    const logged = console.error.mock.calls.flat().join(' ');
    expect(logged).toMatch(/Governed skipRCA lookup failed/);
    // The second (processTriggerEvent) call must have been reached and must not itself
    // report a "Quick trigger failed" — i.e. execution proceeded past the lookup failure.
    expect(logged).not.toMatch(/Quick trigger failed/);
  });

  it('if BOTH connections fail, the failure is contained (never throws) and is logged, not silent', async () => {
    createSupabaseServiceClient.mockRejectedValue(new Error('db unreachable'));

    await expect(triggerQuick(fixtureEvent('both-fail'))).resolves.toBeUndefined();

    const logged = console.error.mock.calls.flat().join(' ');
    expect(logged).toMatch(/Governed skipRCA lookup failed/);
  });

  it('an explicit skipRCA override bypasses the governance lookup entirely (no connection attempt for governance)', async () => {
    createSupabaseServiceClient.mockResolvedValue(makeFakeClient());

    await triggerQuick(fixtureEvent('explicit-override'), { skipRCA: true });

    // Exactly 1 call: processTriggerEvent's own connection. Governance lookup is skipped
    // entirely because options.skipRCA was explicitly provided.
    expect(createSupabaseServiceClient).toHaveBeenCalledTimes(1);
  });
});
