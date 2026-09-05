import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', 'SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

// GATE_MECHANISM_CLAIM_VERIFIER requires the EXACT shape { verified_by, verified_at: "path:LINE" }.
// The prior mechanism_verification_details (claim/verified/method) is kept as a separate,
// more-detailed record; this array is the gate-readable one.
const mechanism_verifications = [
  {
    verified_by: 'Golf-3 (fork investigation + independent Explore agent, sub_agent_execution_results id f355a095-be5b-4049-836b-715a94c25810)',
    verified_at: 'scripts/release-oracle-hold.js:39',
  },
  {
    verified_by: 'Golf-3 (fork investigation + independent Explore agent, sub_agent_execution_results id f355a095-be5b-4049-836b-715a94c25810)',
    verified_at: 'lib/fleet/hold-writer.js:220',
  },
  {
    verified_by: 'Golf-3 (fork investigation + independent Explore agent, sub_agent_execution_results id f355a095-be5b-4049-836b-715a94c25810)',
    verified_at: 'scripts/cron/batch-mint-sweep.mjs:42',
  },
  {
    verified_by: 'Golf-3 (fork investigation + independent Explore agent, sub_agent_execution_results id f355a095-be5b-4049-836b-715a94c25810)',
    verified_at: 'database/migrations/20260713_fix_cleanup_expired_coordination_where_clause.sql:33',
  },
];

const metadata = {
  ...sd.metadata,
  mechanism_verification_details: sd.metadata?.mechanism_verifications || [],
  mechanism_verifications,
};

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log(`SD metadata updated: mechanism_verifications now in gate-readable shape (${mechanism_verifications.length} entries).`);
