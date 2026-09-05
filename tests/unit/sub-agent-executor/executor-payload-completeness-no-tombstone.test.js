/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H (SECURITY sub-agent, EXEC, finding S2).
 *
 * THE DEFECT THIS PINS. storeSubAgentResults' FR-2 payload-completeness readback can throw
 * AFTER the write already committed successfully (the readback only runs post-insert/update,
 * and a field/key-drop error means the row WAS found — see results-storage.js's own comment).
 * Before this fix, that throw propagated into executor.js's catch block, which unconditionally
 * called storeSubAgentResults AGAIN with a content-free errorResult. Because sd_id+code+phase
 * match within the 5-minute dedup window, that second call takes the UPDATE branch and
 * overwrites the row JUST WRITTEN — the control meant to catch dropped content instead
 * destroying content that mostly survived over one field that didn't.
 *
 * THE FIX. storeSubAgentResults tags a payload-completeness throw with
 * `isPayloadCompletenessFailure = true` (mirroring the pre-existing `isBuiltinAgentRefusal`
 * sentinel pattern), and executor.js checks it BEFORE the errorResult fallback store, same as
 * the refusal check one branch above it.
 *
 * WHY storeSubAgentResults IS MOCKED HERE rather than driven for real (unlike the sibling
 * executor-failure-discrimination.test.js suite): the completeness check's HARD branch requires
 * verifyReadback to find the row it just wrote, which needs a real network round trip this
 * mocked-Supabase-client harness cannot provide (see results-storage-payload-completeness-
 * readback.test.js for that behavior in isolation, already covered there). This file isolates
 * ONLY the executor.js branching decision: given a thrown error carrying the sentinel, is the
 * fallback store skipped?
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUB_AGENTS_DIR = join(__dirname, '../../../lib/sub-agents');
const TEST_SD = 'SD-TEST-EXECUTOR-PAYLOAD-COMPLETENESS';
const CODE = '__TEST_PAYLOAD_COMPLETENESS__';
const FIXTURE_PATH = join(SUB_AGENTS_DIR, `${CODE.toLowerCase()}.js`);

function makeMockSupabase() {
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
    then(res) { return Promise.resolve(result).then(res); },
  });
  return {
    from(table) {
      if (table === 'leo_sub_agents') {
        return thenable({ data: { code: CODE, name: CODE, description: 'test fixture', priority: 50, metadata: {}, capabilities: [] }, error: null });
      }
      return thenable({ data: [], error: null });
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

describe('executor.js skips the errorResult fallback store on a payload-completeness failure', () => {
  beforeEach(() => {
    writeFileSync(FIXTURE_PATH, 'export async function execute() { return { verdict: "PASS", confidence: 90, summary: "ok" }; }\n', 'utf8');
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../lib/sub-agent-executor/supabase-client.js');
    vi.doUnmock('../../../lib/sub-agent-executor/results-storage.js');
    if (existsSync(FIXTURE_PATH)) unlinkSync(FIXTURE_PATH);
  });

  it('re-throws WITHOUT a second storeSubAgentResults call when the first call throws with isPayloadCompletenessFailure', async () => {
    const storeSubAgentResults = vi.fn().mockImplementation(async () => {
      const err = new Error('verifyReadback: field "warnings" was non-empty when sent and empty on readback');
      err.isPayloadCompletenessFailure = true;
      throw err;
    });
    vi.resetModules();
    vi.doMock('../../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(),
      default: async () => makeMockSupabase(),
    }));
    vi.doMock('../../../lib/sub-agent-executor/results-storage.js', () => ({
      storeSubAgentResults,
      storeValidationResults: vi.fn(),
    }));

    const { executeSubAgent } = await import('../../../lib/sub-agent-executor/executor.js');
    let thrown = null;
    try {
      await executeSubAgent(CODE, TEST_SD, {});
    } catch (e) {
      thrown = e;
    }

    expect(thrown, 'the payload-completeness failure must still surface to the caller').toBeTruthy();
    expect(thrown.isPayloadCompletenessFailure).toBe(true);
    // THE assertion: exactly one call, not two. A second call is the overwrite this fix prevents.
    expect(storeSubAgentResults).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a genuine (non-sentinel) error from the first call DOES still trigger the errorResult fallback store', async () => {
    // Without this, the test above also passes if executor.js were changed to NEVER call the
    // fallback store at all — a different, worse regression (losing every genuine crash report).
    const storeSubAgentResults = vi.fn().mockImplementation(async () => {
      throw new Error('some other, unrelated storage failure');
    });
    vi.resetModules();
    vi.doMock('../../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(),
      default: async () => makeMockSupabase(),
    }));
    vi.doMock('../../../lib/sub-agent-executor/results-storage.js', () => ({
      storeSubAgentResults,
      storeValidationResults: vi.fn(),
    }));

    const { executeSubAgent } = await import('../../../lib/sub-agent-executor/executor.js');
    let thrown = null;
    try {
      await executeSubAgent(CODE, TEST_SD, {});
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeTruthy();
    expect(thrown.isPayloadCompletenessFailure).toBeFalsy();
    // The fallback store IS attempted for a genuine, non-sentinel failure -- second call.
    expect(storeSubAgentResults).toHaveBeenCalledTimes(2);
  });
});
