// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — the DDL tier for
// database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN
//
// This runs against an EPHEMERAL vanilla PostgreSQL with a hand-stubbed ~12-object NARROW schema:
// strategic_directives_v2 reduced to the columns this guard and these fixtures actually touch, four
// cascade-origin tables, one probe table, three NO-OP instrumented stand-ins for real sibling
// triggers, and one synthetic mid-sort mutator. It is deliberately NOT a transitive clone of the
// real table's 35 BEFORE ROW triggers and their ~15 dependent functions — 34 of those 35 are
// irrelevant to this guard, and cloning them would be an unbounded excavation buying nothing.
//
// A green run proves the migration's OWN logic: the guard rejects unstamped protected-column writes,
// accepts registry-stamped ones, leaves unprotected columns alone, survives a mid-sort mutator, is
// NULL at rest, and fails closed when the registry is unavailable. It does NOT prove:
//
//   - PRODUCTION FIRING ORDER. The stub has ~7 BEFORE ROW triggers; the real table has 35. The
//     aaa_/zzz_ bound against the REAL estate is asserted by the migration's own $verify$ block at
//     APPLY time (FR-2 Stage 2) and by a read-only catalog query during EXEC (FR-2 Stage 1) — not
//     here. A green ordering test here is about this stub's 7 triggers, nothing more.
//   - SQLSTATE ROUND-TRIP THROUGH PostgREST (TS-29 / FR-1 AC#5). This tier has no PostgREST, no RLS,
//     no supabase-js. `error.code === 'SDCW1'` reaching a JS caller is a claim about a layer that
//     does not exist here; it needs the live-PostgREST tier (cf. scripts/anon-write-contract-probe.mjs).
//     TS-29 is EXPLICITLY DEFERRED, not covered by any assertion below.
//   - PRODUCTION POSTURE. Vanilla Postgres does not reproduce Supabase role inheritance or ALTER
//     DEFAULT PRIVILEGES, so a green GRANT here is compatible with a different grant surface live.
//   - THAT THE REAL cascade/RPC FUNCTIONS BEHAVE. complete_orchestrator_sd and the two
//     fn_atomic_*_transition RPCs are CREATED here (plpgsql bodies are only syntax-checked at
//     creation) but are NOT CALLABLE on this stub — the tables they read do not exist. Their
//     coverage below is (a) a static assertion on their SQL text and (b) a simulated write in their
//     exact shape, which is what TS-8/TS-9/TS-12 ask for. It is not a behavioural proof of the real
//     functions.
//
// Read a passing run as "the guard's own logic does what it claims", not as "the migration is safe
// to apply". Those are different claims, and TR-1 keeps them separate on purpose: this SD applies
// no live DDL at all.
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly rather than
// silently passing (matches tests/ddl/venture-ingest-key-binding-ddl.db.test.js's convention).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATION_PATH = fileURLToPath(
  new URL(
    '../../database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql',
    import.meta.url,
  ),
);
// STEP 1 of the deploy order — the stamp column, in its own independently-appliable migration so the
// code branch can merge without waiting on the full guard ceremony's review. The guard migration
// REFUSES to apply without it, which is asserted below rather than assumed.
const COLUMN_MIGRATION_PATH = fileURLToPath(
  new URL(
    '../../database/chairman-gated/20260824_strategic_directives_lifecycle_write_token_column.sql',
    import.meta.url,
  ),
);
const EVIDENCE_DIR = fileURLToPath(new URL('../../database/evidence/canonical-writer-choke/', import.meta.url));

// A repo-level EOL hook rewrites checked-in files to CRLF. Every comparison below is against
// LF-normalized text, or an anchor that is genuinely present would read as missing.
const readLF = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const MIGRATION_SQL = readLF(MIGRATION_PATH);
const COLUMN_MIGRATION_SQL = readLF(COLUMN_MIGRATION_PATH);

const AMENDED_FUNCTIONS = [
  'auto_transition_status',
  'complete_orchestrator_sd',
  'fn_atomic_lead_to_plan_transition',
  'fn_atomic_exec_to_plan_transition',
  'update_sd_after_exec_completion',
  'update_sd_after_lead_evaluation',
  'update_sd_after_plan_validation',
  'update_sd_progress_from_phases',
];

const artifact = (name, kind) => readLF(`${EVIDENCE_DIR}${name}.${kind}.sql`);
const definitionOf = (text) => text.slice(text.indexOf('CREATE OR REPLACE FUNCTION')).replace(/\s+$/, '');

/**
 * Every `UPDATE ... strategic_directives_v2 ... ;` statement in a block of SQL, as raw text.
 * Naive on purpose (splits at the next semicolon): none of the statements it is pointed at contain
 * a semicolon inside a string literal, and a parser here would be more machinery than the claim.
 */
function sdUpdateStatements(sql) {
  const out = [];
  const re = /UPDATE\s+(?:public\.)?strategic_directives_v2\b/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const end = sql.indexOf(';', m.index);
    out.push(sql.slice(m.index, end === -1 ? sql.length : end));
  }
  return out;
}

// ── The stub. Narrow by design; see the header block. ──────────────────────────────────────────
const STUB_SCHEMA = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN;  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;

-- Only the columns the guard's predicate, the amended function bodies, and the fixtures touch.
CREATE TABLE IF NOT EXISTS public.strategic_directives_v2 (
  id                  TEXT PRIMARY KEY,
  uuid_id             UUID NOT NULL DEFAULT gen_random_uuid(),
  sd_key              TEXT NOT NULL,
  status              VARCHAR NOT NULL,
  current_phase       TEXT DEFAULT 'LEAD_APPROVAL',
  completion_date     TIMESTAMPTZ,
  progress            INTEGER DEFAULT 0,
  progress_percentage INTEGER DEFAULT 0,
  metadata            JSONB DEFAULT '{}'::jsonb,
  dependencies        JSONB DEFAULT '[]'::jsonb,
  is_working_on       BOOLEAN DEFAULT false,
  is_active           BOOLEAN DEFAULT true,
  priority            VARCHAR NOT NULL DEFAULT 'medium',
  claiming_session_id TEXT,
  active_session_id   TEXT,
  cancellation_reason TEXT,
  transition_version  INTEGER DEFAULT 1,
  parent_sd_id        TEXT,
  updated_by          VARCHAR,
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Firing-order / depth observation channel.
CREATE TABLE IF NOT EXISTS public._ddl_probe (
  seq   SERIAL PRIMARY KEY,
  tg    TEXT,
  depth INTEGER,
  note  TEXT
);

CREATE OR REPLACE FUNCTION public._ddl_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public._ddl_probe(tg, depth) VALUES (TG_NAME, pg_trigger_depth());
  RETURN NEW;
END;
$$;

-- NO-OP instrumented stand-ins for three of the four siblings FR-2 names. They exist to record
-- firing order, not to reproduce logic — 'auto_calculate_progress' recalculating progress or
-- 'enforce_progress_on_completion' raising would be reproducing behaviour this guard does not
-- interact with. The FOURTH sibling (status_auto_transition) is NOT a stand-in: it is recreated
-- VERBATIM from live pg_get_functiondef below, because FR-2 AC#4 and TS-25 both turn on its exact
-- predicate.
CREATE TRIGGER auto_calculate_progress_trigger BEFORE UPDATE ON public.strategic_directives_v2
  FOR EACH ROW EXECUTE FUNCTION public._ddl_record();
CREATE TRIGGER enforce_handoff_trigger BEFORE UPDATE ON public.strategic_directives_v2
  FOR EACH ROW EXECUTE FUNCTION public._ddl_record();
CREATE TRIGGER enforce_progress_trigger BEFORE UPDATE ON public.strategic_directives_v2
  FOR EACH ROW EXECUTE FUNCTION public._ddl_record();

-- Cascade origin tables, real names, minimal columns.
CREATE TABLE IF NOT EXISTS public.exec_implementation_sessions (
  id SERIAL PRIMARY KEY, sd_id TEXT, status TEXT, quality_score INTEGER
);
CREATE TABLE IF NOT EXISTS public.lead_evaluations (
  id SERIAL PRIMARY KEY, sd_id TEXT, final_decision TEXT
);
CREATE TABLE IF NOT EXISTS public.plan_technical_validations (
  id SERIAL PRIMARY KEY, sd_id TEXT, final_decision TEXT
);
CREATE TABLE IF NOT EXISTS public.sd_phase_tracking (
  id SERIAL PRIMARY KEY, sd_id TEXT, phase_name TEXT, is_complete BOOLEAN DEFAULT false
);
CREATE OR REPLACE FUNCTION public.calculate_sd_progress(p_sd_id TEXT)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 50 $$;

-- TS-11's driver. ONE wrapper, parameterised by the token column, so the stamped pass (which
-- commits, and whose probe rows therefore prove the guard chain genuinely ran at depth 2) and the
-- unstamped pass (which is rejected) exercise the IDENTICAL code path. The wrapper captures the
-- SQLSTATE in a subtransaction and then records it OUTSIDE that subtransaction, so the rejection
-- survives to be asserted instead of rolling back invisibly.
CREATE TABLE IF NOT EXISTS public._ddl_cascade_driver (
  id                SERIAL PRIMARY KEY,
  sd_id             TEXT,
  token             TEXT,
  captured_sqlstate TEXT,
  captured_message  TEXT,
  wrapper_depth     INTEGER
);

CREATE OR REPLACE FUNCTION public._ddl_cascade_wrapper() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_code text := NULL;
  v_msg  text := NULL;
BEGIN
  BEGIN
    UPDATE public.strategic_directives_v2
       SET status = 'completed', lifecycle_write_token = NEW.token
     WHERE id = NEW.sd_id;
  EXCEPTION WHEN OTHERS THEN
    v_code := SQLSTATE;
    v_msg  := SQLERRM;
  END;
  UPDATE public._ddl_cascade_driver
     SET captured_sqlstate = v_code,
         captured_message  = v_msg,
         wrapper_depth     = pg_trigger_depth()
   WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ddl_cascade_driver AFTER INSERT ON public._ddl_cascade_driver
  FOR EACH ROW EXECUTE FUNCTION public._ddl_cascade_wrapper();
`;

// Installed AFTER the migration, because these attach to functions the migration creates.
const POST_MIGRATION_STUB = `
CREATE TRIGGER trigger_update_sd_after_exec_completion AFTER UPDATE ON public.exec_implementation_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_sd_after_exec_completion();
CREATE TRIGGER trigger_update_sd_after_lead_eval AFTER INSERT ON public.lead_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_sd_after_lead_evaluation();
CREATE TRIGGER trigger_update_sd_after_plan_validation AFTER INSERT ON public.plan_technical_validations
  FOR EACH ROW EXECUTE FUNCTION public.update_sd_after_plan_validation();
CREATE TRIGGER trigger_update_sd_progress AFTER INSERT OR UPDATE ON public.sd_phase_tracking
  FOR EACH ROW EXECUTE FUNCTION public.update_sd_progress_from_phases();
`;

// TS-25/TS-26's synthetic "trigger #36": an author unaware of the stamp convention. Its name sorts
// strictly BETWEEN aaa_ and zzz_, so aaa_ has already passed the write by the time it mutates.
// Body and trigger are kept SEPARATE so TS-26 can swap the body without re-creating the trigger.
const MUTATOR_BODY_UNAWARE = `
CREATE OR REPLACE FUNCTION public._mmm_unaware_mutator() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.status := 'pending_approval';
  RETURN NEW;
END;
$$;`;

// TS-26: the SAME mutator, but self-stamping the way FR-1's auto_transition_status does.
const MUTATOR_BODY_AWARE = `
CREATE OR REPLACE FUNCTION public._mmm_unaware_mutator() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lifecycle_write_token IS NULL THEN
    NEW.lifecycle_write_token := 'auto_transition_status';
  END IF;
  NEW.status := 'pending_approval';
  RETURN NEW;
END;
$$;`;

const MUTATOR_TRIGGER = `
CREATE TRIGGER mmm_test_unaware_mutator BEFORE UPDATE ON public.strategic_directives_v2
  FOR EACH ROW EXECUTE FUNCTION public._mmm_unaware_mutator();`;

let client;
let seedCounter = 0;

/** Both chairman-gated files, in the order the ceremony applies them. */
async function applyMigration() {
  await client.query(COLUMN_MIGRATION_SQL);
  await client.query(MIGRATION_SQL);
}

/** Insert a fresh SD row and return its id. Every scenario gets its own row — no shared fixture. */
async function seedSd(overrides = {}) {
  seedCounter += 1;
  const id = `SD-DDL-CANON-${String(seedCounter).padStart(4, '0')}`;
  const row = {
    id,
    sd_key: id,
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    completion_date: null,
    progress: 0,
    is_working_on: false,
    ...overrides,
  };
  await client.query(
    `INSERT INTO public.strategic_directives_v2
       (id, sd_key, status, current_phase, completion_date, progress, is_working_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [row.id, row.sd_key, row.status, row.current_phase, row.completion_date, row.progress, row.is_working_on],
  );
  return id;
}

/** Run a statement, returning the error rather than throwing, so assertions can inspect it. */
async function attempt(sql, params = []) {
  try {
    const res = await client.query(sql, params);
    return { ok: true, res };
  } catch (error) {
    return { ok: false, error };
  }
}

const readSd = async (id) => {
  const { rows } = await client.query('SELECT * FROM public.strategic_directives_v2 WHERE id = $1', [id]);
  return rows[0];
};

const clearProbe = () => client.query('TRUNCATE public._ddl_probe RESTART IDENTITY');
const probeRows = async () => (await client.query('SELECT * FROM public._ddl_probe ORDER BY seq')).rows;

beforeAll(async () => {
  client = new pg.Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'ddl_check',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
  });
  await client.connect();
  await client.query(STUB_SCHEMA);

  // status_auto_transition, VERBATIM from the checked-in live capture — never paraphrased. The
  // migration then CREATE OR REPLACEs it with the amended body, so this is the genuine pre-state.
  await client.query(definitionOf(artifact('auto_transition_status', 'before')));
  await client.query(`CREATE TRIGGER status_auto_transition BEFORE UPDATE ON public.strategic_directives_v2
    FOR EACH ROW EXECUTE FUNCTION public.auto_transition_status();`);

  await applyMigration();
  await client.query(POST_MIGRATION_STUB);
}, 120_000);

afterAll(async () => {
  if (client) await client.end();
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('the migration applied', () => {
  it('is re-runnable from the top (MODE 2 partial-apply recovery)', async () => {
    // Every statement is existence-guarded, so a second full apply must not throw. A bare await is
    // the whole assertion (applyMigration resolves undefined; wrapping it in .resolves.toBeTruthy()
    // would fail unconditionally — a mistake a sibling DDL file already shipped once).
    await applyMigration();
  });

  it('added lifecycle_write_token nullable, DEFAULT NULL, requiring no backfill', async () => {
    const { rows } = await client.query(`
      SELECT is_nullable, column_default, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='strategic_directives_v2'
        AND column_name='lifecycle_write_token'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('YES');
    expect(rows[0].column_default).toBeNull();
    expect(rows[0].data_type).toBe('text');
  });

  it('created both guard triggers as BEFORE ROW UPDATE, sharing one guard function', async () => {
    const { rows } = await client.query(`
      SELECT t.tgname, p.proname, (t.tgtype & 2)=2 AS is_before, (t.tgtype & 1)=1 AS is_row,
             (t.tgtype & 16)>0 AS on_update, (t.tgtype & 4)>0 AS on_insert
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE c.relname='strategic_directives_v2' AND NOT t.tgisinternal
        AND t.tgname IN ('aaa_enforce_canonical_lifecycle_write',
                         'zzz_enforce_canonical_lifecycle_write_final')
      ORDER BY t.tgname::text COLLATE "C"`);
    expect(rows.map((r) => r.tgname)).toEqual([
      'aaa_enforce_canonical_lifecycle_write',
      'zzz_enforce_canonical_lifecycle_write_final',
    ]);
    for (const r of rows) {
      expect(r.proname).toBe('enforce_canonical_lifecycle_write');
      expect(r.is_before).toBe(true);
      expect(r.is_row).toBe(true);
      expect(r.on_update).toBe(true);
      // BEFORE UPDATE only — never BEFORE INSERT. This is what makes the column addition fully
      // additive: SD creation paths never see the guard (FR-3 AC#5, TS-24).
      expect(r.on_insert).toBe(false);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('DEPLOY ORDER — the guard migration refuses to apply without the column migration', () => {
  const DROP_GUARDS = `
    DROP TRIGGER IF EXISTS aaa_enforce_canonical_lifecycle_write ON public.strategic_directives_v2;
    DROP TRIGGER IF EXISTS zzz_enforce_canonical_lifecycle_write_final ON public.strategic_directives_v2;`;

  it('aborts with an actionable message naming the prerequisite file', async () => {
    // Why this matters beyond tidiness: PostgREST returns PGRST204 for a payload naming a column
    // absent from its schema cache, BEFORE matching any row — so shipping the wired code without the
    // column takes every handoff transition down, and PGRST204 is not SDCW1, so the compensation
    // paths swallow it. Making the dependency machine-enforced is what stops the ceremony being run
    // out of order.
    await client.query(DROP_GUARDS);
    await client.query('ALTER TABLE public.strategic_directives_v2 DROP COLUMN lifecycle_write_token');
    try {
      await expect(client.query(MIGRATION_SQL)).rejects.toThrow(
        /lifecycle_write_token does not exist[\s\S]*lifecycle_write_token_column\.sql FIRST/,
      );
      // ...and it aborted BEFORE creating anything.
      const { rows } = await client.query(`
        SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'strategic_directives_v2' AND NOT t.tgisinternal
          AND t.tgname IN ('aaa_enforce_canonical_lifecycle_write',
                           'zzz_enforce_canonical_lifecycle_write_final')`);
      expect(rows[0].n).toBe(0);
    } finally {
      await applyMigration();
    }
  });

  it('[MIRROR] with the column migration applied first, the identical file applies cleanly', async () => {
    // Without this, an abort-always precondition would pass the case above.
    const { rows } = await client.query(`
      SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'strategic_directives_v2' AND NOT t.tgisinternal
        AND t.tgname IN ('aaa_enforce_canonical_lifecycle_write',
                         'zzz_enforce_canonical_lifecycle_write_final')`);
    expect(rows[0].n).toBe(2);
  });

  it('the column migration owns the ADD COLUMN, and the guard migration no longer does', () => {
    expect(COLUMN_MIGRATION_SQL).toMatch(/ADD COLUMN IF NOT EXISTS lifecycle_write_token TEXT/);
    // On STATEMENTS, not prose — the guard migration's header legitimately explains where the
    // ADD COLUMN went, and a check that fired on that would push the explanation out of the file.
    expect(MIGRATION_SQL.split('\n').filter((l) => /^\s*ALTER TABLE/.test(l))).toEqual([]);
    // POST-CEREMONY (2026-08-24T12:43Z, ceremony/20260824-sitting): the column migration is now
    // chairman-approved AND APPLIED. This asserts the header carries a real, well-formed approval
    // (matching git-config-email shape) rather than the pre-approval PENDING placeholder or a
    // malformed/self-granted stand-in — never that it remains permanently unapproved.
    expect(COLUMN_MIGRATION_SQL).not.toMatch(/@approved-by: PENDING/);
    expect(COLUMN_MIGRATION_SQL).toMatch(/@approved-by:\s*\S+@\S+/);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('RE-APPLY AFTER A MODE 1 ROLLBACK — the guard must not re-arm blind', () => {
  // MODE 1 drops zzz_ (the only at-rest NULLer) while RETAINING the column and every stamping
  // writer, so registry-valid stamps accumulate at rest for the whole rollback window — on exactly
  // the rows the pipeline touches most. Re-arming aaa_ over that state would let the next UNSTAMPED
  // protected write inherit a valid stamp: the F1b stale-stamp-reuse bug, resurrected.
  const DROP_ZZZ =
    'DROP TRIGGER IF EXISTS zzz_enforce_canonical_lifecycle_write_final ON public.strategic_directives_v2';

  /** Reproduce the rollback window and return an SD left carrying a valid stamp at rest. */
  async function rowStrandedWithAnAtRestStamp() {
    await client.query(DROP_ZZZ);
    const id = await seedSd({ status: 'draft' });
    await client.query(
      "UPDATE public.strategic_directives_v2 SET status='active', lifecycle_write_token='handoff.js' WHERE id=$1",
      [id],
    );
    // The window is REAL, not assumed: with zzz_ gone the stamp survives the write.
    expect((await readSd(id)).lifecycle_write_token).toBe('handoff.js');
    return id;
  }

  it('re-applying clears inherited at-rest stamps, and the re-armed guard still rejects', async () => {
    const id = await rowStrandedWithAnAtRestStamp();
    await applyMigration();

    expect((await readSd(id)).lifecycle_write_token).toBeNull();
    const { ok, error } = await attempt(
      "UPDATE public.strategic_directives_v2 SET status='completed' WHERE id=$1",
      [id],
    );
    expect(ok).toBe(false);
    expect(error.code).toBe('SDCW1');
    expect((await readSd(id)).status).toBe('active');
  });

  it('[MIRROR] arming the guard WITHOUT the reset accepts that same unstamped write — the bug', async () => {
    // This is what makes the test above about the reset rather than about anything else in the
    // migration. Re-create both triggers by hand, skipping only $reset_at_rest$, and the identical
    // unstamped protected-column write is wrongly ADMITTED.
    const id = await rowStrandedWithAnAtRestStamp();
    try {
      await client.query(`
        CREATE TRIGGER zzz_enforce_canonical_lifecycle_write_final
          BEFORE UPDATE ON public.strategic_directives_v2
          FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_lifecycle_write('final');`);
      const { ok, error } = await attempt(
        "UPDATE public.strategic_directives_v2 SET status='completed' WHERE id=$1",
        [id],
      );
      expect(error, 'the stale stamp should have been inherited and wrongly accepted').toBeUndefined();
      expect(ok).toBe(true);
      expect((await readSd(id)).status).toBe('completed');
    } finally {
      await applyMigration();
    }
  });

  it('REFUSES to reset when clearing a stamp would make a SIBLING flip the status', async () => {
    // The reset's own SET clause touches no protected column, so neither guard fires on it. But
    // status_auto_transition has no TG_OP guard and no IS DISTINCT FROM — it fires on EVERY update
    // and assigns NEW.status whenever current_phase IN ('EXEC','PLAN') AND progress >= 100. On such
    // a row this maintenance statement would SILENTLY FLIP A LIFECYCLE STATUS, in bulk, mid-ceremony.
    //
    // The state is reachable only via a path that skips BEFORE UPDATE triggers — an INSERT, a
    // restore, or a trigger-disabled load — because any UPDATE that leaves a stamp also runs
    // status_auto_transition and would already have set 'pending_approval'. INSERT is exactly how
    // this fixture builds it, which is also why the check is worth its six lines.
    await client.query(
      `INSERT INTO public.strategic_directives_v2
         (id, sd_key, status, current_phase, progress, lifecycle_write_token)
       VALUES ('SD-DDL-CANON-FLIPRISK','SD-DDL-CANON-FLIPRISK','active','EXEC',100,'handoff.js')`,
    );
    try {
      await expect(client.query(MIGRATION_SQL)).rejects.toThrow(
        /would make status_auto_transition silently flip their status[\s\S]*SD-DDL-CANON-FLIPRISK/,
      );
      // Refused BEFORE mutating anything — the row is exactly as it was.
      const sd = await readSd('SD-DDL-CANON-FLIPRISK');
      expect(sd.status).toBe('active');
      expect(sd.lifecycle_write_token).toBe('handoff.js');
    } finally {
      await client.query("DELETE FROM public.strategic_directives_v2 WHERE id='SD-DDL-CANON-FLIPRISK'");
      await applyMigration();
    }
  });

  it('[MIRROR] a stamped row OUTSIDE that predicate resets normally — the check is not a blanket refusal', async () => {
    // Same shape, same stamp, only progress differs. Without this, a reset that refused on any dirty
    // row at all would pass the case above while making every legitimate re-apply impossible.
    await client.query(
      `INSERT INTO public.strategic_directives_v2
         (id, sd_key, status, current_phase, progress, lifecycle_write_token)
       VALUES ('SD-DDL-CANON-NOFLIP','SD-DDL-CANON-NOFLIP','active','EXEC',0,'handoff.js')`,
    );
    try {
      await applyMigration();
      const sd = await readSd('SD-DDL-CANON-NOFLIP');
      expect(sd.lifecycle_write_token).toBeNull();
      expect(sd.status).toBe('active'); // untouched — no flip, because it was never in the predicate
    } finally {
      await client.query("DELETE FROM public.strategic_directives_v2 WHERE id='SD-DDL-CANON-NOFLIP'");
    }
  });

  it('the reset is present, predicated, and runs before the triggers are created', () => {
    const resetAt = MIGRATION_SQL.indexOf('$reset_at_rest$');
    const createAaaAt = MIGRATION_SQL.indexOf('CREATE TRIGGER aaa_enforce_canonical_lifecycle_write');
    const dropZzzAt = MIGRATION_SQL.indexOf(
      'DROP TRIGGER IF EXISTS zzz_enforce_canonical_lifecycle_write_final',
    );
    expect(resetAt).toBeGreaterThan(-1);
    // After BOTH drops (so no live guard evaluates the reset) and before BOTH creates (so the guard
    // is never armed over stale state).
    expect(resetAt).toBeGreaterThan(dropZzzAt);
    expect(resetAt).toBeLessThan(createAaaAt);
    // Predicated, so it is a genuine no-op on a first apply rather than a full-table rewrite.
    expect(MIGRATION_SQL).toMatch(/SET lifecycle_write_token = NULL\s*\n\s*WHERE lifecycle_write_token IS NOT NULL/);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-1..TS-3 — unstamped protected-column writes are rejected', () => {
  const cases = [
    ['TS-1 status', "UPDATE public.strategic_directives_v2 SET status='active' WHERE id=$1"],
    ['TS-2 current_phase', "UPDATE public.strategic_directives_v2 SET current_phase='PLAN_PRD' WHERE id=$1"],
    ['TS-3 completion_date', 'UPDATE public.strategic_directives_v2 SET completion_date=now() WHERE id=$1'],
  ];

  for (const [label, sql] of cases) {
    it(`${label} is rejected with SQLSTATE SDCW1 and the missing-stamp message`, async () => {
      const id = await seedSd();
      const { ok, error } = await attempt(sql, [id]);
      expect(ok).toBe(false);
      // A custom SQLSTATE, NEVER the generic P0001 a bare RAISE would produce.
      expect(error.code).toBe('SDCW1');
      expect(error.code).not.toBe('P0001');
      expect(error.message).toBe('missing canonical-writer stamp on protected-column write');
      // Rejected at position 1, before any sibling could have run.
      expect(error.detail).toContain('guard=aaa_enforce_canonical_lifecycle_write');
    });
  }

  it('the row is genuinely unchanged after a rejection', async () => {
    const id = await seedSd({ status: 'draft' });
    await attempt("UPDATE public.strategic_directives_v2 SET status='active' WHERE id=$1", [id]);
    expect((await readSd(id)).status).toBe('draft');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-4 — IS DISTINCT FROM semantics, not UPDATE OF mention-in-SET semantics', () => {
  it('setting status to the SAME value it already has is NOT rejected', async () => {
    const id = await seedSd({ status: 'draft' });
    const { ok, error } = await attempt(
      "UPDATE public.strategic_directives_v2 SET status='draft', metadata='{\"x\":1}'::jsonb WHERE id=$1",
      [id],
    );
    expect(error).toBeUndefined();
    expect(ok).toBe(true);
    expect((await readSd(id)).metadata).toEqual({ x: 1 });
  });

  it('[MIRROR] the identical statement with a DIFFERENT status IS rejected', async () => {
    // Without this mirror, a guard that never fires at all would also pass the case above.
    const id = await seedSd({ status: 'draft' });
    const { ok, error } = await attempt(
      "UPDATE public.strategic_directives_v2 SET status='active', metadata='{\"x\":1}'::jsonb WHERE id=$1",
      [id],
    );
    expect(ok).toBe(false);
    expect(error.code).toBe('SDCW1');
  });

  it('the guard SQL contains no UPDATE OF clause', async () => {
    const { rows } = await client.query(`
      SELECT pg_get_triggerdef(t.oid) AS def FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE c.relname='strategic_directives_v2' AND NOT t.tgisinternal
        AND t.tgname IN ('aaa_enforce_canonical_lifecycle_write','zzz_enforce_canonical_lifecycle_write_final')`);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.def).not.toMatch(/UPDATE\s+OF/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-5, TS-6, TS-10 — unprotected columns are never touched by the guard', () => {
  it('TS-5 a metadata-only write succeeds untouched', async () => {
    const id = await seedSd();
    const { ok } = await attempt(
      'UPDATE public.strategic_directives_v2 SET metadata=\'{"note":"coordination"}\'::jsonb WHERE id=$1',
      [id],
    );
    expect(ok).toBe(true);
    const sd = await readSd(id);
    expect(sd.status).toBe('draft');
    expect(sd.current_phase).toBe('LEAD_APPROVAL');
    expect(sd.completion_date).toBeNull();
  });

  it('TS-6 dependencies / is_working_on / priority writes each succeed', async () => {
    for (const set of [
      'dependencies=\'["a"]\'::jsonb',
      'is_working_on=true',
      "priority='high'",
      'progress=100',
      'progress_percentage=100',
    ]) {
      const id = await seedSd();
      const { ok, error } = await attempt(
        `UPDATE public.strategic_directives_v2 SET ${set} WHERE id=$1`,
        [id],
      );
      expect(error, `set ${set}`).toBeUndefined();
      expect(ok).toBe(true);
    }
  });

  it('TS-10 a claim_sd-shaped write (session columns only, no stamp) succeeds', async () => {
    const id = await seedSd();
    const { ok } = await attempt(
      `UPDATE public.strategic_directives_v2
          SET claiming_session_id='sess-1', active_session_id='sess-1', is_working_on=true
        WHERE id=$1`,
      [id],
    );
    expect(ok).toBe(true);
  });

  it('FR-2 AC#5 — all 7 claim/session RPC write shapes still succeed unstamped', async () => {
    // The 7 fleet claim RPCs are disposition=no_action_needed: measured live, none of them writes a
    // protected column. Their SHAPES are exercised here (the real functions are not on this stub) to
    // confirm zzz_ does not collaterally block session/claim-column-only writes.
    const shapes = {
      claim_sd: "claiming_session_id='s', active_session_id='s', is_working_on=true",
      release_sd: 'claiming_session_id=NULL, active_session_id=NULL, is_working_on=false',
      switch_sd_claim: "claiming_session_id='s2', active_session_id='s2'",
      release_session: 'active_session_id=NULL',
      set_working_sd: 'is_working_on=true',
      create_or_replace_session: "active_session_id='s3'",
      cleanup_stale_sessions: 'claiming_session_id=NULL, is_working_on=false',
    };
    for (const [name, set] of Object.entries(shapes)) {
      // Deliberately against a row sitting IN auto_transition_status's predicate — the case where a
      // naive zzz_-alone design would have false-rejected a session-only write.
      const id = await seedSd({ current_phase: 'EXEC', progress: 100 });
      const { ok, error } = await attempt(
        `UPDATE public.strategic_directives_v2 SET ${set} WHERE id=$1`,
        [id],
      );
      expect(error, `${name} shape`).toBeUndefined();
      expect(ok).toBe(true);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-7 — a registry-stamped protected-column write succeeds', () => {
  it('status + stamp in one statement is accepted', async () => {
    const id = await seedSd();
    const { ok, error } = await attempt(
      `UPDATE public.strategic_directives_v2
          SET status='active', lifecycle_write_token='handoff.js' WHERE id=$1`,
      [id],
    );
    expect(error).toBeUndefined();
    expect(ok).toBe(true);
    expect((await readSd(id)).status).toBe('active');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-8, TS-9, TS-12 — the RPC write shapes, plus the FR-4 static same-statement assertion', () => {
  it('TS-8 an fn_atomic_lead_to_plan_transition-shaped UPDATE succeeds', async () => {
    const id = await seedSd();
    const { ok, error } = await attempt(
      `UPDATE public.strategic_directives_v2
          SET current_phase='PLAN_PRD', status='in_progress',
              lifecycle_write_token='fn_atomic_lead_to_plan_transition',
              transition_version=COALESCE(transition_version,1)+1, updated_at=NOW()
        WHERE id=$1`,
      [id],
    );
    expect(error).toBeUndefined();
    expect(ok).toBe(true);
  });

  it('TS-9 an fn_atomic_exec_to_plan_transition-shaped UPDATE succeeds', async () => {
    const id = await seedSd();
    const { ok, error } = await attempt(
      `UPDATE public.strategic_directives_v2
          SET current_phase='EXEC_COMPLETE', status='active',
              lifecycle_write_token='fn_atomic_exec_to_plan_transition',
              transition_version=COALESCE(transition_version,1)+1, updated_at=NOW()
        WHERE id=$1`,
      [id],
    );
    expect(error).toBeUndefined();
    expect(ok).toBe(true);
  });

  it('TS-12 a complete_orchestrator_sd-shaped depth-1 write succeeds via its explicit registry entry', async () => {
    const id = await seedSd({ status: 'pending_approval' });
    const { ok, error } = await attempt(
      `UPDATE public.strategic_directives_v2
          SET status='completed', current_phase='COMPLETED', is_working_on=false,
              lifecycle_write_token='complete_orchestrator_sd', updated_at=now()
        WHERE id=$1`,
      [id],
    );
    expect(error).toBeUndefined();
    expect(ok).toBe(true);
  });

  it('[FR-4] every protected-column UPDATE in the amended functions sets the stamp in the SAME statement', async () => {
    // A blocking check on the SQL TEXT, independent of the behavioural results above: two separate
    // UPDATEs, or reliance on incidental prior state, would satisfy neither this nor the guard.
    const PROTECTED = ['status', 'current_phase', 'completion_date'];
    // auto_transition_status is excluded deliberately: it assigns NEW.status inside a BEFORE trigger
    // rather than issuing an UPDATE, so it has no statement to be "same" as. It gets its own
    // assertion immediately below, so this exclusion is a decision rather than a hole.
    for (const name of AMENDED_FUNCTIONS.filter((n) => n !== 'auto_transition_status')) {
      const { rows } = await client.query(
        `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
           JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname=$1`,
        [name],
      );
      expect(rows, `${name} not found`).toHaveLength(1);
      const statements = sdUpdateStatements(rows[0].def);
      expect(statements.length, `${name}: no SDv2 UPDATE found`).toBeGreaterThan(0);
      for (const stmt of statements) {
        const setsProtected = PROTECTED.some((c) => new RegExp(`\\b${c}\\s*=`).test(stmt));
        if (!setsProtected) continue;
        expect(stmt, `${name}: a protected-column UPDATE without the stamp in the same statement`)
          .toMatch(/lifecycle_write_token\s*=/);
      }
    }
  });

  it('[FR-4] auto_transition_status is exempt from the same-statement rule for the right reason', async () => {
    // It assigns NEW.status inside a BEFORE trigger rather than issuing an UPDATE, so "same
    // statement" is automatic. Asserted explicitly so its absence from the loop above reads as a
    // decision rather than a gap.
    const { rows } = await client.query(
      'SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname=\'auto_transition_status\'',
    );
    expect(sdUpdateStatements(rows[0].def)).toHaveLength(0);
    expect(rows[0].def).toMatch(/NEW\.lifecycle_write_token = 'auto_transition_status'/);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-11 + FR-6 — no depth-based exemption exists', () => {
  it('[STAMPED, commits] a genuine cascade reaches the guard chain at trigger depth > 1', async () => {
    const id = await seedSd({ status: 'draft' });
    await clearProbe();
    const { rows } = await client.query(
      'INSERT INTO public._ddl_cascade_driver(sd_id, token) VALUES ($1,\'handoff.js\') RETURNING id',
      [id],
    );
    const { rows: drv } = await client.query('SELECT * FROM public._ddl_cascade_driver WHERE id=$1', [
      rows[0].id,
    ]);
    expect(drv[0].captured_sqlstate).toBeNull();
    expect(drv[0].wrapper_depth).toBe(1); // the wrapper is itself an AFTER trigger of the driver INSERT
    expect((await readSd(id)).status).toBe('completed');

    // THE OBSERVATION THAT MAKES THIS SCENARIO ABOUT DEPTH AT ALL: a sibling trigger on
    // strategic_directives_v2 recorded pg_trigger_depth() during that cascade. If this is 1 the
    // fixture never nested and this test is a duplicate of TS-7.
    const recorded = (await probeRows()).filter((r) => r.tg === 'auto_calculate_progress_trigger');
    expect(recorded.length).toBeGreaterThan(0);
    expect(recorded[0].depth).toBeGreaterThan(1);
  });

  it('[UNSTAMPED, identical path] the same cascade is rejected with SDCW1, exactly like depth 1', async () => {
    const id = await seedSd({ status: 'draft' });
    const { rows } = await client.query(
      'INSERT INTO public._ddl_cascade_driver(sd_id, token) VALUES ($1, NULL) RETURNING id',
      [id],
    );
    const { rows: drv } = await client.query('SELECT * FROM public._ddl_cascade_driver WHERE id=$1', [
      rows[0].id,
    ]);
    expect(drv[0].captured_sqlstate).toBe('SDCW1');
    expect(drv[0].captured_message).toBe('missing canonical-writer stamp on protected-column write');
    expect((await readSd(id)).status).toBe('draft');
  });

  it('the guard makes no reference to pg_trigger_depth() at all', async () => {
    const { rows } = await client.query(
      'SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname=\'enforce_canonical_lifecycle_write\'',
    );
    expect(rows[0].def).not.toMatch(/pg_trigger_depth/);
    // ...and neither does the migration's guard SECTION. Scoped to the function body on purpose: the
    // file's header prose names the dropped exemption explicitly, and it should keep doing so.
    const start = MIGRATION_SQL.indexOf('CREATE OR REPLACE FUNCTION public.enforce_canonical_lifecycle_write()');
    expect(start).toBeGreaterThan(-1);
    const guardSection = MIGRATION_SQL.slice(start, MIGRATION_SQL.indexOf('$function$;', start));
    expect(guardSection).not.toMatch(/pg_trigger_depth/);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('FR-6 — each of the 4 cross-table cascade functions succeeds by its OWN registry identity', () => {
  it('update_sd_after_lead_evaluation cascades successfully', async () => {
    const id = await seedSd({ status: 'draft' });
    await client.query('INSERT INTO public.lead_evaluations(sd_id, final_decision) VALUES ($1,\'APPROVE\')', [id]);
    expect((await readSd(id)).status).toBe('active');
  });

  it('update_sd_after_plan_validation cascades successfully', async () => {
    const id = await seedSd({ status: 'draft' });
    await client.query(
      'INSERT INTO public.plan_technical_validations(sd_id, final_decision) VALUES ($1,\'APPROVE\')',
      [id],
    );
    expect((await readSd(id)).status).toBe('validated');
  });

  it('update_sd_after_exec_completion cascades successfully', async () => {
    const id = await seedSd({ status: 'draft' });
    const { rows } = await client.query(
      `INSERT INTO public.exec_implementation_sessions(sd_id, status, quality_score)
       VALUES ($1,'in_progress',95) RETURNING id`,
      [id],
    );
    await client.query('UPDATE public.exec_implementation_sessions SET status=\'completed\' WHERE id=$1', [
      rows[0].id,
    ]);
    expect((await readSd(id)).status).toBe('implementation_complete');
  });

  it('update_sd_progress_from_phases cascades successfully — including the completion_date branch', async () => {
    // The ONLY DB-side writer of completion_date in the entire estate, and the one the dropped depth
    // exemption would have let write an unstamped phantom completion.
    const id = await seedSd({ status: 'draft' });
    await client.query(
      'INSERT INTO public.sd_phase_tracking(sd_id, phase_name, is_complete) VALUES ($1,\'LEAD_APPROVAL\',true)',
      [id],
    );
    const sd = await readSd(id);
    expect(sd.status).toBe('completed');
    expect(sd.completion_date).not.toBeNull();
    expect(sd.progress).toBe(50); // calculate_sd_progress() stub
  });

  it('[MIRROR] stripping a cascade function of its stamp makes the SAME cascade fail', async () => {
    // Without this, the four cases above are equally consistent with "the guard never fires on
    // cascades" — which is the very exemption FR-6 removed.
    const original = (
      await client.query(
        'SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname=\'update_sd_after_lead_evaluation\'',
      )
    ).rows[0].def;
    const stripped = original.replace(/\s*lifecycle_write_token = '[^']*',\n/, '\n');
    expect(stripped).not.toBe(original);
    await client.query(stripped);
    try {
      const id = await seedSd({ status: 'draft' });
      const { ok, error } = await attempt(
        'INSERT INTO public.lead_evaluations(sd_id, final_decision) VALUES ($1,\'APPROVE\')',
        [id],
      );
      expect(ok).toBe(false);
      expect(error.code).toBe('SDCW1');
    } finally {
      await client.query(original);
    }
    // TEARDOWN VERIFIED, not assumed — a leaked stripped function would silently contaminate every
    // later scenario in this file.
    const restored = (
      await client.query(
        'SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname=\'update_sd_after_lead_evaluation\'',
      )
    ).rows[0].def;
    expect(restored).toBe(original);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-13 + FR-2 — firing order', () => {
  it('[STRUCTURAL] aaa_ sorts first and zzz_ last among this stub\'s BEFORE ROW triggers under COLLATE "C"', async () => {
    const { rows } = await client.query(`
      SELECT t.tgname::text AS tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE c.relname='strategic_directives_v2' AND NOT t.tgisinternal
        AND (t.tgtype & 2)=2 AND (t.tgtype & 1)=1
      ORDER BY t.tgname::text COLLATE "C"`);
    const names = rows.map((r) => r.tgname);
    expect(names[0]).toBe('aaa_enforce_canonical_lifecycle_write');
    expect(names[names.length - 1]).toBe('zzz_enforce_canonical_lifecycle_write_final');
    // The four siblings FR-2 names all sit strictly between the two guards.
    for (const sib of [
      'auto_calculate_progress_trigger',
      'enforce_handoff_trigger',
      'enforce_progress_trigger',
      'status_auto_transition',
    ]) {
      expect(names).toContain(sib);
      expect(names.indexOf(sib)).toBeGreaterThan(0);
      expect(names.indexOf(sib)).toBeLessThan(names.length - 1);
    }
  });

  it('[BEHAVIOURAL] aaa_ rejects before ANY sibling has run — zero siblings recorded a firing', async () => {
    const id = await seedSd();
    await clearProbe();
    const { ok } = await attempt("UPDATE public.strategic_directives_v2 SET status='active' WHERE id=$1", [id]);
    expect(ok).toBe(false);
    // If aaa_ ran anywhere but position 1, at least one instrumented sibling would have recorded.
    expect(await probeRows()).toHaveLength(0);
  });

  it('[BEHAVIOURAL] aaa_ evaluates OLD/NEW before status_auto_transition mutates NEW.status', async () => {
    // The discriminator is the rejection's own DETAIL. On a row sitting inside
    // auto_transition_status's predicate, that trigger rewrites NEW.status to 'pending_approval'.
    // If aaa_ ran AFTER it, DETAIL would report status:draft->pending_approval. Reporting the
    // CLIENT's value instead is only possible if aaa_ evaluated first.
    const id = await seedSd({ status: 'draft', current_phase: 'EXEC', progress: 100 });
    const { ok, error } = await attempt(
      "UPDATE public.strategic_directives_v2 SET status='completed' WHERE id=$1",
      [id],
    );
    expect(ok).toBe(false);
    expect(error.detail).toContain('guard=aaa_enforce_canonical_lifecycle_write');
    expect(error.detail).toContain('status:draft->completed');
    expect(error.detail).not.toContain('status:draft->pending_approval');
  });

  it('[TWO-SIDED] with a valid stamp the same write succeeds and every sibling fires, in lexical order', async () => {
    const id = await seedSd();
    await clearProbe();
    const { ok, error } = await attempt(
      "UPDATE public.strategic_directives_v2 SET status='active', lifecycle_write_token='handoff.js' WHERE id=$1",
      [id],
    );
    expect(error).toBeUndefined();
    expect(ok).toBe(true);
    const fired = (await probeRows()).map((r) => r.tg);
    expect(fired).toEqual([
      'auto_calculate_progress_trigger',
      'enforce_handoff_trigger',
      'enforce_progress_trigger',
    ]);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-14..TS-17 — the operator tools keep working under their registry identities', () => {
  const shapes = [
    [
      'TS-14 sd:cancel',
      'sd:cancel',
      `status='cancelled', current_phase='CANCELLED', cancellation_reason='x',
       claiming_session_id=NULL, is_working_on=false, updated_at=now()`,
      { status: 'cancelled', current_phase: 'CANCELLED' },
    ],
    [
      'TS-15 sd:reactivate',
      'sd:reactivate',
      'status=\'active\', metadata=\'{"reactivated":true}\'::jsonb, updated_at=now()',
      { status: 'active' },
    ],
    [
      'TS-16 sd:recover',
      'sd:recover',
      'current_phase=\'PLAN_PRD\', status=\'in_progress\', updated_at=now()',
      { status: 'in_progress', current_phase: 'PLAN_PRD' },
    ],
    [
      'TS-17 sd-park.js park()',
      'sd-park.js',
      `status='parked', is_working_on=false, claiming_session_id=NULL, active_session_id=NULL,
       progress=99, metadata='{"park":true}'::jsonb, updated_at=now(), updated_by='cli'`,
      { status: 'parked', progress: 99 },
    ],
  ];

  for (const [label, identity, set, expected] of shapes) {
    it(`${label} succeeds with lifecycle_write_token='${identity}'`, async () => {
      const id = await seedSd();
      const { ok, error } = await attempt(
        `UPDATE public.strategic_directives_v2
            SET ${set}, lifecycle_write_token='${identity}' WHERE id=$1`,
        [id],
      );
      expect(error, label).toBeUndefined();
      expect(ok).toBe(true);
      const sd = await readSd(id);
      for (const [k, v] of Object.entries(expected)) expect(sd[k], `${label}.${k}`).toBe(v);
    });

    it(`[MIRROR] ${label} WITHOUT the stamp is rejected`, async () => {
      const id = await seedSd();
      const { ok, error } = await attempt(
        `UPDATE public.strategic_directives_v2 SET ${set} WHERE id=$1`,
        [id],
      );
      expect(ok).toBe(false);
      expect(error.code).toBe('SDCW1');
    });
  }

  it("TS-17b sd-park.js's documented auto_transition_status dependency still works", async () => {
    // park()/unpark() deliberately rely on status_auto_transition firing off the progress column.
    // A guard that broke this would break the fleet's park path — and this is the exact derived,
    // client-unstamped route zzz_ + FR-1's self-stamp exist to keep working.
    const id = await seedSd({ status: 'draft', current_phase: 'EXEC', progress: 0 });
    const { ok, error } = await attempt(
      'UPDATE public.strategic_directives_v2 SET progress=100 WHERE id=$1',
      [id],
    );
    expect(error).toBeUndefined();
    expect(ok).toBe(true);
    const sd = await readSd(id);
    expect(sd.status).toBe('pending_approval'); // written by auto_transition_status, self-stamped
    expect(sd.lifecycle_write_token).toBeNull(); // ...and cleared at rest by zzz_
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-18 — the three handoff transitions in sequence', () => {
  it('LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN all land', async () => {
    // ⚠️ SPEC CONTRADICTION, resolved in favour of FR-3. TS-18's stated expectation includes "the
    // stamp column holds the expected registry identity string for that mechanism" after each step.
    // That is IMPOSSIBLE under FR-3's NULL-at-rest requirement (the F1b stale-stamp-reuse fix), and
    // TS-31 asserts the exact opposite. TS-18's readback clause predates that amendment. The
    // per-mechanism identity claim is instead carried by the FR-4 static same-statement assertion
    // above, which reads each mechanism's own SQL text.
    const id = await seedSd({ status: 'draft', current_phase: 'LEAD' });

    // (1) LEAD-TO-PLAN — routed through fn_atomic_lead_to_plan_transition.
    expect(
      (
        await attempt(
          `UPDATE public.strategic_directives_v2
              SET current_phase='PLAN_PRD', status='in_progress',
                  lifecycle_write_token='fn_atomic_lead_to_plan_transition',
                  transition_version=COALESCE(transition_version,1)+1, updated_at=NOW()
            WHERE id=$1`,
          [id],
        )
      ).ok,
    ).toBe(true);
    let sd = await readSd(id);
    expect([sd.current_phase, sd.status]).toEqual(['PLAN_PRD', 'in_progress']);
    expect(sd.lifecycle_write_token).toBeNull();

    // (2) PLAN-TO-EXEC — the REAL writer is plan-to-exec/state-transitions.js's forward branch, NOT
    //     SDRepository.js's updateStatus(), which is dead-by-unreachability and must never be
    //     stamped: doing so would manufacture false coverage.
    expect(
      (
        await attempt(
          `UPDATE public.strategic_directives_v2
              SET current_phase='EXEC', status='active', is_working_on=true,
                  lifecycle_write_token='handoff.js', updated_at=NOW()
            WHERE id=$1`,
          [id],
        )
      ).ok,
    ).toBe(true);
    sd = await readSd(id);
    expect([sd.current_phase, sd.status]).toEqual(['EXEC', 'active']);
    expect(sd.lifecycle_write_token).toBeNull();

    // (3) EXEC-TO-PLAN — routed through fn_atomic_exec_to_plan_transition.
    expect(
      (
        await attempt(
          `UPDATE public.strategic_directives_v2
              SET current_phase='EXEC_COMPLETE', status='active',
                  lifecycle_write_token='fn_atomic_exec_to_plan_transition',
                  transition_version=COALESCE(transition_version,1)+1, updated_at=NOW()
            WHERE id=$1`,
          [id],
        )
      ).ok,
    ).toBe(true);
    sd = await readSd(id);
    expect(sd.current_phase).toBe('EXEC_COMPLETE');
    expect(sd.lifecycle_write_token).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-21 — the stamp is validated by VALUE, not by presence', () => {
  it('a non-null, non-registry stamp alongside a protected-column change is rejected', async () => {
    const id = await seedSd();
    const { ok, error } = await attempt(
      `UPDATE public.strategic_directives_v2
          SET status='active', lifecycle_write_token='not-a-real-writer' WHERE id=$1`,
      [id],
    );
    expect(ok).toBe(false);
    expect(error.code).toBe('SDCW1');
    expect(error.message).toBe('stamp value not present in canonical-writer registry');
    expect(error.detail).toContain("rejected_identity='not-a-real-writer'");
  });

  it('a coordination-only writer sending an arbitrary stamp is unaffected — the guard never fires', async () => {
    // FR-3 AC#1: enforcement is entirely value-based AND conditional on a protected column changing.
    // No column-level privilege or RLS restriction is introduced on the stamp column itself.
    const id = await seedSd();
    const { ok, error } = await attempt(
      `UPDATE public.strategic_directives_v2
          SET metadata='{"dispatch_rank":3}'::jsonb, lifecycle_write_token='worker-checkin.cjs'
        WHERE id=$1`,
      [id],
    );
    expect(error).toBeUndefined();
    expect(ok).toBe(true);
    // ...and the arbitrary value did NOT survive to be inherited by a later write.
    expect((await readSd(id)).lifecycle_write_token).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-22 — satisfied by FR-5\'s recorded negative finding', () => {
  it('no claim/session function appears in the registry, because none writes a protected column', async () => {
    // TS-22 is CONDITIONAL: it needs an executed test only if FR-5's enumeration found a claim/session
    // function that writes status/current_phase/completion_date. The PLAN-phase writer inventory
    // (database/evidence/SD-...-writer-inventory.md §1b) measured all 7 as writing session columns
    // ONLY. This asserts that negative finding is what the registry actually encodes, rather than
    // leaving it as prose — and the shape-level proof that they still succeed is FR-2 AC#5 above.
    const { rows } = await client.query('SELECT writer_identity FROM public.sd_canonical_writer_policy()');
    const identities = rows.map((r) => r.writer_identity);
    for (const claimFn of [
      'claim_sd',
      'release_sd',
      'switch_sd_claim',
      'release_session',
      'set_working_sd',
      'create_or_replace_session',
      'cleanup_stale_sessions',
      'sync_is_working_on_with_session',
    ]) {
      expect(identities, `${claimFn} must NOT hold an allowlist slot`).not.toContain(claimFn);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-23 + FR-5 — the registry is a live-queried SSOT, not a duplicated list', () => {
  const RESTORE = () => client.query(definitionOf(registryOriginal));
  let registryOriginal;

  beforeAll(async () => {
    const { rows } = await client.query(
      'SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname=\'sd_canonical_writer_policy\'',
    );
    registryOriginal = rows[0].def;
  });

  it('adding one identity to the inline VALUES clause is enough — no trigger or code change', async () => {
    const amended = registryOriginal.replace(
      "       'scripts/modules/shipping/SDGitStateReconciler.js. NOT YET WIRED.')",
      "       'scripts/modules/shipping/SDGitStateReconciler.js. NOT YET WIRED.'),\n" +
        "      ('temp-probe-writer', '{\"surface\":\"probe\"}'::jsonb, 'TS-23 temporary probe entry')",
    );
    expect(amended, 'TS-23 anchor drifted — the registry VALUES clause changed shape').not.toBe(
      registryOriginal,
    );

    try {
      await client.query(amended);
      const id = await seedSd();
      const { ok, error } = await attempt(
        `UPDATE public.strategic_directives_v2
            SET status='active', lifecycle_write_token='temp-probe-writer' WHERE id=$1`,
        [id],
      );
      expect(error).toBeUndefined();
      expect(ok).toBe(true);
    } finally {
      await RESTORE();
    }

    // TEARDOWN VERIFIED before any later scenario runs — a leaked probe entry is the single most
    // likely flake source in this suite.
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM public.sd_canonical_writer_policy('temp-probe-writer')",
    );
    expect(rows[0].n).toBe(0);
    const id = await seedSd();
    const after = await attempt(
      `UPDATE public.strategic_directives_v2
          SET status='active', lifecycle_write_token='temp-probe-writer' WHERE id=$1`,
      [id],
    );
    expect(after.ok).toBe(false);
    expect(after.error.code).toBe('SDCW1');
  });

  it('the registry is an inline-VALUES function with no backing table, matching handoff_actor_policy', async () => {
    expect(registryOriginal).toMatch(/WITH registry\(writer_identity, capability_flags, notes\) AS \(\s*VALUES/);
    expect(registryOriginal).toMatch(/LANGUAGE sql/);
    expect(registryOriginal).toMatch(/IMMUTABLE/);
    // No table by that name exists to drift from.
    const { rows } = await client.query("SELECT to_regclass('public.sd_canonical_writer_policy') AS t");
    expect(rows[0].t).toBeNull();
  });

  it('the guard queries the registry rather than carrying its own copy of the list', async () => {
    const { rows } = await client.query(
      'SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname=\'enforce_canonical_lifecycle_write\'',
    );
    expect(rows[0].def).toMatch(/sd_canonical_writer_policy\(NEW\.lifecycle_write_token\)/);
  });

  it('[STATIC] no consumer hardcodes a writer-identity list outside the registry function', async () => {
    // The registry's only two real consumers are the trigger's validation query and this test file.
    // Every identity string this file mentions is either used as a single literal in one write, or
    // enumerated FROM the live function — never as a maintained array. The mechanical form of that
    // claim: the migration defines each identity exactly once (inside the VALUES clause).
    const registrySection = MIGRATION_SQL.slice(
      MIGRATION_SQL.indexOf('WITH registry(writer_identity'),
      MIGRATION_SQL.indexOf('  SELECT r.writer_identity, r.capability_flags, r.notes'),
    );
    expect(registrySection.length).toBeGreaterThan(0);
    const outsideRegistry = MIGRATION_SQL.split(registrySection).join('');
    const { rows } = await client.query('SELECT writer_identity FROM public.sd_canonical_writer_policy()');
    // Identities that are ALSO the name of a database function are exempt from the "outside"
    // sweep below: the migration's own $verify$ block legitimately names those functions in
    // pg_proc catalog queries, and a proname list is not a copy of the allowlist. The at-risk
    // identities — the ones with no catalog reason to appear anywhere ('handoff.js', 'sd:cancel',
    // 'sd-park.js', ...) — are exactly the ones still checked.
    const { rows: procs } = await client.query(
      "SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'",
    );
    const procNames = new Set(procs.map((p) => p.proname));

    for (const { writer_identity: identity } of rows) {
      const literal = `('${identity}'`;
      expect(
        registrySection.split(literal).length - 1,
        `${identity} must be declared exactly once, inside the registry VALUES clause`,
      ).toBe(1);

      if (procNames.has(identity)) continue;

      // Outside the registry, an identity may appear ONLY as an argument to the registry function
      // itself (the $verify$ block's self-check does this). Anything else is a second copy of the
      // list, which is the drift FR-5's SSOT contract exists to prevent.
      let at = outsideRegistry.indexOf(literal);
      while (at !== -1) {
        const preceding = outsideRegistry.slice(Math.max(0, at - 40), at + 1);
        expect(
          preceding,
          `${identity} appears outside the registry in a non-lookup position`,
        ).toContain('sd_canonical_writer_policy');
        at = outsideRegistry.indexOf(literal, at + literal.length);
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-24 — INSERT is entirely unaffected', () => {
  it('a plain SD-creation INSERT succeeds and leaves the stamp NULL', async () => {
    const { rows } = await client.query(
      `INSERT INTO public.strategic_directives_v2 (id, sd_key, status, current_phase, priority)
       VALUES ('SD-DDL-CANON-INSERT','SD-DDL-CANON-INSERT','draft','LEAD_APPROVAL','high')
       RETURNING id, status, lifecycle_write_token`,
    );
    expect(rows[0].status).toBe('draft');
    expect(rows[0].lifecycle_write_token).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-25 / TS-26 — zzz_ catches a future sibling trigger that does not know the convention', () => {
  beforeAll(async () => {
    await client.query(MUTATOR_BODY_UNAWARE);
    await client.query(MUTATOR_TRIGGER);
  });
  afterAll(() => client.query('DROP TRIGGER IF EXISTS mmm_test_unaware_mutator ON public.strategic_directives_v2'));

  it('TS-25 an unaware mid-sort mutator is caught by zzz_, not by aaa_', async () => {
    const id = await seedSd({ status: 'draft' });
    const { ok, error } = await attempt(
      'UPDATE public.strategic_directives_v2 SET metadata=\'{"only":"unprotected"}\'::jsonb WHERE id=$1',
      [id],
    );
    expect(ok).toBe(false);
    expect(error.code).toBe('SDCW1');
    // THE discriminating detail: aaa_ (position 1) let this through because nothing protected had
    // changed yet. zzz_ (last) saw the mutation the other 35 triggers could produce.
    expect(error.detail).toContain('guard=zzz_enforce_canonical_lifecycle_write_final');
    expect(error.detail).not.toContain('guard=aaa_');
    expect((await readSd(id)).status).toBe('draft');
  });

  it('[MIRROR] with the mutator removed the IDENTICAL write succeeds', async () => {
    // Without this, a zzz_ that rejected everything unconditionally would also pass TS-25.
    await client.query('DROP TRIGGER mmm_test_unaware_mutator ON public.strategic_directives_v2');
    try {
      const id = await seedSd({ status: 'draft' });
      const { ok, error } = await attempt(
        'UPDATE public.strategic_directives_v2 SET metadata=\'{"only":"unprotected"}\'::jsonb WHERE id=$1',
        [id],
      );
      expect(error).toBeUndefined();
      expect(ok).toBe(true);
    } finally {
      await client.query(MUTATOR_TRIGGER);
    }
  });

  it('TS-26 the SAME mutator self-stamping the FR-1 way is allowed — zzz_ discriminates on stamp VALIDITY', async () => {
    await client.query(MUTATOR_BODY_AWARE);
    try {
      const id = await seedSd({ status: 'draft' });
      const { ok, error } = await attempt(
        'UPDATE public.strategic_directives_v2 SET metadata=\'{"only":"unprotected"}\'::jsonb WHERE id=$1',
        [id],
      );
      expect(error).toBeUndefined();
      expect(ok).toBe(true);
      expect((await readSd(id)).status).toBe('pending_approval');
    } finally {
      await client.query(MUTATOR_BODY_UNAWARE); // restore the unaware body for any later scenario
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-27 — the registry being unavailable fails CLOSED', () => {
  let registryOriginal;

  beforeAll(async () => {
    const { rows } = await client.query(
      'SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname=\'sd_canonical_writer_policy\'',
    );
    registryOriginal = rows[0].def;
  });

  it('a registry that RAISES aborts the whole UPDATE — it never silently permits the write', async () => {
    const raising = `CREATE OR REPLACE FUNCTION public.sd_canonical_writer_policy(p_writer_identity text DEFAULT NULL)
 RETURNS TABLE(writer_identity text, capability_flags jsonb, notes text)
 LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'registry deliberately unavailable (TS-27 fixture)';
END;
$fn$`;
    const id = await seedSd({ status: 'draft' });
    try {
      await client.query(raising);
      const { ok, error } = await attempt(
        `UPDATE public.strategic_directives_v2
            SET status='active', lifecycle_write_token='handoff.js' WHERE id=$1`,
        [id],
      );
      expect(ok).toBe(false);
      expect(error.message).toContain('registry deliberately unavailable');
      expect((await readSd(id)).status).toBe('draft');
    } finally {
      await client.query('DROP FUNCTION IF EXISTS public.sd_canonical_writer_policy(text)');
      await client.query(definitionOf(registryOriginal));
    }

    // ...and the fixture genuinely toggled the condition: the IDENTICAL write now succeeds.
    const { ok, error } = await attempt(
      `UPDATE public.strategic_directives_v2
          SET status='active', lifecycle_write_token='handoff.js' WHERE id=$1`,
      [id],
    );
    expect(error).toBeUndefined();
    expect(ok).toBe(true);
  });

  it('a registry that is DROPPED entirely also fails closed, not open', async () => {
    const id = await seedSd({ status: 'draft' });
    try {
      await client.query('DROP FUNCTION public.sd_canonical_writer_policy(text)');
      const { ok, error } = await attempt(
        `UPDATE public.strategic_directives_v2
            SET status='active', lifecycle_write_token='handoff.js' WHERE id=$1`,
        [id],
      );
      expect(ok).toBe(false);
      expect(error.code).toBe('42883'); // undefined_function — the statement aborts
      expect((await readSd(id)).status).toBe('draft');
    } finally {
      await client.query(definitionOf(registryOriginal));
    }
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM public.sd_canonical_writer_policy('handoff.js')",
    );
    expect(rows[0].n).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-28 — concurrent re-evaluation (documents the behaviour, does not assert a chosen verdict)', () => {
  it('after EvalPlanQual re-evaluation, B\'s unstamped metadata-only write is admitted via the self-stamp', async () => {
    // Session A commits progress=100/current_phase='EXEC'; session B is mid-flight on an UNSTAMPED
    // metadata-only UPDATE to the same row and is blocked on the row lock. When B resumes, Postgres
    // re-runs its BEFORE ROW triggers against the NEW post-A tuple. The point of this scenario is to
    // PIN whatever happens and prove BEFORE triggers genuinely re-fire on retry — not to assert a
    // predetermined verdict.
    const id = await seedSd({ status: 'draft', current_phase: 'LEAD', progress: 0 });

    const a = new pg.Client(client.connectionParameters);
    const b = new pg.Client(client.connectionParameters);
    await a.connect();
    await b.connect();
    try {
      await a.query('BEGIN');
      await a.query(
        "UPDATE public.strategic_directives_v2 SET progress=100, current_phase='EXEC', lifecycle_write_token='handoff.js' WHERE id=$1",
        [id],
      );

      await b.query('BEGIN');
      const bPending = b.query(
        'UPDATE public.strategic_directives_v2 SET metadata=\'{"from":"B"}\'::jsonb WHERE id=$1',
        [id],
      );
      // Give B time to actually block on the row lock rather than racing past it.
      await new Promise((r) => setTimeout(r, 250));
      await a.query('COMMIT');

      let bOutcome;
      try {
        await bPending;
        await b.query('COMMIT');
        bOutcome = { ok: true };
      } catch (e) {
        await b.query('ROLLBACK');
        bOutcome = { ok: false, code: e.code, message: e.message };
      }

      // MEASURED, not assumed: B's re-evaluated OLD now has progress=100/current_phase='EXEC', so
      // auto_transition_status fires on the retry, assigns NEW.status and self-stamps — and B's
      // originally-unstamped write is admitted as a status change authored by auto_transition_status.
      // That is believed correct by design (it genuinely IS the author of that assignment), and this
      // is where it is written down.
      expect(bOutcome.ok, `B outcome: ${JSON.stringify(bOutcome)}`).toBe(true);
      const sd = await readSd(id);
      expect(sd.status).toBe('pending_approval');
      expect(sd.metadata).toEqual({ from: 'B' });
      expect(sd.lifecycle_write_token).toBeNull();
    } finally {
      await a.end();
      await b.end();
    }
  }, 30_000);
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-30 — the two message texts can never collide with skip-and-continue.js\'s "0 rows" check', () => {
  it('neither SDCW1 message, detail, nor hint contains the substring "0 rows"', async () => {
    const observed = [];
    const id = await seedSd();
    const missing = await attempt("UPDATE public.strategic_directives_v2 SET status='active' WHERE id=$1", [id]);
    observed.push(missing.error);
    const id2 = await seedSd();
    const invalid = await attempt(
      "UPDATE public.strategic_directives_v2 SET status='active', lifecycle_write_token='nope' WHERE id=$1",
      [id2],
    );
    observed.push(invalid.error);

    expect(observed.map((e) => e.message)).toEqual([
      'missing canonical-writer stamp on protected-column write',
      'stamp value not present in canonical-writer registry',
    ]);
    for (const e of observed) {
      for (const field of ['message', 'detail', 'hint']) {
        expect(String(e[field] ?? ''), `${field} must not contain "0 rows"`).not.toContain('0 rows');
      }
    }
  });

  it('[STATIC] the migration source carries no "0 rows" substring inside the guard function', async () => {
    const { rows } = await client.query(
      'SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname=\'enforce_canonical_lifecycle_write\'',
    );
    expect(rows[0].def).not.toContain('0 rows');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('TS-31 — NULL at rest closes the stale-stamp-reuse hole (F1b)', () => {
  it('a successful stamped write leaves NULL, and the next unstamped write inherits nothing', async () => {
    const id = await seedSd({ status: 'draft' });
    const first = await attempt(
      "UPDATE public.strategic_directives_v2 SET status='active', lifecycle_write_token='handoff.js' WHERE id=$1",
      [id],
    );
    expect(first.ok).toBe(true);

    const sd = await readSd(id);
    expect(sd.status).toBe('active');
    expect(sd.lifecycle_write_token).toBeNull(); // NOT 'handoff.js'

    const second = await attempt(
      "UPDATE public.strategic_directives_v2 SET status='completed' WHERE id=$1",
      [id],
    );
    expect(second.ok).toBe(false);
    expect(second.error.code).toBe('SDCW1');
    expect(second.error.message).toBe('missing canonical-writer stamp on protected-column write');
    expect((await readSd(id)).status).toBe('active');
  });

  it('the cleanup is UNCONDITIONAL — a stamp sent with an unprotected-only write is also cleared', async () => {
    // If the cleanup lived inside the guard's protected-column branch, this write would leave a
    // valid stamp at rest and the NEXT unstamped protected write would inherit it. That is the whole
    // bug, one branch away.
    const id = await seedSd({ status: 'draft' });
    expect(
      (
        await attempt(
          'UPDATE public.strategic_directives_v2 SET metadata=\'{"a":1}\'::jsonb, lifecycle_write_token=\'handoff.js\' WHERE id=$1',
          [id],
        )
      ).ok,
    ).toBe(true);
    expect((await readSd(id)).lifecycle_write_token).toBeNull();

    const next = await attempt("UPDATE public.strategic_directives_v2 SET status='active' WHERE id=$1", [id]);
    expect(next.ok).toBe(false);
    expect(next.error.code).toBe('SDCW1');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('FR-4 / FR-6 evidence artifacts match what the migration actually ships', () => {
  it('each amended function body appears in the migration VERBATIM as its .after.sql artifact', async () => {
    for (const name of AMENDED_FUNCTIONS) {
      const after = definitionOf(artifact(name, 'after'));
      expect(
        MIGRATION_SQL.includes(after),
        `${name}: the migration has drifted from database/evidence/canonical-writer-choke/${name}.after.sql`,
      ).toBe(true);
    }
  });

  it('each .after.sql differs from its .before.sql ONLY by lines that set the stamp', async () => {
    // The before-capture is live pg_get_functiondef output. This is what makes "we amended the LIVE
    // body, not a stale migration-file copy" a checkable claim rather than a promise.
    // auto_transition_status is excluded: per the 06:01Z coordinator ceremony-packet relay, it also
    // carries the IS DISTINCT FROM guard fix (a genuine behavior change, not a stamp edit) staged
    // in this same migration rather than a second ceremony. It has its own dedicated test below that
    // enumerates BOTH permitted diff classes explicitly, so the anti-smuggling invariant this test
    // enforces for every other function stays meaningful rather than silently weakened for all of them.
    const dropStamp = (line) => line.replace(/\s*lifecycle_write_token\s*=\s*'[^']*',?/g, '');

    for (const name of AMENDED_FUNCTIONS.filter((n) => n !== 'auto_transition_status')) {
      const before = definitionOf(artifact(name, 'before')).split('\n');
      const after = definitionOf(artifact(name, 'after')).split('\n');
      let i = 0;
      let j = 0;
      let edits = 0;
      let lastInsertionWasStamp = false;

      while (i < before.length || j < after.length) {
        if (i < before.length && j < after.length && before[i] === after[j]) {
          i += 1;
          j += 1;
          continue;
        }
        const a = j < after.length ? after[j] : null;
        const b = i < before.length ? before[i] : null;
        const mentionsStamp = a !== null && a.includes('lifecycle_write_token');

        // (1) an in-place edit: the after-line is the before-line with a stamp assignment spliced in
        if (a !== null && b !== null && mentionsStamp && dropStamp(a) === b) {
          edits += 1;
          i += 1;
          j += 1;
          continue;
        }
        // (2) a trailing comma added so a stamp line could follow it
        if (a !== null && b !== null && a === `${b},`) {
          edits += 1;
          i += 1;
          j += 1;
          continue;
        }
        // (3) a pure insertion — allowed only when it sets/tests the stamp, or is the END IF; that
        //     closes an IF block whose body did
        if (a !== null && (mentionsStamp || (a.trim() === 'END IF;' && lastInsertionWasStamp))) {
          lastInsertionWasStamp = mentionsStamp;
          edits += 1;
          j += 1;
          continue;
        }
        throw new Error(
          `${name}: .after.sql diverges from .after-of-.before.sql by something other than a stamp edit.\n` +
            `  before[${i}]: ${JSON.stringify(b)}\n  after[${j}]:  ${JSON.stringify(a)}`,
        );
      }
      expect(edits, `${name}: no stamp edit found at all`).toBeGreaterThan(0);
    }
  });

  it('auto_transition_status carries exactly the stamp edit plus the IS DISTINCT FROM guard fix, nothing else', async () => {
    // Dedicated bound for the one function excluded from the generic stamp-only comparator above.
    // Enumerates both permitted diff classes so a THIRD, unreviewed change smuggled into a future
    // edit of this function still fails loudly instead of silently passing because the exclusion
    // made the general check blind to it. The guard block is extracted from `after` by anchor rather
    // than retyped as a literal, so this test cannot itself drift from the artifact by a stray character.
    const before = definitionOf(artifact('auto_transition_status', 'before'));
    const after = definitionOf(artifact('auto_transition_status', 'after'));

    // Class 1 (stamp edits, same as every other AMENDED_FUNCTIONS entry): both self-stamp blocks
    // survive verbatim.
    expect(after).toContain(
      "IF NEW.lifecycle_write_token IS NULL THEN\n            NEW.lifecycle_write_token = 'auto_transition_status';\n          END IF;",
    );
    const stampOccurrences = after.split("NEW.lifecycle_write_token = 'auto_transition_status';").length - 1;
    expect(stampOccurrences).toBe(2);

    // Class 2 (the one documented exception): a guard block inserted between BEGIN and the first
    // stamp-bearing IF, whose defining property is the two IS NOT DISTINCT FROM comparisons that
    // early-RETURN before the stamp/status logic runs.
    const beginAnchor = 'BEGIN\n';
    const firstStampIfAnchor = '        -- Fix: Use current_phase instead of phase\n';
    const beginIdx = after.indexOf(beginAnchor);
    const firstStampIdx = after.indexOf(firstStampIfAnchor);
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(firstStampIdx).toBeGreaterThan(beginIdx);
    const guardBlock = after.slice(beginIdx + beginAnchor.length, firstStampIdx);

    expect(guardBlock).toContain('NEW.current_phase IS NOT DISTINCT FROM OLD.current_phase');
    expect(guardBlock).toContain('NEW.progress IS NOT DISTINCT FROM OLD.progress');
    expect(guardBlock).toContain('RETURN NEW;');
    expect(guardBlock).not.toContain('lifecycle_write_token'); // this block must be UNCONDITIONAL — no stamp check
    expect(guardBlock).not.toContain('NEW.status ='); // and must not itself derive status

    // Nothing else changed: strip both permitted classes from `after` and it must equal `before` exactly.
    const withoutGuard = after.slice(0, beginIdx + beginAnchor.length) + after.slice(firstStampIdx);
    const withoutStamp = withoutGuard.replace(
      /\n\s*IF NEW\.lifecycle_write_token IS NULL THEN\n\s*NEW\.lifecycle_write_token = 'auto_transition_status';\n\s*END IF;/g,
      '',
    );
    expect(withoutStamp).toBe(before);
  });

  it('the guard fix actually prevents a metadata-only write from re-deriving status', async () => {
    // Live-DB proof of the risk-agent finding: without the guard, ANY update to a row already sitting
    // in (current_phase='EXEC', progress>=100) re-derives status='pending_approval', even one that
    // never touches current_phase or progress. With the guard, such a write must pass through unchanged.
    const id = await seedSd({ status: 'active', current_phase: 'EXEC', progress: 100 });
    // A human/handoff already moved this row to a DIFFERENT status than what the un-guarded body would derive.
    await client.query(
      "UPDATE public.strategic_directives_v2 SET status='cancelled', lifecycle_write_token='handoff.js' WHERE id=$1",
      [id],
    );

    // A metadata-only write: current_phase and progress are re-sent with their EXISTING values (a
    // real caller pattern — an ORM/spread update that includes every column) but nothing changed.
    await client.query(
      `UPDATE public.strategic_directives_v2
         SET metadata = '{"touched":true}'::jsonb, current_phase='EXEC', progress=100,
             lifecycle_write_token='handoff.js'
       WHERE id=$1`,
      [id],
    );

    const sd = await readSd(id);
    expect(sd.status, 'guard fix regression: a metadata-only write reverted status').toBe('cancelled');
  });

  it('the live BEFORE captures name their provenance, so a stale copy is visible', async () => {
    for (const name of AMENDED_FUNCTIONS) {
      const raw = artifact(name, 'before');
      expect(raw).toMatch(/CAPTURED LIVE via pg_get_functiondef\(\) at \d{4}-\d{2}-\d{2}T/);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('the migration header discharges TR-2 and TR-4 in the file itself, not only in the PRD', () => {
  it('states the apply-time lock_timeout requirement (TR-2)', () => {
    expect(MIGRATION_SQL).toMatch(/SET lock_timeout = '3s';/);
    expect(MIGRATION_SQL).toMatch(/ACCESS EXCLUSIVE/);
  });

  it('states the explicit non-coverage boundaries (TR-4)', () => {
    expect(MIGRATION_SQL).toMatch(/DISABLE TRIGGER/);
    expect(MIGRATION_SQL).toMatch(/psql directly against production|CI steps/);
    expect(MIGRATION_SQL).toMatch(/RLS-silenced ANON-key writers/i);
    expect(MIGRATION_SQL).toMatch(/CHOKE POINT, NOT AN ABSOLUTE BARRIER/i);
  });

  it('states both rollback modes and keeps the stamp column on backout', () => {
    expect(MIGRATION_SQL).toMatch(/MODE 1/);
    expect(MIGRATION_SQL).toMatch(/MODE 2/);
    expect(MIGRATION_SQL).toMatch(/DROP TRIGGER IF EXISTS aaa_enforce_canonical_lifecycle_write/);
    expect(MIGRATION_SQL).toMatch(/DROP FUNCTION IF EXISTS public\.sd_canonical_writer_policy/);
    expect(MIGRATION_SQL).toMatch(/DELIBERATELY RETAINED, NOT DROPPED/);
  });

  it('carries a real, non-placeholder approval, but is APPLY-HELD — never applied by EXEC (TR-1)', () => {
    // POST-CEREMONY (2026-08-24T12:43Z, ceremony/20260824-sitting): TR-1 means EXEC itself never
    // applies this file — it does not mean the file must stay permanently unapproved. The chairman
    // separately approved it through the proper ceremony, with apply explicitly HELD pending the
    // 13-writer-wiring precondition. Assert BOTH halves: real approval present, AND the hold language
    // that distinguishes "approved to apply" from "approved, but not yet".
    expect(MIGRATION_SQL).not.toMatch(/@approved-by: PENDING/);
    expect(MIGRATION_SQL).toMatch(/@approved-by:\s*\S+@\S+/);
    expect(MIGRATION_SQL).toMatch(/APPLY HELD/);
  });
});
