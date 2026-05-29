/**
 * SD-LEO-INFRA-VENTURE-SUBAGENT-RESOLUTION-001 (F11) — latest-row-per-(sub_agent_code,phase)
 * dedup regression pin for the SUB_AGENT_REPO_RESOLUTION gate.
 *
 * Before the fix the gate classified ALL rows for an SD, so an OLD wrong-repo row kept
 * failing the gate even after a corrected re-run produced a green row. The gate now keeps
 * only the latest row per (sub_agent_code, phase) by created_at (id DESC tie-break) before
 * classifying. These tests assert: (a) a newer compliant row supersedes an older violation
 * (PASS), (b) the dedup does NOT false-pass when the LATEST row is itself a violation, and
 * (c) tie-break determinism when created_at is equal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSubAgentRepoResolutionGate } from '../../../scripts/modules/handoff/executors/plan-to-exec/gates/sub-agent-repo-resolution.js';

function buildSupabase({ viewRows = [], rawRows = [], children = [] } = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'v_sub_agent_repo_compliance') {
        return { select: () => ({ in: () => Promise.resolve({ data: viewRows, error: null }) }) };
      }
      if (table === 'sub_agent_execution_results') {
        return { select: () => ({ in: () => Promise.resolve({ data: rawRows, error: null }) }) };
      }
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ eq: () => Promise.resolve({ data: children, error: null }) }) };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    })
  };
}

const VENTURE = '/path/to/crongenius';
const EHG = '/path/to/ehg';
const makeSD = (o = {}) => ({ id: 'sd-uuid-x', sd_key: 'SD-TEST-VENTURE-001', target_application: 'CronGenius', ...o });

// DESIGN row factory for target=CronGenius. `good` => metadata matches expected (compliant).
function designRow(id, created_at, good) {
  return {
    id, created_at,
    sub_agent_code: 'DESIGN',
    phase: 'PLAN',
    target_application: 'CronGenius',
    expected_repo_path: VENTURE,
    metadata_repo_path: good ? VENTURE : EHG,
    metadata_repo_resolved: true,
    executed_from_cwd: '/path/to/EHG_Engineer',
    compliance_status: good ? 'compliant' : 'violation'
  };
}
const rawRow = (id, repoPath) => ({ id, sub_agent_code: 'DESIGN', metadata: { repo_path: repoPath, repo_resolved: true } });

describe('SUB_AGENT_REPO_RESOLUTION gate — F11 latest-row dedup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('PASSES when a NEWER compliant DESIGN row supersedes an OLDER violation row (same code+phase)', async () => {
    const viewRows = [
      designRow('old1', '2026-05-27T10:00:00.000000+00:00', false), // older, wrong repo
      designRow('new1', '2026-05-27T12:00:00.000000+00:00', true)   // newer, correct repo
    ];
    const rawRows = [rawRow('old1', EHG), rawRow('new1', VENTURE)];
    const gate = createSubAgentRepoResolutionGate(buildSupabase({ viewRows, rawRows }));

    const result = await gate.validator({ sd: makeSD() });

    expect(result.passed).toBe(true);
    // The older violation row must NOT appear in any blocking detail (it was deduped out).
    const ids = JSON.stringify(result.details || {});
    expect(ids).not.toContain('old1');
  });

  it('does NOT false-pass: when the LATEST row is itself a violation, the gate still FAILS', async () => {
    const viewRows = [
      designRow('old1', '2026-05-27T10:00:00.000000+00:00', true),  // older, was correct
      designRow('new1', '2026-05-27T12:00:00.000000+00:00', false)  // newer, regressed to wrong repo
    ];
    const rawRows = [rawRow('old1', VENTURE), rawRow('new1', EHG)];
    const gate = createSubAgentRepoResolutionGate(buildSupabase({ viewRows, rawRows }));

    const result = await gate.validator({ sd: makeSD() });

    expect(result.passed).toBe(false); // latest row is the violation — dedup keeps it, must fail
  });

  it('tie-break: equal created_at resolves deterministically to the max id (compliant wins)', async () => {
    const ts = '2026-05-27T11:00:00.000000+00:00';
    const viewRows = [
      designRow('aaa', ts, false), // violation, lower id
      designRow('zzz', ts, true)   // compliant, higher id -> wins the tie-break
    ];
    const rawRows = [rawRow('aaa', EHG), rawRow('zzz', VENTURE)];
    const gate = createSubAgentRepoResolutionGate(buildSupabase({ viewRows, rawRows }));

    const result = await gate.validator({ sd: makeSD() });

    expect(result.passed).toBe(true);
  });

  it('does NOT collapse sibling SDs: same code+phase across different sd_id stay separate', async () => {
    // collectSdScope() pulls the parent SD + all children into viewRows, so the dedup key
    // includes sd_id. A later compliant CHILD-A row must NOT mask an earlier wrong-repo
    // CHILD-B violation under a shared DESIGN::PLAN bucket — the gate must still FAIL.
    const childA = { ...designRow('rA', '2026-05-27T12:00:00.000000+00:00', true), sd_id: 'child-A' };
    const childB = { ...designRow('rB', '2026-05-27T10:00:00.000000+00:00', false), sd_id: 'child-B' };
    const rawRows = [rawRow('rA', VENTURE), rawRow('rB', EHG)];
    const supabase = buildSupabase({ viewRows: [childA, childB], rawRows, children: [{ id: 'child-A' }, { id: 'child-B' }] });
    const gate = createSubAgentRepoResolutionGate(supabase);

    const result = await gate.validator({ sd: makeSD({ id: 'parent-x' }) });

    expect(result.passed).toBe(false); // child-B's violation must NOT be masked by child-A's compliant row
  });
});
