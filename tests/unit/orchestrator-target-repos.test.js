/**
 * QF-20260524-566 / feedback 0ee3c3b8 Bug 2.
 *
 * leo-create-sd.js auto-routes to create-orchestrator-from-plan.js but dropped
 * --target-repos, and that script had no handling — so cross-repo orchestrator SDs
 * (and their auto-created children) never got metadata.target_repos, breaking
 * PR_MERGE_VERIFICATION repo-scoping at LEAD-FINAL.
 *
 * - buildOrchestratorCmd (leo-create-sd.js) forwards --target-repos into the exec.
 * - withTargetRepos (create-orchestrator-from-plan.js) persists target_repos onto the
 *   orchestrator + child SD metadata. Both are no-ops when targetRepos is null/empty,
 *   so single-repo orchestrators are byte-for-byte unchanged.
 */
import { describe, it, expect } from 'vitest';
import { buildOrchestratorCmd } from '../../scripts/leo-create-sd.js';
import { withTargetRepos } from '../../scripts/create-orchestrator-from-plan.js';

describe('buildOrchestratorCmd — forwards --target-repos (leo-create-sd auto-route)', () => {
  const base = { visionKey: 'VISION-X', archKey: 'ARCH-X', title: 'My Orchestrator' };

  it('appends --target-repos when a cross-repo list is provided', () => {
    const cmd = buildOrchestratorCmd({ ...base, targetRepos: ['EHG', 'EHG_Engineer'] });
    expect(cmd).toContain('--target-repos EHG,EHG_Engineer');
    expect(cmd).toContain('--vision-key VISION-X');
    expect(cmd).toContain('--auto-children');
  });

  it('omits --target-repos when targetRepos is null (single-repo, unchanged)', () => {
    const cmd = buildOrchestratorCmd({ ...base, targetRepos: null });
    expect(cmd).not.toContain('--target-repos');
  });

  it('omits --target-repos for an empty array', () => {
    const cmd = buildOrchestratorCmd({ ...base, targetRepos: [] });
    expect(cmd).not.toContain('--target-repos');
  });
});

describe('withTargetRepos — persists target_repos onto SD metadata', () => {
  it('adds target_repos when a list is provided, preserving existing keys', () => {
    const out = withTargetRepos({ is_orchestrator: true, vision_key: 'V' }, ['EHG', 'EHG_Engineer']);
    expect(out.target_repos).toEqual(['EHG', 'EHG_Engineer']);
    expect(out.is_orchestrator).toBe(true);
    expect(out.vision_key).toBe('V');
  });

  it('is a no-op when targetRepos is null (no target_repos key added)', () => {
    const meta = { is_orchestrator: true };
    const out = withTargetRepos(meta, null);
    expect(out).toBe(meta);
    expect('target_repos' in out).toBe(false);
  });

  it('is a no-op for an empty array', () => {
    const out = withTargetRepos({ phase_number: 2 }, []);
    expect('target_repos' in out).toBe(false);
    expect(out.phase_number).toBe(2);
  });
});
