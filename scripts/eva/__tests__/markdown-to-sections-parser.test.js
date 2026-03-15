import { describe, it, expect } from 'vitest';
import { parseMarkdownToSections } from '../markdown-to-sections-parser.mjs';

describe('markdown-to-sections-parser auto-slug', () => {
  it('converts UI/UX Wireframes to ui_ux_wireframes (not uiux_wireframes)', () => {
    const md = `# Vision
## UI/UX Wireframes
Some wireframe content here that is relevant.
`;
    const sections = parseMarkdownToSections(md);
    const keys = Object.keys(sections);
    expect(keys).toContain('ui_ux_wireframes');
    expect(keys).not.toContain('uiux_wireframes');
  });

  it('converts R&D Strategy to r_d_strategy', () => {
    const md = `# Vision
## R&D Strategy
Research and development approach.
`;
    const sections = parseMarkdownToSections(md);
    const keys = Object.keys(sections);
    expect(keys).toContain('r_d_strategy');
  });

  it('handles standard headings via mapping', () => {
    const md = `# Vision
## Executive Summary
This is the executive summary content.
## Problem Statement
This is the problem statement content.
`;
    const sections = parseMarkdownToSections(md);
    expect(sections).toHaveProperty('executive_summary');
    expect(sections).toHaveProperty('problem_statement');
  });

  it('trims leading/trailing underscores from slugs', () => {
    const md = `# Vision
## --Special Heading--
Content here.
`;
    const sections = parseMarkdownToSections(md);
    const keys = Object.keys(sections);
    // Should not start or end with underscore
    for (const key of keys) {
      if (key === 'vision') continue;
      expect(key).not.toMatch(/^_|_$/);
    }
  });
});
