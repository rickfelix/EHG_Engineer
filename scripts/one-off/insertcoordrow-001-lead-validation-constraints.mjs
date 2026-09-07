#!/usr/bin/env node
/**
 * SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001: LEAD-TO-PLAN VALIDATION evidence
 * (ede9ddad-ecc2-4239-adef-908000ed0e0b) independently confirmed the SD's self-corrected
 * numbers AND surfaced two additional binding design constraints PLAN must carry into the
 * PRD's FR set. Recording as a second dated addendum (Explore's scope-gap finding was
 * already recorded separately).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001';

const CORRECTION_ADDENDUM = `

=== LEAD-TO-PLAN VALIDATION DESIGN CONSTRAINTS 2026-09-07 (evidence ede9ddad, confidence 92) ===

VERDICT: CONDITIONAL_PASS. LEAD-TO-PLAN may proceed; two constraints below are BINDING on the
PRD's FR set, verified independently against the code (dispatch.cjs:1730 confirmed returning
the raw {data,error} insert result verbatim).

CONSTRAINT 1 -- ADDITIVE RETURN CONTRACT ONLY. insertCoordinationRow returns the raw PostgREST
{data,error} object today (dispatch.cjs:1730); 16 durable call lines depend on that exact
shape. Any "return a result object instead of throwing" fix for the landed=true cases MUST
add fields to that same object (e.g. a .landed / .parkedRowId field alongside {data,error}),
never replace or restructure it -- a replacement silently breaks all 16 existing callers.

CONSTRAINT 2 -- SCOPE THE MIGRATION TO landed=true ONLY, NEVER BLANKET. insertCoordinationRow
throws on ~8 OTHER conditions beyond the two landed=true cases (6 non-landed error codes plus
6 fail-closed assert* guards where nothing landed and throwing IS the correct, intentional
behavior). A blanket throw-to-return migration across ALL throw paths would turn every one of
those genuine failures into a silently-accepted return value for the 22 non-branching durable
callers that currently rely on try/catch to detect real failure -- inverting this SD's own
defect (duplicated content) into a WORSE one (silently lost/dropped content). The fix must be
scoped exclusively to the two landed=true throw sites (DISPATCH_BACKPRESSURE,
DISPATCH_ALREADY_DELIVERED per the separate Explore-evidence addendum above); every other
throw path in the function is explicitly OUT of scope and must keep throwing.

CONSTRAINT 3 -- CLI EXIT-CODE MAPPING IS IN SCOPE, NOT JUST THE JS RETURN SHAPE. The ORIGINAL
incident that sourced this SD was a shell-level resend firing on EXIT STATUS, not on the
thrown message text or even a caught JS property read. 11 of the 25 durable caller files are
CLI entrypoints with process.exit(1) paths; only the 3 already-correct files map a delivered
park to exit 0. A dispatch.cjs-only change does NOT close the loop that produced the
production duplicates -- the CLI exit-code mapping at those 11 sites must be a first-class FR,
not treated as a trivial mechanical follow-on to the JS-level fix. The remaining 8 durable
non-CLI lib/ callers need propagation of the new field instead (no exit code involved).

SIZING: TIER 3 CONFIRMED (re-derived on the corrected scope, not the retracted 288-file
number) -- the realistic change spans ~25 files across three concerns (shared predicate +
dispatch.cjs, 11 CLI exit-code mappings, 8 lib/ propagation sites), exceeds the >75 LOC
threshold, and alters a fleet-wide coordination-delivery API surface with a genuine inverse-
hazard risk requiring PLAN-level design and test coverage, not QF-speed review.

RECOMMENDED FR DECOMPOSITION (each independently shippable, target <=100 LOC per PR):
  FR-1: additive result fields on insertCoordinationRow's return + an exported
        isDeliveredDispatchError(e) predicate covering BOTH landed=true codes together
        (highest-value, ships the core fix; also the caller-migration guide for the 3
        already-correct files, whose e.landed branch moves to result.landed).
  FR-2: the 11 CLI-entrypoint exit-code mappings (map a delivered/parked outcome to exit 0;
        also collapses the 3 existing hand-rolled if(e.landed) exit(0) copies onto the shared
        predicate from FR-1).
  FR-3: the 8 non-CLI lib/ propagation sites (no exit code involved; result-field consumption
        only). Includes the 3 currently mis-surfacing a park as an outright failure today
        (coordinator-capacity-forecast.mjs, coordination-events.cjs's emitInertWorkerAlert,
        sweep-findings-sink.cjs) plus kill-switch-writer.cjs, which currently doesn't even
        catch and propagates uncaught.

ADMINISTRATIVE (not a PLAN blocker, but a pre-active-status requirement): sd_backlog_map has
0 items for this SD; require_backlog_for_active needs >=1 before status can move to 'active'.

EXISTING TEST INFRASTRUCTURE (do not duplicate): tests/unit/coordinator/
dispatch-send-backpressure.test.js and dispatch-correlation-dedupe.test.js already cover both
throw paths structurally; dispatch.cjs already exports the guards for unit fixtures.
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
    lead_validation_design_constraints: {
      recorded_at: new Date().toISOString(),
      evidence_id: 'ede9ddad-ecc2-4239-adef-908000ed0e0b',
      verdict: 'CONDITIONAL_PASS',
      confidence: 92,
      constraints: [
        'additive_return_contract_only: 16 durable callers depend on the raw {data,error} shape, dispatch.cjs:1730',
        'scope_strictly_to_landed_true: ~8 other throw paths (6 error codes + 6 fail-closed guards) must keep throwing -- blanket migration would silently drop genuine failures for 22 non-branching callers',
        'cli_exit_code_mapping_in_scope: 11 of 25 durable callers are CLI entrypoints whose process.exit(1) path is the actual mechanism that produced the original production duplicates',
      ],
      recommended_fr_decomposition: [
        'FR-1: additive result fields + shared isDeliveredDispatchError(e) predicate covering both landed=true codes',
        'FR-2: 11 CLI-entrypoint exit-code mappings',
        'FR-3: 8 non-CLI lib/ propagation sites',
      ],
      sd_backlog_map_required_before_active: true,
      existing_test_coverage: ['tests/unit/coordinator/dispatch-send-backpressure.test.js', 'tests/unit/coordinator/dispatch-correlation-dedupe.test.js'],
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
