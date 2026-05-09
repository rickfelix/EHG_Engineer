// QF-20260508-406: read-quick-fix.js DB-backed file warning.
// Static-pattern + behavior tests pinning the warning detector + remediation block.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SCRIPT = path.resolve(__dirname, '../../scripts/read-quick-fix.js');

describe('QF-20260508-406: read-quick-fix.js DB-backed file warning', () => {
  const src = readFileSync(SCRIPT, 'utf8');

  it('exports a regex that matches CLAUDE_<phase>.md files', () => {
    const match = src.match(/dbBackedFilePattern\s*=\s*\/([^/]+)\/g/);
    expect(match).toBeTruthy();
    const re = new RegExp(match[1], 'g');
    const samples = ['CLAUDE_LEAD.md', 'CLAUDE_PLAN.md', 'CLAUDE_EXEC.md', 'CLAUDE_CORE.md'];
    samples.forEach(s => expect(s).toMatch(re));
  });

  it('regex matches DIGEST variants', () => {
    const match = src.match(/dbBackedFilePattern\s*=\s*\/([^/]+)\/g/);
    const re = new RegExp(match[1], 'g');
    const samples = ['CLAUDE_LEAD_DIGEST.md', 'CLAUDE_PLAN_DIGEST.md', 'CLAUDE_EXEC_DIGEST.md', 'CLAUDE_CORE_DIGEST.md', 'CLAUDE_DIGEST.md'];
    samples.forEach(s => expect(s).toMatch(re));
  });

  it('regex matches CLAUDE.md (router) and leo-protocol-v*.md', () => {
    const match = src.match(/dbBackedFilePattern\s*=\s*\/([^/]+)\/g/);
    const re = new RegExp(match[1], 'g');
    expect('CLAUDE.md').toMatch(re);
    expect('leo-protocol-v4.4.1.md').toMatch(re);
    expect('leo-protocol-v5.0.md').toMatch(re);
  });

  it('regex does NOT match unrelated markdown', () => {
    const match = src.match(/dbBackedFilePattern\s*=\s*\/([^/]+)\/g/);
    const re = new RegExp(match[1], 'g');
    const negatives = ['README.md', 'docs/api/foo.md', 'CHANGELOG.md', 'src/lib/foo.ts', 'package.json'];
    negatives.forEach(n => {
      const reFresh = new RegExp(match[1], 'g');
      expect(reFresh.test(n)).toBe(false);
    });
  });

  it('warning block mentions leo-kb-refresh.yml workflow as the overwrite trigger', () => {
    expect(src).toMatch(/leo-kb-refresh\.yml/);
    expect(src).toMatch(/06:00 UTC/);
  });

  it('warning block lists the 4-step durable-update remediation', () => {
    expect(src).toMatch(/leo_protocol_sections/);
    expect(src).toMatch(/section-file-mapping\.json/);
    expect(src).toMatch(/section-file-mapping-digest\.json/);
    expect(src).toMatch(/generate-claude-md-from-db\.js/);
  });

  it('warning is gated on regex match (only fires when haystack matches)', () => {
    expect(src).toMatch(/if\s*\(\s*matches\.length\s*>\s*0\s*\)/);
  });

  it('haystack includes description + steps + behavior fields (full QF content scanned)', () => {
    expect(src).toMatch(/qf\.description/);
    expect(src).toMatch(/qf\.steps_to_reproduce/);
    expect(src).toMatch(/qf\.expected_behavior/);
    expect(src).toMatch(/qf\.actual_behavior/);
  });

  it('warning references QF-20260508-810 as DB-first pattern example', () => {
    expect(src).toMatch(/QF-20260508-810/);
  });

  it('regex deduplicates matches (no duplicate warnings for repeated mentions)', () => {
    expect(src).toMatch(/new Set/);
  });
});
