import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-BELT-CAPACITY-VERDICTS-001';

const { data: sd, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

const now = new Date().toISOString();
const mechanismVerifications = [
  {
    claim: "scoreCapacityLeg's catch block returns unavailable() without persisting any row on failure",
    verified_by: 'LEAD (direct read)',
    verified_at: 'scripts/cron/drive-report-sweep.mjs:223-229',
    evidence_row: null,
  },
  {
    claim: 'belt_capacity_verdicts.verdict is NOT NULL text with CHECK admitting only DEFICIT-URGENT/DEFICIT/TIGHT/SURPLUS; belt_depth/demand_soon/deficit are NOT NULL integer; no read_failed column exists',
    verified_by: 'LEAD (live DB query via pg_constraint/information_schema.columns against the consolidated project)',
    verified_at: 'database/chairman-gated/20260807_belt_capacity_verdicts.sql',
    evidence_row: null,
  },
  {
    claim: 'persistCapacityVerdict() (capacity-verdict-store.mjs) throws on any verdict outside VERDICTS or any non-finite belt_depth/demand_soon/deficit, by deliberate, emphatically-documented design',
    verified_by: 'LEAD (direct read)',
    verified_at: 'scripts/lib/capacity-verdict-store.mjs:93-119',
    evidence_row: null,
  },
  {
    claim: 'VERDICTS (leg4-capacity.js) is dual-purpose: persistence vocabulary AND scoreLeg4\'s own scoring-input guard (line 66) — widening it to admit UNAVAILABLE would make scoreLeg4 accept and score it as 0 via HEALTHY_VERDICTS',
    verified_by: 'validation-agent',
    verified_at: 'lib/drive-loop/score/leg4-capacity.js:38,46,66',
    evidence_row: 'a3e53f13-f1ca-4a01-88ed-024acd6fc24c',
  },
  {
    claim: 'drive-state-verdict-store.cjs (explicitly modeled on capacity-verdict-store.mjs) handles its own analogous UNMEASURABLE case via a single closed-enum-widening pattern, the alternative design considered and rejected here',
    verified_by: 'Explore',
    verified_at: 'scripts/lib/drive-state-verdict-store.cjs',
    evidence_row: 'b0e4acde-3f24-45ab-8f16-b9a5d2d145a9',
  },
  {
    claim: 'Zero other code reads-and-branches on belt_capacity_verdicts.verdict beyond leg4-capacity.js\'s own VERDICTS guard (17 total repo references, all writers/tests/retention-config/schema-artifacts)',
    verified_by: 'Explore + validation-agent (independently cross-checked)',
    verified_at: 'repo-wide grep for belt_capacity_verdicts',
    evidence_row: 'b0e4acde-3f24-45ab-8f16-b9a5d2d145a9',
  },
  {
    claim: "tests/unit/capacity-verdict-migration.test.js asserts the CHECK constraint list equals EXACTLY VERDICTS against the ORIGINAL migration file only — a new companion ALTER file would leave this test passing while the live table silently diverges",
    verified_by: 'validation-agent (LEAD-phase blocker finding), confirmed by LEAD direct read',
    verified_at: 'tests/unit/capacity-verdict-migration.test.js:70-81',
    evidence_row: 'a3e53f13-f1ca-4a01-88ed-024acd6fc24c',
  },
  {
    claim: "tests/unit/cron/drive-report-sweep.test.js already has 2 tests tagged [QF-20260816-435] pinning that a failed gather must never call the existing persistVerdict",
    verified_by: 'Explore',
    verified_at: 'tests/unit/cron/drive-report-sweep.test.js:873-893',
    evidence_row: 'b0e4acde-3f24-45ab-8f16-b9a5d2d145a9',
  },
  {
    claim: 'tests/unit/capacity-verdict-store.test.js is the sole existing test file for capacity-verdict-store.mjs',
    verified_by: 'Explore',
    verified_at: 'tests/unit/capacity-verdict-store.test.js',
    evidence_row: 'b0e4acde-3f24-45ab-8f16-b9a5d2d145a9',
  },
  {
    claim: "classify-quick-fix.js's schema-change detection is a keyword-based text scan (forbiddenKeywords: migration, schema change, database, auth, ...) against the QF's own description text — it cannot catch a schema-touching necessity discovered only during implementation, only one the QF author already named explicitly",
    verified_by: 'LEAD (direct read)',
    verified_at: 'scripts/classify-quick-fix.js:36-40',
    evidence_row: null,
  },
];

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: { ...(sd.metadata || {}), mechanism_verifications: mechanismVerifications, mechanism_verifications_recorded_at: now } })
  .eq('id', sd.id);
if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

console.log(`Recorded ${mechanismVerifications.length} mechanism_verifications for ${SD_KEY}.`);
