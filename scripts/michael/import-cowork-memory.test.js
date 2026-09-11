// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F / FR-1..FR-7, TS-1..TS-8.
// REWRITTEN by SD-LEO-FIX-COWORK-IMPORTER-CANNOT-001: fixtures now use the REAL corpus paths and
// formats (verified live against the actual Dropbox _Cowork folder, 2026-09-07), replacing the
// invented "### domain: key" convention this file previously exercised.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stubClient } from '../../lib/michael/db.test.js';
import { runImportCoworkMemory, parseSourceFiles, SOURCE_FILES } from './import-cowork-memory.mjs';

const NOW = new Date('2026-09-07T12:00:00.000Z');
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

function seedFixture(dir) {
  fs.mkdirSync(path.join(dir, 'memory', 'preferences'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'memory', 'preferences', 'gmail.md'),
    [
      '## Triage rules',
      '',
      '### Newsletters (auto-label + archive)',
      '',
      'Archive newsletters automatically.',
      'json: {"match":{"list_id":"news.example.com"},"class":"newsletter","action":{"verb":"archive"}}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(dir, 'memory', 'closures.md'),
    [
      '### 2026-05-21 — Onboarding flow decided',
      '',
      '- **Keywords:** onboarding, flow, signup',
      '- **Closure:** We decided the onboarding flow ships without a wizard.',
      '- **Expires:** permanent',
      '',
    ].join('\n'),
  );
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
    expect(r.preview['memory/preferences/gmail.md'].parsed_count).toBe(1);
    expect(r.preview['memory/closures.md'].parsed_count).toBe(1);
    expect(r.missing).toContain('memory/preferences/todoist.md');
    expect(r.missing).not.toContain('memory/preferences/gmail.md');
    expect(calls.some((c) => c.kind === 'insert' || c.kind === 'upsert')).toBe(false);
  });

  it('Step 0 freezes a manifest on first run and detects drift on a changed folder afterward', async () => {
    const { sb } = db();
    const r1 = await runImportCoworkMemory({ sb, argv: ['--root', dir], now: NOW, manifestPath });
    expect(r1.ok).toBe(true);
    fs.writeFileSync(path.join(dir, 'memory', 'preferences', 'gmail.md'), '## Triage rules\n\n### Newsletters (auto-label + archive)\n\nDIFFERENT text now.\n');
    const r2 = await runImportCoworkMemory({ sb: db().sb, argv: ['--root', dir], now: NOW, manifestPath });
    expect(r2.ok).toBe(false);
    expect(r2.refusal).toBe('ROOT_DRIFTED');
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
    expect(r.report['memory/preferences/gmail.md'].ok).toBe(false);
    expect(r.report['memory/preferences/gmail.md'].rows[0]).toMatchObject({ rule_key: 'newsletters-auto-label-archive', present: false });
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

  it('doctrine.md principles are previewed but never written -- reported as skipped pending a domain ruling', async () => {
    fs.writeFileSync(
      path.join(dir, 'memory', 'doctrine.md'),
      ['## Operating principles', '', '### High-signal family (B2)', '', 'Anything involving family is high-signal.', ''].join('\n'),
    );
    const { sb } = db();
    const dryRun = await runImportCoworkMemory({ sb, argv: ['--root', dir], now: NOW, manifestPath });
    expect(dryRun.preview['memory/doctrine.md'].parsed_count).toBe(1);

    const { sb: sb2, calls: calls2 } = db();
    const apply = await runImportCoworkMemory({ sb: sb2, argv: ['--root', dir, '--apply'], now: NOW, manifestPath });
    expect(apply.results.doctrine_skipped).toEqual([{ key: 'high-signal-family-b2', reason: 'NEEDS_DOMAIN_RULING' }]);
    // Exactly one michael_rules insert (the gmail.md fixture rule) -- the doctrine principle above
    // must never reach the writer at all.
    expect(calls2.filter((c) => c.table === 'michael_rules' && c.kind === 'insert')).toHaveLength(1);
  });
});

describe('parseSourceFiles', () => {
  it('reports missing files without throwing', () => {
    const { parsed, missing } = parseSourceFiles(dir);
    expect(Object.keys(parsed)).toContain('memory/preferences/gmail.md');
    expect(missing).toEqual(expect.arrayContaining(['memory/preferences/todoist.md', 'memory/preferences/body-section.md', 'CLAUDE.md']));
  });

  it('SOURCE_FILES maps exactly the eight source files this SD corrected, gmail-labels.md removed', () => {
    expect(Object.keys(SOURCE_FILES).sort()).toEqual([
      'CLAUDE.md',
      'memory/brief-feedback.md',
      'memory/closures.md',
      'memory/doctrine.md',
      'memory/preferences/body-section.md',
      'memory/preferences/gmail.md',
      'memory/preferences/morning-brief-distillation.md',
      'memory/preferences/todoist.md',
    ].sort());
  });

  it('QF-20260907-610: gmail.md, todoist.md and morning-brief-distillation.md carry a sectionHeadingRe; body-section.md and CLAUDE.md intentionally have none', () => {
    expect(SOURCE_FILES['memory/preferences/gmail.md'].sectionHeadingRe).toBeTruthy();
    expect(SOURCE_FILES['memory/preferences/todoist.md'].sectionHeadingRe).toBeTruthy();
    expect(Array.isArray(SOURCE_FILES['memory/preferences/morning-brief-distillation.md'].sectionHeadingRe)).toBe(true);
    expect(SOURCE_FILES['memory/preferences/body-section.md'].sectionHeadingRe).toBeUndefined();
    expect(SOURCE_FILES['CLAUDE.md'].sectionHeadingRe).toBeUndefined();
  });

  it('QF-20260907-610: todoist.md and morning-brief-distillation.md parse a non-zero rule count end to end, via SOURCE_FILES + parseSourceFiles (real-shaped fixtures, not just parseRuleFile in isolation)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'michael-cowork-qf610-'));
    try {
      fs.mkdirSync(path.join(root, 'memory', 'preferences'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'memory', 'preferences', 'todoist.md'),
        ['## Effort + energy budget model (Phase 4/4b — added 2026-05-30)', '', "### Rick's review process (hard rule)", '', 'Rick reviews every estimate before it is trusted.', '', '## Change log', '', '### 2026-05-14 — initial setup', '', 'Historical prose, not a rule.', ''].join('\n'),
      );
      fs.writeFileSync(
        path.join(root, 'memory', 'preferences', 'morning-brief-distillation.md'),
        ['## Structural decisions (LOCKED)', '', '### Two-zone "newspaper" layout — CONFIRMED', '', 'The brief uses a two-zone layout.', '', '## Todoist intelligence — effort + energy-aware prioritization (Rick\'s direction, 2026-05-30)', '', '### Effort-budget model (Rick\'s refinement, 2026-05-30)', '', 'Effort budgets feed the morning brief too.', ''].join('\n'),
      );
      const { parsed } = parseSourceFiles(root);
      expect(parsed['memory/preferences/todoist.md'].rules).toHaveLength(1);
      expect(parsed['memory/preferences/todoist.md'].rules[0]).toMatchObject({ domain: 'todoist', rule_key: 'rick-s-review-process-hard-rule' });
      expect(parsed['memory/preferences/morning-brief-distillation.md'].rules).toHaveLength(2);
      expect(parsed['memory/preferences/morning-brief-distillation.md'].rules.map((r) => r.rule_key)).toEqual([
        'two-zone-newspaper-layout-confirmed',
        'effort-budget-model-rick-s-refinement-2026-05-30',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
