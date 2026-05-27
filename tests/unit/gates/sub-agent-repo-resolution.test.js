/**
 * SUB_AGENT_REPO_RESOLUTION Gate -- Unit Tests
 * SD-LEO-INFRA-FLEET-WIDE-SUB-001 / FR-3
 *
 * Validates the PLAN-TO-EXEC gate that checks every sub_agent_execution_results
 * row for the SD ran against the correct repo. The gate trusts the
 * v_sub_agent_repo_compliance view for base classification and augments with
 * raw metadata for SKIPPED / EMPTY_PROBE.
 *
 * Critical backward-compat invariant: SDs whose sub-agent rows are all LEGACY
 * (no metadata.repo_path key) must PASS at 100. This is what protects the
 * ~23k pre-existing rows from regressing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createSubAgentRepoResolutionGate,
  REASON_CODES
} from '../../../scripts/modules/handoff/executors/plan-to-exec/gates/sub-agent-repo-resolution.js';

/**
 * Build a mock Supabase client that returns different rows per table.
 *
 * @param {Object} opts
 * @param {Array}  opts.viewRows - rows from v_sub_agent_repo_compliance
 * @param {Array}  opts.rawRows  - rows from sub_agent_execution_results
 * @param {Array}  opts.children - child SD rows from strategic_directives_v2
 */
function buildSupabase({ viewRows = [], rawRows = [], children = [] } = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'v_sub_agent_repo_compliance') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: viewRows, error: null })
          })
        };
      }
      if (table === 'sub_agent_execution_results') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: rawRows, error: null })
          })
        };
      }
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: children, error: null })
          })
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    })
  };
}

function makeSD(overrides = {}) {
  return {
    id: 'sd-uuid-abc',
    sd_key: 'SD-TEST-CROSSREPO-001',
    target_application: 'ehg',
    ...overrides
  };
}

describe('SUB_AGENT_REPO_RESOLUTION gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct gate shape', () => {
    const gate = createSubAgentRepoResolutionGate(buildSupabase());
    expect(gate.name).toBe('SUB_AGENT_REPO_RESOLUTION');
    expect(gate.required).toBe(true);
    expect(typeof gate.validator).toBe('function');
  });

  it('PASSES @ 100 for cross-repo SD with all HEALTHY rows', async () => {
    const viewRows = [
      {
        id: 'r1',
        sub_agent_code: 'DESIGN',
        phase: 'PLAN',
        target_application: 'ehg',
        expected_repo_path: '/path/to/ehg',
        metadata_repo_path: '/path/to/ehg',
        metadata_repo_resolved: true,
        executed_from_cwd: '/path/to/EHG_Engineer',
        compliance_status: 'compliant'
      },
      {
        id: 'r2',
        sub_agent_code: 'DATABASE',
        phase: 'PLAN',
        target_application: 'ehg',
        expected_repo_path: '/path/to/ehg',
        metadata_repo_path: '/path/to/ehg',
        metadata_repo_resolved: true,
        executed_from_cwd: '/path/to/EHG_Engineer',
        compliance_status: 'compliant'
      }
    ];
    const rawRows = [
      { id: 'r1', sub_agent_code: 'DESIGN', metadata: { repo_path: '/path/to/ehg', repo_resolved: true } },
      { id: 'r2', sub_agent_code: 'DATABASE', metadata: { repo_path: '/path/to/ehg', repo_resolved: true } }
    ];
    const supabase = buildSupabase({ viewRows, rawRows });
    const gate = createSubAgentRepoResolutionGate(supabase);

    const result = await gate.validator({ sd: makeSD() });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.details.status).toBe('all_healthy');
    expect(result.details.buckets.healthy).toHaveLength(2);
  });

  // BACKWARD COMPAT: this is the critical test. If it fails, every PLAN-TO-EXEC
  // on the ~23k legacy rows would BLOCK.
  it('PASSES @ 100 for SD with all LEGACY rows (no repo_path key) — backward compat', async () => {
    const viewRows = [
      {
        id: 'L1',
        sub_agent_code: 'TESTING',
        phase: 'PLAN',
        target_application: 'EHG_Engineer',
        expected_repo_path: '/path/to/EHG_Engineer',
        metadata_repo_path: null,            // view emits null when key absent
        metadata_repo_resolved: null,
        executed_from_cwd: null,
        compliance_status: 'legacy'
      },
      {
        id: 'L2',
        sub_agent_code: 'SECURITY',
        phase: 'PLAN',
        target_application: 'EHG_Engineer',
        expected_repo_path: '/path/to/EHG_Engineer',
        metadata_repo_path: null,
        metadata_repo_resolved: null,
        executed_from_cwd: null,
        compliance_status: 'legacy'
      }
    ];
    const rawRows = [
      { id: 'L1', sub_agent_code: 'TESTING', metadata: { score: 88 } },   // no repo_path key
      { id: 'L2', sub_agent_code: 'SECURITY', metadata: { findings: [] } }
    ];
    const supabase = buildSupabase({ viewRows, rawRows });
    const gate = createSubAgentRepoResolutionGate(supabase);

    const result = await gate.validator({ sd: makeSD({ target_application: 'EHG_Engineer' }) });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.details.buckets.legacy).toHaveLength(2);
  });

  it('BLOCKED with SUB_AGENT_REPO_UNRESOLVED for cross-repo SD with unresolved row', async () => {
    const viewRows = [
      {
        id: 'U1',
        sub_agent_code: 'DESIGN',
        phase: 'PLAN',
        target_application: 'ehg',
        expected_repo_path: '/path/to/ehg',
        metadata_repo_path: null,
        metadata_repo_resolved: false,
        executed_from_cwd: '/path/to/EHG_Engineer',
        compliance_status: 'explicit_null'  // view sees the null path; gate re-classifies via repo_resolved
      }
    ];
    const rawRows = [
      { id: 'U1', sub_agent_code: 'DESIGN', metadata: { repo_path: null, repo_resolved: false } }
    ];
    const supabase = buildSupabase({ viewRows, rawRows });
    const gate = createSubAgentRepoResolutionGate(supabase);

    // Cross-repo target (NOT EHG / EHG_Engineer) → unresolved is BLOCKING
    const result = await gate.validator({ sd: makeSD({ target_application: 'crongenius' }) });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    // explicit_null wins priority over unresolved in the gate-level reasonCode
    // (CWD_LEAK > VIOLATION > EXPLICIT_NULL > UNRESOLVED)
    expect(result.reasonCode).toBe(REASON_CODES.EXPLICIT_NULL);
    expect(result.issues.some(i => i.includes('DESIGN'))).toBe(true);
  });

  it('BLOCKED with SUB_AGENT_REPO_CWD_LEAK for cross-repo SD with cwd_leak row', async () => {
    const viewRows = [
      {
        id: 'C1',
        sub_agent_code: 'DESIGN',
        phase: 'PLAN',
        target_application: 'ehg',
        expected_repo_path: '/path/to/ehg',
        metadata_repo_path: '/path/to/EHG_Engineer',
        metadata_repo_resolved: true,
        executed_from_cwd: '/path/to/EHG_Engineer',
        compliance_status: 'cwd_leak'
      }
    ];
    const rawRows = [
      { id: 'C1', sub_agent_code: 'DESIGN', metadata: { repo_path: '/path/to/EHG_Engineer', repo_resolved: true } }
    ];
    const supabase = buildSupabase({ viewRows, rawRows });
    const gate = createSubAgentRepoResolutionGate(supabase);

    const result = await gate.validator({ sd: makeSD() });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasonCode).toBe(REASON_CODES.CWD_LEAK);
    expect(result.details.blockingDetails[0].reasonCode).toBe(REASON_CODES.CWD_LEAK);
    expect(result.remediation).toMatch(/resolveSubAgentRepo/);
  });

  it('BLOCKED with SUB_AGENT_REPO_EXPLICIT_NULL for cross-repo SD with explicit_null row', async () => {
    const viewRows = [
      {
        id: 'E1',
        sub_agent_code: 'DATABASE',
        phase: 'PLAN',
        target_application: 'ehg',
        expected_repo_path: '/path/to/ehg',
        metadata_repo_path: null,
        metadata_repo_resolved: null,
        executed_from_cwd: null,
        compliance_status: 'explicit_null'
      }
    ];
    const rawRows = [
      // key present, value null — distinct from LEGACY (key absent)
      { id: 'E1', sub_agent_code: 'DATABASE', metadata: { repo_path: null } }
    ];
    const supabase = buildSupabase({ viewRows, rawRows });
    const gate = createSubAgentRepoResolutionGate(supabase);

    const result = await gate.validator({ sd: makeSD() });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasonCode).toBe(REASON_CODES.EXPLICIT_NULL);
  });

  it('CONDITIONAL_PASS in 60-80 band for mixed HEALTHY + SKIPPED', async () => {
    const viewRows = [
      {
        id: 'H1',
        sub_agent_code: 'DESIGN',
        phase: 'PLAN',
        target_application: 'ehg',
        expected_repo_path: '/path/to/ehg',
        metadata_repo_path: '/path/to/ehg',
        metadata_repo_resolved: true,
        executed_from_cwd: '/path/to/EHG_Engineer',
        compliance_status: 'compliant'
      },
      {
        id: 'S1',
        sub_agent_code: 'PUSH_ENFORCER',
        phase: 'PLAN',
        target_application: 'ehg',
        expected_repo_path: '/path/to/ehg',
        metadata_repo_path: null,
        metadata_repo_resolved: null,
        executed_from_cwd: null,
        // view will mark this 'legacy' (no repo_path key in metadata) but
        // skip_reason re-classifies it to SKIPPED in the gate's logic
        compliance_status: 'legacy'
      }
    ];
    const rawRows = [
      { id: 'H1', sub_agent_code: 'DESIGN', metadata: { repo_path: '/path/to/ehg', repo_resolved: true } },
      { id: 'S1', sub_agent_code: 'PUSH_ENFORCER', metadata: { skip_reason: 'sub_agent_engineer_only' } }
    ];
    const supabase = buildSupabase({ viewRows, rawRows });
    const gate = createSubAgentRepoResolutionGate(supabase);

    const result = await gate.validator({ sd: makeSD() });

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThanOrEqual(80);
    expect(result.details.status).toBe('conditional_pass');
    expect(result.details.buckets.skipped).toHaveLength(1);
    expect(result.details.buckets.healthy).toHaveLength(1);
    expect(result.warnings.some(w => w.includes('SUB_AGENT_REPO_SKIPPED'))).toBe(true);
  });

  it('advisory PASS @ 100 when SD has no sub_agent rows', async () => {
    const supabase = buildSupabase({ viewRows: [], rawRows: [] });
    const gate = createSubAgentRepoResolutionGate(supabase);

    const result = await gate.validator({ sd: makeSD() });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.status).toBe('no_rows');
    expect(result.details.rows_scanned).toBe(0);
  });

  it('non-blocking warning on DB error', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'strategic_directives_v2') {
          return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
        }
        return {
          select: () => ({
            in: () => Promise.resolve({ data: null, error: { message: 'connection refused' } })
          })
        };
      })
    };
    const gate = createSubAgentRepoResolutionGate(supabase);

    const result = await gate.validator({ sd: makeSD() });

    expect(result.passed).toBe(true);   // non-blocking on infra errors
    expect(result.score).toBe(50);
    expect(result.warnings.some(w => w.includes('connection refused'))).toBe(true);
  });
});
