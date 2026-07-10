/**
 * THREE-HELPER CONTRACT FREEZE — the tripwire precondition for the burn-now door pair
 * (SD-ARCH-HOTSPOT-LEO-CREATE-001 + SD-ARCH-HOTSPOT-STAGE-WORKER-001, coordinator
 * directive F-B / Solomon corrected list).
 *
 * Freezes the PUBLIC CONTRACTS of the three shared helpers both doors mutate around:
 *   1. routeWorkItem  (lib/utils/work-item-router.js)
 *   2. generateSDKey  (scripts/modules/sd-key-generator.js)
 *   3. createSD       (lib/sd-creation/pipeline.js + the CLI shim's throwing re-export)
 *
 * These are contract-level pins (exports, arity, return shape, enumerations), NOT
 * behavior clones — a door may move/extend implementation freely; it may NOT change
 * these seams without failing this file first. Landed by the LEO-CREATE door; the
 * STAGE-WORKER door consumes (first-to-reach-lands-it rule).
 */
import { describe, it, expect } from 'vitest';

describe('contract freeze: routeWorkItem', () => {
  it('is an async function (input, supabase) exporting the risk/schema keyword contract', async () => {
    const mod = await import('../../../lib/utils/work-item-router.js');
    expect(typeof mod.routeWorkItem).toBe('function');
    expect(mod.routeWorkItem.length).toBe(2); // (input, supabase)
    // Tier-3 risk-keyword vocabulary is a governance contract (CLAUDE.md Work Item Routing)
    expect(mod.RISK_KEYWORDS).toEqual(expect.arrayContaining(['security', 'auth', 'rls', 'payments', 'credentials']));
    expect(mod.SCHEMA_KEYWORDS).toEqual(expect.arrayContaining(['migration', 'schema']));
  });
});

describe('contract freeze: generateSDKey', () => {
  it('is an async function (options) with the SD_SOURCES enumeration intact', async () => {
    const mod = await import('../../../scripts/modules/sd-key-generator.js');
    expect(typeof mod.generateSDKey).toBe('function');
    expect(mod.generateSDKey.length).toBe(1); // (options)
    expect(mod.SD_SOURCES).toBeTruthy();
    // Sources used by the seven live source adapters — removing/renaming any breaks intake.
    for (const src of ['LEO', 'MANUAL']) expect(Object.keys(mod.SD_SOURCES)).toContain(src);
  });
});

describe('contract freeze: createSD', () => {
  it('pipeline createSD returns {ok,...} result objects and never calls process.exit', async () => {
    const mod = await import('../../../lib/sd-creation/pipeline.js');
    expect(typeof mod.createSD).toBe('function');
    // Failure path returns a result object (never exits): drive it with a stub supabase
    // whose insert fails. Spy on process.exit to prove the library contract.
    const exitSpy = [];
    const realExit = process.exit;
    process.exit = (code) => { exitSpy.push(code); throw new Error(`process.exit(${code}) called in library code`); };
    try {
      const failingSupabase = new Proxy(function proxyBase() { return undefined; }, {
        get(_t, prop) {
          if (prop === 'then') return undefined;
          if (prop === 'from') return () => failingSupabase;
          return (..._args) => failingSupabase;
        },
        apply() { return failingSupabase; },
      });
      // createSD(title, type, priority?, options?) — validate via a guaranteed-early failure:
      const res = await mod.createSD('', '', undefined, { supabase: failingSupabase }).catch((e) => ({ ok: false, error: String(e?.message || e) }));
      expect(res).toBeTypeOf('object');
      expect(res.ok).toBe(false);
      expect(exitSpy).toEqual([]); // the frozen contract: library NEVER exits
    } finally {
      process.exit = realExit;
    }
  });

  it('the CLI shim re-exports a throwing createSD (createSDOrThrow alias) for programmatic importers', async () => {
    const shim = await import('../../../scripts/leo-create-sd.js');
    expect(typeof shim.createSD).toBe('function');
    // The shim's createSD must be the THROWING variant (pre-refactor programmatic contract):
    // its source must not be the {ok,error}-returning pipeline function reference.
    const pipeline = await import('../../../lib/sd-creation/pipeline.js');
    expect(shim.createSD).not.toBe(pipeline.createSD);
  });
});
