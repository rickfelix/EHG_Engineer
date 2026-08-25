/**
 * SD-LEO-INFRA-SUB-AGENT-REPO-001 — applySubAgentRepoVerdict's insertable-by-construction
 * contract. Deliberately a SEPARATE, non-quarantined file: tests/unit/resolve-sub-agent-repo.test.js
 * (where these tests originally lived) is pre-existing quarantined (tests/quarantine-manifest.json,
 * since 2026-06-28, for an unrelated Windows/Linux path assertion-drift issue) and therefore
 * invisible to CI's `unit` project — new tests added there would be silently CI-blind (a deep-tier
 * adversarial review caught this before merge).
 */
import { describe, it, expect } from 'vitest';
import { applySubAgentRepoVerdict } from '../../../lib/sub-agents/resolve-repo.js';

describe('applySubAgentRepoVerdict — insertable-by-construction on downgrade (SD-LEO-INFRA-SUB-AGENT-REPO-001)', () => {
  // Mirrors the check_conditions_required / check_justification_required CHECK constraints
  // (database/migrations/20251115114444_add_validation_modes_to_sub_agent_results.sql) so this
  // test fails the same way an actual INSERT would (23514) if the writer regresses, without
  // needing a live DB connection.
  function wouldPassDbConstraints(row) {
    if (row.verdict !== 'CONDITIONAL_PASS') return true;
    const conditionsOk = Array.isArray(row.conditions) && row.conditions.length > 0;
    const justificationOk = typeof row.justification === 'string' && row.justification.length >= 50;
    return conditionsOk && justificationOk;
  }

  it('the Golf-5 specimen shape ({repoPath:null,repoResolved:false,registrySource:"fallback"}) becomes insertable', () => {
    const results = { verdict: 'PASS', confidence: 100, warnings: [] };
    const resolution = { repoPath: null, repoResolved: false, registrySource: 'fallback' };
    applySubAgentRepoVerdict(results, resolution);
    expect(results.verdict).toBe('CONDITIONAL_PASS');
    expect(Array.isArray(results.conditions)).toBe(true);
    expect(results.conditions.length).toBeGreaterThan(0);
    expect(results.conditions[0]).toMatchObject({ priority: 'medium', blocking: false });
    expect(typeof results.justification).toBe('string');
    expect(results.justification.length).toBeGreaterThanOrEqual(50);
    expect(wouldPassDbConstraints(results)).toBe(true);
  });

  it('does not populate conditions/justification when the resolution is healthy (no downgrade)', () => {
    const results = { verdict: 'PASS', confidence: 100, warnings: [] };
    const resolution = { repoPath: '/some/path', repoResolved: true, registrySource: 'db' };
    applySubAgentRepoVerdict(results, resolution);
    expect(results.verdict).toBe('PASS');
    expect(results.conditions).toBeUndefined();
    expect(results.justification).toBeUndefined();
  });

  it('does not populate conditions/justification on a legitimate capability skip', () => {
    const results = { verdict: 'PASS', confidence: 100, warnings: [] };
    const resolution = { repoPath: '/engineer', repoResolved: true, registrySource: 'skipped', skipReason: 'sub_agent_engineer_only' };
    applySubAgentRepoVerdict(results, resolution);
    expect(results.verdict).toBe('PASS');
    expect(results.conditions).toBeUndefined();
    expect(results.justification).toBeUndefined();
  });

  it('preserves a caller-supplied conditions/justification instead of overwriting them', () => {
    const results = {
      verdict: 'PASS',
      confidence: 100,
      warnings: [],
      conditions: [{ action: 'caller-supplied condition', priority: 'high', blocking: true }],
      justification: 'This is the caller-supplied justification, already long enough to satisfy the DB check constraint.',
    };
    const resolution = { repoPath: null, repoResolved: false, registrySource: 'fallback' };
    applySubAgentRepoVerdict(results, resolution);
    expect(results.conditions).toHaveLength(1);
    expect(results.conditions[0].action).toBe('caller-supplied condition');
    expect(results.justification).toMatch(/^This is the caller-supplied justification/);
  });

  it('does NOT alias metadata.repo_path to executed_from_cwd on registry miss (would false-trigger cwd_leak)', () => {
    // Regression guard for the pivot documented in the LEAD Explore evidence: the
    // v_sub_agent_repo_compliance view (database/migrations/20260604_fix_v_sub_agent_repo_compliance_case_insensitive.sql)
    // classifies a row as 'cwd_leak' whenever metadata->>'repo_path' equals executed_from_cwd
    // (non-null). Aliasing repo_path to executed_from_cwd on every registry miss would make every
    // such row false-classify instead of the already-correct 'explicit_null'/'explicit_null_intra'
    // the gate computes from null.
    const results = { verdict: 'PASS', confidence: 100, warnings: [] };
    const resolution = { repoPath: null, repoResolved: false, registrySource: 'fallback' };
    applySubAgentRepoVerdict(results, resolution);
    expect(results.metadata.repo_path).toBeNull();
    expect(results.metadata.repo_path).not.toBe(results.metadata.executed_from_cwd);
    // repo_resolved:false is the existing, already-gate-consumed explicit failure marker.
    expect(results.metadata.repo_resolved).toBe(false);
  });
});
