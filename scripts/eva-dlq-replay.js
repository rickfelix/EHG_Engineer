#!/usr/bin/env node

/**
 * EVA DLQ Replay CLI
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-F
 *
 * Manage and replay dead-lettered events from the EVA event bus.
 *
 * Usage:
 *   node scripts/eva-dlq-replay.js list [--filter <event_type>]
 *   node scripts/eva-dlq-replay.js replay <dlq_id>
 *   node scripts/eva-dlq-replay.js replay --batch [--filter <event_type>] [--dry-run]
 *   node scripts/eva-dlq-replay.js stats
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { replayDLQEntry } from '../lib/eva/event-bus/event-router.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = process.argv.slice(2);
const command = args[0] || 'list';
const filterIdx = args.indexOf('--filter');
const filterType = filterIdx !== -1 ? args[filterIdx + 1] : null;
const dryRun = args.includes('--dry-run');
const batchMode = args.includes('--batch');
const jsonMode = args.includes('--json');

async function listDLQ() {
  let query = supabase
    .from('eva_events_dlq')
    .select('id, event_type, failure_reason, original_event_id, created_at, replayed')
    .eq('replayed', false)
    .order('created_at', { ascending: false })
    .limit(50);

  if (filterType) {
    query = query.eq('event_type', filterType);
  }

  const { data, error } = await query;
  if (error) { console.error('Error:', error.message); process.exit(1); }

  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (!data || data.length === 0) {
    console.log('\n  No pending DLQ entries found.\n');
    return;
  }

  console.log(`\n  Dead Letter Queue (${data.length} pending)\n`);
  console.log('  ID                                    Type                  Reason                           Created');
  console.log('  ' + '─'.repeat(110));
  for (const item of data) {
    const id = item.id.substring(0, 36).padEnd(38);
    const type = (item.event_type || 'unknown').padEnd(22);
    const reason = (item.failure_reason || 'n/a').substring(0, 32).padEnd(33);
    const created = item.created_at?.substring(0, 19) || '';
    console.log(`  ${id}${type}${reason}${created}`);
  }
  console.log('');
}

async function replaySingle(dlqId) {
  if (dryRun) {
    console.log(`[DRY-RUN] Would replay DLQ entry: ${dlqId}`);
    return;
  }

  try {
    const result = await replayDLQEntry(supabase, dlqId);
    console.log(`  ✓ Replayed ${dlqId}: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error(`  ✗ Failed to replay ${dlqId}: ${err.message}`);
  }
}

async function replayBatch() {
  let query = supabase
    .from('eva_events_dlq')
    .select('id, event_type')
    .eq('replayed', false)
    .order('created_at', { ascending: true })
    .limit(100);

  if (filterType) {
    query = query.eq('event_type', filterType);
  }

  const { data, error } = await query;
  if (error) { console.error('Error:', error.message); process.exit(1); }

  if (!data || data.length === 0) {
    console.log('\n  No pending DLQ entries to replay.\n');
    return;
  }

  console.log(`\n  Replaying ${data.length} DLQ entries${filterType ? ` (filter: ${filterType})` : ''}${dryRun ? ' [DRY-RUN]' : ''}\n`);

  let success = 0, failed = 0;
  for (const item of data) {
    if (dryRun) {
      console.log(`  [DRY-RUN] Would replay: ${item.id} (${item.event_type})`);
      success++;
      continue;
    }

    try {
      await replayDLQEntry(supabase, item.id);
      console.log(`  ✓ ${item.id} (${item.event_type})`);
      success++;
    } catch (err) {
      console.error(`  ✗ ${item.id} (${item.event_type}): ${err.message}`);
      failed++;
    }
  }

  console.log(`\n  Results: ${success} success, ${failed} failed\n`);
}

async function showStats() {
  const [pending, replayed, byType] = await Promise.all([
    supabase.from('eva_events_dlq').select('id', { count: 'exact', head: true }).eq('replayed', false),
    supabase.from('eva_events_dlq').select('id', { count: 'exact', head: true }).eq('replayed', true),
    supabase.from('eva_events_dlq').select('event_type, replayed'),
  ]);

  const stats = {
    pending: pending.count || 0,
    replayed: replayed.count || 0,
    total: (pending.count || 0) + (replayed.count || 0),
  };

  const typeBreakdown = {};
  for (const item of (byType.data || [])) {
    const type = item.event_type || 'unknown';
    typeBreakdown[type] = typeBreakdown[type] || { pending: 0, replayed: 0 };
    if (item.replayed) typeBreakdown[type].replayed++;
    else typeBreakdown[type].pending++;
  }

  if (jsonMode) {
    console.log(JSON.stringify({ ...stats, byType: typeBreakdown }, null, 2));
    return;
  }

  console.log('\n  DLQ Statistics');
  console.log('  ─────────────────────');
  console.log(`  Total entries:  ${stats.total}`);
  console.log(`  Pending:        ${stats.pending}`);
  console.log(`  Replayed:       ${stats.replayed}`);
  console.log('');

  if (Object.keys(typeBreakdown).length > 0) {
    console.log('  By Event Type:');
    for (const [type, counts] of Object.entries(typeBreakdown)) {
      console.log(`    ${type}: ${counts.pending} pending, ${counts.replayed} replayed`);
    }
  }
  console.log('');
}

async function main() {
  switch (command) {
    case 'list':
    case 'ls':
      await listDLQ();
      break;
    case 'replay':
      if (batchMode) {
        await replayBatch();
      } else {
        const dlqId = args[1];
        if (!dlqId || dlqId.startsWith('-')) {
          console.error('Usage: eva-dlq-replay.js replay <dlq_id> | --batch');
          process.exit(1);
        }
        await replaySingle(dlqId);
      }
      break;
    case 'stats':
      await showStats();
      break;
    case '--help':
    case 'help':
      console.log(`
EVA DLQ Replay Tool

Commands:
  list [--filter <type>]              List pending DLQ entries
  replay <dlq_id>                     Replay a single DLQ entry
  replay --batch [--filter <type>]    Replay all pending (with optional filter)
  stats                               Show DLQ statistics

Flags:
  --filter <event_type>   Filter by event type
  --batch                 Process all matching entries
  --dry-run               Preview without executing
  --json                  Output as JSON
      `);
      break;
    default:
      console.error(`Unknown command: ${command}. Try --help`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
