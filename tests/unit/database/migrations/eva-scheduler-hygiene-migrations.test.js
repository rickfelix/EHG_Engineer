// SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 — FR-2 (archive-first purge) + FR-4 (kill-time teardown).
//
// WHAT THESE TESTS CAN AND CANNOT PROVE, STATED UP FRONT so a green run is never mistaken for more
// than it is. All four migrations are TIER-2 chairman-gated and are NEVER applied by the builder, so
// nothing here proves live behaviour. Behaviour was verified separately and read-only, inside a
// single rolled-back transaction against live, by scripts/probe-eva-scheduler-hygiene-migrations.mjs
// (24/24 assertions, 2026-08-21): purge archived exactly the 45 killed-venture rows and left the 68
// keep rows untouched; select_schedulable_ventures() then offered 0 killed ventures; the DOWN
// restored all 113 rows with a matching whole-table md5 fingerprint; the widened CHECK accepted
// 'cancelled'; and a direct `UPDATE ventures SET status='cancelled'` moved the venture's pending
// queue row to 'cancelled' while leaving dispatching/blocked/paused/completed rows alone.
//
// What these tests DO pin is the SHAPE of the staged SQL — specifically the handful of decisions that
// are silently reversible by a well-meaning edit, and where being wrong produces something that still
// runs. Each is a defect that would NOT throw:
//   * a DOWN that pre-clears on `id` instead of `venture_id` (23505 on the OTHER unique index)
//   * a restore whose column list drops a writable column (rows come back holding defaults)
//   * `WHERE venture_id = NEW.id` in the teardown (compiles, runs, matches nothing, forever)
//   * a CREATE OR REPLACE rebuilt from the stale 20260315 file (silently drops the is_demo guard)
//   * a forged `@approved-by` header (turns a chairman gate into a rubber stamp)
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChairmanGatedMarker } from '../../../../scripts/check-migration-readiness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const mig = (f) => path.join(root, 'database/migrations', f);

const FILES = {
  purgeUp:     '20260821_purge_killed_venture_scheduler_queue.sql',
  purgeDown:   '20260821_purge_killed_venture_scheduler_queue_DOWN.sql',
  widenUp:     '20260821_eva_scheduler_queue_status_add_cancelled.sql',
  widenDown:   '20260821_eva_scheduler_queue_status_add_cancelled_DOWN.sql',
  teardownUp:  '20260821_eva_scheduler_queue_kill_time_teardown.sql',
  teardownDown:'20260821_eva_scheduler_queue_kill_time_teardown_DOWN.sql',
};
const SQL = Object.fromEntries(
  Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(mig(f), 'utf8')]),
);

/** Strip `--` comments so an assertion can never be satisfied by prose in a header. */
const code = (s) => s.replace(/^\s*--.*$/gm, '');
/** Collapse whitespace for structural comparison. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * The ONE statement starting at `marker`, up to its terminating semicolon.
 *
 * Slicing to end-of-file instead is how two of these assertions originally passed against a mutant:
 * the DELETE assertion matched an EXISTS clause in the post-assert block below it, and the
 * attgenerated assertion matched a second, unrelated catalog query. An assertion whose subject is
 * "everything after this point" is not pinned to the thing it names.
 */
const stmtAt = (sql, marker) => {
  const a = sql.indexOf(marker);
  if (a < 0) return '';
  return sql.slice(a, sql.indexOf(';', a) + 1);
};

describe('TS-1: the chairman gate is intact and cannot be satisfied by these files alone', () => {
  it.each(Object.entries(FILES))('%s carries a parseable @chairman-gated marker', (key) => {
    // Uses the REAL parser from check-migration-readiness.mjs, not a re-implemented regex, so this
    // cannot drift away from the thing that actually classifies the migration at merge time.
    expect(parseChairmanGatedMarker(SQL[key])).toBe(true);
  });

  // THE LOAD-BEARING ONE. scripts/lib/migration-guards.js requires an `@approved-by` matching
  // `git config user.email` before --prod-deploy will run. A builder that writes that line has
  // manufactured the chairman's approval. Absence is the whole point of "APPLY IS NOT MINE".
  it.each(Object.keys(FILES))('%s carries NO @approved-by attestation', (key) => {
    expect(SQL[key]).not.toMatch(/^\s*--\s*@approved-by:/m);
  });

  // apply-migration.js wraps every file in BEGIN/COMMIT (scripts/apply-migration.js:341/430). An
  // inner COMMIT would end that transaction early and break the all-or-nothing property the
  // quarantine-then-delete sequence depends on.
  it.each(Object.keys(FILES))('%s does not open or close its own transaction', (key) => {
    expect(code(SQL[key])).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/mi);
  });

  // Named $tag$ DO blocks are shredded by splitPostgreSQLStatements; every file using them must say so.
  it.each(Object.keys(FILES))('%s warns against --split-statements when it uses named $tag$ blocks', (key) => {
    if (/\$[a-z_]+\$/i.test(code(SQL[key]))) {
      expect(SQL[key]).toMatch(/split-statements/);
    }
  });
});

describe('TS-2: FR-2 UP — archive strictly before delete, and the delete is doubly bound', () => {
  const up = code(SQL.purgeUp);

  it('creates the quarantine snapshot BEFORE the DELETE, not after', () => {
    const create = up.indexOf('CREATE TABLE eva_scheduler_queue_qkilled20260821');
    const del = up.indexOf('DELETE FROM eva_scheduler_queue');
    expect(create).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(-1);
    expect(create).toBeLessThan(del);
  });

  it('is one-shot: aborts when the quarantine table already exists', () => {
    expect(up).toMatch(/to_regclass\('public\.eva_scheduler_queue_qkilled20260821'\)\s+IS NOT NULL/);
  });

  it('freezes BOTH tables the predicate spans, for the whole transaction', () => {
    expect(up).toMatch(/LOCK TABLE eva_scheduler_queue\s+IN ACCESS EXCLUSIVE MODE/);
    expect(up).toMatch(/LOCK TABLE eva_ventures\s+IN ACCESS EXCLUSIVE MODE/);
  });

  // TWO-SIDED. Binding to the snapshot alone would delete a row whose venture was un-killed after
  // the snapshot; re-verifying alone would let the delete exceed the restorable set. Both, or the
  // migration is not reversible-and-correct.
  it('binds the DELETE to the archive by id AND re-verifies kill status at delete time', () => {
    const del = stmtAt(up, 'DELETE FROM eva_scheduler_queue');
    expect(del).toMatch(/USING eva_scheduler_queue_qkilled20260821 s/);
    expect(del).toMatch(/q\.id = s\.id/);
    expect(del).toMatch(/EXISTS\s*\(\s*SELECT 1 FROM eva_ventures v\s+WHERE v\.id = q\.venture_id\s+AND v\.status = 'killed'/);
  });

  it('computes the set from a live predicate, never from hardcoded ids', () => {
    // A bare UUID literal anywhere in the executable SQL would mean the set was pinned at authoring.
    expect(up).not.toMatch(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i);
  });

  it('refuses to purge in-flight (dispatching) work', () => {
    expect(up).toMatch(/status = 'dispatching'/);
  });

  // The requested "UP must not name blocking_decision_age_seconds in an INSERT column list" — the
  // honest form of it. The UP snapshots with CTAS and has no INSERT into the queue at all, so there
  // is no column list that could name a generated column.
  it('never INSERTs into eva_scheduler_queue, so it has no column list to get wrong', () => {
    expect(up).not.toMatch(/INSERT\s+INTO\s+(public\.)?eva_scheduler_queue\b/i);
    expect(up).toMatch(/CREATE TABLE eva_scheduler_queue_qkilled20260821 AS\s+SELECT q\.\*/);
  });

  it('asserts the OUTCOME the scheduler sees, not merely the table state', () => {
    expect(up).toMatch(/select_schedulable_ventures\(1000\)/);
  });
});

describe('TS-3: FR-2 DOWN — the two decisions that fail silently if reversed', () => {
  const down = code(SQL.purgeDown);

  // DECISION 1. eva_scheduler_queue has a UNIQUE index on venture_id (idx_esq_venture_id) as well as
  // its id primary key, and fn_auto_enqueue_venture re-enqueues on any eva_ventures INSERT. A row
  // that reappeared for a purged venture collides on venture_id — which ON CONFLICT (id) does not
  // name and therefore cannot absorb.
  it('pre-clears on venture_id (the colliding axis), not only on id', () => {
    const del = down.slice(down.indexOf('DELETE FROM eva_scheduler_queue t'));
    expect(del).toMatch(/t\.venture_id = s\.venture_id/);
    expect(del).toMatch(/t\.id = s\.id/);
  });

  it('does NOT try to absorb the collision with ON CONFLICT', () => {
    expect(down).not.toMatch(/ON CONFLICT/i);
  });

  it('archives the interlopers BEFORE the pre-clear destroys them', () => {
    const archive = down.indexOf('CREATE TABLE eva_scheduler_queue_qkilled20260821_interlopers');
    const clear = down.indexOf('DELETE FROM eva_scheduler_queue t');
    expect(archive).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(-1);
    expect(archive).toBeLessThan(clear);
  });

  // DECISION 2. The 20260213 CREATE TABLE declares blocking_decision_age_seconds as GENERATED ALWAYS
  // ... STORED (unwritable, 428C9), but the LIVE column is a plain writable NUMERIC DEFAULT 0
  // (pg_attribute.attgenerated = '' for all 14 columns, measured 2026-08-21 and confirmed by writing
  // to it in a rolled-back transaction). Hardcoding EITHER choice is wrong under the other shape:
  // naming it breaks the restore if it is ever generated again; excluding it silently resets all 45
  // rows to the default. The catalog predicate is correct under both.
  it('derives the INSERT column list from the catalog, excluding generated columns', () => {
    // Scoped to the statement that actually BUILDS v_cols. The NOT NULL tripwire further down also
    // filters on attgenerated, so a file-wide match stayed green when this predicate was deleted.
    const colBuilder = stmtAt(down, 'SELECT string_agg(quote_ident(a.attname)');
    expect(colBuilder).toMatch(/INTO v_cols, v_qcols, v_tcols/);
    expect(colBuilder).toMatch(/a\.attgenerated = ''/);
    expect(down).toMatch(/EXECUTE format\(\s*'INSERT INTO public\.eva_scheduler_queue \(%s\) SELECT %s FROM public\.%I'/);
  });

  it('applies the generated-column filter to the NOT NULL tripwire too', () => {
    const tripwire = stmtAt(down, 'SELECT string_agg(a.attname');
    expect(tripwire).toMatch(/INTO v_missing/);
    expect(tripwire).toMatch(/a\.attgenerated = ''/);
  });

  it('hardcodes no column list at all — neither including nor excluding the disputed column', () => {
    expect(down).not.toMatch(/INSERT INTO (public\.)?eva_scheduler_queue\s*\([a-z_]/i);
    // blocking_decision_age_seconds must not appear in executable SQL as a literal identifier;
    // the header discusses it, but code() has stripped the header.
    expect(down).not.toMatch(/blocking_decision_age_seconds/);
  });

  // A count-only assert passes on a restore that wrote defaults into every column — exactly the
  // failure mode decision 2 exists to prevent. Value identity is the assertion that has teeth.
  it('asserts VALUE identity per column, not just a restored row count', () => {
    expect(down).toMatch(/ROW\(%s\) IS DISTINCT FROM ROW\(%s\)/);
  });

  it('aborts rather than half-restoring when the archive predates a schema change', () => {
    expect(down).toMatch(/attnotnull/);
    expect(down).toMatch(/pg_attrdef/);
    expect(down).toMatch(/archive cannot supply live NOT NULL column/);
  });
});

describe('TS-4: FR-4 step 1 — the CHECK is widened, never narrowed by accident', () => {
  const widen = code(SQL.widenUp);

  /** The IN-list the ADD CONSTRAINT actually installs. */
  const inList = (sql) => {
    const add = sql.slice(sql.indexOf('ADD CONSTRAINT eva_scheduler_queue_status_check'));
    const body = add.slice(add.indexOf('CHECK'), add.indexOf('));') + 1);
    return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  };

  it('installs exactly the five original values plus cancelled', () => {
    expect(new Set(inList(widen))).toEqual(
      new Set(['pending', 'dispatching', 'blocked', 'paused', 'completed', 'cancelled']),
    );
  });

  it('preserves every original value — a widening that drops one is a silent narrowing', () => {
    for (const v of ['pending', 'dispatching', 'blocked', 'paused', 'completed']) {
      expect(inList(widen), `original value ${v} must survive`).toContain(v);
    }
  });

  it('uses DROP IF EXISTS + ADD on the same constraint name', () => {
    expect(widen).toMatch(/DROP CONSTRAINT IF EXISTS eva_scheduler_queue_status_check/);
    expect(widen).toMatch(/ADD CONSTRAINT eva_scheduler_queue_status_check/);
  });

  // Reading the definition back only proves the string contains 'cancelled'. Exercising it proves
  // the constraint ADMITS the value.
  it('verifies by exercising the constraint, then undoing the probe', () => {
    expect(widen).toMatch(/UPDATE eva_scheduler_queue SET status = 'cancelled'/);
    expect(widen).toMatch(/esqc_probe_ok/);
  });

  it('its DOWN narrows back to exactly the five originals', () => {
    expect(new Set(inList(code(SQL.widenDown)))).toEqual(
      new Set(['pending', 'dispatching', 'blocked', 'paused', 'completed']),
    );
  });

  // Narrowing is the one direction that can invalidate stored rows. It must refuse, not rewrite.
  it('its DOWN aborts (rather than rewriting rows) when cancelled rows exist', () => {
    expect(code(SQL.widenDown)).toMatch(/would be invalidated by narrowing the constraint/);
    expect(code(SQL.widenDown)).not.toMatch(/UPDATE eva_scheduler_queue SET status =/);
  });
});

describe('TS-5: FR-4 step 2 — 100% of existing behaviour preserved, new logic only ADDED', () => {
  const bodyOf = (sql) => {
    const s = sql.indexOf('AS $function$');
    return sql.slice(s, sql.indexOf('$function$;', s));
  };
  const upBody = bodyOf(SQL.teardownUp);
  const downBody = bodyOf(SQL.teardownDown);

  const TEARDOWN_START = '-- ── SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 (FR-4): KILL-TIME SCHEDULER TEARDOWN';
  const teardownBlock = (() => {
    const a = upBody.indexOf(TEARDOWN_START);
    const b = upBody.indexOf('─────────────────────────────────────────────────────────────────────────────────────────', a + TEARDOWN_START.length);
    return upBody.slice(a, upBody.indexOf('\n', b) + 1);
  })();

  // THE STRUCTURAL PROOF. Rather than eyeballing "we preserved everything", remove the added block
  // and require what remains to be the pre-change function EXACTLY. Any incidental edit to the
  // preserved logic — a dropped guard, a reworded CASE arm — breaks this.
  it('the UP body minus the teardown block is byte-identical to the pre-change body', () => {
    expect(teardownBlock.length).toBeGreaterThan(200); // the slice actually found the block
    expect(norm(upBody.replace(teardownBlock, ''))).toBe(norm(downBody));
  });

  it('preserves the SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-F is_demo guard', () => {
    // Reconstructing this function from database/migrations/20260315_fix_eva_ventures_status_sync.sql
    // — which predates the guard — would silently re-open the demo-fixture leak.
    expect(upBody).toMatch(/IF COALESCE\(NEW\.is_demo, false\) THEN\s+RETURN NEW;/);
    expect(downBody).toMatch(/IF COALESCE\(NEW\.is_demo, false\) THEN\s+RETURN NEW;/);
  });

  it('preserves the complete five-way status map and the stage/name syncs', () => {
    for (const arm of [/'active'\s+THEN 'active'/, /'paused'\s+THEN 'paused'/, /'cancelled' THEN 'killed'/,
      /'completed' THEN 'graduated'/, /'archived'\s+THEN 'paused'/]) {
      expect(upBody).toMatch(arm);
    }
    expect(upBody).toMatch(/OLD\.current_lifecycle_stage IS DISTINCT FROM NEW\.current_lifecycle_stage/);
    expect(upBody).toMatch(/OLD\.name IS DISTINCT FROM NEW\.name/);
  });

  it('preserves SECURITY DEFINER and the pinned search_path', () => {
    expect(SQL.teardownUp).toMatch(/SECURITY DEFINER/);
    expect(SQL.teardownUp).toMatch(/SET search_path TO 'public'/);
  });
});

describe('TS-6: FR-4 step 2 — the teardown itself is narrow, and is not dead by construction', () => {
  const up = code(SQL.teardownUp);

  /** JUST the teardown UPDATE statement. Slicing to EOF instead swallows the legitimate
   *  `UPDATE eva_ventures ... WHERE venture_id = NEW.id` name-sync below it — where that one-hop
   *  predicate is CORRECT, because eva_ventures.venture_id really is a ventures.id. Scoping is what
   *  makes the next assertion mean what it claims. */
  const teardownStmt = (() => {
    const a = up.indexOf('UPDATE eva_scheduler_queue');
    return up.slice(a, up.indexOf(';', a) + 1);
  })();

  it('only ever transitions PENDING rows', () => {
    const block = teardownStmt;
    expect(block).toMatch(/SET status = 'cancelled'/);
    expect(block).toMatch(/WHERE status = 'pending'/);
  });

  // THE DEAD-BY-CONSTRUCTION TRAP. eva_scheduler_queue.venture_id REFERENCES eva_ventures(id), while
  // NEW.id is a ventures.id. `WHERE venture_id = NEW.id` compiles, runs, and matches ZERO rows
  // forever — a teardown that reads as wired while doing nothing. Both directions asserted.
  it('joins ventures.id -> eva_ventures.venture_id -> eva_ventures.id (two hops)', () => {
    expect(up).toMatch(/venture_id IN \(\s*SELECT ev\.id FROM eva_ventures ev WHERE ev\.venture_id = NEW\.id\s*\)/);
  });

  it('never uses the naive one-hop predicate that would silently match nothing', () => {
    expect(teardownStmt).not.toMatch(/WHERE venture_id = NEW\.id/);
    expect(teardownStmt).not.toMatch(/AND venture_id = NEW\.id/);
    // ...while the name-sync statement legitimately DOES use it, proving the scoping is real.
    expect(up).toMatch(/UPDATE eva_ventures\s+SET name = NEW\.name[\s\S]*?WHERE venture_id = NEW\.id/);
  });

  it('keys off the mapped status actually written to eva_ventures, not off NEW.status', () => {
    expect(up).toMatch(/IF v_mapped_status = 'killed' THEN/);
  });

  it('fires inside the status-change branch, so an unrelated update cannot trigger it', () => {
    const branch = up.indexOf('IF OLD.status IS DISTINCT FROM NEW.status THEN');
    const teardown = up.indexOf("IF v_mapped_status = 'killed' THEN");
    expect(branch).toBeGreaterThan(-1);
    expect(teardown).toBeGreaterThan(branch);
  });
});

describe('TS-7: the apply-order dependency is enforced in SQL, not just documented in prose', () => {
  // Applying the teardown before the widened CHECK turns every venture cancellation into a 23514.
  // A comment saying "apply the other one first" is not enforcement.
  it('the teardown refuses to install unless cancelled is already a legal status', () => {
    const t = code(SQL.teardownUp);
    expect(t).toMatch(/conname\s*=\s*'eva_scheduler_queue_status_check'/);
    expect(t).toMatch(/does not permit cancelled/);
  });

  it('the CHECK rollback refuses to narrow while the teardown writer is still live', () => {
    const w = code(SQL.widenDown);
    expect(w).toMatch(/proname = 'sync_ventures_to_eva_ventures_update'/);
    expect(w).toMatch(/still writes eva_scheduler_queue/);
  });

  it('both files name their counterpart file explicitly', () => {
    expect(SQL.teardownUp).toContain(FILES.widenUp);
    expect(SQL.widenUp).toContain(FILES.teardownUp);
    expect(SQL.widenDown).toContain(FILES.teardownDown);
  });

  // A rollback must not silently re-arm dead ventures for dispatch — that is the hazard the SD exists
  // to remove, and it must never be an automatic side effect.
  it('the teardown rollback does NOT move cancelled rows back to pending', () => {
    expect(code(SQL.teardownDown)).not.toMatch(/SET status = 'pending'/);
  });
});
