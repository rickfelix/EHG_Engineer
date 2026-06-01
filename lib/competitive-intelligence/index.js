/**
 * Canonical Competitive-Intelligence Layer — public contract
 * SD-COMPETITIVE-INTELLIGENCE-ACROSS-THE-ORCH-001-A (Phase 1 data spine)
 *
 * The single import surface for competitor intelligence. Consumers should import
 * from here rather than reaching into lib/research/competitor-intelligence.js or
 * the raw tables:
 *
 *   import { analyzeCompetitor, getCompetitorIntelligence } from 'lib/competitive-intelligence/index.js';
 *
 * - Four-Buckets tagging is owned by ./four-buckets.js
 * - Persistence (competitor_intelligence + ci_snapshots) is owned by ./canonical-store.js
 * - analyzeCompetitor() delegates to the existing CompetitorIntelligenceService
 *   engine (output parity) and can optionally persist the result.
 */

import CompetitorIntelligenceService from '../research/competitor-intelligence.js';

export {
  FOUR_BUCKETS,
  extractValue,
  extractByBucket,
  structureWithFourBuckets,
} from './four-buckets.js';

export {
  resolveClient,
  getCompetitorIntelligence,
  upsertCompetitorIntelligence,
  appendSnapshot,
  listSnapshots,
  computeDiff,
} from './canonical-store.js';

import { upsertCompetitorIntelligence, appendSnapshot } from './canonical-store.js';

/**
 * Analyze a competitor URL through the canonical layer. Delegates to the
 * existing CompetitorIntelligenceService engine so the structured output is
 * byte-identical to the legacy path; optionally persists a competitor_intelligence
 * record + seed snapshot.
 *
 * @param {string} url - competitor website URL
 * @param {Object} [opts]
 * @param {boolean} [opts.persist=false] - persist a competitor_intelligence record
 * @param {string} [opts.ventureId] - optional venture link (usually null pre-seed)
 * @param {string} [opts.createdBy] - operator id
 * @param {string} [opts.source='discovery'] - record source tag
 * @param {Object} [opts.serviceConfig] - passthrough config for CompetitorIntelligenceService
 * @param {Object} [opts.supabase] - injectable client (persistence)
 * @returns {Promise<Object>} structured analysis; when persisted, includes `record` + `snapshot`
 */
export async function analyzeCompetitor(url, opts = {}) {
  const service = new CompetitorIntelligenceService(opts.serviceConfig || {});
  const analysis = await service.analyzeCompetitor(url);

  if (!opts.persist) return analysis;

  const record = await upsertCompetitorIntelligence(
    {
      venture_id: opts.ventureId || null,
      competitor_url: url,
      competitor_name: analysis.name || null,
      source: opts.source || 'discovery',
      four_buckets: analysis.four_buckets || null,
      competitive_intelligence: analysis.competitive_intelligence || null,
      quality: analysis.quality || null,
      created_by: opts.createdBy || null,
    },
    { supabase: opts.supabase }
  );

  const snapshot = await appendSnapshot(record.id, analysis, {
    source: 'seed',
    supabase: opts.supabase,
  });

  return { ...analysis, record, snapshot };
}

/**
 * Persist the competitor analyses produced by the Stage-0 teardown worker
 * (lib/eva/stage-zero/paths/competitor-teardown.js) through the canonical layer.
 * One competitor_intelligence record + seed snapshot per analyzed competitor.
 *
 * The venture usually does not exist yet at teardown time, so venture_id is left
 * null and attached later when the venture is seeded (Child B).
 *
 * @param {Array<Object>} analyses - teardown analyses (company_name, url, ...)
 * @param {Object} [opts]
 * @param {string} [opts.ventureId]
 * @param {string} [opts.createdBy]
 * @param {Object} [opts.supabase]
 * @returns {Promise<Array<Object>>} persisted records
 */
export async function persistTeardownAnalyses(analyses = [], opts = {}) {
  const records = [];
  for (const a of analyses) {
    if (!a || a.error) continue; // skip failed analyses
    const record = await upsertCompetitorIntelligence(
      {
        venture_id: opts.ventureId || null,
        competitor_url: a.url || null,
        competitor_name: a.company_name || null,
        source: 'teardown',
        competitive_intelligence: a,
        created_by: opts.createdBy || null,
      },
      { supabase: opts.supabase }
    );
    await appendSnapshot(record.id, a, { source: 'seed', supabase: opts.supabase });
    records.push(record);
  }
  return records;
}
