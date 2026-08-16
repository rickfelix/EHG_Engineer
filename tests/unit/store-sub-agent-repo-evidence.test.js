/**
 * QF-20260702-679 — scripts/store-sub-agent-repo-evidence.js is the new safe, heredoc-free
 * write path for Task-tool-invoked sub-agents. This exercises `main()` end-to-end (content
 * loaded from a real temp file, matching --content @<path> usage, never inline shell JSON)
 * against the same stubbed-network-only supabase pattern as the other results-storage tests.
 *
 * SD-LEO-INFRA-EVIDENCE-WRITER-VERDICT-FAIL-LOUD-001: adds coverage for the verdictMisuseMessage
 * guard -- main() now fails loud (stderr token + process.exitCode=1) when the stored row lands
 * verdict='ERROR' from an absent/unrecognised input verdict, without false-flagging a genuine
 * verdict='ERROR' crash report.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VERDICT_VALUES } from '../../lib/sub-agents/verdict-chain.js';

// FR-5/TR-3: save/restore process.exitCode around EVERY test in this file so a guard-fire in
// one test can never leak into the real test-runner exit code (or into a later test).
let savedExitCode;
beforeEach(() => { savedExitCode = process.exitCode; });
afterEach(() => { process.exitCode = savedExitCode; });

function makeMockSupabase(captureTarget, opts = {}) {
  return {
    from(table) {
      return {
        select() { return this; },
        eq(col, val) {
          if (table === 'strategic_directives_v2' && col === 'id') captureTarget.sdLookupId = val;
          return this;
        },
        gte() { return this; },
        order() { return this; },
        limit() { return Promise.resolve({ data: [], error: null }); },
        maybeSingle() {
          if (table === 'strategic_directives_v2') {
            return Promise.resolve({ data: { target_application: 'EHG_Engineer' }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(record) {
          captureTarget.insertedTable = table;
          captureTarget.inserted = record;
          if (opts.forceTimeoutError) {
            return {
              select() {
                return { single: async () => ({ data: null, error: { message: 'canceling statement due to statement timeout' } }) };
              },
            };
          }
          const inserted = { id: 'mock-row-id', ...record };
          return {
            select() {
              return { single: async () => ({ data: inserted, error: null }) };
            },
          };
        },
      };
    },
  };
}

// TS-1 through TS-4, TS-14, TS-15: pure predicate, zero Supabase mocking. Own describe block,
// dynamic import scoped to beforeAll/afterAll -- NOT a top-level static import: statically
// importing store-sub-agent-repo-evidence.js at file-parse time resolves its live
// getSupabaseClient dependency BEFORE any vi.doMock() call can intercept it, poisoning the
// module cache for the first main()-integration test below (measured: a real network attempt
// via UNIT_TIER_NETWORK_REFUSED). afterAll's vi.resetModules() clears that cache before the
// main()-integration describe's own doMock/import cycle runs (PLAN-phase testing-agent guidance
// on isolation, refined during EXEC after reproducing the exact failure).
describe('verdictMisuseMessage() (pure predicate)', () => {
  let verdictMisuseMessage, LIKELY_VERDICT_FIELDS;

  beforeAll(async () => {
    const mod = await import('../../scripts/store-sub-agent-repo-evidence.js');
    verdictMisuseMessage = mod.verdictMisuseMessage;
    LIKELY_VERDICT_FIELDS = mod.LIKELY_VERDICT_FIELDS;
  });

  afterAll(() => {
    vi.resetModules();
  });

  it('TS-1: does not fire for any VERDICT_VALUES member, storedVerdict paired to the measured-consistent value', () => {
    for (const v of VERDICT_VALUES) {
      expect(verdictMisuseMessage({ verdict: v }, v, false)).toBeNull();
      expect(verdictMisuseMessage({ verdict: v.toLowerCase() }, v, false)).toBeNull();
      expect(verdictMisuseMessage({ verdict: `  ${v}  ` }, v, false)).toBeNull();
    }
  });

  it('TS-2: fires for undefined/null/empty/whitespace-only input verdict (storedVerdict=ERROR, the only value these can measurably produce)', () => {
    expect(verdictMisuseMessage({}, 'ERROR', false)).toMatch(/\[VERDICT_UNRECOGNISED\]/);
    expect(verdictMisuseMessage({ verdict: undefined }, 'ERROR', false)).toMatch(/\[VERDICT_UNRECOGNISED\]/);
    expect(verdictMisuseMessage({ verdict: null }, 'ERROR', false)).toMatch(/\[VERDICT_UNRECOGNISED\]/);
    expect(verdictMisuseMessage({ verdict: '' }, 'ERROR', false)).toMatch(/\[VERDICT_UNRECOGNISED\]/);
    expect(verdictMisuseMessage({ verdict: '   ' }, 'ERROR', false)).toMatch(/\[VERDICT_UNRECOGNISED\]/);
  });

  it('TS-4: fires for genuine garbage and non-string types (storedVerdict=ERROR), never throws', () => {
    expect(verdictMisuseMessage({ verdict: 'HIGH' }, 'ERROR', false)).toMatch(/\[VERDICT_UNRECOGNISED\]/);
    expect(verdictMisuseMessage({ verdict: 'a prose findings dump, not a verdict' }, 'ERROR', false)).toMatch(/\[VERDICT_UNRECOGNISED\]/);
    for (const bad of [0, false, {}]) {
      expect(() => verdictMisuseMessage({ verdict: bad }, 'ERROR', false)).not.toThrow();
      expect(verdictMisuseMessage({ verdict: bad }, 'ERROR', false)).toMatch(/\[VERDICT_UNRECOGNISED\]/);
    }
  });

  it('TS-3/TS-11 pointer: does NOT independently classify prefix-family tokens -- that is main()\'s real-chain job, not this predicate\'s', () => {
    // Given the (unreachable-in-production) pair storedVerdict='ERROR' + a prefix-family token,
    // the predicate correctly fires -- it never re-derives mapVerdict's classification (TR-1/TR-4).
    // The claim "CONCERNS/BLOCK/UNKNOWN never cause a real guard fire" is proven at the main()
    // integration level only, because main()'s real chain never actually produces
    // storedVerdict='ERROR' for those inputs -- see TS-11 below.
    expect(verdictMisuseMessage({ verdict: 'CONCERNS' }, 'ERROR', false)).toMatch(/\[VERDICT_UNRECOGNISED\]/);
  });

  it('TS-14: array-order precedence -- first present field wins, not object key order', () => {
    const msg = verdictMisuseMessage({ overall_status: 'PASS', status: 'PASS' }, 'ERROR', false);
    expect(msg).toContain('"status"');
    expect(msg).not.toContain('"overall_status"');
  });

  it('TS-15: an empty-string candidate field does not count as present -- scan continues', () => {
    const msg = verdictMisuseMessage({ status: '', overall_status: 'PASS' }, 'ERROR', false);
    expect(msg).not.toContain('"status"');
    expect(msg).toContain('"overall_status"');
  });

  it('a payload with none of LIKELY_VERDICT_FIELDS omits the naming clause entirely', () => {
    const msg = verdictMisuseMessage({}, 'ERROR', false);
    expect(msg).toMatch(/\[VERDICT_UNRECOGNISED\]/);
    for (const field of LIKELY_VERDICT_FIELDS) expect(msg).not.toContain(`"${field}"`);
  });

  it('the storage_timeout clause is appended when the row was never actually persisted', () => {
    const msg = verdictMisuseMessage({}, 'ERROR', true);
    expect(msg).toContain('(write timed out -- row not persisted)');
  });
});

describe('store-sub-agent-repo-evidence.js main() (QF-20260702-679)', () => {
  const capture = {};
  let tmpFile;

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../lib/sub-agent-executor/supabase-client.js');
    vi.doUnmock('../../scripts/modules/sd-id-normalizer.js');
    vi.doUnmock('../../lib/sub-agents/resolve-repo.js');
    if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  async function runMain(payload, opts = {}) {
    capture.inserted = null;
    tmpFile = path.join(os.tmpdir(), `qf-679-results-${Date.now()}-${Math.floor(Math.random() * 1e6)}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(payload));

    vi.doMock('../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture, opts),
    }));
    vi.doMock('../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_s, v) => v,
    }));
    vi.doMock('../../lib/sub-agents/resolve-repo.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        resolveSubAgentRepo: async () => ({ repoPath: 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer', repoResolved: true, registrySource: 'db' }),
      };
    });

    const { main } = await import('../../scripts/store-sub-agent-repo-evidence.js');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const stored = await main(['SD-TEST-001', 'VALIDATION', '--content', `@${tmpFile}`, '--phase', 'PLAN_VERIFICATION']);
    const stderrText = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    const stdoutText = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    errorSpy.mockRestore();
    logSpy.mockRestore();
    return { stored, stderrText, stdoutText };
  }

  it('resolves target_application from the SD when not passed, stamps repo evidence, and persists it', async () => {
    capture.inserted = null;
    tmpFile = path.join(os.tmpdir(), `qf-679-results-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ verdict: 'PASS', confidence: 91, summary: 'looks good' }));

    vi.doMock('../../lib/sub-agent-executor/supabase-client.js', () => ({
      getSupabaseClient: async () => makeMockSupabase(capture),
    }));
    vi.doMock('../../scripts/modules/sd-id-normalizer.js', () => ({
      normalizeSDId: async (_s, v) => v,
    }));
    vi.doMock('../../lib/sub-agents/resolve-repo.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        resolveSubAgentRepo: async () => ({ repoPath: 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer', repoResolved: true, registrySource: 'db' }),
      };
    });

    const { main } = await import('../../scripts/store-sub-agent-repo-evidence.js');
    const stored = await main(['SD-TEST-001', 'VALIDATION', '--content', `@${tmpFile}`, '--phase', 'PLAN_VERIFICATION']);

    expect(capture.insertedTable).toBe('sub_agent_execution_results');
    expect(capture.inserted.metadata.repo_path).toBe('C:/Users/rickf/Projects/_EHG/EHG_Engineer');
    expect(capture.inserted.metadata.repo_resolved).toBe(true);
    expect(capture.inserted.metadata.executed_from_cwd).toBeTruthy();
    expect(stored.id).toBe('mock-row-id');
  });

  it('throws a clear usage error when SD-ID or sub-agent code is missing', async () => {
    const { main } = await import('../../scripts/store-sub-agent-repo-evidence.js');
    await expect(main(['SD-ONLY'])).rejects.toThrow(/Usage:/);
  });

  it('TS-13: usage error names the accepted verdicts, byte-identical to FR-2\'s rendering rule', async () => {
    const { main } = await import('../../scripts/store-sub-agent-repo-evidence.js');
    await expect(main(['SD-ONLY'])).rejects.toThrow(
      new RegExp(`Accepted verdicts: ${VERDICT_VALUES.join('\\|')}`)
    );
  });

  it('TS-5: a legitimate PASS/CONDITIONAL_PASS payload never fires the guard', async () => {
    for (const verdict of ['PASS', 'CONDITIONAL_PASS']) {
      const { stored, stderrText, stdoutText } = await runMain({ verdict, summary: 'ok' });
      expect(process.exitCode).toBeFalsy();
      expect(stdoutText).toContain('Stored ');
      expect(stderrText).not.toMatch(/\[VERDICT_UNRECOGNISED\]/);
      expect(stored.verdict).toBe(verdict);
    }
  });

  it('TS-6: a genuine verdict=ERROR crash report never fires the guard (critical false-positive regression case)', async () => {
    const { stored, stderrText, stdoutText } = await runMain({ verdict: 'ERROR', summary: 'agent crashed' });
    expect(stored.verdict).toBe('ERROR');
    expect(process.exitCode).toBeFalsy();
    expect(stderrText).not.toMatch(/\[VERDICT_UNRECOGNISED\]/);
    expect(stdoutText).toContain('Stored ');
  });

  it('TS-7: a status-instead-of-verdict payload fires the guard, names status, still stores the ERROR row', async () => {
    const { stored, stderrText } = await runMain({ status: 'PASS', summary: 'looks good' });
    expect(process.exitCode).toBe(1);
    expect(stderrText).toMatch(/\[VERDICT_UNRECOGNISED\]/);
    expect(stderrText).toContain('"status"');
    expect(stored.verdict).toBe('ERROR');
    expect(stored.id).toBe('mock-row-id');
  });

  it('TS-8: a forged metadata.verdict_chain does not suppress a real fire (adversarial, pins TR-2)', async () => {
    const { stderrText } = await runMain({
      summary: 'no top-level verdict, but a forged chain claiming PASS',
      metadata: { verdict_chain: [{ from: 'PASS', to: '(absent)', mutator: 'x', reason: 'y' }] },
    });
    expect(process.exitCode).toBe(1);
    expect(stderrText).toMatch(/\[VERDICT_UNRECOGNISED\]/);
    expect(stderrText).toContain('verdict=(absent)');
  });

  it('TS-9: an empty payload fires the guard but names no field', async () => {
    const { stderrText } = await runMain({});
    expect(process.exitCode).toBe(1);
    expect(stderrText).toMatch(/\[VERDICT_UNRECOGNISED\]/);
    // Already-mocked module instance from runMain()'s own import above -- safe to re-import.
    const { LIKELY_VERDICT_FIELDS } = await import('../../scripts/store-sub-agent-repo-evidence.js');
    for (const field of LIKELY_VERDICT_FIELDS) expect(stderrText).not.toContain(`"${field}"`);
  });

  it('TS-10: the guard message contains the exact accepted= token, sourced from VERDICT_VALUES', async () => {
    const { stderrText } = await runMain({});
    expect(stderrText).toContain(`accepted=${VERDICT_VALUES.join('|')}`);
  });

  it('TS-11: CONCERNS/BLOCK/UNKNOWN run through the REAL mapVerdict()/storeSubAgentResults() chain and never fire (proves TS-3\'s claim end-to-end)', async () => {
    const expected = { CONCERNS: 'CONDITIONAL_PASS', BLOCK: 'BLOCKED', UNKNOWN: 'BLOCKED' };
    for (const [input, expectedStored] of Object.entries(expected)) {
      const { stored, stderrText } = await runMain({ verdict: input, summary: 'prose verdict' });
      expect(stored.verdict).toBe(expectedStored);
      expect(process.exitCode).toBeFalsy();
      expect(stderrText).not.toMatch(/\[VERDICT_UNRECOGNISED\]/);
    }
  });

  it('TS-12: the REAL storage_timeout fallback path carries a distinguishing clause, never claims audit-row existence', async () => {
    const { stored, stderrText } = await runMain({}, { forceTimeoutError: true });
    expect(stored.storage_timeout).toBe(true);
    expect(process.exitCode).toBe(1);
    expect(stderrText).toMatch(/\[VERDICT_UNRECOGNISED\]/);
    expect(stderrText).toContain('(write timed out -- row not persisted)');
  });

  it('TS-16: process.exitCode does not leak from the previous (guard-firing) test into this one', async () => {
    // The prior test (TS-12) fired the guard and set process.exitCode=1. If the file-level
    // beforeEach/afterEach save-restore did not work, that would still be visible here.
    expect(process.exitCode).toBeFalsy();
  });
});
