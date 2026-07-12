/**
 * SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-A: verify-first seeded thread E2E test.
 *
 * Supersedes tests/e2e/agents/venture-ceo-runtime.spec.ts, which references a
 * nonexistent `eva_agents` table and does not match what the factory/runtime code
 * actually write (agent_registry, agent_budgets, agent_predictions). This test
 * exercises the REAL seeded thread against real live tables via
 * scripts/harness/spine-verify-first-run.mjs — no mocking of the factory/runtime,
 * per FR-7's "real (not fully-mocked) end-to-end test" requirement.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { runSeededThread, teardownRun } from '../../../scripts/harness/spine-verify-first-run.mjs';
import { BudgetManager } from '../../../lib/agents/venture-ceo/budget-manager.js';
import { BudgetExhaustedException } from '../../../lib/agents/venture-ceo/exceptions.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe('Venture CEO verify-first seeded thread', () => {
  test.skip(!SUPABASE_URL || !SUPABASE_KEY, 'requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);

  test('TS-1: happy path — full seeded thread completes end-to-end against real tables', async () => {
    const runId = `e2e-${Date.now()}`;
    const manifest = await runSeededThread({ supabase, runId });

    try {
      expect(manifest.ceoAgentId).toBeTruthy();
      expect(Object.keys(manifest.vpAgentIds)).toHaveLength(4);
      expect(manifest.crewAgentIds.length).toBeGreaterThan(0);
      expect(manifest.predictionId).toBeTruthy();

      // FR-1: org instantiated, fixture-scoped (non-active status).
      const allAgentIds = [manifest.ceoAgentId, ...Object.values(manifest.vpAgentIds), ...manifest.crewAgentIds];
      const { data: agents } = await supabase.from('agent_registry').select('id, status').in('id', allAgentIds);
      expect(agents).toHaveLength(allAgentIds.length);
      for (const a of agents!) expect(a.status).not.toBe('active');

      // FR-4: exactly one real calibration row, resolved.
      const { data: prediction } = await supabase.from('agent_predictions').select('*').eq('id', manifest.predictionId).single();
      expect(prediction.status).toBe('resolved');
      expect(prediction.was_correct).toBe(true);
      expect(prediction.agent_id).toBe(manifest.ceoAgentId);

      // FR-3: budget check landed a real ALLOWED decision, not a throw.
      const { data: budgetLogs } = await supabase.from('agent_budget_logs').select('decision').eq('agent_id', manifest.ceoAgentId);
      expect(budgetLogs!.some((l: any) => l.decision === 'ALLOWED')).toBe(true);
    } finally {
      await teardownRun(supabase, manifest);
    }

    // TS-3: teardown leaves zero residue.
    const { count } = await supabase.from('ventures').select('*', { count: 'exact', head: true }).eq('id', manifest.ventureId);
    expect(count).toBe(0);
  });

  test('TS-2: budget-check failure path — an insufficient seeded budget row raises a REAL exhausted signal, not PGRST205', async () => {
    // Drive the factory directly (same pattern as TS-4) to get one real CEO agent without
    // running the full seeded thread's budget-check step.
    const { VentureFactory } = await import('../../../lib/agents/venture-ceo-factory.js');
    const { buildFixtureVentureRow } = await import('../../../scripts/harness/s20-fixture.mjs');

    const runId = `e2e-budget-fail-${Date.now()}`;
    const uniqueSuffix = randomUUID().replace(/-/g, '').slice(0, 10);
    const ventureRow = { ...buildFixtureVentureRow(`SD-A-${runId}`), name: `TEST-${uniqueSuffix}-SD-A` };
    const { data: venture } = await supabase.from('ventures').insert(ventureRow).select('id, name').single();

    const factory = new VentureFactory(supabase);
    const result = await factory.instantiateVenture({ ventureName: venture!.name, ventureId: venture!.id, totalTokenBudget: 25000 });

    try {
      // Seed a budget row whose daily_limit is LOWER than the estimated cost we'll check —
      // this must raise a real BudgetExhaustedException (the ALLOWED/BLOCKED branch this
      // SD's fix made reachable), never the PGRST205 table-missing error that threw
      // unconditionally before agent_budgets existed.
      await supabase.from('agent_budgets').insert({
        agent_id: result.ceo_agent_id,
        daily_limit: 10,
        daily_consumed: 0,
        monthly_limit: 10000,
        monthly_consumed: 0,
      });

      const budgetManager = new BudgetManager(supabase, result.ceo_agent_id, venture!.id);
      let thrown: any = null;
      try {
        await budgetManager.checkBudgetOrThrow('verify_first_budget_fail_scenario', 500);
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeInstanceOf(BudgetExhaustedException);
      expect(thrown.message).toContain('Daily budget exhausted');

      // The BLOCKED decision must also be logged for real (the audit-trail half of FR-3).
      const { data: logs } = await supabase.from('agent_budget_logs').select('decision').eq('agent_id', result.ceo_agent_id);
      expect(logs!.some((l: any) => l.decision === 'BLOCKED')).toBe(true);
    } finally {
      await teardownRun(supabase, {
        runId,
        ceoAgentId: result.ceo_agent_id,
        vpAgentIds: result.executive_agent_ids,
        crewAgentIds: Object.values(result.crew_agent_ids || {}).flat(),
        ventureId: venture!.id,
      });
    }
  });

  test('TS-3: teardown is idempotent — a second run against the same manifest is a clean no-op', async () => {
    const runId = `e2e-idempotent-${Date.now()}`;
    const manifest = await runSeededThread({ supabase, runId });

    await teardownRun(supabase, manifest);
    await expect(teardownRun(supabase, manifest)).resolves.not.toThrow();
  });

  test('TS-4: a simulated mid-run failure still leaves zero residue after teardown', async () => {
    // Genuinely reproduce the failure window this SD's risk assessment named:
    // instantiateVenture() has no transaction/rollback, so a crash between org
    // creation and message claim leaves real agent_registry/agent_relationships/
    // tool_access_grants rows with no venture_id-based way to find them. Drive the
    // factory directly (bypassing runSeededThread's later steps) to reproduce that
    // exact partial state, then confirm the agent-id-keyed teardown still reaches it.
    const { VentureFactory } = await import('../../../lib/agents/venture-ceo-factory.js');
    const { buildFixtureVentureRow } = await import('../../../scripts/harness/s20-fixture.mjs');

    const runId = `e2e-partial-${Date.now()}`;
    // Name uniqueness must land within the first 20 normalized chars — see the same-named
    // collision note in scripts/harness/spine-verify-first-run.mjs (hierarchy_path is UNIQUE
    // and VentureFactory._generateVentureCode() truncates to 20 chars).
    const uniqueSuffix = randomUUID().replace(/-/g, '').slice(0, 10);
    const ventureRow = { ...buildFixtureVentureRow(`SD-A-${runId}`), name: `TEST-${uniqueSuffix}-SD-A` };
    const { data: venture } = await supabase.from('ventures').insert(ventureRow).select('id, name').single();

    const factory = new VentureFactory(supabase);
    const result = await factory.instantiateVenture({ ventureName: venture!.name, ventureId: venture!.id, totalTokenBudget: 25000 });
    // Simulated crash HERE — before claimNextMessage/budget-check/calibration ever run.

    const partialManifest = {
      runId,
      ceoAgentId: result.ceo_agent_id,
      vpAgentIds: result.executive_agent_ids,
      crewAgentIds: Object.values(result.crew_agent_ids || {}).flat(),
      ventureId: venture!.id,
    };

    await teardownRun(supabase, partialManifest);

    const allAgentIds = [partialManifest.ceoAgentId, ...Object.values(partialManifest.vpAgentIds), ...partialManifest.crewAgentIds];
    const { count: agentResidue } = await supabase.from('agent_registry').select('*', { count: 'exact', head: true }).in('id', allAgentIds);
    const { count: relResidue } = await supabase.from('agent_relationships').select('*', { count: 'exact', head: true }).in('from_agent_id', allAgentIds);
    const { count: grantResidue } = await supabase.from('tool_access_grants').select('*', { count: 'exact', head: true }).in('agent_id', allAgentIds);
    const { count: ventureResidue } = await supabase.from('ventures').select('*', { count: 'exact', head: true }).eq('id', venture!.id);

    expect(agentResidue).toBe(0);
    expect(relResidue).toBe(0);
    expect(grantResidue).toBe(0);
    expect(ventureResidue).toBe(0);
  });
});
