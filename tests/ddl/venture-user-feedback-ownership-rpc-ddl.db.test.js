// SD-LEO-FIX-CLOSE-ANON-VENTURE-001 — the DDL tier for
// database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN
//
// This runs against an EPHEMERAL vanilla PostgreSQL 16 with a hand-stubbed schema, reproduced only
// as far as this migration (and its Phase-1 prerequisite, applied first for real, not stubbed) touch
// it. It proves this migration's OWN new logic (ownership check, rate-limit polarity, policy
// removal, pre-flight guard) does what it claims. It does NOT prove:
//   - production posture (Supabase ALTER DEFAULT PRIVILEGES is not reproduced by vanilla Postgres)
//   - that the FR-7 cross-migration sequencing constraint is respected at apply time — that is an
//     operational/ceremony-level check (see this migration's own header), not provable here
//   - anon-reachability over the real PostgREST/Supabase surface — that would be a Tier C live probe,
//     not this ephemeral Postgres
//
// Unlike the sibling telegram-revoke DDL test (which stubs Phase-1's objects with fakes), THIS file
// applies Phase-1's REAL migration file first, then this SD's migration on top — a closer rehearsal
// of the real apply sequence, and the only way to test this migration's own pre-flight guard against
// genuinely-present (not faked) Phase-1 objects.
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly rather than
// silently passing (matches this SD family's established convention).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const PHASE1_MIGRATION_PATH = fileURLToPath(
  new URL('../../database/chairman-gated/20260812_venture_ingest_key_binding.sql', import.meta.url),
);
const THIS_MIGRATION_PATH = fileURLToPath(
  new URL('../../database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql', import.meta.url),
);
const PHASE1_SQL = fs.readFileSync(PHASE1_MIGRATION_PATH, 'utf8');
const MIGRATION_SQL = fs.readFileSync(THIS_MIGRATION_PATH, 'utf8');

// Anchored to start-of-line, matching tests/ddl/telegram-bot-insert-feedback-drop-ddl.db.test.js's
// own extractor rationale: this migration's header prose mentions "$verify$" and "$preflight$"
// inside comments, which a plain indexOf would find instead of the real statement opener.
function extractDoBlock(sql, tagName, occurrence = 1) {
  const startRe = new RegExp(`^DO \\$${tagName}\\$$`, 'gm');
  let match;
  let count = 0;
  let startIdx = -1;
  while ((match = startRe.exec(sql)) !== null) {
    count += 1;
    if (count === occurrence) {
      startIdx = match.index;
      break;
    }
  }
  const marker = `$${tagName}$;`;
  const markerIdx = startIdx === -1 ? -1 : sql.indexOf(marker, startIdx);
  if (startIdx === -1 || markerIdx === -1) {
    throw new Error(`could not locate DO $${tagName}$ ... $${tagName}$; block (occurrence ${occurrence}) in migration SQL`);
  }
  return sql.slice(startIdx, markerIdx + marker.length);
}
const PREFLIGHT_1_SQL = extractDoBlock(MIGRATION_SQL, 'preflight');
const PREFLIGHT_2_SQL = extractDoBlock(MIGRATION_SQL, 'preflight2');
const VERIFY_BLOCK_SQL = extractDoBlock(MIGRATION_SQL, 'verify');

// Strips full-line `--` comments before matching (established convention, this SD family) — the
// header prose above names things like "REVOKE" and "record_venture_error" in plain English.
const MIGRATION_CODE_ONLY = MIGRATION_SQL.replace(/^\s*--.*$/gm, '');

// Minimal stand-ins for the parts of the real schema Phase-1's migration (applied for real below)
// and this SD's migration touch. The public.feedback columns match the LIVE schema exactly for the
// NOT NULL columns this migration's INSERT must populate (type, source_application, source_type,
// title all confirmed NOT NULL with no default via information_schema.columns, 2026-08-15 — not
// assumed from Phase-1's own simplified stub, which gives some of these columns defaults the real
// table does not have).
const STUB_SCHEMA = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN;  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.ventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  deleted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL,
  source_application VARCHAR(255) NOT NULL,
  source_type VARCHAR(30) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'new',
  severity VARCHAR(20),
  category VARCHAR(50),
  error_message TEXT,
  error_hash VARCHAR(64),
  occurrence_count INTEGER DEFAULT 1,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  votes INTEGER DEFAULT 0,
  assigned_to VARCHAR(100),
  triaged_by VARCHAR(100),
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  venture_id UUID,
  feedback_type VARCHAR(30) NOT NULL DEFAULT 'sentry_error',
  CONSTRAINT feedback_feedback_type_check CHECK (feedback_type IN (
    'sentry_error', 'user_bug', 'user_feature_request', 'user_usability', 'user_other', 'venture_error'
  )),
  CONSTRAINT feedback_source_type_check CHECK (source_type IN (
    'manual_feedback', 'auto_capture', 'uat_failure', 'error_capture', 'uncaught_exception',
    'unhandled_rejection', 'manual_capture', 'todoist_intake', 'youtube_intake',
    'claude_code_intake', 'telegram', 'user_feedback'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_venture_error_hash
  ON public.feedback (venture_id, error_hash)
  WHERE feedback_type = 'venture_error' AND venture_id IS NOT NULL;

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON public.feedback TO anon;

CREATE OR REPLACE FUNCTION public._venture_error_storm_watermark_hash()
RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'; $$;

-- Stand-in for the pre-existing public.record_venture_error, needed only so Phase-1's own
-- $verify$ block (pg_proc count=1 check) does not spuriously fail here.
CREATE OR REPLACE FUNCTION public.record_venture_error(
  p_venture_id uuid, p_error_hash text, p_message text, p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE sql
AS $$ SELECT jsonb_build_object('ok', false, 'reason', 'stub_not_implemented'); $$;

CREATE OR REPLACE FUNCTION public.venture_exists_and_active(p_venture_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ventures v
    WHERE v.id = p_venture_id
      AND v.deleted_at IS NULL
      AND COALESCE(v.metadata->>'telemetry_ingestion_enabled', 'true') <> 'false'
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_anon_ingress_prior_hour_count(p_source_type text)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*) FROM public.feedback f
  WHERE f.source_type IS NOT DISTINCT FROM p_source_type
    AND f.created_at > now() - interval '1 hour';
$$;

-- check_feedback_rate_limit: TRUE = blocked (this file's whole point is testing THIS polarity is
-- used correctly), mirrors database/migrations/20260401_venture_user_feedback_channel.sql exactly.
CREATE OR REPLACE FUNCTION public.check_feedback_rate_limit(p_venture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT count(*) >= 50
  FROM public.feedback
  WHERE venture_id = p_venture_id
    AND feedback_type LIKE 'user_%'
    AND created_at > now() - interval '1 hour';
$$;

-- Pre-existing policies, mirroring live state BEFORE this SD's migration runs.
-- DROP IF EXISTS before each CREATE POLICY (Postgres has no CREATE POLICY IF NOT EXISTS): all
-- tests/ddl/**/*.db.test.js files share ONE ephemeral Postgres container within a CI job
-- (fileParallelism: false, sequential, but the DATABASE persists across files) — the sibling
-- telegram-bot-insert-feedback-drop-ddl.db.test.js's own stub also declares
-- anon_feedback_ingress_bounds, and whichever file's beforeAll runs second would otherwise hit
-- 42710 "policy already exists" (measured live in CI, this SD's first push).
DROP POLICY IF EXISTS venture_user_insert_feedback ON public.feedback;
CREATE POLICY venture_user_insert_feedback ON public.feedback
  FOR INSERT TO anon
  WITH CHECK (
    feedback_type LIKE 'user_%'
    AND venture_id IS NOT NULL
    AND venture_exists_and_active(venture_id)
    AND (NOT check_feedback_rate_limit(venture_id))
  );

DROP POLICY IF EXISTS anon_feedback_ingress_bounds ON public.feedback;
CREATE POLICY anon_feedback_ingress_bounds ON public.feedback
  AS RESTRICTIVE
  FOR INSERT TO public
  WITH CHECK (true);
`;

let client;

async function applyPhase1() {
  await client.query(PHASE1_SQL);
}
async function applyThisMigration() {
  await client.query(MIGRATION_SQL);
}
async function makeVenture(name = 'Test Venture') {
  const { rows } = await client.query('INSERT INTO public.ventures (name) VALUES ($1) RETURNING id', [name]);
  return rows[0].id;
}
async function provisionSecret(ventureId) {
  const { rows } = await client.query('SELECT public.fn_provision_venture_ingest_key($1) AS secret', [ventureId]);
  return rows[0].secret;
}
async function submit(ventureId, secret, feedbackType, title, description) {
  return client.query(
    'SELECT public.fn_submit_venture_user_feedback($1, $2, $3, $4, $5) AS r',
    [ventureId, secret, feedbackType, title, description],
  );
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
  await applyPhase1();
  await applyThisMigration();
}, 60_000);

afterAll(async () => {
  if (client) await client.end();
});

describe('the migration applied', () => {
  it('venture_user_insert_feedback is gone from pg_policies (FR-3)', async () => {
    const { rows } = await client.query(`
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename='feedback' AND policyname='venture_user_insert_feedback'
    `);
    expect(rows).toHaveLength(0);
  });

  it('anon retains table-level INSERT privilege (grant not collaterally revoked, FR-3(d)/TR-1)', async () => {
    const { rows } = await client.query("SELECT has_table_privilege('anon','public.feedback','INSERT') AS ok");
    expect(rows[0].ok).toBe(true);
  });

  it('anon_feedback_ingress_bounds survives, INSERT-scoped, RESTRICTIVE, still applies to public role', async () => {
    const { rows } = await client.query(`
      SELECT cmd, permissive, 'public' = ANY(roles) AS applies_to_public FROM pg_policies
      WHERE schemaname='public' AND tablename='feedback' AND policyname='anon_feedback_ingress_bounds'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].cmd).toBe('INSERT');
    expect(rows[0].permissive).toBe('RESTRICTIVE');
    expect(rows[0].applies_to_public).toBe(true);
  });

  it('re-running this migration is idempotent', async () => {
    await applyThisMigration();
  });
});

describe('TR-2: grant posture on the new function', () => {
  it('anon CAN execute fn_submit_venture_user_feedback, authenticated CANNOT', async () => {
    const { rows: anonRow } = await client.query(
      "SELECT has_function_privilege('anon','public.fn_submit_venture_user_feedback(uuid,text,text,text,text)','EXECUTE') AS ok",
    );
    expect(anonRow[0].ok).toBe(true);
    const { rows: authRow } = await client.query(
      "SELECT has_function_privilege('authenticated','public.fn_submit_venture_user_feedback(uuid,text,text,text,text)','EXECUTE') AS ok",
    );
    expect(authRow[0].ok).toBe(false);
  });
});

describe('FR-1/TS-1: legitimate submission', () => {
  it('a valid secret for the SAME venture succeeds and the row lands with the correct venture_id', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    const { rows } = await submit(ventureId, secret, 'user_bug', 'it broke', 'detailed repro');
    expect(rows[0].r.ok).toBe(true);
    expect(rows[0].r.id).toBeTruthy();

    const { rows: landed } = await client.query(
      'SELECT venture_id, feedback_type, type, source_type, title FROM public.feedback WHERE id = $1',
      [rows[0].r.id],
    );
    expect(landed[0].venture_id).toBe(ventureId);
    expect(landed[0].feedback_type).toBe('user_bug');
    expect(landed[0].type).toBe('issue');
    expect(landed[0].source_type).toBe('user_feedback');
  });

  it('user_feature_request maps to type=enhancement, not issue', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    const { rows } = await submit(ventureId, secret, 'user_feature_request', 'add dark mode', null);
    const { rows: landed } = await client.query('SELECT type FROM public.feedback WHERE id = $1', [rows[0].r.id]);
    expect(landed[0].type).toBe('enhancement');
  });
});

describe('FR-1/TS-2/TS-3: uniform ownership rejection, indistinguishable by error alone', () => {
  async function captureError(ventureId, secret) {
    try {
      await submit(ventureId, secret, 'user_bug', 'x', null);
      throw new Error('expected rejection, got success');
    } catch (e) {
      return { code: e.code, message: e.message };
    }
  }

  it('[TS-2] venture B with venture A\'s secret is rejected, zero rows land, and the message names neither venture', async () => {
    const ventureA = await makeVenture('A');
    const ventureB = await makeVenture('B');
    const secretA = await provisionSecret(ventureA);
    const before = (await client.query('SELECT count(*)::int AS n FROM public.feedback')).rows[0].n;

    const err = await captureError(ventureB, secretA);
    expect(err.code).toBe('28000');
    expect(err.message).not.toContain(ventureA);
    expect(err.message).not.toContain(ventureB);

    const after = (await client.query('SELECT count(*)::int AS n FROM public.feedback')).rows[0].n;
    expect(after).toBe(before);
  });

  it('[TS-3] a nonexistent venture_id raises the SAME code and message text as TS-2, tuple-for-tuple', async () => {
    const ventureA = await makeVenture('A2');
    const ventureB = await makeVenture('B2');
    const secretA = await provisionSecret(ventureA);
    const spoofed = await captureError(ventureB, secretA);

    const nonexistentId = '00000000-0000-0000-0000-000000000000';
    const before = (await client.query('SELECT count(*)::int AS n FROM public.feedback')).rows[0].n;
    const nonexistent = await captureError(nonexistentId, 'any-secret-value');
    const after = (await client.query('SELECT count(*)::int AS n FROM public.feedback')).rows[0].n;

    expect(nonexistent.code).toBe(spoofed.code);
    expect(nonexistent.message).toBe(spoofed.message);
    expect(after).toBe(before);
  });
});

describe('FR-4/TS-7: soft-deleted or telemetry-disabled venture rejected even with a correct secret', () => {
  it('a soft-deleted venture is rejected via defense-in-depth, same uniform code', async () => {
    const { rows: vRows } = await client.query(
      "INSERT INTO public.ventures (name, deleted_at) VALUES ('gone', now()) RETURNING id",
    );
    const ventureId = vRows[0].id;
    const secret = await provisionSecret(ventureId);
    await expect(submit(ventureId, secret, 'user_bug', 'x', null)).rejects.toMatchObject({ code: '28000' });
  });

  it('a telemetry-disabled venture is rejected via defense-in-depth', async () => {
    const { rows: vRows } = await client.query(
      "INSERT INTO public.ventures (name, metadata) VALUES ('quiet', '{\"telemetry_ingestion_enabled\": false}'::jsonb) RETURNING id",
    );
    const ventureId = vRows[0].id;
    const secret = await provisionSecret(ventureId);
    await expect(submit(ventureId, secret, 'user_bug', 'x', null)).rejects.toMatchObject({ code: '28000' });
  });
});

describe('FR-2/TS-4/TS-9: rate-limit polarity — the discriminating case', () => {
  it('[TS-4/TS-9] a venture exceeding its OWN 50/hour threshold is rejected while a DIFFERENT under-threshold venture is not — proves correct (non-inverted) polarity', async () => {
    const ventureA = await makeVenture('flooder');
    const secretA = await provisionSecret(ventureA);
    for (let i = 0; i < 50; i++) {
      await submit(ventureA, secretA, 'user_bug', `flood ${i}`, null);
    }
    await expect(submit(ventureA, secretA, 'user_bug', 'one too many', null)).rejects.toThrow(/rate limited/);

    // If the polarity were inverted (IS NOT TRUE applied to check_feedback_rate_limit, which
    // returns TRUE=blocked), this over-threshold call would have SUCCEEDED instead of the above
    // rejecting -- this pair of assertions catches an inversion in EITHER direction.
    const ventureB = await makeVenture('sibling');
    const secretB = await provisionSecret(ventureB);
    const { rows } = await submit(ventureB, secretB, 'user_bug', 'unaffected', null);
    expect(rows[0].r.ok).toBe(true);
  }, 30_000);
});

describe('TR-1: no forgeable workflow columns as parameters', () => {
  it('the function signature has no status/votes/created_at/assigned_to/triaged_by/user_id parameter', () => {
    const sig = MIGRATION_CODE_ONLY.match(/CREATE OR REPLACE FUNCTION public\.fn_submit_venture_user_feedback\(([^)]*)\)/)[1];
    for (const forbidden of ['status', 'votes', 'created_at', 'assigned_to', 'triaged_by', 'user_id']) {
      expect(sig).not.toMatch(new RegExp(`p_${forbidden}\\b`));
    }
  });

  it('a successful insert gets server defaults for status/votes, never client-influenced', async () => {
    const ventureId = await makeVenture();
    const secret = await provisionSecret(ventureId);
    const { rows } = await submit(ventureId, secret, 'user_bug', 'x', null);
    const { rows: landed } = await client.query('SELECT status, votes FROM public.feedback WHERE id = $1', [rows[0].r.id]);
    expect(landed[0].status).toBe('new');
    expect(landed[0].votes).toBe(0);
  });
});

describe('TS-6: pre-flight guard is per-branch mutation-resistant (extracted from the real migration file, not hand-copied)', () => {
  it('[branch 1] RAISEs when venture_ingest_keys alone is absent', async () => {
    await client.query('BEGIN');
    try {
      await client.query('ALTER TABLE public.venture_ingest_keys RENAME TO venture_ingest_keys_hidden');
      await expect(client.query(PREFLIGHT_1_SQL)).rejects.toThrow(/venture_ingest_keys does not exist/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('[branch 2] RAISEs when _verify_venture_ingest_secret alone is absent', async () => {
    await client.query('BEGIN');
    try {
      await client.query('DROP FUNCTION public._verify_venture_ingest_secret(uuid, text)');
      await expect(client.query(PREFLIGHT_2_SQL)).rejects.toThrow(/_verify_venture_ingest_secret does not exist/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('neither branch raises when both prerequisites are present (two-sided — a guard that always fires would never catch a real regression)', async () => {
    await expect(client.query(PREFLIGHT_1_SQL)).resolves.toBeDefined();
    await expect(client.query(PREFLIGHT_2_SQL)).resolves.toBeDefined();
  });
});

describe('$verify$ block (extracted from the real migration file) is mutation-resistant', () => {
  it('RAISEs if venture_user_insert_feedback were NOT actually dropped', async () => {
    await client.query('BEGIN');
    try {
      await client.query(`
        CREATE POLICY venture_user_insert_feedback ON public.feedback
          FOR INSERT TO anon WITH CHECK (
            feedback_type LIKE 'user_%' AND venture_id IS NOT NULL AND venture_exists_and_active(venture_id)
          )
      `);
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/venture_user_insert_feedback still present/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('RAISEs if the table-level anon-INSERT grant were collaterally revoked', async () => {
    await client.query('BEGIN');
    try {
      await client.query('REVOKE INSERT ON public.feedback FROM anon');
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/lost table-level INSERT privilege/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('RAISEs if anon_feedback_ingress_bounds is dropped or de-scoped', async () => {
    await client.query('BEGIN');
    try {
      await client.query('DROP POLICY IF EXISTS anon_feedback_ingress_bounds ON public.feedback');
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/anon_feedback_ingress_bounds is missing/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('RAISEs if RLS is disabled on public.feedback', async () => {
    await client.query('BEGIN');
    try {
      await client.query('ALTER TABLE public.feedback DISABLE ROW LEVEL SECURITY');
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/does not have RLS enabled/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('RAISEs if the new function loses its anon EXECUTE grant', async () => {
    await client.query('BEGIN');
    try {
      await client.query('REVOKE EXECUTE ON FUNCTION public.fn_submit_venture_user_feedback(uuid,text,text,text,text) FROM anon');
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/NOT anon-callable/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('RAISEs if authenticated is granted EXECUTE on the new function', async () => {
    await client.query('BEGIN');
    try {
      await client.query('GRANT EXECUTE ON FUNCTION public.fn_submit_venture_user_feedback(uuid,text,text,text,text) TO authenticated');
      await expect(client.query(VERIFY_BLOCK_SQL)).rejects.toThrow(/callable by authenticated/);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('does NOT raise in the correct post-migration state (two-sided)', async () => {
    await expect(client.query(VERIFY_BLOCK_SQL)).resolves.toBeDefined();
  });
});

describe('TS-5: raw anon INSERT against the bare table is rejected post-drop (bypassing the RPC entirely)', () => {
  it('a direct INSERT as anon with feedback_type=user_bug is rejected by RLS', async () => {
    const ventureId = await makeVenture();
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE anon');
      let err;
      try {
        await client.query(
          "INSERT INTO public.feedback (feedback_type, type, source_type, source_application, title, venture_id) VALUES ('user_bug', 'issue', 'user_feedback', 'x', 'raw insert attempt', $1)",
          [ventureId],
        );
      } catch (e) {
        err = e;
      }
      expect(err).toBeTruthy();
      expect(err.code).toBe('42501');
      expect(err.message).toMatch(/row-level security policy/);
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

// MUST RUN LAST IN THE FILE (measured live in CI, this SD's first push): the global ceiling
// (FR-2) counts ALL feedback_type IN ('user_bug', ...) rows created in the trailing hour, with
// no reset between test blocks -- every prior test in this file that lands a real row (TS-1,
// TS-4/TS-9's 51-row flood test, etc.) contributes to the SAME counter. A version of this test
// that assumed a clean slate (submit exactly 500, expect the 501st to fail) crashed mid-loop
// instead of reaching its own assertion, because earlier tests had already pushed the count
// close to the ceiling -- and left the counter tripped for every test that ran AFTER it. This
// version is state-aware (reads the current count first) and runs last, so it cannot pollute
// any other test's global-ceiling budget.
describe('FR-2/TS-10: global cross-venture ceiling (state-aware, must run last)', () => {
  it('[TS-10] tops up to exactly the boundary, then asserts the NEXT submission is rejected by the global ceiling', async () => {
    const GLOBAL_CEILING = 500;
    const { rows: countRows } = await client.query(
      "SELECT count(*)::int AS n FROM public.feedback WHERE feedback_type IN ('user_bug','user_feature_request','user_usability','user_other') AND created_at > now() - interval '1 hour'",
    );
    const already = countRows[0].n;
    const toLand = Math.max(0, GLOBAL_CEILING - already - 1); // leave exactly one slot open

    // Spread remaining submissions across enough ventures that no SINGLE venture's own 50/hour
    // per-venture threshold (a DIFFERENT check, FR-2 direct-truthy) can be the cause of a
    // rejection here -- only the global ceiling should fire in this test.
    const perVenture = 30;
    const venturesNeeded = Math.max(1, Math.ceil(toLand / perVenture));
    const secrets = [];
    for (let v = 0; v < venturesNeeded; v++) {
      const ventureId = await makeVenture(`global-${v}`);
      secrets.push([ventureId, await provisionSecret(ventureId)]);
    }
    for (let i = 0; i < toLand; i++) {
      const [ventureId, secret] = secrets[Math.floor(i / perVenture) % secrets.length];
      await submit(ventureId, secret, 'user_bug', `g${i}`, null);
    }

    // One fresh, never-before-used venture for the boundary assertion itself -- so a per-venture
    // limit on a REUSED venture from the top-up loop above cannot be mistaken for the global one.
    const boundaryVentureId = await makeVenture('global-boundary');
    const boundarySecret = await provisionSecret(boundaryVentureId);
    await expect(
      submit(boundaryVentureId, boundarySecret, 'user_bug', 'over global ceiling', null),
    ).rejects.toThrow(/rate limited/);
  }, 120_000);
});
