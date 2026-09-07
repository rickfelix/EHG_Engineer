import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-READ-WRITTEN-UNSCOPED-001';
const VERIFIER = 'Alpha-5 worker session bc70bff7';

const MECHANISM_VERIFICATIONS = [
  {
    verified_by: VERIFIER,
    verified_at: 'scripts/fleet-dashboard.cjs:1911',
    claim: "printInbox()'s UPDATE stamping read_at (`.update({ read_at: new Date().toISOString() }).in('id', ids)`) has no `.is('read_at', null)` gate -- confirmed by reading the full function body directly.",
  },
  {
    verified_by: VERIFIER,
    verified_at: 'scripts/fleet-dashboard.cjs:1814',
    claim: "The SELECT feeding printInbox gates on `.is('acknowledged_at', null)`, not read_at -- confirming the 'silently hides an unacked signal' bug this write's header comment cites was fixed via the SELECT's column, not the UPDATE's unconditionality.",
  },
  {
    verified_by: VERIFIER,
    verified_at: 'docs/protocol/fleet-worker-loop-directive.md:55',
    claim: 'States "node scripts/fleet-dashboard.cjs inbox is a READ-ONLY VIEW... printWorkerInbox... stamps NOTHING" -- textually names printWorkerInbox but the surrounding framing describes the inbox command as a whole.',
  },
  {
    verified_by: VERIFIER,
    verified_at: 'scripts/fleet-dashboard.cjs:3317',
    claim: "The inbox command's dispatcher routes to printWorkerInbox only when resolveInboxAudience() resolves to worker mode; otherwise it reaches printInbox() (the writing path), confirmed by reading the full dispatcher block.",
  },
];

async function main() {
  const { data: current, error: readError } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (readError) { console.error('READ FAILED:', readError.message); process.exit(1); }

  if (Array.isArray(current.metadata?.mechanism_verifications) && current.metadata.mechanism_verifications.length > 0) {
    console.log('Already applied. No-op.');
    process.exit(0);
  }

  const newMetadata = { ...current.metadata, mechanism_verifications: MECHANISM_VERIFICATIONS };

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: newMetadata })
    .eq('sd_key', SD_KEY);
  if (updateError) { console.error('UPDATE FAILED:', updateError.message); process.exit(1); }

  const { data: verify } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  console.log('mechanism_verifications count:', verify.metadata?.mechanism_verifications?.length);
}

if (isMainModule(import.meta.url)) {
  main();
}
