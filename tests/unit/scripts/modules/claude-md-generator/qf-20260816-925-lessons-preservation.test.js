/**
 * QF-20260816-925 — generate-claude-md-from-db.js re-snapshotted the live-mutating
 * "Recent Lessons (Last 30 Days)" section of CLAUDE_CORE.md on EVERY regeneration, so a PR
 * touching any UNRELATED leo_protocol_sections content still churned this section (racy
 * diffs/conflicts under fleet concurrency, since parallel workers regenerate at different
 * moments and each sees a different "last 30 days" set).
 *
 * Fix: generateCore() now prefers data.recentLessonsOverride (the existing on-disk block)
 * over a fresh live-table snapshot; CLAUDEMDGeneratorV3 populates that override by default
 * and only skips it when --refresh-lessons is passed.
 */
import { describe, it, expect } from 'vitest';

const { generateCore } = await import('../../../../../scripts/modules/claude-md-generator/file-generators.js');
const { extractExistingLessonsBlock, generateRecentLessonsSection } = await import('../../../../../scripts/modules/claude-md-generator/operational-sections.js');

function makeData(overrides = {}) {
  return {
    protocol: { version: '4.4.1', sections: [], generated_at: '2026-08-17', git_commit: 'abc1234' },
    agents: [{ name: 'LEAD', agent_code: 'LEAD', responsibilities: 'x', total_percentage: 100 }],
    subAgents: [],
    hotPatterns: [],
    knownFrictionPoints: [],
    recentRetrospectives: [
      { id: 'r1', sd_id: 'SD-FRESH-001', title: 'Fresh Retro', quality_score: 90, conducted_date: '2026-08-16' },
    ],
    gateHealth: [],
    pendingProposals: [],
    ...overrides,
  };
}
const fileMapping = { 'CLAUDE_CORE.md': { sections: [] } };

describe('extractExistingLessonsBlock', () => {
  it('extracts the block from its heading up to (not including) the next ## heading', () => {
    const fileContent = `# CLAUDE_CORE.md

## Gate Health Monitor

Some gate content.

## Recent Lessons (Last 30 Days)

**From Published Retrospectives** - Apply these learnings proactively.

### 1. Some Old Retro
Details here.

## Agent Responsibilities

LEAD: ...
`;
    const block = extractExistingLessonsBlock(fileContent);
    expect(block).toContain('## Recent Lessons (Last 30 Days)');
    expect(block).toContain('Some Old Retro');
    expect(block).not.toContain('Agent Responsibilities');
    expect(block).not.toContain('Gate Health Monitor');
  });

  it('returns null when the heading is absent (nothing to preserve)', () => {
    expect(extractExistingLessonsBlock('# CLAUDE_CORE.md\n\n## Agent Responsibilities\n')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(extractExistingLessonsBlock(null)).toBeNull();
    expect(extractExistingLessonsBlock(undefined)).toBeNull();
  });

  it('extracts to end-of-file when the heading is the last section (no trailing heading)', () => {
    const fileContent = '## Recent Lessons (Last 30 Days)\n\n### 1. Only Retro\nDetails.\n';
    const block = extractExistingLessonsBlock(fileContent);
    expect(block).toContain('Only Retro');
    expect(block.endsWith('Details.')).toBe(true); // trimEnd() removes trailing newline
  });
});

describe('generateCore — QF-20260816-925 override wiring', () => {
  it('without an override, renders a fresh lessons section from recentRetrospectives (unchanged default behavior)', () => {
    const data = makeData();
    const output = generateCore(data, fileMapping);
    expect(output).toContain('Fresh Retro');
  });

  it('with data.recentLessonsOverride set, uses it VERBATIM and ignores recentRetrospectives entirely', () => {
    const preservedBlock = '## Recent Lessons (Last 30 Days)\n\n### 1. Preserved Old Retro\nThis must survive untouched.';
    const data = makeData({ recentLessonsOverride: preservedBlock });
    const output = generateCore(data, fileMapping);

    expect(output).toContain('Preserved Old Retro');
    expect(output).not.toContain('Fresh Retro'); // the live recentRetrospectives data must NOT leak in
  });

  it('regenerating after an unrelated edit leaves the lessons block byte-identical (QF acceptance test)', () => {
    // Round 1: no override yet — renders fresh from whatever retrospectives existed then.
    const round1Data = makeData({
      recentRetrospectives: [{ id: 'r1', sd_id: 'SD-ORIGINAL-001', title: 'Original Retro', quality_score: 80, conducted_date: '2026-08-01' }],
    });
    const round1Output = generateCore(round1Data, fileMapping);
    const preservedBlock = extractExistingLessonsBlock(round1Output);
    expect(preservedBlock).toContain('Original Retro');

    // Round 2: simulates an UNRELATED section edit + a DIFFERENT live retrospectives
    // snapshot (as would happen under fleet concurrency), but the override (what a real
    // CLAUDEMDGeneratorV3.loadData() would extract from the on-disk file) is supplied.
    const round2Data = makeData({
      recentLessonsOverride: preservedBlock,
      recentRetrospectives: [{ id: 'r2', sd_id: 'SD-DIFFERENT-001', title: 'A Totally Different Retro', quality_score: 95, conducted_date: '2026-08-16' }],
    });
    const round2Output = generateCore(round2Data, fileMapping);
    const round2LessonsBlock = extractExistingLessonsBlock(round2Output);

    expect(round2LessonsBlock).toBe(preservedBlock); // byte-identical
    expect(round2Output).not.toContain('A Totally Different Retro');
  });

  it('sanity: generateRecentLessonsSection output is exactly what extractExistingLessonsBlock recovers from a full render', () => {
    const retros = [{ id: 'r1', sd_id: 'SD-X-001', title: 'X Retro', quality_score: 70, conducted_date: '2026-08-10' }];
    const rendered = generateRecentLessonsSection(retros);
    const data = makeData({ recentRetrospectives: retros });
    const output = generateCore(data, fileMapping);
    expect(extractExistingLessonsBlock(output)).toBe(rendered.trimEnd());
  });
});
