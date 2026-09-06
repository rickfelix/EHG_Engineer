// SD-LEO-INFRA-RETRO-PUBLISHED-GUARD-001 FR-3(a) — the DDL tier for
// database/chairman-gated/20260906_retrospectives_published_guard.sql
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN
//
// This runs against an EPHEMERAL vanilla PostgreSQL with a hand-stubbed NARROW schema:
// retrospectives reduced to the columns this guard's predicate and these fixtures actually touch,
// retrospectives_audit, and two NO-OP-ish stand-ins for the two REAL sibling BEFORE triggers that
// mutate NEW (trigger_auto_populate_retrospective_fields, validate_retrospective_quality_trigger).
// It is deliberately NOT a transitive clone of the real table's 6 other BEFORE ROW triggers and
// their dependent functions -- those are irrelevant to this guard's own logic.
//
// A green run proves the migration's OWN logic: the guard refuses unstamped protected-column
// writes on a PUBLISHED SD_COMPLETION row, accepts registry-stamped ones with the correct actor
// stamped, leaves unprotected (metadata/quality_score-family) columns alone, evaluates AFTER the
// sibling mutators' own changes (not before), and is NULL at rest. It does NOT prove production
// firing order against the REAL table's full 7-trigger set (asserted instead by re-reading
// pg_trigger against the live table once this migration is actually applied) or SQLSTATE
// round-trip through PostgREST/supabase-js (a live-PostgREST tier concern, not this one).
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly rather than
// silently passing (matches tests/ddl/strategic-directives-canonical-writer-choke-ddl.db.test.js's
// convention).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATION_PATH = fileURLToPath(
  new URL('../../database/chairman-gated/20260906_retrospectives_published_guard.sql', import.meta.url),
);
const readLF = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const MIGRATION_SQL = readLF(MIGRATION_PATH);

// ── The stub. Narrow by design; see the header block. ──────────────────────────────────────────
const STUB_SCHEMA = `
CREATE TABLE public.retrospectives (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id                             text,
  retro_type                        text,
  status                            text NOT NULL DEFAULT 'DRAFT',
  title                             text,
  description                       text,
  what_went_well                    jsonb,
  what_needs_improvement            jsonb,
  improvement_areas                 jsonb,
  key_learnings                     jsonb,
  objectives_met                    jsonb,
  action_items                      jsonb,
  failure_patterns                  jsonb,
  success_patterns                  jsonb,
  related_prs                       jsonb,
  related_commits                   jsonb,
  related_files                     jsonb,
  affected_components               jsonb,
  generated_by                      text,
  protocol_improvements             jsonb,
  verbatim_citations                jsonb,
  triangulation_divergence_insights jsonb,
  unnecessary_work_identified       jsonb,
  future_enhancements               jsonb,
  coverage_analysis                 jsonb,
  bmad_insights                     jsonb,
  business_value_delivered          text,
  customer_impact                   text,
  performance_impact                text,
  metadata                          jsonb DEFAULT '{}'::jsonb,
  updated_at                        timestamptz DEFAULT now(),
  quality_score                     integer,
  quality_validated_at              timestamptz,
  quality_issues                    jsonb,
  tags                              jsonb,
  learning_extracted_at             timestamptz
);

CREATE TABLE public.retrospectives_audit (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retrospective_id  uuid NOT NULL,
  action            text NOT NULL,
  old_data          jsonb,
  new_data          jsonb,
  changed_by        text,
  changed_at        timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.update_retrospective_timestamp() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $f$;
CREATE TRIGGER tr_retrospectives_updated BEFORE UPDATE ON public.retrospectives
  FOR EACH ROW EXECUTE FUNCTION public.update_retrospective_timestamp();

-- Stand-in for trigger_auto_populate_retrospective_fields: mutates NEW unconditionally (a real
-- sibling that runs regardless of caller intent), sorts BEFORE zzz_ alphabetically.
CREATE OR REPLACE FUNCTION public._stub_auto_populate_retrospective_fields() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  NEW.learning_extracted_at := now();
  RETURN NEW;
END; $f$;
CREATE TRIGGER trigger_auto_populate_retrospective_fields BEFORE UPDATE ON public.retrospectives
  FOR EACH ROW EXECUTE FUNCTION public._stub_auto_populate_retrospective_fields();

-- Stand-in for validate_retrospective_quality_trigger (auto_validate_retrospective_quality):
-- recomputes quality_score from key_learnings length, REGARDLESS of what the caller supplied --
-- this is the exact real-world side effect that makes quality_score an unsafe protected column.
CREATE OR REPLACE FUNCTION public._stub_auto_validate_retrospective_quality() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  NEW.quality_score := COALESCE(jsonb_array_length(NEW.key_learnings), 0) * 10;
  NEW.quality_validated_at := now();
  RETURN NEW;
END; $f$;
CREATE TRIGGER validate_retrospective_quality_trigger BEFORE UPDATE ON public.retrospectives
  FOR EACH ROW EXECUTE FUNCTION public._stub_auto_validate_retrospective_quality();
`;

// trg_retrospectives_audit() is only CREATEd by the migration itself (it re-declares the live
// function) -- binding a trigger to it inside STUB_SCHEMA, BEFORE the migration runs, would fail
// with "function does not exist". This binding must run AFTER applyMigration().
const POST_MIGRATION_STUB = `
CREATE TRIGGER trg_retrospectives_audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.retrospectives
  FOR EACH ROW EXECUTE FUNCTION public.trg_retrospectives_audit();
`;

let client;
let seedCounter = 0;

async function applyMigration() {
  await client.query(MIGRATION_SQL);
}

async function seedPublishedCompletion(overrides = {}) {
  seedCounter += 1;
  const { rows } = await client.query(
    `INSERT INTO public.retrospectives (retro_type, status, description, key_learnings, quality_score)
     VALUES ('SD_COMPLETION', 'PUBLISHED', $1, $2, 100)
     RETURNING id`,
    [overrides.description ?? `original description ${seedCounter}`, JSON.stringify(overrides.key_learnings ?? Array(16).fill('learning'))],
  );
  return rows[0].id;
}

async function attempt(sql, params = []) {
  try {
    const res = await client.query(sql, params);
    return { ok: true, res };
  } catch (error) {
    return { ok: false, error };
  }
}

const readRetro = async (id) => (await client.query('SELECT * FROM public.retrospectives WHERE id = $1', [id])).rows[0];
const newestAudit = async (id) =>
  (await client.query('SELECT * FROM public.retrospectives_audit WHERE retrospective_id = $1 ORDER BY changed_at DESC LIMIT 1', [id])).rows[0];

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
  await client.query(POST_MIGRATION_STUB);
}, 120_000);

afterAll(async () => {
  if (client) {
    try {
      await client.query('DROP TABLE IF EXISTS public.retrospectives_audit CASCADE');
      await client.query('DROP TABLE IF EXISTS public.retrospectives CASCADE');
      await client.query('DROP FUNCTION IF EXISTS public.update_retrospective_timestamp() CASCADE');
      await client.query('DROP FUNCTION IF EXISTS public._stub_auto_populate_retrospective_fields() CASCADE');
      await client.query('DROP FUNCTION IF EXISTS public._stub_auto_validate_retrospective_quality() CASCADE');
      await client.query('DROP FUNCTION IF EXISTS public.trg_retrospectives_audit() CASCADE');
      await client.query('DROP FUNCTION IF EXISTS public.enforce_retrospectives_published_guard() CASCADE');
      await client.query('DROP FUNCTION IF EXISTS public.retro_canonical_writer_policy(text) CASCADE');
    } finally {
      await client.end();
    }
  }
});

describe('retrospectives_published_guard DDL (ephemeral tier)', () => {
  it('TS-1: refuses a content-column UPDATE on a PUBLISHED SD_COMPLETION row without retro_write_token', async () => {
    const id = await seedPublishedCompletion();
    const result = await attempt('UPDATE public.retrospectives SET description = $1 WHERE id = $2', ['clobbered', id]);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('RPGD1');
  });

  it('TS-2: accepts the same UPDATE with a valid retro_write_token, and stamps the correct actor', async () => {
    const id = await seedPublishedCompletion();
    const result = await attempt(
      "UPDATE public.retrospectives SET description = 'legitimate rewrite', retro_write_token = 'restore_from_audit' WHERE id = $1",
      [id],
    );
    expect(result.ok).toBe(true);
    const row = await readRetro(id);
    expect(row.description).toBe('legitimate rewrite');
    expect(row.retro_write_token).toBeNull(); // NULL-at-rest
    const audit = await newestAudit(id);
    expect(audit.changed_by).toBe('uncanonical'); // no app.retro_writer_actor session var set in this test
  });

  it('TS-2b: an unregistered token value is refused the same as a missing one', async () => {
    const id = await seedPublishedCompletion();
    const result = await attempt(
      "UPDATE public.retrospectives SET description = 'x', retro_write_token = 'not_a_real_writer' WHERE id = $1",
      [id],
    );
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('RPGD1');
  });

  it('TS-2c: the actor stamp reflects app.retro_writer_actor when the caller sets it', async () => {
    // SET LOCAL only scopes to the current transaction -- issuing it as a standalone
    // client.query() call with no surrounding BEGIN/COMMIT has no transaction to be local TO, so
    // Postgres discards it at that statement's own implicit commit and the next UPDATE would see
    // current_setting(...)=NULL again. Wrap explicitly as separate calls on the SAME client/session
    // (pg's extended query protocol, used whenever params are passed, does not support multiple
    // statements in one query() call, so BEGIN/SET LOCAL/UPDATE/COMMIT must be issued separately).
    const id = await seedPublishedCompletion();
    await client.query('BEGIN');
    let result;
    try {
      await client.query("SET LOCAL app.retro_writer_actor = 'retro_sub_agent'");
      result = await attempt(
        "UPDATE public.retrospectives SET description = 'y', retro_write_token = 'retro_sub_agent' WHERE id = $1",
        [id],
      );
    } finally {
      await client.query(result?.ok ? 'COMMIT' : 'ROLLBACK');
    }
    expect(result.ok).toBe(true);
    const audit = await newestAudit(id);
    expect(audit.changed_by).toBe('retro_sub_agent');
  });

  it('TS-3: a metadata-only UPDATE on a PUBLISHED SD_COMPLETION row is NOT refused (no token needed)', async () => {
    const id = await seedPublishedCompletion();
    const result = await attempt("UPDATE public.retrospectives SET metadata = '{\"note\":\"x\"}'::jsonb WHERE id = $1", [id]);
    expect(result.ok).toBe(true);
  });

  it('TS-3b: an UPDATE that only triggers the sibling quality-recompute (no caller-supplied content change) is NOT refused', async () => {
    // Caller sets NOTHING protected -- but the sibling stand-in ALWAYS recomputes quality_score
    // and learning_extracted_at as a side effect. Proves the guard fires AFTER the siblings and
    // correctly excludes their system-computed outputs from its own protected set.
    const id = await seedPublishedCompletion();
    const before = await readRetro(id);
    const result = await attempt('UPDATE public.retrospectives SET tags = $1 WHERE id = $2', [JSON.stringify(['x']), id]);
    expect(result.ok).toBe(true);
    const after = await readRetro(id);
    expect(after.quality_score).not.toBe(before.quality_score); // sibling really did mutate it
  });

  it('ordering: the guard evaluates the sibling-mutated NEW state, not the pre-sibling caller-supplied state', async () => {
    // The sibling auto-populate stand-in only touches learning_extracted_at (unprotected), so this
    // does not by itself prove content-column post-mutation visibility -- it proves the guard runs
    // AFTER both siblings without erroring on their own writes, which is the actual risk (a guard
    // that ran BEFORE them, or that choked on their side effects, would fail here).
    const id = await seedPublishedCompletion();
    const result = await attempt('UPDATE public.retrospectives SET tags = $1 WHERE id = $2', [JSON.stringify(['ordering-check']), id]);
    expect(result.ok).toBe(true);
    const after = await readRetro(id);
    expect(after.learning_extracted_at).not.toBeNull(); // sibling ran
    expect(after.quality_score).toBe(160); // sibling ran: 16 * 10, guard did not refuse or corrupt it
  });

  it('TS-F4: refuses a bare demotion (status change alone, no content change) on a PUBLISHED SD_COMPLETION row without a token', async () => {
    // testing-agent finding F-4 (EXEC evidence b60f5de1): without status/retro_type in the
    // protected set, a two-statement "demote to DRAFT, rewrite freely, re-publish" sequence would
    // bypass the guard entirely -- this pins the FIRST statement of that sequence being refused.
    const id = await seedPublishedCompletion();
    const result = await attempt("UPDATE public.retrospectives SET status = 'DRAFT' WHERE id = $1", [id]);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('RPGD1');
  });

  it('TS-F4b: the same demotion succeeds with a valid retro_write_token', async () => {
    const id = await seedPublishedCompletion();
    const result = await attempt(
      "UPDATE public.retrospectives SET status = 'DRAFT', retro_write_token = 'restore_from_audit' WHERE id = $1",
      [id],
    );
    expect(result.ok).toBe(true);
  });

  it('a DRAFT (non-PUBLISHED) SD_COMPLETION row is never guarded, token or not', async () => {
    const { rows } = await client.query(
      "INSERT INTO public.retrospectives (retro_type, status, description) VALUES ('SD_COMPLETION', 'DRAFT', 'draft text') RETURNING id",
    );
    const result = await attempt('UPDATE public.retrospectives SET description = $1 WHERE id = $2', ['edited', rows[0].id]);
    expect(result.ok).toBe(true);
  });

  it('a PUBLISHED non-SD_COMPLETION row (e.g. HANDOFF) is never guarded', async () => {
    const { rows } = await client.query(
      "INSERT INTO public.retrospectives (retro_type, status, description) VALUES ('HANDOFF', 'PUBLISHED', 'handoff text') RETURNING id",
    );
    const result = await attempt('UPDATE public.retrospectives SET description = $1 WHERE id = $2', ['edited', rows[0].id]);
    expect(result.ok).toBe(true);
  });
});
