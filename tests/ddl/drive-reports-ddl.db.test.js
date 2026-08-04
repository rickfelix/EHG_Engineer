// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — the DDL tier for 20260803_drive_reports.sql.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN
//
// This runs against an EPHEMERAL vanilla PostgreSQL 16 with three stub roles created by hand.
// It proves the SQL's LOGIC. It does NOT and cannot prove the PRODUCTION POSTURE, because a
// vanilla Postgres does not reproduce Supabase's role inheritance or its ALTER DEFAULT
// PRIVILEGES setup. A green run here is FULLY COMPATIBLE with an inherited anon grant existing
// on the live instance.
//
// The only thing that settles the production posture is applying the migration to the real
// instance, which is chairman-gated behind `scripts/apply-migration.js --prod-deploy`. Until
// that happens, AC-9 is unverified against production no matter how green this file is.
//
// Do not read a passing job as "the table is safe". Read it as "the SQL says what we think it
// says". Those are different claims, and conflating them is the exact failure this SD exists
// to stop.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// WHY THIS IS NOT IN THE vitest `db` PROJECT. That project gates on assessDbTarget, which parses
// SUPABASE_URL for a supabase.co project ref. An ephemeral Postgres is not Supabase, so it would
// resolve `unrecognised_target`, collect ZERO files, and pass. That is precisely how
// migration-deploy-drift-guard.yml's own end-to-end proof ended up green while running nothing
// (measured: "0 of db tests will run" / "No test files found"). This file therefore runs under
// its own config (vitest.ddl.config.mjs) with passWithNoTests OFF, and it FAILS rather than skips
// when it cannot reach a database. "Did not run" and "passed" must never look the same.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATION_PATH = fileURLToPath(
  new URL('../../database/migrations/20260803_drive_reports.sql', import.meta.url),
);
const MIGRATION_SQL = fs.readFileSync(MIGRATION_PATH, 'utf8');

// THE REAL VERIFY BLOCK, extracted from the migration rather than re-typed. Re-typing it would
// make this test agree with a COPY of the posture check instead of with the one that ships —
// the parallel-re-derivation mistake that let the original db-target defect survive its own test.
//
// LINE-ANCHORED, and the anchoring is load-bearing. An UNANCHORED version of this regex also
// matches the COMMENT occurrence of the same literal earlier in the migration ("...and the
// DO $verify$ block is") and then runs lazily to the REAL block's terminator — capturing the
// whole table DDL, the freeze function and the grants along the way. That is not hypothetical:
// it is what the first version of this file did. It was caught by the negative controls in the
// guard below, NOT by "did I find exactly one match", which the over-wide capture satisfies just
// as well. The real block opens with DO $verify$ alone on its own line.
const VERIFY_MATCHES = MIGRATION_SQL.match(/^DO \$verify\$[ \t]*$[\s\S]*?^\$verify\$;/gm) || [];
const VERIFY_BLOCK = VERIFY_MATCHES[0];

// The pre-widening predicate, quoted verbatim from the parent of 738432e4e04 so that "the
// widening actually widened" is a demonstration rather than an assertion. RECONSTRUCTED: it no
// longer exists in the file, so unlike VERIFY_BLOCK it cannot be extracted. If someone edits this
// quote the CONTRAST weakens, but the load-bearing forward assertion (the CURRENT block must
// reject PUBLIC) uses the real extracted block and is unaffected.
const OLD_PREDICATE_BLOCK = `
DO $old$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'drive_reports'
      AND grantee IN ('anon', 'authenticated')
  ), 'OLD PREDICATE: a non-service grant exists';
END
$old$;`;

const STUB_ROLES = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')   THEN CREATE ROLE service_role NOLOGIN;   END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')           THEN CREATE ROLE anon NOLOGIN;           END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')  THEN CREATE ROLE authenticated NOLOGIN;  END IF;
END
$roles$;`;

const INVENTED_ROLE = 'qa_role_invented_by_this_test';

let client;

async function applyMigration() {
  await client.query(MIGRATION_SQL);
}

/** Restore the posture the migration ships with, and prove it is restored. */
async function resetGrants() {
  await client.query('REVOKE ALL ON public.drive_reports FROM PUBLIC, anon, authenticated;');
  await client.query(`DO $r$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${INVENTED_ROLE}') THEN
      EXECUTE 'REVOKE ALL ON public.drive_reports FROM ${INVENTED_ROLE}';
    END IF;
  END $r$;`);
  await client.query('GRANT ALL ON public.drive_reports TO service_role;');
  // A grant leaked from a previous case would make the NEXT case pass for the wrong reason.
  await expect(client.query(VERIFY_BLOCK)).resolves.toBeTruthy();
}

beforeAll(async () => {
  // FAIL-CLOSED. No skip branch: if this file is invoked and cannot reach a database, that is a
  // broken runner, and a broken runner must be loud. A self-skip here would reproduce the exact
  // "green forever, asserting nothing" pattern this tier was created to escape.
  //
  // VERIFIED LOCALLY with no Postgres running: the suite collects 23 tests and the run FAILS with
  // ECONNREFUSED, exit 1. Fail-closed is measured here, not intended.
  client = new pg.Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'ddl_check',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
  });
  await client.connect();

  await client.query(STUB_ROLES);
  await applyMigration();
}, 60_000);

afterAll(async () => {
  if (client) await client.end();
});

describe('the instrument itself — before trusting a single ASSERT', () => {
  it('the verify block was extracted, exactly once, and is not too WIDE', () => {
    // Two failure directions, and only one of them is obvious. TOO NARROW / MISSING: the block
    // was renamed, extraction yields undefined, and every posture test below runs zero
    // assertions. TOO WIDE: the regex also swallowed surrounding DDL — which is what the first
    // version of this file actually did, and it satisfied both "exactly one match" and "contains
    // the strings I expected".
    expect(VERIFY_MATCHES).toHaveLength(1);
    expect(VERIFY_BLOCK).toMatch(/relrowsecurity/);
    expect(VERIFY_BLOCK).toMatch(/aclexplode/);

    // NEGATIVE CONTROLS — the capture must contain ONLY the verify block. If any of these appear,
    // then re-running "the verify block" would re-execute the migration body and silently restore
    // the very grants a tripwire case had just added, turning every must-FAIL case green.
    expect(VERIFY_BLOCK).not.toMatch(/CREATE OR REPLACE FUNCTION/);
    expect(VERIFY_BLOCK).not.toMatch(/CREATE TABLE/);
    expect(VERIFY_BLOCK).not.toMatch(/GRANT ALL/);
    expect(VERIFY_BLOCK).not.toMatch(/REVOKE ALL/);
    expect(VERIFY_BLOCK).not.toMatch(/CREATE POLICY/);

    // Shaped like the block, not merely containing it.
    expect(VERIFY_BLOCK.startsWith('DO ' + '$verify$')).toBe(true);
    expect(VERIFY_BLOCK.trimEnd().endsWith('$verify$;')).toBe(true);
    expect(VERIFY_BLOCK).toMatch(/^BEGIN$/m);
  });

  it('plpgsql assertions are ENABLED — otherwise the whole verify block is a no-op', async () => {
    // THE CONTROL THAT MAKES EVERY OTHER POSTURE TEST MEAN ANYTHING. With
    // plpgsql.check_asserts = off, every ASSERT in the migration silently succeeds and the
    // deploy-time posture check certifies nothing while looking identical to a passing one.
    // current_setting() with an explicit alias rather than SHOW: `SHOW plpgsql.check_asserts`
    // returns its column named EXACTLY 'plpgsql.check_asserts' — dotted, not underscored — so
    // rows[0].plpgsql_check_asserts is undefined and this assertion failed on the first real CI
    // run (30853982928) for a key-name guess rather than for the condition it exists to check.
    // MEASURED against a live instance: SHOW yields {"plpgsql.check_asserts":"on"} while
    // current_setting yields {"v":"on"}. Aliasing removes the guess entirely.
    //
    // It failed CLOSED, which is the only reason this was cheap: an instrument control written as
    // a truthy check would have passed on undefined and certified an unarmed instrument.
    const { rows } = await client.query(
      "SELECT current_setting('plpgsql.check_asserts', true) AS check_asserts",
    );
    expect(rows[0].check_asserts).toBe('on');

    // And prove it behaviourally rather than trusting the setting: a deliberately false ASSERT
    // must raise. Reading the GUC is a claim about configuration; this is the configuration
    // doing its job.
    await expect(
      client.query('DO $probe$ BEGIN ASSERT false, \'assertions are live\'; END $probe$;'),
    ).rejects.toThrow(/assertions are live/);
  });

  it('the migration applied and the table exists', async () => {
    const { rows } = await client.query("SELECT to_regclass('public.drive_reports') AS t");
    expect(rows[0].t).toBe('drive_reports');
  });
});

describe('the append-only freeze trigger — both halves', () => {
  let reportId;

  beforeEach(async () => {
    const { rows } = await client.query(
      `INSERT INTO public.drive_reports (sections, drive_score, metadata)
       VALUES ('{"plan_position":{"value":1}}'::jsonb, '{"score":4}'::jsonb, '{"seed":true}'::jsonb)
       RETURNING id`,
    );
    reportId = rows[0].id;
  });

  it('UPDATE of sections RAISES, naming the column and the reason', async () => {
    await expect(
      client.query('UPDATE public.drive_reports SET sections = \'{"tampered":true}\'::jsonb WHERE id = $1', [reportId]),
    ).rejects.toThrow(/sections is append-only/);
  });

  it('UPDATE of drive_score RAISES', async () => {
    await expect(
      client.query('UPDATE public.drive_reports SET drive_score = \'{"score":8}\'::jsonb WHERE id = $1', [reportId]),
    ).rejects.toThrow(/drive_score is append-only/);
  });

  it('UPDATE of generated_at RAISES', async () => {
    await expect(
      client.query("UPDATE public.drive_reports SET generated_at = now() - interval '1 day' WHERE id = $1", [reportId]),
    ).rejects.toThrow(/generated_at is append-only/);
  });

  // ── THE HALF A LAZIER TEST WOULD CERTIFY AS WORKING ──────────────────────────────────────
  // A blanket immutability trigger passes all three cases above and breaks C1 silently. C1
  // requires each CONSUMER to stamp its own receipt after the producer is done, so if receipts
  // froze too, the table could never record that anyone read a report — and the three tests
  // above would still be green.

  it('a CONSUMER can still record consumption — now as a ROW, which the freeze must not block (C1)', async () => {
    // The C1 half. Receipts moved OFF this row under the per-lane ruling, so the check moved
    // too: what must remain possible is that a consumer records having read the report. If the
    // freeze trigger or the receipts posture blocked that, the three tests above would still be
    // green while the table could never record that anyone read anything.
    await client.query("INSERT INTO public.drive_report_receipts (report_id, lane) VALUES ($1, 'coordinator');", [reportId]);
    const { rows } = await client.query('SELECT lane FROM public.drive_report_receipts WHERE report_id = $1', [reportId]);
    expect(rows.map((r) => r.lane)).toEqual(['coordinator']);
  });

  it('UPDATE of metadata SUCCEEDS and really changes', async () => {
    await client.query('UPDATE public.drive_reports SET metadata = \'{"annotated":true}\'::jsonb WHERE id = $1', [reportId]);
    const { rows } = await client.query('SELECT metadata FROM public.drive_reports WHERE id = $1', [reportId]);
    expect(rows[0].metadata).toEqual({ annotated: true });
  });

  it('a frozen-column UPDATE does not partially apply alongside a writable one', async () => {
    // The mixed statement. If the trigger let the row through while only rejecting some columns,
    // an observation could be rewritten under cover of an innocuous metadata edit.
    await expect(
      client.query(
        `UPDATE public.drive_reports
            SET metadata = '{"annotated":"cover"}'::jsonb,
                sections = '{"tampered":true}'::jsonb
          WHERE id = $1`,
        [reportId],
      ),
    ).rejects.toThrow(/sections is append-only/);

    const { rows } = await client.query('SELECT sections, metadata FROM public.drive_reports WHERE id = $1', [reportId]);
    expect(rows[0].sections).toEqual({ plan_position: { value: 1 } });
    expect(rows[0].metadata, 'the writable column must not have applied either').not.toEqual({ annotated: 'cover' });
  });
});

describe('consumption receipts — one row per (report, lane), no merge and no clobber window', () => {
  let reportId;
  beforeAll(async () => {
    await applyMigration();
    const { rows } = await client.query(
      "INSERT INTO public.drive_reports (run_id, sections) VALUES ('receipts-run', '{\"a\":1}'::jsonb) RETURNING id;",
    );
    reportId = rows[0].id;
  });

  it('accepts one receipt per lane and REFUSES a second for the same lane', async () => {
    // The constraint IS the design. Without it the table is a log, and every writer is back to
    // read-merge-write — the hazard the per-lane shape was chosen to remove.
    await client.query("INSERT INTO public.drive_report_receipts (report_id, lane) VALUES ($1, 'adam');", [reportId]);
    await expect(
      client.query("INSERT INTO public.drive_report_receipts (report_id, lane) VALUES ($1, 'adam');", [reportId]),
    ).rejects.toThrow(/drive_report_receipts_report_lane_uniq|duplicate key/i);
  });

  it('[THE WHOLE POINT] a lane upserting its own receipt CANNOT touch a sibling lane', async () => {
    // Under the jsonb map this was the hazard: a naive write clobbered sibling lanes and the
    // damage surfaced in THEIR lane, not the writer's. Here there is no statement that reaches
    // another lane's row, so the guarantee is structural rather than a predicate to remember.
    await client.query("INSERT INTO public.drive_report_receipts (report_id, lane) VALUES ($1, 'chairman_brief');", [reportId]);
    await client.query(
      `INSERT INTO public.drive_report_receipts (report_id, lane, metadata) VALUES ($1, 'adam', '{"re":"read"}'::jsonb)
       ON CONFLICT (report_id, lane) DO UPDATE SET metadata = EXCLUDED.metadata, consumed_at = now();`,
      [reportId],
    );
    const { rows } = await client.query(
      'SELECT lane, metadata FROM public.drive_report_receipts WHERE report_id = $1 ORDER BY lane;',
      [reportId],
    );
    expect(rows.map((r) => r.lane)).toEqual(['adam', 'chairman_brief']);
    expect(rows.find((r) => r.lane === 'adam').metadata).toEqual({ re: 'read' });
    expect(rows.find((r) => r.lane === 'chairman_brief').metadata, 'the sibling lane must be untouched').toEqual({});
  });

  it('REFUSES a lane outside the vocabulary — a typo would read as "never consumed"', async () => {
    // 'chairman-brief' with a hyphen would insert cleanly without the CHECK, take its own
    // UNIQUE slot, and leave the real lane looking like it never read the report.
    for (const bad of ['chairman-brief', 'Coordinator', 'eva']) {
      await expect(
        client.query('INSERT INTO public.drive_report_receipts (report_id, lane) VALUES ($1, $2);', [reportId, bad]),
      ).rejects.toThrow(/violates check constraint/i);
    }
  });

  it('REFUSES a receipt for a report that does not exist', async () => {
    await expect(
      client.query("INSERT INTO public.drive_report_receipts (report_id, lane) VALUES (gen_random_uuid(), 'adam');"),
    ).rejects.toThrow(/violates foreign key constraint/i);
  });

  it('deleting the report takes its receipts with it', async () => {
    const { rows: r } = await client.query(
      "INSERT INTO public.drive_reports (run_id, sections) VALUES ('cascade-run', '{}'::jsonb) RETURNING id;",
    );
    await client.query("INSERT INTO public.drive_report_receipts (report_id, lane) VALUES ($1, 'adam');", [r[0].id]);
    await client.query('DELETE FROM public.drive_reports WHERE id = $1;', [r[0].id]);
    const { rows } = await client.query('SELECT count(*)::int AS n FROM public.drive_report_receipts WHERE report_id = $1;', [r[0].id]);
    expect(rows[0].n, 'a receipt for a deleted report is a dangling claim').toBe(0);
  });

  it('the superseded jsonb column is GONE, and the verify block enforces that', async () => {
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='drive_reports' AND column_name='consumption_receipts';",
    );
    expect(rows[0].n).toBe(0);

    // Two representations of one fact is the failure; re-adding the column must fail the deploy.
    await client.query("ALTER TABLE public.drive_reports ADD COLUMN consumption_receipts jsonb NOT NULL DEFAULT '{}'::jsonb;");
    try {
      await expect(client.query(VERIFY_BLOCK)).rejects.toThrow(/consumption_receipts still exists/);
    } finally {
      await client.query('ALTER TABLE public.drive_reports DROP COLUMN consumption_receipts;');
    }
    await expect(client.query(VERIFY_BLOCK)).resolves.toBeTruthy();
  });

  it('dropping the UNIQUE constraint fails the verify block', async () => {
    await client.query('ALTER TABLE public.drive_report_receipts DROP CONSTRAINT drive_report_receipts_report_lane_uniq;');
    try {
      await expect(client.query(VERIFY_BLOCK)).rejects.toThrow(/UNIQUE\(report_id, lane\) is missing/);
    } finally {
      await applyMigration();
    }
  });

  it('the receipts table is service-role-only, same posture as the report', async () => {
    await client.query('GRANT SELECT ON public.drive_report_receipts TO anon;');
    try {
      await expect(client.query(VERIFY_BLOCK)).rejects.toThrow(/drive_report_receipts: a non-service grant/);
    } finally {
      await client.query('REVOKE ALL ON public.drive_report_receipts FROM anon;');
    }
    await expect(client.query(VERIFY_BLOCK)).resolves.toBeTruthy();
  });
});

describe('idempotence — the file advertises it and nothing proved it', () => {
  it('re-running the entire migration succeeds and preserves existing rows', async () => {
    // SELF-CONTAINED, because comparing count-before to count-after passes VACUOUSLY on an empty
    // table (0 === 0). As written it depended on an earlier describe having inserted rows first —
    // an ordering dependency, not an assertion. Run alone, or reordered, it proved nothing.
    const { rows: seed } = await client.query(
      `INSERT INTO public.drive_reports (sections)
       VALUES ('{"idempotence":"sentinel"}'::jsonb) RETURNING id`,
    );
    const sentinelId = seed[0].id;

    const { rows: before } = await client.query('SELECT count(*)::int AS n FROM public.drive_reports');
    // The comparison below is meaningless at zero, so this is the guard that makes it mean something.
    expect(before[0].n).toBeGreaterThan(0);

    // IF NOT EXISTS / DROP ... IF EXISTS advertise re-runnability; a CREATE POLICY without its
    // DROP would raise here, and a CREATE TABLE without IF NOT EXISTS would take the data.
    await applyMigration();

    const { rows: after } = await client.query('SELECT count(*)::int AS n FROM public.drive_reports');
    expect(after[0].n).toBe(before[0].n);

    // A count can match while the CONTENTS were replaced. Name the row and read it back.
    const { rows: survived } = await client.query(
      'SELECT sections FROM public.drive_reports WHERE id = $1',
      [sentinelId],
    );
    expect(survived).toHaveLength(1);
    expect(survived[0].sections).toEqual({ idempotence: 'sentinel' });
  });
});

describe('the grant tripwire — deny-by-default, not an enumeration', () => {
  beforeEach(resetGrants);

  afterAll(async () => {
    if (!client) return;
    await client.query(`DO $d$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${INVENTED_ROLE}') THEN
        EXECUTE 'REVOKE ALL ON public.drive_reports FROM ${INVENTED_ROLE}';
        EXECUTE 'DROP ROLE ${INVENTED_ROLE}';
      END IF;
    END $d$;`);
  });

  it('the shipped posture PASSES its own verify block', async () => {
    await expect(client.query(VERIFY_BLOCK)).resolves.toBeTruthy();
  });

  // ── THE DISCRIMINATING CASE ──────────────────────────────────────────────────────────────
  // Worth more than the rest combined, because it does not merely assert that the current
  // predicate is correct — it shows the predicate it REPLACED is not, on the same input. A
  // rewrite that quietly changed nothing would fail this pair and pass everything else.

  it('GRANT TO PUBLIC: the CURRENT predicate FAILS', async () => {
    await client.query('GRANT SELECT ON public.drive_reports TO PUBLIC;');
    await expect(client.query(VERIFY_BLOCK)).rejects.toThrow(/non-service grant exists \(including PUBLIC\)/);
  });

  it('GRANT TO PUBLIC: the OLD two-role predicate PASSES — this is the widening, demonstrated', async () => {
    await client.query('GRANT SELECT ON public.drive_reports TO PUBLIC;');
    // The old check enumerated 'anon' and 'authenticated' by name, so a PUBLIC grant walked
    // straight past the one assertion enforcing the reclassification ruling. Not because
    // information_schema is blind to PUBLIC — it is not — but because a list is not a rule.
    await expect(client.query(OLD_PREDICATE_BLOCK)).resolves.toBeTruthy();
  });

  it('GRANT TO an INVENTED role: current FAILS, old PASSES — deny-by-default as a property', async () => {
    await client.query(`DO $c$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${INVENTED_ROLE}') THEN
        EXECUTE 'CREATE ROLE ${INVENTED_ROLE} NOLOGIN';
      END IF;
    END $c$;`);
    await client.query(`GRANT SELECT ON public.drive_reports TO ${INVENTED_ROLE};`);

    // A role nobody thought to name when the migration was written. The current predicate catches
    // it by construction; an enumeration can only catch it by amendment.
    await expect(client.query(VERIFY_BLOCK)).rejects.toThrow(/non-service grant exists \(including PUBLIC\)/);
    await expect(client.query(OLD_PREDICATE_BLOCK)).resolves.toBeTruthy();
  });

  it('GRANT TO anon: BOTH predicates fail — the case the old one did cover', async () => {
    await client.query('GRANT SELECT ON public.drive_reports TO anon;');
    await expect(client.query(VERIFY_BLOCK)).rejects.toThrow(/non-service grant exists \(including PUBLIC\)/);
    await expect(client.query(OLD_PREDICATE_BLOCK)).rejects.toThrow(/OLD PREDICATE/);
  });

  it('GRANT TO authenticated: current FAILS', async () => {
    await client.query('GRANT SELECT ON public.drive_reports TO authenticated;');
    await expect(client.query(VERIFY_BLOCK)).rejects.toThrow(/non-service grant exists \(including PUBLIC\)/);
  });

  it('TWO-SIDED: owner privileges alone do NOT trip it', async () => {
    // `a.grantee <> c.relowner`. A tripwire that fired on the owner's own privileges would fail
    // every deploy, and would pass all five rejection cases above while being unusable.
    const { rows } = await client.query(
      "SELECT pg_get_userbyid(c.relowner) AS owner FROM pg_class c WHERE c.oid = 'public.drive_reports'::regclass",
    );
    // toBeTruthy() passed on any non-empty string, including one that would make this test
    // meaningless. What actually has to hold is that the owner is a REAL principal and is NOT one
    // of the grantees the tripwire checks — otherwise `grantee <> c.relowner` would be excluding
    // the very role the assertion exists to catch.
    expect(typeof rows[0].owner).toBe('string');
    expect(rows[0].owner.length).toBeGreaterThan(0);
    expect(['service_role', 'anon', 'authenticated']).not.toContain(rows[0].owner);
    await expect(client.query(VERIFY_BLOCK)).resolves.toBeTruthy();
  });

  it('TWO-SIDED: service_role holding ALL does NOT trip it', async () => {
    // The posture the migration ships. If the predicate flagged service_role, the migration could
    // never apply — and every "it correctly rejects X" test above would still be green.
    const { rows } = await client.query(`
      SELECT count(*)::int AS n
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
      WHERE c.oid = 'public.drive_reports'::regclass
        AND pg_get_userbyid(NULLIF(a.grantee, 0)) = 'service_role'`);
    expect(rows[0].n).toBeGreaterThan(0);
    await expect(client.query(VERIFY_BLOCK)).resolves.toBeTruthy();
  });

  it('a revoked grant CLEARS the tripwire — it latches on state, not on history', async () => {
    await client.query('GRANT SELECT ON public.drive_reports TO PUBLIC;');
    await expect(client.query(VERIFY_BLOCK)).rejects.toThrow(/non-service grant exists \(including PUBLIC\)/);

    await client.query('REVOKE ALL ON public.drive_reports FROM PUBLIC;');
    // A check that cannot go back to passing would be indistinguishable from a permanently broken
    // one, and the next person would learn to ignore it.
    await expect(client.query(VERIFY_BLOCK)).resolves.toBeTruthy();
  });
});

describe('the RLS posture the classification is conditional on', () => {
  beforeEach(resetGrants);

  it('RLS is enabled and there is EXACTLY one policy, named as the migration expects', async () => {
    const { rows: rls } = await client.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.drive_reports'::regclass",
    );
    expect(rls[0].relrowsecurity).toBe(true);

    const { rows: pol } = await client.query(
      "SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'drive_reports'",
    );
    expect(pol.map((p) => p.policyname)).toEqual(['drive_reports_service_role']);
  });

  it('the freeze trigger exists and is not internal', async () => {
    const { rows } = await client.query(`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'public.drive_reports'::regclass
        AND tgname = 'drive_reports_freeze_observations_trg'
        AND NOT tgisinternal`);
    expect(rows).toHaveLength(1);
  });

  it('a SECOND policy makes the verify block fail — "exactly one" is enforced, not described', async () => {
    await client.query('CREATE POLICY qa_extra_policy ON public.drive_reports FOR SELECT TO service_role USING (true);');
    try {
      await expect(client.query(VERIFY_BLOCK)).rejects.toThrow(/expected exactly ONE policy/);
    } finally {
      await client.query('DROP POLICY IF EXISTS qa_extra_policy ON public.drive_reports;');
    }
    await expect(client.query(VERIFY_BLOCK)).resolves.toBeTruthy();
  });

  it('dropping the freeze trigger makes the verify block fail', async () => {
    await client.query('DROP TRIGGER drive_reports_freeze_observations_trg ON public.drive_reports;');
    try {
      await expect(client.query(VERIFY_BLOCK)).rejects.toThrow(/append-only trigger is missing/);
    } finally {
      await applyMigration(); // re-creates the trigger and re-runs the block
    }
  });
});

describe('one row per run_id — enforced by the database, not by the producer', () => {
  beforeAll(async () => { await applyMigration(); });

  // The producer already probes for an existing run_id before writing. That probe is a decision
  // made from a stale read: two overlapping ticks of the self-healing window, or a job re-run
  // racing the original, can both see "no row" and both insert. These tests are about what
  // survives when the application guard loses that race.

  it('REJECTS a second row with the same run_id', async () => {
    await client.query("INSERT INTO public.drive_reports (run_id, sections) VALUES ('dup-run-1', '{\"a\":1}'::jsonb);");
    await expect(
      client.query("INSERT INTO public.drive_reports (run_id, sections) VALUES ('dup-run-1', '{\"b\":2}'::jsonb);")
    ).rejects.toThrow(/drive_reports_run_id_uniq|duplicate key/i);

    const { rows } = await client.query("SELECT count(*)::int AS n FROM public.drive_reports WHERE run_id = 'dup-run-1';");
    expect(rows[0].n, 'exactly one row survived the second insert').toBe(1);
  });

  it('[TWO-SIDED] a DIFFERENT run_id still inserts — the guard must not suppress legitimate runs', async () => {
    // Without this, an index so blunt it rejected everything would pass the test above.
    await client.query("INSERT INTO public.drive_reports (run_id, sections) VALUES ('dup-run-2', '{}'::jsonb);");
    const { rows } = await client.query("SELECT count(*)::int AS n FROM public.drive_reports WHERE run_id IN ('dup-run-1','dup-run-2');");
    expect(rows[0].n).toBe(2);
  });

  it('MULTIPLE null run_ids are allowed — the index is partial by design', async () => {
    // Ad-hoc rows (cadence on_demand) carry no run id. A non-partial unique index would still
    // permit these, since NULLs compare distinct — so this pins the INTENT, and the assertion
    // below pins the mechanism that makes the intent true rather than incidental.
    await client.query("INSERT INTO public.drive_reports (run_id, sections) VALUES (NULL, '{}'::jsonb), (NULL, '{}'::jsonb);");
    const { rows } = await client.query('SELECT count(*)::int AS n FROM public.drive_reports WHERE run_id IS NULL;');
    expect(rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it('the index is UNIQUE and PARTIAL, not merely present under the right name', async () => {
    const { rows } = await client.query(`
      SELECT i.indisunique, i.indpred IS NOT NULL AS is_partial
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      WHERE i.indrelid = 'public.drive_reports'::regclass AND c.relname = 'drive_reports_run_id_uniq';
    `);
    expect(rows, 'drive_reports_run_id_uniq does not exist').toHaveLength(1);
    expect(rows[0].indisunique).toBe(true);
    expect(rows[0].is_partial).toBe(true);
  });

  it('dropping the index makes the verify block fail — the assertion is not decoration', async () => {
    await client.query('DROP INDEX public.drive_reports_run_id_uniq;');
    try {
      await expect(client.query(VERIFY_BLOCK)).rejects.toThrow(/drive_reports_run_id_uniq is missing/);
    } finally {
      await applyMigration();
    }
    await expect(client.query(VERIFY_BLOCK)).resolves.toBeTruthy();
  });

  it('a NON-UNIQUE index of the same name ALSO fails the verify block', async () => {
    // The discriminating case. A name-only assertion passes here while the table happily accepts
    // the duplicate that corrupts section 5 — enforcement that reads correct and enforces nothing.
    await client.query('DROP INDEX public.drive_reports_run_id_uniq;');
    await client.query('CREATE INDEX drive_reports_run_id_uniq ON public.drive_reports (run_id) WHERE run_id IS NOT NULL;');
    try {
      await expect(client.query(VERIFY_BLOCK)).rejects.toThrow(/not UNIQUE, or not partial/);
    } finally {
      await client.query('DROP INDEX IF EXISTS public.drive_reports_run_id_uniq;');
      await applyMigration();
    }
  });
});

describe('the holes the SECURITY re-run found — closed, and proven closed', () => {
  beforeAll(async () => { await applyMigration(); });

  it('a COLUMN grant to anon trips the tripwire — relacl alone could not see it', async () => {
    // The same defect as the old two-role list, one level down: `GRANT SELECT (sections)` lands
    // in pg_attribute.attacl and leaves pg_class.relacl untouched, so the table-level check
    // passes while a non-service grant exists.
    await client.query('GRANT SELECT (sections) ON public.drive_reports TO anon;');
    try {
      await expect(client.query(VERIFY_BLOCK)).rejects.toThrow(/non-service COLUMN grant/);
    } finally {
      await client.query('REVOKE ALL (sections) ON public.drive_reports FROM anon;');
    }
    await expect(client.query(VERIFY_BLOCK)).resolves.toBeTruthy();
  });

  it('[TWO-SIDED] a COLUMN grant to service_role does NOT trip it', async () => {
    // Without this, a check that rejected every column grant would pass the test above.
    await client.query('GRANT SELECT (sections) ON public.drive_reports TO service_role;');
    try {
      await expect(client.query(VERIFY_BLOCK)).resolves.toBeTruthy();
    } finally {
      await client.query('REVOKE ALL (sections) ON public.drive_reports FROM service_role;');
    }
  });

  it('run_id is FROZEN — clearing it would free the key for a duplicate', async () => {
    // The bypass around the partial unique index: NULLing run_id moves the row out of the index
    // predicate (WHERE run_id IS NOT NULL), so the key becomes insertable again and the
    // section-5 self-diff corruption is back.
    await client.query("INSERT INTO public.drive_reports (run_id, sections) VALUES ('frozen-1', '{}'::jsonb);");
    await expect(
      client.query("UPDATE public.drive_reports SET run_id = NULL WHERE run_id = 'frozen-1';")
    ).rejects.toThrow(/run_id is append-only/);
    await expect(
      client.query("UPDATE public.drive_reports SET run_id = 'frozen-2' WHERE run_id = 'frozen-1';")
    ).rejects.toThrow(/run_id is append-only/);

    const { rows } = await client.query("SELECT count(*)::int AS n FROM public.drive_reports WHERE run_id = 'frozen-1';");
    expect(rows[0].n, 'the row must still carry its original key').toBe(1);
  });

  it('[TWO-SIDED] metadata is still writable — the freeze must not spread to every column', async () => {
    // Without this, a blanket immutability trigger would pass every freeze assertion above. Under
    // the per-lane ruling metadata is now the ONLY writable field on this row, which makes it the
    // only thing standing between "append-only observations" and "wholly immutable row".
    await client.query('UPDATE public.drive_reports SET metadata = \'{"annotated":true}\'::jsonb WHERE run_id = \'frozen-1\';');
    const { rows } = await client.query("SELECT metadata->>'annotated' AS a FROM public.drive_reports WHERE run_id = 'frozen-1';");
    expect(rows[0].a).toBe('true');
  });
});
