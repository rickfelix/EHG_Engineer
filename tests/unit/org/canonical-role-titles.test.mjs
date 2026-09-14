/**
 * SD-LEO-INFRA-STOP-ORG-ROLE-001: lib/org/canonical-role-titles.mjs's derivation must
 * always produce a title-cased, venture-agnostic string -- never anything containing the
 * literal "{venture_name}" template placeholder, and never anything that could plausibly
 * be mistaken for a per-venture name.
 */
import { describe, it, expect } from 'vitest';
import { computeCanonicalRoleTitles } from '../../../lib/org/canonical-role-titles.mjs';
import { STANDARD_VENTURE_TEMPLATE, EHG_SHARED_OPERATORS } from '../../../lib/agents/venture-ceo-factory.js';

describe('computeCanonicalRoleTitles', () => {
  const titles = computeCanonicalRoleTitles();

  it('covers exactly the CEO + executives + crews + shared operators role count', () => {
    const expectedCount =
      1 + STANDARD_VENTURE_TEMPLATE.executives.length + STANDARD_VENTURE_TEMPLATE.crews.length + EHG_SHARED_OPERATORS.length;
    expect(titles.size).toBe(expectedCount);
  });

  it('derives the CEO title by stripping the venture-name placeholder', () => {
    expect(titles.get('VENTURE_CEO')).toBe('CEO');
  });

  it('derives each VP title the same way, matching every entry in STANDARD_VENTURE_TEMPLATE.executives', () => {
    for (const exec of STANDARD_VENTURE_TEMPLATE.executives) {
      const expected = exec.display_name_template.replace('{venture_name}', '').trim();
      expect(titles.get(exec.agent_role.toUpperCase())).toBe(expected);
    }
  });

  it('derives each crew title as its role_key with underscores replaced by spaces (no venture prefix)', () => {
    for (const crew of STANDARD_VENTURE_TEMPLATE.crews) {
      expect(titles.get(crew.agent_role.toUpperCase())).toBe(crew.agent_role.replace(/_/g, ' '));
    }
  });

  it('uses each shared operator display_name verbatim (already venture-agnostic)', () => {
    for (const operator of EHG_SHARED_OPERATORS) {
      expect(titles.get(operator.agent_role.toUpperCase())).toBe(operator.display_name);
    }
  });

  it('no title contains the unresolved "{venture_name}" placeholder', () => {
    for (const title of titles.values()) {
      expect(title).not.toContain('{venture_name}');
    }
  });

  it('every title is a non-empty, trimmed string', () => {
    for (const [roleKey, title] of titles) {
      expect(title.length, `role ${roleKey} has an empty title`).toBeGreaterThan(0);
      expect(title, `role ${roleKey}'s title has leading/trailing whitespace`).toBe(title.trim());
    }
  });
});
