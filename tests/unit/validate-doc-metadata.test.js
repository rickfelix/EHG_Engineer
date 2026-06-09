/**
 * QF-20260609-811 — validate-doc-metadata parseFrontmatter Metadata-section terminator.
 *
 * Regression: the `## Metadata` section regex used `\Z` (a LITERAL "Z" in JS regex, not an
 * end anchor). With the non-greedy capture, any field value containing a Z (e.g.
 * `Category: CANONICALIZE`) truncated the section at that Z and all later fields were reported
 * MISSING. The fix uses `$` (no `m` flag) — the real end-of-input anchor. These tests pin that
 * a Z-bearing value no longer truncates, and that the section terminates correctly at the next
 * `##`, a `---`, or end-of-input.
 */
import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../scripts/validate-doc-metadata.js';

const mdSection = (extra = '') =>
  `# Some Doc\n\n## Metadata\n- **Category**: CANONICALIZE\n- **Status**: Approved\n- **Version**: 1.0.0\n- **Author**: Test\n- **Tags**: a, b${extra}`;

describe('QF-20260609-811: parseFrontmatter Metadata-section terminator', () => {
  it('does NOT truncate at a Z in a field value (CANONICALIZE) — all fields parsed (the regression)', () => {
    const r = parseFrontmatter(mdSection()); // section runs to EOF
    expect(r?.type).toBe('markdown');
    expect(r.metadata.Category).toBe('CANONICALIZE');
    expect(r.metadata.Status).toBe('Approved');
    expect(r.metadata.Version).toBe('1.0.0');
    expect(r.metadata.Author).toBe('Test');
    expect(r.metadata.Tags).toBe('a, b');
  });

  it('terminates at the next `##` heading (does not leak following content)', () => {
    const r = parseFrontmatter(mdSection('\n\n## Overview\n- **Category**: LEAKED\nbody text'));
    expect(r.metadata.Category).toBe('CANONICALIZE'); // not LEAKED
    expect(r.metadata.Tags).toBe('a, b');
    expect(r.raw).not.toContain('LEAKED');
  });

  it('terminates at a `---` horizontal rule', () => {
    const r = parseFrontmatter(mdSection('\n\n---\n- **Category**: BELOW_RULE'));
    expect(r.metadata.Category).toBe('CANONICALIZE');
    expect(r.metadata.Author).toBe('Test');
    expect(r.raw).not.toContain('BELOW_RULE');
  });

  it('terminates at end-of-input (no trailing terminator) with all fields', () => {
    const r = parseFrontmatter(mdSection());
    expect(Object.keys(r.metadata)).toEqual(['Category', 'Status', 'Version', 'Author', 'Tags']);
  });

  it('YAML frontmatter path still works (unaffected by the fix)', () => {
    const r = parseFrontmatter('---\nCategory: CANONICALIZE\nStatus: Approved\n---\n# Body');
    expect(r.type).toBe('yaml');
    expect(r.metadata.Category).toBe('CANONICALIZE');
    expect(r.metadata.Status).toBe('Approved');
  });
});
