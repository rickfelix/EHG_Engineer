/**
 * SD-PAT-FIX-LEAD-PLAN-REJECTED-004 — LEAD-TO-PLAN rejection class fix.
 *
 * FR-1: content-derivation helpers in prerequisite-preflight.js derive
 *       strategic_objectives / success_criteria / success_metrics from
 *       author-provided content only — never invent.
 * FR-2: pattern-alert-sd-creator emits SDs that pass both LEAD-TO-PLAN
 *       validators with zero manual backfill.
 * FR-3: HandoffRecorder.recordFailure persists per-field deficits into the
 *       rejected sd_phase_handoffs row (the 7x-loop fix).
 */
import { describe, it, expect } from 'vitest';
import {
  deriveStrategicObjectives,
  deriveSuccessCriteria,
  deriveSuccessMetrics,
  checkLeadToPlanPrereqs
} from '../../../scripts/modules/handoff/pre-checks/prerequisite-preflight.js';
import { STRUCTURAL_RULES } from '../../../scripts/modules/sd-quality-scoring.js';

/** Fixture shaped like a pattern-alert auto-generated SD (the e756f97d class). */
function patternSdFixture(overrides = {}) {
  return {
    sd_key: 'SD-PAT-FIX-TEST-001',
    sd_type: 'bugfix',
    title: '[PAT-TEST-1234] Resolve Root Cause: handoff rejected repeatedly during SD lifecycle',
    rationale: 'This pattern has occurred 7 times with high severity. Recurring issues indicate a systemic problem requiring root cause resolution.',
    scope: 'Resolve the root cause of recurring pattern PAT-TEST-1234 (category: session_retrospective).',
    description: [
      '## Auto-Generated from Issue Pattern',
      '',
      '### Issue Summary',
      'LEAD-TO-PLAN rejected 7 times during SD lifecycle.',
      '',
      '### Acceptance Criteria',
      '1. Root cause identified and documented',
      '2. Permanent fix implemented',
      '3. Pattern occurrence count stabilizes or decreases',
      '',
      '### Suggested Team',
      'engineering'
    ].join('\n'),
    strategic_objectives: null,
    success_criteria: null,
    success_metrics: null,
    ...overrides
  };
}

describe('FR-1: deriveStrategicObjectives', () => {
  it('derives from title + rationale + scope when combined >= 100 chars', () => {
    const out = deriveStrategicObjectives(patternSdFixture());
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThanOrEqual(100);
    expect(out).toContain('Resolve Root Cause');
    expect(out).toContain('systemic problem');
  });

  it('returns null when the field is already populated (never overwrites)', () => {
    expect(deriveStrategicObjectives(patternSdFixture({ strategic_objectives: 'Existing objectives text' }))).toBeNull();
    expect(deriveStrategicObjectives(patternSdFixture({ strategic_objectives: [{ title: 'x' }] }))).toBeNull();
  });

  it('returns null when source content is too thin (< 100 chars)', () => {
    expect(deriveStrategicObjectives({ title: 'Short', rationale: '', scope: '' })).toBeNull();
  });
});

describe('FR-1: deriveSuccessCriteria', () => {
  it('parses a numbered Acceptance Criteria section into {criterion, measure}', () => {
    const out = deriveSuccessCriteria(patternSdFixture());
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(3);
    expect(out[0].criterion).toBe('Root cause identified and documented');
    // shape matches STRUCTURAL_RULES.success_criteria
    for (const entry of out) {
      for (const key of STRUCTURAL_RULES.success_criteria.expectedKeys) {
        expect(entry[key]).toBeTruthy();
      }
    }
  });

  it('parses bulleted/checkbox lists too', () => {
    const sd = patternSdFixture({
      description: '### Success Criteria\n- [ ] First thing works\n- Second thing verified\n\n### Next\nother'
    });
    const out = deriveSuccessCriteria(sd);
    expect(out.map(c => c.criterion)).toEqual(['First thing works', 'Second thing verified']);
  });

  it('returns null when there is no criteria section (never invents)', () => {
    expect(deriveSuccessCriteria(patternSdFixture({ description: 'A bare description with no list sections at all.' }))).toBeNull();
  });

  it('returns null when already populated', () => {
    expect(deriveSuccessCriteria(patternSdFixture({ success_criteria: [{ criterion: 'x', measure: 'y' }] }))).toBeNull();
  });
});

describe('FR-1: deriveSuccessMetrics', () => {
  it('mirrors derived criteria into {metric, target}', () => {
    const criteria = deriveSuccessCriteria(patternSdFixture());
    const out = deriveSuccessMetrics(patternSdFixture(), criteria);
    expect(out).toHaveLength(3);
    expect(out[0].metric).toBe(criteria[0].criterion);
    expect(out[0].target).toBeTruthy();
  });

  it('uses existing success_criteria when present on the SD', () => {
    const sd = patternSdFixture({ success_criteria: [{ criterion: 'Existing crit', measure: 'Existing measure' }] });
    const out = deriveSuccessMetrics(sd, null);
    expect(out).toEqual([{ metric: 'Existing crit', target: 'Existing measure' }]);
  });

  it('returns null with no criteria source (never fabricates measurables)', () => {
    expect(deriveSuccessMetrics(patternSdFixture(), null)).toBeNull();
  });

  it('returns null when success_metrics already populated', () => {
    const sd = patternSdFixture({ success_metrics: [{ metric: 'm', target: 't' }] });
    expect(deriveSuccessMetrics(sd, [{ criterion: 'c', measure: 'm' }])).toBeNull();
  });
});

describe('FR-1: gate not eroded for bare SDs', () => {
  it('a bare-content SD derives nothing and still rejects via checkLeadToPlanPrereqs', () => {
    const bare = {
      sd_key: 'SD-BARE-001',
      sd_type: 'bugfix',
      title: 'Tiny',
      description: 'Too short.',
      smoke_test_steps: null
    };
    expect(deriveStrategicObjectives(bare)).toBeNull();
    expect(deriveSuccessCriteria(bare)).toBeNull();
    expect(deriveSuccessMetrics(bare, null)).toBeNull();
    const issues = checkLeadToPlanPrereqs(bare);
    expect(issues.some(i => i.code === 'JSONB_FIELDS_INCOMPLETE')).toBe(true);
  });
});
