/**
 * SD-LEO-INFRA-FLEET-WIDE-SUB-001 — smoke test for lib/sub-agents/resolve-repo.js
 *
 * Validates the four core branches of resolveSubAgentRepo:
 *   1. Cross-repo-supported sub-agent + valid targetApplication → resolves via DB-first SSOT
 *   2. Cross-repo-unsupported sub-agent (DATABASE_*) → returns EHG_Engineer with skip_reason
 *   3. Cross-repo-supported sub-agent + null targetApplication → repoPath null, repoResolved false
 *   4. Registry capability lookup for known + unknown sub-agent codes
 *
 * Plus applySubAgentRepoVerdict mutation contract:
 *   - Emits metadata.repo_path + repo_resolved + executed_from_cwd top-level
 *   - Adjusts verdict PASS → CONDITIONAL_PASS when unresolved (fail-closed)
 *   - Skips adjustment when skipVerdictAdjust=true (STORIES_CODEBASE shape)
 *   - Does NOT downgrade when skip_reason present (capability skip is legitimate)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveSubAgentRepo,
  applySubAgentRepoVerdict,
  getSubAgentCapability,
  clearRegistryCache,
} from '../../lib/sub-agents/resolve-repo.js';

describe('resolveSubAgentRepo', () => {
  beforeEach(() => clearRegistryCache());

  it('DATABASE_MIGRATION returns EHG_Engineer with skip_reason (cross-repo unsupported)', async () => {
    const result = await resolveSubAgentRepo({
      sdId: 'TEST-001',
      targetApplication: 'CronGenius',
      subAgentCode: 'DATABASE_MIGRATION',
    });
    expect(result.repoResolved).toBe(true);
    expect(result.repoPath).toMatch(/EHG_Engineer$/);
    expect(result.registrySource).toBe('skipped');
    expect(result.skipReason).toBe('sub_agent_engineer_only');
  });

  it('SECURITY (cross-repo supported) with null targetApplication returns repoResolved=false', async () => {
    const result = await resolveSubAgentRepo({
      sdId: 'TEST-002',
      targetApplication: null,
      subAgentCode: 'SECURITY',
    });
    expect(result.repoPath).toBeNull();
    expect(result.repoResolved).toBe(false);
    expect(result.registrySource).toBe('fallback');
    expect(result.skipReason).toBeUndefined();
  });

  it('SECURITY with EHG_Engineer targetApplication resolves via registry (no supabase)', async () => {
    const result = await resolveSubAgentRepo({
      sdId: 'TEST-003',
      targetApplication: 'EHG_Engineer',
      subAgentCode: 'SECURITY',
    });
    expect(result.repoResolved).toBe(true);
    // Substring match (not end-anchored): when tests run from inside a .worktrees/<sd> checkout,
    // resolveRepoPath('EHG_Engineer') returns the worktree path (`EHG_Engineer/.worktrees/<sd>`)
    // not the main root. This is documented behavior of ENGINEER_ROOT in lib/repo-paths.js — see
    // getRepoRoot() which strips the worktree suffix for callers needing main. Cross-repo sub-agents
    // intentionally use this worktree-relative resolution so they validate in-progress changes.
    expect(result.repoPath).toMatch(/EHG_Engineer/);
    expect(result.registrySource).toBe('registry');
  });

  it('Unknown sub-agent code defaults to supports_cross_repo=true', async () => {
    const result = await resolveSubAgentRepo({
      sdId: 'TEST-004',
      targetApplication: 'EHG_Engineer',
      subAgentCode: 'NONEXISTENT_AGENT',
    });
    expect(result.repoResolved).toBe(true);
    expect(result.registrySource).toBe('registry');
  });
});

describe('getSubAgentCapability', () => {
  beforeEach(() => clearRegistryCache());

  it('DESIGN declared supports_cross_repo=true with probe_path=src/components', () => {
    const cap = getSubAgentCapability('DESIGN');
    expect(cap.supports_cross_repo).toBe(true);
    expect(cap.probe_path).toBe('src/components');
  });

  it('DATABASE_SCHEMA declared supports_cross_repo=false with only_repo=EHG_Engineer', () => {
    const cap = getSubAgentCapability('DATABASE_SCHEMA');
    expect(cap.supports_cross_repo).toBe(false);
    expect(cap.only_repo).toBe('EHG_Engineer');
    expect(cap.skip_reason).toBe('sub_agent_engineer_only');
  });

  it('Unknown sub-agent inherits default policy (cross-repo supported)', () => {
    const cap = getSubAgentCapability('TOTALLY_NEW_AGENT_XYZ');
    expect(cap.supports_cross_repo).toBe(true);
  });
});

describe('applySubAgentRepoVerdict', () => {
  it('emits metadata.repo_path + executed_from_cwd top-level (storage-strip contract)', () => {
    const results = { verdict: 'PASS', confidence: 100, warnings: [] };
    const resolution = {
      repoPath: '/some/path',
      repoResolved: true,
      registrySource: 'db',
    };
    applySubAgentRepoVerdict(results, resolution);
    expect(results.metadata.repo_path).toBe('/some/path');
    expect(results.metadata.repo_resolved).toBe(true);
    expect(results.metadata.registry_source).toBe('db');
    expect(results.metadata.executed_from_cwd).toBe(process.cwd());
  });

  it('downgrades PASS to CONDITIONAL_PASS when unresolved (fail-closed)', () => {
    const results = { verdict: 'PASS', confidence: 100, warnings: [] };
    const resolution = {
      repoPath: null,
      repoResolved: false,
      registrySource: 'fallback',
    };
    applySubAgentRepoVerdict(results, resolution);
    expect(results.verdict).toBe('CONDITIONAL_PASS');
    expect(results.confidence).toBe(60);
    expect(results.warnings).toHaveLength(1);
    expect(results.warnings[0].severity).toBe('HIGH');
  });

  it('does NOT downgrade when skip_reason present (legitimate capability skip)', () => {
    const results = { verdict: 'PASS', confidence: 100, warnings: [] };
    const resolution = {
      repoPath: '/engineer',
      repoResolved: true,
      registrySource: 'skipped',
      skipReason: 'sub_agent_engineer_only',
    };
    applySubAgentRepoVerdict(results, resolution);
    expect(results.verdict).toBe('PASS');
    expect(results.metadata.skip_reason).toBe('sub_agent_engineer_only');
  });

  it('skipVerdictAdjust=true emits metadata but never touches verdict (STORIES_CODEBASE shape)', () => {
    const results = { verdict: 'PASS', confidence: 100, warnings: [] };
    const resolution = { repoPath: null, repoResolved: false, registrySource: 'fallback' };
    applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: true });
    expect(results.verdict).toBe('PASS');
    expect(results.metadata.repo_path).toBeNull();
  });

  it('downgrades PASS to CONDITIONAL_PASS when probe missing (HEALTHY but empty tree)', () => {
    const results = { verdict: 'PASS', confidence: 100, warnings: [] };
    const resolution = {
      repoPath: '/some/path',
      repoResolved: true,
      registrySource: 'db',
      probeExists: false,
    };
    applySubAgentRepoVerdict(results, resolution);
    expect(results.verdict).toBe('CONDITIONAL_PASS');
    expect(results.metadata.probe_exists).toBe(false);
  });
});
