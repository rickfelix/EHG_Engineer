// SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 — the DDL tier for
// database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN (mirrors venture-ingest-key-binding-ddl's
// identical caveat)
//
// This runs against an EPHEMERAL vanilla PostgreSQL 16 with hand-stubbed roles and 27 minimal
// stub functions matching the REAL functions' signatures and PRE-migration grant state (all
// carrying PUBLIC+anon+authenticated+service_role EXECUTE, matching the live baseline captured
// 2026-08-16 in .artifacts/exec-live-baseline.json). It proves the migration's OWN REVOKE/GRANT/
// ALTER DEFAULT PRIVILEGES logic and its $verify$/$adp_self_test$ blocks behave correctly against
// a KNOWN starting state. It does NOT prove:
//   - that the REAL functions in production carry exactly this starting state at apply time
//     (state may have shifted since this baseline was captured — re-measure live immediately
//     before the chairman applies, per TR-1/FR-1's acceptance criteria)
//   - production RLS-policy or app-caller behavior after the revoke (that's the extended
//     scripts/audit-rpc-execute-grants.mjs run post-apply, a different tier)
//   - Supabase's actual pg_default_acl posture for the ADP statement (vanilla Postgres has none
//     by default; this test seeds a representative starting default before applying, per
//     TESTING sub-agent's explicit caveat that the ephemeral container must not let the ADP
//     self-test pass trivially in a world where its precondition never existed)
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly rather than
// silently passing (matches tests/ddl/drive-reports-ddl.db.test.js's convention).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATION_PATH = fileURLToPath(
  new URL('../../database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql', import.meta.url),
);
const MIGRATION_SQL = fs.readFileSync(MIGRATION_PATH, 'utf8');

// Signature list mirrors the migration's own REVOKE/GRANT statements and its baseline-capture
// array exactly. Each stub is a trivial SQL body — this test proves grant mechanics, not the
// real functions' business logic (that's out of scope for a DDL/ACL migration).
const BUCKET_A = [
  ['fn_enforce_stage_advancement_artifact_gate', ''],
  ['fn_quick_fixes_validate_target_application', ''],
  ['fn_stage_artifact_precondition', 'p_venture_id uuid, p_stage integer'],
  ['fn_user_has_company_access', 'company_uuid uuid'],
  ['fn_verify_and_consume_stepup_token', 'p_token uuid, p_decision_id uuid'],
  ['log_sd_mutation_audit', ''],
];
const BUCKET_B = [
  ['approve_chairman_decision', 'p_decision_id uuid, p_rationale text, p_decided_by text, p_approval_type approval_type_enum, p_stepup_token uuid'],
  ['check_feedback_duplicate', 'p_venture_id uuid, p_title text'],
  ['claim_sd', 'p_sd_id text, p_session_id text, p_track text, p_force_takeover boolean, p_client_gate_version integer'],
  ['fn_is_service_role', ''],
  ['fn_list_chairman_webauthn_credentials', ''],
  ['fn_user_has_venture_access', 'venture_uuid uuid'],
  ['fn_write_kill_audit_trail', 'p_venture_id uuid, p_lifecycle_stage integer, p_rationale text, p_decided_by uuid, p_source text, p_decision_id uuid'],
  ['get_gate_decision_status', 'p_venture_id uuid, p_stage integer'],
  ['reject_chairman_decision', 'p_decision_id uuid, p_rationale text, p_decided_by text, p_stepup_token uuid'],
  ['upsert_operator_cash_burn', 'p_cash_usd numeric, p_ai_burn_usd numeric, p_other_burn_usd numeric, p_revenue_usd numeric'],
];
const BUCKET_C = [
  ['check_feedback_rate_limit', 'p_venture_id uuid'],
  ['fn_advance_pipeline_stage', 'p_case_id uuid, p_from_stage text, p_to_stage text, p_provenance_event_id uuid, p_idempotency_key uuid'],
  ['fn_is_chairman', ''],
  ['fn_relay_insert_sms_candidate', 'p_provider_message_id text, p_from_phone text, p_to_phone text, p_body_raw text, p_relay_secret text'],
  ['is_leo_admin', ''],
  ['lhe_pending_migration_applied', ''],
  ['record_venture_error', 'p_venture_id uuid, p_error_hash text, p_message text, p_context jsonb'],
  ['set_session_working_context', 'p_session_id text, p_wc jsonb'],
  ['venture_exists_and_active', 'p_venture_id uuid'],
  ['is_chairman_role', ''],
  ['fn_anon_ingress_prior_hour_count', 'p_source_type text'],
];

// Four of Bucket C's real functions are ALSO stubbed by sibling DDL suites that share this same
// job's ephemeral Postgres container (vitest.ddl.config.mjs runs every tests/ddl/*.db.test.js
// file sequentially against ONE persistent database — confirmed by grepping the other files, not
// assumed). CREATE OR REPLACE FUNCTION cannot change an existing function's return type, so a
// bare `RETURNS void` stub here would fail with "cannot change return type of existing function"
// whenever a sibling file (which needs the REAL return type for its own business-logic checks)
// runs on either side of this file in the same CI job. Matching their return type — with a
// trivial, table-free body, since this file never invokes these functions, only checks grants —
// makes this file's CREATE OR REPLACE succeed regardless of execution order, and leaves the
// sibling's own CREATE OR REPLACE (using ITS real return type) equally unaffected by whichever
// ran first.
const RETURN_TYPE_OVERRIDES = {
  // record_venture_error: sibling stubs also declare `p_context jsonb DEFAULT '{}'::jsonb` —
  // CREATE OR REPLACE can ADD or change a default but cannot REMOVE one from an existing
  // function ("cannot remove parameter defaults from existing function", 42P13), so createArgs
  // carries the default ONLY for the CREATE statement. GRANT/REVOKE and regprocedure casts
  // (grantState() below) resolve purely by name+TYPES — defaults are not part of a function's
  // identity there — so they keep using the plain, default-free `args` from BUCKET_C unchanged.
  record_venture_error: {
    returns: 'jsonb',
    body: "SELECT '{}'::jsonb",
    createArgs: "p_venture_id uuid, p_error_hash text, p_message text, p_context jsonb DEFAULT '{}'::jsonb",
  }, // matches venture-ingest-key-binding-ddl / venture-user-feedback-ownership-rpc-ddl
  venture_exists_and_active: { returns: 'boolean', body: 'SELECT true' }, // matches venture-ingest-key-binding-ddl / venture-user-feedback-ownership-rpc-ddl / telegram-bot-insert-feedback-drop-ddl
  fn_anon_ingress_prior_hour_count: { returns: 'bigint', body: 'SELECT 0::bigint' }, // matches venture-ingest-key-binding-ddl / venture-user-feedback-ownership-rpc-ddl
  check_feedback_rate_limit: { returns: 'boolean', body: 'SELECT true' }, // matches venture-user-feedback-ownership-rpc-ddl / telegram-bot-insert-feedback-drop-ddl
};

function stubFunctionSql([name, args]) {
  const override = RETURN_TYPE_OVERRIDES[name];
  const returns = override?.returns ?? 'void';
  const body = override?.body ?? 'SELECT NULL::void';
  const createArgs = override?.createArgs ?? args;
  return `
CREATE OR REPLACE FUNCTION public.${name}(${createArgs})
RETURNS ${returns} LANGUAGE sql SECURITY DEFINER AS $stub$ ${body}; $stub$;
GRANT EXECUTE ON FUNCTION public.${name}(${args}) TO PUBLIC, anon, authenticated, service_role;
`;
}

const STUB_SCHEMA = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN;  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  -- The real migration hardcodes "ALTER DEFAULT PRIVILEGES FOR ROLE postgres" because that IS the
  -- real owning role on the live Supabase instance (measured live, not assumed) -- correct for
  -- production and must not change. The CI service container's bootstrap superuser is whatever
  -- POSTGRES_USER names (ddl_runner, per drive-reports-ddl.yml), and the postgres image does NOT
  -- also create a role literally named "postgres" in that case, so a stand-in of that name is
  -- created here. A BARE role only fixed "role postgres does not exist" -- ALTER DEFAULT
  -- PRIVILEGES FOR ROLE postgres then ran without error but had NO EFFECT, because default
  -- privileges are scoped to whichever role actually CREATES an object, and nothing in this test
  -- is ever created BY role postgres unless the session actively switches to it (SET ROLE,
  -- below). SUPERUSER here so that switching to it never loses the privilege ddl_runner had --
  -- without it, subsequent REVOKE/GRANT and CREATE FUNCTION statements on objects owned by
  -- ddl_runner would fail once the session is running as this otherwise-bare role.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')      THEN CREATE ROLE postgres NOLOGIN SUPERUSER; END IF;
END
$roles$;

DO $enum$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_type_enum') THEN
    CREATE TYPE approval_type_enum AS ENUM ('standard', 'expedited');
  END IF;
END
$enum$;

-- Seed a representative pre-migration default-privilege posture: role postgres's default ACL for
-- functions in public ALREADY grants anon/authenticated EXECUTE explicitly (mirrors the live
-- pg_default_acl measurement — see TESTING sub-agent's caveat: a vanilla ephemeral Postgres has
-- NO default ACL row at all by default, so the ADP self-test would pass trivially without this).
--
-- ROOT CAUSE (TESTING + SECURITY sub-agent RCA, EXEC-TO-PLAN review, confirmed via the DIAG3
-- probe below): this seed WAS unrepresentative. A default-ACL row created purely via GRANT (no
-- prior REVOKE) is computed by SetDefaultACL starting from acldefault('f', postgres), which
-- carries an IMPLICIT PUBLIC grant not shown in defaclacl's printed aclitem list — so the row
-- looked clean ({anon=X/postgres,authenticated=X/postgres}, no visible PUBLIC entry) while a
-- function created under it was still public_exec=true (measured directly: DIAG3 showed
-- public_exec=true on a probe created immediately after this seed, BEFORE the migration's own
-- REVOKE ever ran). Production's real ADP row already has PUBLIC revoked from an earlier fix, so
-- it never carries this implicit grant — this seed must explicitly REVOKE PUBLIC first so the
-- row's baseline matches production instead of acldefault()'s.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

${[...BUCKET_A, ...BUCKET_B, ...BUCKET_C].map(stubFunctionSql).join('\n')}
`;

/**
 * TS-5/TS-6: extract a named `DO $tag$ ... $tag$;` block verbatim from the REAL migration SQL,
 * so the failure-branch tests below exercise the exact shipped text — not a hand-reimplemented
 * copy that could silently drift from what the chairman actually applies. Anchored on the tag's
 * two occurrences (open + close), both confirmed unique in this file.
 */
function extractDollarQuotedDoBlock(tag) {
  const marker = `$${tag}$`;
  const firstIdx = MIGRATION_SQL.indexOf(marker);
  if (firstIdx === -1) throw new Error(`extractDollarQuotedDoBlock: marker ${marker} not found`);
  const secondIdx = MIGRATION_SQL.indexOf(marker, firstIdx + marker.length);
  if (secondIdx === -1) throw new Error(`extractDollarQuotedDoBlock: closing marker ${marker} not found`);
  const blockEnd = secondIdx + marker.length;
  const doStart = MIGRATION_SQL.lastIndexOf('DO', firstIdx);
  const semiIdx = MIGRATION_SQL.indexOf(';', blockEnd);
  if (doStart === -1 || semiIdx === -1) throw new Error(`extractDollarQuotedDoBlock: could not bound the DO...; statement for ${marker}`);
  return MIGRATION_SQL.slice(doStart, semiIdx + 1);
}

const ADP_SELF_TEST_SQL = extractDollarQuotedDoBlock('adp_self_test');
const VERIFY_BLOCK_SQL = extractDollarQuotedDoBlock('verify');
const ALL_27_NAMES = [...BUCKET_A, ...BUCKET_B, ...BUCKET_C].map(([n]) => n);
const BASELINE_CAPTURE_SQL = `
CREATE TEMP TABLE _pre_migration_baseline AS
SELECT p.oid,
       'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS full_sig,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[${ALL_27_NAMES.map((n) => `'${n}'`).join(',')}]);
`;

let client;
let preAdpControlGrant; // captured between STUB_SCHEMA and applyMigration() — see beforeAll.
let adpSelfTestPreFixResult; // {threw, message} — TS-5, captured in the same pre-fix window.

async function applyMigration() {
  // TEMPORARY DIAGNOSTIC round 2 (see the DIAG4 comment above beforeAll for context) -- the seed
  // fix in c09a764d1dc did not resolve the failure, so split again to see the RAW defaclacl text
  // (not just derived booleans) immediately after the migration's own REVOKE, mid-transaction.
  const ADP_MARKER = 'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;';
  const splitIdx = MIGRATION_SQL.indexOf(ADP_MARKER);
  if (splitIdx === -1) throw new Error('DIAG4: ADP_MARKER not found in MIGRATION_SQL — migration text changed, update the marker');
  const part1 = MIGRATION_SQL.slice(0, splitIdx + ADP_MARKER.length);
  const part2 = MIGRATION_SQL.slice(splitIdx + ADP_MARKER.length);

  await client.query(part1);

  const diagAcl = await client.query(
    `SELECT ro.rolname AS role, n.nspname AS schema, d.defaclobjtype AS objtype, d.defaclacl::text AS acl
     FROM pg_default_acl d
     JOIN pg_roles ro ON ro.oid = d.defaclrole
     LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
     WHERE ro.rolname = 'postgres'`,
  );
  console.log('[DIAG4] post-migration-REVOKE pg_default_acl for role postgres (mid-transaction, pre-self-test):', JSON.stringify(diagAcl.rows));

  await client.query(part2);
}

async function grantState(name, args) {
  const sig = `public.${name}(${args})`;
  const { rows } = await client.query(
    'SELECT has_function_privilege(\'anon\', $1::regprocedure, \'EXECUTE\') AS anon_exec, has_function_privilege(\'authenticated\', $1::regprocedure, \'EXECUTE\') AS auth_exec, has_function_privilege(\'public\', $1::regprocedure, \'EXECUTE\') AS public_exec',
    [sig],
  );
  return rows[0];
}

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

  // Switch the session's effective role to the stand-in "postgres" role for the rest of this
  // file. ALTER DEFAULT PRIVILEGES FOR ROLE X only affects objects actually CREATED BY role X --
  // registering the rule (already done, inside STUB_SCHEMA and inside MIGRATION_SQL below) works
  // regardless of who issues it, since ddl_runner is superuser, but every CREATE FUNCTION that
  // needs to OBSERVE that rule (the two-sided control probe just below, the ADP self-test's
  // pre-fix standalone run, the migration's own embedded probe, FR-4's post-migration probe) must
  // run AS role postgres or the rule never applies to it. Safe to stay switched for everything
  // after this point, including REVOKE/GRANT on objects owned by ddl_runner: postgres is SUPERUSER
  // (see STUB_SCHEMA above), so it bypasses ownership checks exactly like ddl_runner did.
  await client.query('SET ROLE postgres');

  // Two-sided control for the FR-4 ADP test, captured HERE — the only point in this file where
  // "before the migration's ALTER DEFAULT PRIVILEGES ran" is actually true. A function created
  // under STUB_SCHEMA's seeded default (mirrors live pg_default_acl: anon+authenticated granted)
  // must show anon=true right now, proving the seeded default is real and the post-migration
  // probe test (which runs after applyMigration()) is discriminating on the ADP change itself,
  // not reporting a role that was never grantable in this ephemeral database at all.
  await client.query('CREATE FUNCTION public._test_pre_adp_control() RETURNS void LANGUAGE sql AS \'SELECT NULL::void\'');
  preAdpControlGrant = await grantState('_test_pre_adp_control', '');
  // TEMPORARY DIAGNOSTIC round 2 (the REVOKE-then-GRANT seed fix from c09a764d1dc did NOT resolve
  // the CI failure -- ground truth needed on the RAW defaclacl text, not just derived booleans, to
  // check TESTING sub-agent's refined theory: does the row carry an explicit OWNER entry
  // (postgres=X/postgres), not just "no PUBLIC entry"? console.log (not a test assertion) so this
  // prints even though a later beforeAll throw would otherwise skip every it() in this file.
  const diagSeedAcl = await client.query(
    `SELECT ro.rolname AS role, n.nspname AS schema, d.defaclobjtype AS objtype, d.defaclacl::text AS acl
     FROM pg_default_acl d
     JOIN pg_roles ro ON ro.oid = d.defaclrole
     LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
     WHERE ro.rolname = 'postgres'`,
  );
  console.log('[DIAG4] post-seed (pre-migration) pg_default_acl for role postgres:', JSON.stringify(diagSeedAcl.rows));
  console.log('[DIAG4] pre-migration control grant:', JSON.stringify(preAdpControlGrant));

  // TS-5: run the migration's OWN extracted self-test block standalone, in this same pre-fix
  // window — before the ADP fix has been applied, its precondition check (has_anon OR has_public)
  // must be true, so the block must RAISE ADP_SELF_TEST_FAILED. This proves the self-test's
  // EXCEPTION-raising branch actually fires when it should, not just that it stays quiet when the
  // fix already worked (the FR-4 tests below only exercise the latter).
  try {
    await client.query(ADP_SELF_TEST_SQL);
    adpSelfTestPreFixResult = { threw: false, message: null };
  } catch (e) {
    adpSelfTestPreFixResult = { threw: true, message: e.message };
  }

  await applyMigration();
}, 60_000);

afterAll(async () => {
  if (client) await client.end();
});

describe('the migration applied', () => {
  it('did not throw during beforeAll (implicit — reaching any test here proves apply + verify block succeeded)', () => {
    expect(client).toBeTruthy();
  });
});

describe('FR-1: Bucket A — anon, authenticated AND public all revoked', () => {
  it.each(BUCKET_A)('%s(%s) has zero EXECUTE for anon/authenticated/public', async (name, args) => {
    const g = await grantState(name, args);
    expect(g.anon_exec).toBe(false);
    expect(g.auth_exec).toBe(false);
    expect(g.public_exec).toBe(false);
  });
});

describe('FR-2: Bucket B — anon and public revoked, authenticated explicitly preserved', () => {
  it.each(BUCKET_B)('%s(%s) has anon=false, public=false, authenticated=true', async (name, args) => {
    const g = await grantState(name, args);
    expect(g.anon_exec).toBe(false);
    expect(g.public_exec).toBe(false);
    expect(g.auth_exec).toBe(true);
  });
});

describe('FR-3: Bucket C — untouched, still carrying its pre-migration grants', () => {
  it.each(BUCKET_C)('%s(%s) still has anon EXECUTE (the migration must not have revoked it)', async (name, args) => {
    const g = await grantState(name, args);
    expect(g.anon_exec).toBe(true);
  });
});

describe('FR-4: ALTER DEFAULT PRIVILEGES — a NEW function created after the migration has no PUBLIC/anon default', () => {
  it('a throwaway function created post-migration is not anon/PUBLIC-executable by default', async () => {
    await client.query('CREATE FUNCTION public._test_post_migration_probe() RETURNS void LANGUAGE sql AS \'SELECT NULL::void\'');
    const g = await grantState('_test_post_migration_probe', '');
    expect(g.anon_exec).toBe(false);
    expect(g.public_exec).toBe(false);
    await client.query('DROP FUNCTION public._test_post_migration_probe()');
  });

  it('[TWO-SIDED CONTROL] a function created BEFORE the migration ran (captured in beforeAll, under STUB_SCHEMA\'s seeded default) DID carry anon EXECUTE — proving the post-migration probe above is discriminating on the ADP change itself, not reporting a role that was never grantable in this database at all', () => {
    expect(preAdpControlGrant.anon_exec).toBe(true);
  });

  it('[SEED FIDELITY] the pre-migration seed itself does NOT carry public_exec — regression guard for the fixture-fidelity defect this SD\'s own RCA found (SetDefaultACL seeding via GRANT-only carries an implicit, undisplayed PUBLIC grant from acldefault() that production\'s real ADP row does not have; STUB_SCHEMA now explicitly REVOKEs PUBLIC before granting anon/authenticated to match)', () => {
    expect(preAdpControlGrant.public_exec).toBe(false);
  });
});

describe('TS-5: the ADP self-test block itself correctly RAISEs on a pre-fix state (not just quiet post-fix)', () => {
  it('run standalone BEFORE the ADP fix applied (captured in beforeAll), the extracted self-test block threw ADP_SELF_TEST_FAILED', () => {
    expect(adpSelfTestPreFixResult.threw).toBe(true);
    expect(adpSelfTestPreFixResult.message).toMatch(/ADP_SELF_TEST_FAILED/);
  });
});

describe('TS-6: the Bucket C drift check itself correctly RAISEs when Bucket C drifts (not just quiet when untouched)', () => {
  it('deliberately revoking anon from a Bucket C function makes the extracted verify block RAISE, citing that function by name', async () => {
    await client.query(BASELINE_CAPTURE_SQL);
    await client.query('REVOKE EXECUTE ON FUNCTION public.is_chairman_role() FROM anon');
    try {
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/BUCKET C DRIFT/);
      const { rows } = await client.query(
        "SELECT has_function_privilege('anon', 'public.is_chairman_role()'::regprocedure, 'EXECUTE') AS anon_exec",
      );
      expect(rows[0].anon_exec).toBe(false); // confirms the corruption was real, not a no-op
    } finally {
      await client.query('GRANT EXECUTE ON FUNCTION public.is_chairman_role() TO anon');
      await client.query('DROP TABLE IF EXISTS _pre_migration_baseline');
    }
  });

  it('with Bucket C restored and a fresh baseline, the same extracted verify block does NOT throw', async () => {
    await client.query(BASELINE_CAPTURE_SQL);
    try {
      await client.query(VERIFY_BLOCK_SQL);
    } finally {
      await client.query('DROP TABLE IF EXISTS _pre_migration_baseline');
    }
  });
});

describe('re-running the migration', () => {
  it('is idempotent — a second apply does not throw', async () => {
    await applyMigration();
  });

  it('the verify block still passes after a no-op second apply (state unchanged, so still compliant)', async () => {
    const g = await grantState('fn_enforce_stage_advancement_artifact_gate', '');
    expect(g.anon_exec).toBe(false);
  });
});
