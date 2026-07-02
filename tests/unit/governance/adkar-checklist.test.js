/**
 * SD-LEO-INFRA-ADKAR-CHANGE-ADOPTION-FRAMEWORK-001-A (FR-1)
 *
 * The ADKAR checklist shape module: the single source of truth sibling Child B's future
 * completion gate will import to evaluate metadata.adkar_checklist. This SD ships the shape
 * only — no gate, no enforcement.
 */
import { describe, it, expect } from 'vitest';
import { ADKAR_STAGES, REQUIRES_ADOPTION_KEY, ADKAR_CHECKLIST_KEY, isValidAdkarEntry, validateAdkarChecklist } from '../../../lib/governance/adkar-checklist.js';

const evidenced = (stage, kind = 'doc', ref = 'x') => ({ stage, evidence: { kind, ref } });
const waived = (stage, reason) => ({ stage, waived: true, waived_reason: reason });
const completeChecklist = () => ADKAR_STAGES.map((stage) => evidenced(stage));

describe('ADKAR_STAGES / key constants', () => {
  it('is the 5 canonical stages in order, frozen', () => {
    expect(ADKAR_STAGES).toEqual(['awareness', 'desire', 'knowledge', 'ability', 'reinforcement']);
    expect(Object.isFrozen(ADKAR_STAGES)).toBe(true);
  });

  it('exposes the metadata field name constants', () => {
    expect(REQUIRES_ADOPTION_KEY).toBe('requires_adoption');
    expect(ADKAR_CHECKLIST_KEY).toBe('adkar_checklist');
  });
});

describe('isValidAdkarEntry', () => {
  it('is valid with real evidence (non-empty evidence.kind)', () => {
    expect(isValidAdkarEntry(evidenced('awareness'))).toBe(true);
  });

  it('is valid with a waiver carrying a non-empty reason (no evidence needed)', () => {
    expect(isValidAdkarEntry(waived('reinforcement', 'not applicable to this SD class'))).toBe(true);
  });

  it('is invalid with an empty evidence.kind', () => {
    expect(isValidAdkarEntry({ stage: 'ability', evidence: { kind: '' } })).toBe(false);
  });

  it('is invalid when waived:true but waived_reason is empty — an empty waiver is not a waiver', () => {
    expect(isValidAdkarEntry({ stage: 'desire', waived: true, waived_reason: '' })).toBe(false);
    expect(isValidAdkarEntry({ stage: 'desire', waived: true })).toBe(false);
  });

  it('is invalid when neither evidence nor a waiver is present', () => {
    expect(isValidAdkarEntry({ stage: 'knowledge' })).toBe(false);
  });

  it('is invalid for an unrecognized stage name', () => {
    expect(isValidAdkarEntry(evidenced('enthusiasm'))).toBe(false);
  });

  it('handles null/non-object input without throwing', () => {
    expect(isValidAdkarEntry(null)).toBe(false);
    expect(isValidAdkarEntry(undefined)).toBe(false);
    expect(isValidAdkarEntry('not-an-object')).toBe(false);
  });
});

describe('validateAdkarChecklist', () => {
  it('TS-1: a complete 5-stage checklist with evidence on every stage is valid', () => {
    expect(validateAdkarChecklist(completeChecklist())).toEqual({ valid: true, missingStages: [], invalidEntries: [] });
  });

  it('TS-2: a checklist missing the reinforcement stage names it in missingStages', () => {
    const missing = completeChecklist().filter((e) => e.stage !== 'reinforcement');
    const result = validateAdkarChecklist(missing);
    expect(result.valid).toBe(false);
    expect(result.missingStages).toEqual(['reinforcement']);
    expect(result.invalidEntries).toEqual([]);
  });

  it('TS-3: an entry with an empty evidence.kind is reported as an invalid entry, not missing', () => {
    const checklist = [...completeChecklist().filter((e) => e.stage !== 'reinforcement'), { stage: 'reinforcement', evidence: { kind: '' } }];
    const result = validateAdkarChecklist(checklist);
    expect(result.valid).toBe(false);
    expect(result.missingStages).toEqual([]);
    expect(result.invalidEntries).toEqual(['reinforcement']);
  });

  it('TS-4: a stage waived:true with no waived_reason is invalid', () => {
    const checklist = [...completeChecklist().filter((e) => e.stage !== 'ability'), { stage: 'ability', waived: true, waived_reason: '' }];
    const result = validateAdkarChecklist(checklist);
    expect(result.valid).toBe(false);
    expect(result.invalidEntries).toEqual(['ability']);
  });

  it('TS-5: a valid waiver (waived:true + non-empty reason, no evidence) satisfies the shape', () => {
    const checklist = [...completeChecklist().filter((e) => e.stage !== 'ability'), waived('ability', 'not applicable to this SD class')];
    expect(validateAdkarChecklist(checklist)).toEqual({ valid: true, missingStages: [], invalidEntries: [] });
  });

  it('reports multiple missing stages together', () => {
    const partial = completeChecklist().slice(0, 2); // awareness, desire only
    const result = validateAdkarChecklist(partial);
    expect(result.missingStages).toEqual(['knowledge', 'ability', 'reinforcement']);
  });

  it('handles a non-array checklist (undefined/null/object) by reporting every stage missing', () => {
    expect(validateAdkarChecklist(undefined).missingStages).toEqual([...ADKAR_STAGES]);
    expect(validateAdkarChecklist(null).missingStages).toEqual([...ADKAR_STAGES]);
    expect(validateAdkarChecklist({}).missingStages).toEqual([...ADKAR_STAGES]);
  });
});
