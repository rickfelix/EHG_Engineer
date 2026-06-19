/**
 * SD-LEO-INFRA-UUID-CAST-GUARD-SD-COMPLETION-001 — FR-3
 *
 * Two SD-completion AFTER triggers cast a metadata text field to UUID without a
 * format guard, so a malformed metadata.proposal_id / metadata.venture_id raised
 * 22P02 (invalid_text_representation) and ABORTED the whole SD-completion UPDATE:
 *   - record_mttr_on_sd_completion : (NEW.metadata->>'proposal_id')::UUID
 *   - fn_emit_sd_completed_event   : (NEW.metadata->>'venture_id')::UUID
 *
 * The fix routes both casts through public.safe_uuid(text), a format-guarded cast
 * that returns NULL on any non-canonical-UUID input.
 *
 * WHY this tests at the safe_uuid boundary (not a full SD completion): the
 * strategic_directives_v2 completion path is gated by ~20 BEFORE-completion
 * triggers (progress=100, LEAD-FINAL handoff, business-value, doctrine, …), so a
 * bare probe-SD UPDATE→completed throws for UNRELATED reasons. safe_uuid IS the
 * exact unit that prevents the 22P02 in both triggers, so proving (a) the raw cast
 * still throws, (b) safe_uuid does not, and (c) both trigger bodies route through
 * safe_uuid is a complete, residue-free proof of the fix. All checks are read-only
 * (SELECT / pg_get_functiondef) — no rows inserted, no triggers fired.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import 'dotenv/config';

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

let client;
beforeAll(async () => {
  client = await createDatabaseClient('engineer', {
    connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL,
  });
});
afterAll(async () => { if (client) await client.end(); });

describe('FR-3: the 22P02 hazard exists (raw cast throws)', () => {
  it('a bare ::uuid cast of garbage raises invalid_text_representation (22P02)', async () => {
    await expect(client.query('SELECT \'not-a-uuid\'::uuid')).rejects.toMatchObject({ code: '22P02' });
  });
});

describe('FR-1/FR-2: safe_uuid() guards the cast', () => {
  it('returns NULL for a malformed value (no throw)', async () => {
    const r = await client.query('SELECT public.safe_uuid(\'not-a-uuid\') AS u');
    expect(r.rows[0].u).toBeNull();
  });

  it('returns NULL for a 36-char dash string (the loose-regex trap a strict guard avoids)', async () => {
    const r = await client.query('SELECT public.safe_uuid(repeat(\'-\', 36)) AS u');
    expect(r.rows[0].u).toBeNull();
  });

  it('returns NULL for NULL input', async () => {
    const r = await client.query('SELECT public.safe_uuid(NULL) AS u');
    expect(r.rows[0].u).toBeNull();
  });

  it('passes a valid canonical UUID through unchanged (valid still casts + processes)', async () => {
    const r = await client.query('SELECT public.safe_uuid($1) AS u', [VALID_UUID]);
    expect(r.rows[0].u).toBe(VALID_UUID);
  });
});

describe('both SD-completion triggers route their cast through safe_uuid', () => {
  it('record_mttr_on_sd_completion uses safe_uuid and no bare proposal_id ::UUID cast', async () => {
    const r = await client.query('SELECT pg_get_functiondef(\'public.record_mttr_on_sd_completion\'::regproc) AS def');
    const def = r.rows[0].def;
    expect(def).toMatch(/safe_uuid\(\s*NEW\.metadata->>'proposal_id'\s*\)/);
    expect(def).not.toMatch(/\(\s*NEW\.metadata->>'proposal_id'\s*\)::UUID/i);
  });

  it('fn_emit_sd_completed_event uses safe_uuid and no bare venture_id ::UUID cast', async () => {
    const r = await client.query('SELECT pg_get_functiondef(\'public.fn_emit_sd_completed_event\'::regproc) AS def');
    const def = r.rows[0].def;
    expect(def).toMatch(/safe_uuid\(\s*NEW\.metadata->>'venture_id'\s*\)/);
    expect(def).not.toMatch(/\(\s*NEW\.metadata->>'venture_id'\s*\)::UUID/i);
  });
});
