/**
 * Stage-0 external data feed — the FIRST real construction of the dataFeed object that
 * lib/eva/stage-zero/synthesis/tech-trajectory.js has accepted (deps.dataFeed) and called
 * (dataFeed.getTechSignals(), line ~47) since it shipped, but which no caller ever built.
 *
 * SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-B.
 *
 * getTechSignals() reads Child A's standing landscape reference table
 * (research_intelligence_reference — database/migrations/20260718_research_intelligence_reference.sql)
 * for the CURRENT technology/model-landscape rows and hands them to tech-trajectory as
 * external grounding, replacing the training-data-only fallback ("Framework-informed
 * projections based on training data. Not real-time signals.") whenever live rows exist.
 *
 * Honest-idle: with no current rows, a missing client, or a query error, getTechSignals()
 * resolves to null and NEVER fabricates a signal — so tech-trajectory keeps its existing
 * fallback behavior byte-for-byte when there is nothing live to say. This mirrors the
 * defined-but-unarmed posture of the RESEARCH_INTELLIGENCE_OPERATOR that fills the table.
 *
 * Read-only consumer: this module never writes to the reference table (the operator owns
 * writes via lib/agents/research-intelligence-operator.js ingestAcceptedSignals).
 *
 * @module lib/eva/stage-zero/data-feed
 */

/**
 * entry_type values Child B (tech-trajectory) reads. Mirrors the migration CHECK subset:
 * Child B -> tech_landscape/model_landscape (Child C reads the market_size/unit_economics/
 * comparables family; Child D reads superseded rows). Kept local + explicit so a read here
 * cannot silently widen if the operator's full vocabulary grows.
 */
export const TECH_ENTRY_TYPES = Object.freeze(['tech_landscape', 'model_landscape']);

/** Columns pulled from the reference table (all pre-existing from Child A's migration). */
const SELECT_COLUMNS = 'subject, entry_type, confidence, version, payload, source_refs';

/**
 * Map a raw reference-table row to the compact tech-signal shape tech-trajectory consumes
 * (it JSON.stringifies the value into the LLM prompt). Never invents fields.
 * @param {object} row
 * @returns {{ subject: string, entry_type: string, confidence: string, version: number, payload: object, source_refs: Array }}
 */
function toTechSignal(row) {
  return {
    subject: row?.subject ?? null,
    entry_type: row?.entry_type ?? null,
    confidence: row?.confidence ?? 'unverified',
    version: row?.version ?? 1,
    payload: row?.payload ?? {},
    source_refs: Array.isArray(row?.source_refs) ? row.source_refs : [],
  };
}

/**
 * Build a Stage-0 data feed backed by the standing landscape reference table.
 *
 * @param {object} supabase a supabase client (or a mock exposing from().select().eq().in())
 * @param {object} [options]
 * @param {object} [options.logger] logger (defaults to console)
 * @returns {{ getTechSignals: () => Promise<Array<object>|null> }}
 */
export function createStageZeroDataFeed(supabase, options = {}) {
  const { logger = console } = options;

  return {
    /**
     * Read the CURRENT tech/model-landscape rows and return them as compact signals.
     * Honest-idle: resolves to null (never throws, never fabricates) when there is no
     * client, the query errors, or there are zero current rows.
     * @returns {Promise<Array<object>|null>}
     */
    async getTechSignals() {
      if (!supabase || typeof supabase.from !== 'function') {
        return null;
      }
      try {
        const { data, error } = await supabase
          .from('research_intelligence_reference')
          .select(SELECT_COLUMNS)
          .eq('is_current', true)
          .in('entry_type', TECH_ENTRY_TYPES);

        if (error) {
          logger.warn?.(`   Stage-0 dataFeed: tech-signal read failed (${error.message || error}); using fallback.`);
          return null;
        }
        if (!Array.isArray(data) || data.length === 0) {
          // Honest-idle: no live landscape rows -> tech-trajectory keeps its training-data fallback.
          return null;
        }
        return data.map(toTechSignal);
      } catch (err) {
        logger.warn?.(`   Stage-0 dataFeed: tech-signal read threw (${err.message}); using fallback.`);
        return null;
      }
    },
  };
}
