/**
 * Integration test: SD-cancellation -> issue_patterns closure-loop reset.
 * SD-LEO-INFRA-CLOSE-ISSUE-PATTERN-001 (FR-5, audit finding #3).
 *
 * Verifies migration 20260605_reset_patterns_on_sd_cancel.sql:
 *  - reset_cancelled_sd_patterns(p_sd_id, p_sd_key) flips a cancelled SD's
 *    assigned patterns to active, clears assigned_sd_id/assignment_date, writes a
 *    last_cancelled_assignment breadcrumb, leaves patterns of OTHER SDs untouched,
 *    is idempotent, and does not perturb the dedup fingerprint.
 *  - the trigger trg_reset_patterns_on_sd_cancel is wired AFTER UPDATE OF status,
 *    condition-gated to the status->cancelled transition.
 *  - the trigger function carries the failure-isolation contract (EXCEPTION WHEN
 *    OTHERS + unconditional RETURN NEW) so a reset failure can never abort a cancel.
 *
 * assigned_sd_id is FK -> strategic_directives_v2(id) ON DELETE SET NULL, so test
 * patterns are assigned to REAL existing SD ids (the FK rejects synthetic ids).
 * Tests the reset FUNCTION directly (no SD insert/UPDATE) so it never locks the
 * shared SD table — safe under parallel sessions. Behavioral trigger firing
 * (fires on cancel / no-fire otherwise / failure-isolation) was verified in the
 * db-agent BEGIN..ROLLBACK rehearsal at apply time; here we pin it structurally.
 *
 * LIVE-gated on SUPABASE_POOLER_URL. All work is in a transaction ALWAYS rolled
 * back — nothing persists.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const LIVE = !!process.env.SUPABASE_POOLER_URL;

describe.skipIf(!LIVE)('SD-cancellation issue_patterns closure-loop reset (LIVE)', () => {
  let pg, client;

  beforeAll(async () => {
    pg = (await import('pg')).default;
    client = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  const insPattern = async (patternId, assignedSdId) => {
    await client.query(
      `INSERT INTO issue_patterns
         (pattern_id, category, severity, issue_summary, status, source, occurrence_count, assigned_sd_id, assignment_date)
       VALUES ($1,'process','medium',$2,'assigned','manual',3,$3, now())`,
      [patternId, `closure-loop test ${patternId}`, assignedSdId]
    );
  };

  it('resets a cancelled SD assigned patterns, preserves other SDs, is idempotent, keeps fingerprint', async () => {
    try {
      await client.query('BEGIN');

      // Real fixtures: a cancelled SD (reset target) and a non-cancelled SD (control).
      const cancelled = (await client.query(
        "SELECT id, sd_key FROM strategic_directives_v2 WHERE status='cancelled' LIMIT 1")).rows[0];
      const control = (await client.query(
        "SELECT id, sd_key FROM strategic_directives_v2 WHERE status <> 'cancelled' LIMIT 1")).rows[0];
      expect(cancelled).toBeTruthy();
      expect(control).toBeTruthy();

      const stamp = Date.now().toString(36);
      const pA = `PAT-TEST-A-${stamp}`;       // assigned to the cancelled SD
      const pC = `PAT-TEST-C-${stamp}`;       // control: assigned to a non-cancelled SD
      await insPattern(pA, cancelled.id);
      await insPattern(pC, control.id);

      const fpBefore = (await client.query(
        'SELECT dedup_fingerprint FROM issue_patterns WHERE pattern_id=$1', [pA])).rows[0].dedup_fingerprint;

      // Core: the shipped reset function (called with both id and sd_key forms).
      const reset1 = await client.query('SELECT reset_cancelled_sd_patterns($1,$2) AS n', [cancelled.id, cancelled.sd_key]);
      expect(Number(reset1.rows[0].n)).toBe(1); // only pA (the cancelled SD currently has no real danglers post-reconcile)

      const a = (await client.query('SELECT status, assigned_sd_id, assignment_date, metadata, dedup_fingerprint FROM issue_patterns WHERE pattern_id=$1', [pA])).rows[0];
      const c = (await client.query('SELECT status, assigned_sd_id FROM issue_patterns WHERE pattern_id=$1', [pC])).rows[0];

      // Reset row: active, cleared, breadcrumb preserves the prior assignment.
      expect(a.status).toBe('active');
      expect(a.assigned_sd_id).toBeNull();
      expect(a.assignment_date).toBeNull();
      expect(a.metadata?.last_cancelled_assignment).toBeTruthy();
      expect(a.metadata.last_cancelled_assignment.prior_assigned_sd_id).toBe(cancelled.id);
      expect(a.metadata.last_cancelled_assignment.reset_at).toBeTruthy();

      // Control: pattern of a non-cancelled SD is untouched.
      expect(c.status).toBe('assigned');
      expect(c.assigned_sd_id).toBe(control.id);

      // Fingerprint unchanged (reset touches no fingerprint inputs).
      expect(a.dedup_fingerprint).toBe(fpBefore);

      // Idempotent: a second call resets nothing.
      const reset2 = await client.query('SELECT reset_cancelled_sd_patterns($1,$2) AS n', [cancelled.id, cancelled.sd_key]);
      expect(Number(reset2.rows[0].n)).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('trigger trg_reset_patterns_on_sd_cancel is wired AFTER UPDATE OF status and gated to status->cancelled', async () => {
    const row = (await client.query(`
      SELECT t.tgenabled, pg_get_triggerdef(t.oid) AS def
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'strategic_directives_v2' AND t.tgname = 'trg_reset_patterns_on_sd_cancel'`)).rows[0];
    expect(row).toBeTruthy();
    expect(row.tgenabled).toBe('O');
    expect(row.def).toMatch(/AFTER UPDATE OF status/i);
    expect(row.def).toMatch(/WHEN /i);
    expect(row.def).toMatch(/cancelled/i);
  });

  it('trigger function carries the failure-isolation contract (EXCEPTION WHEN OTHERS + RETURN NEW)', async () => {
    const def = (await client.query(
      "SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='trg_fn_reset_patterns_on_sd_cancel'")).rows[0].def;
    expect(def).toMatch(/EXCEPTION\s+WHEN\s+OTHERS/i);
    expect(def).toMatch(/RETURN NEW/i);
  });
});
