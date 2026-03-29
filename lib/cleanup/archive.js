/**
 * Venture Archive Module — Soft-Delete, Cooling Period, Pre-Reset Export
 * SD: SD-LEO-INFRA-VENTURE-CLEANUP-ORCHESTRATOR-001-D
 *
 * Provides:
 *   - exportVentureSnapshot(ventureId) — pre-reset JSON export
 *   - softDelete(ventureId)           — mark deleted_at without removing data
 *   - restore(ventureId)              — restore within 72-hour cooling period
 *   - permanentDelete(ventureId)      — irreversible removal after cooling
 *   - cleanExpiredSoftDeletes()       — scheduled job for expired ventures
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const COOLING_PERIOD_HOURS = 72;

const RELATED_TABLES = [
  { table: 'venture_briefs', fk: 'venture_id' },
  { table: 'eva_ventures', fk: 'venture_id' },
  { table: 'venture_provisioning_state', fk: 'venture_id' },
  { table: 'venture_stage_work', fk: 'venture_id' },
  { table: 'venture_stage_transitions', fk: 'venture_id' },
  { table: 'venture_documents', fk: 'venture_id' },
  { table: 'venture_decisions', fk: 'venture_id' },
  { table: 'venture_compliance_artifacts', fk: 'venture_id' },
  { table: 'venture_artifacts', fk: 'venture_id' },
  { table: 'venture_tiers', fk: 'venture_id' },
  { table: 'venture_fundamentals', fk: 'venture_id' },
  { table: 'stage_executions', fk: 'venture_id' },
];

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function getArchiveDir() {
  const dir = process.env.ARCHIVE_DIR || join(process.cwd(), 'data', 'archives');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Export a complete JSON snapshot of all venture data before deletion.
 * @param {string} ventureId - UUID of the venture to export
 * @param {object} [options] - Optional config
 * @param {object} [options.supabase] - Pre-configured Supabase client
 * @param {string} [options.outputDir] - Override archive directory
 * @returns {Promise<{success: boolean, path?: string, tables: object, error?: string}>}
 */
export async function exportVentureSnapshot(ventureId, options = {}) {
  const supabase = options.supabase || getSupabase();
  const outputDir = options.outputDir || getArchiveDir();

  const snapshot = {
    venture_id: ventureId,
    exported_at: new Date().toISOString(),
    tables: {},
  };

  // Export main venture record
  const { data: venture, error: ventureErr } = await supabase
    .from('ventures')
    .select('*')
    .eq('id', ventureId)
    .single();

  if (ventureErr || !venture) {
    return { success: false, tables: {}, error: `Venture not found: ${ventureErr?.message || 'no data'}` };
  }
  snapshot.tables.ventures = [venture];

  // Export each related table
  for (const { table, fk } of RELATED_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(fk, ventureId);

    if (error) {
      snapshot.tables[table] = { error: error.message };
    } else {
      snapshot.tables[table] = data || [];
    }
  }

  // Write to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `venture-${ventureId}-${timestamp}.json`;
  const filepath = join(outputDir, filename);

  writeFileSync(filepath, JSON.stringify(snapshot, null, 2), 'utf8');

  const tableSummary = {};
  for (const [key, val] of Object.entries(snapshot.tables)) {
    tableSummary[key] = Array.isArray(val) ? val.length : 'error';
  }

  return { success: true, path: filepath, tables: tableSummary };
}

/**
 * Soft-delete a venture by setting deleted_at timestamp.
 * Does NOT remove any data from the database.
 * @param {string} ventureId - UUID of the venture
 * @param {object} [options]
 * @param {object} [options.supabase] - Pre-configured Supabase client
 * @returns {Promise<{success: boolean, deleted_at?: string, error?: string}>}
 */
export async function softDelete(ventureId, options = {}) {
  const supabase = options.supabase || getSupabase();

  // Check if already soft-deleted
  const { data: venture, error: fetchErr } = await supabase
    .from('ventures')
    .select('id, deleted_at')
    .eq('id', ventureId)
    .single();

  if (fetchErr || !venture) {
    return { success: false, error: `Venture not found: ${fetchErr?.message || 'no data'}` };
  }

  if (venture.deleted_at) {
    return { success: true, deleted_at: venture.deleted_at, note: 'already soft-deleted' };
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('ventures')
    .update({ deleted_at: now })
    .eq('id', ventureId);

  if (updateErr) {
    return { success: false, error: `Failed to soft-delete: ${updateErr.message}` };
  }

  return { success: true, deleted_at: now };
}

/**
 * Restore a soft-deleted venture within the 72-hour cooling period.
 * @param {string} ventureId - UUID of the venture
 * @param {object} [options]
 * @param {object} [options.supabase] - Pre-configured Supabase client
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function restore(ventureId, options = {}) {
  const supabase = options.supabase || getSupabase();

  const { data: venture, error: fetchErr } = await supabase
    .from('ventures')
    .select('id, deleted_at')
    .eq('id', ventureId)
    .single();

  if (fetchErr || !venture) {
    return { success: false, error: `Venture not found: ${fetchErr?.message || 'no data'}` };
  }

  if (!venture.deleted_at) {
    return { success: false, error: 'Venture is not soft-deleted' };
  }

  const deletedAt = new Date(venture.deleted_at);
  const cooldownExpiry = new Date(deletedAt.getTime() + COOLING_PERIOD_HOURS * 60 * 60 * 1000);

  if (new Date() > cooldownExpiry) {
    return {
      success: false,
      error: `Cooling period expired. Venture was soft-deleted at ${venture.deleted_at}, cooling period ended at ${cooldownExpiry.toISOString()}`,
    };
  }

  const { error: updateErr } = await supabase
    .from('ventures')
    .update({ deleted_at: null })
    .eq('id', ventureId);

  if (updateErr) {
    return { success: false, error: `Failed to restore: ${updateErr.message}` };
  }

  return { success: true };
}

/**
 * Permanently delete a venture and all related data.
 * This is irreversible and should only be called after cooling period expiry.
 * @param {string} ventureId - UUID of the venture
 * @param {object} [options]
 * @param {object} [options.supabase] - Pre-configured Supabase client
 * @param {boolean} [options.force] - Skip cooling period check
 * @returns {Promise<{success: boolean, deleted_tables: string[], error?: string}>}
 */
export async function permanentDelete(ventureId, options = {}) {
  const supabase = options.supabase || getSupabase();
  const deletedTables = [];

  if (!options.force) {
    const { data: venture } = await supabase
      .from('ventures')
      .select('id, deleted_at')
      .eq('id', ventureId)
      .single();

    if (venture && venture.deleted_at) {
      const deletedAt = new Date(venture.deleted_at);
      const cooldownExpiry = new Date(deletedAt.getTime() + COOLING_PERIOD_HOURS * 60 * 60 * 1000);
      if (new Date() < cooldownExpiry) {
        return {
          success: false,
          deleted_tables: [],
          error: `Cooling period still active until ${cooldownExpiry.toISOString()}`,
        };
      }
    }
  }

  // Delete from related tables first (FK order)
  for (const { table, fk } of RELATED_TABLES) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq(fk, ventureId);

    if (error) {
      console.warn(`Warning: Failed to delete from ${table}: ${error.message}`);
    } else {
      deletedTables.push(table);
    }
  }

  // Delete the venture record last
  const { error: ventureErr } = await supabase
    .from('ventures')
    .delete()
    .eq('id', ventureId);

  if (ventureErr) {
    return { success: false, deleted_tables: deletedTables, error: `Failed to delete venture: ${ventureErr.message}` };
  }

  deletedTables.push('ventures');
  return { success: true, deleted_tables: deletedTables };
}

/**
 * Find and permanently delete all ventures whose cooling period has expired.
 * Intended to be called by a scheduled job.
 * @param {object} [options]
 * @param {object} [options.supabase] - Pre-configured Supabase client
 * @returns {Promise<{processed: number, deleted: string[], failed: Array<{id: string, error: string}>}>}
 */
export async function cleanExpiredSoftDeletes(options = {}) {
  const supabase = options.supabase || getSupabase();

  const cutoff = new Date(Date.now() - COOLING_PERIOD_HOURS * 60 * 60 * 1000).toISOString();

  const { data: expired, error: queryErr } = await supabase
    .from('ventures')
    .select('id, name, deleted_at')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff);

  if (queryErr) {
    console.error('Failed to query expired ventures:', queryErr.message);
    return { processed: 0, deleted: [], failed: [{ id: 'query', error: queryErr.message }] };
  }

  if (!expired || expired.length === 0) {
    return { processed: 0, deleted: [], failed: [] };
  }

  const deleted = [];
  const failed = [];

  for (const venture of expired) {
    // Export snapshot before permanent deletion
    const exportResult = await exportVentureSnapshot(venture.id, { supabase });
    if (!exportResult.success) {
      console.warn(`Export failed for ${venture.id}, proceeding with deletion: ${exportResult.error}`);
    }

    const result = await permanentDelete(venture.id, { supabase, force: true });
    if (result.success) {
      deleted.push(venture.id);
    } else {
      failed.push({ id: venture.id, error: result.error });
    }
  }

  // Log to operations_audit_log
  await supabase.from('operations_audit_log').insert({
    operation_type: 'cleanup_expired_soft_deletes',
    details: {
      processed: expired.length,
      deleted: deleted.length,
      failed: failed.length,
      venture_ids_deleted: deleted,
      failures: failed,
    },
    performed_by: 'system_scheduler',
  }).then(({ error }) => {
    if (error) console.warn('Failed to log cleanup operation:', error.message);
  });

  return { processed: expired.length, deleted, failed };
}
