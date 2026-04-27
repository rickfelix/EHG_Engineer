/**
 * vision-fidelity sub-agent tests — TS-1, TS-3, TS-4, TS-6, TS-7, TS-8 (FR-1).
 * Severity policy (FR-3) + bypass-rubric (FR-4) live in policy.test.js.
 */
import { describe, it, expect, vi } from 'vitest';
import { executeVisionFidelity } from '../index.js';

function makeSD({ sdType = 'feature', visionKey = 'VISION-FIXTURE-001', archKey = null } = {}) {
  return {
    id: 'sd-uuid-fixture',
    sd_key: 'SD-FIXTURE-001',
    sd_type: sdType,
    status: 'in_progress',
    current_phase: 'PLAN_VERIFICATION',
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

