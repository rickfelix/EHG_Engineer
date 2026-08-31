import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-PHASE-DESIGN-OKR-001';

const description = `Phase-0 design (design-only, no production code) settling the unknowns blocking a genuine "OKR-driven prioritization + day-28 hard stop" build, sourced via Solomon's STEP-0 vision-gauge shortlist (weakest process-layer capability, 0.0). LEAD-phase measurement corrected the SD's own condition ("design cites existing okrs/key_results tables as substrate") -- there is no "okrs" table; the real substrate is objectives + key_results (43 rows live). Found: (1) TWO parallel, undocumented, partially-duplicated OKR-priority mechanisms already exist (scripts/lib/priority-scorer.js, wired into sd:next's SDNextSelector via an inline re-implementation, and scripts/wsjf-priority-fetcher.js, wired into npm run prio:top3) with no reconciliation between them; (2) scripts/okr-priority-sync.js exists and would persist an OKR-driven priority_score to strategic_directives_v2, but is NOT scheduled anywhere (no cron, no workflow) -- dormant since authorship; (3) key_results already contains the exact spec for "day-28 hard stop" as one of 3 stages of KR-GOV-3.3 "Monthly OKR automation operational" (day 1-5 draft OKR generation, day 15 chairman review, day 28 hard-stop SD creation) -- currently 0 of 3 stages running; (4) the capability's own tracking KR (KR-2026-02-01 "Improve okr_driven_prioritization score from 60% to 80%") is itself at_risk.`;

const scope = `IN SCOPE (design-only deliverable, no production code touched):
- Author docs/design/okr-driven-prioritization-day28-design.md settling 3 unknowns: (a) which of the two existing prioritization mechanisms (priority-scorer.js/SDNextSelector vs wsjf-priority-fetcher.js/prio:top3) should be authoritative, and how/whether to reconcile the SDNextSelector's DUPLICATED inline re-implementation of priority-scorer.js logic (a drift risk: the two copies can silently diverge); (b) what activates scripts/okr-priority-sync.js (currently unscheduled) -- cron cadence, trigger conditions, and how it should interact with SDNextSelector's live ranking rather than just writing a stale priority_score column; (c) the concrete automation design for KR-GOV-3.3's 3 stages (day 1-5 draft OKR generation, day 15 chairman review scheduling, day 28 hard-stop SD creation), building on the already-specified KR rather than inventing new terminology.
- Propose a decomposition into 2-3 buildable child SDs, following the established Phase-0 design pattern (see docs/design/competitive-vigilance-observed-baseline-design.md as the template).
- Correct the SD's own condition text (okrs -> objectives+key_results) so future readers don't chase a table that doesn't exist.
OUT OF SCOPE:
- Any code change to priority-scorer.js, wsjf-priority-fetcher.js, SDNextSelector.js, or okr-priority-sync.js -- those are child-SD implementation work, not this design pass.
- Scheduling okr-priority-sync.js as a cron job -- a design recommendation only; activation is a build-phase decision for a child SD.
- The KR3.1-HARD-STOP "Hard stop at 11:00 PM" key result -- verified unrelated (a different, nightly time-based hard stop, not the day-28-of-month OKR cycle hard stop this SD is about).`;

const key_changes = [
  { change: 'Author docs/design/okr-driven-prioritization-day28-design.md', impact: 'Settles which prioritization mechanism is authoritative, what activates okr-priority-sync.js, and the concrete day-28 automation design; proposes child-SD decomposition.' },
  { change: 'Correct the SD condition text from a nonexistent "okrs" table to the real objectives+key_results substrate', impact: 'Prevents a future reader from chasing a table that does not exist.' }
];

const success_criteria = [
  { criterion: 'The design doc identifies and reconciles (or explicitly defers reconciling, with a named reason) the two existing prioritization mechanisms', measure: 'Doc explicitly names scripts/lib/priority-scorer.js, scripts/wsjf-priority-fetcher.js, and SDNextSelector.js\'s duplicated inline logic, with a recommendation.' },
  { criterion: 'The design doc grounds the day-28 hard-stop design in the already-specified KR-GOV-3.3, not invented terminology', measure: 'Doc quotes KR-GOV-3.3\'s exact 3-stage description (day 1-5, day 15, day 28) and its current 0/3 status.' },
  { criterion: 'The design doc proposes a concrete, reviewable child-SD decomposition', measure: '2-3 named child SDs with a one-paragraph scope each, following the docs/design/competitive-vigilance-observed-baseline-design.md template shape.' }
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'Open docs/design/okr-driven-prioritization-day28-design.md.', expected_outcome: 'Document exists, is well-formed markdown, and cites the live-measured substrate (objectives/key_results row counts, KR-GOV-3.3 exact text, the two prioritization mechanisms) rather than assumed facts.' },
  { step_number: 2, instruction: 'Verify no production code file was modified by this SD.', expected_outcome: 'git diff shows only the design doc and this SD one-off/evidence scripts touched.' }
];

async function main() {
  const { data: existing } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  const metadata = {
    ...(existing?.metadata || {}),
    lead_enrichment: 'Measured directly against live DB before authoring scope. Corrected the SD condition\'s "okrs/key_results" substrate claim -- no okrs table exists; real substrate is objectives+key_results (43 rows). Found 2 parallel prioritization mechanisms with no reconciliation, a dormant sync script, and the day-28 hard-stop already specified in KR-GOV-3.3 (0/3 stages built).'
  };
  const { error } = await supabase.from('strategic_directives_v2')
    .update({ description, scope, key_changes, success_criteria, smoke_test_steps, metadata, scope_reduction_percentage: 0 })
    .eq('sd_key', SD_KEY);
  if (error) throw error;
  console.log('OK enriched', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
