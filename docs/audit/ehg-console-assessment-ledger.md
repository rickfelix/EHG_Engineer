# EHG Chairman Console Assessment — Findings Ledger

**Category**: Reference
**Status**: Chairman review pending
**Author**: Alpha-3 (Fable seat, directed assignment 2026-07-10)
**Assessed state**: `rickfelix/ehg` @ origin/main `1936a703` (UIUX-B PR #738 landed 2026-07-10 12:36Z), isolated worktree, vite dev :8081, EHG_Engineer backend :3000 up, authenticated session (real login, no mocks)
**Method**: exercise-don't-inspect — every finding was observed in a live authenticated browser session (Playwright, 1440×900) and, where code-visible, traced to `file:line` and verified against the live consolidated database (`dedlbzhpgkmetvhbkyzq`). The Sonnet stub-grep packet (`docs/audit/console-stub-evidence-packet.md`, PR #5819) was consumed as input and re-adjudicated against the landed state; divergences noted inline. A fresh-context adversarial verification pass was run against this ledger and its deficiencies remediated before delivery.
**Evidence screenshots**: session scratchpad `assess/shots/` (Alpha-3 seat, session 0fe59da2); referenced by filename below. They are working evidence, not committed artifacts — re-capturable on request from any seat via the drivers in the same directory.

**Writes made during assessment** (complete list, all on test fixtures / reversible):
1. One EVA chat message ("What needs my attention today?") → one new conversation + two `eva_chat_messages` rows.
2. One decision mutation, authorized by the brief's test-entity clause: **Park** exercised via the UI on `chairman_decisions` id `9868fa64-7dfc-485f-a50e-be73007c5cc9` ("Stage 23 Chairman Approval", venture `__e2e_product_review_gate_adv_1783461843298__`) — row went `status='pending'` → `status='approved', decision='pause'` at 16:36:24Z (see finding #2).

Nothing else was submitted: no Approve/Kill/Continue, no real-venture action, no pipeline toggles, no preference saves, no Start Discovery.

---

## Severity key

- **P0** — defeats the console's core job (the chairman's decision loop)
- **P1** — a major surface or systemic capability is broken/false
- **P2** — significant defect or ergonomic failure on a real path
- **P3** — polish, copy, consistency, data-quality

---

## P0

### 1. Decision evidence exists in the database but the detail sheet destroys it with one phantom column — the chairman decides blind
- **Lens**: REALITY + TASTE · **Route**: `/chairman/decisions` sheet (also the briefing Review-Now target) · **Component**: `src/components/chairman-v3/DecisionGateDetailSheet.tsx:66-70`
- **Evidence** (exercised + DB-verified): a Critical "Stage 0 Chairman Approval" sheet renders, in full: title, priority badge, "Stage: Stage 0", type chip, action buttons — no venture name, no thesis, no evidence (`shots/exercise2-approval-sheet.png`; queue rows for these show venture "—" and are mutually indistinguishable). Mechanism caught live during the Park exercise: the sheet's detail fetch `select("brief_data, recommendation, health_score, lifecycle_stage, metadata")` → **400**, because `metadata` does not exist on live `chairman_decisions` (information_schema verified; the other four DO exist). The result is destructured without an error check (`const { data: cdData }`), so the failure is silent and the sheet falls through to bare rendering. The evidence is real and populated: live pending rows carry `brief_data` up to 1174 chars, plus `recommendation` and `health_score` values — all currently unreachable by the UI.
- **Fix direction**: remove `metadata` from the select (one-word fix), check the error, and render `brief_data`/`recommendation`/`health_score`; block "—"-venture rows at the source.

## P1

### 2. The decide loop itself works — but Park records as `status='approved'`, and the UI gives no confirmation
- **Lens**: REALITY · **Route**: `/chairman/decisions` sheet actions · **Components**: `src/hooks/useDecisionGateQueue.ts:168` (park mutation), sheet actions per gate type
- **Evidence** (the authorized mutation probe): on the Stage-23 test-fixture decision, the sheet offered a gate-tailored action set (Continue / Kill / Park — different from Stage-0's Approve / Park (Blocked) / Park (Nursery), confirming per-gate tailoring is real). Park → reason dialog (good) → `POST /rpc/park_venture_decision` **200** → DB row mutated within the click's second. Two defects around a working core: (a) the parked row persists as `status='approved', decision='pause'` — "approved" as the terminal status of a *park* poisons every downstream count/filter that treats approved as decided-yes; (b) no toast/visual confirmation appeared and the sheet stayed open unchanged — the chairman cannot tell the park took (`shots/exercise3-after-park.png`).
- **Fix direction**: park should persist a park-semantic status; add success feedback + optimistic row removal.

### 3. Systemic auth gap: every EHG_Engineer-backed panel is dead in an authenticated session
- **Lens**: REALITY · **Routes**: `/chairman` (EVA insight strip), `/chairman/operations` (EVA status + workers), `/chairman/portfolio/exit-readiness` (entire page), `/chairman/ventures/:id/separation-plan` (3 panels)
- **Evidence**: with the :3000 backend UP and a real logged-in session, the browser gets **401** (`NO_AUTH_HEADER`) on `GET /api/v2/chairman/insights?format=simple`, `/api/eva/operations/status`, `/api/eva/operations/workers`, `/api/eva/exit/portfolio-readiness`, `/api/eva/exit/:id/rehearsal/latest`, `/api/eva/exit/:id/data-room/completeness`, `/api/eva/exit/summary`. Observed call sites send cookies only, never a bearer token — e.g. `src/hooks/useChairmanDashboardData.ts:368-370`: `fetch(endpoint, { credentials: "include" })` with no Authorization header. Exit-readiness renders skeleton shimmer forever with no error state (`shots/chairman_portfolio_exit-readiness.png`).
- **Fix direction**: shared authed fetch wrapper for `/api/*` (attach the Supabase JWT); error states where skeletons never resolve. (Scoped claim: verified at the insights call site + seven observed 401 endpoints; a repo-wide fetch audit should confirm no authed variant exists.)

### 4. Schema drift: launch/live-progress hooks query columns that do not exist — every call 400s, errors swallowed
- **Lens**: REALITY · **Routes**: `/chairman/operations` (live progress), `/chairman/launch` (Timeline tab)
- **Evidence**: live `workflow_executions` has no `current_lifecycle_stage`, yet `src/hooks/useLiveWorkflowProgress.ts:84` and `src/hooks/useLaunchWorkflow.ts:161` select it. Live `stage_executions` is venture-keyed `(id, venture_id, lifecycle_stage, worker_id, status, …)`, yet `useLaunchWorkflow.ts:183` selects `execution_id, stage_number, duration_minutes, notes` — none exist (information_schema verified). PostgREST 400s every load; results destructured without error checks (`useLiveWorkflowProgress.ts:81`) so panels silently render empty: Launch "Timeline" is stuck at "Loading launch ventures…" forever while the KPI cards above it render (`shots/chairman_launch.png`). Same silent-phantom-column class as finding #1.
- **Fix direction**: rewrite both hooks against the real venture-keyed schema; surface query errors; add a CI probe failing on phantom-column selects.

### 5. Vision → Pipeline tab crashes; the error boundary then blanks sibling tabs
- **Lens**: REALITY · **Route**: `/chairman/vision` (Pipeline tab) · **Component**: `src/components/chairman-v3/PipelineTab.tsx:873` (also :638)
- **Evidence**: uncaught `TypeError: Cannot read properties of undefined (reading 'map')` at PipelineTab.tsx:873, observed live; RouteErrorBoundary swallows it into a full "Page Error" card and sibling tabs stay blank until reload.
- **Fix direction**: guard the undefined collection; scope the error boundary per-tab.

### 6. Vision → Capabilities tab renders blank: 403 on `v_unified_capabilities`, no error state
- **Lens**: REALITY · **Route**: `/chairman/vision` (Capabilities tab)
- **Evidence**: `GET /rest/v1/v_unified_capabilities` → **403** (RLS/grant denies the authenticated role); tab shows tab-bar only — no content, no empty-state, no error. This is where the retired `/chairman/capabilities` route was folded, so capability review is now unreachable everywhere.
- **Fix direction**: grant/RLS-policy the view for the chairman role; add an error state.

### 7. One screen, four contradictory pending-decision counts (0 / 20 / 36 / 50)
- **Lens**: REALITY + TASTE · **Routes**: `/chairman`, `/chairman/decisions`
- **Evidence**: `shots/chairman-full.png`, `shots/exercise-palette.png`. Briefing tile "PENDING DECISIONS **0**" ← `src/hooks/useDailyBriefing.ts:30` → RPC `get_daily_briefing`, which counts **`governance_decisions`** WHERE status='pending' (a third decision store — pg_proc source verified). EVA greeting "You have **20** pending decisions" + "DECISIONS PENDING **20**" tile + decision stack ← `chairman_pending_decisions` union view. Attention badge "Minimal: **36–38**" ← its own source. Queue header "**50** | 10 Critical" (page-size cap) vs briefing stack "7 Critical".
- **Fix direction**: one canonical pending-decisions source (the union view) behind every gauge; rewire `get_daily_briefing`.

### 8. Decision queue is polluted with raw harness-internal signals rendered as Critical chairman decisions
- **Lens**: TASTE + REALITY · **Routes**: `/chairman/decisions`, briefing decision stack, Review-Now target
- **Evidence**: the top queue items are verbatim worker-signal aggregations — "FOURTH and most significant unattributed-activity finding this session: found an UNCOMMITTED, independently-authored alt…", "CRITICAL: claim_sd() live production signature does NOT include p_client_gate_version…" — `decision_type=flag_review`, `category=harness_backlog`, venture "—", all Critical, all "No SLA". Their sheet's only affordances are "Copy for Claude Code" + Close (review-only by design, `src/components/chairman-v3/decisions/DecisionActions.tsx:38`). The queue's top screen is un-actionable engineering telemetry in the chairman's decision space — the definition of decisions-per-minute ≈ 0.
- **Fix direction**: route `harness_backlog`/`flag_review` to a builder/engineering surface (or EVA-summarize); keep the chairman queue to chairman-decidable items.

### 9. Cmd+K palette searches the legacy app's feature index — it cannot reach any chairman-v3 destination
- **Lens**: REALITY · **Component**: `src/components/search/FeatureSearch.tsx:34` ← `src/data/navigationTaxonomy.ts:66`
- **Evidence**: `shots/exercise-palette.png` — ⌘K in the shell, query "vision" → "No features found matching \"vision\"". The palette flattens `navigationTaxonomy` ("67 platform features" of the pre-v3 app) whose only chairman entry is line 66 ("Chairman Dashboard" → `/chairman`). None of the 11 chairman nav destinations are indexed. UIUX-B restored the keybinding; the index behind it belongs to the wrong app.
- **Fix direction**: index `chairman-nav-config.ts` + builder items + common actions; retire the legacy taxonomy from this surface.

### 10. `get_pending_chairman_items` RPC does not exist in the live database — the designed API 404s on every consumer
- **Lens**: REALITY · **Component**: `src/hooks/useDecisionGateQueue.ts:61`
- **Evidence**: `POST /rest/v1/rpc/get_pending_chairman_items` → **404** on `/chairman` and `/chairman/decisions` every load (pg_proc verified absent; the `chairman_pending_decisions` view it wraps EXISTS). The silent fallback (`:77`, direct view query) keeps the queue alive and masks the gap. Packet adjudication: the packet treated this RPC as the union view's canonical reader — the reader was never created in the live DB.
- **Fix direction**: create the RPC per contract, or delete the RPC path and promote the view query (kill the noise).

## P2

### 11. Attention rail: item clicks exit the chairman shell; content is 36–38 uniform zero-signal items
- **Lens**: TASTE + REALITY · **Component**: `src/components/chairman-v3/AttentionQueueSidebar.tsx:113` (`navigate(\`/ventures/${ventureId}\`)`)
- **Evidence**: exercised — clicking an attention item lands on standalone `/ventures/:id`, outside ChairmanShell (context loss; the same anti-pattern UIUX-B FR-3 fixed for briefing venture clicks). Every item reads "Minimal / Score: 0" with a green check icon — the visual grammar of "done" on an *attention* item (`shots/chairman.png`).
- **Fix direction**: navigate to `/chairman/ventures/:id`; suppress or de-rank zero-score items; reserve green checks for completed states.

### 12. `/chairman/governance/batch-review`: "Loading SDs…" for minutes — a 535-query N+1 against the full orchestrator history
- **Lens**: REALITY · **Component**: `src/components/chairman-v3/batch-review/BatchReviewDashboard.tsx:36-55` (loading state :163)
- **Evidence**: the queryFn fetches ALL `sd_type='orchestrator' AND is_active=true` rows — **534** in the live DB (counted) — then issues one sequential child query per orchestrator inside a for-loop. The page shows "Loading SDs..." for the duration (observed >60s with no failed request — earlier read of "silent hang" corrected to pathological N+1). Orphan route (no nav entry).
- **Fix direction**: filter to genuinely in-flight orchestrators; fetch children in one `in(parent_sd_id, …)` query.

### 13. `/chairman/eva-friday`: polished meeting splash, dead "Start Meeting" CTA
- **Lens**: REALITY · **Evidence**: `shots/chairman_eva-friday.png` — "Good morning, Chairman / Your Friday management review is ready" over a real-looking surface; `POST /functions/v1/friday-meeting-data` fails CORS preflight (`net::ERR_FAILED`) from the dev origin. Same function breaks the EVA-chat Friday banner. Orphan route. See finding #22 for the origin caveat this rides on.
- **Fix direction**: fix edge-function CORS/deployment; don't render the CTA armed while its backend is unreachable.

### 14. Stage drilldown page is an explicit placeholder — and nothing links to it
- **Lens**: REALITY · **Route**: `/chairman/ventures/:id/stage/:num` (`src/pages/chairman-v3/StagePage.tsx:71-79`)
- **Evidence**: `shots/f2-stage24.png` — real header ("Stage 24: Go Live & Announce", Promotion Gate badge) over the verbatim body "Detailed stage content for \"Go Live & Announce\" will be rendered here. This page provides a deep-dive into the specific stage work, artifacts, and decisions." Venture detail renders zero stage links (exercised; packet finding confirmed live on landed main).
- **Fix direction**: build the stage content or remove the route until it exists.

### 15. Five registered routes are unreachable from the nav — including the best-built surface in the console
- **Lens**: REALITY + TASTE · **Routes**: `/chairman/research-lab`, `/chairman/portfolio/exit-readiness`, `/chairman/launch`, `/chairman/eva-friday`, `/chairman/governance/batch-review` (`src/routes/chairmanRoutesV3.tsx:163,174,192,209,227`; nav = `chairman-nav-config.ts`)
- **Evidence**: no nav entry and no inbound link observed across all assessed surfaces (scoped claim; packet's repo-wide grep found no `<Link>`/`navigate()` references either). Research Lab is REAL and polished — scored hypothesis cards (e.g. "Address recursion-governor-ratio degradation", score 90) with Approve/Dismiss/Defer/Add Notes and a weekly skunkworks cadence — and no chairman can find it.
- **Fix direction**: nav-surface research-lab (and launch, once #4 lands); retire or deliberately gate the rest.

### 16. Test/CI fixtures pollute every chairman surface
- **Lens**: REALITY (data hygiene) · **Routes**: briefing portfolio + featured venture, attention rail, decision queue
- **Evidence**: `__e2e_product_review_gate_adv_*`, `__citest_chairman__:*`, `canonical-source-test-*`, "Test Venture for …" appear as first-class ventures and decisions; the briefing's *featured venture* is "Test Venture for Owned-Audience Loop". The ventures LIST filters correctly (3 active non-demo rows — live count verified: 3) but the fixtures aren't flagged `is_demo`, so briefing/attention/decision sources all show them.
- **Fix direction**: stamp fixtures `is_demo=true` at creation; apply the demo filter in briefing/attention/decision sources.

### 17. Briefing page is three dashboards concatenated, with dead gauges rendered as features
- **Lens**: TASTE · **Route**: `/chairman` (`shots/chairman-full.png`, ~3470px tall)
- **Evidence**: survival strip block + legacy tile block + EVA block + second tile row + token budget + decision stack + portfolio overview + builder tiles, stacked. Dead tiles rendered as live: "PORTFOLIO VALUE --", "TEAM CAPACITY --", "VISION HEALTH N/A", "PORTFOLIO HEALTH 0/0", "Monthly Token Budget 0 / 0 0%". The two most decision-relevant elements (survival strip, decision stack) sit ~2000px apart; the morning pass requires a full scroll past noise.
- **Fix direction**: one spine — survival → decisions → exceptions; kill or wire dead tiles; move builder tiles to `/builder`.

### 18. EVA chat: persistence real, intelligence unreachable (edge-function CORS)
- **Lens**: REALITY · **Route**: `/chairman/eva-chat`
- **Evidence** (exercised, write #1): send → `create_eva_conversation` 200, `eva_chat_messages` insert 201; `POST /functions/v1/sensemaking-service` blocked (CORS, `net::ERR_FAILED`); EVA replies in ~9s with an honest, well-written error bubble ("…Your message has been saved."). Kept at P2 rather than P1 solely because of the unresolved origin caveat (#22) — if production reproduces it, promote to P1.
- **Fix direction**: fix sensemaking-service CORS/deployment for the real console origin; add a service-health indicator to the chat header.

## P3

### 19. Same-screen metric contradictions and unlabeled numbers (beyond #7)
- **Lens**: REALITY (data quality) · **Routes**: `/chairman`, `/chairman/vision` · **Evidence**: `shots/chairman-full.png`, `shots/f4b-vision-Alignment.png`, `shots/f4b-vision-Performance.png`
- Venture Performance stat card "2 active · 0 dead · 2 total" beside a panel saying "0 moving 2 stalled **36 dead**" (live DB count at verification: **3** active — both sources disagree with the ground truth as well as each other; same divergent-gauge class as #7); every panel row trails an unlabeled "50". Featured venture: "Stage 24 of 26 (0% complete)". Ops scorecard: "7613 workflows" beside "Stage executions 0 / Completed stages 0". Vision Alignment: composite 89/100 while every dimension is flagged "Critical"; `elapsed_ms` (a latency) is listed as a scored vision dimension.
- **Fix direction**: metric SSOT + labels; exclude telemetry keys from dimension maps.

### 20. Copy/IA consistency
- **Lens**: TASTE · **Routes**: shell-wide · **Evidence**: `shots/chairman.png`, `shots/exercise-palette.png`, separation-plan survey digest
- Breadcrumb says "Dashboard" while nav says "Briefing"; raw-slug h1s ("opportunities", "operations", "separation-plan") doubled by real headings ("Explore Opportunities", "Operations Dashboard"); "No SLA" repeated 15× down the queue's SLA column; internal SD IDs (`SD-MAN-ORCH-…`, Vision Performance gap-analysis) and raw UUIDs ("Id: afcc2aaf-…", decision sheets) shown to the chairman.
- **Fix direction**: one title per page; humanize identifiers; collapse repeated null-states; hide the SLA column until SLAs exist.

### 21. No motion or visual ambition anywhere in the console
- **Lens**: TASTE · **Routes**: all · **Evidence**: every screenshot in `assess/shots/`
- The console is a clean, competent shadcn-style admin — consistent spacing, honest empty states — but contains zero parallax, zero micro-animations, zero hero imagery, and a grayscale-plus-one-blue palette that never uses color functionally. Against the design_reference_library bar for the SaaS archetype — Miro (design 9.2, "vibrant primary palette… energetic yet professional"), Airtable (9.1, "multi-hued palette used functionally to categorize and organize information"), Pitch (9.0, "high-contrast off-black/warm-white with muted warm accents") — every surface reads utilitarian-static, and the queue/attention rail specifically lack Airtable-style functional color coding by decision type/severity. This is also directly against the chairman's standing preferences (parallax + micro-animations near-default; layered AI-generated hero imagery). The screensaver is the only surface with presentation intent.
- **Fix direction**: motion + functional-color pass, briefing and decision queue first (stat-card entrance, stage-journey transitions, severity-coded rows, attention-rail micro-interactions).

### 22. Unassessable-from-this-seat: production-origin edge-function and proxy behavior
- **Lens**: REALITY (first-class coverage finding) · **Affects**: #13, #18 (CORS class), #3 (proxy auth class)
- **Evidence**: all CORS failures were observed from `http://localhost:8081`; nothing in-repo pins the allowed origins for `sensemaking-service`/`friday-meeting-data`, and no production console origin was available to this seat to reproduce against. The two P2s above are therefore floor-severity: if the production origin reproduces them, EVA intelligence and the Friday meeting are dead in production and both promote to P1.
- **Fix direction**: one smoke probe from the real console origin (or record the deployed functions' CORS config) to settle the class.

### 23. Unassessable-from-this-seat: mobile viewport
- **Lens**: TASTE + REALITY (first-class coverage finding) · **Affects**: `ShellMobileTabBar` (5 tabs configured in `chairman-nav-config.ts:55-61`), all responsive behavior
- **Evidence**: assessment was desktop 1440×900 only; the mobile tab bar, drawer behaviors, and touch affordances were never rendered. Unknown whether the briefing's 3470px stack is even navigable on mobile.
- **Fix direction**: a mobile-viewport pass (390×844) over briefing, decisions, venture detail at minimum.

### 24. Minor reality residue
- **Lens**: REALITY · Test venture at Stage 1 shows a perpetual "Capturing idea…" spinner (`/chairman/ventures/7067d1a5…`, `shots/f1-venture-test.png`); ventures-list rows don't navigate on click (no anchor — intended drill-in target unclear, `/chairman/ventures` table); `/builder/inbox` ("Brainstorm Inbox") renders 0 cards with no empty-state copy — honest-empty vs broken could not be adjudicated from this seat (moved to coverage map, not asserted).

---

## Verified REAL (positive adjudications — the console's working core)

- **Login** → `/chairman` in ~1s (an earlier "login broken" read was a test-driver artifact: two "Sign In" buttons in DOM order — tab before submit — plus Vite-hostile `load` waits; RCA on file).
- **UIUX-B Review-Now fix works end-to-end**: briefing click → in-place `DecisionGateDetailSheet`, deep-link `?decision=:id` auto-opens the sheet (`shots/exercise-deeplink.png`); the packet's headline 404 is FIXED on landed main.
- **The decision mutation round-trip is real** (Park exercised: UI click → reason dialog → RPC 200 → DB row mutated in ~1s), and all three mutation RPCs exist live (`approve_chairman_decision`, `reject_chairman_decision`, `park_venture_decision` — pg_proc verified). Action sets are genuinely gate-tailored (Stage-0: Approve/Park-Blocked/Park-Nursery; Stage-23: Continue/Kill/Park).
- **Venture detail (chairman-nested, UIUX-B FR-3)**: renders in-shell with a live stage-journey stepper; MarketLens shows a real promotion-gate card ("Awaiting Decision").
- **Vision**: Alignment, Reviews, Portfolio, Performance tabs real and data-rich (weekly review markdown with data-freshness warnings; strategic roadmaps including the quit-threshold plan; real system alerts).
- **Real and healthy**: `/chairman/stage-config` (full 21+ stage list with gate badges), `/chairman/governance/pipeline` ("25 stages across 6 chunks. 10 mandatory gates.", per-stage toggles), `/chairman/preferences`, `/chairman/research-lab` (best-built surface, see #15), `/builder` + `/builder/queue`, both discovery dialogs on `/chairman/opportunities` (6 strategies), legacy redirects, and the screensaver ("honest-degrade (no fabricated numbers)" — and it does).
- **Honest degradation culture**: survival strip's "read-only · honest-degrade" caption, EVA chat's saved-your-message error bubble, screensaver's "Income not yet measured". Where the console fails, it mostly fails honestly — the failures above are the exceptions that don't.

## Adjudication of the stub-grep packet (input → verdicts)

| Packet claim | Verdict on landed main (1936a703) |
|---|---|
| Review-Now decision-detail 404 (CONFIRMED bug) | **FIXED by UIUX-B** — route removed, in-place sheet + deep-link fallback exercised live. Packet swept the pre-B feature branch. |
| 5 hardcoded confidence fallbacks in `chairmanEvidenceService.ts` | **Confirmed present, still unrendered** (legacy `src/pages/api/v2/chairman/decisions.ts` consumer only). Latent. |
| 4 TODO-fenced features | **Confirmed**: StagePage placeholder now live P2 (#14); CustomerServiceTab "—" tiles reachable via Operations; promotion-gate generic fallback in code; chairman-v3 RevenueTab still dead code. |
| 5 orphaned routes | **Confirmed unchanged** (#15). |
| Zero mock-imports on prod paths; zero dead flags | **Accepted** (explicit methodology; nothing observed live contradicts it). |
| DecisionSheet.tsx / DecisionGateActions latent id-mismatch duplicates | **Still dead code on main**; any future wiring must use the sheet's try-then-fallback pattern. |

## Coverage map

Taste verdict scale: **meets-bar** (would hold up against the reference library) / **competent-utilitarian** (clean but unambitious) / **below-bar** (design debt visible) / **n/a** (too broken to grade).

| Surface | Reality | Taste |
|---|---|---|
| `/chairman` briefing | exercised deep | below-bar (#17: concatenated dashboards, dead tiles) |
| `/chairman/decisions` + sheets (3 gate types) | exercised deep incl. one authorized mutation | below-bar (#1/#8: blind sheets, telemetry rows) |
| `/chairman/ventures` list + FMO dialog | exercised | competent-utilitarian (clear tiles, good "Promo @ N (1 away)" copy) |
| `/chairman/ventures/:id` ×2 | exercised (stepper) | competent-utilitarian; promotion-gate card is the right idea, "Readiness: —" undercuts it |
| `/chairman/ventures/:id/stage/24` | exercised | n/a (placeholder, #14) |
| `/chairman/ventures/:id/separation-plan` | surveyed | n/a (panels dead via #3; raw-slug h1) |
| `/chairman/vision` — 6 tabs | all exercised | Performance/Reviews competent-utilitarian and data-rich; Alignment competent (trend interactions good, data oddities #19); Pipeline/Capabilities n/a (broken) |
| `/chairman/operations` | surveyed + traced | n/a (panels dead via #3/#4) |
| `/chairman/services` | surveyed | competent-utilitarian (honest empty) |
| `/chairman/stage-config` | surveyed | competent-utilitarian |
| `/chairman/governance/pipeline` | surveyed (toggles not fired) | meets-bar for an admin surface — clearest information design in the console |
| `/chairman/governance/batch-review` | exercised + traced (#12) | n/a (never finishes loading) |
| `/chairman/preferences` | surveyed (saves not fired) | competent-utilitarian |
| `/chairman/research-lab` | surveyed | meets-bar — best-built surface, orphaned (#15) |
| `/chairman/portfolio/exit-readiness` | surveyed | n/a (permanent skeleton, #3) |
| `/chairman/launch` | surveyed + traced | half: KPI row competent; Timeline n/a (#4) |
| `/chairman/eva-chat` | exercised (write #1) | competent-utilitarian; error bubble copy is genuinely good |
| `/chairman/eva-friday` | surveyed | visual meets-bar (best splash in the console) over a dead CTA (#13) |
| `/chairman/opportunities` + dialogs | exercised | competent-utilitarian |
| `/chairman/screensaver` | surveyed | meets-bar for its job — only surface with presentation intent |
| `/builder`, `/builder/queue`, `/builder/inbox` | surveyed | competent-utilitarian (inbox: see #24) |
| Legacy redirects (`/chairman/portfolio`, `/chairman/gates`, catch-all) | exercised | n/a |
| Shell: sidebar/topbar/⌘K/attention rail | exercised | sidebar/topbar competent; ⌘K broken (#9); attention rail below-bar (#11) |
| Login | exercised | competent-utilitarian |

**NOT assessed** (first-class findings where material — #22, #23): mobile viewport / ShellMobileTabBar (#23); production-origin edge-function + proxy behavior (#22); WCAG/accessibility beyond observing skip-links exist; destructive mutations (Approve/Kill/Continue, venture cancel/delete, pipeline pause/lock, preference saves, Start Discovery) — deliberately not fired beyond the one authorized Park probe; standalone `/ventures/*` tree except where chairman surfaces route into it (#11); EVA chat with a working sensemaking service (#18/#22); long-run behaviors (screensaver refresh cycles, token-budget accrual, SLA countdowns — no SLAs configured on any live decision).
