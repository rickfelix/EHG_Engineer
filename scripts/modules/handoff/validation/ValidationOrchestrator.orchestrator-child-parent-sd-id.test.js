/**
 * QF-20260905-678 — buildGatesFromRules' orchestrator-child guard must match the executor's own
 * child-detection predicate (executors/exec-to-plan/index.js) verbatim: a bare parent_sd_id, with
 * no metadata.parent_orchestrator/auto_generated, is ALSO sufficient there. Before this fix, this
 * guard's OR condition omitted parent_sd_id entirely, so a child SD carrying only that field fell
 * through to the DB-rule merge below -- inflating the gate count with duplicate DB-driven rules
 * already folded into the executor's own reduced gate set.
 *
 * Proven by spying on loadValidationRules (the DB call), not by array reference equality --
 * buildGatesFromRules ALSO returns the same hardcodedGates reference when the DB genuinely has
 * zero rules for a standalone SD, so reference equality alone cannot distinguish "short-circuited
 * before the DB call" from "queried the DB and got nothing back".
 */
import { describe, it, expect, vi } from 'vitest';
import { ValidationOrchestrator } from './ValidationOrchestrator.js';

function makeOrchestrator() {
  // buildGatesFromRules never touches this.supabase when isOrchestratorChild short-circuits —
  // any truthy stub satisfies the constructor's require-a-client guard.
  const orchestrator = new ValidationOrchestrator({});
  vi.spyOn(orchestrator, 'loadValidationRules').mockResolvedValue([]);
  return orchestrator;
}

describe('buildGatesFromRules — orchestrator-child guard parity with the executor predicate', () => {
  it('skips DB-driven gates for a child identified by metadata.parent_orchestrator (existing behaviour, unchanged)', async () => {
    const orchestrator = makeOrchestrator();
    const hardcoded = [{ name: 'HARDCODED_GATE' }];
    const gates = await orchestrator.buildGatesFromRules(hardcoded, 'EXEC-TO-PLAN', {
      sd: { metadata: { parent_orchestrator: 'SD-PARENT-001' } },
    });
    expect(gates).toBe(hardcoded);
    expect(orchestrator.loadValidationRules).not.toHaveBeenCalled();
  });

  it('skips DB-driven gates for a child identified by metadata.auto_generated (existing behaviour, unchanged)', async () => {
    const orchestrator = makeOrchestrator();
    const hardcoded = [{ name: 'HARDCODED_GATE' }];
    const gates = await orchestrator.buildGatesFromRules(hardcoded, 'EXEC-TO-PLAN', {
      sd: { metadata: { auto_generated: true } },
    });
    expect(gates).toBe(hardcoded);
    expect(orchestrator.loadValidationRules).not.toHaveBeenCalled();
  });

  it('QF-20260905-678: skips DB-driven gates for a child identified ONLY by a bare parent_sd_id (no metadata flags) -- matches the executor predicate', async () => {
    const orchestrator = makeOrchestrator();
    const hardcoded = [{ name: 'HARDCODED_GATE' }];
    const gates = await orchestrator.buildGatesFromRules(hardcoded, 'EXEC-TO-PLAN', {
      sd: { metadata: {}, parent_sd_id: 'ad1115a4-9bc5-4c1c-8d54-165381e750ba' },
    });
    expect(gates).toBe(hardcoded);
    expect(orchestrator.loadValidationRules).not.toHaveBeenCalled();
  });

  it('a standalone SD (no parent_orchestrator, no auto_generated, no parent_sd_id) does NOT short-circuit -- reaches the DB-rule loading call', async () => {
    const orchestrator = makeOrchestrator();
    const hardcoded = [{ name: 'HARDCODED_GATE' }];
    await orchestrator.buildGatesFromRules(hardcoded, 'EXEC-TO-PLAN', { sd: { metadata: {} } });
    expect(orchestrator.loadValidationRules).toHaveBeenCalledTimes(1);
  });
});
