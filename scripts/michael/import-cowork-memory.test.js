// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F / FR-1..FR-7, TS-1..TS-8.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stubClient } from '../../lib/michael/db.test.js';
import { runImportCoworkMemory, parseSourceFiles, SOURCE_FILES } from './import-cowork-memory.mjs';

const NOW = new Date('2026-09-07T12:00:00.000Z');
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

function seedFixture(dir) {
  fs.writeFileSync(path.join(dir, 'gmail.md'), '### gmail: newsletter-archive\nArchive newsletters automatically.\njson: {"match":{"list_id":"news.example.com"},"class":"newsletter","action":{"verb":"archive"}}\n\nAn unrecognized line with no heading context is fine here since it is inside the block above.\n');
  fs.mkdirSync(path.join(dir, 'memory'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'memory', 'closures.md'), '### closure: c1\ntopic: onboarding\nWe decided.\n');
}

function db({ activeRule = null, absent = false } = {}) {
  const calls = [];
  const sb = stubClient((table, ops) => {
    calls.push({ table, kind: ops[0].op, ops });
    if (absent) return MISSING;
    if (ops[0].op === 'insert' || ops[0].op === 'upsert') return { data: { id: 'row-1' }, error: null };
    if (ops[0].op === 'select') return { data: activeRule && table === 'michael_rules' ? [activeRule] : [], error: null };
    return { data: null, error: null };
  });
  return { sb, calls };
}

let dir, manifestPath;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'michael-cowork-import-test-'));
  manifestPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'michael-cowork-manifest-')), 'manifest.json');
  seedFixture(dir);
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(path.dirname(manifestPath), { recursive: true, force: true });
});

describe('runImportCoworkMemory', () => {
  it('--root is required; omitting it refuses before any read', async () => {
    const { sb, calls } = db();
    const r = await runImportCoworkMemory({ sb, argv: [], now: NOW, manifestPath });
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('ROOT_REQUIRED');
    expect(calls.length).toBe(0);
  });

  it('no literal Dropbox/_Cowork path is hardcoded anywhere in this script', () => {
    const src = fs.readFileSync(new URL('./import-cowork-memory.mjs', import.meta.url), 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(code).not.toMatch(/Dropbox|_Cowork/);
  });

  it('dry-run (no --apply) previews parsed content and unparsed lines, writes nothing', async () => {
    const { sb, calls } = db();
    const r = await runImportCoworkMemory({ sb, argv: ['--root', dir], now: NOW, manifestPath });
    expect(r.action).toBe('dry_run');
    expect(r.preview['gmail.md'].parsed_count).toBe(1);
    expect(r.missing).toContain('todoist.md');
    expect(calls.some((c) => c.kind === 'insert' || c.kind === 'upsert')).toBe(false);
  });

  it('Step 0 freezes a manifest on first run and detects drift on a changed folder afterward', async () => {
    const { sb } = db();
    const r1 = await runImportCoworkMemory({ sb, argv: ['--root', dir], now: NOW, manifestPath });
    expect(r1.ok).toBe(true);
    fs.writeFileSync(path.join(dir, 'gmail.md'), '### gmail: newsletter-archive\nDIFFERENT text now.\n');
    const r2 = await runImportCoworkMemory({ sb: db().sb, argv: ['--root', dir], now: NOW, manifestPath });
    expect(r2.ok).toBe(false);
    expect(r2.refusal).toBe('ROOT_DRIFTED');
    expect(r2.diff.changed).toContain('gmail.md');
  });

  it('an unchanged folder verifies clean against its own prior manifest (no drift, no refusal)', async () => {
    const { sb } = db();
    await runImportCoworkMemory({ sb, argv: ['--root', dir], now: NOW, manifestPath });
    const r2 = await runImportCoworkMemory({ sb: db().sb, argv: ['--root', dir], now: NOW, manifestPath });
    expect(r2.ok).toBe(true);
  });

  it('--apply writes parsed rules/closures and reports zero refusals for a clean fixture', async () => {
    const { sb, calls } = db();
    const r = await runImportCoworkMemory({ sb, argv: ['--root', dir, '--apply'], now: NOW, manifestPath });
    expect(r.ok).toBe(true);
    expect(r.results.rules).toHaveLength(1);
    expect(r.results.rules[0].action).toBe('insert');
    expect(r.results.closures).toHaveLength(1);
    expect(calls.some((c) => c.table === 'michael_rules' && c.kind === 'insert')).toBe(true);
  });

  it('--apply against an existing active rule with different content refuses that rule but still reports it', async () => {
    const activeRule = { id: 'x1', rule_text: 'OLD text', rule_json: null, status: 'active' };
    const { sb } = db({ activeRule });
    const r = await runImportCoworkMemory({ sb, argv: ['--root', dir, '--apply'], now: NOW, manifestPath });
    expect(r.ok).toBe(false);
    expect(r.refused).toHaveLength(1);
    expect(r.refused[0].refusal).toBe('CONTENT_CHANGED_NEEDS_VERIFIER');
  });

  it('--verify re-reads and reports per-file pass/fail, naming a missing row', async () => {
    const { sb } = db(); // select on michael_rules returns [] (no active row) -> not found
    const r = await runImportCoworkMemory({ sb, argv: ['--root', dir, '--verify'], now: NOW, manifestPath });
    expect(r.action).toBe('verify');
    expect(r.report['gmail.md'].ok).toBe(false);
    expect(r.report['gmail.md'].rows[0]).toMatchObject({ rule_key: 'newsletter-archive', present: false });
  });

  it('is inert on a missing relation, never throws', async () => {
    const { sb } = db({ absent: true });
    const r = await runImportCoworkMemory({ sb, argv: ['--root', dir, '--apply'], now: NOW, manifestPath });
    expect(r.ok).toBe(false);
  });

  it('--ratify calls the injected writer exactly once with target_contracts including michael, never a raw insert', async () => {
    const ratifyWriter = vi.fn(async () => ({ id: 'rat-1' }));
    const { sb } = db();
    const r = await runImportCoworkMemory({ sb, argv: ['--ratify', '--quote', 'Cowork import ratified', '--source', 'chairman terminal read-through'], now: NOW, manifestPath, ratifyWriter });
    expect(r.ok).toBe(true);
    expect(ratifyWriter).toHaveBeenCalledTimes(1);
    expect(ratifyWriter.mock.calls[0][1].targetContracts).toEqual(['michael']);
    expect(ratifyWriter.mock.calls[0][1].utteredAt).toBeTruthy();
  });

  it('--ratify without --quote/--source refuses before calling the writer', async () => {
    const ratifyWriter = vi.fn();
    const { sb } = db();
    const r = await runImportCoworkMemory({ sb, argv: ['--ratify'], now: NOW, manifestPath, ratifyWriter });
    expect(r.ok).toBe(false);
    expect(ratifyWriter).not.toHaveBeenCalled();
  });
});

describe('parseSourceFiles', () => {
  it('reports missing files without throwing', () => {
    const { parsed, missing } = parseSourceFiles(dir);
    expect(Object.keys(parsed)).toContain('gmail.md');
    expect(missing).toEqual(expect.arrayContaining(['todoist.md', 'body-section.md', 'CLAUDE.md']));
  });

  it('SOURCE_FILES maps exactly the nine source files the spec names (child J adds youtube.md)', () => {
    expect(Object.keys(SOURCE_FILES).sort()).toEqual(['CLAUDE.md', 'body-section.md', 'gmail-labels.md', 'gmail.md', 'memory/brief-feedback.md', 'memory/closures.md', 'morning-brief-distillation.md', 'todoist.md', 'youtube.md'].sort());
    expect(SOURCE_FILES['youtube.md']).toBe('rules');
  });
});
