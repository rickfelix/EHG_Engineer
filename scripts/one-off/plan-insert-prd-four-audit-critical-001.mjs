#!/usr/bin/env node
// PLAN-phase PRD authoring for SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001.
// Inline mode per CLAUDE_PLAN.md: add-prd-to-database.js printed the generation prompt +
// auto-ran DESIGN/DATABASE sub-agent evidence (DESIGN CONDITIONAL_PASS -- non-UI infra SD,
// no UI/UX applicable; DATABASE PASS -- no migration files exist yet, accurate for pre-EXEC
// state since the migration is authored during EXEC, not PLAN). This script authors the PRD
// JSON directly incorporating:
//   - VALIDATION (5dcada29): USING-clause correctness is the single highest-value finding --
//     ALTER COLUMN TYPE with no USING clause interprets naive values via the APPLYING
//     SESSION's TimeZone GUC, not UTC; an unpinned apply from a non-UTC session permanently
//     shifts every historical value. All 15 columns confirmed exact against live schema.
//     product_requirements_v2 (7/7 naive) is orphaned by the SKEW-001 fold -- flagged, not
//     silently absorbed. 3 unguarded silent-fail append sites named.
//   - Explore (e6d3299c): canonical info_schema reader is scripts/db-validate/schema-validator.js:99
//     (mirror, don't author a new one); canonical pooler helper is createDatabaseClient('engineer')
//     from scripts/lib/supabase-connection.js; zero chairman-gated timestamp precedent (first of
//     kind, including the DOWN-file column-type-revert shape); _DOWN.sql is house majority style;
//     lib/time/pg-timestamp.cjs is the canonical normalizer (reuse, don't reimplement -- the
//     evidence gate already has a 3rd independent correct-but-duplicate copy); 2 new likely-live
//     unguarded defect sites on hot paths (strand-age-gauge.cjs, claim-analysis.js).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001';
const SD_UUID = 'ea65ac97-8f76-4a0f-98c0-64065048897b';
const PRD_ID = `PRD-${SD_KEY}`;

const executive_summary =
  'Stage timestamptz migration (USING-clause pinned to UTC) for 15 tz-naive columns across 4 audit-critical tables, ' +
  'plus an info_schema verification script and a JS-reader audit fixing unguarded hot-path age computations.';
// 234 chars, within 100-300.

const functional_requirements = [
  {
    id: 'FR-1',
    requirement: 'Stage ALTER COLUMN TYPE timestamp -> timestamptz for all 15 identified naive columns across the 4 audit-critical tables, with every statement pinned via an explicit USING clause.',
    description:
      'Author database/chairman-gated/<date>_four_audit_critical_timestamptz.sql with, per table: ' +
      'quick_fixes.{completed_at,created_at,started_at}; sd_phase_handoffs.{accepted_at,created_at,rejected_at}; ' +
      'strategic_directives_v2.{approval_date,archived_at,created_at,effective_date,expiry_date,updated_at}; ' +
      'user_stories.{completed_at,created_at,updated_at} (15 columns, live-confirmed exact against schema by VALIDATION, zero drift either direction). ' +
      'Each statement: ALTER TABLE <table> ALTER COLUMN <col> TYPE timestamptz USING <col> AT TIME ZONE \'UTC\'. ' +
      'The already-aware sibling columns on the same tables (resolved_at, completion_date, embedding_generated_at, quality_checked_at, not_before, e2e_test_last_run) are explicitly OUT of scope and must not appear in the migration.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'AC-1: File contains exactly 15 ALTER COLUMN TYPE statements, one per naive column, each with an explicit USING <col> AT TIME ZONE \'UTC\' clause -- grep confirms zero statements omit USING.',
      'AC-2: A --approved-by header is present but left blank pending chairman ceremony, matching scripts/lib/migration-guards.js APPROVED_BY_RE convention.',
      'AC-3: File is placed under database/chairman-gated/ (never database/migrations/) and is never executed by any inline apply path -- grep of scripts/ finds no auto-apply reference to this filename.',
    ],
  },
  {
    id: 'FR-2',
    requirement: 'Author an information_schema.columns-based pre/post verification script over the pooler, mirroring the existing reader pattern rather than inventing a new one.',
    description:
      'Mirror the existing information_schema.columns reader at scripts/db-validate/schema-validator.js:99 and use the canonical connection helper createDatabaseClient(\'engineer\') from scripts/lib/supabase-connection.js -- NOT a hand-rolled pg.Client (VALIDATION measured a hand-rolled pooler connection failing "password authentication failed for user postgres" where the helper succeeded on the identical query, same class of failure the DEFACL SD hit independently). ' +
      'Script queries data_type for all 15 target columns plus the 6 already-aware sibling columns as a negative control, and reports PASS only when the 15 read \'timestamp without time zone\' pre-apply / \'timestamp with time zone\' post-apply, and the 6 siblings are unchanged throughout.',
    priority: 'CRITICAL',
    acceptance_criteria: [
      'AC-1: Script uses createDatabaseClient(\'engineer\') exclusively; zero hand-rolled pg.Client instantiation.',
      'AC-2: --baseline mode run against live production confirms all 15 columns = \'timestamp without time zone\' and the 6 sibling columns = \'timestamp with time zone\' (negative control unchanged).',
      'AC-3: Script is read-only (SELECT against information_schema.columns only) -- no DDL capability, cannot itself apply the migration.',
    ],
  },
  {
    id: 'FR-3',
    requirement: 'Audit high-traffic JS readers of the 4 tables\' timestamp columns for double-conversion risk (folded from SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001), and fix the unguarded sites found during PLAN exploration using the existing canonical normalizer.',
    description:
      'Explore identified 2 likely-live unguarded defect sites on high-traffic hot paths that must be fixed: lib/coordinator/strand-age-gauge.cjs (tsMs() has no hasTZ guard, feeds fleet-dashboard.cjs printStrandAgeGauge()) and scripts/modules/sd-next/claim-analysis.js (~154-172, ~221-232, raw new Date() on strategic_directives_v2.updated_at and sd_phase_handoffs.created_at with no TZ guard, runs on every sd:next/claim invocation). ' +
      'VALIDATION additionally named 3 unguarded silent-fail append sites for the audit sweep: handoff-rejection-rates.mjs:49, duration-estimator.js:271-284, ghost-completion-check.mjs:41. ' +
      'A prospective TESTING review (PLAN-TO-EXEC) found a THIRD unguarded site outside the originally-cited ranges: scripts/modules/sd-next/claim-analysis.js checkEnrichmentSignal() ~line 230 -- must be included in the fix scope alongside the two named hot-path sites. ' +
      'Fixes MUST reuse the existing canonical normalizer lib/time/pg-timestamp.cjs (parsePgTimestamp/pgTimestampMs/pgTimestampAgeMs) rather than adding a new bespoke hasTZ-guard reimplementation -- scripts/modules/handoff/gates/subagent-evidence-gate.js already carries a 3rd independent correct-but-duplicate parseAsUTC() copy; this SD must not add a 4th. ' +
      'A broader grep sweep across ehg/src and EHG_Engineer/{scripts,lib} for created_at/age computations against the 4 tables classifies every match SAFE (no timezone assumption) or FIXED (patched), zero UNCLASSIFIED.',
    priority: 'HIGH',
    acceptance_criteria: [
      'AC-1: lib/coordinator/strand-age-gauge.cjs and scripts/modules/sd-next/claim-analysis.js both route their timestamp parsing through lib/time/pg-timestamp.cjs, verified by import + call-site diff.',
      'AC-2: Grep sweep output table lists every matched reader with a SAFE or FIXED classification and zero UNCLASSIFIED entries.',
      'AC-3: A unit test simulates a non-UTC TZ environment variable and asserts the fixed readers compute the same age/ordering result as under UTC (proves the fix, not just the presence of a guard).',
    ],
  },
  {
    id: 'FR-4',
    requirement: 'Author a paired _DOWN.sql reverting timestamptz -> timestamp, and document per-column normalize-on-read guidance for the mixed-representation transition window.',
    description:
      'No existing chairman-gated migration performs a column-type revert (Explore: first of its kind in this repo) -- the DOWN file must originate its own ALTER COLUMN ... TYPE timestamp without time zone revert logic, following the majority _DOWN.sql naming convention (9/11 files) and the standard BEGIN; SET LOCAL lock_timeout; ...; COMMIT; template. ' +
      'Because the migration is chairman-gated and may apply at an unknown future point while the fleet continues writing, rows may carry MIXED naive and aware representations during any transition window (coordinator builder condition). This PRD documents, per column, that readers must tolerate BOTH forms transitionally: lib/time/pg-timestamp.cjs\'s hasTZ-based branch already implements this contract (regex-detect offset presence, branch accordingly) -- FR-3\'s fixes inherit this property for free by routing through it, and this must be called out explicitly rather than assumed.',
    priority: 'HIGH',
    acceptance_criteria: [
      'AC-1: <stem>_DOWN.sql exists beside the UP file, named per house convention, containing exactly 15 reverse ALTER COLUMN TYPE statements, EACH carrying its own USING <col> AT TIME ZONE \'UTC\' clause -- a prospective TESTING review found this requirement absent from the original FR-4 draft; the DOWN direction (timestamptz -> timestamp) is equally capable of corrupting data via the same session-GUC-interpretation mechanism as the UP direction, and TS-2 now proves both directions.',
      'AC-2: PRD (this document) contains an explicit "Mixed-representation transition" note naming lib/time/pg-timestamp.cjs\'s hasTZ branch as the tolerance mechanism, referenced by FR-3\'s fixed call sites.',
      'AC-3: A before-UP / after-DOWN information_schema.columns hash (data_type per target column) is byte-identical; before-UP / after-UP (no DOWN) differs -- proves DOWN is a real inverse.',
    ],
  },
  {
    id: 'FR-5',
    requirement: 'Assemble the chairman ceremony packet: blank @approved-by header, database/chairman-gated/README.md entry, and an explicit quiet-window scheduling note.',
    description:
      'Add a new "Applying <file>" section to database/chairman-gated/README.md documenting the apply command (node scripts/apply-migration.js ... --prod-deploy [--allow-any-path]) and the verification sequence (self-test -> baseline -> [apply] -> post-verify -> [if rollback] DOWN-verify). ' +
      'Because all 4 target tables are continuously written by the live fleet (sd_phase_handoffs, strategic_directives_v2, quick_fixes, user_stories are among the highest-write-frequency tables in the schema), the migration header and README entry must both carry an explicit quiet-window scheduling requirement for the chairman/coordinator to honor at apply time -- this is an apply-time coordination concern the ceremony packet documents but does not itself enforce.',
    priority: 'MEDIUM',
    acceptance_criteria: [
      'AC-1: README.md contains a new section for this migration matching the structure of existing entries (e.g. the DEFACL SD\'s entry).',
      'AC-2: Migration file header and README both contain an explicit sentence naming the quiet-window requirement.',
      'AC-3: @approved-by header is verified blank at PLAN-TO-LEAD (never pre-filled by EXEC).',
    ],
  },
  {
    id: 'FR-6',
    requirement: 'Document, as explicit out-of-scope findings routed via completion-flags (not silent omissions), that product_requirements_v2 carries 7/7 naive timestamp columns orphaned by the SKEW-001 fold, and that a 3rd duplicate timestamp-normalizer reimplementation already exists in the evidence gate.',
    description:
      'VALIDATION found product_requirements_v2 (all 7 timestamp columns naive) was in scope for the folded-in SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001 but is NOT one of the 4 tables this SD\'s approved scope covers -- the fold left it uncovered by either SD. This SD does not expand to cover it (scope is locked at LEAD approval to the 4 named tables) but must record the gap for a follow-up SD rather than silently dropping it. ' +
      'Separately, scripts/modules/handoff/gates/subagent-evidence-gate.js already contains its own correct, independently-written parseAsUTC() implementation (a 3rd copy of the same logic lib/time/pg-timestamp.cjs and premise-freshness.cjs also implement) -- not a defect, but consolidation-worthy technical debt, recorded here rather than silently left for the next person to rediscover.',
    priority: 'LOW',
    acceptance_criteria: [
      'AC-1: PRD risks section names product_requirements_v2\'s 7 naive columns explicitly as an out-of-scope gap with a follow-up-SD recommendation.',
      'AC-2: PRD risks section names the 3rd-copy normalizer duplication in subagent-evidence-gate.js as a consolidation candidate, not a correctness defect.',
      'AC-3: SD completion-flags capture routes both findings as "needs_decision" or "tied_to_sd" flags at LEAD-FINAL-APPROVAL, not silently closed.',
    ],
  },
];

const technical_requirements = [
  {
    id: 'TR-1',
    requirement: 'Every ALTER COLUMN TYPE timestamp -> timestamptz statement MUST include an explicit USING <col> AT TIME ZONE \'UTC\' clause.',
    rationale:
      'Without an explicit USING clause, PostgreSQL interprets each stored naive value through the APPLYING SESSION\'s TimeZone GUC, not through the value\'s true UTC meaning. All stored values in this schema are UTC (application-written, never locally-authored), so an unpinned ALTER run from a non-UTC session (e.g. an EDT-configured operator shell) permanently shifts every historical timestamp by the session\'s offset -- silently recreating, at the row level and irreversibly, the exact class of bug this SD exists to fix. This is VALIDATION\'s single highest-value, load-bearing finding for this SD.',
  },
  {
    id: 'TR-2',
    requirement: 'All information_schema.columns catalog reads must use createDatabaseClient(\'engineer\') from scripts/lib/supabase-connection.js, never a hand-rolled pg.Client, and mirror scripts/db-validate/schema-validator.js:99\'s existing reader rather than a new implementation.',
    rationale:
      'pg_catalog / information_schema is not reliably exposed through PostgREST, so this class of query must go over the direct pooler connection. VALIDATION measured a hand-rolled Client({connectionString: SUPABASE_POOLER_URL}) failing with "password authentication failed for user postgres" on the identical query where createDatabaseClient(\'engineer\') succeeded -- the same credential-handling gap (env resolution, SSL/CA bundling, credential-rotation staleness) independently confirmed on a prior SD in this session. Mirroring the existing schema-validator.js reader also avoids a 5th parallel implementation of the same information_schema query pattern.',
  },
  {
    id: 'TR-3',
    requirement: 'JS-reader fixes must route through the existing canonical normalizer lib/time/pg-timestamp.cjs, never a new bespoke hasTZ-guard reimplementation.',
    rationale:
      'lib/time/pg-timestamp.cjs is a .cjs module deliberately written to be reachable from both CJS and ESM callers, already covers some quick_fixes/strategic_directives_v2 consumers, and its hasTZ branch already implements the mixed-representation tolerance FR-4 requires. scripts/modules/handoff/gates/subagent-evidence-gate.js is already a 3rd independent (correct but duplicate) reimplementation of the same logic -- adding a 4th for this SD\'s new fixes would compound the exact fragmentation the canonical module exists to prevent.',
  },
  {
    id: 'TR-4',
    requirement: 'The migration MUST DROP every dependent view/matview before its ALTER COLUMN TYPE statements and CREATE each one again (identical definition + grants) immediately after, in both the UP and DOWN direction.',
    rationale:
      'A DATABASE sub-agent review of the actual authored migration (evidence 8c3ed611, EXEC phase -- the PLAN-phase automated DATABASE run found zero migration files, since none existed yet, so this could not be caught earlier) found 10 of the 15 target columns are referenced by 11 dependent objects (7 public views, 2 governance-schema views invisible to a public-only check, 2 materialized views). Without dropping them first, PostgreSQL raises SQLSTATE 0A000 ("cannot alter type of a column used by a view or rule") and the ceremony transaction aborts. Proven both ways: the DATABASE sub-agent reproduced the failure live via a TEMP TABLE + TEMP VIEW; the corrected envelope was then proven live end-to-end (UP body, verify all 15 aware + recreated views queryable, DOWN body, verify all 15 naive again) inside a single transaction that always ROLLBACKs -- database/chairman-gated/20260817_four_audit_critical_timestamptz_dry_run.mjs, safe to re-run before the real ceremony.',
  },
];

const system_architecture = {
  overview:
    'A staged (never inline-applied) UP/DOWN migration pair pinning all 15 naive-column conversions to UTC via explicit USING clauses, an information_schema.columns verification script reusing the existing pooler-read pattern, a JS-reader audit that fixes 2 confirmed unguarded hot-path sites plus a broader grep sweep by routing through the existing canonical normalizer, and a chairman ceremony packet documenting apply-time quiet-window coordination. Every component reuses existing, previously-verified infrastructure (schema-validator.js\'s reader pattern, createDatabaseClient, lib/time/pg-timestamp.cjs) rather than authoring parallel implementations.',
  components: [
    {
      name: 'database/chairman-gated/<date>_four_audit_critical_timestamptz.sql (+ _DOWN.sql)',
      responsibility: '15 ALTER COLUMN TYPE statements (4 tables), each USING <col> AT TIME ZONE \'UTC\' pinned; paired first-of-kind column-type-revert DOWN file. Staged only; requires chairman ceremony apply.',
      technology: 'PostgreSQL DDL',
    },
    {
      name: 'database/chairman-gated/<date>_four_audit_critical_timestamptz_verify.mjs',
      responsibility: 'information_schema.columns pre/post verification over the pooler via createDatabaseClient(\'engineer\'), mirroring scripts/db-validate/schema-validator.js:99; 15-column positive check + 6-column sibling negative control.',
      technology: 'Node.js, pg over SUPABASE_POOLER_URL',
    },
    {
      name: 'lib/coordinator/strand-age-gauge.cjs, scripts/modules/sd-next/claim-analysis.js (fixed)',
      responsibility: 'Two confirmed unguarded hot-path readers of the naive columns, patched to route through lib/time/pg-timestamp.cjs.',
      technology: 'Node.js CJS/ESM',
    },
    {
      name: 'Grep-sweep audit output (JS-reader classification table)',
      responsibility: 'Every matched reader across ehg/src and EHG_Engineer/{scripts,lib} classified SAFE or FIXED, closing the folded-in SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001 JS-consumer scope.',
      technology: 'grep + manual classification, committed as evidence',
    },
    {
      name: 'database/chairman-gated/README.md (extended)',
      responsibility: 'New "Applying <file>" section: apply command, verify sequence, quiet-window scheduling note.',
      technology: 'Markdown',
    },
  ],
  data_flow:
    'Live catalog (information_schema.columns) -> createDatabaseClient(\'engineer\') over the pooler -> verify.mjs JSON snapshot (--baseline/--verify) -> compared against the 15-column target set + 6-column negative control -> PASS/FAIL with per-column breakdown. Separately: grep sweep of JS source -> per-site classification -> fixed sites route through lib/time/pg-timestamp.cjs -> unit test proves TZ-environment-independent correctness.',
  integration_points: [
    'scripts/db-validate/schema-validator.js (existing information_schema reader pattern, mirrored not duplicated)',
    'scripts/lib/supabase-connection.js createDatabaseClient (canonical pooler connection helper)',
    'lib/time/pg-timestamp.cjs (canonical timestamp normalizer, reused for all JS-reader fixes)',
    'database/chairman-gated/README.md ceremony process (apply-time gate, out of this SD\'s scope)',
  ],
};

const test_scenarios = [
  {
    id: 'TS-1',
    scenario: 'Baseline capture proves the live premise before any apply: all 15 target columns are naive, all 6 sibling columns are already aware.',
    test_type: 'integration',
    given: 'Live EHG_Engineer catalog, no migration applied',
    when: 'verify.mjs --baseline runs over the pooler via createDatabaseClient(\'engineer\')',
    then: 'All 15 target columns report data_type=\'timestamp without time zone\'; all 6 sibling columns report \'timestamp with time zone\' -- matches VALIDATION\'s live-confirmed 15/15 exact census.',
  },
  {
    id: 'TS-2',
    scenario: 'USING-clause correctness is a TWO-SIDED SEMANTIC proof (not a text-presence grep), run against a throwaway scratch table under a non-UTC session, for BOTH the UP file (timestamp->timestamptz) and the DOWN file (timestamptz->timestamp).',
    test_type: 'integration',
    given: 'A throwaway scratch table (NEVER one of the 4 live tables -- dry-running those holds ACCESS EXCLUSIVE and 55P03s live fleet writers) seeded with a naive UTC value, inside a transaction that always ROLLBACKs',
    when: 'SET LOCAL TimeZone=\'America/New_York\' is set, then the real ALTER COLUMN TYPE ... USING <col> AT TIME ZONE \'UTC\' statement runs (both directions: UP\'s conversion and DOWN\'s reverse conversion), and a parallel negative-control run omits the USING clause entirely',
    then: 'The USING-clause run resolves to the correct UTC-anchored instant regardless of session TimeZone; the negative-control run (no USING) resolves to a DIFFERENT, wrong instant -- the divergence between the two runs is the actual proof the clause matters, not merely that it is textually present. Both the UP and DOWN direction are proven, since the DOWN file has no USING requirement documented in FR-4 and is equally capable of corrupting data via the same GUC-interpretation mechanism as the UP file.',
  },
  {
    id: 'TS-3',
    scenario: 'JS-reader fix regression: a non-UTC TZ environment produces the same correct age/ordering result as UTC, for all three fixed hot-path readers, including null/malformed/DST-boundary edge cases and a pin-effectiveness guard.',
    test_type: 'unit',
    given: 'Synthetic naive timestamp strings (as PostgREST would return them pre-migration) including a well-formed value, a null/absent value, a malformed value, and a value straddling a DST transition boundary; process.env.TZ explicitly pinned to a non-UTC zone using the pin-effectiveness guard from tests/unit/time/pg-timestamp-tz.test.js (this host\'s ambient zone is already America/New_York, so a naive TZ=America/New_York pin is a no-op unless pin-effectiveness is verified first -- use a zone genuinely different from the ambient one, or verify the pin actually changed behavior)',
    when: 'lib/coordinator/strand-age-gauge.cjs\'s tsMs(), scripts/modules/sd-next/claim-analysis.js\'s age computation AND checkEnrichmentSignal() (~line 230, a third unguarded site found by prospective TESTING review, outside the originally-cited ranges), all run against every fixture, post-fix',
    then: 'All three compute the same result as under TZ=UTC (via lib/time/pg-timestamp.cjs\'s hasTZ-based normalization) for the well-formed and DST-boundary cases. For the null/malformed fixture specifically: strand-age-gauge.cjs\'s tsMs() must be proven to still trigger its resolved_at fallback (lines 86-100) -- pgTimestampMs() returning NaN for a bad input must not silently pass the `!== null` guard at line 81 and produce ageMs=NaN downstream; the fallback firing correctly is itself the assertion.',
  },
  {
    id: 'TS-4',
    scenario: 'DOWN-file exact-restoration proof via before/after information_schema.columns hashing, bound to the SAME scratch-table transaction TS-2 uses (a standalone fixture/dry-run claim is vacuous -- both arms would trivially hash equal with nothing actually run).',
    test_type: 'integration',
    given: 'Pre-UP hash of {data_type per target column} on the TS-2 scratch table, inside the same ROLLBACK-guarded transaction',
    when: 'The real UP ALTER runs (hash taken: differs from pre-UP), then the real DOWN ALTER runs immediately after (hash taken again)',
    then: 'Post-DOWN hash equals pre-UP hash exactly; post-UP (no DOWN) hash differs from both -- proves DOWN is a real inverse actually exercised against real DDL, not a fixture claim with nothing behind it.',
  },
  {
    id: 'TS-5',
    scenario: 'Mixed-representation tolerance: a reader given both a naive-string and an aware-string input for the same logical timestamp produces the same correct epoch value.',
    test_type: 'unit',
    given: 'Two fixture strings representing the same instant, one offset-less (\'2026-08-16T12:00:00\') and one explicitly UTC-offset (\'2026-08-16T12:00:00+00:00\')',
    when: 'lib/time/pg-timestamp.cjs\'s pgTimestampMs() parses both',
    then: 'Both resolve to the identical epoch millisecond value -- proves the transition-window tolerance contract FR-4 documents actually holds for the mechanism FR-3\'s fixes depend on.',
  },
  {
    id: 'TS-6',
    scenario: 'Scope boundary: the migration and verification script touch exactly the 4 named tables\' 15 columns; the 6 sibling columns and product_requirements_v2 are untouched.',
    test_type: 'security',
    given: 'The staged UP/DOWN files and verify.mjs source',
    when: 'grep for column names outside the 15-column target set, and for any reference to product_requirements_v2',
    then: 'Zero matches -- confirms the approved scope boundary (4 tables only, product_requirements_v2 explicitly out-of-scope per FR-6) was not silently widened during implementation.',
  },
  {
    id: 'TS-7',
    scenario: 'Ceremony-packet acceptance criteria (FR-1 AC-3, FR-5 AC-3) are independently verified, since TS-1..TS-6 do not cover them and an EXEC could satisfy every other test while still violating these.',
    test_type: 'integration',
    given: 'The staged UP file and the full scripts/ tree',
    when: 'A check confirms the migration file\'s @approved-by header is blank (not pre-filled by EXEC), and grep of scripts/ for the migration filename finds zero inline auto-apply callers',
    then: 'Both checks pass -- closes the coverage gap a prospective TESTING review found: passing TS-1 through TS-6 alone does not prove the ceremony-gating contract held.',
  },
];

const risks = [
  {
    risk: 'ALTER COLUMN TYPE with no (or an incorrect) USING clause interprets naive values via the applying session\'s TimeZone GUC rather than the value\'s true UTC meaning, permanently shifting every historical timestamp if applied from a non-UTC session.',
    probability: 'MEDIUM',
    impact: 'HIGH',
    mitigation: 'TR-1/FR-1 mandate an explicit USING <col> AT TIME ZONE \'UTC\' clause on all 15 statements; TS-2 statically asserts every statement carries it before the file can be considered ready for ceremony.',
    rollback_plan: 'If applied without USING and discovered post-apply, the DOWN file cannot recover the correct values (the shift already occurred) -- the only real safeguard is the pre-apply static assertion (TS-2), not a rollback.',
  },
  {
    risk: 'ALTER COLUMN TYPE on 4 continuously-written core tables is a table rewrite (ACCESS EXCLUSIVE lock for the duration), not a metadata-only change -- applying against live fleet writes without a quiet window risks lock contention or writer errors.',
    probability: 'MEDIUM',
    impact: 'HIGH',
    mitigation: 'Staged only, never applied by EXEC. FR-5\'s ceremony packet documents an explicit quiet-window scheduling requirement for the chairman/coordinator to honor at apply time -- an apply-time coordination concern, not a build-time one.',
    rollback_plan: 'Apply the paired _DOWN.sql file, verified via TS-4\'s before/after hash comparison.',
  },
  {
    risk: 'Rows may carry MIXED tz-naive and tz-aware representations during any transition window between migration authoring and eventual chairman-ceremony apply -- a reader assuming a single representation could misparse either direction.',
    probability: 'MEDIUM',
    impact: 'MEDIUM',
    mitigation: 'FR-4 documents per-column normalize-on-read guidance naming lib/time/pg-timestamp.cjs\'s hasTZ branch as the tolerance mechanism; TS-5 proves the mechanism holds for both representations.',
    rollback_plan: 'Not applicable -- this is a design property (tolerate both forms), not an apply-time failure mode.',
  },
  {
    risk: 'High-traffic JS readers that currently compensate for tz-naive timestamps could silently double-convert once the column returns a properly tz-aware value from Postgres, producing a new timezone-skew bug in the opposite direction.',
    probability: 'MEDIUM',
    impact: 'HIGH',
    mitigation: 'FR-3\'s explicit audit sweep (2 confirmed unguarded sites fixed, 3 additional VALIDATION-named sites reviewed, broader grep sweep classifying every match) closes this before merge; TS-3 proves the fixed sites specifically.',
    rollback_plan: 'If a double-conversion regression is found post-fix, revert the specific reader\'s patch (lib/time/pg-timestamp.cjs itself is unaffected since it correctly handles both representations).',
  },
  {
    risk: 'product_requirements_v2 (7/7 naive timestamp columns) was in scope for the folded-in SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001 but is orphaned by the fold -- neither this SD nor its predecessor covers it.',
    probability: 'LOW',
    impact: 'LOW',
    mitigation: 'FR-6 documents the gap explicitly and routes it as a completion-flags finding at LEAD-FINAL-APPROVAL, recommending a follow-up SD rather than silently expanding this SD\'s locked 4-table scope.',
    rollback_plan: 'Not applicable -- no code change is made to product_requirements_v2 by this SD; the risk is documentation-only until a follow-up SD is approved.',
  },
  {
    risk: '10 of the 15 target columns are referenced by 11 dependent views/matviews (7 public, 2 governance-schema, 2 materialized) -- ALTER COLUMN TYPE cannot touch a column referenced by a view without dropping it first, so the migration as originally authored would abort at ceremony time.',
    probability: 'HIGH (would have occurred with certainty at ceremony)',
    impact: 'MEDIUM',
    mitigation: 'Found by a DATABASE sub-agent review of the actual migration content during EXEC (evidence 8c3ed611); fixed by adding a DROP/CREATE envelope around all 11 objects, with identical definitions and grants captured live, in both the UP and DOWN files. Proven end-to-end via a ROLLBACK-guarded live dry run (database/chairman-gated/20260817_four_audit_critical_timestamptz_dry_run.mjs) rather than trusted on inspection alone.',
    rollback_plan: 'The dry-run script itself is the rollback-safety mechanism -- re-run it before the real ceremony if the schema has changed since this SD was built, to catch any drift in the 11 objects\' definitions before a real apply.',
  },
  {
    risk: 'Implementation may not fully address root cause',
    probability: 'LOW',
    impact: 'LOW',
    mitigation: 'Verify against original evidence; re-queue via /learn if pattern recurs.',
    rollback_plan: 'Chairman-gated DOWN file restores prior state exactly; no live-apply rollback needed since nothing applies inline.',
  },
];

const implementation_approach = {
  phases: [
    {
      phase: 'Phase 1: Migration authoring',
      description: 'Author the UP file (15 USING-pinned ALTER COLUMN TYPE statements across 4 tables) and the first-of-kind column-type-revert DOWN file, following house _DOWN.sql convention and TR-1\'s USING-clause mandate.',
      deliverables: ['database/chairman-gated/<date>_four_audit_critical_timestamptz.sql', 'database/chairman-gated/<date>_four_audit_critical_timestamptz_DOWN.sql'],
    },
    {
      phase: 'Phase 2: Verification script authoring',
      description: 'Author the information_schema.columns verify script mirroring schema-validator.js:99, using createDatabaseClient(\'engineer\'), with --baseline/--verify modes and the 6-column negative control.',
      deliverables: ['database/chairman-gated/<date>_four_audit_critical_timestamptz_verify.mjs', 'Baseline evidence artifact confirming 15/15 naive pre-apply'],
    },
    {
      phase: 'Phase 3: JS-reader audit and fixes',
      description: 'Fix the 2 confirmed unguarded hot-path sites (strand-age-gauge.cjs, claim-analysis.js) plus review VALIDATION\'s 3 named silent-fail sites, run the broader grep sweep across both repos, classify every match, route all fixes through lib/time/pg-timestamp.cjs.',
      deliverables: ['Patched strand-age-gauge.cjs and claim-analysis.js', 'JS-reader classification table (SAFE/FIXED, zero UNCLASSIFIED)', 'Unit tests proving TZ-environment-independent correctness (TS-3)'],
    },
    {
      phase: 'Phase 4: Ceremony packet + verification without live apply',
      description: 'Extend database/chairman-gated/README.md with the apply/verify ceremony section and quiet-window note; run --baseline against production (read-only, safe); document static USING-clause proof (TS-2) and fixture-based DOWN-restoration proof (TS-4) since chairman-gated DDL cannot be applied by EXEC.',
      deliverables: ['README.md "Applying <file>" section', 'Baseline + static-assertion evidence artifacts', 'Ceremony runbook note in the migration header'],
    },
  ],
  technical_decisions: [
    'Pin every ALTER COLUMN TYPE with an explicit USING <col> AT TIME ZONE \'UTC\' clause rather than relying on default cast behavior -- the single highest-value correction from VALIDATION\'s review.',
    'Mirror the existing information_schema.columns reader pattern (schema-validator.js) and canonical pooler helper (createDatabaseClient) rather than authoring a parallel reader.',
    'Route all JS-reader fixes through the existing canonical normalizer lib/time/pg-timestamp.cjs rather than adding a 4th independent hasTZ-guard reimplementation.',
    'Explicitly document (not silently absorb or drop) the product_requirements_v2 fold-orphan gap and the subagent-evidence-gate.js duplicate-normalizer debt, both surfaced during PLAN exploration.',
    'Collapse the 15 single-column ALTER statements into 4 multi-clause ALTER TABLE statements (one per table), per DATABASE sub-agent recommendation, once the dependent-view drop/recreate envelope was already required -- reduces statement count without changing semantics.',
    'Drop and recreate all 11 dependent views/matviews around the column changes (both UP and DOWN) rather than attempting a narrower per-column workaround -- proven correct end-to-end via a live, ROLLBACK-guarded dry run rather than trusted on inspection.',
  ],
};

const acceptance_criteria = [
  'A staged (never inline-applied) UP/DOWN migration pair exists under database/chairman-gated/, converting exactly the 15 identified naive columns across the 4 named tables, with every ALTER COLUMN TYPE statement carrying an explicit USING ... AT TIME ZONE \'UTC\' clause.',
  'An information_schema.columns verification script exists, using createDatabaseClient(\'engineer\') and mirroring the existing schema-validator.js reader pattern, with a passing --baseline run confirming the live pre-apply state (15 naive, 6 aware) exactly.',
  'The 2 confirmed unguarded hot-path JS readers (strand-age-gauge.cjs, claim-analysis.js) are fixed to route through lib/time/pg-timestamp.cjs, and a broader grep-sweep classification table covers every other high-traffic reader with zero UNCLASSIFIED entries.',
  'PRD risks explicitly document the product_requirements_v2 fold-orphan gap and the USING-clause risk, both routed as completion-flags findings, not silent omissions.',
  'Chairman ceremony packet (README.md entry + blank @approved-by header + quiet-window note) is complete and matches house convention.',
];

const integration_operationalization = {
  consumers: [
    { name: 'Chairman (ceremony operator)', interaction: 'Reviews and approves the staged UP file at the named ceremony, honoring the quiet-window scheduling note, fills the @approved-by header, then applies manually.', frequency: 'One-time, at the named ceremony anchor.' },
    { name: 'lib/coordinator/strand-age-gauge.cjs / fleet-dashboard.cjs printStrandAgeGauge()', interaction: 'Reads strategic_directives_v2.updated_at to compute SD staleness age, displayed on every fleet-dashboard invocation.', frequency: 'Continuous, high-traffic (every dashboard render).' },
    { name: 'scripts/modules/sd-next/claim-analysis.js (sd:next / claim CLI)', interaction: 'Reads strategic_directives_v2.updated_at and sd_phase_handoffs.created_at to compute claim/handoff age, informing claim-eligibility decisions.', frequency: 'Continuous, very high-traffic (every sd:next / claim invocation fleet-wide).' },
    { name: 'lib/time/pg-timestamp.cjs (canonical normalizer, unchanged by this SD)', interaction: 'Consumed by this SD\'s JS-reader fixes; itself unaffected by the schema change since it already tolerates both representations.', frequency: 'Continuous, existing usage plus this SD\'s new call sites.' },
  ],
  dependencies: [
    { name: 'lib/time/pg-timestamp.cjs (existing, from SD-LEO-INFRA-REPO-WIDE-TIMEZONE-001)', type: 'upstream', contract: 'This SD\'s JS-reader fixes call the existing parsePgTimestamp/pgTimestampMs/pgTimestampAgeMs API without modification.', failure_handling: 'If the upstream module\'s API changes shape, this SD\'s call sites must be updated in lockstep.' },
    { name: 'scripts/db-validate/schema-validator.js (existing information_schema reader)', type: 'upstream', contract: 'This SD\'s verify.mjs mirrors, but does not import or modify, the existing reader pattern.', failure_handling: 'N/A -- pattern reuse only, no runtime coupling.' },
    { name: 'database/chairman-gated/ ceremony apply process', type: 'downstream', contract: 'This SD\'s deliverables are inert until manually applied at ceremony; EXEC cannot and must not apply them.', failure_handling: 'If ceremony is delayed indefinitely, the recurrence-prevention value (FR-1) is deferred but the existing tz-naive skew remains until then -- no automatic mitigation.' },
  ],
  data_contracts: [
    { contract_name: '15-column naive-to-aware conversion set', schema: 'quick_fixes.{completed_at,created_at,started_at}; sd_phase_handoffs.{accepted_at,created_at,rejected_at}; strategic_directives_v2.{approval_date,archived_at,created_at,effective_date,expiry_date,updated_at}; user_stories.{completed_at,created_at,updated_at}.', validation: 'information_schema.columns data_type check, pre- and post-apply, plus the 6-column sibling negative control.', versioning: 'One-time schema change; no versioning scheme needed beyond the migration file itself.' },
  ],
  runtime_config: {
    environment_variables: ['SUPABASE_POOLER_URL (verify.mjs pooler read)', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL'],
    feature_flags: [],
    deployment_considerations: 'No deployment -- this SD only stages SQL/JS artifacts and patches 2 existing JS readers; the schema change itself is applied only at chairman ceremony, out of this SD\'s deploy path.',
  },
  observability_rollout: {
    monitoring: ['verify.mjs --baseline output diffed against prior runs', 'Fleet-dashboard strand-age-gauge output for anomalous ages post-apply'],
    alerts: ['USING-clause static assertion FAIL (TS-2)', 'Post-apply verification reporting any of the 15 columns still naive or any of the 6 siblings unexpectedly changed'],
    rollout_strategy: 'Staged, chairman-gated, single ceremony apply during a scheduled quiet window -- not a phased rollout.',
    rollback_trigger: 'Any reader producing an incorrect age/ordering result post-apply, or unexpected lock contention / writer errors during apply.',
    rollback_procedure: 'Apply the paired _DOWN.sql file, verified via the before/after information_schema.columns hash comparison (TS-4).',
  },
};

const exploration_summary = {
  files_read: [
    'lib/time/pg-timestamp.cjs',
    'scripts/db-validate/schema-validator.js',
    'scripts/lib/supabase-connection.js',
    'lib/coordinator/strand-age-gauge.cjs',
    'scripts/modules/sd-next/claim-analysis.js',
    'scripts/modules/handoff/gates/subagent-evidence-gate.js',
    'scripts/fleet-dashboard.cjs',
    'database/chairman-gated/README.md',
    'database/chairman-gated/20260816_defacl_anon_auth_axis_DOWN.sql (precedent _DOWN.sql template)',
    'docs/plans/archived/sd-leo-infra-repo-wide-timezone-001-plan.md',
  ],
  patterns_identified: [
    'information_schema.columns is the authoritative timezone-awareness check; pg_catalog is not reliably exposed via PostgREST, so this must go over the pooler',
    'createDatabaseClient(\'engineer\') is the canonical pooler connection helper; hand-rolled pg.Client connections fail auth in this environment',
    '_DOWN.sql is house majority convention (9/11 recent chairman-gated pairs); no column-type-revert precedent exists yet',
    'lib/time/pg-timestamp.cjs is the canonical, already-transition-tolerant timestamp normalizer -- 3rd independent duplicate already exists in subagent-evidence-gate.js, do not add a 4th',
  ],
  key_decisions: [
    'Pin every ALTER COLUMN TYPE with an explicit USING AT TIME ZONE \'UTC\' clause -- the single highest-value correction identified during PLAN, since an unpinned apply from a non-UTC session would permanently and irreversibly shift historical values',
    'Fix the 2 confirmed unguarded hot-path readers found during Explore rather than deferring them, since both sit on very high-traffic paths (fleet-dashboard, sd:next/claim)',
    'Document rather than silently absorb the product_requirements_v2 fold-orphan gap and the duplicate-normalizer technical debt, both surfaced but out of this SD\'s locked scope',
  ],
  exploration_date: '2026-08-16',
};

const prd = {
  id: PRD_ID,
  directive_id: SD_KEY,
  sd_id: SD_UUID,
  title: 'Four Audit-Critical Tables: TZ-Naive Timestamp Migration to timestamptz',
  version: '1.0',
  status: 'approved',
  category: 'database',
  priority: 'high',
  executive_summary,
  goal_summary: executive_summary,
  functional_requirements,
  technical_requirements,
  system_architecture,
  test_scenarios,
  acceptance_criteria,
  risks,
  implementation_approach,
  integration_operationalization,
  exploration_summary,
  document_type: 'prd',
  phase: 'PLAN',
  created_by: 'Bravo (worker session 698520e6-7b16-46b5-a207-42548fe6a180)',
};

const { data: existing } = await supabase.from('product_requirements_v2').select('id').eq('id', PRD_ID).maybeSingle();

let result;
if (existing) {
  result = await supabase.from('product_requirements_v2').update(prd).eq('id', PRD_ID).select('id,status').maybeSingle();
} else {
  result = await supabase.from('product_requirements_v2').insert(prd).select('id,status').maybeSingle();
}
if (result.error) { console.error('PRD UPSERT ERR:', result.error.message); process.exit(1); }
console.log('PRD upserted:', JSON.stringify(result.data));
