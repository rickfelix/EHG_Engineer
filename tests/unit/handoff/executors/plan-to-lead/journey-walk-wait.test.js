/**
 * SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001 FR-3: PREREQUISITE_HANDOFF_CHECK's third WAIT
 * condition. A venture sprint orchestrator carrying FR-1/FR-1b metadata.journey_steps
 * must not reach LEAD-FINAL until metadata.journey_walk_result.status === 'pass'.
 * journey_walk_result is not yet written by anything in this codebase — PR 3 (FR-2, the
 * browser-executor walker) is the first real writer — so every orchestrator with
 * journey_steps WAITs until that lands. Keyed strictly on metadata.journey_steps
 * presence, never on sd_type (mirrors the existing two WAIT conditions in this gate).
 */
import { describe, it, expect } from 'vitest';
import { createPrerequisiteCheckGate } from '../../../../../scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js';

function makeParentSupabase({ parentId, children }) {
  const emptyTail = {
    eq: () => emptyTail,
    order: () => ({ limit: async () => ({ data: [], error: null }) }),
  };
  return {
    from(table) {
      return {
        select() {
          return {
            eq(column, value) {
              if (table === 'strategic_directives_v2' && column === 'parent_sd_id' && value === parentId) {
                return { async then(resolve) { resolve({ data: children, error: null }); return Promise.resolve(); } };
              }
              return { async maybeSingle() { return { data: null, error: null }; }, ...emptyTail };
            },
          };
        },
      };
    },
  };
}

const ALL_COMPLETE_CHILDREN = [
  { id: 'child-a', sd_key: 'SD-CHILD-A', status: 'completed' },
  { id: 'child-b', sd_key: 'SD-CHILD-B', status: 'completed' },
];

async function runGate(parentId, children, metadata) {
  const supabase = makeParentSupabase({ parentId, children });
  const gate = createPrerequisiteCheckGate(supabase);
  const ctx = { sd: { id: parentId, sd_key: 'SD-PARENT', metadata }, sdId: parentId };
  return gate.validator(ctx);
}

describe('SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001 FR-3: journey-walk WAIT condition', () => {
  it('no journey_steps in metadata → PASS as before (regression-safe)', async () => {
    const result = await runGate('p1', ALL_COMPLETE_CHILDREN, {});
    expect(result.wait).not.toBe(true);
    expect(result.passed).toBe(true);
  });

  it('journey_steps present, no journey_walk_result at all → WAIT (absent)', async () => {
    const result = await runGate('p2', ALL_COMPLETE_CHILDREN, {
      journey_steps: [{ step_id: 'stp-aaaa-upload' }],
    });
    expect(result.wait).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.wait_reason).toContain('absent');
    expect(result.details.journey_walk_status).toBe('absent');
    expect(result.details.journey_step_count).toBe(1);
  });

  it("journey_steps present, journey_walk_result.status='fail' → WAIT (fail)", async () => {
    const result = await runGate('p3', ALL_COMPLETE_CHILDREN, {
      journey_steps: [{ step_id: 'stp-aaaa-upload' }, { step_id: 'stp-bbbb-generate' }],
      journey_walk_result: { status: 'fail', failed_step_id: 'stp-bbbb-generate' },
    });
    expect(result.wait).toBe(true);
    expect(result.wait_reason).toContain("'fail'");
    expect(result.details.journey_walk_status).toBe('fail');
    expect(result.details.journey_step_count).toBe(2);
  });

  it("journey_steps present, journey_walk_result.status='pass' → PASS (no wait)", async () => {
    const result = await runGate('p4', ALL_COMPLETE_CHILDREN, {
      journey_steps: [{ step_id: 'stp-aaaa-upload' }],
      journey_walk_result: { status: 'pass' },
    });
    expect(result.wait).not.toBe(true);
    expect(result.passed).toBe(true);
  });

  it('journey_steps is an empty array → treated as no journey_steps (PASS, not WAIT)', async () => {
    const result = await runGate('p5', ALL_COMPLETE_CHILDREN, { journey_steps: [] });
    expect(result.wait).not.toBe(true);
    expect(result.passed).toBe(true);
  });

  it('incomplete children take precedence over the journey-walk check', async () => {
    const children = [
      { id: 'child-a', sd_key: 'SD-CHILD-A', status: 'completed' },
      { id: 'child-f', sd_key: 'SD-CHILD-F', status: 'in_progress' },
    ];
    const result = await runGate('p6', children, {
      journey_steps: [{ step_id: 'stp-aaaa-upload' }],
    });
    expect(result.wait).toBe(true);
    expect(result.wait_reason).toContain('SD-CHILD-F');
    expect(result.wait_reason).not.toContain('journey');
  });
});
