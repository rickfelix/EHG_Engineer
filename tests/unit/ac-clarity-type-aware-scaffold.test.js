/**
 * SD-LEO-INFRA-PLANEXEC-USERSTORY-AC-CLARITY-001 — type-aware fallback AC scaffold.
 *
 * FR-1 verdict: userStoryQuality AC-clarity FAILs are genuinely-vague auto-generated
 * boilerplate (UI-centric language on infra SDs); the gate is correct — don't loosen it.
 * FR-2: infrastructure/backend SDs get system-level testable AC scaffolds.
 * FR-3 (retained teeth): is_boilerplate:true preserved so allAcsBoilerplate()->draft and
 * the clarity gate still catch vague ACs; feature/UI SDs unchanged.
 */
import { describe, it, expect } from 'vitest';
import {
  generateAcceptanceCriteria,
  isSystemLevelSdType
} from '../../lib/sub-agents/modules/stories/quality-generation.js';
import { allAcsBoilerplate } from '../../scripts/modules/auto-trigger-stories.mjs';

const UI_ONLY_PHRASES = [
  'visible in the ui',
  'navigated to the area',
  'navigated to the',
  'on the form',
  'the form with required',
  'page is refreshed',
  'empty state'
];
const CRITERION = 'Reconcile the worker liveness gauge against the heartbeat source';

function allText(criteria) {
  return JSON.stringify(criteria).toLowerCase();
}

describe('SD-...-AC-CLARITY-001: type-aware AC scaffold', () => {
  it('isSystemLevelSdType: true for system/backend types, false for feature/unknown', () => {
    for (const t of ['infrastructure', 'backend', 'api', 'database', 'refactor', 'INFRASTRUCTURE', ' Infrastructure ']) {
      expect(isSystemLevelSdType(t)).toBe(true);
    }
    for (const t of ['feature', 'ux_debt', null, undefined, '', 'documentation']) {
      expect(isSystemLevelSdType(t)).toBe(false);
    }
  });

  it('FR-2: infrastructure scaffold uses system-level testable language, no UI-only phrases', () => {
    const acs = generateAcceptanceCriteria(CRITERION, 0, 'infrastructure');
    expect(Array.isArray(acs)).toBe(true);
    expect(acs.length).toBeGreaterThanOrEqual(3);
    const text = allText(acs);
    for (const phrase of UI_ONLY_PHRASES) {
      expect(text).not.toContain(phrase);
    }
    // at least one concrete system-level testable signal
    expect(text).toMatch(/exits 0|no errors logged|idempotent|no duplicate|logs show|persisted|partial or corrupt state/);
  });

  it('FR-3 retained teeth: infra scaffold ACs all carry is_boilerplate:true (still draft-defaulted)', () => {
    const acs = generateAcceptanceCriteria(CRITERION, 0, 'infrastructure');
    expect(acs.every(ac => ac.is_boilerplate === true)).toBe(true);
    // the existing draft-defaulting predicate still fires on the new scaffold
    expect(allAcsBoilerplate(acs)).toBe(true);
  });

  it('FR-3 regression guard: feature/default scaffold is unchanged (deep-equal) and still UI-phrased', () => {
    const legacy = generateAcceptanceCriteria(CRITERION, 0);          // 2-arg legacy signature
    const feature = generateAcceptanceCriteria(CRITERION, 0, 'feature');
    expect(feature).toEqual(legacy);                                  // no regression for feature SDs
    expect(allText(feature)).toContain('visible in the ui');          // UI scaffold retained where appropriate
    expect(feature.every(ac => ac.is_boilerplate === true)).toBe(true);
  });

  it('AC ids and shape are preserved across both scaffolds', () => {
    const infra = generateAcceptanceCriteria(CRITERION, 2, 'infrastructure');
    const ui = generateAcceptanceCriteria(CRITERION, 2);
    for (const set of [infra, ui]) {
      expect(set.map(a => a.id)).toEqual(['AC-3-1', 'AC-3-2', 'AC-3-3']);
      for (const ac of set) {
        expect(ac).toHaveProperty('scenario');
        expect(ac).toHaveProperty('given');
        expect(ac).toHaveProperty('when');
        expect(ac).toHaveProperty('then');
        expect(ac).toHaveProperty('is_boilerplate', true);
      }
    }
  });
});
