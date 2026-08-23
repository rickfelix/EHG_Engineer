// SD-LEO-INFRA-PROTOCOL-PUBLICATION-PIPELINE-001 — publication pipeline integrity.
// FR-1: evaluatePublicationInvariants (pure audit core).
// FR-3: body-hash header contract (verifyFileContentHash + generateFile injection).
// FR-4: parseOnlyFlag validation + generateFile --only skip.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'node:module';

import { CLAUDEMDGeneratorV3, KNOWN_GENERATED_FILES, verifyFileContentHash } from '../../scripts/modules/claude-md-generator/index.js';
import { parseOnlyFlag, parseRefreshLessonsFlag, detectConflictedState } from '../../scripts/generate-claude-md-from-db.js';

const require = createRequire(import.meta.url);
const { evaluatePublicationInvariants } = require('../../scripts/protocol-publication-audit.cjs');

const sha16 = (s) => crypto.createHash('sha256').update(s).digest('hex').substring(0, 16);

describe('FR-1: evaluatePublicationInvariants (pure)', () => {
  const row = (id, type, status, target_file = null, note = 'evidence') => ({
    id, section_type: type, target_file, metadata: status ? { publication_status: status, publication_note: note } : {},
  });

  it('all classified + no drift => ok with correct counts', () => {
    const rows = [row(1, 'a', 'file'), row(2, 'b', 'runtime'), row(3, 'c', 'retired')];
    const r = evaluatePublicationInvariants(rows, new Set(['a']));
    expect(r.ok).toBe(true);
    expect(r.counts).toEqual({ runtime: 1, file: 1, retired: 1 });
  });

  it('missing publication_status => unclassified, not ok', () => {
    const r = evaluatePublicationInvariants([row(1, 'a', null)], new Set());
    expect(r.ok).toBe(false);
    expect(r.unclassified).toEqual([{ id: 1, section_type: 'a' }]);
  });

  it('invalid status value => flagged, not ok', () => {
    const r = evaluatePublicationInvariants([row(1, 'a', 'bogus')], new Set());
    expect(r.ok).toBe(false);
    expect(r.invalidStatus).toEqual([{ id: 1, status: 'bogus' }]);
  });

  it('mapped type absent from DB => mapping drift, not ok', () => {
    const r = evaluatePublicationInvariants([row(1, 'a', 'file')], new Set(['a', 'ghost_type']));
    expect(r.ok).toBe(false);
    expect(r.mappingDrift).toEqual(['ghost_type']);
  });

  it('dark file-status section without a note => advisory darkUnreviewed (still ok)', () => {
    const rows = [{ id: 9, section_type: 'dark', target_file: null, metadata: { publication_status: 'file', publication_note: '' } }];
    const r = evaluatePublicationInvariants(rows, new Set());
    expect(r.ok).toBe(true);
    expect(r.darkUnreviewed).toEqual([{ id: 9, section_type: 'dark' }]);
  });
});

describe('FR-3: content-hash header contract', () => {
  it('generateFile replaces a template "pending" hash line with the real body hash', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pubpipe-'));
    try {
      const gen = new CLAUDEMDGeneratorV3({}, dir, path.join(dir, 'nope.json'));
      const rendered = '<!-- DIGEST FILE -->\n<!-- file_content_hash: pending -->\n# Body\ncontent here\n';
      gen.generateFile('CLAUDE_TEST_DIGEST.md', {}, () => rendered, 'digest');
      const written = fs.readFileSync(path.join(dir, 'CLAUDE_TEST_DIGEST.md'), 'utf-8');
      expect(written).not.toContain('pending');
      const v = verifyFileContentHash(path.join(dir, 'CLAUDE_TEST_DIGEST.md'));
      expect(v.ok).toBe(true);
      expect(v.actual).toMatch(/^[0-9a-f]{16}$/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('generateFile prepends a stamp to files with no header (FULL files)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pubpipe-'));
    try {
      const gen = new CLAUDEMDGeneratorV3({}, dir, path.join(dir, 'nope.json'));
      gen.generateFile('CLAUDE_TEST.md', {}, () => '# Full file\nbody\n', 'full');
      const v = verifyFileContentHash(path.join(dir, 'CLAUDE_TEST.md'));
      expect(v.ok).toBe(true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('verifyFileContentHash detects a mutated body (staleness/tamper)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pubpipe-'));
    try {
      const body = '# Body\noriginal\n';
      const file = path.join(dir, 'f.md');
      fs.writeFileSync(file, `<!-- file_content_hash: ${sha16(body)} -->\n${body}`);
      expect(verifyFileContentHash(file).ok).toBe(true);
      fs.writeFileSync(file, `<!-- file_content_hash: ${sha16(body)} -->\n# Body\nMUTATED\n`);
      expect(verifyFileContentHash(file).ok).toBe(false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('verifyFileContentHash on a pre-FR-3 file (no hash line) => ok:false, actual:null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pubpipe-'));
    try {
      const file = path.join(dir, 'old.md');
      fs.writeFileSync(file, '# Old generated file\n');
      expect(verifyFileContentHash(file)).toEqual({ ok: false, expected: null, actual: null });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('FR-4: --only scoped regeneration', () => {
  it('parseOnlyFlag: absent => null (full regen)', () => {
    expect(parseOnlyFlag(['node', 'gen.js'])).toBeNull();
  });

  it('parseOnlyFlag: valid single + comma list', () => {
    expect(parseOnlyFlag(['node', 'gen.js', '--only', 'CLAUDE_LEAD.md'])).toEqual(['CLAUDE_LEAD.md']);
    expect(parseOnlyFlag(['node', 'gen.js', '--only', 'CLAUDE.md,CLAUDE_CORE_DIGEST.md']))
      .toEqual(['CLAUDE.md', 'CLAUDE_CORE_DIGEST.md']);
  });

  it('parseOnlyFlag: unknown target fails loud listing valid files', () => {
    expect(() => parseOnlyFlag(['node', 'gen.js', '--only', 'NOPE.md'])).toThrow(/unknown file\(s\) NOPE\.md.*CLAUDE\.md/s);
  });

  it('parseOnlyFlag: missing value fails loud', () => {
    expect(() => parseOnlyFlag(['node', 'gen.js', '--only'])).toThrow(/--only requires a value/);
  });

  // QF-20260816-925
  it('parseRefreshLessonsFlag: absent => false (preserve on-disk lessons block)', () => {
    expect(parseRefreshLessonsFlag(['node', 'gen.js'])).toBe(false);
  });

  it('parseRefreshLessonsFlag: present => true', () => {
    expect(parseRefreshLessonsFlag(['node', 'gen.js', '--refresh-lessons'])).toBe(true);
  });

  it('generateFile skips files outside options.only (no write, no manifest entry)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pubpipe-'));
    try {
      const gen = new CLAUDEMDGeneratorV3({}, dir, path.join(dir, 'nope.json'), { only: ['CLAUDE_KEEP.md'] });
      gen.generateFile('CLAUDE_SKIP.md', {}, () => 'skip me', 'full');
      gen.generateFile('CLAUDE_KEEP.md', {}, () => 'keep me', 'full');
      expect(fs.existsSync(path.join(dir, 'CLAUDE_SKIP.md'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'CLAUDE_KEEP.md'))).toBe(true);
      expect(Object.keys(gen.manifest.files)).toEqual(['CLAUDE_KEEP.md']);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('KNOWN_GENERATED_FILES covers the 23 generated files', () => {
    // Grew 12 -> 14 (Coordinator) -> 16 (Solomon: CLAUDE_SOLOMON.md + CLAUDE_SOLOMON_DIGEST.md)
    // -> 18 (SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001: the two Adam companions, which the chairman
    // ruled A-GOVERN on so they are GENERATED from governed rows rather than hand-maintained files).
    // -> 19 (SD-FDBK-INFRA-CLAUDE-LEAD-EXCEEDS-001: CLAUDE_LEAD_MANUAL.md, which carries reference
    // material out of CLAUDE_LEAD.md so the gated file fits the Read tool's 25k single-call cap.
    // Before it, a no-offset Read of CLAUDE_LEAD.md returned lines 1-1231 of 1592 and the gate could
    // not tell that from a complete read.)
    // -> 21 (SD-FDBK-INFRA-CLAUDE-SOLOMON-EXCEEDS-001: CLAUDE_SOLOMON_MANUAL.md. The harness
    // returned "showing lines 1-301 of 371 total (26138 tokens, cap 25000)" for CLAUDE_SOLOMON.md,
    // and the dropped tail held the chairman-ratified clause REPEALING a rule the surviving head
    // still stated — truncation kept the superseded rule and discarded its repeal.)
    // -> 23 (SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002: CLAUDE_COORDINATOR_MANUAL.md +
    // CLAUDE_COORDINATOR_PROVENANCE.md, mirroring the Adam companion pattern.)
    // -> 24 (SD-LEO-INFRA-SOLOMON-ROLE-CONTRACT-001 FR-6: CLAUDE_SOLOMON_PROVENANCE.md. The
    // restructure that fixed the above regression (26,029 -> 14,971 tokens) needed somewhere to
    // put the historical/rationale prose it moved out of the gated file, without reopening the
    // same over-cap problem the manual companion above was created to close.)
    expect(KNOWN_GENERATED_FILES).toHaveLength(24);
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE.md');
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_ADAM_DIGEST.md');
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_COORDINATOR.md');
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_COORDINATOR_DIGEST.md');
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_SOLOMON.md');
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_SOLOMON_DIGEST.md');
    // The companions are the point of the A-GOVERN ruling: named explicitly so a future edit that
    // drops them from the generated set fails HERE rather than silently demoting governed content
    // back to an unread file.
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_ADAM_MANUAL.md');
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_ADAM_PROVENANCE.md');
    // Same reasoning one file later: if CLAUDE_LEAD_MANUAL.md is ever dropped from the generated
    // set, CLAUDE_LEAD.md silently reabsorbs its sections and goes back over the Read cap — which
    // presents as nothing at all, because a truncated read reports success. Named so that fails here.
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_LEAD_MANUAL.md');
    // And again for Solomon, where the stakes are higher than for a phase file: Solomon is a
    // SINGLETON with no peer seat, so a silently reabsorbed section has no second reader who could
    // notice it went missing.
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_SOLOMON_MANUAL.md');
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_PLAN_MANUAL.md');
    // SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002 (FR-1): named explicitly for the same reason as
    // the Adam companions above — a future edit that drops them fails HERE, not silently.
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_COORDINATOR_MANUAL.md');
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_COORDINATOR_PROVENANCE.md');
    // Same reasoning again: if CLAUDE_SOLOMON_PROVENANCE.md is ever dropped from the generated
    // set, the historical/rationale prose it holds becomes an unread, unregenerated file nobody
    // notices went stale — same class of harm as the CLAUDE_SOLOMON_MANUAL.md case above.
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_SOLOMON_PROVENANCE.md');
  });
});

describe('QF-20260816-925: loadExistingLessonsOverride (fail-open, preserves on-disk lessons)', () => {
  it('no CLAUDE_CORE.md on disk yet => null (fails open to a fresh snapshot)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-override-'));
    try {
      const gen = new CLAUDEMDGeneratorV3({}, dir, path.join(dir, 'nope.json'), {});
      expect(gen.loadExistingLessonsOverride()).toBeNull();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('CLAUDE_CORE.md exists with a lessons block => extracts it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-override-'));
    try {
      fs.writeFileSync(path.join(dir, 'CLAUDE_CORE.md'),
        '## Recent Lessons (Last 30 Days)\n\n### 1. On-Disk Retro\nDetails.\n\n## Agent Responsibilities\n');
      const gen = new CLAUDEMDGeneratorV3({}, dir, path.join(dir, 'nope.json'), {});
      const override = gen.loadExistingLessonsOverride();
      expect(override).toContain('On-Disk Retro');
      expect(override).not.toContain('Agent Responsibilities');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('CLAUDE_CORE.md exists but has no lessons heading yet => null (nothing to preserve)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-override-'));
    try {
      fs.writeFileSync(path.join(dir, 'CLAUDE_CORE.md'), '## Agent Responsibilities\n');
      const gen = new CLAUDEMDGeneratorV3({}, dir, path.join(dir, 'nope.json'), {});
      expect(gen.loadExistingLessonsOverride()).toBeNull();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('constructor: options.refreshLessons defaults to false, an explicit true is preserved', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-override-'));
    try {
      const defaultGen = new CLAUDEMDGeneratorV3({}, dir, path.join(dir, 'nope.json'), {});
      expect(defaultGen.options.refreshLessons).toBe(false);
      const refreshGen = new CLAUDEMDGeneratorV3({}, dir, path.join(dir, 'nope.json'), { refreshLessons: true });
      expect(refreshGen.options.refreshLessons).toBe(true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('QF-20260705-104: detectConflictedState (generator entry guard, seam 2)', () => {
  it('clean CLAUDE*.md files, no git repo => null (no false positive)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflict-guard-'));
    try {
      fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Clean file\nno markers here\n');
      expect(detectConflictedState(dir)).toBeNull();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('a CLAUDE*.md file with a conflict marker is reported', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflict-guard-'));
    try {
      fs.writeFileSync(path.join(dir, 'CLAUDE_CORE.md'), '# Body\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n');
      const result = detectConflictedState(dir);
      expect(result).not.toBeNull();
      expect(result.markered).toEqual(['CLAUDE_CORE.md']);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('multiple markered files are all reported', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflict-guard-'));
    try {
      fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '<<<<<<< HEAD\nx\n');
      fs.writeFileSync(path.join(dir, 'CLAUDE_LEAD.md'), '<<<<<<< HEAD\ny\n');
      fs.writeFileSync(path.join(dir, 'CLAUDE_PLAN.md'), '# clean\n');
      const result = detectConflictedState(dir);
      expect(result.markered.sort()).toEqual(['CLAUDE.md', 'CLAUDE_LEAD.md']);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('non-CLAUDE*.md files are ignored even with markers', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflict-guard-'));
    try {
      fs.writeFileSync(path.join(dir, 'README.md'), '<<<<<<< HEAD\nx\n');
      expect(detectConflictedState(dir)).toBeNull();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('fails open on a git status error (no git repo) rather than throwing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflict-guard-'));
    try {
      fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# clean, no markers\n');
      expect(() => detectConflictedState(dir)).not.toThrow();
      expect(detectConflictedState(dir)).toBeNull();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
