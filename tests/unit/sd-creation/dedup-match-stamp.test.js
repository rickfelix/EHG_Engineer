/**
 * QF-20260729-725: wire the shipped dedup detector (SD-LEO-INFRA-SOURCING-ENGINE-DEDUP-
 * AUTOSTAMP-001's router) into the SD-create choke (lib/sd-creation/pipeline.js createSD).
 *
 * Task-one measurement (recorded here, per acceptance #2): before this fix, the module was
 * an UNCALLED FUNCTION on the SD-create path -- scripts/leo-create-sd.js had exactly one
 * match for dedup|duplicate|similar, a comment at line 518, and zero calls to
 * routeCandidate/stampCandidate. This is failure mode 2 ("never fires"), not failure mode 1
 * (a plumbing loss between tables) -- confirmed by grepping the create path before wiring.
 *
 * Acceptance #3 (negative test, both directions), verified against the REAL createSD()
 * integration point (not just routeCandidate in isolation, which is already covered by
 * tests/unit/sourcing-engine-router.test.js):
 *   - a near-duplicate of an existing SD -> flagged (dedup_match_sd_key = the existing sd_key)
 *   - a genuinely novel SD -> NOT flagged (dedup_match_sd_key = 'none', the explicit
 *     no-match value acceptance #1 requires so a future null reads as "never checked")
 * Acceptance #4 (warn, never block): both cases reach the same mocked insert-failure path,
 * proving a dedup match does not short-circuit creation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const capturedInserts = vi.hoisted(() => []);
const existingRows = vi.hoisted(() => ({ rows: [] }));

vi.mock('../../../lib/supabase-client.js', () => {
  function mkChain(table) {
    const state = { inserted: false };
    const resolveValue = () => {
      if (table === 'strategic_directives_v2' && state.inserted) {
        return { data: null, error: { message: 'mocked insert failure' }, count: 0 };
      }
      if (table === 'strategic_directives_v2' && !state.inserted) {
        // The dedup wiring's read-before-insert SELECT (fetchAllPaginated).
        return { data: existingRows.rows, error: null, count: existingRows.rows.length };
      }
      return { data: null, error: null, count: 0 };
    };
    const proxy = new Proxy(function proxyBase() { return undefined; }, {
      get(_t, prop) {
        if (prop === 'then') {
          return (onFulfilled, onRejected) => Promise.resolve(resolveValue()).then(onFulfilled, onRejected);
        }
        if (prop === 'catch') return (onRejected) => Promise.resolve(resolveValue()).catch(onRejected);
        return (...args) => {
          if (prop === 'insert') {
            state.inserted = true;
            if (table === 'strategic_directives_v2') capturedInserts.push(args[0]);
          }
          return proxy;
        };
      },
    });
    return proxy;
  }
  return {
    createSupabaseServiceClient: () => ({
      from: (table) => mkChain(table),
      rpc: () => Promise.resolve({ data: null, error: null }),
    }),
  };
});

// Keep unrelated governance/validation dynamic imports inert (same isolation as
// tests/unit/sd-creation/create-sd-no-exit.test.js) so this spec exercises only the
// dedup-stamp wiring against the mocked insert-failure branch.
vi.mock('../../../lib/governance/guardrail-registry.js', () => ({
  check: () => ({ passed: true, warnings: [], violations: [] }),
}));
vi.mock('../../../scripts/modules/governance/cascade-validator.js', () => ({
  validateCascade: async () => ({ passed: true, warnings: [], violations: [], rulesChecked: 0 }),
}));
vi.mock('../../../lib/fleet/sd-tier-rank.mjs', () => ({
  stampPayloadForCreation: () => ({}),
}));
vi.mock('../../../lib/coordinator/trigger-rank-pass.mjs', () => ({
  triggerRankPass: () => {},
}));

describe('QF-20260729-725: dedup_match_sd_key stamped at the SD-create choke', () => {
  let exitSpy;
  let warnSpy;
  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code}) must not be called from library code`);
    });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    capturedInserts.length = 0;
    existingRows.rows = [];
  });
  afterEach(() => {
    exitSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('flags a near-duplicate of an existing SD (exact-title match) without blocking creation', async () => {
    existingRows.rows = [{ sd_key: 'SD-EXISTING-DUP-001', title: 'Fix the login page rendering bug' }];
    const { createSD } = await import('../../../lib/sd-creation/pipeline.js');
    const res = await createSD({
      sdKey: 'SD-ARCH-HOTSPOT-TEST-DEDUP-001',
      title: 'Fix the login page rendering bug', // exact-title dup of the existing row
      description: 'Fixture description for the dedup-match wiring test.',
      type: 'infrastructure',
      rationale: 'unit-test fixture',
      metadata: { source: 'leo' },
    });
    // Warn-only (#4): the match did not short-circuit creation -- it still reached (and
    // failed at) the mocked insert.
    expect(res.ok).toBe(false);
    expect(res.code).toBe('INSERT_FAILED');
    expect(exitSpy).not.toHaveBeenCalled();

    expect(capturedInserts).toHaveLength(1);
    expect(capturedInserts[0].metadata.dedup_match_sd_key).toBe('SD-EXISTING-DUP-001');

    const warnedDedup = warnSpy.mock.calls.some((c) => String(c[0]).includes('[DEDUP]'));
    expect(warnedDedup).toBe(true);
  });

  it('does NOT flag a genuinely novel SD (explicit no-match value, not null)', async () => {
    existingRows.rows = [{ sd_key: 'SD-EXISTING-DUP-001', title: 'Fix the login page rendering bug' }];
    const { createSD } = await import('../../../lib/sd-creation/pipeline.js');
    const res = await createSD({
      sdKey: 'SD-ARCH-HOTSPOT-TEST-DEDUP-002',
      title: 'Completely unrelated novel work: interstellar teapot scheduling harness',
      description: 'Genuinely new problem space, no overlap with any existing SD title.',
      type: 'infrastructure',
      rationale: 'unit-test fixture',
      metadata: { source: 'leo' },
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('INSERT_FAILED');
    expect(exitSpy).not.toHaveBeenCalled();

    expect(capturedInserts).toHaveLength(1);
    // Explicit no-match value (#1) -- distinguishable from a pre-fix row's null ("never checked").
    expect(capturedInserts[0].metadata.dedup_match_sd_key).toBe('none');

    const warnedDedup = warnSpy.mock.calls.some((c) => String(c[0]).includes('[DEDUP]'));
    expect(warnedDedup).toBe(false);
  });
});
