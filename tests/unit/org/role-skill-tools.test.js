/**
 * FR-3 / FR-4, TS-2 / TS-3: skill pin/re-pin and fail-closed tool authorization.
 * SD-LEO-INFRA-SKILL-LIBRARY-VERSIONED-001
 */
import { describe, it, expect } from 'vitest';
import { pinSkillForRole, listPinnedSkillsForRole, isToolGrantedForRole } from '../../../lib/org/role-skill-tools.mjs';
import { STANDARD_VENTURE_TEMPLATE } from '../../../lib/agents/venture-ceo-factory.js';
import { resolveVentureRoles, templateToBaseRows } from '../../../lib/org/role-registry-resolver.mjs';

describe('pinSkillForRole / listPinnedSkillsForRole (FR-3, TS-2)', () => {
  it('pins a new skill onto a function layer with no prior skills', () => {
    const fn = { tools: ['web_search'] };
    const pinned = pinSkillForRole(fn, 'schema-design', { pinned_commit: 'c0ffee1', version_label: '1.0.0' });
    expect(listPinnedSkillsForRole(pinned)).toEqual([
      { skill_key: 'schema-design', pinned_commit: 'c0ffee1', version_label: '1.0.0' },
    ]);
    // never mutates the input
    expect(fn.skills).toBeUndefined();
  });

  it('re-pinning replaces exactly one skill_key entry, leaving others untouched (TS-2)', () => {
    let fn = { tools: [] };
    fn = pinSkillForRole(fn, 'A', { pinned_commit: 'c0ffee1', version_label: '1.0.0' });
    fn = pinSkillForRole(fn, 'B', { pinned_commit: 'c0ffee2', version_label: '1.0.0' });

    const rePinned = pinSkillForRole(fn, 'A', { pinned_commit: 'c0ffee3', version_label: '2.0.0' });

    expect(listPinnedSkillsForRole(rePinned)).toEqual([
      { skill_key: 'B', pinned_commit: 'c0ffee2', version_label: '1.0.0' },
      { skill_key: 'A', pinned_commit: 'c0ffee3', version_label: '2.0.0' },
    ]);
    // the pre-re-pin layer is untouched (pure function, no mutation)
    expect(listPinnedSkillsForRole(fn)).toEqual([
      { skill_key: 'A', pinned_commit: 'c0ffee1', version_label: '1.0.0' },
      { skill_key: 'B', pinned_commit: 'c0ffee2', version_label: '1.0.0' },
    ]);
  });

  it('a later commit for a pinned skill does not change the existing pin until re-pinned explicitly', () => {
    // Mirrors the PRD's version-drift scenario at the pin-layer (FR-2's own module proves the
    // git-read side of this in tests/unit/skills/pinned-skill-read.test.js).
    let fn = { tools: [] };
    fn = pinSkillForRole(fn, 'X', { pinned_commit: 'deadbeef', version_label: '1.0.0' });
    // "author a new skill version" == a new commit exists, but nobody re-pinned yet.
    expect(listPinnedSkillsForRole(fn)).toEqual([
      { skill_key: 'X', pinned_commit: 'deadbeef', version_label: '1.0.0' },
    ]);
    const rePinned = pinSkillForRole(fn, 'X', { pinned_commit: 'deadbee2', version_label: '2.0.0' });
    expect(listPinnedSkillsForRole(rePinned)[0].pinned_commit).toBe('deadbee2');
    expect(listPinnedSkillsForRole(fn)[0].pinned_commit).toBe('deadbeef');
  });

  it('listPinnedSkillsForRole returns [] for a function layer with no skills key', () => {
    expect(listPinnedSkillsForRole({ tools: ['x'] })).toEqual([]);
  });

  it('listPinnedSkillsForRole fails closed to [] for a null/undefined function layer, never throws', () => {
    expect(() => listPinnedSkillsForRole(null)).not.toThrow();
    expect(listPinnedSkillsForRole(null)).toEqual([]);
    expect(listPinnedSkillsForRole(undefined)).toEqual([]);
  });

  it('pinSkillForRole throws for a null/undefined/non-object roleFunctionLayer (adversarial /ship review finding)', () => {
    const pin = { pinned_commit: 'c0ffee1', version_label: '1.0.0' };
    expect(() => pinSkillForRole(null, 'X', pin)).toThrow(TypeError);
    expect(() => pinSkillForRole(undefined, 'X', pin)).toThrow(TypeError);
    expect(() => pinSkillForRole('not-an-object', 'X', pin)).toThrow(TypeError);
  });

  it('pinSkillForRole throws for a pinned_commit that is not SHA-shaped (adversarial /ship review finding)', () => {
    expect(() => pinSkillForRole({}, 'X', { pinned_commit: '' })).toThrow(TypeError);
    expect(() => pinSkillForRole({}, 'X', { pinned_commit: 'main' })).toThrow(TypeError);
    expect(() => pinSkillForRole({}, 'X', { pinned_commit: 'not a commit at all' })).toThrow(TypeError);
    expect(() => pinSkillForRole({}, 'X', {})).toThrow(TypeError);
    // valid: 7-40 hex chars, case-insensitive
    expect(() => pinSkillForRole({}, 'X', { pinned_commit: 'ABCDEF1' })).not.toThrow();
  });

  it('pinSkillForRole throws for a non-string/empty skillKey (round-2 adversarial /ship review finding)', () => {
    const pin = { pinned_commit: 'c0ffee1', version_label: '1.0.0' };
    expect(() => pinSkillForRole({}, undefined, pin)).toThrow(TypeError);
    expect(() => pinSkillForRole({}, null, pin)).toThrow(TypeError);
    expect(() => pinSkillForRole({}, '', pin)).toThrow(TypeError);
    expect(() => pinSkillForRole({}, 42, pin)).toThrow(TypeError);
  });

  it('listPinnedSkillsForRole returns a copy, not a live reference (round-2 adversarial /ship review finding)', () => {
    const fn = pinSkillForRole({}, 'A', { pinned_commit: 'c0ffee1', version_label: '1.0.0' });
    const listed = listPinnedSkillsForRole(fn);
    listed.push({ skill_key: 'INJECTED', pinned_commit: 'c0ffee2' });
    // mutating the returned array must not corrupt the source function layer
    expect(listPinnedSkillsForRole(fn)).toHaveLength(1);
    expect(fn.skills).toHaveLength(1);
  });
});

describe('isToolGrantedForRole (FR-4, TS-3, TR-3 fail-closed)', () => {
  it('returns false for a tool absent from the role\'s resolved .tools array', () => {
    const role = { tools: ['web_search', 'company_lookup'] };
    expect(isToolGrantedForRole(role, 'ungranted_tool_xyz')).toBe(false);
  });

  it('returns true for a tool present in the role\'s resolved .tools array', () => {
    const role = { tools: ['web_search', 'company_lookup'] };
    expect(isToolGrantedForRole(role, 'company_lookup')).toBe(true);
  });

  it('returns false, never throws, for a role with no .tools field at all', () => {
    expect(() => isToolGrantedForRole({}, 'anything')).not.toThrow();
    expect(isToolGrantedForRole({}, 'anything')).toBe(false);
  });

  it('returns false for a null/undefined role', () => {
    expect(isToolGrantedForRole(null, 'anything')).toBe(false);
    expect(isToolGrantedForRole(undefined, 'anything')).toBe(false);
  });

  it('returns false for an empty .tools array', () => {
    expect(isToolGrantedForRole({ tools: [] }, 'anything')).toBe(false);
  });

  it('checks against a REAL resolved role from STANDARD_VENTURE_TEMPLATE via resolveVentureRoles()', () => {
    const baseRows = templateToBaseRows(STANDARD_VENTURE_TEMPLATE);
    const pins = baseRows.map((row) => ({ role_key: row.role_key, base_version: row.version, overlay_version: null }));
    const resolved = resolveVentureRoles(baseRows, [], pins, 'venture-1', STANDARD_VENTURE_TEMPLATE.budget_distribution);

    const vpStrategy = resolved.executives.find((e) => e.agent_role === 'VP_STRATEGY');
    expect(vpStrategy).toBeTruthy();
    expect(vpStrategy.tools).toContain('tam_calculator');

    expect(isToolGrantedForRole(vpStrategy, 'tam_calculator')).toBe(true);
    expect(isToolGrantedForRole(vpStrategy, 'a_tool_vp_strategy_was_never_granted')).toBe(false);
  });
});
