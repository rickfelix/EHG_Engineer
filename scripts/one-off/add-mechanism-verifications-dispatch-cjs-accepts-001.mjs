// GATE_MECHANISM_CLAIM_VERIFIER fix for SD-LEO-FIX-DISPATCH-CJS-ACCEPTS-001: the SD's
// description names dispatch.cjs's SENTINEL_TARGETS as the mechanism to fix. This was verified
// by direct file reads/DB queries during LEAD phase (not an endorsement chain) plus an
// independent VALIDATION sub-agent pass and an independent Explore sub-agent pass, each of which
// read the live file/line and reported an exact citation. This records those citations in the
// format the gate reads.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-DISPATCH-CJS-ACCEPTS-001';

async function main() {
  const { data: sd, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr || !sd) {
    console.error('SD_FETCH_FAILED', fetchErr);
    process.exit(1);
  }

  const metadata = {
    ...sd.metadata,
    mechanism_verifications: [
      {
        verified_by: 'LEAD phase direct file read + independent Explore sub-agent re-verification (sub_agent_execution_results id cd9bd4a4-920b-4889-b8ff-19730c62dd5b)',
        verified_at: 'lib/coordinator/dispatch.cjs:197',
        note: "SENTINEL_TARGETS confirmed to no longer include bare 'broadcast' -- reads ['broadcast-coordinator', 'broadcast-solomon', 'broadcast-adam', 'broadcast-michael'], with a header comment (lines 189-196) documenting the removal and citing the measured 91-rows/0-acknowledged finding.",
      },
      {
        verified_by: 'LEAD phase direct file read + independent Explore sub-agent re-verification (sub_agent_execution_results id cd9bd4a4-920b-4889-b8ff-19730c62dd5b)',
        verified_at: 'lib/coordinator/dispatch.cjs:220-232',
        note: 'assertValidTarget() confirmed as the sole choke point: checks isSentinelTarget() then isFullUuid(), throwing a tagged DISPATCH_TARGET_INVALID Error otherwise. Invoked from insertCoordinationRow at dispatch.cjs:1563, the entry point every non-bypassing writer uses.',
      },
      {
        verified_by: 'Independent VALIDATION sub-agent pass (sub_agent_execution_results id 5bd31e80-3e28-488c-8a1c-eb3183c7bffc, CONDITIONAL_PASS/100%) + independent Explore re-verification',
        verified_at: 'lib/npm-install-lock.cjs:80',
        note: "The dominant raw-insert writer (bypasses insertCoordinationRow entirely; was the source of all 91 live bare-'broadcast' rows) confirmed changed from target_session: 'broadcast' to target_session: null. findActiveLock()'s own matching logic (lines 36-48) uses only payload.lock_type/payload.status, never target_session -- the field was vestigial addressing metadata with no functional reader in this mechanism.",
      },
      {
        verified_by: 'LEAD phase direct file read + independent Explore sub-agent re-verification (sub_agent_execution_results id cd9bd4a4-920b-4889-b8ff-19730c62dd5b)',
        verified_at: 'scripts/inbox-readonly.cjs:37-44',
        note: "Header comment corrected: no longer groups bare 'broadcast' with the genuinely-drained broadcast-coordinator/-adam sentinels as \"live and heavily used\" -- now documents the measured 0-of-91-ever-acknowledged finding and that new writes are refused going forward.",
      },
      {
        verified_by: 'Independent Explore sub-agent test execution (sub_agent_execution_results id cd9bd4a4-920b-4889-b8ff-19730c62dd5b): npx vitest run --project unit lib/coordinator/dispatch.test.js',
        verified_at: 'lib/coordinator/dispatch.test.js:67-71,108-115',
        note: "Confirmed 14/14 passing, including the assertion that SENTINEL_TARGETS excludes bare 'broadcast' and that insertCoordinationRow rejects it with code DISPATCH_TARGET_INVALID -- independently re-run, not merely re-stated from the implementer's own claim.",
      },
    ],
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('sd_key', SD_KEY);
  if (updateErr) {
    console.error('SD_UPDATE_FAILED', updateErr);
    process.exit(1);
  }
  console.log('OK: mechanism_verifications recorded for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
