import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', 'SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const mechanism_verifications = [
  {
    claim: 'lookupConsultRowCreatedAt() (release-oracle-hold.js) queries only session_coordination, no retention_archive fallback',
    verified: true,
    method: 'Direct file read of scripts/release-oracle-hold.js:37-44 on origin/main (0703e6705f5)',
  },
  {
    claim: 'The QF release branch (releaseQfOracleHold) drops consultRowId/consultRowCreatedAt/releasedBy while the SD branch (releaseSdOracleHold) carries all three',
    verified: true,
    method: 'Direct file read of scripts/release-oracle-hold.js:99-105 and lib/fleet/hold-writer.js releaseQfOracleHold/releaseSdOracleHold signatures',
  },
  {
    claim: 'The batch-mint consult row payload lacks a correlation_id despite session_coordination having that column',
    verified: true,
    method: 'Direct file read of scripts/cron/batch-mint-sweep.mjs openConsultRow insert + database/schema-reference-snapshot.json column list',
  },
  {
    claim: "Drain-set root cause: worker-status.cjs registers 'solomon_consult' for Solomon while the writer emits the differently-named 'oracle_read_pending_consult' -- a naming collision, not a missing registration slot",
    verified: true,
    method: 'Direct file read of lib/fleet/worker-status.cjs DRAIN_SETS + live query of role_drain_sets (0 rows match kind ILIKE %oracle%)',
  },
  {
    claim: 'FR-C (release siblings QF-20260903-055/-222/-522/-935) is moot -- already released by another session since the amendment was written',
    verified: true,
    method: 'Live query of quick_fixes for all 4 ids: status=open, owner=null, release_condition=null',
  },
  {
    claim: 'No code anywhere reads a Solomon reply/verdict to release a hold -- only the manual CLI and the bounded-wait timer function today',
    verified: true,
    method: 'Repo-wide grep for callers of releaseSdOracleHold/releaseQfOracleHold: only release-oracle-hold.js, test files, and the unrelated release-chairman-gated-qf.js defensive guard',
  },
  {
    claim: "SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (status=completed) has an accepted success criterion stating the verdict-release path is the primary path and the timer is degraded",
    verified: true,
    method: "Live query of strategic_directives_v2.success_criteria for that SD -- verbatim: 'until a Solomon consult verdict is on record OR ~30min oracle silence elapses; each degraded release writes its own line naming the elapsed wait'",
  },
];

const scope_decision = {
  decision: 'BUILD the minimal Solomon-verdict-read release wiring (FR-3), rather than exercising the discretion granted in the SD text\'s THIRD SPECIMEN amendment to drop the review framing and keep the timer as the sole, honestly-labeled path.',
  rationale: 'SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 is already COMPLETED with an accepted success criterion stating the verdict path is primary. Dropping the review framing in this SD would retroactively falsify that completed SD\'s promise -- a bigger, riskier action than building the wiring, which follows an existing repo convention (correlation_id/reply_to, scripts/worker-signal.cjs) and adds no new cron/daemon/table.',
  decided_by: 'Golf-3 (session a1d6d6cf-4e4c-455a-b5bd-6066cae77c32), LEAD phase',
  reported_via: 'worker-signal.cjs feedback, signal_id 7f9b4384-6e3f-4ab9-b07b-8fdae3145336 (decide+report, not a permission request)',
};

const metadata = {
  ...sd.metadata,
  mechanism_verifications,
  scope_decision,
};

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log(`SD metadata updated: ${mechanism_verifications.length} mechanism_verifications + scope_decision recorded.`);
