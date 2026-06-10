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
import { parseOnlyFlag } from '../../scripts/generate-claude-md-from-db.js';

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

  it('KNOWN_GENERATED_FILES covers the 12 generated files', () => {
    expect(KNOWN_GENERATED_FILES).toHaveLength(12);
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE.md');
    expect(KNOWN_GENERATED_FILES).toContain('CLAUDE_ADAM_DIGEST.md');
  });
});
