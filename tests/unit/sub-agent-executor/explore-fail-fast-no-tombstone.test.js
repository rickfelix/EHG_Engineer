/**
 * Refusing to run a built-in must leave NO evidence row.
 * SD-LEO-INFRA-EXPLORE-UNREGISTERED-LEO-001, FR-2 / TS-2 / TS-8.
 *
 * THE DEFECT THIS PINS. `execute-subagent --code EXPLORE` used to throw PGRST116 in the loader,
 * land in the executor's catch, and get an ERROR row written. That row became the newest for its
 * normalized code and ADVISORY-PASSED the LEAD-TO-PLAN evidence gate at score 100. So running the
 * broken CLI converted a block into a pass: a worker who never invoked it was hard-blocked, one who
 * invoked it and let it crash was let through. The crash was the key to the gate.
 *
 * WHY THE ASSERTION IS "NO ROW" AND NOT "IT THREW". A fail-fast placed only at the throw site would
 * have been caught by the SAME handler that writes the tombstone — the refusal would have changed
 * the error text and nothing else. So what must be proven is the ABSENCE OF A WRITE, at the level
 * of what reached the database client. Asserting the throw would be green against that no-op.
 *
 * WHY THERE IS A POSITIVE CONTROL. "No insert was captured" also passes when the harness never
 * reached the executor at all — a bad mock path, a changed arg shape, an import error. So the
 * identical harness is driven with a NON-built-in code whose load fails, and that one MUST capture
 * an ERROR insert. Without it this file would assert nothing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const EXPLORE_SD = 'SD-TEST-EXPLORE-FAIL-FAST';

/**
 * Permissive fake: every read resolves empty, every insert is captured. Deliberately loose about
 * which query arrives, because this test is about ONE fact — whether anything was written to
 * sub_agent_execution_results — and a strict mock would fail for unrelated reasons and be mistaken
 * for the behaviour under test.
 */
function makeMockSupabase(capture, { subAgentLookup } = {}) {
  const thenable = (result) => ({
    select() { return this; },
    eq() { return this; },
    is() { return this; },
    in() { return this; },
    gte() { return this; },
    lte() { return this; },
    order() { return this; },
    limit() { return Promise.resolve(result); },
    maybeSingle() { return Promise.resolve(result); },
    single() { return Promise.resolve(result); },
    then(res) { return Promise.resolve(result).then(res); }
  });

  return {
    from(table) {
      if (table === 'leo_sub_agents') {
        return thenable(subAgentLookup || { data: null, error: { message: 'no rows', code: 'PGRST116' } });
      }
      if (table === 'sub_agent_execution_results') {
        const base = thenable({ data: [], error: null });
        return {
          ...base,
          insert(record) {
            capture.inserts.push(record);
            return {
              select: () => ({ single: async () => ({ data: { id: 'mock-row', ...record }, error: null }) })
            };
          }
        };
      }
      return thenable({ data: [], error: null });
    },
    rpc: async () => ({ data: null, error: null })
  };
}

async function runExecutor(code, capture, opts) {
  vi.resetModules();
  vi.doMock('../../../lib/sub-agent-executor/supabase-client.js', () => ({
    getSupabaseClient: async () => makeMockSupabase(capture, opts),
    default: async () => makeMockSupabase(capture, opts)
  }));
  const { executeSubAgent } = await import('../../../lib/sub-agent-executor/executor.js');
  let threw = null;
  try {
    await executeSubAgent(code, EXPLORE_SD, {});
  } catch (e) {
    threw = e;
  }
  return threw;
}

describe('EXPLORE fail-fast writes no tombstone', () => {
  let capture;
  beforeEach(() => { capture = { inserts: [] }; });
  afterEach(() => { vi.resetModules(); vi.doUnmock('../../../lib/sub-agent-executor/supabase-client.js'); });

  it('writes NO row to sub_agent_execution_results', async () => {
    // THE assertion. Not "it threw" — the pre-fix code threw too, and wrote a row on the way out.
    const err = await runExecutor('EXPLORE', capture);
    expect(err, 'the refusal must still surface to the caller').toBeTruthy();
    expect(capture.inserts, 'a refusal wrote an evidence row — the tombstone path is still reachable').toEqual([]);
  });

  it('POSITIVE CONTROL: the identical harness DOES capture an ERROR insert for a non-built-in code', async () => {
    // Without this, the assertion above also passes when the harness never reached the executor
    // (wrong mock path, changed arg shape, import error) — the default failure mode of a
    // mock-based absence test. A code that is NOT in BUILTIN_AGENT_CODES fails its lookup, lands in
    // the same catch, and must write the tombstone that EXPLORE no longer writes.
    const err = await runExecutor('TESTING', capture);
    expect(err, 'the control must also throw, or it is not the same path').toBeTruthy();
    expect(capture.inserts.length, 'the control captured no insert — the harness never reached the writer, so the absence test above proves nothing').toBeGreaterThan(0);
    const verdicts = capture.inserts.map(r => r.verdict);
    expect(verdicts).toContain('ERROR');
  });

  it('carries the refusal sentinel, so the catch can tell "must not run" from "run failed"', async () => {
    const err = await runExecutor('EXPLORE', capture);
    expect(err.isBuiltinAgentRefusal).toBe(true);
  });

  it('the refusal message names both sanctioned routes rather than just refusing', async () => {
    // A refusal that does not say what to do instead is a dead end. This is the message a worker
    // sees at the moment they are blocked.
    const err = await runExecutor('EXPLORE', capture);
    expect(err.message).toMatch(/Task\(subagent_type="Explore"/);
    expect(err.message).toMatch(/record-explore-evidence\.js/);
  });

  it('refuses BEFORE the leo_sub_agents lookup — observed, not inferred from the message', async () => {
    // Placement matters: refusing AFTER the lookup would still reach the .single() whose PGRST116
    // produced the tombstone. Asserted by observing that the table was never queried, because a
    // string-match on the error text would survive a move of the guard.
    const queried = [];
    vi.resetModules();
    vi.doMock('../../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => {
        const inner = makeMockSupabase(capture);
        return { ...inner, from(table) { queried.push(table); return inner.from(table); } };
      }
    }));
    const { executeSubAgent } = await import('../../../lib/sub-agent-executor/executor.js');
    try { await executeSubAgent('EXPLORE', EXPLORE_SD, {}); } catch { /* expected */ }
    expect(queried, 'the built-in code reached the leo_sub_agents lookup').not.toContain('leo_sub_agents');
  });
});
