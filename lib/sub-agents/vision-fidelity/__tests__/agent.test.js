/**
 * vision-fidelity sub-agent tests — TS-1, TS-3, TS-4, TS-6, TS-7, TS-8 (FR-1).
 * Severity policy (FR-3) + bypass-rubric (FR-4) live in policy.test.js.
 */
import { describe, it, expect, vi } from 'vitest';
import { executeVisionFidelity } from '../index.js';

function makeSD({ sdType = 'feature', visionKey = 'VISION-FIXTURE-001', archKey = null, ventureId = null } = {}) {
  return {
    id: 'sd-uuid-fixture',
    sd_key: 'SD-FIXTURE-001',
    sd_type: sdType,
    status: 'in_progress',
    current_phase: 'PLAN_VERIFICATION',
    venture_id: ventureId,
    metadata: visionKey
      ? { vision_key: visionKey, arch_key: archKey, branch_name: 'feat/SD-FIXTURE-001' }
      : { branch_name: 'feat/SD-FIXTURE-001' }
  };
}

const VISION_DOC_FIXTURE = {
  key: 'VISION-FIXTURE-001', title: 'Fixture vision', version: 1,
  content: 'wireframe stub', extracted_dimensions: { dimensions: [] }, status: 'active'
};
const PRD_FIXTURE = {
  id: 'prd-uuid', title: 'PRD Fixture',
  acceptance_criteria: ['AC-1'], functional_requirements: [{ id: 'FR-1' }], test_scenarios: []
};

function makeSupabase({ sd, prd = null, visionDoc = null, archPlan = null, capture }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ or: () => ({ maybeSingle: async () => ({ data: sd }) }) }) };
      }
      if (table === 'eva_vision_documents') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: visionDoc }) }) }) };
      }
      if (table === 'eva_architecture_plans') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: archPlan }) }) }) };
      }
      if (table === 'product_requirements_v2') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: prd }) }) }) };
      }
      if (table === 'sub_agent_execution_results') {
        return { insert: async (row) => { capture.rows.push(row); return { data: null, error: null }; } };
      }
      return {};
    }
  };
}

const makeLlm = (response) => ({ complete: async () => ({ content: JSON.stringify(response) }) });
const noopGit = () => '+ stub diff';

// QF-20260831-038 (Solomon ruling revision 4807b985): venture-linked doc-selection mock.
// Distinguishes loadVisionDocument's single-filter `.eq('vision_key', X)` lookup from
// loadCanonicalVentureDoc's three-filter `.eq('venture_id',...).eq('level','L2').eq('status','active')`
// chain by tracking which columns were filtered on before `.maybeSingle()` resolves.
function makeVentureSupabase({ sd, prd = null, visionDoc = null, canonicalDoc = null, capture }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ or: () => ({ maybeSingle: async () => ({ data: sd }) }) }) };
      }
      if (table === 'eva_vision_documents') {
        const chain = { cols: [] };
        chain.eq = (col) => { chain.cols.push(col); return chain; };
        chain.maybeSingle = async () => {
          const data = chain.cols.includes('venture_id') ? canonicalDoc : visionDoc;
          return { data };
        };
        return { select: () => chain };
      }
      if (table === 'product_requirements_v2') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: prd }) }) }) };
      }
      if (table === 'sub_agent_execution_results') {
        return { insert: async (row) => { capture.rows.push(row); return { data: null, error: null }; } };
      }
      return {};
    }
  };
}

describe('vision-fidelity sub-agent (FR-1)', () => {
  it('TS-1 happy path: feature SD with all 9 delivered → PASS, vision_coverage_pct=1.0', async () => {
    const capture = { rows: [] };
    const sd = makeSD();
    const supabase = makeSupabase({ sd, prd: PRD_FIXTURE, visionDoc: VISION_DOC_FIXTURE, capture });
    const llm = makeLlm({
      delivered_elements: Array.from({ length: 9 }, (_, i) => ({ element: `el-${i}`, severity: 'critical', source_section: 's', evidence: 'shipped' })),
      partial_elements: [], missing_elements: [], scope_creep_elements: []
    });
    const r = await executeVisionFidelity({ sdId: 'SD-FIXTURE-001', supabase, llmClient: llm, gitDiffFn: noopGit });

    expect(r.verdict).toBe('PASS');
    expect(r.passed).toBe(true);
    expect(r.details.vision_coverage_pct).toBe(1);
    expect(r.details.delivered_count).toBe(9);
    expect(capture.rows).toHaveLength(1);
    expect(capture.rows[0].verdict).toBe('PASS');
    expect(capture.rows[0].sub_agent_code).toBe('VISION_FIDELITY');
  });

  it('TS-3 infrastructure SD with 8 missing → WARNING, passed=true (warn-only never blocks)', async () => {
    const capture = { rows: [] };
    const sd = makeSD({ sdType: 'infrastructure' });
    const supabase = makeSupabase({ sd, prd: PRD_FIXTURE, visionDoc: VISION_DOC_FIXTURE, capture });
    const missing = Array.from({ length: 8 }, (_, i) => ({
      element: `m-${i}`, severity: i < 5 ? 'critical' : 'normal', source_section: 'wireframe section'
    }));
    const llm = makeLlm({ delivered_elements: [], partial_elements: [], missing_elements: missing, scope_creep_elements: [] });
    const r = await executeVisionFidelity({ sdId: 'SD-FIXTURE-001', supabase, llmClient: llm, gitDiffFn: noopGit });

    expect(r.passed).toBe(true);
    expect(r.verdict).toBe('WARNING');
    expect(r.warnings.filter(w => /vision missing/i.test(w))).toHaveLength(8);
    expect(r.issues).toHaveLength(0);
    expect(capture.rows[0].verdict).toBe('WARNING');
  });

  it('TS-4 documentation SD → skipped, no LLM call, no DB row', async () => {
    const capture = { rows: [] };
    const sd = makeSD({ sdType: 'documentation' });
    const supabase = makeSupabase({ sd, capture });
    const llmCalled = vi.fn(async () => ({ content: '{}' }));
    const llm = { complete: llmCalled };

    const r = await executeVisionFidelity({ sdId: 'SD-FIXTURE-001', supabase, llmClient: llm, gitDiffFn: noopGit });

    expect(r.passed).toBe(true);
    expect(r.details.skipped).toBe(true);
    expect(r.details.reason).toMatch(/sd-type does not produce UI/);
    expect(llmCalled).not.toHaveBeenCalled();
    expect(capture.rows).toHaveLength(0);
  });

  it('TS-6 LLM timeout → fail-soft to PENDING with details.timeout=true', async () => {
    const capture = { rows: [] };
    const sd = makeSD();
    const supabase = makeSupabase({ sd, prd: PRD_FIXTURE, visionDoc: VISION_DOC_FIXTURE, capture });
    const llm = { complete: () => new Promise(() => {}) }; // never resolves
    const r = await executeVisionFidelity({ sdId: 'SD-FIXTURE-001', supabase, llmClient: llm, gitDiffFn: noopGit, timeoutMs: 25 });

    expect(r.passed).toBe(true);
    expect(r.verdict).toBe('PENDING');
    expect(r.details.timeout).toBe(true);
    expect(r.warnings.some(w => /timed out/i.test(w))).toBe(true);
    expect(capture.rows[0].verdict).toBe('PENDING');
  });

  it('TS-7 no vision_key → PENDING with skipped_reason=no_vision_key (DB row written)', async () => {
    const capture = { rows: [] };
    const sd = makeSD({ visionKey: null });
    const supabase = makeSupabase({ sd, capture });
    const r = await executeVisionFidelity({ sdId: 'SD-FIXTURE-001', supabase, gitDiffFn: noopGit });

    expect(r.passed).toBe(true);
    expect(r.verdict).toBe('PENDING');
    expect(r.details.skipped_reason).toBe('no_vision_key');
    expect(r.warnings.some(w => /no vision_key in sd metadata/i.test(w))).toBe(true);
    expect(capture.rows).toHaveLength(1);
    expect(capture.rows[0].verdict).toBe('PENDING');
  });

  it('TS-8 scope creep alone bumps PASS → WARNING and surfaces in warnings', async () => {
    const capture = { rows: [] };
    const sd = makeSD();
    const supabase = makeSupabase({ sd, prd: PRD_FIXTURE, visionDoc: VISION_DOC_FIXTURE, capture });
    const llm = makeLlm({
      delivered_elements: Array.from({ length: 9 }, (_, i) => ({ element: `el-${i}`, severity: 'critical', source_section: 's' })),
      partial_elements: [], missing_elements: [],
      scope_creep_elements: [
        { element: 'extra-feature-1', source_section: null, evidence: 'in PR but not vision' },
        { element: 'extra-feature-2', source_section: null, evidence: 'in PR but not vision' },
        { element: 'extra-feature-3', source_section: null, evidence: 'in PR but not vision' }
      ]
    });
    const r = await executeVisionFidelity({ sdId: 'SD-FIXTURE-001', supabase, llmClient: llm, gitDiffFn: noopGit });

    expect(r.verdict).toBe('WARNING');
    expect(r.passed).toBe(true);
    expect(r.warnings.filter(w => /scope-creep/.test(w))).toHaveLength(3);
    expect(r.details.scope_creep_count).toBe(3);
    expect(r.details.scope_creep_elements).toHaveLength(3);
    expect(capture.rows[0].verdict).toBe('WARNING');
  });
});

describe('vision-fidelity doc-selection (QF-20260831-038, Solomon ruling revision 4807b985)', () => {
  it('a venture-linked SD whose vision_key matches the canonical active L2 doc proceeds normally (no behavior change)', async () => {
    const capture = { rows: [] };
    const sd = makeSD({ ventureId: 'venture-uuid-1', visionKey: 'VISION-REAL-001' });
    const canonicalDoc = { vision_key: 'VISION-REAL-001', version: 1, status: 'active', level: 'L2' };
    const supabase = makeVentureSupabase({ sd, prd: PRD_FIXTURE, visionDoc: { ...VISION_DOC_FIXTURE, vision_key: 'VISION-REAL-001' }, canonicalDoc, capture });
    const llm = makeLlm({ delivered_elements: [{ element: 'x', severity: 'critical', source_section: 's' }], partial_elements: [], missing_elements: [], scope_creep_elements: [] });
    const r = await executeVisionFidelity({ sdId: 'SD-FIXTURE-001', supabase, llmClient: llm, gitDiffFn: noopGit });

    expect(r.verdict).toBe('PASS');
    expect(r.details.doc_check).toBeUndefined();
  });

  it('a stale vision_key mismatch does NOT hard-block -- compares against the CANONICAL doc and can still PASS on real content, while loudly flagging the mismatch', async () => {
    const capture = { rows: [] };
    const sd = makeSD({ ventureId: 'venture-uuid-1', visionKey: 'VISION-STALE-001' });
    const canonicalDoc = { ...VISION_DOC_FIXTURE, vision_key: 'VISION-REAL-001', version: 2, status: 'active', level: 'L2' };
    const supabase = makeVentureSupabase({ sd, prd: PRD_FIXTURE, canonicalDoc, capture });
    const llm = makeLlm({ delivered_elements: [{ element: 'x', severity: 'critical', source_section: 's' }], partial_elements: [], missing_elements: [], scope_creep_elements: [] });
    const r = await executeVisionFidelity({ sdId: 'SD-FIXTURE-001', supabase, llmClient: llm, gitDiffFn: noopGit });

    // Real content, real delivery → still PASSES despite the stale pointer (Solomon: "post-fix
    // AltifyAI is compared against ITS OWN promoted L2 and passes on real content").
    expect(r.verdict).toBe('PASS');
    expect(r.passed).toBe(true);
    // ...but the mismatch is surfaced loudly, naming both the stale and canonical paths read.
    expect(r.details.doc_identity_mismatch).toBe(true);
    expect(r.details.vision_key).toBe('VISION-REAL-001');
    expect(r.details.sd_vision_key).toBe('VISION-STALE-001');
    expect(r.details.canonical_vision_key).toBe('VISION-REAL-001');
    expect(r.issues[0]).toMatch(/VISION-STALE-001/);
    expect(r.issues[0]).toMatch(/VISION-REAL-001/);
    expect(r.issues[0]).toMatch(/eva_vision_documents\(venture_id=venture-uuid-1, level=L2, status=active\)/);
  });

  it('FAILS LOUD when the venture has no active L2 vision document at all (genuinely absent vision still fails)', async () => {
    const capture = { rows: [] };
    const sd = makeSD({ ventureId: 'venture-uuid-2', visionKey: 'VISION-ANYTHING-001' });
    const supabase = makeVentureSupabase({ sd, canonicalDoc: null, capture });
    const r = await executeVisionFidelity({ sdId: 'SD-FIXTURE-001', supabase, llmClient: makeLlm({}), gitDiffFn: noopGit });

    expect(r.verdict).toBe('FAIL');
    expect(r.passed).toBe(false);
    expect(r.details.doc_check).toBe('no_active_l2_doc');
  });

  it('a non-venture SD (venture_id null) is entirely unaffected by the doc-selection check', async () => {
    const capture = { rows: [] };
    const sd = makeSD(); // ventureId defaults to null
    const supabase = makeSupabase({ sd, prd: PRD_FIXTURE, visionDoc: VISION_DOC_FIXTURE, capture });
    const llm = makeLlm({ delivered_elements: [{ element: 'x', severity: 'critical', source_section: 's' }], partial_elements: [], missing_elements: [], scope_creep_elements: [] });
    const r = await executeVisionFidelity({ sdId: 'SD-FIXTURE-001', supabase, llmClient: llm, gitDiffFn: noopGit });

    expect(r.verdict).toBe('PASS');
    expect(r.details.doc_check).toBeUndefined();
  });
});

