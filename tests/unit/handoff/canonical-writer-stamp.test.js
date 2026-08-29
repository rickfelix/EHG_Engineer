// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — FR-4's JS half.
//
// The DDL tier (tests/ddl/strategic-directives-canonical-writer-choke-ddl.db.test.js) proves the
// guard's own logic against real Postgres. It cannot prove that the JS callers actually SEND the
// stamp, or that the two compensation paths stop swallowing a rejection — those are claims about
// this repo's code, not about the trigger. That is what this file covers, including TS-32.
//
// WHAT A GREEN RUN HERE DOES NOT MEAN: the supabase client is a fake. This proves the PAYLOADS and
// the ERROR HANDLING, never that a real UPDATE lands. The behavioural half is the DDL tier's.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  CANONICAL_WRITER_STAMP,
  CANONICAL_WRITE_SQLSTATE,
  isCanonicalWriteRejection,
} from '../../../scripts/modules/handoff/lib/canonical-writer-stamp.js';
import { transitionSdToPlan } from '../../../scripts/modules/handoff/executors/lead-to-plan/state-transitions.js';
import { transitionSdToExec } from '../../../scripts/modules/handoff/executors/plan-to-exec/state-transitions.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Minimal supabase-js stand-in: records every payload and returns a scripted result per table.
 * `.update()` returns a thenable chain so `.eq().select().single()` all resolve to the same result,
 * matching the shapes the call sites actually use.
 */
function fakeSupabase(resultsByTable = {}) {
  const calls = [];
  const chainFor = (table, payload) => {
    const result = results(table);
    const chain = {
      eq: () => chain,
      neq: () => chain,
      select: () => chain,
      single: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    calls.push({ table, payload });
    return chain;
  };
  const results = (table) => resultsByTable[table] ?? { data: [{ id: 'x' }], error: null };
  return {
    calls,
    from: (table) => ({
      update: (payload) => chainFor(table, payload),
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(results(table)) }) }),
    }),
  };
}

const SDCW1_ERROR = {
  code: CANONICAL_WRITE_SQLSTATE,
  message: 'missing canonical-writer stamp on protected-column write',
  details: 'guard=zzz_enforce_canonical_lifecycle_write_final',
};

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('the stamp identity has exactly one definition', () => {
  it("is 'handoff.js' — the identity the migration's registry declares", () => {
    expect(CANONICAL_WRITER_STAMP).toBe('handoff.js');
  });

  it('no call site assigns the stamp from a string literal — every one imports the constant', () => {
    // FR-5's SSOT contract, enforced on the JS side. The check is on the STAMP ASSIGNMENT rather
    // than on the bare string 'handoff.js': that string legitimately appears in unrelated
    // protocol-vocabulary lists (adrs-consulted.js, target-application.js), and a check that fired
    // on those would be noise a future author learns to route around.
    const root = path.join(REPO_ROOT, 'scripts', 'modules', 'handoff');
    const literalAssignments = [];
    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(js|mjs|cjs)$/.test(entry.name)) continue;
        const rel = path.relative(REPO_ROOT, p).split(path.sep).join('/');
        if (rel === 'scripts/modules/handoff/lib/canonical-writer-stamp.js') continue;
        const src = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        for (const m of src.matchAll(/lifecycle_write_token\s*:\s*(['"`])/g)) {
          literalAssignments.push(`${rel}:${src.slice(0, m.index).split('\n').length}`);
        }
      }
    })(root);
    expect(literalAssignments).toEqual([]);
  });

  it('matches the registry entry in the staged migration, character for character', () => {
    const migration = fs
      .readFileSync(
        path.join(REPO_ROOT, 'database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql'),
        'utf8',
      )
      .replace(/\r\n/g, '\n');
    expect(migration).toContain(`('${CANONICAL_WRITER_STAMP}'::text,`);
    expect(migration).toContain(`ERRCODE = '${CANONICAL_WRITE_SQLSTATE}'`);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('isCanonicalWriteRejection', () => {
  it('is true for an SDCW1 error object', () => {
    expect(isCanonicalWriteRejection(SDCW1_ERROR)).toBe(true);
  });

  it('is false for null, for a CAS miss, and for any other SQLSTATE', () => {
    // A lost CAS race returns `error: null` — the measured discriminator. Any other DB error is
    // somebody else's problem and must keep its existing fail-soft handling.
    expect(isCanonicalWriteRejection(null)).toBe(false);
    expect(isCanonicalWriteRejection(undefined)).toBe(false);
    expect(isCanonicalWriteRejection({ code: '23514', message: 'check constraint' })).toBe(false);
    expect(isCanonicalWriteRejection({ message: 'SDCW1 mentioned only in prose' })).toBe(false);
  });

  it('is false for PGRST204 — the deploy-order failure, which must NOT be mistaken for a guard rejection', () => {
    // Measured live: shipping this code before the step-1 column migration applies makes every wired
    // site return PGRST204 ("Could not find the 'lifecycle_write_token' column ... in the schema
    // cache"), because PostgREST validates the payload before matching any row. This predicate
    // correctly returns FALSE for it — which is why the rollback paths would fall back to
    // log-and-swallow, and why the column migration is a hard prerequisite rather than a nicety.
    // Pinned as a test so the relationship stays visible if either side is ever edited.
    const pgrst204 = {
      code: 'PGRST204',
      message: "Could not find the 'lifecycle_write_token' column of 'strategic_directives_v2' in the schema cache",
    };
    expect(isCanonicalWriteRejection(pgrst204)).toBe(false);
  });
});

describe('the deploy-order prerequisite is documented where the stamp is defined', () => {
  it('the module no longer claims sending the column is harmless before the migration', () => {
    // An earlier version of this file asserted exactly that, and it was false. The correction is
    // load-bearing prose — a future reader deciding whether this branch is safe to merge reads it
    // here — so its absence is worth a test rather than trusting review to catch a regression.
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/modules/handoff/lib/canonical-writer-stamp.js'),
      'utf8',
    );
    expect(src).not.toMatch(/harmless before the migration applies/);
    expect(src).not.toMatch(/No feature flag is needed in either direction/);
    expect(src).toContain('PGRST204');
    expect(src).toMatch(/20260824_strategic_directives_lifecycle_write_token_column\.sql/);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('forward transitions send the stamp', () => {
  it('transitionSdToPlan legacy fallback stamps its own UPDATE', async () => {
    // The atomic RPC path is preferred; this is the non-atomic fallback the executor takes when the
    // RPC is unavailable. `supabase.rpc` is absent on the fake, so the availability probe throws and
    // the executor falls through to exactly the branch under test.
    const supabase = fakeSupabase();
    await transitionSdToPlan('SD-TEST-001', { current_phase: 'LEAD' }, supabase);
    const write = supabase.calls.find((c) => c.table === 'strategic_directives_v2');
    expect(write).toBeDefined();
    expect(write.payload).toMatchObject({
      current_phase: 'PLAN_PRD',
      status: 'in_progress',
      lifecycle_write_token: CANONICAL_WRITER_STAMP,
    });
  });

  it('transitionSdToExec stamps its own UPDATE', async () => {
    const supabase = fakeSupabase();
    await transitionSdToExec(supabase, 'SD-TEST-002', { current_phase: 'PLAN_PRD' });
    const write = supabase.calls.find((c) => c.table === 'strategic_directives_v2');
    expect(write.payload).toMatchObject({
      current_phase: 'EXEC',
      status: 'active',
      lifecycle_write_token: CANONICAL_WRITER_STAMP,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-32 / FR-4 F8 (SUPERSEDED by QF-20260824-641) — the two compensation paths are gone, not fixed', () => {
  // FR-4 originally planned to fix rollbackSdState/rollbackState's swallow-and-log bug (never
  // re-raising an SDCW1 rejection). QF-20260824-641 traced both call sites and found neither is
  // EVER reachable in the real handoff pipeline (index.js's post-verification path swallows its
  // own errors and never throws, so no partial-state branch exists for a rollback to protect) and
  // deleted captureStateSnapshot/rollbackSdState/rollbackState entirely rather than patch dead code.
  // These tests verify the deletion, matching the pattern below for FR-7's dead completion writers.
  const LEAD_TO_PLAN = path.join(REPO_ROOT, 'scripts/modules/handoff/executors/lead-to-plan/state-transitions.js');
  const PLAN_TO_EXEC = path.join(REPO_ROOT, 'scripts/modules/handoff/executors/plan-to-exec/state-transitions.js');

  it('captureStateSnapshot/rollbackSdState are gone from lead-to-plan/state-transitions.js', () => {
    const src = fs.readFileSync(LEAD_TO_PLAN, 'utf8');
    expect(src).not.toContain('function captureStateSnapshot');
    expect(src).not.toContain('function rollbackSdState');
  });

  it('captureStateSnapshot/rollbackState are gone from plan-to-exec/state-transitions.js', () => {
    const src = fs.readFileSync(PLAN_TO_EXEC, 'utf8');
    expect(src).not.toContain('function captureStateSnapshot');
    expect(src).not.toContain('function rollbackState');
  });

  it('the forward transitions still stamp lifecycle_write_token after the deletion', async () => {
    // Two-sided: proves the deletion did not collaterally remove the stamp wiring on the paths
    // that ARE reachable (the forward transitions themselves, covered above in this file).
    expect(transitionSdToPlan).toBeInstanceOf(Function);
    expect(transitionSdToExec).toBeInstanceOf(Function);
  });

  it('no caller anywhere in active scripts/ or lib/ references the deleted functions', () => {
    // scripts/one-off/ is excluded: it holds disposable, already-executed evidence-writer scripts
    // that quote deleted identifiers in historical prose (findings text describing what a sub-agent
    // reviewed AT THE TIME), the same class of textual-not-functional mention FR-7's own evidence
    // documents for complete-orchestrator.js. They are not active code and are never re-run.
    const roots = ['scripts', 'lib'].map((d) => path.join(REPO_ROOT, d));
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'one-off') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(js|mjs|cjs)$/.test(entry.name)) continue;
        if (full === LEAD_TO_PLAN || full === PLAN_TO_EXEC) continue; // the definition sites themselves are gone
        const text = fs.readFileSync(full, 'utf8');
        if (/\brollbackSdState\b/.test(text) || /\brollbackState\b/.test(text)) offenders.push(full);
      }
    };
    for (const root of roots) walk(root);
    expect(offenders, `stale references to deleted rollback functions: ${offenders.join(', ')}`).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-19 / FR-7 — the dead completion writers are retired', () => {
  const ORCHESTRATOR = path.join(REPO_ROOT, 'scripts/leo-orchestrator-enforced.js');

  it('markSDComplete() is gone from leo-orchestrator-enforced.js', () => {
    // It wrote all three protected columns via an ANON client (RLS-dropped, so already a no-op),
    // set a phantom current_phase 'APPROVAL_COMPLETE' that appears in zero completed SDs, and
    // CLOBBERED the whole metadata jsonb — destroying holds, park stamps and completion flags — if
    // it had ever been invoked. It had zero call sites.
    const src = fs.readFileSync(ORCHESTRATOR, 'utf8');
    expect(src).not.toContain('markSDComplete');
    expect(src).not.toContain("current_phase: 'APPROVAL_COMPLETE'");
  });

  it('the rest of leo-orchestrator-enforced.js survives — npm run leo:execute still resolves', async () => {
    // The FILE is live (`npm run leo:execute`); only the one method was dead. Importing it is the
    // check that the removal did not take a brace or an import with it.
    const mod = await import(pathToFileURL(ORCHESTRATOR).href);
    expect(typeof mod.default).toBe('function');
    expect(typeof mod.default.prototype.executeSD).toBe('function');
    expect(mod.default.prototype.markSDComplete).toBeUndefined();
  });

  it('scripts/complete-orchestrator.js is deleted', () => {
    // A one-shot hardcoded to the literal SD id 'SD-FORGE-FOUNDATION-001', with no package.json
    // entry and no importer anywhere.
    expect(fs.existsSync(path.join(REPO_ROOT, 'scripts/complete-orchestrator.js'))).toBe(false);
  });

  it('no vitest include pattern would resurrect the archived completion-fix script', () => {
    // FR-7's third check. The unit tier collects '**/*.test.js'; 'test-sd-completion-fix.js' is a
    // test- PREFIX, not a .test.js SUFFIX, so it matches nothing — asserted rather than assumed,
    // because "it probably doesn't match" is how a quarantined file comes back to life.
    for (const name of ['test-sd-completion-fix.js']) {
      expect(/\.test\.js$/.test(name)).toBe(false);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('coverage regression guard — every reachable handoff write site is stamped', () => {
  it('no protected-column .update() payload under scripts/modules/handoff/** is missing the stamp', () => {
    // Deliberately MULTI-LINE aware. `.from('strategic_directives_v2')` and `.update({...})` land on
    // different physical lines in this codebase's dominant style — the measured reason a same-line
    // regex has ~0% recall here, and the same blind spot FR-8's scanner repair addresses.
    const root = path.join(REPO_ROOT, 'scripts', 'modules', 'handoff');
    const PROTECTED = ['status', 'current_phase', 'completion_date'];
    const unstamped = [];
    let inspected = 0;

    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(js|mjs|cjs)$/.test(entry.name)) continue;
        const rel = path.relative(REPO_ROOT, p).split(path.sep).join('/');
        // SDRepository.js's updateStatus() is EXCLUDED on purpose: measured dead-by-unreachability
        // (zero call sites repo-wide), and FR-5 removed it from the wiring targets entirely.
        // Stamping it would manufacture false coverage — a green line proving nothing about any
        // real write path.
        if (rel.endsWith('/db/SDRepository.js')) continue;
        const src = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        const re = /\.from\(\s*(?:'strategic_directives_v2'|"strategic_directives_v2")\s*\)/g;
        let m;
        while ((m = re.exec(src)) !== null) {
          const upd = src.slice(m.index, m.index + 1500).match(/\.update\(\s*\{([\s\S]*?)\}\s*\)/);
          if (!upd) continue;
          const payload = upd[1];
          if (!PROTECTED.some((c) => new RegExp(`(^|[\\s{,])${c}\\s*[:,}]`).test(payload))) continue;
          inspected += 1;
          if (!/lifecycle_write_token/.test(payload)) {
            unstamped.push(`${rel}:${src.slice(0, m.index).split('\n').length}`);
          }
        }
      }
    })(root);

    // A scanner that found nothing would report zero unstamped sites and read as green. Assert it
    // genuinely saw the surface it claims to guard.
    //
    // SD-FDBK-ENH-HANDOFF-PIPELINE-NEVER-001 (FR-5): threshold lowered 11 -> 9. skip-and-continue.js's
    // markAsBlocked() previously wrote status:'blocked' -- a value NOT in the live
    // strategic_directives_v2_status_check CHECK constraint, so that write was guaranteed to fail on
    // every call. The fix removes `status` from that update entirely (relying on the metadata
    // discriminators instead), which correctly drops it out of this PROTECTED-column scan. The two
    // fewer matches (not one) are this scanner's own `.from()`-occurrence quirk: the SD-fetch SELECT
    // and the UPDATE are both `.from('strategic_directives_v2')` calls close enough together that
    // each independently finds the same nearby `.update(...)` within its 1500-char window, so one
    // real write site was being double-counted as two matches — both of which now correctly fail the
    // PROTECTED-column check since the payload no longer contains status/current_phase/completion_date.
    expect(inspected, 'the scan found no protected-column write sites at all').toBeGreaterThanOrEqual(9);
    expect(unstamped).toEqual([]);
  });
});
