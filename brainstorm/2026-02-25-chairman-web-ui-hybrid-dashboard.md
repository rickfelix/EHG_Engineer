# Brainstorm: Chairman Web UI — Hybrid Dashboard + Claude Code Remote

## Metadata
- **Date**: 2026-02-25
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active ventures (portfolio-wide governance surface)

---

## Problem Statement

The EHG venture lifecycle (25 stages, 6 phases) requires chairman governance at specific intervention points: 3 blocking gates (stages 10, 22, 25), 1 routing decision (stage 0), and 5 advisory notifications. Currently there is no dedicated governance UI — the existing EHG app is cluttered, Telegram was explored but rejected by the chairman, and the CLI serves the builder persona but not the governance persona.

The chairman and solo entrepreneur are the **same person wearing different hats**. The UI must serve both personas with clean context-switching, support both desktop and mobile equally, and optimize for **batched daily review** (not real-time). Anthropic's new Claude Code on the Web provides browser/mobile access to Claude Code, enabling a hybrid pattern: read state in the dashboard, change state via Claude Code Remote.

## Discovery Summary

### Personas
- **Chairman**: Governance decisions, portfolio oversight, vision alignment, venture lifecycle monitoring
- **Solo Entrepreneur**: Build queue, active SDs, brainstorm capture, protocol enhancement
- Same person, different cognitive modes — the UI adapts context, not access control

### Decision Timing
- Batched daily review preferred
- 24h auto-approve timeout exists as backstop for blocking gates
- Low urgency, high information density needed

### Information Architecture (from Telegram Forum Topics)
Already designed and validated:

| Topic | Persona | Read/Write | Description |
|-------|---------|-----------|-------------|
| Daily Briefing | Chairman | Read | Morning summary, portfolio pulse, aggregate health |
| Decisions | Chairman | Write | Approve/reject/park with context, audit trail |
| Venture Lifecycle | Chairman | Read | 25-stage touchpoints, kill gates, stage progression |
| Vision & Alignment | Chairman | Read | HEAL scores, drift detection, correction alerts |
| Active SDs | Builder | Read | In-progress SD details, phase, progress, blockers |
| Build Queue | Builder | Read | SD pipeline, prioritized queue |
| Inbox | Builder | Write | Unified inbox + brainstorm capture |
| Alerts | Shared | Read | Proactive push notifications for both personas |

### Claude Code on the Web Integration
- Not an embed — Claude Code Remote is a link-out / context-handoff
- Pattern: Dashboard shows context → "Open in Claude Code" button → copies structured context or deep-links
- Enables: see state (dashboard) → change state (Claude Code) → see result (dashboard)

### Repo Decision
- **Build in `rickfelix/ehg`** as `/chairman` route group
- Reuses: Auth, Supabase client, Shadcn UI, Tailwind, Vite
- Can extract to standalone if it outgrows the EHG app

## Analysis

### Arguments For
1. **Forces the protocol to develop a governance layer** — human-readable summaries, decision abstractions, governance APIs
2. **The IA is already designed** — Telegram topics map 1:1 to UI views, reducing design risk to near zero
3. **Only 4 actual decision surfaces** — scope is genuinely small (3 blocking gates + 1 routing)
4. **Closes the governance loop** — see state (dashboard) → change state (Claude Code Remote) → see result (dashboard)
5. **PWA evolution is trivial** — manifest.json + service worker + HTTPS (Vercel) = afternoon of work

### Arguments Against
1. **Auto-approve backstop + Telegram may already be sufficient** — especially for batched daily review
2. **Low-frequency tools get abandoned** — if opened once a day, habit formation is hard; needs very high information density
3. **"Hybrid" is two separate tools** — Claude Code Remote doesn't embed; integration is deep-link at best
4. **Existing EHG app could be refactored** — targeted declutter may achieve 80% of the value at 20% of the cost

## Architecture: Tradeoff Matrix

### Repo/Deployment Options Evaluated

| Dimension | Weight | A: EHG app routes | B: EHG_Engineer subfolder | C: Fresh repo |
|-----------|--------|-------------------|--------------------------|---------------|
| Complexity | 20% | 9 | 5 | 4 |
| Maintainability | 25% | 6 | 8 | 7 |
| Performance | 20% | 8 | 8 | 8 |
| Migration effort | 15% | 9 | 6 | 4 |
| Future flexibility | 20% | 7 | 9 | 8 |
| **Weighted** | | **7.65** | **7.35** | **6.30** |

**Decision**: Option A (EHG app `/chairman` routes) — fastest path, auth/Supabase/Shadcn ready

### Proposed View Architecture

```
/chairman (landing — Daily Briefing + Decision Queue summary)
  /chairman/decisions (blocking gates with full context)
  /chairman/ventures (lifecycle stage map across all ventures)
  /chairman/vision (HEAL scores, drift, alignment)
  /chairman/preferences (risk tolerance, budget caps, notifications)

/builder (landing — Active SDs + Build Queue)
  /builder/queue (prioritized SD pipeline)
  /builder/inbox (brainstorm capture, unified notifications)
```

### Phase Plan

| Phase | Scope | Est. Hours |
|-------|-------|-----------|
| 1: Read-only dashboard | 5 advisory views wired to Supabase | 8-12h |
| 2: Decision gates | 4 interactive decision surfaces | 6-10h |
| 3: PWA shell | Service worker, manifest, install prompt | 4-6h |
| 4: Claude Code Remote | Context-passing pattern (deep-link/clipboard) | 2-4h |
| **Total** | | **20-32h** |

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Telegram already surfaces the same info — why isn't it enough? (2) Same-person persona switching is cognitively expensive — UI may optimize for wrong interaction pattern. (3) Desktop-first won't gracefully evolve to mobile PWA.
- **Assumptions at Risk**: (1) Claude Code Remote creates a coherent hybrid — in practice it's two separate tools. (2) Existing EHG app is a liability — refactoring may be cheaper. (3) Low urgency = forgiving UI quality — actually means low usage frequency = abandonment risk.
- **Worst Case**: UI built, used 3 weeks, abandoned in favor of Telegram + auto-approve. Becomes maintenance debt.

### Visionary
- **Opportunities**: (1) Chairman UI forces LEO to graduate from dev tool to governance system. (2) Dual-persona toggle is a reusable product archetype for solo founders. (3) Claude Code Remote enables spawning protocol actions from the governance surface.
- **Synergies**: HEAL loop → Daily Briefing narrative signals. EVA pipeline → decision queue with 4 intervention points. Telegram as notification bus, UI as action surface.
- **Upside Scenario**: Chairman reviews Daily Briefing on mobile → HEAL flags venture drift → taps into Claude Code Remote → issues protocol directive → LEO picks it up → next briefing reflects correction. Full governance loop in under 10 minutes from a phone.

### Pragmatist
- **Feasibility**: 3/10 difficulty (very achievable)
- **Resource Requirements**: ~20-32h, zero additional cost (Supabase running, Vercel free tier)
- **Constraints**: (1) Repo choice compounds — build in EHG app to avoid re-wiring auth. (2) PWA is a deployment decision, not architecture — add it in an afternoon. (3) Check RLS policies on chairman_decisions, venture_artifacts before writing components.
- **Recommended Path**: Start with one read-only view (Active SDs), prove data flows, then expand.

### Synthesis
- **Consensus**: Telegram IA is the blueprint. PWA is trivial. Claude Code Remote is a link-out, not an embed.
- **Tension**: Build vs. don't build at all. Dashboard vs. decision queue. New app vs. refactor existing.
- **Composite Risk**: Low-Medium (technical: low, adoption: medium)

## Open Questions
1. Should the Daily Briefing be auto-generated by EVA and stored in a table, or computed on-render?
2. What RLS policies exist on chairman_decisions, venture_artifacts, chairman_preferences?
3. Should the builder views expose LEO protocol enhancement capabilities (e.g., editing gate thresholds from UI)?
4. How should Claude Code Remote context be structured for handoff (JSON blob? natural language summary? URL params?)

## Suggested Next Steps
1. **Create an SD** for the Chairman Web UI build (Phase 1: read-only dashboard)
2. **Audit RLS policies** on relevant Supabase tables before any UI work
3. **Prototype**: Add `/chairman` route to EHG app with one Supabase query to validate the approach
