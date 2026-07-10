# Chairman Console — Stub/Placeholder Evidence Packet

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: Claude (fleet worker, cheap-legwork evidence-packet pattern)
**Last Updated**: 2026-07-10
**Tags**: chairman-console, stub-audit, evidence-packet, read-only, ehg-frontend

## Purpose

Chairman-requested cheap legwork for the chairman console assessment. Grep the
`rickfelix/ehg` FRONTEND repo (`C:\Users\rickf\Projects\_EHG\ehg`) for stub
signatures across chairman-facing surfaces: placeholder/hardcoded data,
routes with no handler, TODO-fenced features, mock imports on prod paths,
dead feature flags, and dead-ended CTAs (the 404 decision-detail / broken
Review-Now class). **Read-only — no fixes applied.** A Fable seat adjudicates
REAL vs STUB from this packet; every claim below is cited to exact
`file:line` and every clean sweep is stated explicitly so absence claims are
verifiable, not assumed.

## Scope

- Repo: `C:\Users\rickf\Projects\_EHG\ehg` (branch at time of sweep:
  `feat/SD-EHG-PRODUCT-PARITY-ADVISORY-PANEL-GROUNDING-001`, working tree
  read-only — no source edits made)
- Surface: the Chairman Console (`/chairman/*`) — `src/pages/chairman-v3/**`
  (24 pages), `src/components/chairman-v3/**` (~120 components across
  `gates/`, `decisions/`, `operations/`, `opportunities/`, `services/`,
  `ventures/`, `governance/`, `PortfolioBalance/`, `VisionDashboard/`,
  `survivability/`, `research-lab/`, `shell/`, `pipeline/`, `batch-review/`,
  `shared/`), `src/hooks/chairman-v3/**` (3 files), `src/lib/chairman-v3/**`,
  `src/routes/chairmanRoutesV3.tsx`, `src/components/chairman-v3/shell/chairman-nav-config.ts`,
  `src/services/chairmanEvidenceService.ts`, `src/mocks/data/chairman.mock.ts`
- Method: exhaustive per-file read (not filename-guessing) for each of the 6
  signature classes below, cross-checked route↔nav-config↔page-component
  wiring, and cross-checked every trigger/destination pair for the
  dead-ended-CTA class by reading both sides of the wire.

## Findings by route/component

### `src/services/chairmanEvidenceService.ts` — placeholder/hardcoded confidence scores

- `src/services/chairmanEvidenceService.ts:173` — `confidence: artifact.quality_score || 80` — fabricated fallback confidence for the "fact" evidence bucket when `quality_score` is falsy.
- `src/services/chairmanEvidenceService.ts:184` — `confidence: artifact.quality_score || 60` — same pattern, "assumption" bucket.
- `src/services/chairmanEvidenceService.ts:424` — `const simulationConfidence = simulationCount > 0 ? 70 : 50;` — a two-value hardcoded confidence score standing in for a computed one.
- `src/services/chairmanEvidenceService.ts:556` — duplicate of the line-173 fallback in the batched (N+1-avoidance) code path.
- `src/services/chairmanEvidenceService.ts:568` — duplicate of the line-184 fallback in the batched code path.

**Reachability caveat**: this service's `FourBuckets` evidence output is currently consumed only by the legacy `src/pages/api/v2/chairman/decisions.ts` endpoint — a repo-wide grep for `FourBuckets`/`chairmanEvidenceService` inside the chairman-v3 page/component/hook tree returned zero matches. No chairman-v3 UI currently renders these numbers. Flagged anyway because the file is a real production service in scope, and the fabricated-confidence pattern is exactly the signature class requested.

### `src/routes/chairmanRoutesV3.tsx` / `chairman-nav-config.ts` — orphaned routes (no handler *reachability* gap, not a broken handler)

All 24 lazy-loaded page imports resolve to real, substantial files (none stub/empty); every nav-config entry matches a registered route. However, 5 registered routes have **no nav entry and no in-app `<Link>`/`navigate()` reference anywhere in `src`**, so a real chairman user has no path to reach them short of typing the URL:

- `src/routes/chairmanRoutesV3.tsx:163` — `/chairman/research-lab` (`ResearchLabPage`)
- `src/routes/chairmanRoutesV3.tsx:174` — `/chairman/portfolio/exit-readiness` (`ExitReadinessPage`)
- `src/routes/chairmanRoutesV3.tsx:192` — `/chairman/launch` (`LaunchWorkflowPage`)
- `src/routes/chairmanRoutesV3.tsx:209` — `/chairman/eva-friday` (`FridayMeetingPage`)
- `src/routes/chairmanRoutesV3.tsx:227` — `/chairman/governance/batch-review` (`BatchReviewPage`)

(`/chairman/decisions/:id`, `/chairman/ventures/:id/stage/:num`, and
`/chairman/ventures/:id/separation-plan` are expected drill-down-only routes
with no nav entry by design — not flagged. `/chairman/screensaver` is
intentionally outside the shell/nav per its own comment — not flagged.)

Adjacent dead-code note: `src/pages/chairman-v3/CapabilityRegistryPage.tsx`
(136 lines, fully built) is not imported by `chairmanRoutesV3.tsx` at all —
per the route file's own comment, superseded by the Capabilities tab now
embedded in `VisionAlignmentPage.tsx`.

### `src/components/chairman-v3/DecisionGateDetailSheet.tsx` — TODO-fenced gate-type action tailoring

- `src/components/chairman-v3/DecisionGateDetailSheet.tsx:138` — `if (isPromotionGate(decision.stage)) return "generic"; // TODO: add promotion_gate to DecisionActions`. Live in the Decision Queue (`/chairman/decisions`, rendered via `DecisionQueueView.tsx:452`). For promotion-gate decisions the action-button set falls back to the generic Approve/Reject pair instead of a dedicated promotion-gate action set — buttons work, but aren't gate-type-tailored as the TODO calls out.

### `src/pages/chairman-v3/StagePage.tsx` — TODO-fenced stage-detail content

- `src/pages/chairman-v3/StagePage.tsx:71,77-79` — `{/* Stage content placeholder */}`, body text "Detailed stage content for '{stageInfo.stageName}' will be rendered here." The `/chairman/ventures/:id/stage/:num` drill-down page renders only a header/back-button and an explicit placeholder card — no stage-specific content, artifacts, or decisions are shown.

### `src/components/chairman-v3/operations/CustomerServiceTab.tsx` — TODO-fenced, live and reachable

- `src/components/chairman-v3/operations/CustomerServiceTab.tsx:1-65` — header comment "Placeholder using available venture data. Will be enriched when customer service pipeline data is wired." All four metric tiles hardcode `—`. **Live and reachable**: imported by `src/components/ventures/OperationsMode.tsx:25` (rendered at line 176), reached from the chairman Operations surface.

### `src/components/chairman-v3/operations/RevenueTab.tsx` — TODO-fenced, dead code (not currently reachable)

- `src/components/chairman-v3/operations/RevenueTab.tsx:1-70` — same "Placeholder … Will be enriched when financial pipeline data is wired in SD-LEO-FEAT-EVA-PIPELINE-GUI-001" pattern. **Not imported anywhere** — a different `RevenueTab` at `src/components/ventures/operations-mode/RevenueTab.tsx` is used instead. Flagged for completeness (lives inside the audited tree) but is dead code, not a live broken feature.

### `src/components/chairman-v3/BriefingDashboard.tsx` ↔ `src/hooks/chairman-v3/useDecisionDetail.ts` — CONFIRMED: the named "Review Now" 404 class

- **Trigger**: `src/components/chairman-v3/BriefingDashboard.tsx:101-104` — `handleDecisionClick` → `navigate(\`/chairman/decisions/${decision.id}\`)`, wired to `DecisionStack`'s `onDecisionClick` (any card in the "Pending Decisions" panel on the `/chairman` landing page — the primary Daily Briefing surface).
- `decision.id` sources from `src/hooks/useChairmanDashboardData.ts:169-186`, which queries the `chairman_pending_decisions` view — a `UNION ALL` of three tables (`supabase/migrations/20251216000001_chairman_unified_decisions.sql:100-232`), each contributing its own PK as `id`: `escalation` → `agent_messages.id`, `gate_decision` → `venture_decisions.id`, `chairman_approval` → `chairman_decisions.id`.
- **Destination**: route `/chairman/decisions/:id` (`chairmanRoutesV3.tsx:95`) → `src/components/chairman-v3/decisions/DecisionDetail.tsx:133-135` reads `useParams<{id}>()` correctly, calls `useDecisionDetail(id)` at `src/hooks/chairman-v3/useDecisionDetail.ts:88-94`, which queries **only** `chairman_decisions.eq("id", decisionId).single()`.
- **Root cause**: only decisions where `decision_type === "chairman_approval"` (one of three union sources) resolve. Any `escalation` or `gate_decision` item (the more common pending-decision types) has an `id` absent from `chairman_decisions`, so the query returns nothing and `DecisionDetail` renders the "Decision Not Found — This decision may have been resolved or doesn't exist" state.
- **Confidence**: CONFIRMED — both the trigger (component + upstream hook + view SQL) and the destination (page + hook + query) were read; the ID-space mismatch is unambiguous and reproducible for any escalation/gate-type item.

Same root-cause pattern also exists, but is currently unreachable dead code:
`src/components/chairman-v3/decisions/DecisionSheet.tsx:81` (identical
`navigate` pattern using the same unified-view `id`) — not imported anywhere
in `src`, so it can't fire today. `src/components/chairman-v3/DecisionGateActions.tsx`
is likewise orphaned (no importers). Both inherit the identical bug if ever
wired up.

The **correct** pattern already exists in the same codebase and should be the
template for a fix: `DecisionQueueView.tsx` (the actual `/chairman/decisions`
queue page) does not navigate to `/chairman/decisions/:id` at all — row
clicks open an in-page `DecisionGateDetailSheet` (`DecisionQueueView.tsx:400,452`),
whose own query (`DecisionGateDetailSheet.tsx:60-91`) tries `chairman_decisions`
first, then falls back to the unified view by `id` — correctly handling all
three ID sources.

## Signature-class coverage matrix (explicit NOT-FOUNDs)

| # | Signature class | Result | Sweep coverage |
|---|---|---|---|
| 1 | Placeholder/hardcoded data | **5 hits**, all in `chairmanEvidenceService.ts` (see above) | All 24 pages, all ~120 components (incl. `survivability/` — verified "honest-degrade, never fabricate" by design — and `gates/*Renderer.tsx` — honest `"No … available"` fallbacks), all 3 chairman-v3 hooks, `lib/chairman-v3/toast-helpers.ts`, `chairmanRoutesV3.tsx` confirmed clean. `CustomerServiceTab`/`RevenueTab` docblocks say "placeholder" but render honest `—`/"Awaiting data", not fabricated numbers — counted under TODO-fenced, not this class. |
| 2 | Routes with no handler | **NOT FOUND** (0 broken handlers); 5 orphaned/unreachable routes noted separately above | All 24 lazy imports in `chairmanRoutesV3.tsx` resolve to real non-empty files; every `chairman-nav-config.ts` entry matches a registered route; `ChairmanRoutesV3` confirmed mounted (`src/routes/index.tsx:51`); nav-config confirmed consumed by `ChairmanSidebar.tsx`/`ShellMobileTabBar.tsx` (not dead config itself) |
| 3 | TODO-fenced features | **4 hits** (see above: `DecisionGateDetailSheet.tsx`, `StagePage.tsx`, `CustomerServiceTab.tsx`, `RevenueTab.tsx`) | Regex sweep (`TODO\|FIXME\|HACK\|XXX\|not implemented\|coming soon\|not yet supported\|unimplemented\|TBD\|under construction\|work in progress\|WIP\|stub\|placeholder`) across all 24 pages, all component subdirs, all 3 hooks, routes + nav-config files; all `placeholder="..."` hits reviewed were ordinary form-input text, not feature stubs |
| 4 | Mock imports on prod paths | **NOT FOUND** | Read `src/mocks/data/chairman.mock.ts` + barrel/registry/config; traced all 8 codebase-wide importers of `src/mocks/**` — every one gated behind the explicit, default-`false` `isMockMode()` check (`?mock=true` / `ehg_demo_mode` localStorage / `VITE_MOCK_MODE`) with a visible "Demo Mode Active" banner when on; none silently fall back to mock data on a real-data error. Zero imports from `src/mocks/**` inside the chairman-v3 tree itself (the one "mock" text hit is a comment: `InitiativeRollupView.tsx:7`, "Live data only — no mocks") |
| 5 | Dead feature flags | **NOT FOUND** | Regex sweep (`useFeatureFlag\|isEnabled\|featureFlag\|FEATURE_\|flags\.\|Enabled\|Beta\|Experimental\|canary\|rollout\|isHidden\|shouldShow\|import.meta.env`, plus a chairman-specific cross-check) across the full chairman-v3 tree — zero flag-gating of any kind. The repo's real feature-flag infra (`src/integrations/feature-flags/useFeatureFlag.ts`, `src/constants/featureFlags.ts`) is confirmed used only outside chairman-v3 (Stage-17 GVOS, Ventures page) |
| 6 | Dead-ended CTAs | **1 CONFIRMED bug** (decision-detail 404, above) + 1 latent duplicate in dead code | Read both sides of the wire for the named "Review Now" class (route param names, query field names, upstream ID source) plus swept every other `onClick=`/`<Link`/`navigate(`/`window.location` in the tree — no `undefined`-interpolated route params, no no-op/console.log-only handlers found elsewhere; `/ventures/:id`, `/builder*`, `/chairman/governance/pipeline`, `/chairman/opportunities`, `/chairman/eva-chat?ask=`, breadcrumbs, and all dialog/mutation-only CTAs (`RejectVentureDialog`, `CancelVentureDialog`, `DeleteVentureDialog`, `NurserySection`, `BlueprintCard`, `ClaudeCodeLink(Out)`, `PathSelector`, `ServicesDashboard`, `PipelineGovernancePage` batch actions) verified correctly wired |

## Summary for adjudication

- **1 confirmed live bug**: the "Review Now" decision-detail 404, root-caused
  to an ID-space mismatch across a 3-source `UNION ALL` view
  (`chairman_pending_decisions`) versus a single-table query
  (`useDecisionDetail.ts` reads only `chairman_decisions`). A working
  reference pattern (`DecisionGateDetailSheet.tsx`'s try-unified-view
  fallback) already exists in the same codebase.
- **5 fabricated-confidence-score hardcodes** in `chairmanEvidenceService.ts`,
  currently not rendered by any live chairman-v3 UI (reachability caveat
  noted).
- **4 TODO-fenced features**, 2 of which are live/reachable
  (`DecisionGateDetailSheet.tsx` gate-type fallback, `CustomerServiceTab.tsx`)
  and 2 of which are dead code (`RevenueTab.tsx`, and the `StagePage.tsx`
  drill-down content gap is live but low-traffic).
- **5 unreachable-but-registered routes** (no nav path, URL-only access).
- **Zero** mock-import-on-prod-path findings and **zero** dead-feature-flag
  findings — both classes swept clean with explicit methodology above.

## Related

- Chairman console assessment brief: `chairman-console-assessment-prompt.md`
  (repo root of `ehg`)
- Coordinator task: queued STUB-GREP evidence-packet request,
  2026-07-10T14:34:42Z
