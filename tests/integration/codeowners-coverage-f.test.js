import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const CODEOWNERS = join(REPO_ROOT, '.github', 'CODEOWNERS');

describe('Sibling F CODEOWNERS coverage append', () => {
  const content = readFileSync(CODEOWNERS, 'utf8');

  it('contains .claude/hooks/ entry', () => {
    expect(content).toMatch(/\.claude\/hooks\/\s+@rickfelix/);
  });

  it('contains lib/goal-evaluator/ entry', () => {
    expect(content).toMatch(/lib\/goal-evaluator\/\s+@rickfelix/);
  });

  it('contains scripts/lineage/detect-replication.mjs entry', () => {
    expect(content).toContain('scripts/lineage/detect-replication.mjs');
  });

  it('contains docs/process/memory-review-sop.md entry', () => {
    expect(content).toContain('docs/process/memory-review-sop.md');
  });
});
