/**
 * Eager-synthesis vision writer populates extracted_dimensions + sections
 * SD-LEO-INFRA-EAGER-SYNTHESIS-VISION-DIMS-EXTRACT-001
 *
 * upsertEvaVisionFromArtifacts historically wrote visions WITHOUT extracted_dimensions/sections,
 * failing eva_vision_documents_active_rich_check on promotion. It now populates sections
 * (deterministic, always) and extracted_dimensions (LLM, extract-once + fail-soft).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the shared dimension extractor (the LLM call) so tests are deterministic + offline.
const { extractSpy } = vi.hoisted(() => ({ extractSpy: vi.fn() }));
vi.mock('../../../lib/eva/vision-dimensions-extractor.js', () => ({
  extractDimensions: extractSpy,
  MAX_LLM_CONTENT_CHARS: 15000,
}));

import {
  upsertEvaVisionFromArtifacts,
  synthesizeFromArtifacts,
} from '../../../lib/eva/artifact-persistence-service.js';
import { extractDimensions, MAX_LLM_CONTENT_CHARS } from '../../../lib/eva/vision-dimensions-extractor.js';

const ARTIFACTS = [
  { lifecycle_stage: 1, artifact_type: 'problem_statement', content: 'A real problem worth solving for the market.', quality_score: 80 },
  { lifecycle_stage: 2, artifact_type: 'solution_design', content: 'A concrete solution approach with clear value.', quality_score: 85 },
];
const DIMS = [{ name: 'd1', weight: 0.5, description: 'first' }, { name: 'd2', weight: 0.5, description: 'second' }];

// Table+method-aware mock supabase. `existing` controls insert vs update path.
function makeSupabase(existing) {
  const inserts = [];
  const updates = [];
  const from = (table) => {
    if (table === 'venture_artifacts') {
      const b = { select: () => b, eq: () => b, order: async () => ({ data: ARTIFACTS, error: null }) };
      return b;
    }
    // eva_vision_documents
    const b = {
      select: () => b,
      eq: () => b,
      single: async () => ({ data: existing, error: existing ? null : { code: 'PGRST116' } }),
      insert: (payload) => { inserts.push(payload); return b; },
      update: (payload) => { updates.push(payload); return { eq: () => ({ error: null }) }; },
    };
    return b;
  };
  return { client: { from }, inserts, updates };
}

describe('Eager-synthesis vision dims (SD-LEO-INFRA-EAGER-SYNTHESIS-VISION-DIMS-EXTRACT-001)', () => {
  beforeEach(() => extractSpy.mockReset());

  it('shared module exports extractDimensions + MAX_LLM_CONTENT_CHARS', () => {
    expect(typeof extractDimensions).toBe('function');
    expect(MAX_LLM_CONTENT_CHARS).toBe(15000);
  });

  it('synthesizeFromArtifacts emits ## headings (so sections parse non-empty)', () => {
    const md = synthesizeFromArtifacts(ARTIFACTS, 'vision');
    expect(md).toMatch(/^##\s+/m);
  });

  it('insert path populates sections AND extracted_dimensions', async () => {
    extractSpy.mockResolvedValue(DIMS);
    const { client, inserts } = makeSupabase(null);
    await upsertEvaVisionFromArtifacts(client, 'VISION-TEST-L2-001', 'v-1', 2);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].extracted_dimensions).toEqual(DIMS);
    expect(inserts[0].sections).toBeTruthy();
    expect(extractSpy).toHaveBeenCalledTimes(1);
  });

  it('update path EXTRACT-ONCE: re-extracts dims only when existing lacks them', async () => {
    extractSpy.mockResolvedValue(DIMS);
    // existing has dims → extractor NOT called; sections still refreshed
    const a = makeSupabase({ id: 'x', version: 1, addendums: [], extracted_dimensions: [{ name: 'old', weight: 1, description: 'x' }] });
    await upsertEvaVisionFromArtifacts(a.client, 'VISION-TEST-L2-001', 'v-1', 3);
    expect(extractSpy).not.toHaveBeenCalled();
    expect(a.updates[0].sections).toBeTruthy();
    expect(a.updates[0].extracted_dimensions).toBeUndefined(); // not clobbered

    extractSpy.mockClear();
    // existing lacks dims → extractor called
    const b = makeSupabase({ id: 'x', version: 1, addendums: [], extracted_dimensions: null });
    await upsertEvaVisionFromArtifacts(b.client, 'VISION-TEST-L2-001', 'v-1', 3);
    expect(extractSpy).toHaveBeenCalledTimes(1);
    expect(b.updates[0].extracted_dimensions).toEqual(DIMS);
  });

  it('fail-soft: extractor returns null → write still succeeds with sections, no dims', async () => {
    extractSpy.mockResolvedValue(null); // LLM failed (extractor is fail-soft, returns null)
    const { client, inserts } = makeSupabase(null);
    await upsertEvaVisionFromArtifacts(client, 'VISION-TEST-L2-001', 'v-1', 2);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].extracted_dimensions).toBeUndefined(); // not written when null
    expect(inserts[0].sections).toBeTruthy();
    expect(inserts[0].content).toBeTruthy(); // the synthesized content write is never lost
  });

  // Note: the canonical fail-soft path is "extractDimensions returns null" (the real extractor is
  // fail-soft at source and never throws) — asserted above. The writer additionally wraps the call
  // in try/catch as defense-in-depth against an unexpected throw (verified by code inspection).
});

describe('SD-LEO-INFRA-S19-HELD-STATE-NOT-IDEMPOTENT-CLOBBER-001: idempotency guard (no clobber of an active+approved vision)', () => {
  beforeEach(() => extractSpy.mockReset());

  it('SKIPS the re-synthesis write for an already active+chairman_approved vision (the held-S19 clobber)', async () => {
    extractSpy.mockResolvedValue(DIMS);
    const a = makeSupabase({ id: 'x', version: 5, addendums: [], extracted_dimensions: DIMS, status: 'active', chairman_approved: true });
    await upsertEvaVisionFromArtifacts(a.client, 'VISION-TEST-L2-001', 'v-1', 19);
    expect(a.updates).toHaveLength(0);   // NO update -> content/sections not clobbered back to 3/10
    expect(a.inserts).toHaveLength(0);
    expect(extractSpy).not.toHaveBeenCalled(); // no wasted LLM extraction on the held tick
  });

  it('STILL updates a pre-active (draft) vision — the going-forward synthesis path is unchanged', async () => {
    extractSpy.mockResolvedValue(DIMS);
    const d = makeSupabase({ id: 'x', version: 2, addendums: [], extracted_dimensions: DIMS, status: 'draft', chairman_approved: false });
    await upsertEvaVisionFromArtifacts(d.client, 'VISION-TEST-L2-001', 'v-1', 15);
    expect(d.updates).toHaveLength(1);   // draft still synthesizes/updates normally
    expect(d.updates[0].content).toBeTruthy();
  });

  it('STILL updates an active-but-UNapproved vision (only a fully activated vision is frozen)', async () => {
    extractSpy.mockResolvedValue(DIMS);
    const u = makeSupabase({ id: 'x', version: 3, addendums: [], extracted_dimensions: DIMS, status: 'active', chairman_approved: false });
    await upsertEvaVisionFromArtifacts(u.client, 'VISION-TEST-L2-001', 'v-1', 17);
    expect(u.updates).toHaveLength(1);   // active+UNapproved is not yet the frozen final state
  });
});
