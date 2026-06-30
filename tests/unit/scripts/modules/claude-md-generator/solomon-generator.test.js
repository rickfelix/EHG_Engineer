/**
 * SD-LEO-INFRA-SOLOMON-CONSULT-001E-B — Solomon generator pipeline unit tests.
 *
 * Validates:
 *  - FR-1: generateSolomon fallback (missing section never throws)
 *  - FR-2: generateSolomonDigest fallback (missing section never throws)
 *  - FR-3: KNOWN_GENERATED_FILES membership for both Solomon files
 *  - FR-6: retry-state-manager EXEMPT_PATTERNS — inbox exempt, send/request NOT exempt
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Use dynamic import for ESM modules
const { generateSolomon } = await import('../../../../../scripts/modules/claude-md-generator/file-generators.js');
const { generateSolomonDigest } = await import('../../../../../scripts/modules/claude-md-generator/digest-generators.js');
const { KNOWN_GENERATED_FILES } = await import('../../../../../scripts/modules/claude-md-generator/index.js');
const { isExempt } = require('../../../../../scripts/hooks/retry-state-manager.cjs');

// Minimal protocol stub (mirrors the shape used in existing generator tests)
function makeData(sections = []) {
  return {
    protocol: {
      version: '4.4.1',
      sections,
      generated_at: '2026-06-30',
      git_commit: 'abc1234',
    },
  };
}

// Minimal file mapping with CLAUDE_SOLOMON.md entry
const fileMapping = {
  'CLAUDE_SOLOMON.md': { sections: ['solomon_role_contract'] },
};
const digestMapping = {
  'CLAUDE_SOLOMON_DIGEST.md': { sections: ['solomon_role_contract'] },
};
const digestMetadata = { generatedAt: '2026-06-30', gitCommit: 'abc1234', dbSnapshotHash: 'aabbccdd' };

// ──────────────────────────────────────────────────────────────────────────────

describe('FR-1: generateSolomon()', () => {
  it('returns fallback header string when solomon_role_contract section is absent — never throws', () => {
    const result = generateSolomon(makeData([]), fileMapping);
    expect(typeof result).toBe('string');
    expect(result).toContain('CLAUDE_SOLOMON.md');
    expect(result).toContain('solomon_role_contract section not yet seeded');
  });

  it('returns formatted content when solomon_role_contract section is present', () => {
    const sections = [{
      id: 611,
      section_type: 'solomon_role_contract',
      target_file: 'CLAUDE_SOLOMON.md',
      order_index: 2640,
      title: 'Solomon Role Contract',
      content: '## Solomon Role Contract\n\nTest oracle content.',
    }];
    const result = generateSolomon(makeData(sections), fileMapping);
    expect(result).toContain('CLAUDE_SOLOMON.md');
    expect(result).toContain('Solomon Role Contract');
    expect(result).toContain('Test oracle content.');
    expect(result).not.toContain('section not yet seeded');
  });

  it('does not throw when called with an empty data object', () => {
    expect(() => generateSolomon(makeData([]), fileMapping)).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('FR-2: generateSolomonDigest()', () => {
  it('returns fallback string when solomon_role_contract section is absent — never throws', () => {
    const result = generateSolomonDigest(makeData([]), digestMapping, digestMetadata);
    expect(typeof result).toBe('string');
    expect(result).toContain('CLAUDE_SOLOMON_DIGEST.md');
    expect(result).toContain('section not yet seeded');
  });

  it('returns formatted digest content when section is present', () => {
    const sections = [{
      id: 611,
      section_type: 'solomon_role_contract',
      target_file: 'CLAUDE_SOLOMON.md',
      order_index: 2640,
      title: 'Solomon Role Contract',
      content: '## Solomon Role Contract\n\nOracle digest content.',
    }];
    const result = generateSolomonDigest(makeData(sections), digestMapping, digestMetadata);
    expect(result).toContain('CLAUDE_SOLOMON_DIGEST.md');
    expect(result).toContain('CLAUDE_SOLOMON.md');
    expect(result).toContain('Oracle digest content.');
  });

  it('includes full-load instructions referencing CLAUDE_SOLOMON.md', () => {
    const result = generateSolomonDigest(makeData([]), digestMapping, digestMetadata);
    expect(result).toContain('CLAUDE_SOLOMON.md');
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('FR-3: KNOWN_GENERATED_FILES', () => {
  it('includes CLAUDE_SOLOMON.md', () => {
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_SOLOMON.md');
  });

  it('includes CLAUDE_SOLOMON_DIGEST.md', () => {
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_SOLOMON_DIGEST.md');
  });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('FR-6: retry-state-manager EXEMPT_PATTERNS — solomon-advisory.cjs', () => {
  it('exempts solomon-advisory.cjs inbox', () => {
    expect(isExempt('node scripts/solomon-advisory.cjs inbox')).toBe(true);
    expect(isExempt('node scripts\\solomon-advisory.cjs inbox')).toBe(true); // windows sep
    expect(isExempt('node scripts/solomon-advisory.cjs inbox --verbose')).toBe(true);
  });

  it('does NOT exempt solomon-advisory.cjs send (answer path not exempt)', () => {
    expect(isExempt('node scripts/solomon-advisory.cjs send')).toBe(false);
  });

  it('does NOT exempt solomon-advisory.cjs request (answer path not exempt)', () => {
    expect(isExempt('node scripts/solomon-advisory.cjs request "some question"')).toBe(false);
  });

  it('does NOT exempt a bare solomon-advisory.cjs without subcommand', () => {
    expect(isExempt('node scripts/solomon-advisory.cjs')).toBe(false);
  });
});
