import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '54daa184-4ef8-4d19-babb-80ad0b11e17c';
const PRD_ID = `PRD-${SD_ID}`;
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const prd = {
  id: PRD_ID,
  directive_id: SD_ID,
  sd_id: SD_ID,
  title: 'Orphan-writers registry: every durable writer names its reader',
  status: 'approved',
  executive_summary:
    'A registry pairing durable writers with a reader + consumption predicate, seeded with three real orphan specimens, a unit test enforcing completeness, a live-computed orphan count, and a two-window notifier — unifying existing canonical-write-paths.json and DRAIN_DESCRIPTORS rather than a fourth parallel registry.',
  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Unified orphan-writers registry module',
      description:
        'lib/governance/orphan-writers-registry.js exports ORPHAN_ENTRIES: a frozen array cross-referencing docs/reference/canonical-write-paths.json (writer side) with lib/governance/gauge-registry.js DRAIN_DESCRIPTORS (reader/predicate side where an entry already exists there), plus new entries for the three specimen types not yet represented. Each entry: {id, writer: {file, table_or_channel}, entry_type: wired-but-blind|no-stamper-wired|shipped-but-not-applied, reader: {file, description}, predicate: {description, fn_ref}, evidence}.',
      priority: 'MUST',
      acceptance_criteria: [
        'ORPHAN_ENTRIES is importable and frozen (Object.freeze at module and per-entry level)',
        'Existing DRAIN_DESCRIPTORS entries are referenced/imported, not copy-pasted, to avoid the two-representation drift VALIDATION flagged',
      ],
    },
    {
      id: 'FR-2',
      requirement: 'Unit-tier registry completeness test',
      description:
        'tests/unit/governance/orphan-writers-registry.test.js fails when any ORPHAN_ENTRIES row lacks a reader or predicate. Must be collectible under the vitest unit project (which blanks DB creds) — assertions are structural/static only, no live DB reads. Seeded with at least one real specimen per entry_type: wired-but-blind = semantic-indexer (reader exists, provably cannot see the writes); no-stamper-wired = the coordinator standard_loop rows verified genuinely orphaned by VALIDATION (last_fired_at=NULL, self_stamped, expected_active=true); shipped-but-not-applied = SD-LEO-INFRA-COMPETITIVE-OBSERVED-TAG-MIGRATION-001 (migration merged to main 2026-06-24, DDL not applied until 2026-08-30 17:47Z).',
      priority: 'MUST',
      acceptance_criteria: [
        'Test fails when a fixture entry omits reader or predicate',
        'Test passes against the real seeded baseline with all three entry types represented',
        'Test file has zero live Supabase calls (grep-verifiable)',
      ],
    },
    {
      id: 'FR-3',
      requirement: 'Live-computed known-orphan count',
      description:
        'scripts/orphan-writers-count.mjs computes the known-orphan count LIVE from ORPHAN_ENTRIES predicates each run and prints it — never a hardcoded number in prose or code. VALIDATION measured the SD-cited "93 disagreeing periodic-liveness rows" does not reproduce against any of 7 plausible predicates on periodic_process_registry (95/92/91/86/82/55/40 measured); the script must state its exact predicate in output so the number is falsifiable, and the PRD explicitly does NOT assert 93 as an expected test value anywhere.',
      priority: 'MUST',
      acceptance_criteria: [
        'Running the script twice against unchanged DB state yields the same count (reproducibility)',
        'Output names the exact predicate used per entry_type subtotal',
        'No test or doc in this PRD hardcodes "93" as an expected value',
      ],
    },
    {
      id: 'FR-4',
      requirement: 'Two-consecutive-window notifier',
      description:
        'A notifier (folded into the weekly triage pass, scripts/orphan-writers-notify.mjs) raises an adam_advisory when a registered predicate returns empty for two consecutive windows. adam_advisory is NOT a dedicated table (verified: PGRST205 on adam_advisories/adam_advisory) — it is a session_coordination row with payload.kind=\'adam_advisory\', written via the existing scripts/adam-advisory.cjs conventions (no payload.signal_type/intent_action so it is not scooped by the signal router or deconfliction sweep). Consecutive-miss counting reuses lib/periodic-liveness/ladder-escalation.mjs incrementConsecutiveMiss/resetConsecutiveMiss RPC pattern rather than a new counter mechanism, keyed per registry entry id instead of per periodic_process_registry process_key.',
      priority: 'MUST',
      acceptance_criteria: [
        'A predicate returning empty once does NOT fire an advisory',
        'A predicate returning empty on two consecutive runs DOES fire exactly one adam_advisory naming the writer, reader, and entry_type',
        'The advisory uses the existing scripts/adam-advisory.cjs writer, not a new table or channel',
      ],
    },
    {
      id: 'FR-5',
      requirement: 'Weekly triage pass self-registration',
      description:
        'The weekly triage script (scripts/orphan-writers-count.mjs / orphan-writers-notify.mjs) registers ITSELF in periodic_process_registry (self_stamped, via lib/periodic-liveness/stamp-last-fired.js stampLastFired) so its own execution is provably live, and adds a corresponding ORPHAN_ENTRIES row for its own output (the count/advisory writes) with a real reader (the chairman weekly-line consumer) — so the registry cannot become the fourth orphan specimen, satisfying the SD\'s fifth success criterion.',
      priority: 'MUST',
      acceptance_criteria: [
        'periodic_process_registry gains a row for this triage process, stamped on each run',
        'ORPHAN_ENTRIES includes a self-referential entry for the triage pass\'s own writes, with entry_type=PASS (not orphaned) once the reader is named',
      ],
    },
    {
      id: 'FR-6',
      requirement: 'Feedback-category reclassification per VALIDATION finding',
      description:
        'The SD description cited "four feedback categories with 7,073 unread rows and no consumer" as a wired-but-blind/no-consumer specimen. VALIDATION measured these resolve to SLA_CATEGORIES in lib/coordinator/feedback-sla-gauge.cjs, which DOES read them (a live reader exists) — their real defect is NO_CLOSING_PATH (the gauge alarms but never drains), already correctly classified in DRAIN_DESCRIPTORS[\'feedback-sla-breach\'], and the true undrained count (full pagination, not the 1000-row PostgREST-capped read) is 7,689, not 7,073. ORPHAN_ENTRIES must cite the correct existing DRAIN_DESCRIPTORS classification for this specimen rather than re-asserting "no consumer".',
      priority: 'MUST',
      acceptance_criteria: [
        'ORPHAN_ENTRIES references this specimen via its existing DRAIN_DESCRIPTORS[\'feedback-sla-breach\'] entry, not a duplicate re-declaration',
        'Any count cited for this specimen in code/docs uses a fully-paginated query (fetchAllPaginated), not a PostgREST default-capped read',
      ],
    },
  ],
  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'No new database table',
      description: 'The registry is a frozen JS module (lib/governance/orphan-writers-registry.js), mirroring the existing DRAIN_DESCRIPTORS pattern, not a new Supabase table — avoiding adding a fourth durable-write surface for an SD about too many unread durable writes.',
    },
    {
      id: 'TR-2',
      requirement: 'Structural/observed predicate split',
      description: 'Predicate evaluation mirrors lib/governance/drain-inventory.js: a pure classifyStructural(entry) step (no IO — entry has reader+predicate declared) separate from a classifyObserved(entry, reading) step (IO — the predicate actually returns non-empty against live data).',
    },
    {
      id: 'TR-3',
      requirement: 'adam_advisory via existing writer only',
      description: 'All notifier writes go through scripts/adam-advisory.cjs (or its exported helper) using the established session_coordination payload.kind=\'adam_advisory\' shape. No new table, no new payload.kind value.',
    },
    {
      id: 'TR-4',
      requirement: 'Vitest unit-project compatibility',
      description: 'tests/unit/governance/orphan-writers-registry.test.js must use the .test.js extension (not .test.mjs, which the unit project does not collect per VALIDATION finding) and must not depend on live Supabase credentials, since the unit test project blanks DB creds.',
    },
  ],
  system_architecture: {
    overview:
      'A frozen registry module cross-references two existing partial mechanisms (canonical-write-paths.json for writer-canonicality, DRAIN_DESCRIPTORS for reader/predicate proof) and adds three specimen entries for gaps neither covers. A CLI computes a live, reproducible orphan count from the registry\'s predicates. A notifier reuses the periodic-liveness ladder-escalation two-consecutive-miss pattern to raise adam_advisory rows through the existing coordinator writer, never inventing a new persistence surface.',
    components: [
      'lib/governance/orphan-writers-registry.js (registry module, FR-1)',
      'tests/unit/governance/orphan-writers-registry.test.js (completeness test, FR-2)',
      'scripts/orphan-writers-count.mjs (live count CLI, FR-3, FR-5 self-stamp)',
      'scripts/orphan-writers-notify.mjs (two-window notifier, FR-4)',
    ],
    data_flow:
      'orphan-writers-registry.js (static entries) -> orphan-writers-count.mjs (reads live DB state per entry predicate, computes verdicts, self-stamps periodic_process_registry) -> orphan-writers-notify.mjs (tracks consecutive-miss count per entry via ladder-escalation.mjs RPC pattern, writes adam_advisory via adam-advisory.cjs when threshold hit).',
    integration_points: [
      'lib/governance/gauge-registry.js DRAIN_DESCRIPTORS (imported, not duplicated)',
      'docs/reference/canonical-write-paths.json (read for writer-canonicality cross-reference)',
      'lib/periodic-liveness/ladder-escalation.mjs (incrementConsecutiveMiss/resetConsecutiveMiss reused)',
      'lib/periodic-liveness/stamp-last-fired.js (stampLastFired for FR-5 self-registration)',
      'scripts/adam-advisory.cjs (notifier writer)',
    ],
  },
  test_scenarios: [
    { id: 'TS-1', scenario: 'Registry entry missing predicate', expected: 'orphan-writers-registry.test.js fails on a fixture entry with no predicate declared' },
    { id: 'TS-2', scenario: 'wired-but-blind specimen present', expected: 'ORPHAN_ENTRIES contains the semantic-indexer specimen correctly typed wired-but-blind' },
    { id: 'TS-3', scenario: 'no-stamper-wired specimen present', expected: 'ORPHAN_ENTRIES contains all 7 coordinator standard_loop rows typed no-stamper-wired, matching VALIDATION\'s verified last_fired_at=NULL/self_stamped state' },
    { id: 'TS-4', scenario: 'shipped-but-not-applied specimen present', expected: 'ORPHAN_ENTRIES contains the SD-LEO-INFRA-COMPETITIVE-OBSERVED-TAG-MIGRATION-001 specimen typed shipped-but-not-applied' },
    { id: 'TS-5', scenario: 'Reproducible live count', expected: 'orphan-writers-count.mjs run twice against unchanged DB state returns the identical count both times' },
    { id: 'TS-6', scenario: 'Notifier fires only on second consecutive miss', expected: 'A predicate empty on run 1 produces no advisory; empty again on run 2 (same entry) produces exactly one adam_advisory naming writer/reader/entry_type' },
  ],
  acceptance_criteria: [
    'A unit-tier test enumerates every registered writer and fails on any entry without an acting reader and a consumption predicate (SD success criterion 1)',
    'All three entry types (wired-but-blind, no-stamper-wired, shipped-but-not-applied) are represented with at least one real, VALIDATION-verified specimen (SD success criterion 2)',
    'The known-orphan count is rendered by a script and reproducible from the registry\'s live predicates, not from prose or a hardcoded number (SD success criterion 3, corrects the non-reproducing "93" figure)',
    'A released or silent reader (predicate empty for 2 consecutive windows) produces exactly one adam_advisory naming the writer, reader, and entry type (SD success criterion 4)',
    'The registry\'s own writes (count history, advisory triggers) are themselves registered with a real reader, so the registry cannot become a fourth orphan specimen (SD success criterion 5)',
  ],
  risks: [
    {
      risk: 'Taxonomy overlap with existing DRAIN_DESCRIPTORS causes two competing representations of the same fact',
      mitigation: 'ORPHAN_ENTRIES imports/cross-references existing DRAIN_DESCRIPTORS entries (e.g. feedback-sla-breach) rather than re-declaring them; only genuinely new specimens get net-new entries.',
      rollback_plan: 'ORPHAN_ENTRIES is a standalone module import; deleting it or reverting the commit has zero effect on drain-inventory.js or gauge-registry.js, which remain independently functional.',
    },
    {
      risk: 'Notifier produces advisory spam from a noisy/flapping predicate',
      mitigation: 'Reuses the proven two-consecutive-window gate from lib/periodic-liveness/ladder-escalation.mjs (incrementConsecutiveMiss/resetConsecutiveMiss) rather than firing on every empty read.',
      rollback_plan: 'The notifier script can be removed from its cron/periodic registration independently of the registry and count CLI, which have no dependency on it.',
    },
    {
      risk: 'A hardcoded orphan-count expectation reintroduces the exact defect class (fabricated/unreproducible numbers) this SD exists to eliminate',
      mitigation: 'orphan-writers-count.mjs computes the count live every run and prints the exact predicate used; no test or doc in this PRD asserts a fixed count value (the SD-cited "93" was measured by VALIDATION to not reproduce against 7 plausible predicates and is explicitly not encoded anywhere).',
      rollback_plan: 'N/A — code-only change with no persisted magic-number artifact to roll back.',
    },
  ],
  implementation_approach: {
    phases: [
      { phase: 1, description: 'Build lib/governance/orphan-writers-registry.js cross-referencing canonical-write-paths.json + DRAIN_DESCRIPTORS, seeded with the 3 new specimens (FR-1, FR-6)' },
      { phase: 2, description: 'Write tests/unit/governance/orphan-writers-registry.test.js completeness test (FR-2)' },
      { phase: 3, description: 'Build scripts/orphan-writers-count.mjs live count CLI + self-stamp registration (FR-3, FR-5)' },
      { phase: 4, description: 'Build scripts/orphan-writers-notify.mjs two-window notifier reusing ladder-escalation.mjs (FR-4)' },
    ],
    technical_decisions: [
      'Registry is a code module, not a DB table, per TR-1 (avoids adding a fourth unread durable-write surface)',
      'Reuse existing DRAIN_DESCRIPTORS/ladder-escalation/adam-advisory.cjs mechanisms rather than building parallel ones, per VALIDATION and Explore sub-agent findings',
    ],
  },
  integration_operationalization: {
    consumers: ['Chairman weekly triage line (via orphan-writers-count.mjs output)', 'Coordinator (via adam_advisory rows from the notifier)'],
    dependencies: ['lib/governance/gauge-registry.js', 'lib/governance/drain-inventory.js', 'lib/periodic-liveness/ladder-escalation.mjs', 'lib/periodic-liveness/stamp-last-fired.js', 'scripts/adam-advisory.cjs', 'docs/reference/canonical-write-paths.json'],
    data_contracts: ['ORPHAN_ENTRIES row shape: {id, writer, entry_type, reader, predicate, evidence}'],
    runtime_config: 'No new env vars; runs as a periodic_process_registry-registered script on the existing cron/coordinator cadence.',
    observability_rollout: 'orphan-writers-count.mjs output is the chairman-facing weekly gauge; adam_advisory rows are the coordinator-facing alert path. Both reuse existing observability surfaces, no new dashboard required.',
  },
  exploration_summary: {
    files_read: [
      'lib/governance/gauge-registry.js',
      'lib/governance/drain-inventory.js',
      'tests/unit/governance/canonical-helper-registry-freshness.test.js',
      'docs/reference/canonical-write-paths.json',
      'lib/periodic-liveness/stamp-last-fired.js',
      'lib/periodic-liveness/ladder-escalation.mjs',
      'scripts/periodic-liveness-watcher.mjs',
      'scripts/adam-advisory.cjs',
      'lib/coordinator/adam-advisory-store.cjs',
      'lib/coordinator/feedback-sla-gauge.cjs',
    ],
    patterns_identified: [
      'DRAIN_DESCRIPTORS + drain-inventory.js is a proven reader/predicate registry pattern to extend, not replace',
      'periodic_process_registry writer/reader/predicate triple (stampLastFired / periodic-liveness-watcher.mjs / interval+grace) is a working PASS exemplar',
      'canonical-write-paths.json is the writer-canonicality half; no existing artifact unifies it with the reader-proof half',
      'adam_advisory is a session_coordination payload.kind, not a table',
    ],
    key_decisions: [
      'Build a unifying registry module, not a fourth parallel mechanism',
      'Correct the SD\'s own cited numbers (93 orphan count, 7,073 feedback rows, feedback-category classification) per VALIDATION\'s live measurement before encoding them anywhere',
    ],
    exploration_date: '2026-08-30',
  },
};

async function main() {
  const { error } = await supabase.from('product_requirements_v2').insert(prd);
  if (error) throw error;
  console.log('Inserted PRD', PRD_ID);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
