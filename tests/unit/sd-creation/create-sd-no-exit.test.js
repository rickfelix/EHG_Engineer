/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: the sanctioned exit→return conversion.
 *
 * 1. createSD returns {ok:false, code:'INSERT_FAILED'} on a failing insert — it does
 *    NOT call process.exit and does NOT throw (createSDOrThrow is the throwing wrapper).
 * 2. Static invariant: no file under lib/sd-creation/ contains a process.exit call.
 *
 * SD-LEO-INFRA-SHIFT-LEFT-PRD-001: also captures the exact payload passed to `.insert()` so
 * the authoring-time validation stamp (metadata.sd_authoring_validated_at/
 * sd_authoring_validation_summary) can be asserted against the REAL createSD() integration
 * point, not just the pure validateArtifact/validateSDFields functions in isolation (TESTING
 * evidence 28adeafe-e976-422a-82ec-30962c59ef1b, finding F3: a source-position pin alone would
 * stay green even if the new call site were moved or deleted). The insert-failure mock path is
 * reused deliberately -- the stamp is written BEFORE the insert error, so this assertion works
 * without needing a full success-path mock of createSD()'s many other side effects.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const capturedInserts = vi.hoisted(() => []);

// Mock the supabase client with a generic chainable whose awaited result reports a
// failing INSERT on strategic_directives_v2 and benign empty results everywhere else.
vi.mock('../../../lib/supabase-client.js', () => {
  function mkChain(table) {
    const state = { table, inserted: false };
    const resolveValue = () => {
      if (state.table === 'strategic_directives_v2' && state.inserted) {
        return { data: null, error: { message: 'mocked insert failure' }, count: 0 };
      }
      return { data: null, error: null, count: 0 };
    };
    const target = function proxyBase() { return undefined; }; // callable Proxy base, never invoked directly
    const proxy = new Proxy(target, {
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

// Keep the governance/validation dynamic imports inert so this spec exercises ONLY the
// insert-failure branch (guardrail/cascade both pass; tier-rank stamp is a no-op).
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

describe('SD-ARCH-HOTSPOT-LEO-CREATE-001: createSD returns {ok:false} instead of exiting', () => {
  let exitSpy;
  let warnSpy;
  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code}) must not be called from library code`);
    });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    capturedInserts.length = 0;
  });
  afterEach(() => {
    exitSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('mocked failing insert → {ok:false, code:INSERT_FAILED}, no process.exit, no throw', async () => {
    const { createSD } = await import('../../../lib/sd-creation/pipeline.js');
    const res = await createSD({
      sdKey: 'SD-ARCH-HOTSPOT-TEST-FIXTURE-001',
      title: 'Fixture SD for insert-failure path',
      description: 'Fixture description',
      type: 'infrastructure',
      rationale: 'unit-test fixture',
      metadata: { source: 'leo' },
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('INSERT_FAILED');
    expect(res.exitCode).toBe(1);
    expect(res.error).toContain('Failed to create SD: mocked insert failure');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  // SD-LEO-INFRA-SHIFT-LEFT-PRD-001 (FR-2/FR-6, TS-1/TS-2/TS-6): asserts against the ACTUAL
  // payload createSD() passed to `.insert()`, not a hand-composed simulation of the sequencing
  // -- closes the gap TESTING evidence 28adeafe-e976-422a-82ec-30962c59ef1b (F3) named: neither
  // a source-position pin nor an isolated validateArtifact/validateSDFields composition proves
  // the real call site actually ran.
  it('the payload passed to .insert() carries the authoring-validation stamp, and warns (never blocks) on insufficient success_metrics', async () => {
    const { createSD } = await import('../../../lib/sd-creation/pipeline.js');
    const res = await createSD({
      sdKey: 'SD-ARCH-HOTSPOT-TEST-FIXTURE-003',
      title: 'Fixture SD with only 1 success_metrics entry',
      description: 'Fixture description long enough for downstream checks to not choke on brevity.',
      type: 'infrastructure',
      rationale: 'unit-test fixture',
      metadata: { source: 'leo' },
      success_metrics: [{ metric: 'Only one metric', target: '>=1', actual: '0' }],
    });
    // FR-2 is warn-only: an insufficient-metrics payload still reaches (and fails at) the mocked
    // insert -- it is NOT short-circuited by the new authoring check.
    expect(res.ok).toBe(false);
    expect(res.code).toBe('INSERT_FAILED');
    expect(exitSpy).not.toHaveBeenCalled();

    expect(capturedInserts).toHaveLength(1);
    const inserted = capturedInserts[0];
    expect(inserted.metadata.sd_authoring_validated_at).toEqual(expect.any(String));
    // PLAN-phase VALIDATION review (evidence 1fca1318-5f6a-490f-b740-77867f00a834, finding V1):
    // an exact-count assertion is load-bearing -- {violation_count: expect.any(Number)} stayed
    // GREEN even when validateArtifact was mutation-tested to run BEFORE validateSDFields's
    // enrichment (TR-2's sequencing invariant silently broken, still producing *some* positive
    // violation_count from the pre-enrichment string-array shape mismatches). Pinning the exact
    // {1, 3} this payload produces post-enrichment makes a sequencing regression change this
    // count and fail the test, instead of merely changing which violations fired.
    expect(inserted.metadata.sd_authoring_validation_summary).toEqual({ violation_count: 1, warning_count: 3 });
    // FR-6: prior metadata keys survive the spread-merge stamp (source: 'leo' set above).
    expect(inserted.metadata.source).toBe('leo');

    const warnedAuthoring = warnSpy.mock.calls.some((c) => String(c[0]).includes('[SD-AUTHORING]'));
    expect(warnedAuthoring).toBe(true);
  });

  it('createSDOrThrow preserves the historical programmatic contract (throws on failure)', async () => {
    const { createSDOrThrow } = await import('../../../lib/sd-creation/pipeline.js');
    await expect(createSDOrThrow({
      sdKey: 'SD-ARCH-HOTSPOT-TEST-FIXTURE-002',
      title: 'Fixture SD for throwing wrapper',
      description: 'Fixture description',
      type: 'infrastructure',
      rationale: 'unit-test fixture',
      metadata: { source: 'leo' },
    })).rejects.toThrow('Failed to create SD: mocked insert failure');
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('SD-ARCH-HOTSPOT-LEO-CREATE-001: lib/sd-creation contains no process.exit call', () => {
  it('no source file under lib/sd-creation/ contains a process.exit invocation', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const root = path.resolve(__dirname, '../../../lib/sd-creation');
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|mjs|cjs)$/.test(entry.name)) files.push(full);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThanOrEqual(9); // context + pipeline + 7 adapters + index
    const needle = 'process.' + 'exit(';
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      expect(src.includes(needle), `${path.relative(root, file)} must not contain ${needle}`).toBe(false);
    }
  });

  // SD-LEO-INFRA-ROADMAP-LINK-COUNTED-EXCEPTION-001 (FR-1): the scan above walks ONLY
  // lib/sd-creation/, but the register-first predicate and the roadmap-link exception builder it
  // now calls live in lib/sourcing-engine/. A refusal added there would run on the creation path
  // and be invisible to the walk above — the blind spot is the point of this second assertion.
  it('the sourcing-engine modules on the creation path contain no process.exit invocation', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    // Walk the DIRECTORY rather than hard-coding filenames — the sibling scan above walks, and a
    // hard-coded list silently stops covering any module added to this path later.
    const root = path.resolve(__dirname, '../../../lib/sourcing-engine');
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|mjs|cjs)$/.test(entry.name)) files.push(full);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThanOrEqual(2);
    const needle = 'process.' + 'exit(';
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      expect(src.includes(needle), `${path.relative(root, file)} must not contain ${needle}`).toBe(false);
    }

    // FR-1 also forbids a THROWN refusal from the exception seam. Scan CODE ONLY: a naive
    // src.includes('throw ') matches the module's own prose ("may throw, exit, or refuse") and
    // fails on a comment edit — it did exactly that once. Strip comments first so the assertion
    // tracks behaviour rather than wording.
    const target = path.join(root, 'roadmap-link-exception.js');
    const codeOnly = fs.readFileSync(target, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')      // block comments (incl. JSDoc)
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(/\bthrow\b/.test(codeOnly), 'roadmap-link-exception.js must not throw — FR-1 forbids any refusal path').toBe(false);
  });
});
