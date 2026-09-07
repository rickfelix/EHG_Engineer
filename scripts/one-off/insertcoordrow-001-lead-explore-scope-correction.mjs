#!/usr/bin/env node
/**
 * SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001: LEAD-phase Explore evidence
 * (a4dbb32b-e5b6-4161-b7da-5e3be37d0482) found a real scope gap in the SD's own filing
 * before PLAN authors the PRD. Recording it as a correction addendum, matching the
 * SD's own established convention (it already contains one prior self-correction from
 * the coordinator on the call-site count).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001';

const CORRECTION_ADDENDUM = `

=== LEAD-PHASE EXPLORE SCOPE CORRECTION 2026-09-07 (evidence a4dbb32b) ===

THE SD AS FILED NAMES ONLY ONE THROW SITE. THERE ARE TWO.

Explore's full exit-path inventory of insertCoordinationRow (lib/coordinator/dispatch.cjs
lines 1373-1730) found that the exact "delivered, don't resend" anti-pattern this SD exists
to fix -- throw carrying a landed=true / parkedRowId flag instead of returning a result --
exists at a SECOND call site: DISPATCH_ALREADY_DELIVERED (line 1565, the QF-20260902-160
correlation-id dedup guard), which runs BEFORE the DISPATCH_BACKPRESSURE check this SD names
and throws the identical shape for the identical reason. Fixing only DISPATCH_BACKPRESSURE
would leave this SD's own defect class open at a second, adjacent call site on day one.

SCOPE WIDENED (not re-decided at LEAD; this is a completeness fix, not a re-scope debate):
both DISPATCH_BACKPRESSURE and DISPATCH_ALREADY_DELIVERED must move to the same returned-
result shape together. They are the SAME defect pattern in the SAME function; splitting them
into two separate work items would reproduce the mistake QF-20260902-160's own dedup guard
already made once (fixing one call site, leaving a sibling one unaddressed).

CALLER COUNT, re-measured independently: Explore found 27 durable callers (not 26 -- one
more than the coordinator's own prior correction), same 3 correctly branching
(scripts/adam-advisory.cjs:1386-1408, scripts/solomon-advisory.cjs:1419-1442,
scripts/worker-signal.cjs:34-45's shared reportDispatchError, 4 call sites there). The
discriminating pattern at all 3 is identical: catch(e) { if (e.landed) exit(0) as DELIVERED;
else exit(1) as failure } -- a migration guide should preserve this by moving the branch from
e.landed (caught exception) to result.landed (returned object field) at these 3 sites
specifically, not rewrite their logic.

OF THE ~24 NON-BRANCHING CALLERS, 3 actively mis-surface a successful park as a failure today
(not just "don't handle it either way"): coordinator-capacity-forecast.mjs (already has a
comment flagging this exact class of problem), coordination-events.cjs's
emitInertWorkerAlert, and sweep-findings-sink.cjs (both collapse to {ok:false,error} on any
throw). kill-switch-writer.cjs doesn't even catch -- propagates uncaught. These 3(+1) are the
highest-value migration targets after the 3 already-correct files, since they are currently
producing a WRONG signal, not just a missing one.

NOT A TEMPLATE FOR A BROADER PATTERN: Explore searched the rest of the codebase for the same
throw-to-signal-a-caveated-success anti-pattern and found none -- the only other PARKED code
(VENTURE_PARKED in lib/eva/stage-execution-worker.js) is already a returned
result.errors[].code, the CORRECT pattern, usable as positive precedent for the discriminated-
result shape rather than a second instance of the defect. This SD's fix is isolated to
insertCoordinationRow's two throw sites, not a repo-wide sweep.
`;

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sd, error: readError } = await supabase
    .from('strategic_directives_v2')
    .select('id, description, metadata')
    .eq('sd_key', SD_KEY)
    .maybeSingle();
  if (readError) throw readError;
  if (!sd) throw new Error(`SD ${SD_KEY} not found`);

  const newDescription = `${sd.description}${CORRECTION_ADDENDUM}`;
  const newMetadata = {
    ...sd.metadata,
    lead_explore_scope_correction: {
      recorded_at: new Date().toISOString(),
      evidence_id: 'a4dbb32b-e5b6-4161-b7da-5e3be37d0482',
      finding: 'landed=true/parkedRowId anti-pattern exists at TWO throw sites (DISPATCH_BACKPRESSURE line 1321 AND DISPATCH_ALREADY_DELIVERED line 1565), not one',
      scope_widened_to: ['DISPATCH_BACKPRESSURE', 'DISPATCH_ALREADY_DELIVERED'],
      corrected_durable_caller_count: 27,
      prior_count: 26,
      correctly_branching_files: ['scripts/adam-advisory.cjs', 'scripts/solomon-advisory.cjs', 'scripts/worker-signal.cjs'],
      mis_surfacing_as_failure: ['coordinator-capacity-forecast.mjs', 'coordination-events.cjs (emitInertWorkerAlert)', 'sweep-findings-sink.cjs', 'kill-switch-writer.cjs (uncaught)'],
    },
  };

  const { data, error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({ description: newDescription, metadata: newMetadata })
    .eq('id', sd.id)
    .select('sd_key');
  if (updateError) throw updateError;

  console.log('Updated:', JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
