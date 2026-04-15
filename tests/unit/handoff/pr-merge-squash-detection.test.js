/**
 * PR Merge Verification — Squash-Merge Artifact Detection
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-105
 *
 * Verifies that the PR_MERGE_VERIFICATION gate skips branches
 * that have a merged PR (squash-merge artifacts).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const gatesPath = resolve(import.meta.dirname, '../../../scripts/modules/handoff/executors/lead-final-approval/gates.js');
const gatesSource = readFileSync(gatesPath, 'utf-8');

describe('PR_MERGE_VERIFICATION squash-merge handling', () => {
  it('checks for merged PRs before flagging unmerged branches', () => {
    expect(gatesSource).toContain('gh pr list --head');
    expect(gatesSource).toContain('--state merged');
  });

  it('skips branches with merged PRs', () => {
    expect(gatesSource).toContain('squash-merge artifact, skipping');
    expect(gatesSource).toContain('prMerged = true');
  });

  it('still flags truly unmerged branches', () => {
    expect(gatesSource).toContain('if (!prMerged)');
    expect(gatesSource).toContain('unmergedBranches.push');
  });

  it('handles gh CLI failures gracefully', () => {
    expect(gatesSource).toContain('catch (_prErr)');
    expect(gatesSource).toContain('gh CLI unavailable');
  });
});
