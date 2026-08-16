import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-BELT-CAPACITY-VERDICTS-001';

const { data: sd, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, key_changes, risks')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

const keyChanges = [
  {
    change: 'Migration lives under database/chairman-gated/ (not database/migrations/) as a companion ALTER to the existing 20260807_belt_capacity_verdicts.sql, matching that file\'s own established gated convention for this specific table (confirmed via its own test file, tests/unit/capacity-verdict-migration.test.js, which asserts "lives under database/chairman-gated/, which is what makes it gated at all"). Adds read_failed boolean NOT NULL DEFAULT false; widens the verdict CHECK to also admit a named UNAVAILABLE_VERDICT constant (exported from capacity-verdict-store.mjs, never a bare string literal); ALTER COLUMN ... DROP NOT NULL on belt_depth, demand_soon, deficit. Ships with a paired _DOWN explicitly warning that rollback would violate the narrowed constraints against any existing UNAVAILABLE/null-measurement rows and must delete or migrate them first (same "DESTROYED / cannot be recomputed / take a backup" convention as the original file\'s own _DOWN).',
    impact: 'Keeps this table\'s governance consistent with its own established precedent rather than introducing a lighter-weight regular migration for a table the codebase already treats as gated.',
  },
  {
    change: 'Add a second, narrow write path (makeCapacityVerdictUnavailablePersist, exported alongside UNAVAILABLE_VERDICT) in scripts/lib/capacity-verdict-store.mjs -- CONFIRMED by independent LEAD-phase validation as the correct design over the alternative (widening the existing VERDICTS enum in leg4-capacity.js, the pattern the closely-related drive-state-verdict-store.cjs uses for its own analogous UNMEASURABLE case): VERDICTS is dual-purpose (persistence vocabulary AND leg4\'s own scoring-input guard at leg4-capacity.js:66) -- admitting UNAVAILABLE into it would make scoreLeg4 ACCEPT and SCORE it as 0 (HEALTHY_VERDICTS=[\'TIGHT\']), silently recreating the exact "indistinguishable from a genuine DEFICIT" defect that guard exists to prevent. A separate, narrow function that is never wired into scoreLeg4 at all avoids this entirely. Explore confirmed zero other consumers read/branch on belt_capacity_verdicts.verdict.',
    impact: 'A read-failure run leaves a durable, queryable row without any risk of that row ever being scored as a real (and wrongly zero) capacity verdict.',
  },
  {
    change: 'Wire the new persist function through scoreCapacityLeg\'s existing catch block (scripts/cron/drive-report-sweep.mjs:223-229): on any leg4 failure, best-effort call the sentinel persist (own try/catch so a failed sentinel write can never block returning the unavailable() leg, which remains the report\'s house posture) before returning.',
    impact: 'Closes the visibility gap Solomon flagged (coordinator directive 2853569a) without changing leg4\'s scoring contract or the report\'s existing "degrade to unavailable, never to zero" posture.',
  },
  {
    change: 'Extend tests/unit/capacity-verdict-migration.test.js (do NOT just add a parallel file) with a new describe block reading the NEW alter migration specifically, asserting its widened CHECK equals [...VERDICTS, UNAVAILABLE_VERDICT] and that belt_depth/demand_soon/deficit lose their NOT NULL -- the ORIGINAL file\'s own existing assertions (still true of that unmodified historical file) are left untouched. LEAD-phase validation caught that without this, the existing "CHECK must be the frozen set, no more no less" test would keep passing against the original file while the live table silently diverges to 5 admitted values -- a guard that stops observing its own subject.',
    impact: 'Prevents the exact "guard that runs but cannot observe its subject" class of bug this session has independently encountered before -- the migration test stays a live drift-guard instead of becoming a historical-artifact check.',
  },
  {
    change: 'Regression tests in tests/unit/cron/drive-report-sweep.test.js and a new describe block in tests/unit/capacity-verdict-store.test.js: a forced gatherCapacity() throw now produces exactly one belt_capacity_verdicts row with read_failed=true, verdict=UNAVAILABLE_VERDICT, null measurements, AND the leg4 result is still unavailable (never scored); a sentinel-persist failure does not prevent the unavailable() leg from being returned; the two existing [QF-20260816-435]-tagged tests asserting the EXISTING persistVerdict is never called on a gather failure continue to pass unmodified (the sentinel goes through the NEW, separate function only); the normal DEFICIT/TIGHT/SURPLUS path and persistCapacityVerdict()\'s own guards are unchanged.',
    impact: 'Proves the fix without regressing the deliberate "throws propagate, never silently scored 0" contract this file\'s own header documents extensively, and without weakening any pre-existing pin.',
  },
];

const risks = [
  {
    risk: sd.risks?.[0]?.risk || 'schema change to a live table',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'Additive-only DDL under database/chairman-gated/ (matching this table\'s own established gating convention, confirmed via its existing migration test file) -- ADD COLUMN, ALTER CONSTRAINT to widen, DROP NOT NULL on 3 columns. No existing row is rewritten, no existing reader\'s query shape changes. $verify$ block confirms the four original verdict values and existing rows are unaffected before COMMIT.',
  },
  {
    risk: 'The pre-existing tests/unit/capacity-verdict-migration.test.js asserts the CHECK constraint is EXACTLY the frozen four values against the ORIGINAL migration file only -- shipping a separate ALTER file without extending this test would leave it passing while silently no longer describing the live schema (caught by LEAD-phase validation-agent before PRD authoring).',
    impact: 'medium',
    likelihood: 'high (would have happened without this LEAD-phase catch)',
    mitigation: 'Extend the SAME test file with a new describe block for the alter migration specifically, asserting against a named UNAVAILABLE_VERDICT constant rather than a magic string, per key_changes above.',
  },
  {
    risk: 'A caller reading belt_capacity_verdicts.verdict without expecting the new UNAVAILABLE value could mis-render an UNAVAILABLE row.',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'Explore + validation-agent both independently confirmed zero other consumers exist (17 total repo references to the table, all writers/tests/retention-config/schema-artifacts -- none read-and-branch on verdict).',
  },
];

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ key_changes: keyChanges, risks })
  .eq('id', sd.id);
if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

console.log(`Round 2 correction applied to ${SD_KEY}.`);
