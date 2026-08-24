/**
 * SD-LEO-INFRA-EXECUTOR-120S-1800S-001, FR-1/FR-2/FR-5.
 *
 * executor.js's catch block used to be a bare `catch {` that discarded the real exception and
 * unconditionally labeled EVERY failure -- timeout, a genuine thrown error, or an actually-missing
 * module -- identically as verdict=MANUAL_REQUIRED with a hardcoded "No module found" recommendations
 * text, metadata.error/stack never populated. This file proves the fix discriminates the 4 real
 * cases (timeout, genuine error, missing module, transitively-missing dependency inside an existing
 * module) via metadata.failure_cause, WITHOUT changing the gate-facing verdict (FR-3 -- routing
 * through verdict='ERROR' would silently convert an advisory soft-warning into an unconditional
 * fleet-wide hard block on required handoffs, per LEAD-phase VALIDATION's measured finding).
 *
 * REAL, UNMOCKED fs/path resolution (TESTING finding G3 / verification requirement): a naive
 * fs.existsSync() against the raw relative module specifier resolves against process.cwd() and is
 * confirmed wrong from every measured cwd -- it would invert this fix, labeling every real failure
 * 'missing_module'. Mocking fs here would hide exactly that trap. So these tests write REAL,
 * throwaway fixture module files to lib/sub-agents/ (cleaned up in afterEach) rather than mocking
 * the dynamic import's target.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUB_AGENTS_DIR = join(__dirname, '../../../lib/sub-agents');
const TEST_SD = 'SD-TEST-EXECUTOR-DISCRIMINATION';

const FIXTURE_FILES = [];
function writeFixture(code, source) {
  const filePath = join(SUB_AGENTS_DIR, `${code.toLowerCase()}.js`);
  writeFileSync(filePath, source, 'utf8');
  FIXTURE_FILES.push(filePath);
  return filePath;
}

/** Generic permissive mock: leo_sub_agents returns a valid row for our test code, everything
 * else resolves empty. Modeled on explore-fail-fast-no-tombstone.test.js's makeMockSupabase. */
function makeMockSupabase(capture, code) {
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
        return thenable({
          data: { code, name: code, description: 'test fixture', priority: 50, metadata: {}, capabilities: [] },
          error: null
        });
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

async function runExecutor(code, capture, options = {}) {
  vi.resetModules();
  vi.doMock('../../../lib/sub-agent-executor/supabase-client.js', () => ({
    getSupabaseClient: async () => makeMockSupabase(capture, code),
    default: async () => makeMockSupabase(capture, code)
  }));
  const { executeSubAgent } = await import('../../../lib/sub-agent-executor/executor.js');
  return executeSubAgent(code, TEST_SD, options);
}

describe('executor.js failure-cause discrimination (FR-1/FR-2/FR-3)', () => {
  let capture;

  beforeEach(() => { capture = { inserts: [] }; });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../lib/sub-agent-executor/supabase-client.js');
    for (const f of FIXTURE_FILES.splice(0)) {
      if (existsSync(f)) unlinkSync(f);
    }
  });

  it('TS-1: a timeout is labeled failure_cause=timeout via the named sentinel, verdict unchanged', async () => {
    const code = '__TEST_FR1_TIMEOUT__';
    writeFixture(code, 'export async function execute() { return new Promise(() => {}); }\n');

    await runExecutor(code, capture, { timeout: 30 });

    expect(capture.inserts.length).toBe(1);
    const row = capture.inserts[0];
    expect(row.verdict, 'FR-3: verdict must stay MANUAL_REQUIRED, not flip to ERROR').toBe('MANUAL_REQUIRED');
    expect(row.metadata.failure_cause).toBe('timeout');
    expect(row.metadata.error, 'the real timeout message must be captured, not discarded').toBeTruthy();
    expect(row.metadata.error).toMatch(/timed out/i);
  });

  it('TS-2: a genuine thrown Error is labeled failure_cause=genuine_error with real message/stack captured', async () => {
    const code = '__TEST_FR1_GENUINE_ERROR__';
    writeFixture(code, 'export async function execute() { throw new Error(\'distinctive genuine failure xyz123\'); }\n');

    await runExecutor(code, capture);

    expect(capture.inserts.length).toBe(1);
    const row = capture.inserts[0];
    expect(row.verdict).toBe('MANUAL_REQUIRED');
    expect(row.metadata.failure_cause).toBe('genuine_error');
    expect(row.metadata.error).toContain('distinctive genuine failure xyz123');
    expect(row.metadata.stack, 'the real stack trace must be captured').toBeTruthy();
    expect(row.recommendations.join(' '), 'must NOT carry the old hardcoded missing-module text for a genuine error').not.toMatch(/Create lib\/sub-agents/);
  });

  it('TS-3: a code with no module file at all is labeled failure_cause=missing_module, cwd-independent', async () => {
    const code = '__TEST_FR1_NONEXISTENT__';
    // Deliberately NOT writing a fixture -- proves the REAL, unmocked fs check.
    expect(existsSync(join(SUB_AGENTS_DIR, `${code.toLowerCase()}.js`))).toBe(false);

    const originalCwd = process.cwd();
    try {
      await runExecutor(code, capture);
      expect(capture.inserts.length).toBe(1);
      let row = capture.inserts[0];
      expect(row.verdict).toBe('MANUAL_REQUIRED');
      expect(row.metadata.failure_cause).toBe('missing_module');
      expect(row.recommendations.join(' ')).toMatch(/Create lib\/sub-agents/);

      // Re-run from a different cwd -- the naive (wrong) implementation resolves against
      // process.cwd() and would give a DIFFERENT (also-false) answer from here; the correct
      // implementation resolves relative to executor.js's own URL and is cwd-independent.
      capture.inserts.length = 0;
      process.chdir(dirname(SUB_AGENTS_DIR));
      await runExecutor(code, capture);
      expect(capture.inserts.length).toBe(1);
      row = capture.inserts[0];
      expect(row.metadata.failure_cause, 'result must be identical from a different cwd').toBe('missing_module');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('TS-4: a transitively-missing dependency inside an EXISTING module is genuine_error, never missing_module', async () => {
    const code = '__TEST_FR1_TRANSITIVE__';
    // The module file itself EXISTS and is valid; its execute() imports a file that does not
    // exist, throwing a REAL ERR_MODULE_NOT_FOUND -- the identical error code a genuinely-missing
    // top-level module would throw. Only the fs.existsSync() check on the TOP-LEVEL module path
    // (which is true here) can tell these apart.
    writeFixture(code, 'export async function execute() { await import(\'./__test_fr1_transitive_missing_dep__.js\'); }\n');
    expect(existsSync(join(SUB_AGENTS_DIR, '__test_fr1_transitive_missing_dep__.js'))).toBe(false);

    await runExecutor(code, capture);

    expect(capture.inserts.length).toBe(1);
    const row = capture.inserts[0];
    expect(row.verdict).toBe('MANUAL_REQUIRED');
    expect(row.metadata.failure_cause, 'a transitively-missing dependency must NOT be mislabeled as the top-level module being missing').toBe('genuine_error');
    expect(row.metadata.error).toMatch(/Cannot find module|ERR_MODULE_NOT_FOUND/i);
  });

  it('TS-5: the race timer is cleared on the fast path (no leaked pending timer)', async () => {
    const code = '__TEST_FR1_FAST__';
    writeFixture(code, 'export async function execute() { return { verdict: \'PASS\', confidence: 90, message: \'ok\' }; }\n');

    // Surgical, not a global timer count -- the executor's own pipeline (hallucination
    // detection etc.) creates and clears unrelated timers of its own, which would make a
    // before/after global count noisy. Instead, identify the SPECIFIC 60s race timer by its
    // delay argument and prove clearTimeout was called with that exact handle.
    const realSetTimeout = global.setTimeout;
    const realClearTimeout = global.clearTimeout;
    const raceHandles = [];
    const clearedHandles = new Set();
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout').mockImplementation((fn, ms, ...rest) => {
      const handle = realSetTimeout(fn, ms, ...rest);
      if (ms === 60000) raceHandles.push(handle);
      return handle;
    });
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout').mockImplementation((handle) => {
      clearedHandles.add(handle);
      return realClearTimeout(handle);
    });

    try {
      await runExecutor(code, capture, { timeout: 60000 });
      expect(capture.inserts.length).toBe(1);
      expect(capture.inserts[0].verdict).toBe('PASS');
      expect(raceHandles.length, 'the 60s race timer was never even created').toBe(1);
      expect(clearedHandles.has(raceHandles[0]), 'the 60s race timeout handle was never cleared -- it will fire naturally in prod').toBe(true);
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    }
  });
});
