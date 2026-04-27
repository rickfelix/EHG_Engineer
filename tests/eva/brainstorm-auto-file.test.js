import { describe, it, expect } from 'vitest';
import { validateCompanionSdsToFile } from '../../scripts/eva/brainstorm-auto-file.mjs';

describe('validateCompanionSdsToFile', () => {
  it('accepts undefined/null as valid empty', () => {
    expect(validateCompanionSdsToFile(undefined)).toEqual({ valid: true, entries: [] });
    expect(validateCompanionSdsToFile(null)).toEqual({ valid: true, entries: [] });
  });

  it('accepts an empty array', () => {
    const result = validateCompanionSdsToFile([]);
    expect(result.valid).toBe(true);
    expect(result.entries).toEqual([]);
  });

  it('accepts a well-formed entry', () => {
    const entries = [
      {
        title: 'Test SD',
        sd_type: 'infrastructure',
        priority: 'high',
        scope: 'Some scope',
        rationale: 'Some rationale',
        target_application: 'EHG_Engineer',
      },
    ];
    const result = validateCompanionSdsToFile(entries);
    expect(result.valid).toBe(true);
    expect(result.entries).toHaveLength(1);
  });

  it('rejects non-array', () => {
    const result = validateCompanionSdsToFile('not an array');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must be an array');
    expect(result.type_hints).toBeTruthy();
  });

  it('rejects missing required keys with offending payload', () => {
    const entries = [{ title: 'X', sd_type: 'infrastructure' }];
    const result = validateCompanionSdsToFile(entries);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('missing required keys');
    expect(result.error).toMatch(/priority/);
    expect(result.offending).toEqual(entries[0]);
    expect(result.type_hints.some((h) => h.includes('priority'))).toBe(true);
  });

  it('rejects invalid sd_type', () => {
    const entries = [
      {
        title: 'X',
        sd_type: 'not-a-real-type',
        priority: 'high',
        scope: 's',
        rationale: 'r',
        target_application: 'EHG',
      },
    ];
    const result = validateCompanionSdsToFile(entries);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("sd_type='not-a-real-type'");
  });

  it('rejects invalid priority', () => {
    const entries = [
      {
        title: 'X',
        sd_type: 'feature',
        priority: 'urgent',
        scope: 's',
        rationale: 'r',
        target_application: 'EHG',
      },
    ];
    const result = validateCompanionSdsToFile(entries);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("priority='urgent'");
  });

  it('rejects invalid target_application', () => {
    const entries = [
      {
        title: 'X',
        sd_type: 'feature',
        priority: 'high',
        scope: 's',
        rationale: 'r',
        target_application: 'wrong-app',
      },
    ];
    const result = validateCompanionSdsToFile(entries);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("target_application='wrong-app'");
  });
});
