// Tests for SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-B
// S22 spend_approval gate: FR-2 (decision-creating fallback parity), FR-4 (drafted
// distribution artifacts persist with a NOT-NULL title + accepted artifact_type).

import { describe, it, expect } from 'vitest';
import {
  persistCanonicalPair,
  persistSkipMarker,
} from '../../../../lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js';
import { FALLBACK_DECISION_CREATING_STAGES } from '../../../../lib/eva/chairman-decision-watcher.js';

describe('FR-2: S22 is in the decision-creating fallback set', () => {
  it('FALLBACK_DECISION_CREATING_STAGES includes 22 (S22 now creates a chairman decision)', () => {
    expect(FALLBACK_DECISION_CREATING_STAGES.has(22)).toBe(true);
  });

  it('still includes 21 (S22 change must not disturb the S21 gate)', () => {
    expect(FALLBACK_DECISION_CREATING_STAGES.has(21)).toBe(true);
  });
});

// Supabase stub that records every insert payload + every mark-stale update.
function stub() {
  const calls = { updates: [], inserts: [] };
  const builder = {
    update(p) { calls.updates.push(p); return builder; },
    insert(p) { calls.inserts.push(p); return Promise.resolve({ error: null }); },
    eq() { return builder; },
  };
  return { sb: { from: () => builder }, calls };
}

const silent = { warn() {}, info() {} };

describe('FR-4: persistCanonicalPair writes titled, allow-listed distribution artifacts', () => {
  it('inserts distribution_channel_config + distribution_ad_copy WITH a NOT-NULL title and mark-stale first', async () => {
    const { sb, calls } = stub();
    const r = await persistCanonicalPair(
      sb, 'ven-1',
      { channels: [], total_channels: 0 },
      { channels_with_copy: [] },
      { full: true },
      { dualEmit: false, logger: silent },
    );
    expect(r.persisted).toBe(true);
    expect(calls.inserts).toHaveLength(2);
    const byType = Object.fromEntries(calls.inserts.map(i => [i.artifact_type, i]));
    expect(Object.keys(byType).sort()).toEqual(['distribution_ad_copy', 'distribution_channel_config']);
    for (const ins of calls.inserts) {
      expect(typeof ins.title).toBe('string');
      expect(ins.title.length).toBeGreaterThan(0);   // NOT NULL satisfied
      expect(ins.lifecycle_stage).toBe(22);
      expect(ins.venture_id).toBe('ven-1');
      expect(ins.is_current).toBe(true);
    }
    expect(calls.updates).toHaveLength(2);             // prior current marked stale per write
    expect(calls.updates.every(u => u.is_current === false)).toBe(true);
  });

  it('dual-emits a titled legacy launch_deployment_runbook when the gate flag is off', async () => {
    const { sb, calls } = stub();
    await persistCanonicalPair(sb, 'ven-2', {}, {}, { full: true }, { dualEmit: true, logger: silent });
    expect(calls.inserts).toHaveLength(3);
    const legacy = calls.inserts.find(i => i.artifact_type === 'launch_deployment_runbook');
    expect(legacy).toBeTruthy();
    expect(typeof legacy.title).toBe('string');
    expect(legacy.title.length).toBeGreaterThan(0);
  });

  it('fails open (no throw) without supabase/ventureId', async () => {
    const r = await persistCanonicalPair(null, null, {}, {}, {}, { logger: silent });
    expect(r.persisted).toBe(false);
    expect(r.reason).toBe('no_supabase_or_ventureId');
  });
});

describe('FR-4: persistSkipMarker writes a titled distribution_skip_marker', () => {
  it('inserts artifact_type=distribution_skip_marker WITH a title (NOT NULL) at lifecycle_stage 22', async () => {
    const { sb, calls } = stub();
    const r = await persistSkipMarker(sb, 'ven-3', [{ artifact_type: 'engine_pricing_model', source_stage: 7 }], silent);
    expect(r.persisted).toBe(true);
    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0].artifact_type).toBe('distribution_skip_marker');
    expect(calls.inserts[0].title).toBe('Distribution skipped');
    expect(calls.inserts[0].lifecycle_stage).toBe(22);
  });

  it('fails open (no throw) without supabase/ventureId', async () => {
    const r = await persistSkipMarker(null, null, []);
    expect(r.persisted).toBe(false);
  });
});
