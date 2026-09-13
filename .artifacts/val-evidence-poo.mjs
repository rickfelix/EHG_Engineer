import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001';

const critical_issues = [
  {
    id: 'VAL-POO-1',
    severity: 'CRITICAL',
    title: 'Live-outcome success criterion is unreachable by recorded chairman ruling and zero provisioning — must be reframed at PLAN',
    summary: "Two of this SD's success criteria ('evaluateGraduation has run at least once from a recorded live outcome, mode=live' and smoke step 'run the observer against one AltifyAI post published in a prior run') have NO SUBJECT and no in-scope path to one. MEASURED 2026-09-12: AltifyAI (venture 50763b6a-1fad-4e1e-b2fc-296a1d66ebf9, status=active, current_lifecycle_stage=23, launch_mode='simulated', autonomy_level=L1) has ZERO rows in channel_budgets, venture_channel_publish_ledger, venture_channel_autonomy, venture_channel_secrets AND venture_demand_verdicts. A real post is blocked at FOUR independent fail-closed chokepoints: (1) checkBudget (publisher/index.js:110-112, helper :216) fails closed with 'No budget configured for this venture/platform' — the ONLY 4 channel_budgets rows in the whole DB are platform='website' (no adapter exists for 'website'; ADAPTERS={x,bluesky} at index.js:17-18) and all 4 carry monthly_budget_cents=0 so they would ALSO trip 'Monthly budget exceeded'; (2) resolveChannelCredentials returns null for every venture because venture_channel_secrets is EMPTY (0 rows), forcing the dry-run short-circuit ('no per-venture secret means no real post, unconditionally'); (3) Part A's go-live gate; (4) ventures.metadata.outreach_ruling = {ruling:'BLOCKED', scope:'any outbound contact with a real human being', blocked_until:'S24 Launch Readiness PASS (chairman test-it-yourself sitting) AND S25 Go Live PASS'}, and metadata.gating_decision has the 23->24 advance PARKED. So the live arm is blocked by an explicit recorded chairman ruling, not merely by missing setup — and provisioning it is explicitly EXCLUDED from this SD ('the go-live gate (Part A)').",
    impact: "As written, this SD would ship an observer that RUNS but can never SEE its subject — precisely the class formalized by the COMPLETED SD-LEO-INFRA-STANDING-OBSERVABILITY-ACCEPTANCE-001 ('guard-cannot-OBSERVE-its-subject: a guard/gauge/detector that RUNS (invoked, exits, reports green) but never RECEIVES the input it needs to SEE its subject'). That is the same gate-on-a-dead-instrument pathology this SD exists to CURE, reintroduced one layer up.",
    required_resolution: "PLAN must either (a) reframe the live criterion to a falsifiable observability proof that does not require outbound contact with a real human — e.g. publish to the venture's OWN x/bluesky account and observe it, which is arguably outside outreach_ruling.scope but is a CHAIRMAN-RULING INTERPRETATION that PLAN must escalate, not assume; or (b) explicitly defer the live-graduation criterion to a named go-live/provisioning SD and state the provisioning dependency (channel_budgets row with non-zero cents + venture_channel_secrets row for x/bluesky) as an out-of-scope precondition. Do NOT carry the criterion forward unchanged.",
    must_resolve_before: 'PLAN-TO-EXEC',
  },
  {
    id: 'VAL-POO-2',
    severity: 'CRITICAL',
    title: "Scope item (3) 'every channel in the AltifyAI thesis channel portfolio' resolves to 6 channel families, 5 of which have NO publish adapter",
    summary: "MEASURED the actual thesis. ventures.metadata.thesis.reached_how for AltifyAI = 'SEO/Webmaster Forums (e.g., BlackHatWorld, WebmasterWorld); Reddit Communities (r/SEO, r/webdev, r/ecommerce, r/blogging); Slack/Discord Channels for content creators & web professionals; Facebook Groups for bloggers, small business owners, e-commerce; Industry Blogs & Best Tool Roundups; Twitter/LinkedIn for specific niches'. That is SIX channel families. The publishable inventory is TWO adapters (lib/marketing/publisher/adapters/x.js XAdapter, bluesky.js BlueskyAdapter; ADAPTERS registry at publisher/index.js:17-18 — confirmed by directory listing, the registry itself, and a grep for other platform names). The intersection is ONE family (Twitter -> x.js). Bluesky is NOT in the thesis portfolio at all. Reddit, Slack/Discord, Facebook Groups, forums, LinkedIn and industry blogs have no adapter, so there is nothing to observe on them — you cannot observe a post on a channel you cannot post to. Note also that metadata.thesis.provenance marks reached_how as {derived:true, source_field:'synthesis.virality.viral_channels'}, i.e. machine-derived, not chairman-authored.",
    impact: "Read literally, the scope item and its matching success criterion ('A live observer implementation exists for every channel in the AltifyAI thesis channel portfolio') demand 5 new channel integrations and are unbounded — which is what makes metadata.decomposition_recommended=true look correct. Read as the adapter inventory, the SD is small. The SD currently contains BOTH readings and they differ by 4-5 channels and an open-ended amount of work.",
    required_resolution: "PLAN must bind the phrase to the PUBLISHABLE intersection and say so in the PRD: observers for {x, bluesky} only (the channels with adapters), with the other five thesis families recorded as explicitly out of scope pending their own adapter SDs. Rewrite the success criterion to name the two channels literally rather than referring to 'the thesis channel portfolio'.",
    must_resolve_before: 'PLAN-TO-EXEC',
  },
];

const findings = [
  {
    id: 'POO-premise-core-defect-CONFIRMED',
    severity: 'HIGH',
    summary: "PREMISE HOLDS — the defect is real. recordPublishOutcome is defined and exported at lib/marketing/autonomy-gate.js:469 (and re-exported in the default export at :614) and has ZERO production callers anywhere. A repo-wide grep across lib/, scripts/, tests/, src/ returns only: its own definition, its own export, prose comments (autonomy-gate.js:13, :366; publisher/index.js:143, :200), and PRD/rescope one-off scripts for the DEPENDENCY SD. evaluateGraduation (:497) is called from exactly one place: inside recordPublishOutcome (:488). So no channel can graduate today and the autonomy branch is unreachable. LINE-NUMBER DRIFT: the SD description and the team-lead brief both cite :444/:463/:567; current origin/main is :469/:488/:497. PLAN should cite measured line numbers.",
  },
  {
    id: 'POO-dedup-CLEAN-and-this-SD-is-the-dependency-SD-own-recommended-follow-on',
    severity: 'INFO',
    summary: "NO DUPLICATE. Targeted DB search across strategic_directives_v2 (title/description/scope ILIKE on recordPublishOutcome, evaluateGraduation, venture_channel_publish_ledger, 'publish outcome', 'post-outcome', 'graduation streak') returns only this SD, its sibling SD-LEO-INFRA-DEMAND-ENGINE-PART-001 (draft/LEAD, Part B) and the completed dependency SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001. A 500-row scan of quick_fixes found no overlapping QF. POSITIVE PROVENANCE: the dependency SD's own PRD correction script (scripts/one-off/_prd-correction-demand-engine-fail-001.mjs:119) recorded this exact remediation — 'Consider filing a small follow-on SD to wire recordPublishOutcome() into a real outcome signal (e.g. a platform delivery webhook or scheduled reconciliation job) if the autonomy graduation feature is meant to ever activate.' This SD IS that follow-on, and the dependency SD itself sized it as SMALL.",
  },
  {
    id: 'POO-scope-boundary-vs-dependency-SD-unshipped-FR-3',
    severity: 'MEDIUM',
    summary: "BOUNDARY TO RESOLVE AT PLAN. The completed dependency SD shipped FR-3 KNOWN-INCOMPLETE: scripts/one-off/_prd-final-design-demand-engine-fail-001.mjs:33 states 'content-pipeline.js/owned-audience-content-loop.js STILL NEED to consume this mode field before crediting a publish as real (recordPublishOutcome wiring) -- that consumption is the still-pending part of this FR', and _prd-correction-demand-engine-fail-001.mjs:30 made it an acceptance criterion there. That design wires recordPublishOutcome INLINE from the content pipeline; THIS SD mandates a SCHEDULED step and forbids calling it from publish(). The two designs conflict, and this SD's architecture is the correct one (an inline post-publish call is the self-report anti-pattern the ledger docstring at autonomy-gate.js:461-467 explicitly forbids). PLAN must state explicitly that this SD SUPERSEDES the dependency SD's inline-FR-3 residue, so the obligation is not left owed in two places or implemented twice.",
  },
  {
    id: 'POO-observer-read-path-EXISTS-no-migration-needed',
    severity: 'HIGH',
    summary: "GOOD NEWS, MEASURED: the observer can resolve a platform post id WITHOUT a new column or a chairman-gated migration. publisher/index.js:39 generates idempotencyKey and :54 passes it as correlationId to checkPublishAuthorization, so venture_channel_publish_ledger.correlation_id IS the idempotency key (confirmed against the 3 live ledger rows, format venture:content:channel:unixts). index.js:180 persists the platform id as campaign_content.external_post_id upserted onConflict idempotency_key. So the join is ledger.correlation_id = campaign_content.idempotency_key -> external_post_id. THREE CAVEATS PLAN MUST HANDLE: (a) that write is guarded by `if (result.success && campaignId)` — with no campaignId the post id is NEVER persisted; (b) campaign_content is ALSO written ungated by content-generator.js at content-creation time (see the SEC-M2 comment at index.js:41-47), so a row's existence does not prove a real dispatch — require external_post_id non-null; (c) both adapters return a literal `dry-run-<timestamp>` sentinel postId on the no-credential path (x.js:38, bluesky.js:29), and index.js:132 returns `dry-run-no-credentials-<ts>` — the observer MUST reject these sentinels rather than treat them as real posts.",
  },
  {
    id: 'POO-adapters-are-publish-only-observer-needs-new-read-capability',
    severity: 'HIGH',
    summary: "SCOPE THE LEAD BRIEF DID NOT NAME: both adapters are PUBLISH-ONLY. XAdapter exposes publish() + formatForX(); BlueskyAdapter exposes publish() + authenticate() + formatForBluesky(). NEITHER has any get/read/fetch method, so observeOutcome cannot read post state through the existing interface — each adapter needs a NEW read method (X: GET /2/tweets/:id; Bluesky: com.atproto.repo.getRecord or app.bsky.feed.getPosts). Two consequences: (1) X API Basic tier has a documented 15K reads/month budget (x.js header comment) — ample at current volume but it is a NEW quota consumer that should be stated in the PRD; (2) 'deleted' must be distinguished from 'unreadable' by HTTP status (404/tombstone -> reverted; 401/403/429/5xx/timeout -> unknown), which is exactly where the SD's 'never guessed' rule gets its teeth. This is real work the sizing must include, though it is bounded (2 adapters, 2 documented endpoints).",
  },
  {
    id: 'POO-caused-rework-is-undefined-by-construction',
    severity: 'HIGH',
    summary: "CONFIRMED AND SHARPENED: no rework signal exists anywhere. I probed six candidate tables (venture_channel_rework, content_rework, publish_rework, marketing_rework, rework_log, rework) with REAL selects — all six return PGRST205 'Could not find the table'. METHOD NOTE: an initial head:true/count:'exact' probe reported all four of the first batch as EXISTING; that is the known false-positive on a missing table, so the head-count result was discarded and re-verified with real selects. 'rework' exists in the codebase ONLY as an accepted enum VALUE in recordPublishOutcome's validation list (autonomy-gate.js:470) and in the ledger's outcome vocabulary. So 'no rework row -> shipped_clean' in scope item (1) is vacuously true today and caused_rework is unreachable. RECOMMENDATION: implement shipped_clean / reverted / unknown this increment and declare caused_rework explicitly unreachable-pending-a-rework-signal (honest, and consistent with the SD's own 'never guessed' discipline). Inventing a rework signal is its own SD — do not fold it in.",
  },
  {
    id: 'POO-recordPublishOutcome-NOT-mode-aware-evaluateGraduation-PARTIALLY-is',
    severity: 'HIGH',
    summary: "MEASURED the mode-awareness delta precisely. recordPublishOutcome (autonomy-gate.js:469-489) does `.update({outcome, outcome_ref}).eq('correlation_id', correlationId)` with NO mode predicate — so a mock observer handed a live row's correlationId WOULD overwrite that live row. Scope item (2) is therefore real, and the minimal fix is a mode parameter plus an `.eq('execution_mode', mode)` on the update (plus a maybeSingle() miss meaning 'no row in that mode', not 'no row'). evaluateGraduation (:497-540) is only PARTIALLY mode-aware: it selects execution_mode and does `if (executionModeAvailable && row.execution_mode === 'mock') break;` — a mock row BREAKS the streak. That is NOT the same as the SD's requested 'reads only rows of that mode'. Current behaviour is fail-safe (a mock publish denies graduation) but it means an interleaved mock row RESETS a live streak; PLAN must decide between mode-isolation (filter) and streak-breaking (current) and say which, because they differ observably.",
  },
  {
    id: 'POO-execution-mode-IS-applied-code-comment-and-brief-are-STALE',
    severity: 'MEDIUM',
    summary: "PREMISE FALSIFIED (minor, but it invalidates live code). The team-lead brief and the in-code comment at autonomy-gate.js:~500 both state execution_mode's migration is 'chairman-gated and staged, not applied'. MEASURED 2026-09-12: venture_channel_publish_ledger columns are id, venture_id, channel_type, content_ref, correlation_id, decision, decision_by, decision_at, outcome, outcome_ref, created_at, updated_at, execution_mode, mock_run_id — execution_mode AND mock_run_id are BOTH PRESENT and all 3 live rows carry execution_mode='live'. An explicit select of execution_mode succeeds. Consequence: the entire `executionModeAvailable` 42703 fallback branch in evaluateGraduation is now DEAD CODE and its explanatory comment is false. PLAN should confirm the applied state (note: there is no applied_migrations/migration_ledger table — only an empty schema_migrations — so the live schema is the authority here) and decide whether to delete the dead fallback in this SD or a follow-on. Do not propagate the stale 'not applied' claim into the PRD.",
  },
  {
    id: 'POO-scope-item-4-CONFIRMED-neither-module-reads-post-outcomes-and-both-are-unfed',
    severity: 'HIGH',
    summary: "PREMISE HOLDS, AND IS WORSE THAN STATED — so there is nothing to reuse. (a) lib/marketing/ai/metrics-ingestor.js: pollPlatform calls client.fetchMetrics({since}) — a TIME-WINDOWED AGGREGATE fetch — and normalizeMetric flattens to {channel, metric_type, value, timestamp, source, raw_data}. No post id, no liveness check. Moreover createMetricsIngestor has NO production caller: grep across lib/, scripts/, tests/, src/, .github/ finds only two barrel re-exports (lib/marketing/ai/index.js:13, lib/marketing/index.js:21) and unit tests that inject mock platformClients. Nothing ever constructs it with a real client, so it is itself an unfed instrument. (b) lib/marketing/ai/variant-outcome-derivation.js: deriveVariantOutcomes(dailyRollupsRows) is a PURE function mapping impressions/conversions -> successes/failures; its own header (FR-6) records that 'daily_rollups genuinely has NO WRITER anywhere in the codebase'. Neither module reads per-post state. CONCLUSION for scope item (4): the PRD should record 'measured: no reuse available' and build the observer fresh. The ONE genuinely reusable asset is metrics-ingestor's SHAPE — its metrics_poll_state last_poll_at watermark + bounded-retry + notifier-on-exhaustion pattern is a good template for the scheduled observer step's own watermark/idempotency.",
  },
  {
    id: 'POO-idempotency-and-window-design-notes',
    severity: 'MEDIUM',
    summary: "Design facts for the PRD. (1) The SD's idempotency claim ('keying on ledgerCorrelationId') is sound: recordPublishOutcome already keys its update on correlation_id, so a re-run is a no-op UPDATE — but PLAN should also require the scheduled step to SKIP rows whose outcome is already non-'unknown', otherwise every sweep re-runs evaluateGraduation for every settled row. (2) A pre-existing (not this SD's) oddity worth knowing: idempotencyKey embeds Math.floor(Date.now()/1000), so the dedup check at index.js:67-79 can essentially never hit across retries — each attempt mints a new key. Harmless for the observer's 1:1 join, but it means 'one ledger row per attempt', not per content. (3) DEFAULT_GRADUATION_STREAK=5 (autonomy-gate.js:43) and evaluateGraduation ALSO requires a venture_demand_verdicts verdict='PASS' row — venture_demand_verdicts currently has ZERO rows table-wide, so even with 5 clean live outcomes graduation would still not fire. PLAN should state that the SD's goal is 'evaluateGraduation RUNS on a real outcome', NOT 'a channel graduates' — those are different, and only the former is in reach.",
  },
  {
    id: 'POO-ledger-rows-belong-to-cancelled-test-ventures',
    severity: 'MEDIUM',
    summary: "All 3 venture_channel_publish_ledger rows (created 2026-07-10 and 2026-07-16) are decision='pending', decision_by=null, outcome='unknown', outcome_ref=null, execution_mode='live', mock_run_id=null, channel_type='x' — i.e. propose_and_approve rows that were never approved and never published. All three belong to ventures named 'Test Venture for Owned-Audience Loop' with status='cancelled'; so do all 4 channel_budgets rows. marketing_content has 0 rows. There is therefore no published post ANYWHERE in the system, and no fixture row that can be promoted into one. Any two-sided test of the observer must construct its own fixtures; PLAN should not plan around these 3 rows.",
  },
  {
    id: 'POO-sizing-ONE-SD-override-the-decomposition-flag',
    severity: 'HIGH',
    summary: "INDEPENDENT SIZING READ: keep this as ONE SD, and OVERRIDE metadata.decomposition_recommended=true — PROVIDED the scope is trimmed per VAL-POO-2. Rationale, all measured: the publishable surface is 2 adapters, not 6 channel families; the mode discriminator (execution_mode + mock_run_id) ALREADY landed from the completed dependency; the correlation_id -> campaign_content.external_post_id read path ALREADY exists so NO migration (and no chairman-gated ceremony) is required; a scheduled-polling template with a watermark already exists to copy; and the dependency SD's own PRD sized this remediation as 'a small follow-on SD'. The real delta is roughly: one new observer module, one read method on each of 2 adapters, a mode predicate on recordPublishOutcome, a scheduled entry point, and tests — plausibly 2-3 PRs inside the tiered PR-size guidance. Decomposing that into an orchestrator plus children would add parent-lifecycle WAIT states and child handoff overhead exceeding the work itself. NOTE the flag's provenance: metadata.source='plan'/created_via='leo-create-sd' — decomposition_recommended came from the minting heuristic, not from a measurement of this codebase. CONVERSELY, if LEAD chooses to keep the literal 'every thesis channel' reading, decomposition becomes MANDATORY (5 new channel integrations) — so the sizing decision and the scope decision are the SAME decision and must be made together.",
  },
  {
    id: 'POO-standing-observability-requirement-applies',
    severity: 'HIGH',
    summary: "BINDING PRIOR ART. SD-LEO-INFRA-STANDING-OBSERVABILITY-ACCEPTANCE-001 is status=completed and establishes a STANDING acceptance requirement for every guard/gauge/detector SD: prove the guard SEES its subject in the deployment environment, not merely two-sided in a fixture. Its own class description is 'guard-cannot-OBSERVE-its-subject — a guard/gauge/detector that RUNS (invoked, exits, reports green) but never RECEIVES the input it needs to SEE its subject. Its logic is SOUND every time; it is fed the wrong input, or no input, so it cannot fail because it cannot see.' This SD ships a detector into an environment with ZERO subjects (see VAL-POO-1), so that standing requirement collides with this SD head-on and CANNOT be satisfied by fixtures alone. PLAN must carry an explicit observability-acceptance section naming the real subject it will observe and how it is obtained within the outreach ruling.",
  },
];

const warnings = [
  "The SD's own description/scope cite autonomy-gate.js:444/:463/:567 and publisher/index.js:174; measured origin/main values are :469/:488/:497 and :180/:200. Line references have drifted — PLAN should re-measure rather than copy them forward.",
  "venture_channel_secrets has 0 rows table-wide, so EVERY publish today short-circuits to dry-run before adapter construction. Any PLAN-phase experiment that expects a real adapter call will silently get a dry-run with a `dry-run-*` sentinel postId instead of failing loudly. Assert on the returned `mode` field ('real' is the only dispatch path), never on `.success`.",
  "Do not size this SD from the channel_budgets table: its only 4 rows are platform='website' (no adapter) with monthly_budget_cents=0, and they belong to cancelled test ventures. The fundable/publishable channel set for AltifyAI is currently EMPTY, which is a provisioning gap outside this SD, not an observer gap.",
  "METHOD WARNING for PLAN/EXEC: two of my own first-pass probes returned misleading results and were re-run. (1) A head:true/count:'exact' probe reported four nonexistent *_rework tables as EXISTING (known false positive on a missing table) — always confirm table existence with a real select. (2) A ventures select errored with 42703 on a guessed column name and returned data=undefined, which reads identically to 'no AltifyAI venture exists'; AltifyAI does exist. Capture and print the error object on every probe.",
];

const recommendations = [
  'GATE 1 verdict: APPROVE the SD to PLAN on the strength of the real, well-provenanced defect (recordPublishOutcome has zero callers), but NOT with its current acceptance criteria. Require resolution of VAL-POO-1 and VAL-POO-2 during PRD authoring.',
  'Bind scope item (3) and its success criterion to {x, bluesky} literally — the publishable intersection — and record the other five AltifyAI thesis channel families as out of scope pending adapter SDs.',
  "Reframe the live-graduation criterion to an observability proof obtainable without outbound contact with a real human, OR defer it with a named provisioning dependency. Escalate to the chairman the question of whether observing a post on the venture's OWN channel account falls outside outreach_ruling.scope — do not assume either answer.",
  'Implement outcomes shipped_clean / reverted / unknown only; declare caused_rework explicitly unreachable pending a rework signal, and record that as a named follow-on rather than inventing a signal inside this SD.',
  "State in the PRD that this SD SUPERSEDES the dependency SD's inline-FR-3 recordPublishOutcome wiring (content-pipeline.js / owned-audience-content-loop.js), so the obligation is not owed in two places or built twice.",
  'Use the measured correlation_id = campaign_content.idempotency_key -> external_post_id join as the observer input path; no new column and no chairman-gated migration are required. Reject `dry-run-*` sentinel post ids and require external_post_id non-null.',
  'Add read methods to XAdapter and BlueskyAdapter as explicit PRD deliverables (they are publish-only today), and specify the HTTP-status-to-outcome mapping so unreadable never collapses into reverted.',
  "Record in the PRD that neither metrics-ingestor.js nor variant-outcome-derivation.js reads per-post outcomes and that both are themselves unfed — satisfying scope item (4)'s measure-don't-assume requirement with a negative result — while reusing metrics-ingestor's poll-watermark SHAPE for the scheduled step.",
  'Keep as ONE SD (override decomposition_recommended=true) contingent on the trimmed scope; carry an explicit observability-acceptance section per the standing requirement from SD-LEO-INFRA-STANDING-OBSERVABILITY-ACCEPTANCE-001.',
  'Remove or justify the now-dead executionModeAvailable 42703 fallback in evaluateGraduation and correct its false "migration not applied" comment.',
];

const summary = "LEAD GATE 1 for SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001: CONDITIONAL_PASS. Dedup is CLEAN (no duplicate SD or QF; this SD is the dependency SD's own recommended 'small follow-on'). The core defect is CONFIRMED: recordPublishOutcome (autonomy-gate.js:469) has zero production callers and evaluateGraduation (:497) runs only from inside it, so no channel can graduate. The 2-adapter count is CONFIRMED (x.js, bluesky.js; ADAPTERS registry at publisher/index.js:17-18). Scope item (4) is CONFIRMED with a negative result and is worse than stated — neither metrics-ingestor.js nor variant-outcome-derivation.js reads per-post state, and both are themselves unfed (no production constructor; daily_rollups has no writer), so there is nothing to reuse. No rework signal exists anywhere (6 candidate tables probed with real selects), so caused_rework is undefined by construction. TWO PREMISES FALSIFIED: (1) execution_mode IS applied to the live schema (along with mock_run_id), making the in-code 'staged, not applied' comment false and its 42703 fallback dead code; (2) 'the AltifyAI thesis channel portfolio' measures to SIX channel families of which five have no adapter and which exclude bluesky entirely — so scope item (3) is either 2 channels or 6, and the SD contains both readings. TWO CRITICAL BLOCKERS for PLAN: the live-outcome success criterion has no subject and is blocked by a recorded chairman outreach ruling plus four fail-closed chokepoints (empty venture_channel_secrets, website-only zero-cent channel_budgets, Part A's go-live gate, outreach_ruling BLOCKED until S24+S25), and the thesis-portfolio phrasing must be bound to the publishable intersection. GOOD NEWS: the observer's read path already exists (ledger.correlation_id = campaign_content.idempotency_key -> external_post_id), so NO migration is needed. Both adapters are publish-only and need new read methods — scope the brief did not name. SIZING: keep as ONE SD and override metadata.decomposition_recommended=true, contingent on trimming scope to {x, bluesky}; the scope decision and the sizing decision are the same decision.";

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
    confidence_score: 93,
    critical_issues,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD',
      gate: 'GATE_1_LEAD_PRE_APPROVAL',
      duplicate_check: 'CLEAN - no duplicate SD or QF; provenance traced to dependency SD own recommended follow-on',
      decomposition_assessment: 'ONE SD (override decomposition_recommended=true) CONTINGENT on trimming scope item (3) to the publishable intersection {x, bluesky}',
      premises_confirmed: [
        'recordPublishOutcome zero production callers (autonomy-gate.js:469)',
        'evaluateGraduation called only from recordPublishOutcome (:488)',
        'exactly 2 channel adapters: x.js XAdapter, bluesky.js BlueskyAdapter',
        'neither metrics-ingestor.js nor variant-outcome-derivation.js reads per-post outcomes',
        'no rework table/signal anywhere (6 candidates probed with real selects)',
        'publisher/index.js hands out ledgerCorrelationId on every path',
        'evaluateGraduation breaks streak on a mock row',
      ],
      premises_falsified: [
        "execution_mode migration IS applied (column present with mock_run_id; in-code 'staged, not applied' comment is false and its 42703 fallback is dead code)",
        "'AltifyAI thesis channel portfolio' = 6 channel families (5 without adapters, bluesky absent), not the 2-adapter inventory",
      ],
      blocking_conditions: ['VAL-POO-1', 'VAL-POO-2'],
      artifacts_read: [
        'lib/marketing/autonomy-gate.js',
        'lib/marketing/publisher/index.js',
        'lib/marketing/publisher/adapters/x.js',
        'lib/marketing/publisher/adapters/bluesky.js',
        'lib/marketing/ai/metrics-ingestor.js',
        'lib/marketing/ai/variant-outcome-derivation.js',
        'lib/marketing/organic-channel-provisioning.js',
        'lib/marketing/content-pipeline.js',
        'scripts/modules/handoff/gates/subagent-evidence-gate.js',
        'scripts/one-off/_prd-correction-demand-engine-fail-001.mjs',
        'scripts/one-off/_prd-final-design-demand-engine-fail-001.mjs',
      ],
      searches_run: [
        'ls lib/marketing/publisher/adapters/ + ADAPTERS registry read + grep for other platform names',
        'repo-wide grep recordPublishOutcome / evaluateGraduation / observeOutcome across lib, scripts, tests, src',
        'strategic_directives_v2 ILIKE dedup on 6 publish-outcome concepts (title/description/scope)',
        'quick_fixes 500-row scan for observe/publish-outcome/graduation overlap',
        'live SELECT venture_channel_publish_ledger (all rows + column inventory)',
        'live SELECT channel_budgets / venture_channel_autonomy / venture_channel_secrets / venture_demand_verdicts',
        'live SELECT ventures for AltifyAI + metadata.thesis.reached_how + metadata.outreach_ruling',
        'real-select existence probes on 6 candidate rework tables',
        'grep postId/postUrl/external_post_id persistence trace',
      ],
      dedup_candidates_checked: [
        'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 (completed dependency - Part A)',
        'SD-LEO-INFRA-DEMAND-ENGINE-PART-001 (draft Part B - sibling, depends on this SD)',
        'SD-LEO-GEN-ALTIFYAI-FIRST-CUSTOMER-001 (active EXEC - mentions ledger, no observer overlap)',
        'SD-LEO-INFRA-STANDING-OBSERVABILITY-ACCEPTANCE-001 (completed - binding standing requirement, not a duplicate)',
      ],
      measured_at: new Date().toISOString(),
      measured_against_commit: '7224308b893',
    },
    phase: 'LEAD',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_KEY,
    { name: 'Principal Systems Analyst' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD', source: 'manual' },
  );

  console.log('\nVALIDATION EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  process.exit(0);
}

main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
