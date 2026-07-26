#!/usr/bin/env node
/**
 * Write VALIDATION (Principal Systems Analyst) LEAD-phase verdict for
 * SD-EHG-IDEATION-PIPELINE-SEAMS-001 ahead of its LEAD-TO-PLAN handoff.
 *
 * GATE 1 (LEAD Pre-Approval): independent verification of EVERY numeric claim in
 * the SD against the LIVE database (named columns, queries recorded), duplicate /
 * existing-infrastructure check across BOTH repos, backlog validation, and an
 * adversarial attempt to refute the operator's BREAK-3 correction.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/
 * results-storage.js storeSubAgentResults) rather than a hand-rolled INSERT,
 * per CLAUDE.md prologue rule 11. There are NO top-level repo_path/local_path
 * columns — repo evidence lives at metadata.repo_path + executed_from_cwd.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '70f6fc06-e641-4a9b-9273-6a33665f49f0';
const SD_KEY = 'SD-EHG-IDEATION-PIPELINE-SEAMS-001';

const findings = [
  {
    id: 'V1-break3-numeric-claims-CONFIRMED',
    severity: 'INFO',
    summary: 'ALL BREAK-3 aggregate numbers CONFIRMED against live venture_nursery. Query: SELECT count(*), count(*) FILTER (WHERE next_evaluation_at IS NULL), count(*) FILTER (WHERE last_evaluated_at IS NULL), count(*) FILTER (WHERE promoted_to_venture_id IS NOT NULL), count(*) FILTER (WHERE source_type=\'discovery_mode\'), count(*) FILTER (WHERE maturity_level=\'seed\'), min/max(created_at) FROM venture_nursery. Result: total=16; next_evaluation_at IS NULL = 16/16 (CONFIRMED, including the promoted row); last_evaluated_at IS NULL = 15/16 (CONFIRMED "15 of 16 never evaluated"); promoted_to_venture_id NOT NULL = 1 (CONFIRMED "one promotion"); source_type=discovery_mode = 16/16 and distinct source_type = 1 (CONFIRMED); maturity_level=seed = 16/16 (CONFIRMED); created_at spread = 113.6 SECONDS (2026-07-10T19:09:10.784Z -> 19:11:04.388Z), age 15.06 days (CONFIRMED "one batch, exactly 15.0 days ago"). NOTE the SD used a `status` column that does NOT exist on venture_nursery — the live table has no status; parked/promoted is derived from promoted_to_venture_id (see venture-nursery.js:362 statusOf()). The SD\'s underlying counts are nonetheless correct.'
  },
  {
    id: 'V2-break3-score-enumeration-PARTIALLY-CONFIRMED-misleading',
    severity: 'MEDIUM',
    summary: 'SD claim "Unevaluated scores include 90, 74, 65, 65" is TECHNICALLY TRUE but MATERIALLY MISLEADING — it omits the majority of the inventory. Query: SELECT current_score, count(*) FROM venture_nursery WHERE last_evaluated_at IS NULL GROUP BY 1. Actual unevaluated distribution (n=15): 90 x4, 80 x5, 74 x1, 70 x3, 65 x2. The SD enumerates 4 values and silently drops the five 80s and three 70s, understating the parked inventory by more than half. Anyone sizing the opportunity from the SD text will undercount. CORRECTION FOR PRD: 15 unevaluated ideas scoring 65-90, with 9 of 15 at >=80.'
  },
  {
    id: 'V3-the-90-scorer-is-AMBIGUOUS-and-collides-with-a-live-revenue-venture',
    severity: 'CRITICAL',
    summary: 'The SD\'s first deliverable says "Use the 90-scorer" (definite article, singular). THERE ARE FIVE ROWS AT current_score=90.00. Query: SELECT name, current_score, promoted_to_venture_id, last_evaluated_at FROM venture_nursery ORDER BY current_score DESC NULLS LAST. The five: Chronos Concierge, Social Media Post Rephraser, HealScore Predict, Headline Transformer (all unpromoted, never evaluated) and **Image Alt Text Generator** — which is the ONE ALREADY-PROMOTED ROW (promoted_to_venture_id=50763b6a-1fad-4e1e-b2fc-296a1d66ebf9, promoted_at=2026-07-12T20:43:11Z, last_evaluated_at=2026-07-12T11:03:57Z) and is the live first-revenue venture. The SD\'s own statement "the 90 has sat untouched the entire time" is therefore FALSE for one of the five 90s. Because v_nursery_pending_evaluation ORDERs BY current_score DESC NULLS LAST with no tiebreaker, "the top of the list" is NON-DETERMINISTIC across four tied rows. An EXEC agent resolving "the 90-scorer" naively risks selecting the already-promoted revenue venture or a different row on each run. THE PRD MUST NAME THE TARGET ROW BY UUID, not by score.'
  },
  {
    id: 'V4-break3-EMPTY-SELECTION-FOREVER-premise-is-TRUE-of-one-path-and-VACUOUS',
    severity: 'CRITICAL',
    summary: 'ADVERSARIAL REFUTATION ATTEMPT ON THE OPERATOR\'S CORRECTION — the operator asked whether any evaluator queries venture_nursery DIRECTLY with a next_evaluation_at < now() predicate (not the view). ANSWER: YES, ONE EXISTS. lib/eva/stage-zero/venture-nursery.js:289-333 checkNurseryTriggers() selects FROM venture_nursery (direct table, not the view) with .is(\'promoted_to_venture_id\', null), then filters IN JS at line 320: `if (nextReview && new Date(nextReview) <= now)`. The `nextReview &&` guard EXCLUDES NULL. With next_evaluation_at NULL on 16/16, checkNurseryTriggers() returns [] PERMANENTLY. The SD\'s "EMPTY SELECTION FOREVER" is LITERALLY TRUE of this function. HOWEVER the refutation is VACUOUS: checkNurseryTriggers has NO production caller. Grep across lib/ scripts/ src/ api/ server/ tests/ .github/ shows only the barrel re-export at lib/eva/stage-zero/index.js:55 and unit tests (tests/unit/eva/stage-zero/venture-nursery.test.js:319-344). It is never invoked by any scheduler, route, cron, or CLI. So the SD is right about the mechanism and wrong about the consequence: nothing is blocked by it TODAY because the function never runs. It is a LATENT trap, not the active cause.'
  },
  {
    id: 'V5-the-ACTUAL-wired-traversal-ignores-next_evaluation_at-entirely',
    severity: 'CRITICAL',
    summary: 'THE REAL Nursery->Stage-0 TRAVERSAL PATH IS runNurseryReeval() at lib/eva/stage-zero/paths/discovery-mode.js:630-752. Its query (lines 645-650) is: .from(\'venture_nursery\').select(\'id, name, description, maturity_level, current_score, trigger_conditions, source_ref, next_evaluation_at, created_at\').is(\'promoted_to_venture_id\', null).order(\'created_at\', {ascending:true}).limit(candidateCount*2). It SELECTS next_evaluation_at into the column list but NEVER FILTERS OR COMPARES IT — no .lt(), no .lte(), no JS date comparison anywhere in the function. Therefore NULL scheduling does NOT block the wired path: runNurseryReeval would return min(15, candidateCount*2) rows RIGHT NOW. Two further consequences the SD misses: (a) it orders created_at ASCENDING (oldest-first), NOT score-descending — so the 90-scorers are NOT prioritized; the oldest row is "AI-Powered Niche Content Generator" (score 74). (b) THREE selection layers now disagree on the same table: the VIEW is NULL-tolerant (returns 15), checkNurseryTriggers is NULL-intolerant (returns 0 forever), runNurseryReeval ignores the column (returns 15, wrong order). This predicate schism is itself a first-class defect and must be unified in the PRD.'
  },
  {
    id: 'V6-TRUE-ROOT-CAUSE-of-BREAK-3-nursery_reeval-has-never-been-REQUESTED',
    severity: 'CRITICAL',
    summary: 'GROUND-TRUTH ROOT CAUSE, measured not inferred. The chain is: Chairman UI (ehg/src/components/chairman-v3/opportunities/DiscoveryModeDialog.tsx offers strategy "nursery_reeval") -> INSERT stage_zero_requests -> scripts/stage-zero-queue-processor.js queue tick (line 232: `strategy: request.metadata?.strategy || \'trend_scanner\'`) -> executeDiscoveryMode -> runNurseryReeval (discovery-mode.js:134 runner map). Query: SELECT metadata->>\'strategy\', status, count(*), max(created_at) FROM stage_zero_requests GROUP BY 1,2. RESULT: only two strategies have EVER been requested — democratization_finder (1, dismissed, 2026-05-22) and simple_venture (3, dismissed, 2026-05-31). ZERO nursery_reeval requests, ever. Corroborating: SELECT count(*) FROM nursery_evaluation_log = 0 rows (the evaluation log has never been written). CONCLUSION: the nursery does not promote because the only wired traversal is a MANUALLY-TRIGGERED, UI-selected discovery strategy that NOBODY HAS EVER TRIGGERED, and there is NO scheduler that triggers it (no nursery/eval/stage0 workflow exists in .github/workflows/). This is precisely the Chairman\'s own stated acceptance gap — "AUTOMATED AND INTEGRATED, not a tool someone runs."'
  },
  {
    id: 'V7-writer-consumer-asymmetry-explains-the-NULL-column',
    severity: 'HIGH',
    summary: 'WHY next_evaluation_at IS NULL ON 16/16 — identified at source, not guessed. There are TWO writers to venture_nursery. (1) parkVenture() lib/eva/stage-zero/venture-nursery.js:76-140 DOES set next_evaluation_at (line 105) and evaluation_interval_days (line 106). (2) parkFailedCandidate() lib/eva/stage-zero/traversability-gate.js:161-208 does NOT set next_evaluation_at at all — it writes name/description/maturity_level/trigger_conditions/current_score/source_type/source_ref only. Live proof that (2) wrote ALL 16: SELECT source_ref->>\'gate\', source_ref->>\'sd\', count(*), count(*) FILTER (WHERE source_ref ? \'park\'), count(*) FILTER (WHERE source_ref ? \'synthesis_snapshot\') FROM venture_nursery GROUP BY 1,2 returns gate=\'traversability\', sd=\'SD-LEO-INFRA-STAGE0-TRAVERSABILITY-GATE-001\', n=16, has_park_key=0, has_synthesis_snapshot=0. The traversability-gate module header (lines 19-21) states this DELIBERATELY: "venture-nursery.js parkVenture()/runNurseryReeval() are drifted against the live table (flagged separately, feedback ecab6c51) — this module deliberately writes the verified live columns and does not call them." So the ONLY writer that has ever run bypasses the scheduler-setting writer. This is a textbook PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 instance.'
  },
  {
    id: 'V8-break2-scanner-never-wrote-nursery-CONFIRMED-plus-worse',
    severity: 'HIGH',
    summary: 'BREAK 2 CONFIRMED, and the true state is WORSE than the SD states. (a) "Scanner has never written a nursery row" — CONFIRMED by provenance, not just by counting: scripts/market-signal-scan.mjs:209 nominates via parkVentureFn (parkVenture), which stores scanner attribution at source_ref.synthesis_snapshot (parkVenture line 127). Live: ZERO of 16 rows have a synthesis_snapshot key and ZERO have a park key; all 16 carry gate=traversability. Independently corroborated by time: max(fetched_at) on market_signal_observations = 2026-07-20, while ALL 16 nursery rows were created 2026-07-10 — every nursery row PREDATES every observation. (b) WORSE: the scanner\'s AUTOMATION has never fired. Query: SELECT process_key, last_fired_at, last_state FROM periodic_process_registry. Row \'gha_cron:market-signal-scan.yml\' has last_fired_at = NULL, last_state = UNVERIFIED — the weekly GitHub Actions cron (13 9 * * 1) HAS NEVER RUN. The sibling row \'market-signal-scan\' shows last_fired_at 2026-07-20T11:55:26.413Z, matching max(fetched_at) exactly — i.e. all 4 observed scan cycles were MANUAL/local invocations, not scheduled ones. The SD calls this seam "unproven rather than broken"; the automation leg is measurably DEAD, which is stronger.'
  },
  {
    id: 'V9-break2-hidden-DDL-blocker-source_type-CHECK-has-no-scanner-value',
    severity: 'HIGH',
    summary: 'UNDISCLOSED BLOCKER the SD does not mention. venture_nursery has CHECK constraint venture_nursery_source_type_check: source_type = ANY (ARRAY[\'brainstorm\',\'todoist\',\'youtube\',\'competitor_analysis\',\'discovery_mode\',\'manual\']). There is NO scanner / market_signal member. parkVenture maps via toNurserySourceType() (venture-nursery.js:47-51) which returns \'discovery_mode\' | \'competitor_analysis\' | \'manual\' only. CONSEQUENCE 1: a scanner-written row is INDISTINGUISHABLE from a traversability-gate row by source_type — both land as discovery_mode. BREAK 2\'s acceptance test therefore CANNOT use source_type to prove the scanner wrote a row; it must assert on source_ref.synthesis_snapshot.source / run_id / sd_key. CONSEQUENCE 2: giving the scanner honest provenance requires an ALTER TABLE ... DROP/ADD CONSTRAINT — a DDL migration. Per LEO work-item routing, schema keywords force Tier 3, and DDL is chairman-gated. This must be pre-flagged at LEAD, not discovered at EXEC.'
  },
  {
    id: 'V10-break1-triangulation-claims-ALL-CONFIRMED-via-family-column',
    severity: 'INFO',
    summary: 'BREAK 1 fully re-verified using the REAL column name. The SD/operator could not find `signal_family` because the column is `family` (market_signal_observations: id, source, query_term, family, raw_value, content_hash, fetched_at, transform_version, created_at). Queries and results: (1) SELECT count(*), count(DISTINCT source), count(DISTINCT query_term), count(DISTINCT family) FROM market_signal_observations -> 40 / 1 / 5 / 2 — CONFIRMS "40 observations", "one source", "5 query terms". (2) SELECT source, count(*) GROUP BY 1 -> wordpress_plugins = 40 — CONFIRMS the single source is wordpress_plugins. (3) SELECT family, count(*) GROUP BY 1 -> money_in=20, stickiness=20 — CONFIRMS "money_in 20 and stickiness 20". (4) SELECT query_term, count(DISTINCT family) AS families_agreeing GROUP BY 1 ORDER BY 2 DESC -> ALL FIVE terms return exactly 2 (ai meeting notes, field service scheduling, invoice reminder automation, podcast transcription, shopify inventory sync) — CONFIRMS "max families agreeing on any single term = 2" and "terms reaching the 3-family bar = ZERO". (5) attention and structural have ZERO rows — CONFIRMS "ATTENTION and STRUCTURAL absent entirely". (6) "two of the design FOUR" is confirmed at SCHEMA level, not merely by convention: CHECK constraint market_signal_observations_family_check restricts family to exactly [money_in, stickiness, structural, attention].'
  },
  {
    id: 'V11-break1-bar-unreachable-CONFIRMED-at-source-but-root-cause-is-MISATTRIBUTED',
    severity: 'HIGH',
    summary: 'The rule is CONFIRMED at source: lib/market-signal-scanner/scoring.js:33-34 TRIANGULATION_MIN_DISTINCT_FAMILIES=3, TRIANGULATION_REQUIRED_ANY_OF=[\'money_in\',\'stickiness\']; line 139-140 triangulationPassed = distinctFamilyCount >= 3 && hasRequiredFamily. With max 2 distinct families live, the gate can NEVER pass — "UNREACHABLE BY CONSTRUCTION" CONFIRMED. BUT the SD frames this as "COLLECTOR CANNOT TRIANGULATE", implying a collector/scoring defect. THE SCORING RULE IS CORRECT AND SHOULD NOT BE TOUCHED. The real cause is SOURCE COVERAGE: the family->source mapping is one-to-many-from-three-fetchers — sources/wordpress-plugins.js:159-165 emits money_in AND stickiness (2 families); sources/reddit.js:179,189 emits structural (1 family); sources/google-trends.js:200,210 emits attention (1 family). Only wordpress_plugins has ever written. So BREAK 1 decomposes into TWO UNRELATED defects: (i) STRUCTURAL missing because reddit.js ships INERT by design pending REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET (reddit.js:12-15,125-132; .github/workflows/market-signal-scan.yml:36-39 documents them as unset secrets) — this needs a HUMAN to register a free Reddit OAuth app, i.e. it is HUMAN-GATED and not AI-completable; (ii) ATTENTION missing because google-trends.js has NO credential gate but returns {readings:[], errors} on ~10 distinct runtime failure paths (lines 87-176) — it is failing at RUNTIME and needs debugging, with a real risk that Google Trends is unobtainable without a paid API. Enabling EITHER one alone reaches 3 families and unblocks the bar. Framing this as a collector fix will send EXEC to the wrong file.'
  },
  {
    id: 'V12-view-has-ZERO-consumers-CONFIRMED-both-repos',
    severity: 'HIGH',
    summary: 'Operator claim "a repo-wide grep for v_nursery_pending_evaluation returns ZERO consumers" — CONFIRMED across BOTH repos. EHG_Engineer (C:/Users/rickf/Projects/_EHG/EHG_Engineer): the only hits are database/migrations/20260209_stage0_venture_entry_schema.sql:543,556 (the CREATE VIEW + COMMENT), database/migrations/20260211_fix_security_definer_views_and_rls.sql:88 (a name in a security-definer remediation list), and two schema-reference-snapshot.json entries. No .from(), no SELECT, no route, no script. EHG app (C:/Users/rickf/Projects/_EHG/ehg): the name appears ONLY in generated Supabase typings (src/integrations/supabase/types.ts:25902, 26370, 59811, 59837-59887). No .from("v_nursery_pending_evaluation") anywhere. Also confirmed in the EHG app: venture_nursery itself is never READ — its only statement is an FK detach on delete (supabase/migrations/20260307_002_create_delete_venture_rpc.sql:61 UPDATE venture_nursery SET promoted_to_venture_id = NULL WHERE promoted_to_venture_id = p_venture_id). The user-facing "Nursery" UI (src/hooks/useNurseryVentures.ts:22-26) reads the VENTURES table WHERE status=\'paused\' — a completely different data set. The view definition itself was verified live via pg_get_viewdef and matches the operator\'s quote verbatim, returning 15 rows.'
  },
  {
    id: 'V13-DUPLICATE-first-deliverable-driver-ALREADY-EXISTS',
    severity: 'CRITICAL',
    summary: 'GATE 1 DUPLICATE CHECK — POSITIVE HIT. The SD\'s "FIRST DELIVERABLE ... PROVE ONE ALREADY-SEEDED IDEA TRAVERSES NURSERY -> STAGE-0 ... Demonstrated by execution" is ALREADY IMPLEMENTED as scripts/one-off/run-nursery-reeval.mjs (67 LOC, from SD-LEO-INFRA-STAGE0-ENVELOPE-REGISTRATION-001 FR-7/FR-8). It calls executeDiscoveryMode({strategy:\'nursery_reeval\', constraints:{}, candidateCount:20}) directly and prints the traversability pass/fail slate. Its own header states the exact gap this SD rediscovered: "nursery_reeval has no standalone entry point today -- only reachable via scripts/stage-zero-queue-processor.js\'s queue tick." Building a new driver would duplicate ~8-10 hours. RECOMMENDATION: the first deliverable should RUN this existing script (or promote it out of one-off/ into a supported entry point) and capture its output as evidence, NOT write a new traversal harness. This is exactly the SD-UAT-020 reuse pattern.'
  },
  {
    id: 'V14-COSMETIC-SATISFACTION-RISK-precedent-already-exists-in-this-table',
    severity: 'CRITICAL',
    summary: 'THE OPERATOR\'S GHOST-COMPLETION FEAR IS NOT HYPOTHETICAL — IT HAS ALREADY HAPPENED ONCE IN THIS EXACT TABLE, AND IT IS DOCUMENTED IN THE REPO. scripts/backfill-venture-nursery-promotion-links.mjs lines 17-20 state verbatim: "Live-data check at authoring time (2026-07-12): 16 total venture_nursery rows, 1 already stamped (VIA AN OUT-OF-BAND MANUAL PATCH, NOT BY ANY REPEATABLE CODE PATH), the other 15 unpromoted..." That single stamped row is Image Alt Text Generator — the same 90-scorer the SD points EXEC at. The SD\'s own SHARPENING section reaches the right conclusion ("the seam has carried ZERO traffic") but by the wrong evidence (it infers this from next_evaluation_at being NULL; the actual proof is this source comment). FOUR NAMED COSMETIC-SATISFACTION VECTORS the PRD must forbid by acceptance criteria: (1) direct UPDATE venture_nursery SET promoted_to_venture_id=... — the precedent path; (2) running scripts/backfill-venture-nursery-promotion-links.mjs --apply, which is a NAME-MATCH HEURISTIC UPDATE (lines 48-63, 106-111) and is explicitly documented as "HEURISTIC, not exact" — it would stamp a promotion link WITHOUT any traversal occurring; (3) calling lib/eva/stage-zero/chairman-review.js:54-57 stampNurseryPromotion() in isolation, which is a bare guarded UPDATE of promoted_to_venture_id/promoted_at; (4) selecting Image Alt Text Generator as "the 90-scorer" and declaring the ALREADY-EXISTING stamp to be the proof. ACCEPTANCE MUST BE: a NEW row transitions, evidenced by (a) a nursery_evaluation_log row (table currently has 0 rows — a clean, unfalsifiable baseline), (b) a stage_zero_requests row with metadata.strategy=\'nursery_reeval\' (currently ZERO such rows ever — equally clean baseline), and (c) a ventures row whose creation timestamp postdates the request. All three counters are at zero today, which makes them ideal tamper-evident witnesses.'
  },
  {
    id: 'V15-GATE1-BLOCKER-zero-backlog-items',
    severity: 'CRITICAL',
    summary: 'GATE 1 BACKLOG VALIDATION FAILS. Query: SELECT count(*) FROM sd_backlog_map WHERE sd_id IN (\'SD-EHG-IDEATION-PIPELINE-SEAMS-001\', \'70f6fc06-e641-4a9b-9273-6a33665f49f0\') -> 0. The SD has ZERO backlog items. Per the documented GATE 1 rule (and the SD-EXPORT-001 precedent: approved with 0 backlog items -> scope ambiguity -> late-stage rework), an SD cannot move to status=\'active\' without >=1 backlog item. This is a hard, mechanical blocker independent of the diagnostic findings above and must be cleared before LEAD-TO-PLAN completes. Given the three-seam structure, the natural decomposition is one backlog item per seam plus one for the predicate-schism unification.'
  },
  {
    id: 'V16-scope-shape-ONE-SD-with-sequenced-FRs-not-three-children',
    severity: 'HIGH',
    summary: 'GATE 1 SCOPE ASSESSMENT. The SD explicitly forbids staffing as three independent items ("they would land in whatever order they get picked up"). That instruction is SOUND and is corroborated by the dependency measurements: BREAK 1\'s output (a triangulated nomination) flows through parkVenture, whose rows DO carry next_evaluation_at — so BREAK 1 nominations would be invisible to checkNurseryTriggers-style consumers ONLY if the predicate schism (V5) is left unfixed; and BREAK 2\'s honest-provenance need (V9) requires the DDL that BREAK 1\'s nominations would then depend on for attribution. However "one SD" vs "orchestrator+children" is NOT the same question as "independent items". RECOMMENDATION: ONE SD with STRICTLY SEQUENCED FRs and a hard gate between them — NOT an orchestrator with parallel children (children get claimed in parallel by the fleet, which reintroduces exactly the ordering loss the Chairman forbade), and NOT three sibling SDs. LOC feasibility supports this: the corrected BREAK 3 fix is small (wire a scheduled nursery_reeval request-enqueuer + unify three predicates, est. 60-120 LOC), BREAK 2 is a DDL migration + provenance assertion (est. 40-80 LOC), BREAK 1 is credential provisioning + one fetcher debug (est. 20-60 LOC + a human action). Each FR lands as its own <=100 LOC PR under one SD, preserving order via FR sequencing rather than via SD decomposition. If the fleet requires parallelism, an orchestrator is acceptable ONLY with explicit min-dependency edges child1->child2->child3 encoded so no child can be claimed out of order.'
  },
  {
    id: 'V17-seam-ORDER-still-holds-but-for-a-DIFFERENT-reason',
    severity: 'HIGH',
    summary: 'GATE 1 ORDER ASSESSMENT — the mandated back-to-front order SURVIVES the corrected BREAK 3 diagnosis, but the justification changes and one refinement is required. ORIGINAL justification: "nothing is scheduled, so any evaluator finds nothing" — that is now known to be true only of an UNCALLED function (V4) and false of the wired path (V5). CORRECTED justification for keeping promotion first: the wired traversal has never been REQUESTED even once (V6, zero nursery_reeval rows in stage_zero_requests) and there is no scheduler, so any nomination produced by fixing BREAK 2 or BREAK 1 would land in venture_nursery and sit exactly as the current 16 do. The SD\'s stated consequence — "repairing the collector first produces NOMINATIONS THAT GO NOWHERE" — is INDEPENDENTLY CONFIRMED and remains the correct sequencing argument. Fixing "no consumer" first therefore DOES still unblock 2 then 1. REQUIRED REFINEMENT: BREAK 3 must be widened from "prove one traversal" to "prove one traversal AND unify the three disagreeing selection predicates (view / checkNurseryTriggers / runNurseryReeval)". Without the unification, a later engineer who wires the obvious-looking checkNurseryTriggers() will ship a permanently-empty sweep that LOOKS correct and passes review — the SD\'s original EMPTY-SELECTION-FOREVER prediction would then come true as a REGRESSION INTRODUCED BY THE FIX ITSELF. Ordering within BREAK 3: unify predicates + set next_evaluation_at on the traversability-gate writer BEFORE wiring any scheduler.'
  },
  {
    id: 'V18-LEAD-readiness-PRD-writability',
    severity: 'MEDIUM',
    summary: 'GATE 1 PRD-WRITABILITY. The SD is NOT yet PRD-writable as authored, for four mechanical reasons, all fixable at LEAD: (1) zero backlog items (V15); (2) the first deliverable\'s target is ambiguous — "the 90-scorer" resolves to 5 rows, one of them already promoted (V3); (3) the BREAK 3 causal claim is wrong in mechanism, so acceptance criteria derived from it would test the wrong thing — a PRD that says "set next_evaluation_at so the evaluator selects" would pass while the pipeline stays dead, because the wired evaluator ignores that column (V5); (4) BREAK 1\'s true remediation includes a HUMAN-GATED credential action (Reddit OAuth app registration) that no AI agent can complete, so the SD needs an explicit human-dependency flag or BREAK 1 must be scoped to google_trends only (V11). Additionally the description and scope columns are BYTE-IDENTICAL for the first 3052 characters (description 3861 chars, scope 3052) — scope is a truncated copy of description carrying no distinct scope statement, no explicit out-of-scope list, and no acceptance criteria. Every other input a PRD needs (measured baselines, named files, named columns, dependency order) is now available in this evidence row.'
  },
  {
    id: 'V19-infrastructure-reuse-inventory',
    severity: 'INFO',
    summary: 'GATE 1 EXISTING-INFRASTRUCTURE CHECK — substantial reusable infrastructure exists; this SD should be mostly WIRING, not building. Reusable as-is: scripts/one-off/run-nursery-reeval.mjs (traversal driver, V13); lib/eva/stage-zero/paths/discovery-mode.js runNurseryReeval (the traversal itself, working); scripts/stage-zero-queue-processor.js (queue tick, already dispatches by metadata.strategy and already runs under leo-stack per scripts/leo-stack.ps1|sh); stage_zero_requests table (the enqueue surface — needs only a producer); nursery_evaluation_log table (exists, 0 rows, ready as an evidence sink); periodic_process_registry + lib/periodic-liveness/stamp-last-fired.js (the liveness pattern the scanner already uses, directly copyable for a nursery sweep); v_nursery_pending_evaluation (correct NULL-tolerant selection, needs only a consumer); lib/market-signal-scanner/* (complete 3-source/4-family scanner; only credentials and one runtime bug stand between it and a live triangulation). NOT needed: a new evaluator, a new scheduler framework, a new nursery schema, or any change to scoring.js.'
  },
];

const warnings = [
  {
    severity: 'CRITICAL',
    issue: 'SD has 0 backlog items (sd_backlog_map) — GATE 1 blocking; SD cannot reach status=active.',
    recommendation: 'Create >=4 backlog items before completing LEAD-TO-PLAN: one per seam plus one for the selection-predicate unification.',
  },
  {
    severity: 'CRITICAL',
    issue: 'BREAK 3 mechanism is misdiagnosed. Acceptance criteria derived from "nothing is scheduled, so the evaluator selects nothing" would validate the wrong behaviour — the wired evaluator (runNurseryReeval) never reads next_evaluation_at.',
    recommendation: 'Rewrite BREAK 3 in the PRD as: (a) unify three disagreeing selection predicates, (b) make the traversability-gate writer set next_evaluation_at, (c) enqueue a scheduled nursery_reeval stage_zero_request. Do not accept "next_evaluation_at is now populated" as evidence of a working seam.',
  },
  {
    severity: 'CRITICAL',
    issue: '"Use the 90-scorer" is ambiguous across 5 rows, one of which is the already-promoted live first-revenue venture (Image Alt Text Generator).',
    recommendation: 'Name the target nursery row by UUID in the PRD. Explicitly exclude promoted_to_venture_id IS NOT NULL rows from the traversal demonstration.',
  },
  {
    severity: 'CRITICAL',
    issue: 'Cosmetic-satisfaction of the first deliverable is highly reachable via four named paths, one of which (an out-of-band manual UPDATE) is the documented provenance of the ONLY existing promotion in this table.',
    recommendation: 'Acceptance must require a new stage_zero_requests row with metadata.strategy=nursery_reeval, a new nursery_evaluation_log row, and a ventures row created after the request. All three counters are at 0 today, making them tamper-evident. Explicitly forbid backfill-venture-nursery-promotion-links.mjs --apply and bare stampNurseryPromotion() as evidence.',
  },
  {
    severity: 'HIGH',
    issue: 'BREAK 2 requires an undisclosed DDL migration (venture_nursery_source_type_check has no scanner member), which forces Tier 3 and is chairman-gated.',
    recommendation: 'Pre-flag the DDL at LEAD. Until it lands, BREAK 2 acceptance must assert on source_ref.synthesis_snapshot, not source_type.',
  },
  {
    severity: 'HIGH',
    issue: 'BREAK 1 remediation includes a HUMAN-GATED action (register a free Reddit OAuth app to supply REDDIT_CLIENT_ID/SECRET). No AI agent can complete it.',
    recommendation: 'Either flag the human dependency explicitly on the SD, or scope BREAK 1 to repairing the google_trends fetcher only (attention family), which alone reaches the 3-family bar.',
  },
  {
    severity: 'MEDIUM',
    issue: 'SD scope column is a byte-identical truncated copy of description; no distinct scope, out-of-scope list, or acceptance criteria exists.',
    recommendation: 'Author a real scope statement with explicit out-of-scope (e.g. "scoring.js triangulation rule is NOT to be changed").',
  },
  {
    severity: 'MEDIUM',
    issue: 'SD claim "Unevaluated scores include 90, 74, 65, 65" understates inventory by omitting five 80s and three 70s.',
    recommendation: 'Correct to: 15 unevaluated ideas scoring 65-90, 9 of them >=80.',
  },
];

const recommendations = [
  'CLEAR THE GATE 1 BLOCKER: create >=4 sd_backlog_map items before completing LEAD-TO-PLAN.',
  'KEEP the back-to-front seam order (3 -> 2 -> 1); it survives verification, but replace the justification with the measured one: zero nursery_reeval requests have ever been enqueued and no scheduler exists.',
  'RESCOPE BREAK 3 to three sequenced sub-items: (1) unify the three disagreeing selection predicates onto the NULL-tolerant view semantics; (2) make parkFailedCandidate set next_evaluation_at/evaluation_interval_days like parkVenture does; (3) add a scheduled producer that enqueues a nursery_reeval stage_zero_request. Order matters: 1 and 2 BEFORE 3, or the scheduler ships a permanently-empty sweep.',
  'REUSE scripts/one-off/run-nursery-reeval.mjs for the first deliverable rather than building a new traversal harness (~8-10 hrs saved).',
  'NAME THE TARGET ROW BY UUID; exclude already-promoted rows from the demonstration.',
  'MAKE THE FIRST DELIVERABLE TAMPER-EVIDENT: require new rows in stage_zero_requests (strategy=nursery_reeval), nursery_evaluation_log, and ventures. All three are at 0/never today.',
  'STAFF AS ONE SD WITH SEQUENCED FRs, not three siblings and not a parallel-children orchestrator. If an orchestrator is required, encode hard child1->child2->child3 dependency edges.',
  'PRE-FLAG the chairman-gated DDL (venture_nursery source_type CHECK) for BREAK 2 now, at LEAD.',
  'REFRAME BREAK 1 from "collector cannot triangulate" to "2 of 3 source fetchers have never produced an observation". Do NOT modify lib/market-signal-scanner/scoring.js — the triangulation rule is correct.',
  'FLAG the Reddit OAuth human dependency, or descope BREAK 1 to google_trends.',
  'ADD a fourth, unstated seam to scope consideration: the scanner GHA cron (gha_cron:market-signal-scan.yml) has last_fired_at=NULL and has never run. The Chairman asked for AUTOMATED; a never-firing cron defeats BREAK 2 even if the nursery write works.',
];

const summary = 'GATE 1 VALIDATION for SD-EHG-IDEATION-PIPELINE-SEAMS-001. Every numeric claim in the SD was re-measured against the live consolidated database with named columns. ALL BREAK-1 and BREAK-2 numbers CONFIRMED; ALL BREAK-3 aggregate numbers CONFIRMED. However the BREAK-3 CAUSAL MECHANISM is REFUTED: the wired Nursery->Stage-0 traversal (runNurseryReeval, discovery-mode.js:630) never reads next_evaluation_at, so NULL scheduling is not what blocks promotion. The operator\'s correction is substantially right but needs one amendment: an evaluator with the SD\'s exact NULL-intolerant predicate DOES exist (checkNurseryTriggers, venture-nursery.js:320) — it simply has no caller, making the SD\'s premise true-but-vacuous rather than false. The measured root cause is that ZERO nursery_reeval requests have ever been enqueued in stage_zero_requests and no scheduler exists. Three selection layers disagree on the same table. The first deliverable is already implemented (run-nursery-reeval.mjs) and is cosmetically satisfiable via four named paths, one of which is the documented provenance of the only existing promotion. GATE 1 BLOCKS on 0 backlog items.';

const justification = [
  'VERDICT: CONDITIONAL_PASS at confidence 92.',
  '',
  'The SD\'s STRATEGIC THESIS SURVIVES VERIFICATION: three seams exist, the collector really is the smallest, and the back-to-front order is correct. Every headline number is accurate. That is a materially better-evidenced SD than most that reach LEAD, and it should proceed.',
  '',
  'It is CONDITIONAL, not PASS, for three independent reasons. (1) MECHANICAL BLOCKER: zero sd_backlog_map items, which prevents status=active and is non-negotiable. (2) DIAGNOSTIC DEFECT: the BREAK-3 causal chain is wrong in a way that would produce a PRD testing the wrong behaviour — acceptance criteria written from "nothing is scheduled so the evaluator finds nothing" can be fully satisfied while the pipeline remains dead, because the evaluator that actually runs ignores the column in question. (3) INTEGRITY RISK: the first deliverable is cosmetically satisfiable, and the precedent is not hypothetical — the single existing promotion in this table is documented in-repo as "an out-of-band manual patch, not by any repeatable code path", and it happens to be one of the five rows matching the SD\'s own "use the 90-scorer" instruction.',
  '',
  'I attempted the refutation the operator asked for and PARTIALLY SUCCEEDED AGAINST THEM: checkNurseryTriggers does query venture_nursery directly with an effective next_evaluation_at <= now() predicate that excludes NULL, exactly as the SD describes. The operator\'s blanket claim that "empty selection forever is FALSE" is therefore too strong. But the finding does not rescue the SD, because that function has no production caller, and the function that IS wired does not use the predicate at all. Both parties were reasoning from one selection layer each; there are three, and they disagree. That schism is the finding neither the SD nor the operator had, and it is the one most likely to cause a regression during the fix.',
  '',
  'Confidence is 92 rather than higher because two questions remain open that only execution can close: whether the google_trends fetcher failure is a transient/network issue or a hard unavailability (I read its ~10 failure-return paths but did not execute it), and whether runNurseryReeval\'s LLM step actually yields promotable candidates against the current capability envelope (run-nursery-reeval.mjs exists precisely to answer this and has not been run in this session). Neither uncertainty affects the blocking findings.',
].join('\n');

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 92,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [
      'GATE 1 BLOCKER: 0 backlog items in sd_backlog_map — SD cannot reach status=active.',
      'BREAK 3 causal mechanism REFUTED: runNurseryReeval (the only wired traversal) never filters on next_evaluation_at; NULL scheduling does not block promotion.',
      '"The 90-scorer" resolves to 5 rows, one of which is the already-promoted live first-revenue venture (Image Alt Text Generator).',
      'First deliverable is cosmetically satisfiable via 4 named paths; the sole existing promotion is documented in-repo as an out-of-band manual patch.',
      'Undisclosed chairman-gated DDL required for BREAK 2 (venture_nursery source_type CHECK has no scanner member).',
    ],
    conditions: [
      'Create >=4 sd_backlog_map items before LEAD-TO-PLAN completes.',
      'Correct the BREAK 3 diagnosis in the SD/PRD to the measured root cause (zero nursery_reeval requests ever enqueued; no scheduler) and add predicate unification as an explicit deliverable.',
      'Name the traversal target nursery row by UUID and exclude promoted rows.',
      'Define tamper-evident acceptance: new rows in stage_zero_requests (strategy=nursery_reeval) + nursery_evaluation_log + ventures; explicitly forbid backfill --apply and bare stampNurseryPromotion() as evidence.',
      'Pre-flag the BREAK 2 DDL as chairman-gated.',
      'Flag the Reddit OAuth human dependency or descope BREAK 1 to google_trends.',
    ],
    metadata: {
      gate: 'GATE_1_LEAD_PRE_APPROVAL',
      validation_type: 'claim_verification_duplicate_check_and_scope_assessment',
      claims_confirmed: 14,
      claims_refuted: 2,
      claims_partially_confirmed: 2,
      claims_unverifiable: 0,
      backlog_items_found: 0,
      duplicate_implementations_found: 1,
      model: 'Opus 5 (1M context)',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
      e2e_applicable: false,
      e2e_exemption_reason: 'LEAD pre-approval claim verification against live DB + source reading; no implementation exists yet to test.',
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      tables_queried: ['venture_nursery', 'market_signal_observations', 'v_nursery_pending_evaluation', 'nursery_evaluation_log', 'stage_zero_requests', 'periodic_process_registry', 'sd_backlog_map', 'strategic_directives_v2', 'information_schema.columns', 'pg_constraint', 'pg_trigger'],
      columns_corrected: {
        'venture_nursery.status': 'DOES NOT EXIST — parked/promoted derived from promoted_to_venture_id',
        'market_signal_observations.signal_family': 'DOES NOT EXIST — the column is `family`',
      },
      claim_verdicts: {
        'nursery 16 rows': 'CONFIRMED',
        'next_evaluation_at NULL 16/16': 'CONFIRMED',
        '15/16 never evaluated': 'CONFIRMED',
        '1 promotion in 15 days': 'CONFIRMED',
        'all discovery_mode + seed': 'CONFIRMED',
        'one batch 15.0 days ago': 'CONFIRMED (113.6s spread)',
        'unevaluated scores 90/74/65/65': 'PARTIALLY CONFIRMED — omits 80x5 and 70x3',
        'EMPTY SELECTION FOREVER': 'REFUTED as stated — true only of uncalled checkNurseryTriggers; wired path ignores the column',
        'the 90-scorer sat untouched': 'REFUTED — 5 rows at 90; one is promoted and was evaluated 2026-07-12',
        'scanner never wrote a nursery row': 'CONFIRMED (provenance + chronology)',
        '40 observations': 'CONFIRMED',
        'money_in 20 / stickiness 20': 'CONFIRMED',
        '1 source (wordpress_plugins)': 'CONFIRMED',
        '5 query terms': 'CONFIRMED',
        'max families per term = 2': 'CONFIRMED',
        'terms reaching 3-family bar = 0': 'CONFIRMED',
        'attention + structural absent': 'CONFIRMED',
        'bar unreachable by construction': 'CONFIRMED (scoring.js:33-34,139-140) — but root cause is source coverage, not the rule',
        'view returns 15 rows, 90-scorer first': 'CONFIRMED',
        'view has zero consumers': 'CONFIRMED both repos',
      },
    },
    phase: 'LEAD',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { name: 'Principal Systems Analyst (validation-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
