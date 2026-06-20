/**
 * Disposition / quality gate — SD-LEO-INFRA-SOURCING-ENGINE-ACTIVATION-001 (FR-2).
 *
 * The gate runs AFTER routeCorpus and BEFORE stageCorpus, curating the routed corpus to a KEEPER
 * set so the belt only fills with quality work (raw belt-ready intake is noise/dup/already-done heavy).
 * It drops {already_staged, noise, decline, terminal_dup, already_covered} and keeps everything else,
 * INCLUDING re_emit candidates (matched an infra SD whose outcome is not yet realized => still open work).
 *
 * PURE: exercises dispositionGate directly + populate() wiring with injected deps. ZERO live DB.
 */
import { describe, it, expect } from 'vitest';
import {
  dispositionGate,
  populate,
} from '../../../lib/sourcing-engine/proactive-populator.js';

// A routed candidate (post-routeCorpus shape) with sensible defaults.
function routed(over = {}) {
  return {
    corpus: 'conversion_ledger',
    source_type: 'brainstorm',
    source_id: '11111111-1111-1111-1111-111111111111',
    title: 'A genuinely actionable piece of work',
    lane: 'belt-ready',
    dedup_match_sd_key: null,
    re_emit: false,
    ...over,
  };
}

describe('dispositionGate (FR-2) — curate routed corpus to keepers', () => {
  it('keeps a novel belt-ready candidate', () => {
    const { keepers, dropped } = dispositionGate([routed()]);
    expect(keepers).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it('drops already_staged (wave6) items', () => {
    const { keepers, drop_by_reason } = dispositionGate([routed({ alreadyStaged: true })]);
    expect(keepers).toHaveLength(0);
    expect(drop_by_reason.already_staged).toBe(1);
  });

  it('drops noise: empty, too-short, and untitled (title === source_id / source_key)', () => {
    const r = dispositionGate([
      routed({ title: '' }),
      routed({ title: 'abc' }), // shorter than default minTitleLen 6
      routed({ title: 'src-1', source_id: 'src-1' }),
      routed({ title: 'orig-key', source_key: 'orig-key' }),
    ]);
    expect(r.keepers).toHaveLength(0);
    expect(r.drop_by_reason.noise).toBe(4);
  });

  it('drops decline and terminal_dup (lane dedup) candidates', () => {
    const r = dispositionGate([
      routed({ lane: 'decline' }),
      routed({ lane: 'dedup' }),
    ]);
    expect(r.keepers).toHaveLength(0);
    expect(r.drop_by_reason.decline).toBe(1);
    expect(r.drop_by_reason.terminal_dup).toBe(1);
  });

  it('drops already_covered (dedup_match_sd_key set, NOT re_emit) but KEEPS re_emit', () => {
    const r = dispositionGate([
      routed({ dedup_match_sd_key: 'SD-DONE-001', re_emit: false }),       // already covered -> drop
      routed({ dedup_match_sd_key: 'SD-OPEN-001', re_emit: true, lane: 'outcome-gated' }), // still open -> keep
    ]);
    expect(r.drop_by_reason.already_covered).toBe(1);
    expect(r.keepers).toHaveLength(1);
    expect(r.keepers[0].dedup_match_sd_key).toBe('SD-OPEN-001');
  });

  it('keeps chairman-gated / outcome-gated / blocked-on (real work, just gated)', () => {
    const r = dispositionGate([
      routed({ lane: 'chairman-gated' }),
      routed({ lane: 'outcome-gated' }),
      routed({ lane: 'blocked-on-SD-FOO-001' }),
    ]);
    expect(r.keepers).toHaveLength(3);
    expect(r.dropped).toHaveLength(0);
  });

  it('mixed corpus: keepers = {genuine, re_emit}, dropped = {noise, terminal_dup, already_covered}', () => {
    const r = dispositionGate([
      routed({ title: 'Build the thing properly' }),                     // keep
      routed({ title: '', source_id: 'x' }),                             // noise
      routed({ lane: 'dedup', title: 'SD-EXISTING-001' }),              // terminal_dup
      routed({ dedup_match_sd_key: 'SD-DONE-001' }),                    // already_covered
      routed({ dedup_match_sd_key: 'SD-OPEN-001', re_emit: true, lane: 'outcome-gated' }), // keep (re_emit)
    ]);
    expect(r.keepers).toHaveLength(2);
    expect(r.dropped).toHaveLength(3);
    expect(r.drop_by_reason).toEqual({ noise: 1, terminal_dup: 1, already_covered: 1 });
  });

  it('respects a custom minTitleLen', () => {
    const r = dispositionGate([routed({ title: 'short' })], { minTitleLen: 3 });
    expect(r.keepers).toHaveLength(1); // 'short' (5) >= 3
  });
});

describe('populate() wiring (FR-2) — stages only keepers + reports disposition counts', () => {
  it('stages keepers only and surfaces disposition_kept/dropped/drop_by_reason', async () => {
    const loadSources = async () => ({
      ledger: [
        { id: '11111111-1111-1111-1111-111111111111', source_pool: 'estate', title: 'Genuine actionable work item' },
        { id: '22222222-2222-2222-2222-222222222222', source_pool: 'estate', title: '' }, // noise
      ],
      wave6: [],
      deferred: [],
      backlog: [],
    });
    const loadContext = async () => ({});
    // dry-run (no apply/chairmanApproved) => stageCorpus counts what WOULD stage, writes nothing.
    const supabase = {
      from() {
        return {
          // resolveTargetWaveId / roadmapLaneColumnExists call .select; return benign shapes.
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit() { return Promise.resolve({ data: [{ id: 'wave-1' }], error: null }); },
          maybeSingle() { return Promise.resolve({ data: { id: 'wave-1' }, error: null }); },
          single() { return Promise.resolve({ data: { id: 'wave-1' }, error: null }); },
          insert() { return Promise.resolve({ error: null }); },
        };
      },
    };
    const { report } = await populate(supabase, { loadSources, loadContext }, {});
    expect(report.total).toBe(2);              // raw routed
    expect(report.disposition_kept).toBe(1);   // only the genuine item
    expect(report.disposition_dropped).toBe(1);
    expect(report.drop_by_reason.noise).toBe(1);
  });
});
