// SD-LEO-INFRA-REMAINDER-STATE-STAMPER-001 — the DDL tier for
// database/migrations/20260821_stamp_plan_of_record_remainder_v2.sql.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A GREEN RUN OF THIS FILE DOES **NOT** MEAN
//
// Runs against an EPHEMERAL vanilla PostgreSQL 16 with hand-stubbed minimal versions of
// strategic_directives_v2, quick_fixes, roadmap_waves, and roadmap_wave_items -- just the
// columns the stamp function and its two triggers actually read/write, not the real production
// schemas. It proves the FUNCTION AND TRIGGER LOGIC behave as claimed against real Postgres
// (something a unit test parsing the migration TEXT cannot prove -- it proves what we wrote, not
// what Postgres accepted). It does NOT prove production RLS/grant posture (this migration does
// not touch either) or that the stub columns are a complete/accurate mirror of production.
//
// The EXISTING strategic_directives_v2-side trigger (sd_cancel_restamp_remainder, shipped by
// database/migrations/20260719a_plan_of_record_remainder_view.sql, NOT modified by this SD) is
// reproduced verbatim below -- its function in STUB_SCHEMA, its CREATE TRIGGER in CREATE_TRIGGERS
// (created after MIGRATION_SQL runs) -- so TS-7 can prove it still works correctly against the
// REWRITTEN function; this SD's own migration file does not redefine it (by design, TR-3).
//
// FAIL-CLOSED, no skip branch: if this file cannot reach a database it fails loudly.
// EXEC must add this file's path (and the migration's) to
// .github/workflows/drive-reports-ddl.yml's path-filter list (TS-10) or it never runs in CI.
//
// NOTE (verified in this session, no local Postgres available): this file could not be executed
// locally -- Docker is unavailable in this environment (same constraint documented in the sibling
// tests/ddl/venture-gate-attestations-ddl.db.test.js). It follows the established repo pattern
// exactly (stub schema + real migration apply + real INSERT/UPDATE assertions) and is designed to
// run in the DDL CI tier (vitest.ddl.config.mjs). Verified instead via careful manual read-through
// of the SQL against each planned assertion, plus sub-agent review at EXEC phase.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATION_PATH = fileURLToPath(
  new URL('../../database/migrations/20260821_stamp_plan_of_record_remainder_v2.sql', import.meta.url),
);
const MIGRATION_SQL = fs.readFileSync(MIGRATION_PATH, 'utf8');

const STUB_SCHEMA = `
CREATE TABLE IF NOT EXISTS public.strategic_directives_v2 (
  sd_key TEXT PRIMARY KEY,
  status TEXT
);

CREATE TABLE IF NOT EXISTS public.quick_fixes (
  id TEXT PRIMARY KEY,
  status TEXT
);

CREATE TABLE IF NOT EXISTS public.roadmap_waves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT
);

CREATE TABLE IF NOT EXISTS public.roadmap_wave_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_id UUID REFERENCES public.roadmap_waves(id),
  item_disposition TEXT,
  lane TEXT,
  promoted_to_sd_key TEXT,
  remainder_state TEXT,
  remainder_state_stamped_at TIMESTAMPTZ,
  remainder_state_stamped_by TEXT,
  CONSTRAINT roadmap_wave_items_remainder_state_check CHECK (remainder_state IS NULL OR remainder_state IN (
    'promotable_now', 'gated_on_chairman', 'in_flight_or_sequence_blocked',
    'satisfied_elsewhere', 'void'
  ))
);

-- Verbatim from 20260719a -- NOT modified by this SD's migration. Reproduced here so TS-7 can
-- prove it still fires correctly against the rewritten stamp function.
CREATE OR REPLACE FUNCTION trg_restamp_items_on_sd_cancel()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM stamp_plan_of_record_remainder_state(id)
    FROM roadmap_wave_items WHERE promoted_to_sd_key = NEW.sd_key;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;

// NOTE: both triggers below are created AFTER MIGRATION_SQL runs, since they call
// stamp_plan_of_record_remainder_state(), which does not exist until the migration defines it.
//
// TESTING REVIEW FIX (EXEC phase, agent acd01e35d7975ed54, evidence 203cdc37-8cd0-4137-8acc-1f11b571a0ac):
// the write-path trigger (roadmap_wave_items_stamp_remainder, verbatim from 20260719a section 3) was
// missing entirely -- makeItem()'s INSERT never fired any stamp, so remainder_state stayed NULL and
// every assertion in this file would have failed. Not modified by this SD (TR-3-equivalent for the
// write path); reproduced here verbatim, matching the SD-side trigger's own treatment above.
const CREATE_TRIGGERS = `
CREATE OR REPLACE FUNCTION trg_stamp_plan_of_record_remainder_state()
RETURNS trigger AS $$
BEGIN
  PERFORM stamp_plan_of_record_remainder_state(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roadmap_wave_items_stamp_remainder ON roadmap_wave_items;
CREATE TRIGGER roadmap_wave_items_stamp_remainder
AFTER INSERT OR UPDATE OF item_disposition, lane, promoted_to_sd_key ON roadmap_wave_items
FOR EACH ROW EXECUTE FUNCTION trg_stamp_plan_of_record_remainder_state();

DROP TRIGGER IF EXISTS sd_cancel_restamp_remainder ON strategic_directives_v2;
CREATE TRIGGER sd_cancel_restamp_remainder
AFTER UPDATE OF status ON strategic_directives_v2
FOR EACH ROW EXECUTE FUNCTION trg_restamp_items_on_sd_cancel();
`;

let client;

async function makeItem({ promotedKey = null, disposition = null, lane = null } = {}) {
  const { rows } = await client.query(
    `INSERT INTO public.roadmap_wave_items (item_disposition, lane, promoted_to_sd_key)
     VALUES ($1, $2, $3) RETURNING id`,
    [disposition, lane, promotedKey],
  );
  return rows[0].id;
}

async function remainderStateOf(itemId) {
  const { rows } = await client.query('SELECT remainder_state FROM public.roadmap_wave_items WHERE id = $1', [itemId]);
  return rows[0]?.remainder_state;
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
  await client.query(MIGRATION_SQL);
  await client.query(CREATE_TRIGGERS);
});

afterAll(async () => {
  if (!client) return;
  try {
    await client.query('DROP TABLE IF EXISTS public.roadmap_wave_items');
    await client.query('DROP TABLE IF EXISTS public.roadmap_waves');
    await client.query('DROP TABLE IF EXISTS public.quick_fixes');
    await client.query('DROP TABLE IF EXISTS public.strategic_directives_v2');
    await client.query('DROP FUNCTION IF EXISTS stamp_plan_of_record_remainder_state(uuid)');
    await client.query('DROP FUNCTION IF EXISTS trg_stamp_plan_of_record_remainder_state()');
    await client.query('DROP FUNCTION IF EXISTS trg_restamp_items_on_sd_cancel()');
    await client.query('DROP FUNCTION IF EXISTS trg_restamp_items_on_qf_status_change()');
  } catch { /* best effort */ }
  await client.end();
});

describe('[CONTROL, asserted first] non-promoted items still resolve via the untouched disposition/lane branches (TS-9)', () => {
  it('dropped -> void', async () => {
    const id = await makeItem({ disposition: 'dropped' });
    expect(await remainderStateOf(id)).toBe('void');
  });
  it('lane=chairman-gated -> gated_on_chairman', async () => {
    const id = await makeItem({ lane: 'chairman-gated' });
    expect(await remainderStateOf(id)).toBe('gated_on_chairman');
  });
  it('lane=blocked-on-X -> in_flight_or_sequence_blocked', async () => {
    const id = await makeItem({ lane: 'blocked-on-review' });
    expect(await remainderStateOf(id)).toBe('in_flight_or_sequence_blocked');
  });
  it('no disposition/lane match -> promotable_now', async () => {
    const id = await makeItem({});
    expect(await remainderStateOf(id)).toBe('promotable_now');
  });
});

describe('SD-side resolution (TS-1, TS-2, TS-3)', () => {
  it('TS-1: linked SD status=draft -> in_flight_or_sequence_blocked, NOT satisfied_elsewhere (the false-terminal this SD fixes)', async () => {
    await client.query("INSERT INTO public.strategic_directives_v2 (sd_key, status) VALUES ('SD-TEST-DRAFT-001', 'draft')");
    const id = await makeItem({ promotedKey: 'SD-TEST-DRAFT-001' });
    expect(await remainderStateOf(id)).toBe('in_flight_or_sequence_blocked');
  });
  it('TS-2: linked SD status=completed -> satisfied_elsewhere', async () => {
    await client.query("INSERT INTO public.strategic_directives_v2 (sd_key, status) VALUES ('SD-TEST-DONE-001', 'completed')");
    const id = await makeItem({ promotedKey: 'SD-TEST-DONE-001' });
    expect(await remainderStateOf(id)).toBe('satisfied_elsewhere');
  });
  it('TS-3: linked SD status=cancelled -> void', async () => {
    await client.query("INSERT INTO public.strategic_directives_v2 (sd_key, status) VALUES ('SD-TEST-CANCEL-001', 'cancelled')");
    const id = await makeItem({ promotedKey: 'SD-TEST-CANCEL-001' });
    expect(await remainderStateOf(id)).toBe('void');
  });
});

describe('QF-side resolution (TS-4) -- the void/satisfied_elsewhere branches were UNREACHABLE for QF keys before this SD', () => {
  it('QF status=completed -> satisfied_elsewhere', async () => {
    await client.query("INSERT INTO public.quick_fixes (id, status) VALUES ('QF-20260821-001', 'completed')");
    const id = await makeItem({ promotedKey: 'QF-20260821-001' });
    expect(await remainderStateOf(id)).toBe('satisfied_elsewhere');
  });
  it('QF status=cancelled -> void', async () => {
    await client.query("INSERT INTO public.quick_fixes (id, status) VALUES ('QF-20260821-002', 'cancelled')");
    const id = await makeItem({ promotedKey: 'QF-20260821-002' });
    expect(await remainderStateOf(id)).toBe('void');
  });
  it('QF status=closed -> void (a decline outcome: duplicate_of/premise_unverified_stale/premise_resolved)', async () => {
    await client.query("INSERT INTO public.quick_fixes (id, status) VALUES ('QF-20260821-003', 'closed')");
    const id = await makeItem({ promotedKey: 'QF-20260821-003' });
    expect(await remainderStateOf(id)).toBe('void');
  });
  it('QF status=open -> in_flight_or_sequence_blocked', async () => {
    await client.query("INSERT INTO public.quick_fixes (id, status) VALUES ('QF-20260821-004', 'open')");
    const id = await makeItem({ promotedKey: 'QF-20260821-004' });
    expect(await remainderStateOf(id)).toBe('in_flight_or_sequence_blocked');
  });
  it('QF status=in_progress -> in_flight_or_sequence_blocked', async () => {
    await client.query("INSERT INTO public.quick_fixes (id, status) VALUES ('QF-20260821-005', 'in_progress')");
    const id = await makeItem({ promotedKey: 'QF-20260821-005' });
    expect(await remainderStateOf(id)).toBe('in_flight_or_sequence_blocked');
  });
  it('QF status=escalated -> in_flight_or_sequence_blocked (its work is NOT yet done -- now tracked as a separate SD, not chased)', async () => {
    await client.query("INSERT INTO public.quick_fixes (id, status) VALUES ('QF-20260821-006', 'escalated')");
    const id = await makeItem({ promotedKey: 'QF-20260821-006' });
    expect(await remainderStateOf(id)).toBe('in_flight_or_sequence_blocked');
  });
  it('unrecognized/future QF status -> in_flight_or_sequence_blocked (safe default, ELSE branch is a catch-all)', async () => {
    await client.query("INSERT INTO public.quick_fixes (id, status) VALUES ('QF-20260821-007', 'some_future_status')");
    const id = await makeItem({ promotedKey: 'QF-20260821-007' });
    expect(await remainderStateOf(id)).toBe('in_flight_or_sequence_blocked');
  });
});

describe('orphaned key (TS-8) -- conservative default, never silently satisfied', () => {
  it('promoted_to_sd_key matching neither table -> in_flight_or_sequence_blocked', async () => {
    const id = await makeItem({ promotedKey: 'SD-NONEXISTENT-999' });
    expect(await remainderStateOf(id)).toBe('in_flight_or_sequence_blocked');
  });
});

describe('trigger-firing behavior (TS-6, TS-7)', () => {
  it('TS-6: updating a quick_fixes status re-stamps the linked item via the NEW QF-side trigger', async () => {
    await client.query("INSERT INTO public.quick_fixes (id, status) VALUES ('QF-20260821-100', 'open')");
    const id = await makeItem({ promotedKey: 'QF-20260821-100' });
    expect(await remainderStateOf(id)).toBe('in_flight_or_sequence_blocked');

    await client.query("UPDATE public.quick_fixes SET status = 'completed' WHERE id = 'QF-20260821-100'");
    expect(await remainderStateOf(id)).toBe('satisfied_elsewhere');
  });

  it('TS-7 (regression): updating a strategic_directives_v2 status still re-stamps via the EXISTING, unmodified SD-side trigger', async () => {
    await client.query("INSERT INTO public.strategic_directives_v2 (sd_key, status) VALUES ('SD-TEST-TRIGGER-001', 'draft')");
    const id = await makeItem({ promotedKey: 'SD-TEST-TRIGGER-001' });
    expect(await remainderStateOf(id)).toBe('in_flight_or_sequence_blocked');

    await client.query("UPDATE public.strategic_directives_v2 SET status = 'completed' WHERE sd_key = 'SD-TEST-TRIGGER-001'");
    expect(await remainderStateOf(id)).toBe('satisfied_elsewhere');
  });
});
