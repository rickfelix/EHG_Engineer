// SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001 (FR-6): tests for the drift guard.
// Unit tier (no DB): exercises the PURE pieces — computeSectionDigests (the content-aware
// digest), diffSectionDigests (the comparison), renderFileContent (FR-5 banner), and the
// getFileSpecs single-source file list. The live-DB path (computeDrift) is covered by the
// SD's smoke_test_steps.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  CLAUDEMDGeneratorV3,
  KNOWN_GENERATED_FILES,
  computeSectionDigests,
  GENERATED_BANNER,
} from '../modules/claude-md-generator/index.js';

const require = createRequire(import.meta.url);
const { diffSectionDigests } = require(path.resolve(__dirname, '../check-claude-md-drift.cjs'));

const SECTIONS = [
  { id: 1, section_type: 'core_a', title: 'Core A', content: 'alpha', order_index: 1, target_file: 'CLAUDE_CORE.md', context_tier: 'CORE', updated_at: '2026-01-01' },
  { id: 2, section_type: 'lead_b', title: 'Lead B', content: 'beta', order_index: 2, target_file: 'CLAUDE_LEAD.md', context_tier: 'PHASE_LEAD', updated_at: '2026-01-01' },
];

describe('computeSectionDigests (FR-1 — content-aware, churn-immune)', () => {
  it('is deterministic for identical input (no false positive on re-run / timestamp churn)', () => {
    expect(computeSectionDigests(SECTIONS)).toEqual(computeSectionDigests(SECTIONS));
  });

  it('changes the per-section hash when section CONTENT changes (caught — unlike the coarse count hash)', () => {
    const a = computeSectionDigests(SECTIONS);
    const edited = SECTIONS.map((s) => (s.id === 1 ? { ...s, content: 'ALPHA-edited' } : s));
    const b = computeSectionDigests(edited);
    expect(b.byId['1']).not.toBe(a.byId['1']);
    expect(b.byId['2']).toBe(a.byId['2']); // untouched section stays stable
    expect(b.global).not.toBe(a.global);
  });

  it('IGNORES non-rendered fields (updated_at/created_at/context_tier/target_file column) — no false-positive drift', () => {
    // context_tier and the target_file COLUMN are not rendered (placement is keyed off
    // section_type via the mapping), so changing them must NOT register as drift.
    const a = computeSectionDigests(SECTIONS);
    const churned = SECTIONS.map((s) => ({ ...s, updated_at: '2099-12-31', created_at: 'whenever', context_tier: 'TOTALLY-DIFFERENT', target_file: 'CLAUDE_ELSEWHERE.md' }));
    const b = computeSectionDigests(churned);
    expect(b.byId).toEqual(a.byId); // content digests unchanged
    expect(b.global).toBe(a.global); // render-order signature unchanged
  });

  it('DOES change the per-section hash when order_index changes (order is rendered)', () => {
    const a = computeSectionDigests(SECTIONS);
    const b = computeSectionDigests(SECTIONS.map((s) => (s.id === 1 ? { ...s, order_index: 99 } : s)));
    expect(b.byId['1']).not.toBe(a.byId['1']);
  });

  it('flips the global hash on a PURE REORDER (same content, swapped render order)', () => {
    const a = computeSectionDigests(SECTIONS); // order [1,2]
    const b = computeSectionDigests([SECTIONS[1], SECTIONS[0]]); // order [2,1], identical content
    expect(b.byId).toEqual(a.byId); // per-section content unchanged
    expect(b.global).not.toBe(a.global); // but the render-order signature changed
  });

  it('records target_file + title in meta for stale-file attribution', () => {
    const d = computeSectionDigests(SECTIONS);
    expect(d.meta['1'].target_file).toBe('CLAUDE_CORE.md');
    expect(d.meta['1'].title).toBe('Core A');
  });

  it('handles empty / null sections without throwing', () => {
    expect(() => computeSectionDigests([])).not.toThrow();
    expect(() => computeSectionDigests(null)).not.toThrow();
    expect(computeSectionDigests([]).byId).toEqual({});
  });
});

describe('diffSectionDigests (FR-1 — pure comparison)', () => {
  it('reports NO drift when live === stored (clean)', () => {
    const d = computeSectionDigests(SECTIONS);
    const r = diffSectionDigests(d, d);
    expect(r.drift).toBe(false);
    expect(r.changed).toHaveLength(0);
    expect(r.added).toHaveLength(0);
    expect(r.removed).toHaveLength(0);
    expect(r.globalMatch).toBe(true);
  });

  it('flags a PURE REORDER as drift via globalMatch (the FR-1 false-negative the review caught)', () => {
    const stored = computeSectionDigests(SECTIONS); // order [1,2]
    const live = computeSectionDigests([SECTIONS[1], SECTIONS[0]]); // order [2,1], same content
    const r = diffSectionDigests(live, stored);
    expect(r.changed).toHaveLength(0);
    expect(r.added).toHaveLength(0);
    expect(r.removed).toHaveLength(0);
    expect(r.globalMatch).toBe(false);
    expect(r.orderChanged).toBe(true);
    expect(r.drift).toBe(true); // reorder IS drift
  });

  it('detects changed + added + removed and names the stale files', () => {
    const stored = computeSectionDigests(SECTIONS);
    const live = computeSectionDigests([
      { ...SECTIONS[0], content: 'edited' }, // #1 changed
      // #2 dropped -> removed
      { id: 3, section_type: 'exec_c', title: 'Exec C', content: 'gamma', order_index: 3, target_file: 'CLAUDE_EXEC.md', context_tier: 'PHASE_EXEC' }, // #3 added
    ]);
    const r = diffSectionDigests(live, stored);
    expect(r.drift).toBe(true);
    expect(r.changed.map((c) => c.id)).toEqual(['1']);
    expect(r.added.map((c) => c.id)).toEqual(['3']);
    expect(r.removed.map((c) => c.id)).toEqual(['2']);
    expect(r.staleFiles).toEqual(expect.arrayContaining(['CLAUDE_CORE.md', 'CLAUDE_EXEC.md', 'CLAUDE_LEAD.md']));
  });
});

describe('CLAUDEMDGeneratorV3.renderFileContent (FR-5 banner + FR-1b shared render path)', () => {
  const gen = new CLAUDEMDGeneratorV3(null, '/tmp', '/tmp/section-file-mapping.json', {});

  it('injects the GENERATED DO-NOT-EDIT banner and a real file_content_hash', () => {
    const out = gen.renderFileContent(() => '# Heading\nbody', {});
    expect(out).toContain('GENERATED FILE - DO NOT EDIT DIRECTLY');
    expect(out).toMatch(/<!-- file_content_hash: [0-9a-f]{16} -->/);
  });

  it('does NOT double the banner when content already starts with it (idempotent)', () => {
    const out = gen.renderFileContent(() => `${GENERATED_BANNER}\n# Heading\nbody`, {});
    const count = (out.match(/GENERATED FILE - DO NOT EDIT DIRECTLY/g) || []).length;
    expect(count).toBe(1);
  });

  it('is deterministic for identical content (no timestamp in the render path => no drift false-positive)', () => {
    const fn = () => '# Heading\nstable body';
    expect(gen.renderFileContent(fn, {})).toBe(gen.renderFileContent(fn, {}));
  });
});

describe('getFileSpecs single-source list (FR-1b — write path == render path coverage)', () => {
  it('returns EXACTLY KNOWN_GENERATED_FILES when digests enabled (guards a forgotten file)', () => {
    const gen = new CLAUDEMDGeneratorV3(null, '/tmp', '/tmp/section-file-mapping.json', { generateDigest: true });
    const names = gen.getFileSpecs({}).map(([f]) => f);
    expect(new Set(names)).toEqual(new Set(KNOWN_GENERATED_FILES));
    expect(names).toHaveLength(KNOWN_GENERATED_FILES.length);
  });

  it('omits digest files when generateDigest is false', () => {
    const gen = new CLAUDEMDGeneratorV3(null, '/tmp', '/tmp/section-file-mapping.json', { generateDigest: false });
    const names = gen.getFileSpecs({}).map(([f]) => f);
    expect(names.every((n) => !n.includes('DIGEST'))).toBe(true);
    expect(names).toContain('CLAUDE.md');
  });
});
