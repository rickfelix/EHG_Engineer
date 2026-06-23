/**
 * Unit tests for the chairman review-queue writer.
 * SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-A (FR-3).
 *
 * Uses a fake/injected supabase client — no live DB.
 */
import { describe, it, expect } from 'vitest';
import {
  buildRecommendationRow,
  enqueueDistilledCandidate,
} from '../../../lib/eva/consultant/distillation-queue-writer.js';

function makeFakeSupabase({ insertError = null, returnedRow = null } = {}) {
  const calls = { table: null, inserted: null };
  return {
    calls,
    from(table) {
      calls.table = table;
      return {
        insert(row) {
          calls.inserted = row;
          return {
            select() {
              return {
                async single() {
                  if (insertError) return { data: null, error: { message: insertError } };
                  return { data: returnedRow || { id: 'rec-1', ...row }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

const SAMPLE = {
  sourceWaveItemId: '11111111-1111-1111-1111-111111111111',
  distilledPayload: { title: 'Distilled: improve X', description: 'do the thing' },
  confidenceTier: 'high',
  priorityScore: 87,
  recommendationDate: '2026-06-23',
};

describe('buildRecommendationRow', () => {
  it('maps a distilled candidate to a recommendation row with link + payload + defaults', () => {
    const row = buildRecommendationRow(SAMPLE);
    expect(row.source_wave_item_id).toBe(SAMPLE.sourceWaveItemId);
    expect(row.distilled_sd_payload).toEqual(SAMPLE.distilledPayload);
    expect(row.confidence_tier).toBe('high');
    expect(row.priority_score).toBe(87);
    // NOT NULL columns populated with engine-consistent defaults:
    expect(row.recommendation_type).toBe('strategic');
    expect(row.action_type).toBe('create_sd');
    expect(row.status).toBe('pending');
    expect(row.recommendation_date).toBe('2026-06-23');
    expect(row.title).toBe('Distilled: improve X');
  });

  it('derives title from the payload and tolerates a missing confidence_tier', () => {
    const row = buildRecommendationRow({
      sourceWaveItemId: SAMPLE.sourceWaveItemId,
      distilledPayload: { title: 'Only a title' },
    });
    expect(row.title).toBe('Only a title');
    expect('confidence_tier' in row).toBe(false); // optional → omitted, not null-forced
    expect(row.status).toBe('pending');
  });

  it('truncates an over-long title to 255 chars', () => {
    const long = 'x'.repeat(400);
    const row = buildRecommendationRow({
      sourceWaveItemId: SAMPLE.sourceWaveItemId,
      distilledPayload: { title: long },
    });
    expect(row.title.length).toBe(255);
  });

  it('requires sourceWaveItemId', () => {
    expect(() => buildRecommendationRow({ distilledPayload: { title: 't' } })).toThrow(/sourceWaveItemId/);
  });

  it('requires a distilledPayload object', () => {
    expect(() => buildRecommendationRow({ sourceWaveItemId: 'x' })).toThrow(/distilledPayload/);
  });
});

describe('enqueueDistilledCandidate', () => {
  it('inserts into eva_consultant_recommendations and returns the row', async () => {
    const fake = makeFakeSupabase();
    const res = await enqueueDistilledCandidate(fake, SAMPLE);
    expect(res.ok).toBe(true);
    expect(fake.calls.table).toBe('eva_consultant_recommendations');
    expect(fake.calls.inserted.source_wave_item_id).toBe(SAMPLE.sourceWaveItemId);
    expect(res.row.id).toBe('rec-1');
  });

  it('surfaces an insert error instead of swallowing it', async () => {
    const fake = makeFakeSupabase({ insertError: 'null value in column "title"' });
    await expect(enqueueDistilledCandidate(fake, SAMPLE)).rejects.toThrow(/insert failed/);
  });

  it('rejects a missing supabase client', async () => {
    await expect(enqueueDistilledCandidate(null, SAMPLE)).rejects.toThrow(/supabase client/);
  });
});
