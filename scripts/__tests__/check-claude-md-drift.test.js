// SD-LEO-INFRA-PROTOCOL-DOC-DRIFT-GUARD-001 (FR-6): tests for the drift guard.
// Unit tier (no DB): exercises the PURE pieces — computeSectionDigests (the content-aware
// digest), diffSectionDigests (the comparison), renderFileContent (FR-5 banner), and the
// getFileSpecs single-source file list. The live-DB path (computeDrift) is covered by the
// SD's smoke_test_steps.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  CLAUDEMDGeneratorV3,
  KNOWN_GENERATED_FILES,
  computeSectionDigests,
  GENERATED_BANNER,
  verifyFileContentHash,
} from '../modules/claude-md-generator/index.js';

const sha16 = (s) => crypto.createHash('sha256').update(s).digest('hex').substring(0, 16);

const require = createRequire(import.meta.url);
const { diffSectionDigests, findOrphanFiles } = require(path.resolve(__dirname, '../check-claude-md-drift.cjs'));

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

describe('findOrphanFiles (SD-LEO-INFRA-SOLOMON-ROLE-CONTRACT-001 FR-5 — hand-edited/orphan content detection)', () => {
  // diffSectionDigests/computeSectionDigests above can only ever compare DB-live vs manifest-stored
  // digests, both derived FROM THE DB — a hand-edit to a generated file's on-disk body, with no
  // corresponding leo_protocol_sections change, is invisible to that comparison (the exact
  // 2026-08-21 DECISION_REQUESTED incident: a hand-edit silently dropped by the next regeneration).
  // findOrphanFiles reuses verifyFileContentHash (unit-tested for mutation-detection in
  // tests/unit/protocol-publication-pipeline.test.js:84) against each KNOWN_GENERATED_FILES entry.

  it('is pure and injectable — a stubbed verify fn needs no real filesystem', () => {
    const orphans = findOrphanFiles(['a.md', 'b.md'], {
      baseDir: '/does/not/exist',
      verify: () => ({ ok: false, expected: 'ee', actual: 'aa' }),
    });
    // baseDir does not exist, so fs.existsSync gates every candidate out before verify() is ever
    // consulted — proves the "skip files not present on disk" guard fires before the real check.
    expect(orphans).toEqual([]);
  });

  it('flags a file whose verify() reports ok:false, carrying expected/actual for the report', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-find-'));
    try {
      fs.writeFileSync(path.join(dir, 'stale.md'), 'anything — verify() below is stubbed');
      const orphans = findOrphanFiles(['stale.md'], {
        baseDir: dir,
        verify: () => ({ ok: false, expected: 'ee', actual: 'aa' }),
      });
      expect(orphans).toEqual([{ file: 'stale.md', expected: 'ee', actual: 'aa' }]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not flag a file whose verify() reports ok:true', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-find-'));
    try {
      fs.writeFileSync(path.join(dir, 'fine.md'), 'anything — verify() below is stubbed');
      const orphans = findOrphanFiles(['fine.md'], { baseDir: dir, verify: () => ({ ok: true, expected: 'ee', actual: 'ee' }) });
      expect(orphans).toEqual([]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  // TS-5 (PRD test scenario): the end-to-end seed/negative test, wired through the REAL
  // verifyFileContentHash — proving the actual production check catches a hand-edit, not just a
  // stub. Runs against a TEMPORARY COPY, never the tracked repo file (a mid-test failure leaving a
  // dirty tracked file breaks shared-root freshness / tree-currency spawn guards fleet-wide).
  it('TS-5: catches a real hand-edit via the production verifyFileContentHash, on a temp copy only', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-ts5-'));
    try {
      const body = '# CLAUDE_SOLOMON.md (temp copy)\nsome duty text\n';
      const file = path.join(dir, 'CLAUDE_SOLOMON.md');
      // A clean, freshly-"generated" file: header hash matches the body — verifyFileContentHash
      // passes, so findOrphanFiles must NOT flag it.
      fs.writeFileSync(file, `<!-- file_content_hash: ${sha16(body)} -->\n${body}`);
      expect(findOrphanFiles(['CLAUDE_SOLOMON.md'], { baseDir: dir, verify: verifyFileContentHash })).toEqual([]);

      // Seed the exact defect class: hand-edit the BODY directly, leaving the header hash
      // untouched (no corresponding leo_protocol_sections change — nothing regenerated this).
      fs.writeFileSync(file, `<!-- file_content_hash: ${sha16(body)} -->\n# CLAUDE_SOLOMON.md (temp copy)\nHAND-EDITED, never regenerated\n`);
      const orphans = findOrphanFiles(['CLAUDE_SOLOMON.md'], { baseDir: dir, verify: verifyFileContentHash });
      expect(orphans).toHaveLength(1);
      expect(orphans[0].file).toBe('CLAUDE_SOLOMON.md');
      expect(orphans[0].actual).toBe(sha16(body)); // the stale header claim
      expect(orphans[0].expected).not.toBe(orphans[0].actual); // what the (edited) body actually hashes to
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('skips a candidate file that does not exist on disk (not this check\'s concern)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-find-'));
    try {
      const verify = () => { throw new Error('verify() must not be called for a missing file'); };
      expect(findOrphanFiles(['nope.md'], { baseDir: dir, verify })).toEqual([]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
