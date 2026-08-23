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
// 2026-08-16 in .artifacts/exec-live-baseline.json). It proves the migration's OWN REVOKE/GRANT
// logic and its $verify$ block behave correctly against a KNOWN starting state. It does NOT prove:
//   - that the REAL functions in production carry exactly this starting state at apply time
//     (state may have shifted since this baseline was captured — re-measure live immediately
//     before the chairman applies, per TR-1/FR-1's acceptance criteria)
//   - production RLS-policy or app-caller behavior after the revoke (that's the extended
//     scripts/audit-rpc-execute-grants.mjs run post-apply, a different tier)
//
// NOTE: this file previously also carried FR-4 (an ALTER DEFAULT PRIVILEGES recurrence-prevention
// statement + self-test). FR-4 was DESCOPED to a follow-up migration at EXEC-TO-PLAN after three
// independent, evidence-targeted fix attempts all failed identically — and a live production
// re-measurement (SECURITY sub-agent) found this is NOT a CI-fixture artifact: new functions are
// born PUBLIC-executable in production too (84% of all public functions, actively ongoing), so no
// further CI-side fix could have resolved it. See the forward migration's own header for the full
// finding. This file's STUB_SCHEMA, tests, and helpers were trimmed accordingly — Buckets A/B/C
// only.
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
  fn_verify_and_consume_stepup_token: { returns: 'boolean', body: 'SELECT true' }, // matches venture-teardown-disposition-ddl (SD-LEO-INFRA-VENTURE-KILL-CANCEL-001), real return type per live pg_get_function_result
  fn_write_kill_audit_trail: { returns: 'uuid', body: 'SELECT NULL::uuid' }, // matches venture-teardown-disposition-ddl (SD-LEO-INFRA-VENTURE-KILL-CANCEL-001), real return type per live pg_get_function_result
  fn_is_chairman: { returns: 'boolean', body: 'SELECT true' }, // matches venture-teardown-disposition-ddl (SD-LEO-INFRA-VENTURE-KILL-CANCEL-001), real return type per live pg_get_function_result
  // reject_chairman_decision: venture-teardown-disposition-ddl's own CREATE OR REPLACE declares
  // DEFAULT NULL on p_decided_by/p_stepup_token (matching the real live signature). If that file
  // runs first in this shared job, a CREATE OR REPLACE here using the plain (default-free)
  // BUCKET_B args would attempt to REMOVE those defaults -- also 42P13, same class as
  // record_venture_error above. createArgs carries the defaults for the CREATE statement only;
  // GRANT/REVOKE below still resolves by name+TYPES via the plain, default-free args.
  reject_chairman_decision: {
    returns: 'jsonb',
    body: "SELECT '{}'::jsonb",
    createArgs: 'p_decision_id uuid, p_rationale text, p_decided_by text DEFAULT NULL::text, p_stepup_token uuid DEFAULT NULL::uuid',
  }, // matches venture-teardown-disposition-ddl (SD-LEO-INFRA-VENTURE-KILL-CANCEL-001), real return type per live pg_get_function_result
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
END
$roles$;

DO $enum$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_type_enum') THEN
    CREATE TYPE approval_type_enum AS ENUM ('standard', 'expedited');
  END IF;
END
$enum$;

${[...BUCKET_A, ...BUCKET_B, ...BUCKET_C].map(stubFunctionSql).join('\n')}
`;

/**
 * TS-6: extract a named `DO $tag$ ... $tag$;` block verbatim from the REAL migration SQL, so the
 * failure-branch test below exercises the exact shipped text — not a hand-reimplemented copy that
 * could silently drift from what the chairman actually applies. Anchored on the tag's two
 * occurrences (open + close), both confirmed unique in this file.
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

async function applyMigration() {
  await client.query(MIGRATION_SQL);
}

/**
 * PostgreSQL's regprocedure input parser requires a BARE type list ("uuid, integer") — unlike
 * GRANT/REVOKE ON FUNCTION and CREATE FUNCTION, which both accept an optional leading parameter
 * name before each type ("p_venture_id uuid, p_stage integer", the format BUCKET_A/B/C store and
 * stubFunctionSql() legitimately reuses as-is). This latent bug was never exercised before this
 * file's beforeAll first succeeded (every prior CI run threw before any it() ran) — confirmed live
 * on the fixed HEAD: 42601 "syntax error at or near \"uuid\"" from every non-empty-arg grantState()
 * call, since regprocedure tried to parse "p_venture_id uuid" as a single type name.
 */
function typesOnly(argsStr) {
  if (!argsStr) return '';
  return argsStr
    .split(',')
    .map((part) => {
      const tokens = part.trim().split(/\s+/).filter(Boolean);
      return tokens.length >= 2 ? tokens.slice(1).join(' ') : tokens.join(' ');
    })
    .join(', ');
}

async function grantState(name, args) {
  const sig = `public.${name}(${typesOnly(args)})`;
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

// FR-4 (ALTER DEFAULT PRIVILEGES recurrence-prevention) and its TS-5 self-test-raises coverage
// were DESCOPED to a follow-up migration at EXEC-TO-PLAN — see the forward migration's own header
// for the full note. The tests that lived here (a post-migration probe function, a two-sided
// pre/post control, and a seed-fidelity regression guard) all existed solely to exercise that
// statement and were removed alongside it, not left behind as dead/skipped assertions.

describe('TS-6: the Bucket C drift check itself correctly RAISEs when Bucket C drifts (not just quiet when untouched)', () => {
  it('deliberately revoking anon from a Bucket C function makes the extracted verify block RAISE, citing that function by name', async () => {
    await client.query(BASELINE_CAPTURE_SQL);
    // TESTING sub-agent finding: `FROM anon` alone is a NO-OP here — stubFunctionSql granted
    // TO PUBLIC, anon, authenticated, service_role, so anon still inherits EXECUTE via PUBLIC and
    // has_function_privilege('anon', ...) stays true, meaning no drift ever exists to detect. Must
    // name PUBLIC explicitly (this SD's own central correctness point, biting its own test).
    await client.query('REVOKE EXECUTE ON FUNCTION public.is_chairman_role() FROM PUBLIC, anon');
    try {
      // Assert the corruption landed BEFORE asserting the guard fires, so a future regression to
      // a no-op corruption step fails with a clear "the corruption never happened" message instead
      // of an ambiguous "the guard didn't raise" one.
      const { rows } = await client.query(
        "SELECT has_function_privilege('anon', 'public.is_chairman_role()'::regprocedure, 'EXECUTE') AS anon_exec",
      );
      expect(rows[0].anon_exec).toBe(false); // confirms the corruption was real, not a no-op
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/BUCKET C DRIFT/);
    } finally {
      await client.query('GRANT EXECUTE ON FUNCTION public.is_chairman_role() TO PUBLIC, anon');
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
