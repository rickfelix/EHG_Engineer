#!/usr/bin/env node
/**
 * Venture Lifecycle CLI — Main entry point for venture data lifecycle operations.
 *
 * Usage:
 *   node scripts/venture-lifecycle.cjs teardown         — Delete all ventures + child data
 *   node scripts/venture-lifecycle.cjs teardown <id>    — Delete specific venture + child data
 *   node scripts/venture-lifecycle.cjs archive <id>     — Soft-delete a venture (set deleted_at)
 *   node scripts/venture-lifecycle.cjs restore <id>     — Undo soft-delete (clear deleted_at)
 *   node scripts/venture-lifecycle.cjs status           — Show venture lifecycle status
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const {
  VENTURE_FK_REGISTRY,
  VENTURE_SELF_REFS,
  getTeardownOrder,
  getSummary,
} = require('./modules/venture-lifecycle/fk-registry.cjs');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── TEARDOWN ───────────────────────────────────────────────────────────────

async function teardown(targetId) {
  const startTime = Date.now();

  // Get ventures to delete
  let query = supabase.from('ventures').select('id, name, status');
  if (targetId) query = query.eq('id', targetId);
  const { data: ventures, error: vErr } = await query;

  if (vErr) {
    console.error('Error fetching ventures:', vErr.message);
    process.exit(1);
  }

  if (!ventures || ventures.length === 0) {
    console.log(targetId
      ? `No venture found with id: ${targetId}`
      : 'No ventures found. Nothing to delete.');
    return;
  }

  const ids = ventures.map(v => v.id);
  console.log(`\n🗑️  Teardown: ${ventures.length} venture(s)`);
  ventures.forEach(v => console.log(`   ${v.name} [${v.status}] (${v.id})`));
  console.log('');

  const { restrict, setNull, cascade } = getTeardownOrder();
  let errors = [];
  let cleaned = 0;
  let skipped = 0;
  let blocked = 0;

  // Phase 1: Check RESTRICT tables for blocking records
  for (const entry of restrict) {
    const { data, error } = await supabase
      .from(entry.table)
      .select('id', { count: 'exact', head: true })
      .in(entry.column, ids);

    if (error) {
      if (isTableMissing(error)) { skipped++; continue; }
      errors.push({ table: entry.table, column: entry.column, msg: error.message });
      continue;
    }

    // Supabase head:true doesn't return count reliably, check with actual query
    const { data: records } = await supabase
      .from(entry.table)
      .select('id')
      .in(entry.column, ids)
      .limit(1);

    if (records && records.length > 0) {
      console.log(`   ⛔ BLOCKED: ${entry.table} has governance records (RESTRICT policy)`);
      blocked++;
    }
  }

  if (blocked > 0) {
    console.log(`\n❌ Teardown blocked by ${blocked} RESTRICT table(s).`);
    console.log('   Archive these ventures first, or delete governance records manually.');
    console.log('   Governance tables preserve audit trail — deletion requires explicit override.');
    console.log('\n   To force teardown (deletes governance records):');
    console.log('   node scripts/venture-lifecycle.cjs teardown --force');

    if (!process.argv.includes('--force')) {
      process.exit(1);
    }
    console.log('\n   ⚠️  --force flag detected. Proceeding with governance record deletion...\n');
  }

  // Phase 2: SET_NULL cross-references
  for (const entry of setNull) {
    const { error } = await supabase
      .from(entry.table)
      .update({ [entry.column]: null })
      .in(entry.column, ids);

    if (error) {
      if (isTableMissing(error)) { skipped++; continue; }
      errors.push({ table: entry.table, column: entry.column, msg: error.message });
    } else {
      cleaned++;
    }
  }

  // Phase 3: DELETE from RESTRICT tables (only if --force or no blocking records)
  if (blocked === 0 || process.argv.includes('--force')) {
    for (const entry of restrict) {
      const { error } = await supabase
        .from(entry.table)
        .delete()
        .in(entry.column, ids);

      if (error) {
        if (isTableMissing(error)) { skipped++; continue; }
        errors.push({ table: entry.table, column: entry.column, msg: error.message });
      } else {
        cleaned++;
      }
    }
  }

  // Phase 4: DELETE from CASCADE tables
  for (const entry of cascade) {
    const { error } = await supabase
      .from(entry.table)
      .delete()
      .in(entry.column, ids);

    if (error) {
      if (isTableMissing(error)) { skipped++; continue; }
      errors.push({ table: entry.table, column: entry.column, msg: error.message });
    } else {
      cleaned++;
    }
  }

  // Phase 5: Null self-referencing FKs
  const selfRefUpdate = {};
  for (const col of VENTURE_SELF_REFS) {
    selfRefUpdate[col] = null;
  }
  await supabase.from('ventures').update(selfRefUpdate).in('id', ids);

  // Phase 6: Delete ventures
  const { error: delErr } = await supabase.from('ventures').delete().in('id', ids);
  if (delErr) {
    console.error('❌ FAILED to delete ventures:', delErr.message);
    process.exit(1);
  }

  // Verify
  const { data: remaining } = await supabase.from('ventures').select('id');
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n─── Teardown Results ───`);
  console.log(`   Tables cleaned:  ${cleaned}`);
  console.log(`   Tables skipped:  ${skipped} (not found in live DB)`);
  console.log(`   Errors:          ${errors.length}`);
  console.log(`   Remaining:       ${remaining ? remaining.length : 0} ventures`);
  console.log(`   Time:            ${elapsed}s`);

  if (errors.length > 0) {
    console.log('\n   Errors:');
    errors.forEach(e => console.log(`   ⚠️  ${e.table}.${e.column}: ${e.msg}`));
  }

  console.log('');
}

// ─── ARCHIVE (Soft-Delete) ──────────────────────────────────────────────────

async function archive(ventureId) {
  if (!ventureId) {
    console.error('Usage: venture-lifecycle.cjs archive <venture-id>');
    process.exit(1);
  }

  // Check if deleted_at column exists
  const hasCol = await hasDeletedAtColumn();
  if (!hasCol) {
    console.error('❌ deleted_at column does not exist on ventures table.');
    console.error('   Run the soft-delete migration first (Phase 2).');
    process.exit(1);
  }

  const { data: venture, error: vErr } = await supabase
    .from('ventures')
    .select('id, name, status, deleted_at')
    .eq('id', ventureId)
    .maybeSingle();

  if (vErr || !venture) {
    console.error(vErr ? vErr.message : `Venture not found: ${ventureId}`);
    process.exit(1);
  }

  if (venture.deleted_at) {
    console.log(`ℹ️  Venture "${venture.name}" is already archived (deleted_at: ${venture.deleted_at})`);
    return;
  }

  const { error } = await supabase
    .from('ventures')
    .update({ deleted_at: new Date().toISOString(), status: 'archived' })
    .eq('id', ventureId);

  if (error) {
    console.error('Archive failed:', error.message);
    process.exit(1);
  }

  console.log(`✅ Archived: "${venture.name}" (${ventureId})`);
  console.log('   Venture is now hidden from v_active_ventures view.');
  console.log('   To restore: node scripts/venture-lifecycle.cjs restore ' + ventureId);
}

// ─── RESTORE ────────────────────────────────────────────────────────────────

async function restore(ventureId) {
  if (!ventureId) {
    console.error('Usage: venture-lifecycle.cjs restore <venture-id>');
    process.exit(1);
  }

  const hasCol = await hasDeletedAtColumn();
  if (!hasCol) {
    console.error('❌ deleted_at column does not exist on ventures table.');
    console.error('   Run the soft-delete migration first (Phase 2).');
    process.exit(1);
  }

  const { data: venture, error: vErr } = await supabase
    .from('ventures')
    .select('id, name, status, deleted_at')
    .eq('id', ventureId)
    .maybeSingle();

  if (vErr || !venture) {
    console.error(vErr ? vErr.message : `Venture not found: ${ventureId}`);
    process.exit(1);
  }

  if (!venture.deleted_at) {
    console.log(`ℹ️  Venture "${venture.name}" is not archived (deleted_at is null)`);
    return;
  }

  const { error } = await supabase
    .from('ventures')
    .update({ deleted_at: null, status: 'active' })
    .eq('id', ventureId);

  if (error) {
    console.error('Restore failed:', error.message);
    process.exit(1);
  }

  console.log(`✅ Restored: "${venture.name}" (${ventureId})`);
  console.log('   Venture is now visible in v_active_ventures view.');
}

// ─── STATUS ─────────────────────────────────────────────────────────────────

async function status() {
  // Try with deleted_at first; fall back without it if column doesn't exist yet
  let ventures;
  let hasDeletedAt = true;

  const { data, error } = await supabase
    .from('ventures')
    .select('id, name, status, deleted_at, created_at')
    .order('created_at', { ascending: false });

  if (error && error.message.includes('deleted_at')) {
    hasDeletedAt = false;
    const fallback = await supabase
      .from('ventures')
      .select('id, name, status, created_at')
      .order('created_at', { ascending: false });
    if (fallback.error) {
      console.error('Error:', fallback.error.message);
      process.exit(1);
    }
    ventures = fallback.data;
  } else if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } else {
    ventures = data;
  }

  if (!ventures || ventures.length === 0) {
    console.log('No ventures found.');
    return;
  }

  const active = ventures.filter(v => (!hasDeletedAt || !v.deleted_at) && v.status !== 'killed');
  const archived = hasDeletedAt ? ventures.filter(v => v.deleted_at) : [];
  const killed = ventures.filter(v => (!hasDeletedAt || !v.deleted_at) && v.status === 'killed');

  const summary = getSummary();
  console.log('\n═══ Venture Lifecycle Status ═══');
  console.log(`FK Registry: ${summary.total} entries (${summary.cascade} CASCADE, ${summary.restrict} RESTRICT, ${summary.setNull} SET_NULL)`);
  if (!hasDeletedAt) {
    console.log('ℹ️  Soft-delete not yet enabled (deleted_at column missing). Run Phase 2 migration.');
  }
  console.log('');

  console.log(`Active (${active.length}):`);
  active.forEach(v => console.log(`   ${v.name} [${v.status}]`));

  if (archived.length > 0) {
    console.log(`\nArchived (${archived.length}):`);
    archived.forEach(v => console.log(`   ${v.name} (archived: ${v.deleted_at})`));
  }

  if (killed.length > 0) {
    console.log(`\nKilled (${killed.length}):`);
    killed.forEach(v => console.log(`   ${v.name}`));
  }

  console.log('');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isTableMissing(error) {
  return error.code === '42P01'
    || error.message.includes('does not exist')
    || error.message.includes('schema cache');
}

async function hasDeletedAtColumn() {
  const { error } = await supabase
    .from('ventures')
    .select('deleted_at')
    .limit(1);
  return !error || !error.message.includes('deleted_at');
}

// ─── CLI Router ─────────────────────────────────────────────────────────────

const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'teardown':
    teardown(arg).catch(fatal);
    break;
  case 'archive':
    archive(arg).catch(fatal);
    break;
  case 'restore':
    restore(arg).catch(fatal);
    break;
  case 'status':
    status().catch(fatal);
    break;
  default:
    console.log('Venture Lifecycle CLI');
    console.log('');
    console.log('Commands:');
    console.log('  teardown [id]     Delete all ventures (or specific) + child data');
    console.log('  teardown --force  Delete including governance records (RESTRICT tables)');
    console.log('  archive <id>      Soft-delete a venture');
    console.log('  restore <id>      Undo soft-delete');
    console.log('  status            Show venture lifecycle status');
    break;
}

function fatal(err) {
  console.error('Fatal:', err);
  process.exit(1);
}
