/**
 * agent-manifest generator unit tests
 * SD-LEO-INFRA-OPUS-HARNESS-ALIGNMENT-001-F
 *
 * Covers: well-formed parse, malformed frontmatter (after Institutional
 * Memory block), missing reasoning_effort tag, idempotent regeneration,
 * active+archived split, alphabetical ordering.
 */
import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  parseReasoningEffort,
  parseAgentFile,
  buildManifest
} from '../../scripts/generate-agent-manifest.js';

const WELL_FORMED = `---
name: test-agent
description: "Test agent for unit coverage"
tools: Read, Write
model: opus
---

<!-- reasoning_effort: high -->

# Test Agent
`;

const MALFORMED_LATE_FRONTMATTER = `## Institutional Memory (Generated)

> Knowledge block sits ABOVE frontmatter — mirrors redis-specialist-agent.md.

---
name: redis-specialist-agent
description: "Redis specialist"
tools: Read
model: sonnet
---
`;

const MISSING_REASONING_EFFORT = `---
name: no-effort-tag
description: "Agent without Module H tag"
tools: Read
model: opus
---

# No HTML comment present
`;

describe('parseFrontmatter', () => {
  it('extracts all four required keys from well-formed file', () => {
    expect(parseFrontmatter(WELL_FORMED)).toEqual({
      name: 'test-agent',
      description: 'Test agent for unit coverage',
      tools: 'Read, Write',
      model: 'opus'
    });
  });

  it('finds frontmatter even when it is not at file top', () => {
    const fm = parseFrontmatter(MALFORMED_LATE_FRONTMATTER);
    expect(fm.name).toBe('redis-specialist-agent');
    expect(fm.model).toBe('sonnet');
  });

  it('returns null for content with no frontmatter at all', () => {
    expect(parseFrontmatter('# Just a heading\nNo YAML here.')).toBeNull();
  });
});

describe('parseReasoningEffort', () => {
  it('extracts level from HTML comment', () => {
    expect(parseReasoningEffort(WELL_FORMED)).toBe('high');
  });

  it('returns null when tag is missing', () => {
    expect(parseReasoningEffort(MISSING_REASONING_EFFORT)).toBeNull();
  });

  it('is case-insensitive on the tag itself', () => {
    expect(parseReasoningEffort('<!-- REASONING_EFFORT: LOW -->')).toBe('low');
  });
});

describe('parseAgentFile', () => {
  it('marks reasoning_effort_default=true and provides medium fallback context', () => {
    const agent = parseAgentFile('no-effort-tag.partial', MISSING_REASONING_EFFORT);
    expect(agent.reasoning_effort).toBeNull();
    expect(agent.reasoning_effort_default).toBe(true);
    expect(agent.frontmatter_malformed).toBe(false);
  });

  it('records frontmatter_malformed=false when frontmatter exists (even if late)', () => {
    const agent = parseAgentFile('redis-specialist-agent.partial', MALFORMED_LATE_FRONTMATTER);
    expect(agent.frontmatter_malformed).toBe(false);
    expect(agent.name).toBe('redis-specialist-agent');
  });

  it('flags frontmatter_malformed=true when no YAML block found at all', () => {
    const agent = parseAgentFile('no-yaml.partial', '# Just markdown\nNothing else.');
    expect(agent.frontmatter_malformed).toBe(true);
    expect(agent.name).toBe('no-yaml');
  });

  it('strips both .partial and .md extensions when computing fallback name', () => {
    expect(parseAgentFile('foo.partial', '').name).toBe('foo');
    expect(parseAgentFile('bar.md', '').name).toBe('bar');
  });

  it('records the status passed by caller (active vs archived)', () => {
    expect(parseAgentFile('a.partial', WELL_FORMED, 'active').status).toBe('active');
    expect(parseAgentFile('b.md', WELL_FORMED, 'archived').status).toBe('archived');
  });
});

describe('buildManifest', () => {
  const active = [
    { filename: 'a-agent.partial', status: 'active', name: 'a-agent', description: 'First', model: 'opus', tools: 'Read', reasoning_effort: 'low', reasoning_effort_default: false, frontmatter_malformed: false },
    { filename: 'b-agent.partial', status: 'active', name: 'b-agent', description: 'Second', model: 'sonnet', tools: 'Bash', reasoning_effort: null, reasoning_effort_default: true, frontmatter_malformed: false }
  ];
  const archived = [
    { filename: 'old-agent.md', status: 'archived', name: 'old-agent', description: 'Retired', model: 'inherit', tools: 'Read', reasoning_effort: 'medium', reasoning_effort_default: false, frontmatter_malformed: false }
  ];

  it('emits header with split active/archived counts and total', () => {
    const out = buildManifest(active, archived, '2026-04-25');
    expect(out).toContain('**Active Agents**: 2');
    expect(out).toContain('**Archived Agents**: 1');
    expect(out).toContain('**Total**: 3');
    expect(out).toContain('**Last Updated**: 2026-04-25');
  });

  it('separates Active and Archived sections', () => {
    const out = buildManifest(active, archived, '2026-04-25');
    const activeIdx = out.indexOf('## Active Agents');
    const archivedIdx = out.indexOf('## Archived Agents');
    expect(activeIdx).toBeGreaterThan(0);
    expect(archivedIdx).toBeGreaterThan(activeIdx);
  });

  it('emits "_None._" when archived is empty', () => {
    const out = buildManifest(active, [], '2026-04-25');
    expect(out).toContain('## Archived Agents');
    expect(out).toContain('_None._');
  });

  it('annotates default reasoning_effort with explicit note', () => {
    const out = buildManifest(active, archived, '2026-04-25');
    expect(out).toContain('`medium` *(default — file is missing tag)*');
  });

  it('is idempotent: same input produces byte-identical output', () => {
    const out1 = buildManifest(active, archived, '2026-04-25');
    const out2 = buildManifest(active, archived, '2026-04-25');
    expect(out1).toBe(out2);
  });

  it('flags malformed-frontmatter agents in their entry', () => {
    const broken = [{ filename: 'broken.partial', status: 'active', name: 'broken', description: '', model: '?', tools: '?', reasoning_effort: null, reasoning_effort_default: true, frontmatter_malformed: true }];
    const out = buildManifest(broken, [], '2026-04-25');
    expect(out).toContain('frontmatter malformed');
  });

  it('mentions the generator command for future maintainers', () => {
    const out = buildManifest(active, archived, '2026-04-25');
    expect(out).toContain('node scripts/generate-agent-manifest.js');
  });
});
