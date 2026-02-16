#!/usr/bin/env node

/**
 * EVA Error Recovery Status Dashboard
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-F
 *
 * Unified view of all recovery systems: circuit breakers, DLQ, sagas.
 *
 * Usage: node scripts/eva-recovery-status.js [--json]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getRecoveryStatus } from '../lib/eva/error-recovery-orchestrator.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const jsonMode = process.argv.includes('--json');

  const status = await getRecoveryStatus(supabase);

  if (jsonMode) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  EVA Error Recovery Status Dashboard');
  console.log('═══════════════════════════════════════════════');

  // Circuit Breakers
  console.log('\n  Circuit Breakers');
  console.log('  ─────────────────────');
  if (status.circuitBreakers.length === 0) {
    console.log('    No circuit breakers registered');
  } else {
    for (const cb of status.circuitBreakers) {
      const icon = cb.state === 'CLOSED' ? '🟢' : cb.state === 'OPEN' ? '🔴' : '🟡';
      console.log(`    ${icon} ${cb.service}: ${cb.state} (${cb.failures} failures)`);
      if (cb.lastFailure) console.log(`       Last failure: ${cb.lastFailure}`);
    }
  }

  // Dead Letter Queue
  console.log('\n  Dead Letter Queue');
  console.log('  ─────────────────────');
  console.log(`    Total: ${status.dlq.total} | Pending: ${status.dlq.pending} | Replayed: ${status.dlq.replayed}`);
  if (status.dlq.recent.length > 0) {
    console.log('    Recent pending:');
    for (const item of status.dlq.recent) {
      console.log(`      ⚠ ${item.event_type} (${item.created_at})`);
    }
  }

  // Saga Log
  console.log('\n  Saga Coordinator');
  console.log('  ─────────────────────');
  console.log(`    Total sagas: ${status.sagas.total}`);
  if (Object.keys(status.sagas.byStatus).length > 0) {
    for (const [st, count] of Object.entries(status.sagas.byStatus)) {
      const icon = st === 'completed' ? '✓' : st === 'compensated' ? '↩' : '✗';
      console.log(`    ${icon} ${st}: ${count}`);
    }
  }
  if (status.sagas.recent.length > 0) {
    console.log('    Recent:');
    for (const s of status.sagas.recent) {
      console.log(`      ${s.name} → ${s.status} (${s.created_at})`);
    }
  }

  console.log('\n═══════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
