import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prd, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('id, implementation_approach')
  .eq('directive_id', 'SD-LEO-FIX-DRIVE-SCORE-GRADIENT-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const parsed = typeof prd.implementation_approach === 'string'
  ? JSON.parse(prd.implementation_approach)
  : prd.implementation_approach;

const FIXTURE_PATH = 'tests/fixtures/drive-score/drive-reports-historical-sample.json';

const phases = [
  {
    phase: 'P1',
    title: 'leg2_uptake reports a continuous fraction instead of a 0.8 binary cliff',
    description: "lib/drive-loop/score/leg2-uptake.js's scoreLeg2() computes `earned = denominator > 0 && fraction >= threshold ? LEG_POINTS : 0` (verified directly, line 104) -- a binary cliff. `fraction` is ALREADY computed and cited separately (line 103, emitted at lines 117-128) -- reuse it directly rather than recomputing. Change `earned` to `denominator > 0 ? fraction * LEG_POINTS : 0`. UPTAKE_THRESHOLD (line 48, self-labeled NOT RATIFIED at line 42) is retained as an export for backward compatibility / future reference but no longer gates the score.",
    files_affected: ['lib/drive-loop/score/leg2-uptake.js'],
    acceptance: [
      "Given fraction=1.0, leg2 reports 2.0 (unchanged ceiling case)",
      "Given fraction=0.5, leg2 reports 1.0 (new, previously-unreachable value)",
      "Given fraction=0, leg2 reports 0.0 (unchanged floor case)",
      "Re-running against tests/fixtures/drive-score/drive-reports-historical-sample.json produces at least 3 distinct leg2 fraction-derived values across the 20-row fixture"
    ]
  },
  {
    phase: 'P2',
    title: "leg2's ceiling score cannot be earned off a single claim (sample-floor dampener)",
    description: "Measured directly against the historical fixture (tests/fixtures/drive-score/drive-reports-historical-sample.json, captured during PLAN): leg2_grains=1 on 11 of 20 rows, all scoring the ceiling value. A rescale alone (P1) does not close this -- a 1-of-1 day still reports fraction=1.0. REUSE-PATTERN SEARCH RESULT (PLAN, this session): no existing shared MIN_SAMPLE-style constant was found scoped to leg2's specific claim-grain concept; the closest existing PATTERN in this codebase is lib/quality/tuning-rules.js's `MIN_SAMPLE = 10` (a different domain -- AI-quality-assessment sample floor, not claim-grain count), which is NOT directly reusable here due to semantic mismatch but IS the disclosure-style precedent to follow: a new, leg2-scoped, exported/injectable constant (e.g. `GRAIN_FLOOR`), self-labeled NOT RATIFIED exactly like UPTAKE_THRESHOLD and HEALTHY_VERDICTS already are. Add a confidence multiplier `min(grains.length, GRAIN_FLOOR) / GRAIN_FLOOR` applied to the P1 fraction-scaled score.",
    files_affected: ['lib/drive-loop/score/leg2-uptake.js'],
    acceptance: [
      "A fixture with grains=1, fraction=1.0 reports strictly less than a fixture with grains>=GRAIN_FLOOR, fraction=1.0",
      "A fixture with grains=0 reports 0, never NaN or a divide-by-zero",
      "GRAIN_FLOOR and the dampening formula are documented in leg2-uptake.js's own source comment with the same NOT-RATIFIED-by-this-SD disclosure style as UPTAKE_THRESHOLD",
      "Re-running against tests/fixtures/drive-score/drive-reports-historical-sample.json: at least one of the 11 identified grains=1 rows now reports a visibly lower value than the un-dampened P1-only calculation would have produced"
    ]
  },
  {
    phase: 'P3',
    title: "leg4 ladder-distance is computed and reported as its OWN dedicated telemetry field; the SCORING rule (HEALTHY_VERDICTS) is completely unchanged in this SD",
    description: "lib/drive-loop/score/leg4-capacity.js's scoreLeg4() computes `earned = healthy.includes(verdict) ? LEG_POINTS : 0` (verified, line 82) against `VERDICTS = ['DEFICIT-URGENT','DEFICIT','TIGHT','SURPLUS']` (line 38) and `HEALTHY_VERDICTS = ['TIGHT']` (line 46, self-labeled NOT RATIFIED at line 41). The ladder is confirmed genuinely bidirectional (header comment lines 25-29: SURPLUS is 'the flooded pole', not a good state). Historical fixture confirms the ladder IS reachable: leg4 scored TIGHT (2) on 3 of 20 rows (2026-08-19, 08-21, 08-24), not zero -- this is a threshold-currently-not-met problem, not an unreachability problem, at this daily-aggregate granularity (the CLAUDE_ADAM.md '0 of 206 verdicts ever TIGHT' figure likely describes a different, higher-frequency population from scripts/coordinator-capacity-forecast.mjs's underlying tick cadence -- NOT resolved by this SD, flagged forward). CORRECTION (adversarial-critique finding, fixed): the earlier draft of this phase said to gate the new field behind drive-score-legs.js's ratified_by-marker convention (assertLegSetRatified(), verified at line 76) -- that mechanism governs which LEGS belong in the drive_score denominator/population, NOT a per-feature toggle within an already-ratified leg, and reusing it here was wrong. Instead: add a new, dedicated, self-labeled-NOT-RATIFIED export in leg4-capacity.js (e.g. `LADDER_DISTANCE = Object.freeze({'DEFICIT-URGENT':-2,'DEFICIT':-1,'TIGHT':0,'SURPLUS':-1})`, illustrative numbers only -- the exact mapping is confirmed as a PLAN/chairman decision, not prescribed here) computed and returned ALONGSIDE the existing, completely unchanged `points`/`earned` value -- never replacing it. The new field is ALWAYS computed and reported (telemetry is harmless to always emit); what stays gated is the ACTUAL SCORING RULE, which this SD does not touch.",
    files_affected: ['lib/drive-loop/score/leg4-capacity.js'],
    acceptance: [
      "scoreLeg4()'s return object gains a new field (e.g. `ladder_distance`) computed on every call, alongside the existing `points` -- both present simultaneously",
      "The existing `earned`/`points` computation (healthy.includes(verdict) ? LEG_POINTS : 0) is byte-identical to today's behavior -- a regression test asserts this explicitly for all 4 ladder states (DEFICIT-URGENT, DEFICIT, TIGHT, SURPLUS)",
      "The new field's source comment cites ratification ffebbd68 for the AUTHORITY to propose a gradient, and explicitly states ffebbd68 does NOT ratify the specific ladder-distance mapping used (carried forward from FR-3's acceptance criteria, previously missing from this phase per adversarial-critique finding)",
      "A structured decision packet (the four ladder states, the illustrative mapping, and the 20-row historical back-computation from tests/fixtures/drive-score/drive-reports-historical-sample.json) is drafted as a deliverable of this phase and routed to the chairman via /signal or the coordinator's chairman-decision channel before this SD reaches LEAD-FINAL-APPROVAL -- not decided in code, and not silently skipped (carried forward from FR-3's acceptance criteria, previously missing from this phase per adversarial-critique finding)"
    ]
  },
  {
    phase: 'P4',
    title: 'The shared drive-line composer discloses a frozen/flat score instead of reporting it silently',
    description: "CORRECTION (adversarial-critique finding, fixed): the earlier draft of this phase named only scripts/drive-report-sms.mjs, but PLAN-phase investigation found BOTH chairman-facing surfaces (the SMS via scripts/drive-report-sms.mjs, and the morning brief via scripts/cron/chairman-morning-review-sweep.mjs) already share ONE composition function: `composeDriveLine()` in lib/fleet/exec-email-drive-line.mjs (its own header, verified: 'THE ONE QUERY both chairman surfaces share ... so the morning brief and the exec-summary can never render two different drive numbers'). That function currently queries only the single latest drive_reports row (`.limit(1)`). Extend it to ALSO query the trailing 10 rows (a second small query, or widen the existing one and derive both from it) and append, after the existing formatDriveBreakdown() line, a clause: 'distinct/10 = N (target >= 3)' (count of distinct drive_score.score.value across the trailing 10 rows) and the literal word 'flat' whenever the newest 6 are identical. This single change point updates BOTH consuming surfaces (SMS and morning brief) without duplicating logic, per composeDriveLine's own stated design principle.",
    files_affected: ['lib/fleet/exec-email-drive-line.mjs'],
    acceptance: [
      "Given the newest 6 drive_reports.drive_score.score.value entries are identical, composeDriveLine()'s returned line includes the word 'flat'",
      "Given at least one distinct value among the newest 6, 'flat' is NOT present",
      "The 'distinct/10 = N (target >= 3)' clause is present on every composeDriveLine() call regardless of flatness, computed over the trailing 10 readings",
      "Both scripts/drive-report-sms.mjs and scripts/cron/chairman-morning-review-sweep.mjs are verified (via their existing call sites into composeDriveLine()) to receive the new clause without needing their own separate code changes",
      "Verified against tests/fixtures/drive-score/drive-reports-historical-sample.json: the 7 identical trailing readings (2026-08-30 through 2026-09-05, all 3.5) would produce 'flat' and a distinct/10 count of <=4 under the pre-fix legs -- confirms the clause fires on real historical data"
    ]
  }
];

const overview = parsed.overview; // unchanged -- the SD's own long-form provenance text
const newImplementationApproach = JSON.stringify({ overview, phases });

const { error: writeErr } = await supabase
  .from('product_requirements_v2')
  .update({ implementation_approach: newImplementationApproach })
  .eq('id', prd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('implementation_approach corrected: P3 contradiction resolved, missing P3 acceptance criteria added, P4 corrected to the real shared composeDriveLine() file, P2 reuse-search documented, all phases reference the captured historical fixture.');
