/**
 * vision-fidelity TS-2 — S18 case-study fixture (FR-7).
 *
 * Anchor: chairman_feedback 2026-04-27 "looks very generic" against
 * SD-ACTIVATE-S18-MARKETING-COPY-ORCH-001 post-merge state. Hand-curated
 * 8 missing elements (5 critical, 3 non-critical) per the database-agent
 * grounding note in SD metadata.case_study_grounding_note. NO retro mining.
 */
import { describe, it, expect } from 'vitest';
import { executeVisionFidelity } from '../index.js';

// 8 chairman-identified items: 5 critical (UX-breaking), 3 non-critical (polish).
const S18_CHAIRMAN_FIXTURE = {
  delivered_elements: [],
  partial_elements: [],
  missing_elements: [
    { element: 'Default progress counter showing 0/9 sections',                    severity: 'critical', source_section: 'wireframe header progress bar',   expected: 'Counter renders 0/9, not 0/0' },
    { element: 'Upstream artifacts list (S15 brand, S16 archetype, S17 design)',  severity: 'critical', source_section: 'wireframe upstream-context panel',  expected: 'List shows 12 artifacts, not magic 0/12' },
    { element: 'Per-section briefs and examples for each of the 9 sections',      severity: 'critical', source_section: 'wireframe section-card layout',     expected: 'Each card shows brief + example slots' },
    { element: 'Section card layout rendering 9 distinct sections',               severity: 'critical', source_section: 'wireframe main canvas',             expected: 'Nine cards with copy editor surfaces' },
    { element: 'Sticky-footer Approve button at bottom of stage',                 severity: 'critical', source_section: 'wireframe footer specification',    expected: 'Approve sticky-bottom, not inline' },
    { element: 'Persona context block under header',                              severity: 'normal',   source_section: 'wireframe persona panel',           expected: 'Persona name + role, not bare dash' },
    { element: 'Persona badges visible in empty state',                           severity: 'normal',   source_section: 'wireframe empty-state spec',        expected: 'Empty state surfaces persona context' },
    { element: 'Generate Copy cost-estimate tooltip',                             severity: 'normal',   source_section: 'wireframe Generate button',         expected: 'Tooltip shows estimated tokens / $' }
  ],
  scope_creep_elements: []
};

function makeS18Supabase({ capture }) {
  const sd = {
    id: 's18-uuid', sd_key: 'SD-ACTIVATE-S18-FIXTURE', sd_type: 'feature',
    status: 'in_progress', current_phase: 'PLAN_VERIFICATION',
    metadata: { vision_key: 'VISION-S18-001', branch_name: 'feat/SD-ACTIVATE-S18-FIXTURE' }
  };
  const visionDoc = {
    key: 'VISION-S18-001', title: 'S18 marketing-copy', version: 1,
    content: 'wireframe text excerpt', extracted_dimensions: {}
  };
  const prd = {
    id: 'prd-s18', title: 'PRD: S18 marketing-copy',
    acceptance_criteria: ['AC-1', 'AC-2'], functional_requirements: [{ id: 'FR-1' }], test_scenarios: []
  };
  return {
    from(table) {
      if (table === 'strategic_directives_v2') return { select: () => ({ or: () => ({ maybeSingle: async () => ({ data: sd }) }) }) };
      if (table === 'eva_vision_documents')    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: visionDoc }) }) }) };
      if (table === 'eva_architecture_plans')  return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      if (table === 'product_requirements_v2') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: prd }) }) }) };
      if (table === 'sub_agent_execution_results') {
        return { insert: async (row) => { capture.rows.push(row); return { data: null, error: null }; } };
      }
      return {};
    }
  };
}

describe('TS-2 S18 case-study (FR-7)', () => {
  it('feature SD with 8 chairman-identified missing elements → FAIL with split issues/warnings', async () => {
    const capture = { rows: [] };
    const supabase = makeS18Supabase({ capture });
    const llm = { complete: async () => ({ content: JSON.stringify(S18_CHAIRMAN_FIXTURE) }) };

    const startMs = Date.now();
    const r = await executeVisionFidelity({
      sdId: 'SD-ACTIVATE-S18-FIXTURE',
      supabase, llmClient: llm,
      gitDiffFn: () => '+ partial impl'
    });
    expect(Date.now() - startMs).toBeLessThan(2000);

    expect(r.passed).toBe(false);
    expect(r.verdict).toBe('FAIL');
    expect(r.missing_elements).toHaveLength(8);
    expect(r.issues.length).toBe(5);
    expect(r.warnings.length).toBe(3);
    expect(r.details.critical_missing).toBe(5);
    expect(r.details.non_critical_missing).toBe(3);
    expect(r.details.missing_count).toBe(8);

    expect(capture.rows).toHaveLength(1);
    expect(capture.rows[0].verdict).toBe('FAIL');
    expect(capture.rows[0].sub_agent_code).toBe('VISION_FIDELITY');

    // Each missing element must trace to a wireframe source_section (PRD AC-1 traceability).
    for (const el of r.missing_elements) {
      expect(typeof el.source_section).toBe('string');
      expect(el.source_section.length).toBeGreaterThan(5);
    }
  });
});
