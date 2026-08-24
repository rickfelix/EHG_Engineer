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
import { rollbackSdState, transitionSdToPlan } from '../../../scripts/modules/handoff/executors/lead-to-plan/state-transitions.js';
import { rollbackState, transitionSdToExec } from '../../../scripts/modules/handoff/executors/plan-to-exec/state-transitions.js';

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
describe('TS-32 / FR-4 F8 — the two compensation paths', () => {
  const leadSnapshot = { current_phase: 'LEAD', status: 'draft' };
  const execSnapshot = { sd_phase: 'PLAN_PRD', sd_status: 'planning', sd_is_working_on: false };

  it('rollbackSdState restores the snapshot AND carries the same identity as its forward path', async () => {
    // "The rollback write actually lands." A green forward-path test proves nothing about this
    // path — it only runs under conditions the happy path never creates.
    const supabase = fakeSupabase();
    await rollbackSdState('SD-TEST-003', leadSnapshot, supabase);
    const write = supabase.calls.find((c) => c.table === 'strategic_directives_v2');
    expect(write.payload).toMatchObject({
      current_phase: 'LEAD',
      status: 'draft',
      lifecycle_write_token: CANONICAL_WRITER_STAMP,
    });
  });

  it('rollbackState restores the snapshot AND carries the same identity as its forward path', async () => {
    const supabase = fakeSupabase();
    await rollbackState(supabase, 'SD-TEST-004', null, execSnapshot);
    const write = supabase.calls.find((c) => c.table === 'strategic_directives_v2');
    expect(write.payload).toMatchObject({
      current_phase: 'PLAN_PRD',
      status: 'planning',
      is_working_on: false,
      lifecycle_write_token: CANONICAL_WRITER_STAMP,
    });
  });

  it('rollbackSdState THROWS on an SDCW1 rejection instead of logging and dropping it', async () => {
    // The regression scenario: someone removes the stamp from this call site. Before this change the
    // rejection was a console.log with no rethrow — invisible at every layer, leaving the SD stuck
    // mid-handoff with the forward transition applied and no diagnosable trace.
    const supabase = fakeSupabase({ strategic_directives_v2: { data: null, error: SDCW1_ERROR } });
    await expect(rollbackSdState('SD-TEST-005', leadSnapshot, supabase)).rejects.toThrow(
      /rollback was REJECTED by the canonical-writer guard \(SDCW1\)/,
    );
  });

  it('rollbackState THROWS on an SDCW1 rejection instead of logging and dropping it', async () => {
    const supabase = fakeSupabase({ strategic_directives_v2: { data: null, error: SDCW1_ERROR } });
    await expect(rollbackState(supabase, 'SD-TEST-006', null, execSnapshot)).rejects.toThrow(
      /rollback was REJECTED by the canonical-writer guard \(SDCW1\)/,
    );
  });

  it('the thrown message names the SD and the state it must be reconciled to', async () => {
    const supabase = fakeSupabase({ strategic_directives_v2: { data: null, error: SDCW1_ERROR } });
    const err = await rollbackSdState('SD-TEST-007', leadSnapshot, supabase).catch((e) => e);
    expect(err.message).toContain('SD-TEST-007');
    expect(err.message).toContain('phase=LEAD');
    expect(err.message).toContain('status=draft');
  });

  it('[TWO-SIDED] a NON-SDCW1 error keeps the existing fail-soft behaviour — no throw', async () => {
    // Without this, "throw on rollback failure" would be indistinguishable from "throw on any
    // rollback failure", which would be a behaviour change well beyond FR-4's scope: a transient
    // network blip during compensation would start aborting the caller.
    const other = { code: '08006', message: 'connection failure' };
    const supabase = fakeSupabase({ strategic_directives_v2: { data: null, error: other } });
    await expect(rollbackSdState('SD-TEST-008', leadSnapshot, supabase)).resolves.toBeUndefined();
    await expect(rollbackState(supabase, 'SD-TEST-009', null, execSnapshot)).resolves.toBeUndefined();
  });

  it('a successful rollback still resolves quietly', async () => {
    const supabase = fakeSupabase();
    await expect(rollbackSdState('SD-TEST-010', leadSnapshot, supabase)).resolves.toBeUndefined();
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
    expect(inspected, 'the scan found no protected-column write sites at all').toBeGreaterThanOrEqual(11);
    expect(unstamped).toEqual([]);
  });
});
