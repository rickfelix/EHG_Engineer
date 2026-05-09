// QF-20260509-AGENT-MD: findInjectionPoint must skip past YAML frontmatter
// before the H1 search and the no-H1 fallback. Without this, agents whose
// body has no H1 (stories-agent, risk-agent, uat-agent, redis-specialist)
// got the knowledge block prepended at offset 0 — BEFORE frontmatter —
// breaking Claude Code's agent registration.

import { describe, it, expect } from 'vitest';
import { findInjectionPoint } from '../../../scripts/generate-agent-md-from-db.js';

const FRONTMATTER = '---\nname: test-agent\ndescription: "x"\ntools: Bash\nmodel: sonnet\n---\n';

describe('QF-20260509-AGENT-MD: findInjectionPoint frontmatter awareness', () => {
  it('frontmatter + H1: injects after H1 paragraph', () => {
    const body = '\n# Title\nFirst para line\n\nSecond paragraph.\n';
    const content = FRONTMATTER + body;
    const idx = findInjectionPoint(content);
    // Must land AFTER the frontmatter (not at 0)
    expect(idx).toBeGreaterThanOrEqual(FRONTMATTER.length);
    // Must land at-or-after the blank line that ends the H1 paragraph
    const beforeIdx = content.substring(0, idx);
    expect(beforeIdx).toContain('# Title');
    expect(beforeIdx).toContain('First para line');
  });

  it('frontmatter + NO H1: injects RIGHT AFTER frontmatter (regression case)', () => {
    // This is the bug case from feedback d06b191d: stories-agent.partial,
    // risk-agent.partial, uat-agent.partial all start with `## Heading` not `# Heading`
    const body = '\n## Model Usage Tracking (Auto-Log)\n\nlog stuff\n';
    const content = FRONTMATTER + body;
    const idx = findInjectionPoint(content);
    // Must NOT be 0 (which would prepend BEFORE frontmatter — the original bug)
    expect(idx).not.toBe(0);
    // Must land exactly at the end of the frontmatter
    expect(idx).toBe(FRONTMATTER.length);
    // Verify everything before idx is the frontmatter
    expect(content.substring(0, idx)).toBe(FRONTMATTER);
  });

  it('no frontmatter + H1: existing behavior preserved (injects after H1 paragraph)', () => {
    const content = '\n# Title\nFirst line\n\nbody.\n';
    const idx = findInjectionPoint(content);
    expect(idx).toBeGreaterThan(0);
    expect(content.substring(0, idx)).toContain('# Title');
  });

  it('no frontmatter + no H1: injects at 0 (existing fallback)', () => {
    const content = '\n## Only H2\n\nno H1 here.\n';
    const idx = findInjectionPoint(content);
    expect(idx).toBe(0);
  });

  it('windows line endings (CRLF) frontmatter handled', () => {
    const fmCRLF = '---\r\nname: x\r\ndescription: "y"\r\ntools: Bash\r\nmodel: sonnet\r\n---\r\n';
    const body = '\n## H2 only\n\nbody.\n';
    const content = fmCRLF + body;
    const idx = findInjectionPoint(content);
    expect(idx).toBe(fmCRLF.length);
  });

  it('real fixture: stories-agent.partial-shaped content lands inside body', () => {
    // Simulates the exact pattern from .claude/agents/stories-agent.partial
    const partialContent = `---
name: stories-agent
description: "MUST BE USED PROACTIVELY for all user story context engineering sub-agent tasks. Trigger on keywords: user story, story, acceptance criteria, user journey."
tools: Bash, Read, Write
model: sonnet
---

<!-- reasoning_effort: medium -->

## Model Usage Tracking (Auto-Log)

**FIRST STEP**: Before doing any other work, log your model identity by running:
`;
    const idx = findInjectionPoint(partialContent);
    // Frontmatter ends at the first '---\n' followed by content; verify idx is AFTER it
    const fmEnd = partialContent.indexOf('---\n', 4) + 4;
    expect(idx).toBeGreaterThanOrEqual(fmEnd);
    // The character at idx must NOT be inside the frontmatter
    expect(partialContent.substring(0, idx)).toMatch(/^---[\s\S]+?---\r?\n?$/);
  });
});
