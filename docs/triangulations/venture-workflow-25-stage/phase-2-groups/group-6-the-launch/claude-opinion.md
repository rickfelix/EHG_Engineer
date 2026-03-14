# Claude Phase 2 Opinion -- Group 6: THE_LAUNCH (Stages 23-25)

This group represents the highest-stakes phase in the entire 25-stage pipeline: the transition from building to launching. My analysis is grounded in line-by-line source code review of all three stage components, the venture-workflow.ts configuration, and a direct comparison against Stage 13's working kill gate pattern. The findings confirm the Phase 1 consensus but reveal additional architectural concerns that neither OpenAI nor Gemini fully articulated.

---

## Stage 23: `Stage23ProductionLaunch.tsx` [Actually: Marketing Preparation]

**File**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage23ProductionLaunch.tsx` (199 LOC)
**Config**: `C:\Users\rickf\Projects\_EHG\ehg\src\config\venture-workflow.ts`, line 273-281: `gateType: 'kill'`, `gateLabel: 'KILL GATE: Launch readiness - venture can be terminated'`

### Scores

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Data Handling | 7/10 | Safe extraction with `Array.isArray` guard (line 70), nullish coalescing on metrics (lines 73-75), proper `ADVISORY_EXCLUDE` filtering. Loses points for no empty-state handling -- if `ad` is undefined, the entire component renders nothing without feedback. |
| Visual Hierarchy | 4/10 | Strategy summary and target audience appear at top (lines 91-103), which is correct for content display, but the *most critical piece of information* -- the kill gate decision -- is entirely absent. The visual hierarchy is fundamentally broken because the highest-priority element does not exist. |
| Responsiveness | 5/10 | Fixed `grid-cols-3` on line 106 with no responsive breakpoints. On mobile, three metric cards at equal width will compress to ~100px each, making `text-2xl` numbers overflow. No `sm:` or `md:` breakpoints anywhere in the component. |
| Gate Implementation | 0/10 | **Confirmed P0 Bug.** The config declares `gateType: 'kill'` at `venture-workflow.ts:277`. The component's own JSDoc comment on line 1 says "kill gate." But the component body contains zero gate-related code. Specifically, Stage 23 is missing all of the following elements that Stage 13 (`Stage13TechStackInterrogation.tsx`) implements: (1) `DECISION_BANNER` constant (Stage 13, lines 39-43), (2) `DECISION_BADGE` constant (Stage 13, lines 45-49), (3) `DECISION_LABELS` constant (Stage 13, lines 51-55), (4) decision extraction from `ad?.decision` (Stage 13, line 77), (5) reasons extraction from `ad?.reasons` (Stage 13, line 78), (6) conditional banner rendering block (Stage 13, lines 107-142). Stage 23 has none of these. The word "decision" does not appear once in the component body. The word "gate" does not appear once in the component body. This means a venture can sail through the final kill gate checkpoint with no visual indication that a life-or-death decision was even made. |
| Accessibility | 6/10 | Badge contrast is adequate with dark mode variants (lines 30-46). `text-[10px]` metric labels (line 109) are below WCAG minimum recommended size. No ARIA labels on metric cards. The Collapsible component uses `asChild` on the trigger (line 172), which relies on Radix's built-in keyboard handling -- acceptable but not explicitly tested. |

### Top 3 Strengths
1. **Comprehensive badge taxonomy**: `TYPE_COLORS` (lines 36-47) covers 10 marketing item types and `PRIORITY_COLORS` (lines 29-34) covers 4 levels, creating a highly scannable list with distinct visual identity per item.
2. **Clean data normalization**: The `ADVISORY_EXCLUDE` pattern (lines 77-82) filters rendered fields from the raw advisory dump, preventing duplication. The fallback `items.length` on `totalItems` (line 73) is defensive.
3. **Contextual framing**: Strategy summary (lines 91-95) and Target Audience (lines 98-103) appear before the item list, giving users orientation before details. The pink and violet color coding creates clear visual sections.

### Top 3 Concerns
1. **[Gap Importance: 5 -- Critical] Complete absence of kill gate rendering.** This is not a partial implementation or a styling issue -- it is a total omission of the gate decision UI in a component that the config, the JSDoc, and the SSOT all declare as a kill gate. The backend generates a decision; the frontend discards it. Any `decision` field in `advisoryData` falls through to the advisory details collapsible as an unformatted key-value pair, stripping it of all semantic meaning.
2. **[Gap Importance: 4 -- Significant] Triple naming mismatch.** Config says "Production Launch" (`venture-workflow.ts:274`), component is `Stage23ProductionLaunch`, JSDoc says "Marketing Preparation renderer", backend file is `stage-23-marketing-prep.js`. A developer searching for "production launch" logic will find marketing items. A developer searching for "marketing prep" will not find this file by its export name.
3. **[Gap Importance: 3 -- Moderate] No loading or empty states.** When `stageData.advisoryData` is undefined or empty (e.g., during initial AI generation), the component renders an empty `<div className="space-y-3">` -- a blank white box with no skeleton, spinner, or "awaiting analysis" message. This is the same pattern across all three stages, but at a kill gate it is especially dangerous because silence looks like approval.

### Top 3 Recommendations
1. **Implement the kill gate banner immediately.** Copy the `DECISION_BANNER`/`DECISION_BADGE`/`DECISION_LABELS` pattern from `Stage13TechStackInterrogation.tsx` (lines 39-55), adapt the decision field name to whatever the `stage-23-marketing-prep.js` backend emits (likely `decision` or `gate_decision`), and render it as the first element in the JSX return, before the strategy summary. The banner must appear above all content, not inside a collapsible.
2. **Rename the component and file** to `Stage23MarketingPreparation.tsx` and update `venture-workflow.ts:274` `stageName` to `'Marketing Preparation'`. Alternatively, if the intent is truly a production launch gate, redesign the backend and component to match that intent. The current state where name, content, and config all disagree is the worst possible outcome.
3. **Add responsive grid breakpoints**: Change line 106 from `grid-cols-3` to `grid-cols-1 sm:grid-cols-3`. Add an empty state: when `!ad`, render a `"Stage analysis in progress..."` placeholder.

---

## Stage 24: `Stage24GrowthMetricsOptimization.tsx` [Actually: Launch Readiness]

**File**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage24GrowthMetricsOptimization.tsx` (279 LOC)
**Config**: `C:\Users\rickf\Projects\_EHG\ehg\src\config\venture-workflow.ts`, line 283-289: `gateType: 'none'`

### Scores

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Data Handling | 8/10 | Extracts `go_no_go_decision`, `decision_rationale`, `readiness_score`, `all_checks_pass`, `readiness_checklist` (as `Record<string, { status, evidence, verified_at }>`), `launch_risks` array, and three operational plan strings (lines 70-79). Each with appropriate type assertions and safe defaults. `ADVISORY_EXCLUDE` properly prevents double-rendering of all extracted fields. |
| Visual Hierarchy | 8/10 | Decision banner at top (lines 94-114), then metrics, then checklist, then risks, then operational plans in a collapsible. This is the correct information priority for a readiness gate: decision first, evidence second, contingency plans third. |
| Responsiveness | 5/10 | Same `grid-cols-3` without responsive breakpoints (line 117). Checklist evidence text has `max-w-[50%] text-right` (line 168) which will force awkward wrapping on narrow viewports. Risk mitigation blocks at `text-xs` (line 196) are dense but functional. |
| Gate Implementation | 4/10 | The component implements a visually complete go/no-go decision gate: `DECISION_BANNER` with three states (lines 29-33), `DECISION_BADGE` with three states (lines 35-38), and proper label rendering including "GO", "CONDITIONAL GO", "NO-GO" (line 102). However, the config at `venture-workflow.ts:287` sets `gateType: 'none'`, meaning the orchestration engine will not block progression regardless of the decision displayed. This is a phantom gate -- it shows the user a critical decision banner that has no enforcement power. The UI promises a gate; the backend ignores it. Score is 4 rather than 0 because the UI implementation itself is well-crafted and would work correctly if the config were updated. |
| Accessibility | 7/10 | Check status badges use four states (`pass`, `fail`, `pending`, `waived`) with distinct color combinations (lines 41-46). The `CHECKLIST_LABELS` mapping (lines 55-60) provides human-readable labels for programmatic keys. However, the "Checks" metric card (lines 131-135) uses only color (green/red) to indicate pass/fail status with no icon differentiation, which fails WCAG 1.4.1 (Use of Color). |

### Top 3 Strengths
1. **Readiness checklist implementation is exemplary.** The `Record<string, { status, evidence, verified_at }>` extraction (line 74) handles arbitrary checklist keys, the `CHECKLIST_LABELS` mapping (lines 55-60) provides friendly names for known keys with a `key.replace(/_/g, " ")` fallback for unknown keys (line 165), and evidence is displayed inline. This is auditor-grade visibility.
2. **Risk-mitigation pairing is well-designed.** Each risk renders its severity badge alongside the risk text, with mitigation in a visually distinct emerald-tinted block below (lines 196-199). The visual grouping makes it immediately clear which mitigation addresses which risk.
3. **Decision banner visual quality matches Stage 13.** The `DECISION_BANNER`/`DECISION_BADGE` pattern (lines 29-38) with three-state color mapping and conditional rationale display (line 112) is structurally identical to Stage 13's working kill gate, proving the developer understood the pattern and chose to implement it here.

### Top 3 Concerns
1. **[Gap Importance: 5 -- Critical] Phantom gate with no enforcement.** The irony is sharp: Stage 23 (which IS configured as a kill gate) renders no gate UI, while Stage 24 (which is configured as `gateType: 'none'`) renders a full gate UI. The decision banner at lines 94-114 displays "GO" / "CONDITIONAL GO" / "NO-GO" to the user, creating the strong impression that this is an enforced checkpoint. But the config says `none`, so the orchestrator will auto-advance regardless. If a venture gets a "NO-GO" decision at Stage 24, the UI shows a red banner... and then the venture proceeds to Stage 25 anyway. This is worse than no gate at all -- it actively deceives the user into thinking a safety net exists.
2. **[Gap Importance: 4 -- Significant] Naming mismatch.** "Growth Metrics Optimization" suggests post-launch A/B testing and funnel optimization. The actual content -- readiness checklist, launch risks, incident response plans -- is purely pre-launch readiness. The config `stageName` at `venture-workflow.ts:284` says "Analytics & Feedback", adding a third contradictory name. So we have: component name = "Growth Metrics Optimization", config name = "Analytics & Feedback", actual content = "Launch Readiness".
3. **[Gap Importance: 2 -- Minor] Operational plans hidden in collapsible.** Incident response, monitoring, and rollback plans (lines 209-245) are behind a collapsed section (`plansOpen` defaults to `false` on line 67). At a launch readiness gate, these plans should arguably be visible by default since they are direct evidence for the go/no-go decision.

### Top 3 Recommendations
1. **Promote to an enforced gate.** Change `venture-workflow.ts:287` from `gateType: 'none'` to `gateType: 'kill'` (or create a new `'go_no_go'` gate type if the semantics differ from kill). The UI is already built and working -- the only missing piece is the config line. This is a one-line fix with massive safety implications.
2. **Rename component and file** to `Stage24LaunchReadiness.tsx`. Update `venture-workflow.ts:284` `stageName` to `'Launch Readiness'`. This aligns the config, the component, and the backend (`stage-24-launch-readiness.js`) to a single coherent name.
3. **Default operational plans to open**: Change line 67 from `useState(false)` to `useState(true)` for `plansOpen`. At a readiness gate, the evidence supporting the decision should be visible without requiring the user to click.

---

## Stage 25: `Stage25ScalePlanning.tsx` [Actually: Launch Execution]

**File**: `C:\Users\rickf\Projects\_EHG\ehg\src\components\stages\Stage25ScalePlanning.tsx` (347 LOC)
**Config**: `C:\Users\rickf\Projects\_EHG\ehg\src\config\venture-workflow.ts`, line 291-299: `gateType: 'none'` (appropriate for terminus)

### Scores

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Data Handling | 9/10 | Handles three levels of nesting: `opsHandoff?.monitoring?.dashboards` (line 109), `opsHandoff?.escalation?.contacts` (line 111), `opsHandoff?.escalation?.sla_targets` (line 112), `opsHandoff?.maintenance` (line 113). Each with `Array.isArray` guards and non-null assertions only after the guard. The deeply typed `opsHandoff` interface (lines 91-107) is the most sophisticated data shape in the entire group. Fallback counting on `activeCount` (line 87) gracefully handles both pre-computed and derived values. |
| Visual Hierarchy | 9/10 | Pipeline terminus banner first (lines 129-144) -- this is the single most important signal ("you have launched"). Launch summary second (lines 147-151). Metrics third (lines 154-179). Distribution channels fourth. Operations handoff last. The visual priority exactly matches the user's mental model at launch: "Am I live? What's the overview? What's running? What do I hand off?" |
| Responsiveness | 6/10 | Same `grid-cols-3` issue (line 154). However, the operations handoff section uses stacked layouts within the collapsible (lines 234-308) that will adapt better to narrow viewports. Distribution channel rows use `flex items-center justify-between` (line 193) which wraps more gracefully than rigid grids. The activation date badge at line 206 could overlap the channel name on very narrow screens. |
| Gate Implementation | 9/10 | As the pipeline terminus, Stage 25 correctly uses no gate (`gateType: 'none'` at `venture-workflow.ts:297`). Instead, it renders a "LAUNCHED" banner conditionally on `pipelineTerminus` (lines 129-144) -- a boolean flag from the backend indicating the venture has completed the pipeline. This is the right semantic: a terminus is not a decision point, it is a state transition. The emerald color scheme (lines 130-135) visually distinguishes it from both kill gates (red) and promotion gates (blue), creating a clear "celebration" moment. The only gap is the lack of a "next steps" call-to-action after the terminus. |
| Accessibility | 8/10 | Five channel status colors (lines 51-57) and seven channel type colors (lines 59-67) all include dark mode variants. Alert severity badges (lines 69-73) use three distinct levels. Escalation contacts display response time alongside team name (line 276), providing temporal context. The `text-[8px]` on alert severity badges (line 253) is extremely small and borderline for readability. |

### Top 3 Strengths
1. **Operations Handoff is a design exemplar.** The nested structure (lines 229-309) organizes five categories of operational data -- Dashboards, Alerts, Escalation Contacts, SLA Targets, Maintenance -- each with its own color-coded header, its own data shape, and its own rendering logic. The Dashboards section shows name + owner (lines 236-239). Alerts show severity badge + name + condition (lines 251-259). Escalation contacts show level badge + team + response time (lines 271-278). SLA targets render as key-value pairs (lines 288-293). Maintenance shows schedule, backup strategy, and update policy (lines 302-306). This is genuinely excellent information architecture for a handoff document.
2. **Pipeline terminus banner creates a definitive psychological transition.** The "LAUNCHED" badge at line 133 with "Pipeline Complete -- Operations Mode" text at line 135 and optional go-live timestamp (lines 136-140) provides an unambiguous signal that the venture has crossed from "building" to "running." The emerald-500 color scheme is distinct from any other banner in the 25-stage pipeline.
3. **Channel activation tracking is thorough.** Five status states (active, activating, inactive, failed, paused) at lines 51-57 and seven type categories (app_store, web, social, email, partner, marketplace, direct) at lines 59-67 with dual-badge rendering per channel row (lines 195-203) provide operational visibility into the distribution state at launch.

### Top 3 Concerns
1. **[Gap Importance: 4 -- Significant] Naming mismatch.** Component is `Stage25ScalePlanning`, config says "Optimization & Scale" (`venture-workflow.ts:294`), backend is `stage-25-launch-execution.js`, and the actual content is Launch Execution with an operations handoff. "Scale Planning" implies a future-oriented strategic exercise, but this stage is about the immediate present: channels are activating, alerts are firing, dashboards are being monitored. The disconnect is directional -- the name points forward, the content points at right now.
2. **[Gap Importance: 3 -- Moderate] Operations handoff defaults to collapsed.** `opsOpen` is initialized to `false` (line 80). The operations handoff block is arguably the entire raison d'etre of this terminal stage -- it is what the user navigated here to see. Collapsing it by default adds one unnecessary click at the most important moment. The dashboard URLs, alert conditions, and escalation contacts are the first things an operations team needs after launch.
3. **[Gap Importance: 3 -- Moderate] No post-launch exit path.** Stage 25 marks "Pipeline Complete" but provides no call-to-action for what comes next. There is no link to an external monitoring dashboard, no "Enter Operations Mode" button, no hypercare period definition, no ownership transfer form. The venture pipeline ends at a wall. A user seeing "LAUNCHED" may ask: "Now what?" and the UI has no answer.

### Top 3 Recommendations
1. **Rename to `Stage25LaunchExecution.tsx`** and update `venture-workflow.ts:294` to `stageName: 'Launch Execution'`. This aligns with the backend file `stage-25-launch-execution.js` and the actual content rendered.
2. **Default operations handoff to open.** Change line 80 from `useState(false)` to `useState(true)`. At the pipeline terminus, the operations handoff IS the primary content. Alternatively, remove the collapsible wrapper entirely and render the operations data as always-visible sections.
3. **Add a post-launch CTA section.** After the operations handoff card, render a "Next Steps" section with links to monitoring dashboards (already available in `opsHandoff.monitoring.dashboards`), the runbook URL (`opsHandoff.escalation.runbook_url`), and a "hypercare period" definition if available. This transforms the terminus from a dead end into a transition point.

---

## Group 6 Synthesis: THE_LAUNCH

### Group-Level Scores

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Logic & Flow | 7/10 | The conceptual sequence Marketing Preparation -> Launch Readiness -> Launch Execution is sound and tells a coherent launch story. The three stages represent preparation, validation, and execution -- a complete launch lifecycle. Score is reduced because the gate inversion (missing where required, present where not enforced) breaks the decision flow at the two most critical junctures. |
| Functionality | 3/10 | Stage 23's kill gate does not render (0/10 gate score). Stage 24's go/no-go gate renders but is not enforced (4/10 gate score). Only Stage 25's terminus banner works as intended. Two out of three stages have fundamental functionality gaps in their primary purpose. The content rendering (marketing items, checklists, channels) works correctly, preventing a score of 1-2. |
| UI/Visual Design | 7/10 | When the components render, they look polished. Stage 25's operations handoff block is genuinely best-in-class. Badge taxonomies are comprehensive. Color schemes are consistent with dark mode support throughout. The missing gate banner on Stage 23 is a design gap, not a design flaw -- the design was never created, not poorly created. |
| UX/Workflow | 4/10 | Three naming mismatches across every stage in the group, a missing kill gate at the moment a venture is about to go live, and a phantom gate that shows a decision with no enforcement power. A user navigating this group cannot trust what they see. The "LAUNCHED" terminus banner is the sole UX bright spot. |
| Architecture | 4/10 | Data extraction patterns are consistent and defensive across all three components. TypeScript interfaces are well-defined. But the architecture-level failures are severe: config-component desynchronization (Stage 23 declares kill, renders nothing; Stage 24 declares none, renders full gate), and a systematic naming incoherence that spans config, component files, and backend files in three different directions per stage. |

### Cross-Stage Analysis

**1. Launch Narrative Coherence**

The narrative Marketing Preparation -> Launch Readiness -> Launch Execution is genuinely logical and complete. Unlike some earlier groups where stages feel like arbitrary checkpoints, Group 6 tells a story: prepare your marketing assets, verify everything is ready, then execute the launch and hand off to operations. The problem is not the story -- it is that the safety mechanisms meant to guard the story's most dangerous chapter (going live) are broken.

**2. Kill Gate Bug Impact**

The Stage 23 kill gate bug is the single most dangerous defect in the entire 25-stage pipeline. Here is why: Stages 3, 5, and 13 are earlier kill gates where venture termination carries lower cost (no code has been built, no marketing has been prepared). Stage 23 is the last kill gate, positioned after 22 stages of work. At this point, terminating a venture means writing off months of effort. The gate exists precisely because the stakes are highest -- if the marketing readiness signals indicate the venture should not launch, this is the last chance to stop it.

With no gate banner rendered, a `kill` decision from the backend becomes an invisible annotation buried in the advisory details collapsible (if the user happens to open it and happens to recognize the `decision` key). The venture appears to have no gate at all. A user could look at Stage 23, see marketing items and a readiness percentage, conclude everything is fine, and proceed -- even when the backend has flagged the venture for termination.

**3. Phantom Gate Decision**

Stage 24 should absolutely be promoted to an enforced gate. The UI implementation is already complete and high quality. The `go/conditional_go/no_go` decision taxonomy is arguably more appropriate for a launch readiness context than the `pass/conditional_pass/kill` taxonomy used at earlier gates. The checklist pattern with evidence rows provides auditable proof of readiness. The only thing preventing this from being a real gate is one line in `venture-workflow.ts:287`: `gateType: 'none'`.

I would go further than the other opinions: consider making Stage 24 the primary launch gate and demoting Stage 23 to a standard informational stage. The readiness checklist at Stage 24 is a more rigorous and auditable gatekeeping mechanism than the marketing readiness percentage at Stage 23. Alternatively, keep both as enforced gates -- belt and suspenders for the highest-stakes phase.

**4. Operations Transition**

Stage 25 handles the pipeline-to-operations transition well at the data level. The operations handoff block covers the five essential categories: monitoring dashboards, alerting rules, escalation procedures, SLA targets, and maintenance schedules. The "LAUNCHED" banner with go-live timestamp creates a clear psychological boundary.

What is missing is the exit: Stage 25 is a dead end in the UI. After 25 stages of forward progress, the user hits a wall. There should be outbound links to the monitoring dashboards, a hypercare checklist, an ownership transfer acknowledgment, or at minimum a "View in Operations" button. The pipeline terminus should be a doorway, not a dead end.

**5. Stage 25 as Design Exemplar**

Phase 1's praise is confirmed by the source code. The operations handoff block at lines 229-309 of `Stage25ScalePlanning.tsx` is the single best piece of information architecture in the entire 25-stage pipeline. Five categories of operational data, each with its own visual treatment, each handling different data shapes (arrays of objects, key-value pairs, string fields), all composed into a readable hierarchical structure. The TypeScript interfaces (`Dashboard`, `Alert`, `EscalationContact` at lines 31-49) are cleanly defined. The deeply nested `opsHandoff` type annotation (lines 91-107) demonstrates sophisticated type-safe data extraction.

**6. Launch Phase Completeness**

The launch phase covers marketing preparation, technical readiness, and operational handoff. Notable gaps:
- **Legal/compliance signoff**: No stage addresses legal review, regulatory compliance, or terms of service verification before launch.
- **Stakeholder notification**: No stakeholder communication or approval workflow is visible.
- **Customer support readiness**: The readiness checklist has four items (release_confirmed, marketing_complete, monitoring_ready, rollback_plan_exists) but no `support_team_ready` or `documentation_published` checks.
- **Hypercare period definition**: Stage 25 marks the launch but does not define the post-launch hypercare window with elevated monitoring and response commitments.

**7. High-Stakes Trust**

The current implementation does not inspire confidence for a live launch workflow. The visual polish is there -- badges, color schemes, and layouts are professional. But the functional gaps are in exactly the wrong places. A workflow that looks trustworthy but has broken safety mechanisms is more dangerous than one that looks obviously unfinished. The broken kill gate at Stage 23 and the phantom gate at Stage 24 create a false sense of security. The three naming mismatches add cognitive overhead at a moment when clarity is paramount. A user going through Group 6 today would be making launch decisions without the guardrails the system claims to provide.

### The Gate Inversion Problem

This group exhibits a pattern I would call "gate inversion" -- a more specific diagnosis than what the other opinions articulated. The gates are not just broken; they are backwards:

| Stage | Config says | Component does | Result |
|-------|------------|----------------|--------|
| 23 | `gateType: 'kill'` | No gate UI | Invisible enforcement (backend may block, user cannot see why) |
| 24 | `gateType: 'none'` | Full gate UI | Visible non-enforcement (user sees decision, backend ignores it) |

This is the worst possible combination. If both were broken in the same direction (both missing UI, or both missing enforcement), the failure mode would be simpler. Instead, the system simultaneously hides real gates and displays fake ones, maximizing user confusion.

---

## The 3 Most Impactful Changes for Group 6

**1. Fix the Gate Inversion (P0 -- one implementation task, one config change)**

Two changes that must ship together:
- **Stage 23**: Implement the `DECISION_BANNER`/`DECISION_BADGE` rendering block. Copy the pattern from `Stage13TechStackInterrogation.tsx` lines 39-55 (constants) and lines 107-142 (rendering). Adapt the advisory data field name to match `stage-23-marketing-prep.js` output. This is approximately 40 lines of code.
- **Stage 24**: Change `venture-workflow.ts:287` from `gateType: 'none'` to `gateType: 'kill'`. This is a 1-line change. The UI already works.

These must ship as a single PR because fixing only one creates a different but equally dangerous inconsistency.

**2. Resolve the Triple Naming Mismatch (P1 -- rename files, components, and config)**

All three stages need alignment. The proposed resolution:

| Stage | Component File | Export Name | Config stageName |
|-------|---------------|-------------|-----------------|
| 23 | `Stage23MarketingPreparation.tsx` | `Stage23MarketingPreparation` | `'Marketing Preparation'` |
| 24 | `Stage24LaunchReadiness.tsx` | `Stage24LaunchReadiness` | `'Launch Readiness'` |
| 25 | `Stage25LaunchExecution.tsx` | `Stage25LaunchExecution` | `'Launch Execution'` |

Update `venture-workflow.ts` lines 274, 276, 284, 286, 294, 296 accordingly. Any import references to the old component names must also be updated.

**3. Elevate Operations Handoff and Add Exit Path (P2 -- UX improvement)**

- Change `opsOpen` default to `true` in `Stage25ScalePlanning.tsx` line 80.
- Change `plansOpen` default to `true` in `Stage24GrowthMetricsOptimization.tsx` line 67.
- Add a "Next Steps" section to Stage 25 after the operations handoff card: render clickable links to dashboard URLs from `opsHandoff.monitoring.dashboards`, a link to the runbook URL from `opsHandoff.escalation.runbook_url`, and a hypercare period summary if available. This transforms the pipeline terminus from a dead end into a transition point.
