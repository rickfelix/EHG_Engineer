// SD-LEO-INFRA-SIZE-TIER-AWARE-001 — tier-aware deliverable seeding.
// A small/fast SD's seeded sd_scope_deliverables must not include the size-irrelevant
// boilerplate ("Development environment setup", "Integration tests completed") that stays
// pending and sinks SCOPE_AUDIT coverage to 4/6=67%. filterChecklistForTier drops those for
// small SD types and is a no-op for large types (feature/infrastructure) — fail-open.
import { describe, it, expect } from 'vitest';
import { filterChecklistForTier, SMALL_SD_TYPES, SIZE_IRRELEVANT_DELIVERABLES }
  from '../../../scripts/modules/handoff/extract-deliverables-from-prd.js';

const FULL_EXEC_CHECKLIST = [
  { text: 'Development environment setup', checked: false },
  { text: 'Core functionality implemented', checked: false },
  { text: 'Unit tests written', checked: false },
  { text: 'Integration tests completed', checked: false },
  { text: 'Code review completed', checked: false },
  { text: 'Documentation updated', checked: false },
];

describe('filterChecklistForTier (SD-LEO-INFRA-SIZE-TIER-AWARE-001)', () => {
  it('drops size-irrelevant boilerplate for small SD types (4/4 instead of 4/6)', () => {
    for (const type of ['fix', 'bugfix', 'hotfix', 'documentation']) {
      const out = filterChecklistForTier(FULL_EXEC_CHECKLIST, type);
      expect(out).toHaveLength(4);
      const names = out.map((i) => i.text);
      expect(names).not.toContain('Development environment setup');
      expect(names).not.toContain('Integration tests completed');
      // the real-scope items survive
      expect(names).toContain('Core functionality implemented');
      expect(names).toContain('Unit tests written');
      expect(names).toContain('Code review completed');
      expect(names).toContain('Documentation updated');
    }
  });

  it('is a no-op for large SD types (feature/infrastructure keep the full DoD)', () => {
    for (const type of ['feature', 'infrastructure', 'security', 'enhancement']) {
      expect(filterChecklistForTier(FULL_EXEC_CHECKLIST, type)).toHaveLength(6);
    }
  });

  it('fail-open: unknown/null/undefined type keeps the full checklist', () => {
    expect(filterChecklistForTier(FULL_EXEC_CHECKLIST, null)).toHaveLength(6);
    expect(filterChecklistForTier(FULL_EXEC_CHECKLIST, undefined)).toHaveLength(6);
    expect(filterChecklistForTier(FULL_EXEC_CHECKLIST, 'totally-unknown-type')).toHaveLength(6);
  });

  it('non-array / empty input returned unchanged (no throw)', () => {
    expect(filterChecklistForTier(null, 'bugfix')).toBe(null);
    expect(filterChecklistForTier(undefined, 'bugfix')).toBe(undefined);
    expect(filterChecklistForTier([], 'bugfix')).toEqual([]);
  });

  it('a custom (non-boilerplate) exec_checklist is untouched even for a small type', () => {
    const custom = [{ text: 'Migrate claim_sd RPC', checked: true }, { text: 'Run regression', checked: true }];
    expect(filterChecklistForTier(custom, 'bugfix')).toEqual(custom);
  });

  it('exported sets are sane', () => {
    expect(SMALL_SD_TYPES.has('bugfix')).toBe(true);
    expect(SMALL_SD_TYPES.has('feature')).toBe(false);
    expect(SIZE_IRRELEVANT_DELIVERABLES.has('Development environment setup')).toBe(true);
  });
});
