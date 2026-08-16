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

function stubFunctionSql([name, args]) {
  return `
CREATE OR REPLACE FUNCTION public.${name}(${args})
RETURNS void LANGUAGE sql SECURITY DEFINER AS $stub$ SELECT NULL::void; $stub$;
GRANT EXECUTE ON FUNCTION public.${name}(${args}) TO PUBLIC, anon, authenticated, service_role;
`;
}

const STUB_SCHEMA = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN;  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
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
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

${[...BUCKET_A, ...BUCKET_B, ...BUCKET_C].map(stubFunctionSql).join('\n')}
`;

let client;
let preAdpControlGrant; // captured between STUB_SCHEMA and applyMigration() — see beforeAll.

async function applyMigration() {
  await client.query(MIGRATION_SQL);
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

  // Two-sided control for the FR-4 ADP test, captured HERE — the only point in this file where
  // "before the migration's ALTER DEFAULT PRIVILEGES ran" is actually true. A function created
  // under STUB_SCHEMA's seeded default (mirrors live pg_default_acl: anon+authenticated granted)
  // must show anon=true right now, proving the seeded default is real and the post-migration
  // probe test (which runs after applyMigration()) is discriminating on the ADP change itself,
  // not reporting a role that was never grantable in this ephemeral database at all.
  await client.query('CREATE FUNCTION public._test_pre_adp_control() RETURNS void LANGUAGE sql AS \'SELECT NULL::void\'');
  preAdpControlGrant = await grantState('_test_pre_adp_control', '');

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
