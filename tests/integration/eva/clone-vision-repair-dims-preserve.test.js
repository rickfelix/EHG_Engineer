/**
 * SD-LEO-INFRA-CLONE-VISION-AUTOPROMOTE-QUALITY-REPAIR-001 — NON-MOCKED integration test (co-author A1 requirement).
 *
 * Exercises the REAL repairVision -> upsertVision path against the REAL triggers (auto_validate_vision_quality
 * + eva_vision_documents_active_rich_check). Proves the A1 root fix: an ENRICHED vision (extracted_dimensions
 * set) that is repaired to >=8 standard sections keeps its dims (NOT null-clobbered) AND flips quality_checked
 * to true — so the downstream clone auto-promote can activate it. Before A1, repairVision's dims-less upsert
 * wrote extracted_dimensions=null and the active write was rejected (loop exhausted, never promoted).
 *
 * Live-DB test (mirrors tests/integration/eva/can-auto-advance-equivalence.test.js). Skips when no service role.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = !!(SUPABASE_URL && SERVICE_KEY);
const supabase = hasDb ? createClient(SUPABASE_URL, SERVICE_KEY) : null;

const VISION_KEY = `VISION-TEST-CLONE-REPAIR-DIMS-${randomUUID()}`;
const DIMS = { archetype: 'test', differentiators: ['a', 'b'], _provenance: 'integration-test' };

// Section-enrichment regenerate. The quality trigger needs ALL of: content >=5000 chars,
// >=8 of 10 standard sections, >=50 chars/section. The seed fails both content_length (600<5000)
// and section_coverage (1/10), and the loop targets content_length first — so a robust regenerate
// fills all 10 standard sections substantially (each ~600 chars => content ~6000) in one attempt,
// independent of which issue is targeted. (This stands in for the real LLM regenerate; the point of
// the test is the downstream dims-preservation, which is only observable once quality passes.)
const STANDARD = ['executive_summary', 'problem_statement', 'success_criteria', 'personas', 'out_of_scope', 'evolution_plan', 'information_architecture', 'key_decision_points', 'integration_patterns', 'ui_ux_wireframes'];
const regenerate = async ({ sections }) => {
  const updated = { ...(sections || {}) };
  for (const key of STANDARD) {
    const filler = `Integration-test generated content for the ${key.replace(/_/g, ' ')} section. `.repeat(12);
    updated[key] = `${updated[key] ? `${updated[key]}\n\n` : ''}${filler}`;
  }
  const newContent = Object.entries(updated)
    .map(([k, b]) => `## ${k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}\n\n${b}`)
    .join('\n\n');
  return { sections: updated, content: newContent, tokensUsed: 0 };
};

describe.skipIf(!hasDb)('A1: repairVision preserves extracted_dimensions + flips quality_checked (live)', () => {
  beforeAll(async () => {
    // Seed an ENRICHED but quality-insufficient draft_seed L2 vision (dims set, content>500, <8 sections).
    await supabase.from('eva_vision_documents').delete().eq('vision_key', VISION_KEY);
    const { error } = await supabase.from('eva_vision_documents').insert({
      vision_key: VISION_KEY,
      level: 'L2',
      status: 'draft_seed',
      content: 'x'.repeat(600),
      extracted_dimensions: DIMS,
      sections: { executive_summary: 'only one section present — fails the >=8 section_coverage check' },
      created_by: 'integration-test-seed',
    });
    if (error) throw new Error(`seed insert failed: ${error.message}`);
  });

  afterAll(async () => {
    if (supabase) await supabase.from('eva_vision_documents').delete().eq('vision_key', VISION_KEY);
  });

  test('repairs to >=8 sections, quality_checked=true, and dims are PRESERVED (not null-clobbered)', async () => {
    const { repairVision: realRepairVision, isRepairLoopEnabled } = await import('../../../lib/eva/vision-repair-loop.js');
    // Read the seed back (with the trigger-computed quality fields).
    const { data: seed } = await supabase.from('eva_vision_documents')
      .select('quality_checked, quality_issues, sections, content, extracted_dimensions')
      .eq('vision_key', VISION_KEY).maybeSingle();
    expect(seed).toBeTruthy();
    expect(seed.extracted_dimensions).not.toBeNull();      // enriched precondition
    expect(seed.quality_checked).toBe(false);              // quality-insufficient precondition

    const repair = await realRepairVision({
      supabase,
      visionKey: VISION_KEY,
      qualityIssues: Array.isArray(seed.quality_issues) ? seed.quality_issues : [{ check: 'section_coverage', message: '<8 sections' }],
      sections: seed.sections,
      content: seed.content,
      createdBy: 'testing-agent-clone-autoapprove',
      level: 'L2',
      regenerate,
      logger: { log() {}, warn() {} },
    });

    expect(repair.finalQualityChecked).toBe(true);          // quality flipped

    // THE A1 ASSERTION: dims survived the repair upsert (were NOT null-clobbered).
    const { data: after } = await supabase.from('eva_vision_documents')
      .select('extracted_dimensions, quality_checked')
      .eq('vision_key', VISION_KEY).maybeSingle();
    expect(after.quality_checked).toBe(true);
    expect(after.extracted_dimensions).not.toBeNull();
    expect(after.extracted_dimensions?._provenance).toBe('integration-test'); // the ORIGINAL dims, preserved

    // isRepairLoopEnabled is exported + callable (sanity, no throw).
    expect(typeof isRepairLoopEnabled).toBe('function');
  }, 60000);
});
