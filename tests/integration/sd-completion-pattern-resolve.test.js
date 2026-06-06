/**
 * Integration test: SD-completion -> issue_patterns closure-loop resolve.
 * SD-FDBK-ENH-ISSUE-PATTERNS-CLOSURE-001 (follow-up to SD-LEO-INFRA-CLOSE-ISSUE-PATTERN-001).
 *
 * Verifies migration 20260606_resolve_patterns_on_sd_complete.sql:
 *  - resolve_completed_sd_patterns(p_sd_id, p_sd_key) flips a completed SD's
 *    assigned patterns to 'resolved' (resolution_date + resolution_notes set),
 *    for ALL sources (auto_rca/retrospective/manual — NOT only learn_command,
 *    which was the resolveLearningItems() gap), preserves assigned_sd_id as
 *    provenance, leaves patterns of OTHER SDs untouched, is idempotent, and
 *    does not perturb the dedup fingerprint.
 *  - the trigger trg_resolve_patterns_on_sd_complete is wired AFTER UPDATE OF
 *    status, condition-gated to the status->completed transition.
 *  - the trigger function carries the failure-isolation contract (EXCEPTION WHEN
 *    OTHERS + unconditional RETURN NEW) so a resolve failure can never abort a
 *    completion.
 *
 * Mirrors tests/integration/sd-cancellation-pattern-reset.test.js. Tests the
 * resolve FUNCTION directly (no SD insert/UPDATE) so it never locks the shared SD
 * table — safe under parallel sessions. Behavioral trigger firing was verified in
 * the db-agent BEGIN..ROLLBACK rehearsal at apply time; here we pin it structurally.
 *
 * assigned_sd_id is FK -> strategic_directives_v2(id), so test patterns are
 * assigned to REAL existing SD ids. LIVE-gated on SUPABASE_POOLER_URL. All work is
 * in a transaction ALWAYS rolled back — nothing persists.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const LIVE = !!process.env.SUPABASE_POOLER_URL;

describe.skipIf(!LIVE)('SD-completion issue_patterns closure-loop resolve (LIVE)', () => {
  let pg, client;

  beforeAll(async () => {
    pg = (await import('pg')).default;
    client = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  const insPattern = async (patternId, assignedSdId, source = 'manual') => {
    await client.query(
      `INSERT INTO issue_patterns
         (pattern_id, category, severity, issue_summary, status, source, occurrence_count, assigned_sd_id, assignment_date)
       VALUES ($1,'process','medium',$2,'assigned',$3,3,$4, now())`,
      [patternId, `closure-loop test ${patternId}`, source, assignedSdId]
    );
  };

  it('resolves a completed SD assigned patterns (all sources), preserves other SDs, is idempotent, keeps fingerprint', async () => {
    try {
      await client.query('BEGIN');

      // Real fixtures: a completed SD (resolve target) and a non-completed SD (control).
      const completed = (await client.query(
        "SELECT id, sd_key FROM strategic_directives_v2 WHERE status='completed' LIMIT 1")).rows[0];
      const control = (await client.query(
        "SELECT id, sd_key FROM strategic_directives_v2 WHERE status <> 'completed' LIMIT 1")).rows[0];
      expect(completed).toBeTruthy();
      expect(control).toBeTruthy();

      const stamp = Date.now().toString(36);
      const pAuto = `PAT-TEST-AUTO-${stamp}`;   // assigned to completed SD, source=auto_rca (the bug class)
      const pRetro = `PAT-TEST-RETRO-${stamp}`; // assigned to completed SD, source=retrospective (the bug class)
      const pC = `PAT-TEST-C-${stamp}`;         // control: assigned to a non-completed SD
      await insPattern(pAuto, completed.id, 'auto_rca');
      await insPattern(pRetro, completed.id, 'retrospective');
      await insPattern(pC, control.id, 'manual');

      const fpBefore = (await client.query(
        'SELECT dedup_fingerprint FROM issue_patterns WHERE pattern_id=$1', [pAuto])).rows[0].dedup_fingerprint;

      // Core: the shipped resolve function (called with both id and sd_key forms).
      const r1 = await client.query('SELECT resolve_completed_sd_patterns($1,$2) AS n', [completed.id, completed.sd_key]);
      expect(Number(r1.rows[0].n)).toBe(2); // pAuto + pRetro (both assigned to the completed SD)

      const a = (await client.query('SELECT status, assigned_sd_id, resolution_date, resolution_notes, dedup_fingerprint FROM issue_patterns WHERE pattern_id=$1', [pAuto])).rows[0];
      const retro = (await client.query('SELECT status FROM issue_patterns WHERE pattern_id=$1', [pRetro])).rows[0];
      const c = (await client.query('SELECT status, assigned_sd_id FROM issue_patterns WHERE pattern_id=$1', [pC])).rows[0];

      // Resolved row: status resolved, date + notes set, assigned_sd_id PRESERVED (provenance).
      expect(a.status).toBe('resolved');
      expect(a.resolution_date).toBeTruthy();
      expect(a.resolution_notes).toMatch(/closure-loop/i);
      expect(a.assigned_sd_id).toBe(completed.id);

      // All-source coverage: the retrospective-sourced pattern is also resolved
      // (this is exactly what resolveLearningItems' learn_command-only gate missed).
      expect(retro.status).toBe('resolved');

      // Control: pattern of a non-completed SD is untouched.
      expect(c.status).toBe('assigned');
      expect(c.assigned_sd_id).toBe(control.id);

      // Fingerprint unchanged (resolve touches no fingerprint inputs).
      expect(a.dedup_fingerprint).toBe(fpBefore);

      // Idempotent: a second call resolves nothing.
      const r2 = await client.query('SELECT resolve_completed_sd_patterns($1,$2) AS n', [completed.id, completed.sd_key]);
      expect(Number(r2.rows[0].n)).toBe(0);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('trigger trg_resolve_patterns_on_sd_complete is wired AFTER UPDATE OF status and gated to status->completed', async () => {
    const row = (await client.query(`
      SELECT t.tgenabled, pg_get_triggerdef(t.oid) AS def
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'strategic_directives_v2' AND t.tgname = 'trg_resolve_patterns_on_sd_complete'`)).rows[0];
    expect(row).toBeTruthy();
    expect(row.tgenabled).toBe('O');
    expect(row.def).toMatch(/AFTER UPDATE OF status/i);
    expect(row.def).toMatch(/WHEN /i);
    expect(row.def).toMatch(/completed/i);
  });

  it('trigger function carries the failure-isolation contract (EXCEPTION WHEN OTHERS + RETURN NEW)', async () => {
    const def = (await client.query(
      "SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='trg_fn_resolve_patterns_on_sd_complete'")).rows[0].def;
    expect(def).toMatch(/EXCEPTION\s+WHEN\s+OTHERS/i);
    expect(def).toMatch(/RETURN NEW/i);
  });
});
