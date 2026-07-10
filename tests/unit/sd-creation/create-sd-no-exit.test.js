/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: the sanctioned exit→return conversion.
 *
 * 1. createSD returns {ok:false, code:'INSERT_FAILED'} on a failing insert — it does
 *    NOT call process.exit and does NOT throw (createSDOrThrow is the throwing wrapper).
 * 2. Static invariant: no file under lib/sd-creation/ contains a process.exit call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    const target = () => {};
    const proxy = new Proxy(target, {
      get(_t, prop) {
        if (prop === 'then') {
          return (onFulfilled, onRejected) => Promise.resolve(resolveValue()).then(onFulfilled, onRejected);
        }
        if (prop === 'catch') return (onRejected) => Promise.resolve(resolveValue()).catch(onRejected);
        return (...args) => {
          if (prop === 'insert') state.inserted = true;
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
  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code}) must not be called from library code`);
    });
  });
  afterEach(() => {
    exitSpy.mockRestore();
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
});
