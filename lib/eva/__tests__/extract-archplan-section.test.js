/**
 * Unit tests for lib/eva/extract-archplan-section.js
 *
 * SD: SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001 / FR-B
 * Covers TS-2 + TS-11 + edge cases per PLAN TESTING agent.
 */
import { describe, it, expect } from 'vitest';
import { extractArchPlanSection } from '../extract-archplan-section.js';

describe('extractArchPlanSection', () => {
  it('finds canonical "## Architectural Plan" heading and returns body', () => {
    const content = `# Vision\n\n## Problem Statement\nbody\n\n## Architectural Plan\n\nThis is the arch body line one with enough characters here.\nLine two with more content added.\n\n## Next Section\nignored\n`;
    const result = extractArchPlanSection(content);
    expect(result.found).toBe(true);
    expect(result.heading_text).toMatch(/Architectural Plan/);
    expect(result.content).toMatch(/arch body line one/);
    expect(result.content).not.toMatch(/Next Section/);
    expect(result.content).not.toMatch(/Problem Statement/);
  });

  it('accepts "### Architectural Plan" (H3 variant)', () => {
    const content = `## Outer\n\n### Architectural Plan\n\nH3 arch body present here with enough characters to clear the body min threshold easily.\n`;
    const result = extractArchPlanSection(content);
    expect(result.found).toBe(true);
    expect(result.heading_text).toMatch(/^###/);
  });

  it('accepts "## Architecture Plan" (no -al suffix variant)', () => {
    const content = `## Architecture Plan\n\nbody body body body body body body body body body body body body body\n`;
    const result = extractArchPlanSection(content);
    expect(result.found).toBe(true);
  });

  it('TS-2: returns found=false when no canonical heading exists', () => {
    const content = `# Vision\n\n## Problem\nstuff\n\n## Solution\nmore stuff\n`;
    const result = extractArchPlanSection(content);
    expect(result.found).toBe(false);
    expect(result.content).toBeNull();
    expect(result.heading_line_number).toBeNull();
  });

  it('TS-11: returns false on null/empty content without throwing', () => {
    expect(extractArchPlanSection(null).found).toBe(false);
    expect(extractArchPlanSection('').found).toBe(false);
    expect(extractArchPlanSection(undefined).found).toBe(false);
  });

  it('TS-11: returns false when body shorter than minBodyChars', () => {
    const content = `## Architectural Plan\n\nhi\n`;
    const result = extractArchPlanSection(content);
    expect(result.found).toBe(false);
    expect(result.heading_line_number).not.toBeNull(); // heading found but body too short
  });

  it('respects custom minBodyChars threshold', () => {
    const content = `## Architectural Plan\n\nhi\n`;
    const result = extractArchPlanSection(content, { minBodyChars: 1 });
    expect(result.found).toBe(true);
    expect(result.content).toBe('hi');
  });

  it('stops body extraction at same-or-shallower depth heading', () => {
    const content = `## Architectural Plan\n\nfirst paragraph more than fifty chars total here yes ok.\n### Sub-section under arch\nsub body\n\n## Different Top-Level\nnot included\n`;
    const result = extractArchPlanSection(content);
    expect(result.found).toBe(true);
    expect(result.content).toMatch(/Sub-section under arch/);
    expect(result.content).toMatch(/sub body/);
    expect(result.content).not.toMatch(/Different Top-Level/);
    expect(result.content).not.toMatch(/not included/);
  });

  it('TS-11 unicode: handles unicode body characters', () => {
    const content = `## Architectural Plan\n\nUnicode body — 中文 emoji 🎯 enough length here for body min.\n`;
    const result = extractArchPlanSection(content);
    expect(result.found).toBe(true);
    expect(result.content).toMatch(/🎯/);
  });

  it('TS-11 trailing whitespace: trims leading/trailing blank lines from body', () => {
    const content = `## Architectural Plan\n\n\n\nbody line one with content padding here please here.\n\n\n`;
    const result = extractArchPlanSection(content);
    expect(result.found).toBe(true);
    expect(result.content.startsWith('body')).toBe(true);
    expect(result.content.endsWith('here please here.')).toBe(true);
  });

  it('TS-11 EOF-no-body: heading at end with no body returns false', () => {
    const content = `## Other\nstuff\n## Architectural Plan\n`;
    const result = extractArchPlanSection(content);
    expect(result.found).toBe(false);
    expect(result.heading_line_number).toBe(3);
  });

  it('TS-11 duplicate headings: first match wins and second body is NOT included', () => {
    const content = `## Architectural Plan\n\nfirst body line that is more than 50 characters long total content here.\n\n## Architectural Plan\n\nsecond body would not be selected\n`;
    const result = extractArchPlanSection(content);
    expect(result.found).toBe(true);
    expect(result.content).toMatch(/first body line/);
    // Second heading is same-depth — body extraction stops there. Implementation
    // takes the FIRST canonical match and stops at the next same-or-shallower heading.
    expect(result.content).not.toMatch(/second body/);
  });

  it('records 1-indexed heading_line_number', () => {
    const content = `line1\nline2\n## Architectural Plan\n\nbody content padding more text added so it passes min char threshold.\n`;
    const result = extractArchPlanSection(content);
    expect(result.heading_line_number).toBe(3);
  });
});
