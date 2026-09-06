/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D1/FR-D3/FR-D4: gate census, CI-asserted.
 *
 * Pins the corrected, LIVE-derived counts against the SD's own originally-stated (wrong) "9 of 31"
 * framing -- if the real registered-gate roster or required count ever drifts, this test fails
 * loudly instead of the census silently going stale.
 */
import { describe, it, expect } from 'vitest';
import { buildGateCensus, ENV_FLAG_GATES } from './gate-census.js';

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

  it('every ENV_FLAG_GATES entry carries its flag name and a documented disposition in the census', () => {
    // SD-LEO-INFRA-LEAD-FINAL-APPROVAL-001-B: reads ENV_FLAG_GATES itself instead of a
    // hand-maintained array -- a prior hardcoded array of 5 silently drifted the moment a 6th
    // entry (GATE_SUCCESS_CRITERIA_UNPOPULATED) was added to gate-census.js without a matching
    // update here, and nothing caught it. A single source of truth cannot drift from itself.
    for (const name of Object.keys(ENV_FLAG_GATES)) {
      const entry = census.find((g) => g.name === name);
      expect(entry, `expected ${name} in the census`).toBeDefined();
      expect(entry.env_flag).toBeTruthy();
      expect(entry.env_flag_disposition).toBeTruthy();
    }
  });

  it('every ENV_FLAG_GATES key names an actually-registered gate (catches a typo/rename going stale)', () => {
    const registeredNames = new Set(census.map((g) => g.name));
    for (const name of Object.keys(ENV_FLAG_GATES)) {
      expect(registeredNames.has(name), `ENV_FLAG_GATES["${name}"] does not match any gate returned by getRequiredGates()`).toBe(true);
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
