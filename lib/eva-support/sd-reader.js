/**
 * Read-only SD reader for EVA Support Phase 3.
 *
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C FR-1 + FR-7.
 *
 * Returns active SDs (status IN draft/in_progress/active) for inclusion in
 * EVA Support's "Related SDs:" reply-envelope prefix. Strictly read-only —
 * never writes to strategic_directives_v2 (CI invariant T2 enforces this).
 *
 * Feature flag: EVA_SD_READER_ENABLED (env var).
 *   - Default UNSET = disabled (fail-safe). For first 30 days post-ship,
 *     chairman explicitly enables per session.
 *   - When OFF: returns [] AND writes one decision-log row
 *     kind=reader_disabled per invocation (auditable killswitch). ≤60s
 *     blast-cut: set false in .env, reload Claude Code session.
 *
 * Column allowlist (FR-1 acceptance criterion): only the 7 columns below.
 * NEVER SELECT * — single-reader-module = 1-file RLS retrofit point.
 *
 * Active-SD definition: sourced from lib/sd/active-sd-predicate.js (shared
 * predicate, FR-6 / mitigates 8th writer/consumer asymmetry witness).
 *
 * Boundary invariant (CI test T7): this module MUST NOT import any write
 * function from lib/eva-support/decision-log-store.js. Audit-row writes go
 * through lib/eva-support/sd-decision-log-writer.js, which is a system-event
 * writer scoped to Phase 3 audit rows (kind ∈ reader_disabled / reader_error
 * / render_crashed). The Phase 2 decision-log envelope writer is a separate
 * concern.
 *
 * @module lib/eva-support/sd-reader
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import { getActiveSDFilter } from '../sd/active-sd-predicate.js';
import { writeAuditRow } from './sd-decision-log-writer.js';
import { randomUUID } from 'crypto';

const TABLE = 'strategic_directives_v2';

const ALLOWED_COLUMNS = Object.freeze([
  'sd_key',
  'title',
  'status',
  'current_phase',
  'target_application',
  'priority',
  'progress',
]);

const SELECT_CLAUSE = ALLOWED_COLUMNS.join(',');

/**
 * Determine whether the feature flag is enabled.
 *
 * Default UNSET is treated as DISABLED (fail-safe). Only the literal string
 * 'true' (case-insensitive) enables the reader.
 */
function isReaderEnabled() {
  const v = process.env.EVA_SD_READER_ENABLED;
  if (v === undefined || v === null || v === '') return false;
  return String(v).toLowerCase() === 'true';
}

/**
 * Get active SDs for the current chairman context.
 *
 * @param {Object} [opts]
 * @param {string} [opts.targetApplication] - filter to a single target_application
 *   (e.g. 'EHG_Engineer' or 'EHG'); omit to return all targets.
 * @param {number} [opts.limit=20] - max rows to return.
 * @param {Object} [opts.client] - Supabase client override (testing).
 * @param {string} [opts.eva_invocation_id] - id for audit-row correlation when
 *   the flag is OFF; auto-generated if not provided.
 * @returns {Promise<{ sds: Array, flag_enabled: boolean, audit_row_id?: string | null }>}
 */
export async function getActiveSDs(opts = {}) {
  const {
    targetApplication,
    limit = 20,
    client,
    eva_invocation_id = randomUUID(),
  } = opts;

  // Feature flag check FIRST — before any DB read.
  // When OFF, write the audit row and return immediately with [].
  if (!isReaderEnabled()) {
    const audit = await writeAuditRow({
      decision_kind: 'reader_disabled',
      eva_invocation_id,
      summary: 'EVA_SD_READER_ENABLED=false (or unset) — SD reader returned [] without DB query',
      metadata: {
        eva_invocation_id,
        flag_value: process.env.EVA_SD_READER_ENABLED ?? 'unset',
        invoked_at: new Date().toISOString(),
        target_application_filter: targetApplication ?? null,
      },
    }).catch((err) => ({ inserted: false, row: null, error: err }));

    return {
      sds: [],
      flag_enabled: false,
      audit_row_id: audit?.row ? `${audit.row.task_id}#${audit.row.sequence}` : null,
    };
  }

  // Flag is ON — query active SDs via shared predicate.
  const supabase = client ?? createSupabaseServiceClient();
  const baseQuery = supabase
    .from(TABLE)
    .select(SELECT_CLAUSE);

  let query = getActiveSDFilter(baseQuery);
  if (targetApplication) {
    query = query.eq('target_application', targetApplication);
  }
  query = query
    .order('priority', { ascending: false }) // critical first
    .order('progress', { ascending: false })  // most-progressed first
    .limit(limit);

  const { data, error } = await query;

  if (error) {
    // Reader error → write audit row + return []. Caller's reply envelope
    // degrades gracefully (no "Related SDs:" prefix).
    await writeAuditRow({
      decision_kind: 'reader_error',
      eva_invocation_id,
      summary: `sd-reader query failed: ${String(error.message ?? error).slice(0, 200)}`,
      metadata: {
        eva_invocation_id,
        error_code: error.code ?? null,
        error_message: String(error.message ?? error).slice(0, 500),
        invoked_at: new Date().toISOString(),
        target_application_filter: targetApplication ?? null,
      },
    }).catch(() => { /* audit-of-audit failure is silent — don't recurse */ });

    return { sds: [], flag_enabled: true, audit_row_id: null };
  }

  return {
    sds: data ?? [],
    flag_enabled: true,
    audit_row_id: null, // audit row only written on disabled/error paths
  };
}

/**
 * Test hook — exposes constants for invariant tests (T1 static-import ban,
 * column-allowlist regex check).
 */
export const __testHooks = Object.freeze({
  TABLE,
  ALLOWED_COLUMNS,
  SELECT_CLAUSE,
  isReaderEnabled,
});
