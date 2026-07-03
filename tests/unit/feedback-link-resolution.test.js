// SD-FDBK-ENH-UAT-AGENT-FEEDBACK-001 FR-3: feedback-link-resolution.mjs is the feedback-row
// sibling to scripts/qf-link-resolution.mjs (which has no test suite of its own -- this
// mirrors that precedent). Static-pattern assertions on structure/behavior contract.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../scripts/feedback-link-resolution.mjs');

describe('SD-FDBK-ENH-UAT-AGENT-FEEDBACK-001: feedback-link-resolution.mjs', () => {
  const code = fs.readFileSync(SRC, 'utf8');

  it('reuses the shared resolveFeedback() writer (not a hand-rolled UPDATE for the resolve path)', () => {
    expect(code).toMatch(/import\s*\{\s*resolveFeedback\s*\}\s*from\s*['"].*governance\/resolve-feedback\.js['"]/);
    expect(code).toMatch(/await\s+resolveFeedback\(/);
  });

  it('resolves immediately when the target SD/QF is already completed', () => {
    expect(code).toMatch(/target\.done/);
    expect(code).toMatch(/status\s*===\s*['"]completed['"]/);
    expect(code).toMatch(/\[['"]completed['"],\s*['"]shipped['"]\]/);
  });

  it('supports --no-resolve as a link-only escape hatch (mirrors qf-link-resolution.mjs --no-cancel)', () => {
    expect(code).toMatch(/--no-resolve/);
    expect(code).toMatch(/noResolve/);
  });

  it('the link-only branch sets only the FK column, never status, on an incomplete target', () => {
    const linkOnlyBlock = code.slice(code.indexOf('// Link-only'));
    expect(linkOnlyBlock).toMatch(/resolution_sd_id:\s*target\.id/);
    expect(linkOnlyBlock).not.toMatch(/status:\s*['"]resolved['"]/);
  });

  it('requires both feedback-id and target-id positional args', () => {
    expect(code).toMatch(/Usage: node scripts\/feedback-link-resolution\.mjs <feedback-id> <SD-KEY-or-QF-ID>/);
    expect(code).toMatch(/process\.exit\(2\)/);
  });
});
