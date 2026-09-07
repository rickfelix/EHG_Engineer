import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-ADAM-COMMS-001';
const VERIFIER = 'Alpha-5 worker session bc70bff7';

const MECHANISM_VERIFICATIONS = [
  {
    verified_by: VERIFIER,
    verified_at: 'scripts/michael-inbox.cjs:48',
    claim: "drainInbox() (lines 48-93) SELECTs unread rows via `.is('read_at', null)` at line 53, filters/prints them, but contains NO UPDATE call anywhere in the function -- confirmed by reading the full function body directly.",
  },
  {
    verified_by: VERIFIER,
    verified_at: 'scripts/solomon-advisory.cjs:532',
    claim: "The sibling drain michael-inbox.cjs claims to mirror stamps read_at on every surfaced row: `await supabase.from('session_coordination').update({ read_at: now }).in('id', ids).is('read_at', null)`.",
  },
  {
    verified_by: VERIFIER,
    verified_at: 'scripts/michael-quiet-tick.mjs:114',
    claim: "The inbox-nudge counter queries `q.eq('target_session', sid).is('acknowledged_at', null).in('payload->>kind', inboxKinds)` -- keyed on acknowledged_at, a different column than michael-inbox.cjs's read_at.",
  },
  {
    verified_by: VERIFIER,
    verified_at: 'scripts/michael-register.cjs:405',
    claim: 'michaelReplyMirror() (lines 405-417) explicitly documents Michael as receive-only by spec: "Michael SENDS nothing to the fleet: fleet-class items reach Adam as chairman_handoff rows ... batched once per morning by the feeders." Confirms claim 1 (no advisory sender) is deliberate design, not a gap.',
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
