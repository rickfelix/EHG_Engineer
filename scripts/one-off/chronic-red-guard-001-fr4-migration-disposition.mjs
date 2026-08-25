#!/usr/bin/env node
/**
 * Record FR-4's disposition decision for the one genuine (non-chairman-gated) NOT_APPLIED
 * migration in SD-LEO-INFRA-CHRONIC-RED-GUARD-001's scope, in the SD's own metadata.
 *
 * Written as a script file rather than an inline `node -e` one-liner because the reason text
 * needs a literal backtick-quoted shell command; a prior inline attempt via bash -c "node -e ..."
 * had that exact substring silently stripped by bash's own command-substitution parsing before
 * it ever reached node -- caught by reading the value back from the DB, not assumed correct.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CHRONIC-RED-GUARD-001';

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: sd, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (readErr) throw new Error(readErr.message);

  const metadata = {
    ...sd.metadata,
    fr4_migration_disposition: {
      file: 'database/migrations/20260819_eva_scheduler_metrics_created_at_index.sql',
      disposition: 'deliberately_deferred_companion_action',
      recorded_at: new Date().toISOString(),
      reason:
        "FR-4's one genuine (non-chairman-gated) NOT_APPLIED migration. Its own header requires a " +
        'non-transactional apply path (CREATE INDEX CONCURRENTLY cannot run inside ' +
        "apply-migration.js's default BEGIN/COMMIT wrapper) via the command " +
        'supabase db query --linked --file database/migrations/20260819_eva_scheduler_metrics_created_at_index.sql, ' +
        "bypassing this session's verified/governed tooling entirely, against a live 3.4M-row " +
        'production table. Belongs to a different, already-shipped SD ' +
        '(SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001), not this one. Explicitly named here (per FR-4 ' +
        "AC-1's deliberately-deferred-exception clause) rather than silently left undispositioned " +
        "or force-applied via a bypass tool outside this SD's scope. Remains a live, visible " +
        'drift-guard gap (not ledger-suppressed) until a chairman/ops session with the correct ' +
        'tooling applies it.',
      not_ledger_suppressed_because:
        'It is not chairman-gated and is not a deliberate wait state -- it is ordinary, real ' +
        "drift that this SD's own design says must stay visible, not silenced.",
    },
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('sd_key', SD_KEY);
  if (updateErr) throw new Error(updateErr.message);

  console.log('✅ FR-4 migration disposition recorded (corrected, backtick-clean) in SD metadata');
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
