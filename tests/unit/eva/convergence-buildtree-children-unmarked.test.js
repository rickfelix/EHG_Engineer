/**
 * SD-LEO-INFRA-CONVERGENCE-BUILDTREE-CHILDREN-UNMARKED-001 (FR-3) — NON-MOCKED regression.
 *
 * At S19 build-tree spawn, the CLONE path marks every spawned SD metadata.test_clone_build_tree=true (the
 * marker lib/fleet/claim-eligibility.cjs classifyDispatchIneligibility + the belt gauge read to exclude a
 * throwaway tree), but the NON-CLONE CONVERGENCE-SUBJECT path (isConvergenceSubject) never set it — so 21
 * dummy SDs (run#3 ffc12de9) landed CLAIMABLE, inflating the belt gauge. The fix ORs isConvergenceSubject
 * into the throwaway-tree flag, reusing the SAME test_clone_build_tree marker.
 *
 * These drive REAL convertSprintToSDs + REAL isConvergenceSubject (only the DB seam is an in-memory double
 * that CAPTURES inserted metadata) and the REAL classifyDispatchIneligibility. Anti-test-masking: the
 * convergence-subject assertion fails if the union is removed (rows would carry no marker), and the
 * real-venture assertion fails if the gate is not strict (a real tree wrongly fenced).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { convertSprintToSDs } from '../../../lib/eva/lifecycle-sd-bridge.js';
const require = createRequire(import.meta.url);
const { classifyDispatchIneligibility } = require('../../../lib/fleet/claim-eligibility.cjs');

const silent = { log() {}, warn() {}, error() {} };
const CONVERGENCE_KEY = (vid) => `venture:${vid}:convergence_subject`;

// Capturing in-memory Supabase double. Records every strategic_directives_v2 insert (so we can inspect the
// spawned rows' metadata), serves the vision refusal-gate + ventures flags + eva_venture_config reads.
function makeCapturingSb({ ventureId, convergenceSubject = false, seededFrom = null } = {}) {
  const inserted = [];
  const vision = { vision_key: 'VISION-TEST-L2-001', version: 'v1', content: 'x', updated_at: '2026-05-27', status: 'active', chairman_approved: true, level: 'L2' };
  const from = (table) => {
    if (table === 'eva_vision_documents') {
      const c = { select: () => c, eq: () => c, in: () => c, order: () => c, limit: () => c, maybeSingle: async () => ({ data: vision, error: null }) };
      return c;
    }
    if (table === 'ventures') {
      const c = { select: () => c, eq: () => c, maybeSingle: async () => ({ data: { is_demo: false, is_scaffolding: false, seeded_from_venture_id: seededFrom }, error: null }) };
      return c;
    }
    if (table === 'eva_venture_config') {
      // isConvergenceSubject: .select('value').eq('key', CONVERGENCE_KEY).maybeSingle()
      let wantKey = null;
      const c = {
        select: () => c,
        eq: (col, val) => { if (col === 'key') wantKey = val; return c; },
        maybeSingle: async () => {
          if (convergenceSubject && wantKey === CONVERGENCE_KEY(ventureId)) return { data: { value: true }, error: null };
          return { data: null, error: null };
        },
      };
      return c;
    }
    if (table === 'strategic_directives_v2') {
      const c = {
        select: () => c, eq: () => c,
        limit: async () => ({ data: [], error: null }),   // no existing orchestrator
        order: async () => ({ data: [], error: null }),
        insert: async (row) => { inserted.push(row); return { data: null, error: null }; },
        update: () => c,
        single: async () => ({ data: null, error: null }),
      };
      return c;
    }
    // default: benign
    const c = { select: () => c, eq: () => c, in: () => c, order: () => c, limit: async () => ({ data: [], error: null }), maybeSingle: async () => ({ data: null, error: null }), insert: async () => ({ data: null, error: null }) };
    return c;
  };
  return { sb: { from, rpc: async () => ({ data: { cancelled_sds: 0, cancelled_prds: 0 }, error: null }) }, inserted };
}

const sprintParams = (ventureId) => ({
  stageOutput: {
    sprint_name: 'Sprint 1', sprint_goal: 'Build',
    sd_bridge_payloads: [{ title: 'Feature A', type: 'feature', description: 'Desc', scope: 'Scope', success_criteria: 'sc' }],
  },
  ventureContext: { id: ventureId, name: 'ConvTest' },
  options: { skipEnrichment: true, generateGrandchildren: true },
});

const markerOf = (row) => row?.metadata?.test_clone_build_tree === true;

describe('convergence-subject build-tree fencing (SD-LEO-INFRA-CONVERGENCE-BUILDTREE-CHILDREN-UNMARKED-001)', () => {
  it('FR-1: a convergence subject stamps EVERY spawned SD (parent + child + grandchild) test_clone_build_tree=true', async () => {
    const { sb, inserted } = makeCapturingSb({ ventureId: 'v-conv-1', convergenceSubject: true });
    const res = await convertSprintToSDs(sprintParams('v-conv-1'), { supabase: sb, logger: silent });
    expect(res.created).toBe(true);
    expect(inserted.length).toBeGreaterThanOrEqual(3); // parent + >=1 child + >=1 grandchild
    // EVERY inserted node carries the throwaway marker.
    for (const row of inserted) expect(markerOf(row)).toBe(true);
    // ...and the belt-exclusion predicate excludes EVERY node (non-null reason). The parent orchestrator
    // is excluded as 'orchestrator_parent' (higher precedence, never dispatched anyway); every NON-parent
    // node — the leaves/grandchildren that were the ones landing CLAIMABLE — is excluded specifically via
    // the 'test_clone_build_tree' marker this fix adds.
    for (const row of inserted) {
      const reason = classifyDispatchIneligibility({ metadata: row.metadata, sd_type: row.sd_type, status: row.status }, {});
      expect(reason).not.toBeNull(); // every node is belt-ineligible
      if (reason !== 'orchestrator_parent') expect(reason).toBe('test_clone_build_tree');
    }
    // At least one node is excluded specifically by the new marker (a leaf) — proves it is load-bearing.
    const byMarker = inserted.filter((row) =>
      classifyDispatchIneligibility({ metadata: row.metadata, sd_type: row.sd_type, status: row.status }, {}) === 'test_clone_build_tree');
    expect(byMarker.length).toBeGreaterThan(0);
  });

  it('FR-2: a REAL venture (not convergence, not clone) stamps NO marker — children stay belt-eligible', async () => {
    const { sb, inserted } = makeCapturingSb({ ventureId: 'v-real-1', convergenceSubject: false, seededFrom: null });
    const res = await convertSprintToSDs(sprintParams('v-real-1'), { supabase: sb, logger: silent });
    expect(res.created).toBe(true);
    expect(inserted.length).toBeGreaterThanOrEqual(3);
    for (const row of inserted) expect(markerOf(row)).toBe(false);
    // None is excluded via the clone marker (they remain claimable real work).
    for (const row of inserted) {
      expect(classifyDispatchIneligibility({ metadata: row.metadata, sd_type: row.sd_type, status: row.status }, {})).not.toBe('test_clone_build_tree');
    }
  });

  it('FR-2b (clone parity preserved): a CLONE venture (seeded_from_venture_id set) still stamps the marker', async () => {
    const { sb, inserted } = makeCapturingSb({ ventureId: 'v-clone-1', convergenceSubject: false, seededFrom: 'src-venture-9' });
    const res = await convertSprintToSDs(sprintParams('v-clone-1'), { supabase: sb, logger: silent });
    expect(res.created).toBe(true);
    for (const row of inserted) expect(markerOf(row)).toBe(true); // clone path unchanged
  });

  it('FR-3: classifyDispatchIneligibility is the mechanism — marked row excluded, unmarked row not', () => {
    expect(classifyDispatchIneligibility({ metadata: { test_clone_build_tree: true }, sd_type: 'feature', status: 'draft' }, {})).toBe('test_clone_build_tree');
    expect(classifyDispatchIneligibility({ metadata: {}, sd_type: 'feature', status: 'draft' }, {})).not.toBe('test_clone_build_tree');
  });
});
