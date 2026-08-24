#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-INFRA-COMMS-LANE-TTLS-001';
const SD_KEY = 'SD-LEO-INFRA-COMMS-LANE-TTLS-001';

// STORIES correction-pass (evidence 414186aa) found 2 HIGH + 1 MEDIUM defects that live at
// the FR level, not just story detail, requiring PRD correction:
//
// HIGH-1: FR-1 as written names literal payload.kind lanes (directive/advisory/reply/
// suggestion) that DO NOT EXIST as live values (a fully-paged census of 6662 rows found
// zero matches -- real kinds are coordinator_reminder/roll_call/periodic_liveness_flag/
// adam_advisory/coordinator_directive/dispatch_suggestion/etc.). FR-1 is dead by
// construction without a kind->lane MAPPING layer bucketing the real kinds into these 4
// conceptual lanes.
//
// HIGH-2: FR-4's rate spans two extents -- live session_coordination is only 10.1% of
// all-time volume (delivered/answered rows get archived to retention_archive), so a naive
// live-only percentage isn't a real rate. Needs an explicit denominator-extent decision,
// named in the gauge output.
//
// MEDIUM: FR-2's example marker key literal (payload.dead_letter_reason='ttl_expired_unread')
// collides with an EXISTING, unrelated payload.dead_letter key already live on 63% of rows
// (from the periodic-liveness target_dead path). The corrected key is payload.dead_letter_ttl
// (already adopted by US-002, but the PRD's own FR-2 text still showed the collision-prone
// example).

async function main() {
  const { data: prd, error: readErr } = await supabase.from('product_requirements_v2').select('functional_requirements, metadata').eq('id', PRD_ID).single();
  if (readErr) { console.error('READ ERR', readErr.message); process.exit(1); }

  const fr = prd.functional_requirements.map((f) => {
    if (f.id === 'FR-1') {
      return {
        ...f,
        requirement: 'Kind-to-lane mapping PLUS lane-appropriate TTL registry, homed in lib/coordination/lane-contract.cjs',
        description: f.description + ' CORRECTED (STORIES evidence 414186aa): a fully-paged live census found ZERO session_coordination rows whose payload.kind literally equals "directive"/"advisory"/"reply"/"suggestion" -- the real live kinds are coordinator_reminder, roll_call, periodic_liveness_flag, adam_advisory, coordinator_directive, dispatch_suggestion, and others. FR-1 therefore ALSO requires an explicit kind->lane MAPPING function (bucketing the real payload.kind values into the 4 conceptual lanes this SD targets), mirroring the bucketing pattern already established in lib/fleet/worker-status.cjs classifyCoordinationRow (DRAIN_SET/DIRECTIVE_KINDS/INFORMATIONAL_KINDS). Without this mapping, FR-1 is dead by construction -- no row would ever match a lane.',
        acceptance_criteria: [
          ...f.acceptance_criteria,
          'A kind->lane mapping function buckets the real live payload.kind values (coordinator_reminder, roll_call, periodic_liveness_flag, adam_advisory, coordinator_directive, dispatch_suggestion, etc.) into the 4 conceptual lanes; unit test asserts at least one real kind maps to each lane, and the mapping is exhaustive (every kind maps somewhere, no silent drop)'
        ]
      };
    }
    if (f.id === 'FR-2') {
      return {
        ...f,
        description: f.description.replace(
          "payload.dead_letter_reason='ttl_expired_unread'",
          "payload.dead_letter_ttl (NOT payload.dead_letter_reason='ttl_expired_unread' -- that literal collides with an EXISTING, unrelated payload.dead_letter key already live on 63% of rows via the periodic-liveness target_dead path, per STORIES evidence 414186aa)"
        )
      };
    }
    if (f.id === 'FR-4') {
      return {
        ...f,
        description: f.description + ' CORRECTED (STORIES evidence 414186aa): live session_coordination is only ~10.1% of all-time row volume (delivered/answered rows are archived to retention_archive by the retention job), so a naive live-only percentage measures the retention extent, not a real rate -- the exact two-extent problem this SD\'s earlier correction (VALIDATION) already found once for a different table. FR-4 must make an EXPLICIT denominator-extent decision -- either query live UNION retention_archive, restrict both baseline and re-measurement to an identical created_at window, or report an absolute backlog count with any percentage explicitly labeled "live-extent-only" -- and NAME which choice was made in the gauge\'s own output so FR-5\'s comparison is apples-to-apples.',
        acceptance_criteria: [
          ...f.acceptance_criteria,
          'The gauge\'s output explicitly names its denominator extent (e.g. "live-extent-only", "live+archived", or a stated date window) -- not left implicit'
        ]
      };
    }
    return f;
  });

  const metadata = {
    ...(prd.metadata || {}),
    stories_correction_note: 'STORIES correction-pass (evidence 414186aa) found 2 HIGH defects requiring FR-level correction: FR-1 needed an explicit kind->lane mapping (the literal lane names directive/advisory/reply/suggestion do not exist as live payload.kind values -- real kinds are coordinator_reminder/roll_call/periodic_liveness_flag/adam_advisory/coordinator_directive/dispatch_suggestion/etc., confirmed by a fully-paged 6662-row census); FR-4 needed an explicit denominator-extent decision (live session_coordination is only ~10.1% of all-time volume due to retention archiving, mirroring the earlier VALIDATION finding on a different axis). Also fixed a MEDIUM: FR-2\'s example marker-key literal collided with an existing, unrelated payload.dead_letter key live on 63% of rows -- corrected to payload.dead_letter_ttl.',
  };

  const { error: updateErr } = await supabase.from('product_requirements_v2').update({ functional_requirements: fr, metadata }).eq('id', PRD_ID);
  if (updateErr) { console.error('UPDATE ERR', updateErr.message); process.exit(1); }
  console.log('PRD FR-1/FR-2/FR-4 corrected per STORIES correction-pass findings.');
}

if (isMainModule(import.meta.url)) main();
