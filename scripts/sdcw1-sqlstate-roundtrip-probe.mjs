#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — TS-29 STAGE 1.
 *
 * THE QUESTION: does a CUSTOM 5-character SQLSTATE ('SDCW1', in the unassigned range) survive
 * PostgREST's error-translation layer and reach a supabase-js caller verbatim as `error.code` —
 * or is it flattened, remapped, or absorbed into a 0-row success shape?
 *
 * Everything downstream in this SD rests on the answer. FR-4's F7 finding ("a trigger rejection and
 * a CAS/optimistic-lock miss ARE already unambiguously distinguishable — the discriminator is simply
 * `error !== null`") and scripts/modules/handoff/lib/canonical-writer-stamp.js's
 * isCanonicalWriteRejection() both assume `error.code === 'SDCW1'`. If that assumption is wrong, the
 * 15 wired call sites need a documented MESSAGE-TEXT fallback instead.
 *
 * WHY A SCRATCH TABLE, AND WHY THAT IS NOT A TR-1 VIOLATION. The round-trip is a property of
 * PostgREST, not of this SD's trigger or of strategic_directives_v2 — any table with any trigger
 * raising the code answers it identically. TR-1's narrow exception permits DDL confined to THROWAWAY
 * SCRATCH OBJECTS; DDL touching strategic_directives_v2 remains forbidden and this script never
 * references that table. Measured live 2026-08-24: no function in the entire live estate raises any
 * custom SQLSTATE (every explicit ERRCODE is a STANDARD code — 22004, 22023, 23514, 28000, 42501,
 * 53400 — or plpgsql's own P0001/P0002), so there is no zero-DDL surface to probe instead. The
 * previously-cited "verified verbatim for two real codes" evidence measured STANDARD codes, which is
 * exactly the case not in doubt.
 *
 * SELF-CLEANUP HAZARD, HANDLED: a probe that tidies up after itself erases the evidence that would
 * verify it ran at all. Raw observations are written to the artifact path below BEFORE any DROP, and
 * the file records the object names and timestamps so a reader can tell a real run from a claim.
 *
 * STAGE 2 (NOT THIS SCRIPT): re-run the same assertion against the REAL guard once the
 * chairman-gated migration has been applied. That is TS-29 as originally written, and it belongs to
 * the apply ceremony.
 *
 * Usage:  node scripts/sdcw1-sqlstate-roundtrip-probe.mjs
 * Exit 0 = round-trip holds. Exit 1 = it does not, and the fallback conversation is required.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { createDatabaseClient } from './lib/supabase-connection.js';

const TABLE = '_sdcw1_roundtrip_probe';
const GUARD_FN = '_sdcw1_roundtrip_probe_guard';
const TRIGGER = 'aaa_sdcw1_roundtrip_probe_guard';
const ARTIFACT = path.join('database', 'evidence', 'canonical-writer-choke', 'TS-29-stage1-sqlstate-roundtrip.json');

// The exact message texts the real guard raises, so this measures the real payload shape
// (including the format()-built DETAIL with %L quoting) and not a simplified stand-in.
const MSG_MISSING = 'missing canonical-writer stamp on protected-column write';
const MSG_INVALID = 'stamp value not present in canonical-writer registry';

const DDL_UP = `
-- Table first, CASCADE. "DROP TRIGGER IF EXISTS ... ON <table>" still ERRORS when the TABLE is
-- absent — the IF EXISTS covers the trigger, not its table — so a leading DROP TRIGGER makes this
-- script fail on its very first clean run, which is exactly what happened the first time.
DROP TABLE IF EXISTS public.${TABLE} CASCADE;
DROP FUNCTION IF EXISTS public.${GUARD_FN}();

CREATE TABLE public.${TABLE} (
  id                    TEXT PRIMARY KEY,
  status                TEXT,
  note                  TEXT,
  lifecycle_write_token TEXT
);

CREATE FUNCTION public.${GUARD_FN}() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.lifecycle_write_token IS NULL THEN
      RAISE EXCEPTION '${MSG_MISSING}'
        USING ERRCODE = 'SDCW1',
              DETAIL  = format('guard=%s sd=%s status:%s->%s', TG_NAME, NEW.id, OLD.status, NEW.status),
              HINT    = 'Set lifecycle_write_token to your registry identity in the SAME UPDATE statement.';
    END IF;
    IF NEW.lifecycle_write_token <> 'handoff.js' THEN
      RAISE EXCEPTION '${MSG_INVALID}'
        USING ERRCODE = 'SDCW1',
              DETAIL  = format('guard=%s sd=%s rejected_identity=%L', TG_NAME, NEW.id, NEW.lifecycle_write_token),
              HINT    = 'Enumerate valid identities with: SELECT writer_identity FROM public.sd_canonical_writer_policy();';
    END IF;
  END IF;
  NEW.lifecycle_write_token := NULL;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER ${TRIGGER} BEFORE UPDATE ON public.${TABLE}
  FOR EACH ROW EXECUTE FUNCTION public.${GUARD_FN}();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.${TABLE} TO service_role;

INSERT INTO public.${TABLE} (id, status, note) VALUES
  ('probe-row-1', 'draft', 'n'),
  ('probe-row-2', 'draft', 'n'),
  ('probe-row-3', 'draft', 'n'),
  ('probe-row-4', 'draft', 'n');

NOTIFY pgrst, 'reload schema';
`;

const DDL_DOWN = `
DROP TABLE IF EXISTS public.${TABLE} CASCADE;
DROP FUNCTION IF EXISTS public.${GUARD_FN}();
NOTIFY pgrst, 'reload schema';
`;

const shapeOfError = (error) =>
  error === null || error === undefined
    ? null
    : {
        code: error.code ?? null,
        message: error.message ?? null,
        details: error.details ?? null,
        hint: error.hint ?? null,
        own_keys: Object.keys(error).sort(),
        constructor_name: error?.constructor?.name ?? null,
      };

const observations = {
  probe: 'TS-29 Stage 1 — custom SQLSTATE round-trip through PostgREST + supabase-js',
  sd: 'SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001',
  started_at: new Date().toISOString(),
  scratch_objects: { table: `public.${TABLE}`, function: `public.${GUARD_FN}()`, trigger: TRIGGER },
  touched_strategic_directives_v2: false,
  cases: {},
};

let pg;
let ddlApplied = false;

function writeArtifact() {
  // BEFORE cleanup, unconditionally — see the self-cleanup note in the header.
  fs.mkdirSync(path.dirname(ARTIFACT), { recursive: true });
  fs.writeFileSync(ARTIFACT, `${JSON.stringify(observations, null, 2)}\n`);
}

try {
  pg = await createDatabaseClient('engineer', { verify: false });

  // Refuse to run if the scratch name collides with anything real.
  const { rows: collision } = await pg.query(
    "SELECT to_regclass($1) AS t",
    [`public.${TABLE}`],
  );
  if (collision[0].t) {
    console.log(`NOTE: public.${TABLE} already exists (a prior run did not clean up) — recreating it.`);
  }

  await pg.query(DDL_UP);
  ddlApplied = true;
  observations.ddl_applied_at = new Date().toISOString();
  console.log(`Created scratch objects: public.${TABLE}, ${TRIGGER}`);

  const supabase = createSupabaseServiceClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // PostgREST's schema cache is reloaded by the pgrst_ddl_watch event trigger, but not
  // instantaneously. Poll until the table is visible rather than racing it.
  let visible = false;
  for (let i = 0; i < 30 && !visible; i += 1) {
    const { error } = await supabase.from(TABLE).select('id').limit(1);
    if (!error) visible = true;
    else await new Promise((r) => setTimeout(r, 1000));
  }
  observations.postgrest_schema_visible = visible;
  if (!visible) throw new Error('PostgREST never exposed the scratch table — cannot measure the round-trip');
  console.log('PostgREST schema cache picked up the scratch table.');

  // ── CASE 1 — the exact call pattern used throughout scripts/modules/handoff/** ────────────────
  {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ status: 'changed' })
      .eq('id', 'probe-row-1')
      .select('id');
    observations.cases.missing_stamp_via_supabase_js = {
      pattern: ".update({status}).eq('id', ...).select('id')",
      data,
      data_is_null: data === null,
      data_is_array: Array.isArray(data),
      error: shapeOfError(error),
    };
    console.log(`CASE 1 missing-stamp: error.code=${error?.code} data=${JSON.stringify(data)}`);
  }

  // ── CASE 2 — the second message text, same SQLSTATE ───────────────────────────────────────────
  {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ status: 'changed', lifecycle_write_token: 'not-a-real-writer' })
      .eq('id', 'probe-row-2')
      .select('id');
    observations.cases.invalid_stamp_via_supabase_js = {
      data,
      data_is_null: data === null,
      error: shapeOfError(error),
    };
    console.log(`CASE 2 invalid-stamp: error.code=${error?.code}`);
  }

  // ── CASE 3 — TWO-SIDED: a valid stamp must SUCCEED, or a guard that rejects everything
  //             would satisfy cases 1 and 2 equally well ────────────────────────────────────────
  {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ status: 'changed', lifecycle_write_token: 'handoff.js' })
      .eq('id', 'probe-row-3')
      .select('id');
    observations.cases.valid_stamp_succeeds = { data, error: shapeOfError(error) };
    console.log(`CASE 3 valid-stamp: error=${error ? error.code : 'null'} rows=${data?.length}`);
  }

  // ── CASE 4 — THE DISCRIMINATOR F7 RESTS ON: a predicate matching zero rows must return
  //             error:null, so "rejected" and "lost the CAS race" are distinguishable ────────────
  {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ status: 'changed' })
      .eq('id', 'no-such-row-exists')
      .select('id');
    observations.cases.zero_row_predicate_is_not_an_error = {
      data,
      data_is_array: Array.isArray(data),
      row_count: Array.isArray(data) ? data.length : null,
      error: shapeOfError(error),
    };
    console.log(`CASE 4 zero-row: error=${error ? error.code : 'null'} rows=${JSON.stringify(data)}`);
  }

  // ── CASE 5 — the raw HTTP exchange, so the status code PostgREST chose is on the record.
  //             A custom SQLSTATE has no class mapping, so this is where a 500 would show up. ────
  if (url && key) {
    const res = await fetch(`${url}/rest/v1/${TABLE}?id=eq.probe-row-4`, {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ status: 'changed' }),
    });
    const raw = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { /* keep raw */ }
    observations.cases.raw_http = {
      http_status: res.status,
      content_type: res.headers.get('content-type'),
      body_raw: raw.slice(0, 2000),
      body_parsed: parsed,
      body_is_json: parsed !== null,
    };
    console.log(`CASE 5 raw HTTP: status=${res.status} body=${raw.slice(0, 200)}`);
  } else {
    observations.cases.raw_http = { skipped: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY unset' };
  }

  // ── VERDICT ───────────────────────────────────────────────────────────────────────────────────
  const c1 = observations.cases.missing_stamp_via_supabase_js;
  const c2 = observations.cases.invalid_stamp_via_supabase_js;
  const c3 = observations.cases.valid_stamp_succeeds;
  const c4 = observations.cases.zero_row_predicate_is_not_an_error;

  const checks = {
    'case1 error.code === SDCW1': c1.error?.code === 'SDCW1',
    'case1 message verbatim': c1.error?.message === MSG_MISSING,
    'case1 message has no "0 rows"': !String(c1.error?.message ?? '').includes('0 rows'),
    'case2 error.code === SDCW1': c2.error?.code === 'SDCW1',
    'case2 message verbatim': c2.error?.message === MSG_INVALID,
    'case3 valid stamp succeeds': c3.error === null && Array.isArray(c3.data) && c3.data.length === 1,
    'case4 zero-row returns error:null': c4.error === null,
    'case4 zero-row returns an empty ARRAY, not null': Array.isArray(c4.data) && c4.data.length === 0,
    'rejection and CAS-miss are distinguishable by error!==null': c1.error !== null && c4.error === null,
  };
  observations.checks = checks;
  observations.verdict = Object.values(checks).every(Boolean) ? 'ROUND_TRIP_HOLDS' : 'ROUND_TRIP_BROKEN';
  observations.finished_at = new Date().toISOString();

  writeArtifact();

  console.log('\n─── TS-29 STAGE 1 ───');
  for (const [name, pass] of Object.entries(checks)) console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`  VERDICT: ${observations.verdict}`);
  console.log(`  evidence: ${ARTIFACT}`);
  process.exitCode = observations.verdict === 'ROUND_TRIP_HOLDS' ? 0 : 1;
} catch (err) {
  observations.error = { message: err?.message, stack: err?.stack?.split('\n').slice(0, 5).join('\n') };
  observations.verdict = 'PROBE_FAILED';
  observations.finished_at = new Date().toISOString();
  try { writeArtifact(); } catch { /* artifact is best-effort on the failure path */ }
  console.error(`PROBE FAILED: ${err?.message}`);
  process.exitCode = 1;
} finally {
  if (pg) {
    if (ddlApplied) {
      try {
        await pg.query(DDL_DOWN);
        console.log(`Cleaned up scratch objects (public.${TABLE}, ${GUARD_FN}, ${TRIGGER}).`);
      } catch (cleanupErr) {
        console.error(
          `⚠️  CLEANUP FAILED — remove these by hand:\n` +
          `    DROP TABLE IF EXISTS public.${TABLE} CASCADE;\n` +
          `    DROP FUNCTION IF EXISTS public.${GUARD_FN}();\n` +
          `    reason: ${cleanupErr?.message}`,
        );
        process.exitCode = 1;
      }
    }
    await pg.end();
  }
}
