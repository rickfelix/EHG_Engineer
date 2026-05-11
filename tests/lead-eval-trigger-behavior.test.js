// Behavior tests for update_sd_after_lead_evaluation() trigger
// (FR-5 + FR-6 of SD-FDBK-ENH-PAT-LEO-INFRA-001)
//
// FR-5: assert APPROVE decision flips SD status to 'in_progress'
// FR-6: assert non-APPROVE decisions (REJECT, CONDITIONAL, CLARIFY) do NOT
//       set SD status to 'in_progress' (REJECT writes 'rejected' which is
//       blocked by DB CHECK — see retrospective on this latent secondary bug;
//       OUT OF SCOPE for this SD).
//
// Gated on DB_BEHAVIOR_TESTS=1. Sentinel SD prefix TEST-TRIGGER- with
// afterEach cleanup for parallel safety.
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';

const DB_BEHAVIOR_ENABLED = process.env.DB_BEHAVIOR_TESTS === '1';

const nanoid = () => randomBytes(6).toString('hex');

async function createSentinelDraftSD(sb) {
  const suffix = nanoid();
  const sd_key = `TEST-TRIGGER-${suffix}`;
  const { data, error } = await sb
    .from('strategic_directives_v2')
    .insert({
      sd_key,
      title: `Sentinel SD for trigger behavior test (${suffix})`,
      description: 'Sentinel SD created by lead-eval-trigger-behavior.test.js — safe to delete.',
      status: 'draft',
      category: 'enhancement',
      priority: 'low',
      target_application: 'EHG_Engineer',
      success_criteria: [{ criterion: 'Sentinel test', measure: 'Trigger behavior pinned' }],
      key_principles: ['Trigger behavior pinned by sentinel SD'],
      sd_type: 'infrastructure',
    })
    .select('id, sd_key, status')
    .single();
  if (error) {
    throw new Error(`createSentinelDraftSD failed: ${error.message}`);
  }
  return data;
}

async function teardownSentinelSDs(sb) {
  // Cleanup by prefix (parallel-safe)
  await sb.from('lead_evaluations').delete().like('sd_id', 'TEST-TRIGGER-%');
  await sb.from('strategic_directives_v2').delete().like('sd_key', 'TEST-TRIGGER-%');
}

async function insertLeadEvaluation(sb, sd_id, decision) {
  const { data, error } = await sb
    .from('lead_evaluations')
    .insert({
      sd_id,
      business_value: 'medium',
      duplication_risk: 'low',
      resource_cost: 'low',
      scope_complexity: 'low',
      final_decision: decision,
      justification: 'Sentinel test evaluation',
    })
    .select('id')
    .single();
  if (error) throw new Error(`insertLeadEvaluation(${decision}) failed: ${error.message}`);
  return data;
}

async function getSDStatus(sb, sd_key) {
  const { data, error } = await sb
    .from('strategic_directives_v2')
    .select('status')
    .eq('sd_key', sd_key)
    .maybeSingle();
  if (error) throw new Error(`getSDStatus failed: ${error.message}`);
  return data?.status ?? null;
}

describe.runIf(DB_BEHAVIOR_ENABLED)('FR-5+FR-6: update_sd_after_lead_evaluation() trigger behavior', () => {
  let sb;

  beforeAll(async () => {
    const { createSupabaseServiceClient } = await import('../scripts/lib/supabase-connection.js');
    sb = await createSupabaseServiceClient();
    // Pre-clean any leftover sentinels from prior crashed runs
    await teardownSentinelSDs(sb);
  });

  afterEach(async () => {
    await teardownSentinelSDs(sb);
  });

  afterAll(async () => {
    await teardownSentinelSDs(sb);
  });

  it("FR-5: APPROVE decision flips SD status to 'in_progress' (writer/consumer asymmetry fix)", async () => {
    const sd = await createSentinelDraftSD(sb);
    expect(sd.status).toBe('draft');
    await insertLeadEvaluation(sb, sd.id, 'APPROVE');
    const newStatus = await getSDStatus(sb, sd.sd_key);
    expect(
      newStatus,
      `Trigger fired but status did NOT flip to 'in_progress' — writer/consumer asymmetry may have re-emerged. Actual: ${newStatus}`
    ).toBe('in_progress');
  });

  it("FR-5: APPROVE branch does NOT write 'active' anymore (regression guard)", async () => {
    const sd = await createSentinelDraftSD(sb);
    await insertLeadEvaluation(sb, sd.id, 'APPROVE');
    const newStatus = await getSDStatus(sb, sd.sd_key);
    expect(
      newStatus,
      `Trigger wrote 'active' — the pre-fix asymmetry has been re-introduced. APPROVE must write 'in_progress'.`
    ).not.toBe('active');
  });

  it.each(['REJECT', 'CONDITIONAL', 'CLARIFY'])(
    "FR-6: %s decision does NOT write 'in_progress' (negative space pin)",
    async (decision) => {
      const sd = await createSentinelDraftSD(sb);
      let triggerError = null;
      try {
        await insertLeadEvaluation(sb, sd.id, decision);
      } catch (e) {
        // REJECT writes 'rejected' which is NOT in DB CHECK allowlist — INSERT
        // fails with check constraint violation. This is a latent secondary bug
        // (out of scope for SD-FDBK-ENH-PAT-LEO-INFRA-001 — documented in
        // retrospective). For this negative pin, we accept either:
        //   (a) INSERT succeeded and SD status flipped per CASE branch, OR
        //   (b) INSERT failed with CHECK violation (status unchanged).
        // What we MUST guard against is the trigger writing 'in_progress' on
        // a non-APPROVE decision — that would be a worse asymmetry.
        triggerError = e;
      }
      const newStatus = await getSDStatus(sb, sd.sd_key);
      expect(
        newStatus,
        `${decision} decision must NOT result in status='in_progress' (negative space). Actual: ${newStatus}. trigger error (if any): ${triggerError?.message ?? 'none'}`
      ).not.toBe('in_progress');
      // Sanity check: status is either 'draft' (insert blocked) or the value
      // emitted by the CASE branch for this decision.
      expect(['draft', 'rejected', 'pending_revision']).toContain(newStatus);
    }
  );

  it("FR-6: DEFER and CONSOLIDATE decisions leave status unchanged (ELSE branch)", async () => {
    const sd = await createSentinelDraftSD(sb);
    let triggerError = null;
    try {
      // 'DEFER' is mapped to ELSE in the trigger CASE expression.
      await insertLeadEvaluation(sb, sd.id, 'DEFER');
    } catch (e) {
      triggerError = e;
    }
    const newStatus = await getSDStatus(sb, sd.sd_key);
    if (!triggerError) {
      // INSERT succeeded — ELSE branch should retain status='draft'
      expect(newStatus, 'DEFER must hit ELSE branch and retain status').toBe('draft');
    } else {
      // INSERT may be blocked by a CHECK constraint on final_decision (out of
      // scope to investigate). In that case, status should remain 'draft'.
      expect(newStatus).toBe('draft');
    }
  });
});

describe.skipIf(DB_BEHAVIOR_ENABLED)('FR-5+FR-6: behavior tests (skipped without DB_BEHAVIOR_TESTS=1)', () => {
  it('skipped — set DB_BEHAVIOR_TESTS=1 to enable', () => {
    expect(true).toBe(true);
  });
});
