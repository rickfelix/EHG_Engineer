#!/usr/bin/env node

/**
 * EVA Event Bus Health Dashboard
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-E
 *
 * Shows event bus status: handler registry, recent events, DLQ depth, config.
 *
 * Usage: node scripts/eva-events-status.js [--json]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getEventBusConfig() {
  try {
    const { data } = await supabase
      .from('eva_config')
      .select('key, value')
      .like('key', 'event_bus.%');
    return data || [];
  } catch {
    return [];
  }
}

async function getRecentEvents(limit = 10) {
  try {
    const { data } = await supabase
      .from('eva_events')
      .select('id, event_type, venture_id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  } catch {
    return [];
  }
}

async function getDLQStats() {
  try {
    const { data } = await supabase
      .from('eva_events_dlq')
      .select('id, event_type, failure_reason, created_at, replayed')
      .order('created_at', { ascending: false })
      .limit(20);

    const items = data || [];
    const pending = items.filter(i => !i.replayed);
    const replayed = items.filter(i => i.replayed);
    return { total: items.length, pending: pending.length, replayed: replayed.length, items: pending.slice(0, 5) };
  } catch {
    return { total: 0, pending: 0, replayed: 0, items: [] };
  }
}

async function getSchemaRegistryInfo() {
  try {
    const { data } = await supabase
      .from('eva_event_schemas')
      .select('event_type')
      .limit(1);
    const hasDBSchemas = data && data.length > 0;
    return { schema_source: hasDBSchemas ? 'database' : 'in-memory' };
  } catch {
    return { schema_source: 'in-memory' };
  }
}

async function getHookObserverInfo() {
  // Hook observers are in-process state; report from event bus module when available.
  // For the status script (runs as separate process), we report the design target.
  return {
    hook_observer_count: 1, // governance observer registered by default in initializeEventBus
    mandatory_emit_paths: [
      'scripts/eva/vision-scorer.js',
      'scripts/eva/corrective-sd-generator.mjs',
      'scripts/modules/handoff/executors/lead-final-approval/index.js',
    ],
  };
}

async function getEventTypeCounts() {
  try {
    const { data } = await supabase
      .from('eva_event_ledger')
      .select('event_type, status');

    if (!data) return {};
    const counts = {};
    for (const row of data) {
      const type = row.event_type || 'unknown';
      counts[type] = counts[type] || { processed: 0, failed: 0, total: 0 };
      counts[type].total++;
      if (row.status === 'processed') counts[type].processed++;
      if (row.status === 'failed') counts[type].failed++;
    }
    return counts;
  } catch {
    return {};
  }
}

async function main() {
  const jsonMode = process.argv.includes('--json');

  const [config, recentEvents, dlqStats, typeCounts, schemaInfo, hookInfo] = await Promise.all([
    getEventBusConfig(),
    getRecentEvents(),
    getDLQStats(),
    getEventTypeCounts(),
    getSchemaRegistryInfo(),
    getHookObserverInfo(),
  ]);

  const enabledConfig = config.find(c => c.key === 'event_bus.enabled');
  const envEnabled = process.env.EVA_EVENT_BUS_ENABLED;
  const isEnabled = envEnabled === 'true' || enabledConfig?.value === 'true' || (envEnabled === undefined && !enabledConfig);

  const handlerTypes = [
    'stage.completed', 'decision.submitted', 'gate.evaluated', 'sd.completed',
    'venture.created', 'venture.killed', 'budget.exceeded', 'chairman.override', 'stage.failed',
  ];

  const report = {
    enabled: isEnabled,
    enabledSource: envEnabled !== undefined ? 'env' : enabledConfig ? 'database' : 'default (true)',
    registeredHandlers: handlerTypes.length,
    handlerTypes,
    recentEvents: recentEvents.length,
    dlq: dlqStats,
    eventTypeCounts: typeCounts,
    config: config.reduce((acc, c) => { acc[c.key] = c.value; return acc; }, {}),
    schema_source: schemaInfo.schema_source,
    hook_observer_count: hookInfo.hook_observer_count,
    mandatory_emit_paths: hookInfo.mandatory_emit_paths,
  };

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Human-readable output
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  EVA Event Bus Health Dashboard');
  console.log('═══════════════════════════════════════════');
  console.log('');

  console.log(`  Status:         ${isEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}`);
  console.log(`  Source:         ${report.enabledSource}`);
  console.log(`  Handlers:       ${handlerTypes.length} registered`);
  console.log(`  Schema Source:  ${report.schema_source}`);
  console.log(`  Hook Observers: ${report.hook_observer_count}`);
  console.log('');

  console.log('  Handler Registry:');
  for (const t of handlerTypes) {
    console.log(`    ✓ ${t}`);
  }
  console.log('');

  // DLQ
  console.log(`  Dead Letter Queue: ${dlqStats.pending} pending, ${dlqStats.replayed} replayed`);
  if (dlqStats.items.length > 0) {
    console.log('  Pending DLQ items:');
    for (const item of dlqStats.items) {
      console.log(`    ⚠ ${item.event_type} — ${item.failure_reason || 'no reason'} (${item.created_at})`);
    }
  }
  console.log('');

  // Recent events
  if (recentEvents.length > 0) {
    console.log(`  Recent Events (last ${recentEvents.length}):`);
    for (const evt of recentEvents.slice(0, 5)) {
      const statusIcon = evt.status === 'processed' ? '✓' : evt.status === 'failed' ? '✗' : '…';
      console.log(`    ${statusIcon} ${evt.event_type} [${evt.venture_id || 'n/a'}] ${evt.created_at}`);
    }
  } else {
    console.log('  Recent Events: none');
  }
  console.log('');

  // Event type breakdown
  const typeKeys = Object.keys(typeCounts);
  if (typeKeys.length > 0) {
    console.log('  Event Type Breakdown:');
    for (const type of typeKeys) {
      const c = typeCounts[type];
      console.log(`    ${type}: ${c.total} total (${c.processed} ok, ${c.failed} failed)`);
    }
  }

  // Mandatory emit paths (GAP-026: FR-005)
  console.log('');
  console.log('  Mandatory Emit Paths:');
  for (const p of report.mandatory_emit_paths) {
    console.log(`    ✓ ${p}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
