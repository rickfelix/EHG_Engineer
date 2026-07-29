/**
 * SD-LEO-INFRA-SWALLOWED-POSTGREST-ERROR-001 FR-3 — TS-A2 / TS-A3 / TS-A4.
 *
 * The three EXEC-TO-PLAN sites, each of which needed a DIFFERENT treatment. Blanket-converting
 * them would have been wrong, and this suite is where that distinction is pinned:
 *
 *   integration-test-requirement checkHasChildren  -> swallowing catch REMOVED (fault propagates)
 *   wiring-validation checks-breakdown             -> wrapper only; no local catch to restructure
 *   wiring-validation parent-opt-in lookup         -> DELIBERATE fail-open, now a DECLARED tolerance
 *
 * The last one matters: not every data-only destructure is a defect. That site's original comment
 * says the fail-open is intended, so the fix is to make the silence auditable, not to remove it.
 * A suite that failed it would be pushing people to convert blindly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWiringValidationGate } from '../../../scripts/modules/handoff/executors/exec-to-plan/gates/wiring-validation.js';

const FAULT = { code: '42703', message: 'column does not exist :: fault-sentinel' };

/**
 * Supabase double routing by table, so each query in a gate can fail independently.
 * @param {Record<string, {data?:any,error?:any,count?:number}>} byTable
 */
function fakeSupabase(byTable) {
  return {
    from(table) {
      const result = byTable[table] ?? { data: null, error: null };
      const chain = {
        select() { return chain; }, eq() { return chain; }, limit() { return chain; },
        order() { return Promise.resolve(result); },
        maybeSingle() { return Promise.resolve(result); },
        single() { return Promise.resolve(result); },
        then(res, rej) { return Promise.resolve(result).then(res, rej); },
      };
      return chain;
    },
  };
}

describe('TS-A2: checkHasChildren resolves an unanswerable lookup CONSERVATIVELY', () => {
  it('assumes the SD HAS children when the lookup cannot answer — never waives the requirement', async () => {
    // Corrected after SECURITY 66c3911c. Three possible behaviours, only one is right:
    //   swallow -> fault reads as "no children" -> requirement WAIVED (the original defect)
    //   propagate -> required:true unconditional gate FAILS on any blip -> fleet-wide DoS
    //   assume-complex -> an unanswerable lookup can only ADD the requirement, never remove it
    // This asserts the third. hasChildren=true makes the SD complex, so the gate must NOT take
    // its "not complex - integration test check not required" shortcut.
    const { createIntegrationTestRequirementGate } = await import(
      '../../../scripts/modules/handoff/executors/exec-to-plan/gates/integration-test-requirement.js'
    );
    const gate = createIntegrationTestRequirementGate(
      fakeSupabase({ strategic_directives_v2: { data: null, error: FAULT } })
    );
    const res = await gate.validator({ sd: { id: 'sd-uuid', sd_key: 'SD-X-001', sd_type: 'docs' } });
    // Assert the DECISION directly rather than a compound negative over the whole payload — a
    // "not (passed && /not required/)" test can pass for the wrong reason and would be exactly
    // the vacuousness this SD is about.
    expect(res.details.complexity.hasChildren).toBe(true);
    expect(res.details.complexity.reasons).toContain('SD has child SDs');
  });

  it('CONTROL: a genuinely empty result still means NO children — the fault path is not just "always true"', async () => {
    // Without this, the assertion above is satisfied by hardcoding hasChildren=true.
    const { createIntegrationTestRequirementGate } = await import(
      '../../../scripts/modules/handoff/executors/exec-to-plan/gates/integration-test-requirement.js'
    );
    const gate = createIntegrationTestRequirementGate(
      fakeSupabase({ strategic_directives_v2: { data: [], error: null } })
    );
    const res = await gate.validator({ sd: { id: 'sd-uuid', sd_key: 'SD-X-001', sd_type: 'docs' } });
    expect(res.details.complexity.hasChildren).toBe(false);
    expect(res.details.complexity.reasons).not.toContain('SD has child SDs');
  });

  it('LEGACY SHAPE, kept for contrast: a fault must not simply propagate as a gate crash', async () => {
    // Pre-fix: `const { data }` yielded null AND the catch returned false, so a rejected query
    // read as "no children" -> one fewer complexity reason -> isComplex false -> the gate's
    // "not complex, integration test check not required" branch -> AUTOMATIC PASS.
    const { createIntegrationTestRequirementGate } = await import(
      '../../../scripts/modules/handoff/executors/exec-to-plan/gates/integration-test-requirement.js'
    );
    const gate = createIntegrationTestRequirementGate(
      fakeSupabase({ strategic_directives_v2: { data: null, error: FAULT } })
    );
    // Pinning the DoS regression: this gate is required:true and unconditional, so a throw here
    // would fail EVERY EXEC-TO-PLAN handoff on a transient blip.
    await expect(
      gate.validator({ sd: { id: 'sd-uuid', sd_key: 'SD-X-001', sd_type: 'feature' } })
    ).resolves.toBeTruthy();
  });
});

describe('TS-A3: wiring-validation surfaces a checks-query fault instead of reporting zero issues', () => {
  it('REJECTS rather than returning a no-issues verdict', async () => {
    // This site has no local catch — ValidationOrchestrator turns the throw into an honest FAIL —
    // so the assertion is on the REJECTION, not on returned issues. Asserting the wrong shape
    // here would pass vacuously.
    const gate = createWiringValidationGate(fakeSupabase({
      strategic_directives_v2: { data: { wiring_validated: null }, error: null },
      leo_wiring_validations: { data: null, error: FAULT },
    }));
    await expect(
      gate.validator({ sd: { sd_key: 'SD-X-001', metadata: { wiring_required: true } } })
    ).rejects.toThrow(/QUERY_FAILED at wiring-validation:checks-breakdown/);
  });

  it('still returns a normal verdict when the checks query succeeds', async () => {
    // Control: the gate must not have become one that simply throws.
    const gate = createWiringValidationGate(fakeSupabase({
      strategic_directives_v2: { data: { wiring_validated: true }, error: null },
      leo_wiring_validations: { data: [{ check_type: 'a', status: 'passed' }], error: null },
    }));
    const res = await gate.validator({ sd: { sd_key: 'SD-X-001', metadata: { wiring_required: true } } });
    expect(res.passed).toBe(true);
  });
});

describe('FR-2: the parent-opt-in lookup is a DECLARED tolerance, not a fixed defect', () => {
  let writes;
  beforeEach(() => {
    writes = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(s => { writes.push(s); return true; });
  });
  afterEach(() => vi.restoreAllMocks());

  it('tolerates a parent-lookup fault and records WHY, rather than failing the gate', async () => {
    const gate = createWiringValidationGate(fakeSupabase({
      strategic_directives_v2: { data: null, error: FAULT },
    }));
    // Not opted in via self, parent unreadable -> advisory pass, exactly as before the change.
    const res = await gate.validator({ sd: { sd_key: 'SD-X-001', parent_sd_id: 'parent-uuid', metadata: {} } });
    expect(res.passed).toBe(true);
    // The behavioural difference: the silence is now on the record with its reason.
    expect(writes.join('')).toMatch(/TOLERATED at wiring-validation:parent-opt-in-lookup/);
    expect(writes.join('')).toMatch(/advisory by design/);
  });
});
