/**
 * SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 — FR-4: artifact-anchored touch point.
 *
 * The venture-build touch point must trigger SD-tree creation on ARTIFACT presence
 * (stageOutput.sd_bridge_payloads), NOT a hardcoded stage number. This locks that
 * invariant: with no sd_bridge_payloads, convertSprintToSDs is a no-op and never
 * touches the DB — regardless of any stage number — so no stage-number path can
 * trigger creation. (The companion SD-LEO-INFRA-RECONCILE-VENTURE-LIFECYCLE-001 owns
 * stage-number reconciliation; this SD only guards artifact-anchoring.)
 */
import { describe, it, expect, vi } from 'vitest';
import { convertSprintToSDs } from '../../lib/eva/lifecycle-sd-bridge.js';

const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

describe('FR-4: SD-tree creation is artifact-anchored (sd_bridge_payloads), not stage-number', () => {
  it('no sd_bridge_payloads → no-op, DB never touched (no stage-number trigger)', async () => {
    const fromSpy = vi.fn(() => { throw new Error('DB must not be touched when no payloads'); });
    const result = await convertSprintToSDs(
      {
        stageOutput: { sprint_name: 'S', sprint_goal: 'g', lifecycle_stage: 19 },
        ventureContext: { id: 'venture-1', name: 'CronLinter' },
      },
      { supabase: { from: fromSpy }, logger: silentLogger },
    );
    expect(result.created).toBe(false);
    expect(result.errors).toContain('No sprint items to convert');
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('empty sd_bridge_payloads array → same artifact-anchored no-op', async () => {
    const fromSpy = vi.fn(() => { throw new Error('DB must not be touched when payloads empty'); });
    const result = await convertSprintToSDs(
      {
        stageOutput: { sprint_name: 'S', sd_bridge_payloads: [] },
        ventureContext: { id: 'venture-1', name: 'CronLinter' },
      },
      { supabase: { from: fromSpy }, logger: silentLogger },
    );
    expect(result.created).toBe(false);
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
