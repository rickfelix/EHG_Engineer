/**
 * PRD Quality Validator unit tests (FR-4, AC-5/AC-6).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { validatePRDQuality, resolveEnforcementMode, DEFAULT_PASS_THRESHOLD, scanAbsenceClaims, ABSENCE_CLAIM_RE } from '../../scripts/prd/quality-validator.js';

function goodPRD() {
  return {
    functional_requirements: [
      { id: 'FR-1', requirement: 'System must issue a warning on second consecutive retry attempt', acceptance_criteria: ['AC-1'] },
      { id: 'FR-2', requirement: 'System must block third consecutive retry attempt with clear guidance', acceptance_criteria: ['AC-2'] },
      { id: 'FR-3', requirement: 'Counter must reset after rca-agent logged in sub_agent_execution_results', acceptance_criteria: ['AC-3'] },
      { id: 'FR-4', requirement: 'PRDs created via inline mode must be validated against quality rubric', acceptance_criteria: ['AC-5'] },
      { id: 'FR-5', requirement: 'Emergency bypass is available via EMERGENCY_RCA_BYPASS environment variable', acceptance_criteria: ['AC-7'] }
    ],
    technical_requirements: [
      { id: 'TR-1', requirement: 'Retry state scoped per session in .claude/ directory', rationale: 'avoid cross-session contamination' },
      { id: 'TR-2', requirement: 'Enforcement actions logged as structured JSON', rationale: 'observability' },
      { id: 'TR-3', requirement: 'Thresholds configurable via env vars', rationale: 'rollout control' }
    ],
    acceptance_criteria: [
      'AC-1: warning on 2nd invocation',
      'AC-2: block on 3rd invocation',
      'AC-3: counter resets after rca-agent'
    ],
    test_scenarios: [
      { id: 'TS-1', test_type: 'integration', scenario: 'RCA enforcement happy path' },
      { id: 'TS-2', test_type: 'integration', scenario: 'Tiered enforcement and block' },
      { id: 'TS-3', test_type: 'integration', scenario: 'PRD quality validation rejection' },
      { id: 'TS-4', test_type: 'e2e', scenario: 'RCA emergency bypass flow' },
      { id: 'TS-5', test_type: 'integration', scenario: 'PRD quality validation success' }
    ],
    risks: [
      { risk: 'False positives on flaky commands', mitigation: 'Tiered warn-then-block reduces impact', rollback_plan: 'Set LEO_RCA_ENFORCEMENT=off' },
      { risk: 'State file races across processes', mitigation: 'Atomic writes via rename', rollback_plan: 'Delete stale state file' },
      { risk: 'PRD validator breaks existing inline flow', mitigation: 'Default mode off; opt-in warn then block', rollback_plan: 'Unset PRD_QUALITY_ENFORCEMENT_MODE' }
    ],
    system_architecture: {
      overview: 'Pre-tool hook writes transient retry state per session and resets on rca-agent signal.',
      components: [
        { name: 'pre-tool-enforce.cjs', responsibility: 'host enforcement logic', technology: 'Node.js' },
        { name: 'retry-state-manager.cjs', responsibility: 'read/write retry counts', technology: 'Node.js fs' }
      ],
      data_flow: 'Hook reads state -> prunes stale -> checks RCA reset -> increments -> writes state -> decides action.',
      integration_points: ['permission_audit_log', 'sub_agent_execution_results']
    },
    implementation_approach: {
      phases: [
        { phase: 'Phase 1', description: 'Retry state module and ENFORCEMENT 11 wiring', deliverables: ['module', 'tests'] },
        { phase: 'Phase 2', description: 'PRD validator and scripts/prd/index.js integration', deliverables: ['validator', 'tests'] }
      ],
      technical_decisions: ['File-based state avoids DB load on the hook path']
    }
  };
}

describe('validatePRDQuality', () => {
  it('scores a complete PRD above the default threshold', () => {
    const r = validatePRDQuality(goodPRD());
    expect(r.passed).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(DEFAULT_PASS_THRESHOLD);
    expect(r.breakdown).toHaveLength(4);
  });

  it('flags too few functional requirements in the breakdown', () => {
    const prd = goodPRD();
    prd.functional_requirements = prd.functional_requirements.slice(0, 2);
    const baseline = validatePRDQuality(goodPRD()).score;
    const r = validatePRDQuality(prd);
    expect(r.score).toBeLessThan(baseline);
    const depth = r.breakdown.find(d => d.dimension === 'requirements_depth');
    expect(depth.reasons.join(' ')).toMatch(/functional_requirements=2/);
  });

  it('fails a PRD that is missing architecture AND too few FRs', () => {
    const prd = goodPRD();
    prd.functional_requirements = prd.functional_requirements.slice(0, 1);
    delete prd.system_architecture;
    prd.test_scenarios = prd.test_scenarios.slice(0, 2);
    const r = validatePRDQuality(prd);
    expect(r.passed).toBe(false);
  });

  it('flags placeholder text in requirements', () => {
    const prd = goodPRD();
    prd.functional_requirements[0].requirement = 'To be defined later';
    const r = validatePRDQuality(prd);
    const depth = r.breakdown.find(d => d.dimension === 'requirements_depth');
    expect(depth.reasons.some(reason => /placeholder/i.test(reason))).toBe(true);
  });

  it('penalizes missing system_architecture', () => {
    const prd = goodPRD();
    delete prd.system_architecture;
    const r = validatePRDQuality(prd);
    const arch = r.breakdown.find(d => d.dimension === 'architecture_quality');
    expect(arch.reasons.join(' ')).toMatch(/system_architecture missing/);
  });

  it('penalizes risks missing mitigation', () => {
    const prd = goodPRD();
    prd.risks[0].mitigation = '';
    const r = validatePRDQuality(prd);
    const risk = r.breakdown.find(d => d.dimension === 'risk_analysis');
    expect(risk.reasons.join(' ')).toMatch(/missing\/weak mitigation/);
  });

  it('handles empty/null PRD gracefully (returns failing score, no throw)', () => {
    const r = validatePRDQuality(null);
    expect(r.passed).toBe(false);
    expect(r.score).toBeLessThan(DEFAULT_PASS_THRESHOLD);
  });

  it('respects a custom threshold', () => {
    const r = validatePRDQuality({}, { threshold: 0 });
    expect(r.passed).toBe(true);
  });
});

describe('resolveEnforcementMode', () => {
  const original = process.env.PRD_QUALITY_ENFORCEMENT_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.PRD_QUALITY_ENFORCEMENT_MODE;
    else process.env.PRD_QUALITY_ENFORCEMENT_MODE = original;
  });

  it('defaults to off', () => {
    delete process.env.PRD_QUALITY_ENFORCEMENT_MODE;
    expect(resolveEnforcementMode()).toBe('off');
  });

  it('accepts warn/block', () => {
    process.env.PRD_QUALITY_ENFORCEMENT_MODE = 'warn';
    expect(resolveEnforcementMode()).toBe('warn');
    process.env.PRD_QUALITY_ENFORCEMENT_MODE = 'BLOCK';
    expect(resolveEnforcementMode()).toBe('block');
  });

  it('falls back to off for unknown values', () => {
    process.env.PRD_QUALITY_ENFORCEMENT_MODE = 'strict';
    expect(resolveEnforcementMode()).toBe('off');
  });
});

// ─── PAT-LES-e6ebbba78e2d (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-143), FR-5 ─────
// An acceptance criterion asserting an absence ("no other X exists") is as unverified as
// one asserting a presence. Warn-only: must never affect score/passed.
describe('scanAbsenceClaims', () => {
  it('[TS-6] flags "no other" as an unverified absence claim', () => {
    const warnings = scanAbsenceClaims({ acceptance_criteria: ['no other implementation exists in the codebase'] });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/ABSENCE_CLAIM_UNVERIFIED/);
    expect(warnings[0]).toMatch(/acceptance_criteria\[0\]/);
  });

  it('flags "the only" and "sole" and "nowhere else"', () => {
    expect(scanAbsenceClaims({ acceptance_criteria: ['this is the only place prosecdef is used'] })).toHaveLength(1);
    expect(scanAbsenceClaims({ acceptance_criteria: ['this is the sole authoritative source'] })).toHaveLength(1);
    expect(scanAbsenceClaims({ acceptance_criteria: ['verified nowhere else in the codebase'] })).toHaveLength(1);
  });

  it('[TS-7] does NOT flag a hyphenated qualifier compound ("<word>-only implementation")', () => {
    // TESTING sub-agent found this exact shape as a 4/4 false-positive rate against real PRD data.
    expect(scanAbsenceClaims({ acceptance_criteria: ['a route-only implementation is a FAIL'] })).toEqual([]);
    expect(scanAbsenceClaims({ acceptance_criteria: ['database-only implementation confirmed'] })).toEqual([]);
  });

  it('DOES flag a non-hyphenated "only implementation" phrase', () => {
    expect(scanAbsenceClaims({ acceptance_criteria: ['this is the only implementation of the gate'] })).toHaveLength(1);
  });

  it('does not match "does not exist elsewhere" phrasing (dropped -- 0 real hits, dead weight)', () => {
    expect(ABSENCE_CLAIM_RE.test('confirmed to not exist elsewhere in the repo')).toBe(false);
  });

  it('is case-insensitive and handles object-shaped acceptance_criteria entries', () => {
    const warnings = scanAbsenceClaims({ acceptance_criteria: [{ criterion: 'NO OTHER writer touches this table' }] });
    expect(warnings).toHaveLength(1);
  });

  it('returns [] for acceptance criteria with no absence-claim phrasing', () => {
    expect(scanAbsenceClaims({ acceptance_criteria: ['the endpoint returns 200 on success', 'errors are logged with a correlation id'] })).toEqual([]);
  });

  it('is safe against missing/non-array acceptance_criteria', () => {
    expect(scanAbsenceClaims({})).toEqual([]);
    expect(scanAbsenceClaims({ acceptance_criteria: null })).toEqual([]);
  });

  it('is warn-only: validatePRDQuality never lets warnings affect score/passed', () => {
    const prd = { ...goodPRD(), acceptance_criteria: [...goodPRD().acceptance_criteria, 'no other consumer of this table exists'] };
    const withClaim = validatePRDQuality(prd);
    const without = validatePRDQuality(goodPRD());
    expect(withClaim.warnings.length).toBeGreaterThan(0);
    expect(withClaim.score).toBe(without.score);
    expect(withClaim.passed).toBe(without.passed);
  });

  it('a clean PRD carries an empty warnings array on the validatePRDQuality result', () => {
    expect(validatePRDQuality(goodPRD()).warnings).toEqual([]);
  });
});
