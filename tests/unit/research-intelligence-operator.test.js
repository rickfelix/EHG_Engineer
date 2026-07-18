/**
 * Unit Tests: RESEARCH_INTELLIGENCE_OPERATOR behavior module.
 * SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-A.
 *
 * Covers: reference-lane triage (accept/defer + honest-idle no-op), the chairman
 * ratification arm gate, reference-entry shaping against the migration's CHECK
 * constraints, and the defined-but-unarmed write path (no live insert while unarmed,
 * insert when armed) verified against a mock supabase client.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  triageReferenceLane,
  triageBacklogReferenceLane,
  buildReferenceEntry,
  assertArmRatificationStamp,
  isOperatorArmed,
  ingestAcceptedSignals,
  REFERENCE_ENTRY_TYPES,
  REFERENCE_CONFIDENCE_LEVELS
} from '../../lib/agents/research-intelligence-operator.js';
import { planBacklogClear, selectReferenceLane } from '../../lib/eva/youtube-backlog-clear.js';

const validStamp = { ratified_by: 'chairman', ratified_at: '2026-07-18T00:00:00.000Z', sd_key: 'SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-A' };

describe('triageReferenceLane', () => {
  it('splits a mixed reference-lane row set into accepted (locatable source) vs deferred', () => {
    const rows = [
      { id: 'a', chairman_intent: 'reference', youtube_video_id: 'vid1' },
      { id: 'b', chairman_intent: 'insight', url: 'https://youtu.be/vid2' },
      { id: 'c', chairman_intent: 'reference' }, // no locatable source → deferred
      { id: 'd', chairman_intent: 'idea', youtube_video_id: 'vid3' } // not this operator's lane → ignored
    ];
    const out = triageReferenceLane(rows);
    expect(out.accepted.map(r => r.id).sort()).toEqual(['a', 'b']);
    expect(out.deferred.map(r => r.id)).toEqual(['c']);
    expect(out.deferred[0].reason).toBe('no_locatable_source');
    expect(out.counts).toEqual({ accepted: 2, deferred: 1, total: 3 });
    // provenance is carried, never fabricated
    expect(out.accepted[0].provenance.youtube_video_id).toBe('vid1');
    expect(out.accepted[1].provenance.url).toBe('https://youtu.be/vid2');
  });

  it('honest-idle: empty/invalid input yields an empty split and fabricates nothing', () => {
    for (const input of [[], null, undefined, 'nope', {}]) {
      const out = triageReferenceLane(input);
      expect(out.accepted).toEqual([]);
      expect(out.deferred).toEqual([]);
      expect(out.counts).toEqual({ accepted: 0, deferred: 0, total: 0 });
    }
  });
});

describe('triageBacklogReferenceLane + selectReferenceLane wiring', () => {
  it('routes the reference lane out of planBacklogClear into triage (previously a dead-end)', () => {
    const rows = [
      { id: 'r1', chairman_intent: 'reference', youtube_video_id: 'v1' },
      { id: 'r2', chairman_intent: 'insight', url: 'https://x/y' },
      { id: 'w1', chairman_intent: 'idea', youtube_video_id: 'v9' },
      { id: 's1', chairman_intent: null }
    ];
    const plan = planBacklogClear(rows);
    // The producer-side selector returns exactly the reference-lane rows.
    const refRows = selectReferenceLane(plan);
    expect(refRows.map(r => r.id).sort()).toEqual(['r1', 'r2']);
    // The operator consumes the plan directly and triages the same rows.
    const out = triageBacklogReferenceLane(plan);
    expect(out.counts.total).toBe(2);
    expect(out.accepted.map(r => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('honest-idle on a plan with no reference rows', () => {
    const plan = planBacklogClear([{ id: 'w', chairman_intent: 'idea', youtube_video_id: 'v' }]);
    expect(selectReferenceLane(plan)).toEqual([]);
    expect(triageBacklogReferenceLane(plan).counts.total).toBe(0);
  });
});

describe('buildReferenceEntry', () => {
  it('shapes a current v1 row for a valid tech_landscape entry', () => {
    const entry = buildReferenceEntry({ entry_type: 'tech_landscape', subject: 'llm_frontier_models', payload: { note: 'x' }, source_refs: ['vid1'], confidence: 'medium' });
    expect(entry).toMatchObject({
      entry_type: 'tech_landscape',
      subject: 'llm_frontier_models',
      confidence: 'medium',
      version: 1,
      is_current: true,
      created_by: 'RESEARCH_INTELLIGENCE_OPERATOR'
    });
    expect(entry.source_refs).toEqual(['vid1']);
  });

  it('exposes the exact discriminator sets the migration CHECK enforces', () => {
    expect(REFERENCE_ENTRY_TYPES).toEqual(['tech_landscape', 'model_landscape', 'market_size', 'unit_economics', 'comparables']);
    expect(REFERENCE_CONFIDENCE_LEVELS).toEqual(['unverified', 'low', 'medium', 'high']);
  });

  it('rejects an invalid entry_type / missing subject / invalid confidence', () => {
    expect(() => buildReferenceEntry({ entry_type: 'nope', subject: 's' })).toThrow(/invalid entry_type/);
    expect(() => buildReferenceEntry({ entry_type: 'market_size', subject: '' })).toThrow(/subject is required/);
    expect(() => buildReferenceEntry({ entry_type: 'comparables', subject: 's', confidence: 'certain' })).toThrow(/invalid confidence/);
  });
});

describe('arm gate (chairman ratification stamp)', () => {
  it('isOperatorArmed is false without a valid chairman stamp', () => {
    expect(isOperatorArmed(undefined)).toBe(false);
    expect(isOperatorArmed(null)).toBe(false);
    expect(isOperatorArmed({ ratified_by: 'coordinator', ratified_at: '2026-07-18T00:00:00Z', sd_key: 'X' })).toBe(false);
    expect(isOperatorArmed({ ratified_by: 'chairman', ratified_at: 'not-a-date', sd_key: 'X' })).toBe(false);
    expect(isOperatorArmed({ ratified_by: 'chairman', ratified_at: '2026-07-18T00:00:00Z', sd_key: '' })).toBe(false);
  });

  it('isOperatorArmed is true for a well-formed chairman stamp', () => {
    expect(isOperatorArmed(validStamp)).toBe(true);
    expect(assertArmRatificationStamp(validStamp)).toEqual({ valid: true, reason: null });
  });

  it('reports a specific reason for each malformed stamp', () => {
    expect(assertArmRatificationStamp(undefined).reason).toBe('no_stamp');
    expect(assertArmRatificationStamp({ ratified_by: 'x' }).reason).toBe('not_chairman_ratified');
    expect(assertArmRatificationStamp({ ratified_by: 'chairman', sd_key: '' }).reason).toBe('missing_sd_key');
    expect(assertArmRatificationStamp({ ratified_by: 'chairman', sd_key: 'X', ratified_at: 'x' }).reason).toBe('invalid_ratified_at');
  });
});

describe('ingestAcceptedSignals (defined-but-unarmed write path)', () => {
  function mockSupabase() {
    const insert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ insert }));
    return { client: { from }, from, insert };
  }

  it('performs NO live insert while unarmed and returns a dry-run preview', async () => {
    const { client, insert } = mockSupabase();
    const entries = [buildReferenceEntry({ entry_type: 'tech_landscape', subject: 's1' })];
    const res = await ingestAcceptedSignals(client, entries, { stamp: undefined });
    expect(res.armed).toBe(false);
    expect(res.dry_run).toBe(true);
    expect(res.written).toBe(0);
    expect(res.preview).toEqual(entries);
    expect(insert).not.toHaveBeenCalled();
  });

  it('inserts current rows when armed with a chairman stamp', async () => {
    const { client, from, insert } = mockSupabase();
    const entries = [
      buildReferenceEntry({ entry_type: 'tech_landscape', subject: 'llm_frontier_models' }),
      buildReferenceEntry({ entry_type: 'market_size', subject: 'ai_devtools_tam' })
    ];
    const res = await ingestAcceptedSignals(client, entries, { stamp: validStamp });
    expect(res.armed).toBe(true);
    expect(res.dry_run).toBe(false);
    expect(res.written).toBe(2);
    expect(from).toHaveBeenCalledWith('research_intelligence_reference');
    expect(insert).toHaveBeenCalledWith(entries);
  });

  it('honest-idle: no entries → no write even when armed', async () => {
    const { client, insert } = mockSupabase();
    const res = await ingestAcceptedSignals(client, [], { stamp: validStamp });
    expect(res.written).toBe(0);
    expect(insert).not.toHaveBeenCalled();
  });

  it('surfaces a supabase insert error without throwing', async () => {
    const insert = vi.fn(async () => ({ error: { message: 'rls denied' } }));
    const client = { from: vi.fn(() => ({ insert })) };
    const entries = [buildReferenceEntry({ entry_type: 'comparables', subject: 'peers' })];
    const res = await ingestAcceptedSignals(client, entries, { stamp: validStamp });
    expect(res.written).toBe(0);
    expect(res.error).toBe('rls denied');
  });
});
