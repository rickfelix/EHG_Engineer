import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const SOP = join(REPO_ROOT, 'docs', 'process', 'memory-review-sop.md');

describe('Sibling F memory-review-sop.md exists with required fields', () => {
  it('file exists', () => {
    expect(existsSync(SOP)).toBe(true);
  });

  const content = readFileSync(SOP, 'utf8');

  it('Owner assigned (@rickfelix)', () => {
    expect(content).toMatch(/Owner.*@rickfelix/);
  });

  it('30-day deadline declared', () => {
    expect(content).toMatch(/30 days/i);
    expect(content).toMatch(/2026-06-15/);
  });

  it('keep-verbatim default documented', () => {
    expect(content).toMatch(/KEEP-VERBATIM/);
    expect(content).toMatch(/default/i);
  });

  it('3-option decision workflow (KEEP/EDIT/REMOVE)', () => {
    expect(content).toContain('KEEP-VERBATIM');
    expect(content).toContain('EDIT-WITH-RATIONALE');
    expect(content).toContain('REMOVE-WITH-RATIONALE');
  });

  it('Model-authored rewrites disallowed without human sign-off', () => {
    expect(content).toMatch(/disallowed without.*human sign-off/i);
  });
});
