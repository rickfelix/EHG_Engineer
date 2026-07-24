/**
 * QF-20260724-212: get_progress_breakdown() must treat 'deferred' as a terminal
 * child status, same as 'completed'/'cancelled' -- companion to QF-20260724-703
 * (JS-side prerequisite-check.js fix). Without this, an orchestrator parent whose
 * children are (completed + deferred) passes PLAN-TO-LEAD (JS-side, fixed) but
 * RE-BLOCKS at LEAD-FINAL-APPROVAL when this distinct SQL function recomputes
 * progress and treats the deferred child as still-incomplete.
 *
 * Real, non-mocked Supabase RPC test. Creates disposable orchestrator parent +
 * children, calls the live get_progress_breakdown RPC, cleans up in afterAll.
 */
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseServiceClient();

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

const ts = Date.now();
const createdIds = [];

async function createSD({ title, sd_type, status, parent_sd_id }) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: randomUUID(),
      title,
      description: `Disposable test SD for QF-20260724-212 (${title})`,
      rationale: 'Disposable test fixture for QF-20260724-212',
      strategic_intent: 'Disposable test fixture for QF-20260724-212',
      scope: 'Disposable test fixture for QF-20260724-212',
      sd_key: `QF-20260724-212-${title.replace(/\s+/g, '-')}-${ts}`,
      sd_type,
      status,
      parent_sd_id: parent_sd_id || null,
      category: 'test',
      priority: 'low',
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create SD "${title}": ${error.message}`);
  createdIds.push(data.id);
  return data.id;
}

describe.skipIf(!HAS_REAL_DB)('QF-20260724-212: get_progress_breakdown treats deferred as terminal', () => {
  let parentId;

  beforeAll(async () => {
    // trg_enforce_parent_orchestrator_type auto-promotes ANY parent with children to
    // sd_type='orchestrator' -- which HAS an active sd_workflow_templates row, so the
    // function's template branch (step.completion_signal='children:all_complete') is
    // the only branch reachable for a real parent+children setup. The template
    // branch's step_progress computation reuses the SAME completed_children variable
    // this QF's fix corrects, so it is exercised here too, just via a differently
    // shaped phase_breakdown (no total_children/cancelled_children sub-fields).
    parentId = await createSD({ title: 'Parent Orchestrator', sd_type: 'orchestrator', status: 'in_progress' });
    await createSD({ title: 'Child A', sd_type: 'feature', status: 'completed', parent_sd_id: parentId });
    await createSD({ title: 'Child B', sd_type: 'feature', status: 'deferred', parent_sd_id: parentId });
  });

  afterAll(async () => {
    // Children first (FK), then parent.
    for (const id of createdIds.slice(1)) {
      await supabase.from('strategic_directives_v2').delete().eq('id', id);
    }
    await supabase.from('strategic_directives_v2').delete().eq('id', createdIds[0]);
  });

  it('counts a (completed + deferred) child set as fully terminal (100% CHILDREN_completion)', async () => {
    // Call via raw SQL with an explicit ::text cast -- PostgREST's .rpc() cannot
    // disambiguate get_progress_breakdown(text) vs get_progress_breakdown(uuid)
    // when the argument value happens to be a syntactically valid UUID string
    // (PGRST203, pre-existing overload-resolution limitation, out of this QF's scope).
    // strategic_directives_v2.id is character varying, not native uuid.
    const client = await createDatabaseClient('engineer', { verify: false });
    let rows;
    try {
      ({ rows } = await client.query('SELECT get_progress_breakdown($1::text) AS result', [parentId]));
    } finally {
      await client.end();
    }
    const data = rows[0].result;
    expect(data.is_orchestrator).toBe(true);

    // This DB's active sd_type='orchestrator' workflow template routes through the
    // template branch of get_progress_breakdown (not the hardcoded-weights branch),
    // whose phase_breakdown entries carry {weight, complete, progress, step_order,
    // source} -- no total_children/completed_children fields (those are hardcoded-
    // branch-only). Assert on the shared invariant (deferred counts as terminal ->
    // CHILDREN_completion fully credited -> 100% overall) rather than a fixed weight,
    // so this test doesn't couple to which branch a given SD happens to route through.
    const childrenPhase = data.phase_breakdown.CHILDREN_completion;
    expect(childrenPhase).toBeDefined();
    expect(childrenPhase.complete).toBe(true);
    expect(childrenPhase.progress).toBe(childrenPhase.weight);
    expect(data.total_progress).toBe(100);
  });
});
