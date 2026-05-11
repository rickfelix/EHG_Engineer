// Static-pin regression test for update_sd_after_lead_evaluation() trigger source
// (FR-3 of SD-FDBK-ENH-PAT-LEO-INFRA-001)
//
// Pins the writer end of the trigger/validator pair. Reads pg_proc.prosrc via
// pg client (scripts/lib/supabase-connection.js::createDatabaseClient) and
// asserts the APPROVE branch literal is 'in_progress' (not 'active').
//
// Gated on DB_BEHAVIOR_TESTS=1 (testing-agent recommendation, evidence row
// 9257df4f). Dev sessions also need DISABLE_SSL_VERIFY=true for the Supabase
// pooler self-signed cert (VALIDATION sub-agent process-learning note).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const DB_BEHAVIOR_ENABLED = process.env.DB_BEHAVIOR_TESTS === '1';

describe.runIf(DB_BEHAVIOR_ENABLED)('FR-3: update_sd_after_lead_evaluation() trigger source static-pin', () => {
  let client;
  let prosrc;
  let signatureCount;

  beforeAll(async () => {
    const { createDatabaseClient } = await import('../scripts/lib/supabase-connection.js');
    client = await createDatabaseClient('engineer', { verify: false });
    const result = await client.query(
      `SELECT count(*)::int AS n,
              (array_agg(prosrc))[1] AS prosrc
       FROM pg_proc
       WHERE proname = 'update_sd_after_lead_evaluation'`
    );
    signatureCount = result.rows[0]?.n ?? 0;
    prosrc = result.rows[0]?.prosrc ?? '';
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  it('exactly one signature exists for update_sd_after_lead_evaluation (FR-1 overload guard)', () => {
    expect(signatureCount, 'pg_proc must contain exactly one signature of update_sd_after_lead_evaluation; multiple signatures break CREATE OR REPLACE behavior').toBe(1);
  });

  it('prosrc is non-empty', () => {
    expect(prosrc.length, 'pg_proc.prosrc is empty — function may not be installed').toBeGreaterThan(0);
  });

  it('APPROVE branch writes in_progress (CASE/WHEN/THEN form, positive assertion)', () => {
    // VALIDATION sub-agent process-learning: trigger uses CASE/WHEN/THEN form,
    // NOT direct assignment. Regex must match the case-expression pattern.
    expect(
      prosrc,
      'pg_proc.prosrc must contain WHEN NEW.final_decision = \'APPROVE\' THEN \'in_progress\' (the writer/consumer asymmetry fix)'
    ).toMatch(/WHEN\s+NEW\.final_decision\s*=\s*'APPROVE'\s+THEN\s+'in_progress'/i);
  });

  it("APPROVE branch does NOT write 'active' (negative assertion — the pre-fix state)", () => {
    expect(
      prosrc,
      "pg_proc.prosrc must NOT contain WHEN NEW.final_decision = 'APPROVE' THEN 'active' (would re-introduce the writer/consumer asymmetry)"
    ).not.toMatch(/WHEN\s+NEW\.final_decision\s*=\s*'APPROVE'\s+THEN\s+'active'/i);
  });

  it('REJECT branch unchanged (writes rejected)', () => {
    // Pin the negative space: the migration MUST NOT have touched non-APPROVE branches.
    expect(prosrc).toMatch(/WHEN\s+NEW\.final_decision\s*=\s*'REJECT'\s+THEN\s+'rejected'/i);
  });

  it('CONDITIONAL/CLARIFY branch unchanged (writes pending_revision)', () => {
    expect(prosrc).toMatch(/WHEN\s+NEW\.final_decision\s+IN\s*\(\s*'CONDITIONAL'\s*,\s*'CLARIFY'\s*\)\s+THEN\s+'pending_revision'/i);
  });

  it('ELSE branch unchanged (retains current status)', () => {
    expect(prosrc).toMatch(/ELSE\s+status/i);
  });
});

describe.skipIf(DB_BEHAVIOR_ENABLED)('FR-3: trigger source pin (skipped without DB_BEHAVIOR_TESTS=1)', () => {
  it('skipped — set DB_BEHAVIOR_TESTS=1 to enable', () => {
    expect(true).toBe(true);
  });
});
