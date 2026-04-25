import { describe, it, expect } from 'vitest';
import { categorize } from '../../repo-cleanup.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RULES_PATH = path.resolve(__dirname, '..', '..', '..', '.claude', 'cleanup-rules.json');

function loadRules() {
  return JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
}

const FIXTURE_2026_04_25 = [
  '.claude-work/',
  '.claude/pids/',
  '.claude/session-module-refactor-opus47.md',
  '.claude/worktree-reaper-state.json',
  'docs/plans/archived/sd-leo-fix-cross-signal-claim-001-plan.md',
  'docs/plans/archived/sd-leo-fix-plan-learn-composite-001-plan.md',
  'docs/plans/archived/sd-leo-fix-plan-opus-harness-001-plan.md',
  'docs/plans/archived/sd-leo-fix-session-lifecycle-hygiene-001-plan.md',
  'docs/plans/archived/sd-leo-fix-worktree-quota-counter-001-plan.md',
  'docs/plans/archived/sd-leo-infra-creation-parser-hardening-001-plan.md',
  'docs/plans/archived/sd-leo-infra-cross-file-overlap-001-plan.md',
  'docs/plans/archived/sd-leo-infra-feedback-pipeline-health-001-plan.md',
  'docs/plans/archived/sd-leo-infra-fix-gate-file-001-plan.md',
  'docs/plans/archived/sd-leo-infra-formalized-worktree-reaper-001-plan.md',
  'docs/plans/archived/sd-leo-infra-lifecycle-reconciliation-orphan-001-plan.md',
  'docs/plans/archived/sd-leo-infra-opus-module-memory-001-plan.md',
  'docs/plans/archived/sd-leo-infra-opus-module-scope-001-plan.md',
  'docs/plans/archived/sd-leo-infra-opus-module-sub-001-plan.md',
  'docs/plans/archived/sd-leo-infra-retrospective-gates-fail-001-plan.md',
  'docs/plans/archived/sd-leo-refac-plan-memory-index-001-plan.md',
  'scripts/spawn-tick-canonical.mjs'
];

describe('seed-pack regression (2026-04-25 working tree fixture)', () => {
  const result = categorize(FIXTURE_2026_04_25, loadRules());

  it('categorises 4 .claude/ runtime files to GITIGNORE', () => {
    expect(result.gitignore.length).toBe(4);
    const gitignoredPaths = result.gitignore.map(i => i.file);
    expect(gitignoredPaths).toContain('.claude-work/');
    expect(gitignoredPaths).toContain('.claude/pids/');
    expect(gitignoredPaths).toContain('.claude/session-module-refactor-opus47.md');
    expect(gitignoredPaths).toContain('.claude/worktree-reaper-state.json');
  });

  it('categorises 16 docs/plans/archived/*-plan.md files to COMMIT', () => {
    expect(result.commit.length).toBe(16);
    expect(result.commit.every(i => i.file.startsWith('docs/plans/archived/'))).toBe(true);
  });

  it('leaves only scripts/spawn-tick-canonical.mjs in REVIEW', () => {
    expect(result.review.length).toBe(1);
    expect(result.review[0].file).toBe('scripts/spawn-tick-canonical.mjs');
  });

  it('total categorisation matches the 21-file input', () => {
    const total = result.delete.length + result.gitignore.length + result.commit.length + result.review.length;
    expect(total).toBe(FIXTURE_2026_04_25.length);
  });
});
