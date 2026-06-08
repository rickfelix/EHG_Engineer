// Tests for SD-LEO-FEAT-CONVERT-STAGE-VISUAL-001
// S22 creative_handoff gate (post SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-A swap):
// Visual Assets is now stage_number 22 (was 21). creative_handoff is the gate_label.
// FR-1/2 (decision-creating), FR-4 (visual_final_assets writer).

import { describe, it, expect, vi } from 'vitest';
import { persistVisualFinalAssets } from '../../../../lib/eva/stage-templates/analysis-steps/stage-21-visual-assets.js';
import { FALLBACK_DECISION_CREATING_STAGES } from '../../../../lib/eva/chairman-decision-watcher.js';

describe('FR-1/2: S22 (Visual Assets) is in the decision-creating fallback set', () => {
  it('FALLBACK_DECISION_CREATING_STAGES includes 22 (S22 now creates a chairman creative_handoff decision)', () => {
    expect(FALLBACK_DECISION_CREATING_STAGES.has(22)).toBe(true);
  });
});

// Supabase stub that records the insert payload + the mark-stale update.
function stub() {
  const calls = { updated: null, inserted: null };
  const builder = {
    update(p) { calls.updated = p; return builder; },
    insert(p) { calls.inserted = p; return Promise.resolve({ error: null }); },
    eq() { return builder; },
  };
  return { sb: { from: () => builder }, calls };
}

describe('FR-4: persistVisualFinalAssets writer', () => {
  it('inserts artifact_type=visual_final_assets WITH a title (NOT NULL) and mark-stale first', async () => {
    const { sb, calls } = stub();
    const r = await persistVisualFinalAssets(sb, 'ven-1', { title: 'My finals', urls: ['a.png'] });
    expect(r.persisted).toBe(true);
    expect(calls.inserted.artifact_type).toBe('visual_final_assets');
    // SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-A: Visual Assets is now lifecycle_stage 22
    expect(calls.inserted.lifecycle_stage).toBe(22);
    expect(calls.inserted.venture_id).toBe('ven-1');
    expect(calls.inserted.title).toBe('My finals');      // NOT NULL satisfied
    expect(calls.inserted.is_current).toBe(true);
    expect(calls.inserted.source).toBe('chairman_upload');
    expect(calls.updated.is_current).toBe(false);          // prior current marked stale
  });

  it('defaults a title when the caller omits one (NOT-NULL safety)', async () => {
    const { sb, calls } = stub();
    await persistVisualFinalAssets(sb, 'ven-2', { urls: ['x.mp4'] });
    expect(typeof calls.inserted.title).toBe('string');
    expect(calls.inserted.title.length).toBeGreaterThan(0);
  });

  it('fails open (no throw) without supabase/ventureId', async () => {
    const r = await persistVisualFinalAssets(null, null, {});
    expect(r.persisted).toBe(false);
    expect(r.reason).toBe('no_supabase_or_ventureId');
  });
});
