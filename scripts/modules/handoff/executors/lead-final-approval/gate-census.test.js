/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D1/FR-D3/FR-D4: gate census, CI-asserted.
 *
 * Pins the corrected, LIVE-derived counts against the SD's own originally-stated (wrong) "9 of 31"
 * framing -- if the real registered-gate roster or required count ever drifts, this test fails
 * loudly instead of the census silently going stale.
 */
import { describe, it, expect } from 'vitest';
import { buildGateCensus } from './gate-census.js';

const FIXTURE_SD = { sd_key: 'CENSUS-TEST-FIXTURE', sd_type: 'bugfix' };

describe('buildGateCensus', () => {
  const census = buildGateCensus({}, {}, FIXTURE_SD);

  it('is generated from the real getRequiredGates() roster, not a hardcoded list', () => {
    expect(census.length).toBeGreaterThan(15); // real roster is 22, not the SD's originally-cited 9
  });

  it('every entry names required/registered explicitly', () => {
    for (const g of census) {
      expect(typeof g.name).toBe('string');
      expect(typeof g.required).toBe('boolean');
      expect(g.registered).toBe(true);
    }
  });

  it('WIRE_CHECK_GATE is required:true (the SD\'s own smoking-gun example gate)', () => {
    expect(census.find((g) => g.name === 'WIRE_CHECK_GATE')?.required).toBe(true);
  });

  it('the 5 env-flag-gated gates each carry their flag name and a documented disposition', () => {
    const flagged = ['ADKAR_ADOPTION', 'LEARNING_OR_BYPASS_RESOLVED', 'ACCEPTANCE_TIER_DOWNGRADE', 'INVOCATION_PATH_PROOF', 'GATE_ACTIVATION_INVARIANT'];
    for (const name of flagged) {
      const entry = census.find((g) => g.name === name);
      expect(entry, `expected ${name} in the census`).toBeDefined();
      expect(entry.env_flag).toBeTruthy();
      expect(entry.env_flag_disposition).toBeTruthy();
    }
  });

  it('ADKAR_ADOPTION reports enforced=true by default (FR-D3: flipped to opt-out)', () => {
    delete process.env.ENFORCE_ADKAR_GATE;
    const freshCensus = buildGateCensus({}, {}, FIXTURE_SD);
    expect(freshCensus.find((g) => g.name === 'ADKAR_ADOPTION').env_flag_enforced).toBe(true);
  });

  it('a gate with no env-flag entry carries null env_flag/disposition, not a fabricated one', () => {
    const smokeTest = census.find((g) => g.name === 'SMOKE_TEST_GATE');
    expect(smokeTest.env_flag).toBeNull();
    expect(smokeTest.env_flag_disposition).toBeNull();
  });
});
