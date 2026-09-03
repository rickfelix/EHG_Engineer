/**
 * QF-20260902-053 — generate-claude-md-from-db.js baked LIVE data (issue_patterns
 * occurrence_count, SELF-IDENTIFY feedback rows) into CLAUDE_CORE.md's "Hot Issue Patterns"
 * and "Known Friction Points" sections, so a generated contract was not a deterministic
 * function of leo_protocol_sections and every regen churned the committed doc (Solomon ruling
 * c5d4390b, audit fe547112 W1/W2 class).
 *
 * Fix: generalizes the QF-20260816-925 pattern (extractExistingSectionBlock +
 * data.<section>Override) already used for Recent Lessons to these two sections.
 */
import { describe, it, expect } from 'vitest';

const { generateCore } = await import('../../../../../scripts/modules/claude-md-generator/file-generators.js');
const {
  extractExistingHotPatternsBlock,
  extractExistingFrictionPointsBlock,
  generateHotPatternsSection,
  generateKnownFrictionPointsSection,
} = await import('../../../../../scripts/modules/claude-md-generator/operational-sections.js');
const { CLAUDEMDGeneratorV3 } = await import('../../../../../scripts/modules/claude-md-generator/index.js');

function makeData(overrides = {}) {
  return {
    protocol: { version: '4.4.1', sections: [], generated_at: '2026-08-17', git_commit: 'abc1234' },
    agents: [{ name: 'LEAD', agent_code: 'LEAD', responsibilities: 'x', total_percentage: 100 }],
    subAgents: [],
    hotPatterns: [],
    knownFrictionPoints: [],
    recentRetrospectives: [],
    gateHealth: [],
    pendingProposals: [],
    ...overrides,
  };
}
const fileMapping = { 'CLAUDE_CORE.md': { sections: [] } };

const PATTERNS = [
  { pattern_id: 'PAT-AUTO-123', category: 'testing', severity: 'medium', occurrence_count: 8, trend: 'stable', proven_solutions: [] },
];
const FRICTION_ROWS = [
  { title: 'SELF-IDENTIFY: I am idle but see 11 claimable item(s)', severity: 'low', metadata: { signal_type: 'feedback', contributing_workers: ['a', 'b', 'c'] } },
];

describe('extractExistingHotPatternsBlock / extractExistingFrictionPointsBlock', () => {
  it('extracts each block up to (not including) the next ## heading', () => {
    const fileContent = `# CLAUDE_CORE.md

## Hot Issue Patterns (Auto-Updated)

| Pattern ID | Category |
|---|---|
| PAT-AUTO-123 | testing |

## Known Friction Points

| Signal Type | Workers |
|---|---|
| feedback | 3 |

## Agent Responsibilities
`;
    const hot = extractExistingHotPatternsBlock(fileContent);
    expect(hot).toContain('## Hot Issue Patterns (Auto-Updated)');
    expect(hot).toContain('PAT-AUTO-123');
    expect(hot).not.toContain('Known Friction Points');

    const friction = extractExistingFrictionPointsBlock(fileContent);
    expect(friction).toContain('## Known Friction Points');
    expect(friction).not.toContain('Agent Responsibilities');
    expect(friction).not.toContain('PAT-AUTO-123');
  });

  it('returns null when the heading is absent (nothing to preserve)', () => {
    expect(extractExistingHotPatternsBlock('# CLAUDE_CORE.md\n\n## Agent Responsibilities\n')).toBeNull();
    expect(extractExistingFrictionPointsBlock('# CLAUDE_CORE.md\n\n## Agent Responsibilities\n')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(extractExistingHotPatternsBlock(null)).toBeNull();
    expect(extractExistingFrictionPointsBlock(undefined)).toBeNull();
  });
});

describe('generateCore — QF-20260902-053 override wiring', () => {
  it('without an override, renders fresh sections from live patterns/friction rows (unchanged default behavior)', () => {
    const data = makeData({ hotPatterns: PATTERNS, knownFrictionPoints: FRICTION_ROWS });
    const output = generateCore(data, fileMapping);
    expect(output).toContain('PAT-AUTO-123');
    expect(output).toContain('SELF-IDENTIFY');
  });

  it('with overrides set, uses them VERBATIM and ignores the live arrays entirely', () => {
    const hotOverride = '## Hot Issue Patterns (Auto-Updated)\n\n| Pattern ID |\n|---|\n| PAT-PRESERVED-001 |';
    const frictionOverride = '## Known Friction Points\n\n| Signal Type |\n|---|\n| preserved-signal |';
    const data = makeData({
      hotPatterns: PATTERNS,
      knownFrictionPoints: FRICTION_ROWS,
      hotPatternsOverride: hotOverride,
      knownFrictionPointsOverride: frictionOverride,
    });
    const output = generateCore(data, fileMapping);

    expect(output).toContain('PAT-PRESERVED-001');
    expect(output).not.toContain('PAT-AUTO-123');
    expect(output).toContain('preserved-signal');
    expect(output).not.toContain('SELF-IDENTIFY');
  });

  it('regenerating after an unrelated edit + a DIFFERENT live snapshot leaves both blocks byte-identical (QF acceptance test)', () => {
    // Round 1: no override yet — renders fresh from whatever live rows existed then.
    const round1Data = makeData({ hotPatterns: PATTERNS, knownFrictionPoints: FRICTION_ROWS });
    const round1Output = generateCore(round1Data, fileMapping);
    const preservedHot = extractExistingHotPatternsBlock(round1Output);
    const preservedFriction = extractExistingFrictionPointsBlock(round1Output);
    expect(preservedHot).toContain('PAT-AUTO-123');
    expect(preservedFriction).toContain('SELF-IDENTIFY');

    // Round 2: simulates fleet concurrency — occurrence_count bumped 8->9, a NEW
    // SELF-IDENTIFY row crossed the 3-worker threshold — but the overrides (what a real
    // CLAUDEMDGeneratorV3.loadData() would extract from the on-disk file) are supplied.
    const round2Data = makeData({
      hotPatternsOverride: preservedHot,
      knownFrictionPointsOverride: preservedFriction,
      hotPatterns: [{ ...PATTERNS[0], occurrence_count: 9 }],
      knownFrictionPoints: [{ title: 'SELF-IDENTIFY: I am idle but see 12 claimable item(s)', severity: 'low', metadata: { signal_type: 'feedback', contributing_workers: ['a', 'b', 'c', 'd'] } }],
    });
    const round2Output = generateCore(round2Data, fileMapping);

    expect(extractExistingHotPatternsBlock(round2Output)).toBe(preservedHot);
    expect(extractExistingFrictionPointsBlock(round2Output)).toBe(preservedFriction);
    expect(round2Output).not.toContain('12 claimable');
  });

  it('sanity: generator output for each section is exactly what its extractor recovers from a full render', () => {
    const hotRendered = generateHotPatternsSection(PATTERNS);
    const frictionRendered = generateKnownFrictionPointsSection(FRICTION_ROWS);
    const data = makeData({ hotPatterns: PATTERNS, knownFrictionPoints: FRICTION_ROWS });
    const output = generateCore(data, fileMapping);
    expect(extractExistingHotPatternsBlock(output)).toBe(hotRendered.trimEnd());
    expect(extractExistingFrictionPointsBlock(output)).toBe(frictionRendered.trimEnd());
  });
});

describe('CLAUDEMDGeneratorV3.computeDbSnapshotHash — QF-20260902-053 override wiring', () => {
  it('stays IDENTICAL across two calls with the same overrides but DIFFERENT live arrays', () => {
    const gen = new CLAUDEMDGeneratorV3({}, '/tmp/unused', '/tmp/unused.json', {});
    const hotOverride = '## Hot Issue Patterns (Auto-Updated)\n\nPreserved.';
    const frictionOverride = '## Known Friction Points\n\nPreserved.';
    const baseData = { protocol: { id: 'p1', version: '4.4.1', sections: [] }, subAgents: [] };

    const hashA = gen.computeDbSnapshotHash({
      ...baseData,
      hotPatternsOverride: hotOverride,
      knownFrictionPointsOverride: frictionOverride,
      hotPatterns: [{ pattern_id: 'A', occurrence_count: 1 }],
      knownFrictionPoints: [{ title: 'A' }],
    });
    const hashB = gen.computeDbSnapshotHash({
      ...baseData,
      hotPatternsOverride: hotOverride,
      knownFrictionPointsOverride: frictionOverride,
      hotPatterns: [{ pattern_id: 'B', occurrence_count: 99 }],
      knownFrictionPoints: [{ title: 'B' }, { title: 'C' }],
    });
    expect(hashA).toBe(hashB);
  });

  it('DOES change when an override itself changes (a real --refresh-lessons snapshot)', () => {
    const gen = new CLAUDEMDGeneratorV3({}, '/tmp/unused', '/tmp/unused.json', {});
    const baseData = { protocol: { id: 'p1', version: '4.4.1', sections: [] }, subAgents: [] };

    const hashA = gen.computeDbSnapshotHash({ ...baseData, hotPatternsOverride: '## Hot Issue Patterns (Auto-Updated)\n\nOld.' });
    const hashB = gen.computeDbSnapshotHash({ ...baseData, hotPatternsOverride: '## Hot Issue Patterns (Auto-Updated)\n\nNew.' });
    expect(hashA).not.toBe(hashB);
  });
});
