#!/usr/bin/env node

/**
 * Cascade Invalidation Engine
 *
 * Application-layer module for V09 Strategic Governance Cascade.
 * Provides programmatic access to cascade invalidation operations:
 *   - Query stale documents (pending invalidation flags)
 *   - Resolve invalidation flags
 *   - Trigger manual cascade invalidation (outside DB trigger)
 *
 * The DB trigger (fn_cascade_invalidation_on_vision_update) handles
 * automatic flagging when eva_vision_documents.version changes.
 * This module handles everything else.
 *
 * SD: SD-MAN-GEN-CORRECTIVE-VISION-GAP-015
 * Dimension: V09 (Strategic Governance Cascade)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Get all documents flagged as stale (pending invalidation flags).
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {string} [options.documentType] - Filter by type: architecture_plan, objective, key_result, strategy
 * @param {string} [options.status] - Filter by status (default: 'pending')
 * @param {number} [options.limit] - Max results (default: 50)
 * @returns {Promise<{flags: Array, count: number, error?: string}>}
 */
export async function getStaleDocuments(supabase, options = {}) {
  const { documentType, status = 'pending', limit = 50 } = options;

  try {
    let query = supabase
      .from('cascade_invalidation_flags')
      .select(`
        id,
        invalidation_log_id,
        document_type,
        document_id,
        status,
        flagged_at,
        resolved_at,
        resolved_by,
        resolution_notes
      `)
      .eq('status', status)
      .order('flagged_at', { ascending: true })
      .limit(limit);

    if (documentType) {
      query = query.eq('document_type', documentType);
    }

    const { data, error } = await query;

    if (error) {
      return { flags: [], count: 0, error: error.message };
    }

    return { flags: data || [], count: (data || []).length };
  } catch (err) {
    return { flags: [], count: 0, error: err.message };
  }
}

/**
 * Resolve an invalidation flag (mark as resolved/dismissed).
 *
 * @param {Object} supabase - Supabase client
 * @param {string} flagId - UUID of the cascade_invalidation_flags row
 * @param {Object} [options]
 * @param {string} [options.status] - New status: 'resolved' or 'dismissed' (default: 'resolved')
 * @param {string} [options.resolvedBy] - Who resolved it
 * @param {string} [options.notes] - Resolution notes
 * @returns {Promise<{resolved: boolean, error?: string}>}
 */
export async function resolveInvalidationFlag(supabase, flagId, options = {}) {
  const {
    status = 'resolved',
    resolvedBy = 'cli',
    notes = '',
  } = options;

  if (!flagId) {
    return { resolved: false, error: 'Missing flagId' };
  }

  try {
    const { error } = await supabase
      .from('cascade_invalidation_flags')
      .update({
        status,
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy,
        resolution_notes: notes,
      })
      .eq('id', flagId)
      .eq('status', 'pending');

    if (error) {
      return { resolved: false, error: error.message };
    }

    return { resolved: true };
  } catch (err) {
    return { resolved: false, error: err.message };
  }
}

/**
 * Trigger manual cascade invalidation for a source document change.
 * Use this when changes happen outside of the DB trigger path
 * (e.g., architecture plan updates, strategy changes).
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} options
 * @param {string} options.sourceTable - Source table name
 * @param {string} options.sourceId - UUID of changed document
 * @param {string} [options.sourceKey] - Human-readable key
 * @param {string} options.changeType - One of: version_bump, content_update, dimension_change, status_change
 * @param {string} [options.changedBy] - Who made the change
 * @param {string} [options.changeSummary] - Description of the change
 * @param {Array<{documentType: string, documentId: string}>} options.targets - Documents to flag
 * @returns {Promise<{logId: string, flagsCreated: number, error?: string}>}
 */
export async function manualCascadeInvalidation(supabase, options = {}) {
  const {
    sourceTable,
    sourceId,
    sourceKey,
    changeType,
    changedBy = 'cli',
    changeSummary = '',
    targets = [],
  } = options;

  if (!sourceTable || !sourceId || !changeType) {
    return { logId: null, flagsCreated: 0, error: 'Missing required: sourceTable, sourceId, changeType' };
  }

  try {
    // 1. Create the invalidation log entry
    const { data: logData, error: logError } = await supabase
      .from('cascade_invalidation_log')
      .insert({
        source_table: sourceTable,
        source_id: sourceId,
        source_key: sourceKey,
        change_type: changeType,
        changed_by: changedBy,
        change_summary: changeSummary,
      })
      .select('id')
      .single();

    if (logError) {
      return { logId: null, flagsCreated: 0, error: logError.message };
    }

    const logId = logData.id;

    // 2. Create flags for each target document
    if (targets.length === 0) {
      return { logId, flagsCreated: 0 };
    }

    const flagRows = targets.map(t => ({
      invalidation_log_id: logId,
      document_type: t.documentType,
      document_id: t.documentId,
    }));

    const { error: flagError } = await supabase
      .from('cascade_invalidation_flags')
      .insert(flagRows);

    if (flagError) {
      return { logId, flagsCreated: 0, error: flagError.message };
    }

    return { logId, flagsCreated: targets.length };
  } catch (err) {
    return { logId: null, flagsCreated: 0, error: err.message };
  }
}

/**
 * Get cascade invalidation summary for health reporting.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{pending: number, resolved: number, dismissed: number, recentLogs: Array, error?: string}>}
 */
export async function getCascadeSummary(supabase) {
  try {
    const [pendingRes, resolvedRes, dismissedRes, logsRes] = await Promise.all([
      supabase.from('cascade_invalidation_flags').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('cascade_invalidation_flags').select('id', { count: 'exact', head: true }).eq('status', 'resolved'),
      supabase.from('cascade_invalidation_flags').select('id', { count: 'exact', head: true }).eq('status', 'dismissed'),
      supabase.from('cascade_invalidation_log').select('id, source_table, source_key, change_type, created_at').order('created_at', { ascending: false }).limit(5),
    ]);

    return {
      pending: pendingRes.count || 0,
      resolved: resolvedRes.count || 0,
      dismissed: dismissedRes.count || 0,
      recentLogs: logsRes.data || [],
    };
  } catch (err) {
    return { pending: 0, resolved: 0, dismissed: 0, recentLogs: [], error: err.message };
  }
}

// CLI entry point
const __isMain = process.argv[1] && (
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
  import.meta.url === `file://${process.argv[1]}`
);
if (__isMain) {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const args = process.argv.slice(2);
  const command = args[0] || 'summary';

  async function main() {
    switch (command) {
      case 'stale': {
        const type = args[1] || null;
        const result = await getStaleDocuments(supabase, { documentType: type });
        if (result.error) {
          console.error('Error:', result.error);
          process.exit(1);
        }
        console.log(`\nStale documents (${result.count}):`);
        for (const f of result.flags) {
          console.log(`  [${f.document_type}] ${f.document_id} — flagged ${f.flagged_at}`);
        }
        if (result.count === 0) console.log('  None pending.');
        break;
      }

      case 'resolve': {
        const flagId = args[1];
        if (!flagId) {
          console.error('Usage: cascade-invalidation-engine.js resolve <flag-id> [notes]');
          process.exit(1);
        }
        const notes = args.slice(2).join(' ') || 'Resolved via CLI';
        const result = await resolveInvalidationFlag(supabase, flagId, { notes });
        if (result.error) {
          console.error('Error:', result.error);
          process.exit(1);
        }
        console.log('Resolved:', flagId);
        break;
      }

      case 'summary':
      default: {
        const result = await getCascadeSummary(supabase);
        if (result.error) {
          console.error('Error:', result.error);
          process.exit(1);
        }
        console.log('\n  Cascade Invalidation Summary');
        console.log('  ' + '='.repeat(40));
        console.log(`  Pending:   ${result.pending}`);
        console.log(`  Resolved:  ${result.resolved}`);
        console.log(`  Dismissed: ${result.dismissed}`);
        if (result.recentLogs.length > 0) {
          console.log('\n  Recent changes:');
          for (const log of result.recentLogs) {
            console.log(`    [${log.change_type}] ${log.source_table} ${log.source_key || log.id} — ${log.created_at}`);
          }
        }
        console.log('');
        break;
      }
    }
  }

  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
