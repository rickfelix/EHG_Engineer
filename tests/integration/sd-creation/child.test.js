/**
 * E2E regression test — --child flag mode (hierarchical SD key generation).
 *
 * Covers: scripts/modules/sd-key-generator.js `generateChildKey` and
 * `generateGrandchildKey`. Asserts the LEO Protocol hierarchy encoding rules
 * AS IMPLEMENTED (verified 2026-04-23 against scripts/modules/sd-key-generator.js
 * getHierarchySuffix):
 *   - Root: SD-SOURCE-TYPE-SEMANTIC-NUM
 *   - Child: append "-LETTER" (WITH hyphen) — e.g. SD-...-001-A
 *   - Grandchild: append NUMBER to child suffix (NO hyphen) — e.g. SD-...-001-A1
 *   - Great-grandchild: dot notation — e.g. SD-...-001-A1.1
 *
 * NOTE: CLAUDE_LEAD.md documents a different format (no-hyphen child); this
 * test pins the ACTUAL code behavior so regression-breaking changes to
 * getHierarchySuffix are caught immediately. A separate follow-up should
 * reconcile the docs with the implementation.
 *
 * generateChildKey takes a NUMERIC index (0-based), not a letter — the
 * function internally maps index to HIERARCHY_LETTERS[i % 26].
 */

import { describe, it, expect, afterAll } from 'vitest';
import {
  generateSDKey,
  generateChildKey,
  generateGrandchildKey,
  parseSDKey,
} from '../../../scripts/modules/sd-key-generator.js';
import {
  credentialsPresent,
  newTestRunId,
  cleanup,
} from './fixtures/supabase-seed.js';

const testRunId = newTestRunId();
const skip = !credentialsPresent();

describe.skipIf(skip)('SD creation — --child mode (hierarchy encoding)', () => {
  afterAll(async () => {
    await cleanup(testRunId);
  });

  it('child key appends "-LETTER" to parent (with hyphen)', async () => {
    const parent = await generateSDKey({
      source: 'LEO',
      type: 'feature',
      title: `${testRunId} parent for child encoding`,
    });
    expect(parent).toMatch(/-\d{3}$/);

    // generateChildKey takes a numeric 0-based index
    const childA = generateChildKey(parent, 0);
    const childB = generateChildKey(parent, 1);

    expect(childA).toBe(`${parent}-A`);
    expect(childB).toBe(`${parent}-B`);
    expect(childA).toMatch(/-\d{3}-[A-Z]$/);
  });

  it('grandchild key appends a number directly to child suffix (no hyphen)', async () => {
    const parent = await generateSDKey({
      source: 'LEO',
      type: 'infrastructure',
      title: `${testRunId} parent for grandchild encoding`,
    });
    const child = generateChildKey(parent, 0); // "...001-A"
    const grandchild1 = generateGrandchildKey(child, 0);
    const grandchild2 = generateGrandchildKey(child, 1);

    // Per getHierarchySuffix: depth 2 returns `${index + 1}` (no separator)
    expect(grandchild1).toBe(`${child}1`);
    expect(grandchild2).toBe(`${child}2`);
    expect(grandchild1).toMatch(/-\d{3}-[A-Z]\d+$/);
  });

  it('parseSDKey returns the documented fields for a root key', async () => {
    const parent = await generateSDKey({
      source: 'LEO',
      type: 'bugfix',
      title: `${testRunId} parent for parse round-trip`,
    });

    const parsed = parseSDKey(parent);
    expect(parsed).toBeTruthy();
    expect(parsed.isRoot).toBe(true);
    expect(parsed.source).toBe('LEO');
    // number is an integer (not zero-padded string)
    expect(typeof parsed.number).toBe('number');
    expect(parsed.number).toBeGreaterThanOrEqual(1);
    expect(parsed.hierarchyDepth).toBe(0);
    expect(parsed.parentKey).toBeNull();
  });

  it('parseSDKey identifies a child key (hierarchyDepth=1, parentKey populated)', async () => {
    const parent = await generateSDKey({
      source: 'LEO',
      type: 'feature',
      title: `${testRunId} parent for child parse`,
    });
    const child = generateChildKey(parent, 2); // letter C

    const parsed = parseSDKey(child);
    expect(parsed).toBeTruthy();
    expect(parsed.isRoot).toBe(false);
    expect(parsed.hierarchyDepth).toBe(1);
    expect(parsed.parentKey).toBe(parent);
    expect(parsed.siblingIndex).toBe(2);
  });

  it('multiple child indices produce distinct, letter-ordered keys', async () => {
    const parent = await generateSDKey({
      source: 'LEO',
      type: 'feature',
      title: `${testRunId} parent for sibling ordering`,
    });
    const siblings = [0, 1, 2].map(i => generateChildKey(parent, i));
    expect(siblings).toEqual([`${parent}-A`, `${parent}-B`, `${parent}-C`]);
    expect(new Set(siblings).size).toBe(3);
  });
});
