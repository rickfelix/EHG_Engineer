# Brainstorm: Autonomous Consultant Agent

## Metadata
- **Date**: 2026-03-08
- **Domain**: Integration
- **Phase**: MVP (extending existing pipeline with pattern detection + recommendation)
- **Mode**: Conversational (autonomous — chairman asleep, EVA proceeding)
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: EHG_Engineer (EVA pipeline infrastructure)
- **Source**: Chairman final cut — item retained from SD-RESEARCH-EVA_PIPELINE-20260309-005

---

## Problem Statement
The chairman captures 400+ strategic ideas across Todoist, YouTube, conversations, and reading, but synthesis happens manually during brainstorm sessions. This creates delayed action on time-sensitive opportunities and missed cross-domain connections. The volume far exceeds human synthesis capacity. EVA currently acts as a reactive assistant — the consultant agent transforms it into a proactive strategic advisor.

## Discovery Summary

### Existing Infrastructure (Key Finding)
The Pragmatist agent's codebase exploration revealed that significant infrastructure already exists:
- **Fully reusable**: `todoist-sync.js`, `playlist-sync.js`, `eva-sync-state` circuit breaker, `intake-classifier.js` (3D taxonomy: App + Aspects + Intent), `wave-clusterer.js`, `client-factory.js` (LLM routing with Haiku/Sonnet tiers)
- **Partially reusable**: `deeper-analysis-router.js` (routing patterns), `post-processor.js` (archival lifecycle)
- **Must be built**: Pattern detector (temporal clustering), trend correlator (cross-source matching), recommendation engine (confidence-scored output), chairman digest, data freshness monitoring

### Processing Pipeline Design
Sync → Classify → Pattern Detection → Trend Correlation → Recommendation Generation → Chairman Digest

### Data Sources
- Todoist API (task lists, projects) — structured, actionable items
- YouTube API (watch history, playlists) — noisy, ambiguous content
- `roadmap_wave_items` (historical ideas)
- `strategic_directives_v2` (active work context)

### Key Insight: Validate Before Building
The Pragmatist recommended a Phase 0 validation approach: create a simple trend snapshot table that materializes aggregate statistics (items per app/aspect/intent, velocity changes) WITHOUT LLM involvement. Run manually for 2 weeks. If the snapshots don't surface non-obvious patterns, the full LLM-powered pipeline won't help either.

## Analysis

### Arguments For
- **Closes the synthesis gap**: 400+ ideas can't be manually connected — automation is the only scalable approach
- **Leverages existing infrastructure**: 80%+ of the sync/classify pipeline is already built and production-ready
- **Low marginal cost**: ~$1-2/day LLM cost using existing Haiku/Sonnet routing via `client-factory.js`
- **Compound value**: Every feedback interaction makes the system more accurate — competitive moat grows over time
- **Enables temporal intelligence**: Time-series of chairman attention reveals patterns invisible in snapshot brainstorm sessions

### Arguments Against
- **YouTube API risk**: Google has been progressively restricting YouTube Data API access to personal activity data. Building a core dependency on this is a vendor risk.
- **Classification heterogeneity**: Todoist tasks and YouTube videos have wildly different signal-to-noise ratios. Haiku-level classification may struggle with this.
- **Foundation dependency**: The EVA intake redesign (3D taxonomy) is designed but not yet in production. This agent builds on that unreleased foundation.
- **Feedback loop chicken-and-egg**: Without the feedback loop, recommendations can't improve. But the feedback loop requires the chairman to engage. Early recommendations may be mediocre, risking disengagement before the system proves itself.

## Integration: Data Quality/Coverage Analysis

| Dimension | Score |
|-----------|-------|
| Data Quality | 7/10 (Todoist high, YouTube medium — heterogeneous) |
| Coverage | 6/10 (two sources cover ~70% of chairman's idea capture) |
| Edge Cases | 4 identified |

**Edge Cases**:
1. **YouTube API deprecation** (Rare but high-impact) — graceful degradation to Todoist-only mode with explicit confidence reduction
2. **Todoist bulk import** (Common) — chairman sometimes imports 50+ items at once, creating spike patterns that aren't real trends
3. **Cross-source duplicates** (Common) — same idea captured in both Todoist and YouTube should count as 1 signal, not 2
4. **Stale sync** (Rare) — sync fails silently; system generates recommendations on outdated data

## Team Perspectives

### Challenger
- **Blind Spots**: (1) No mechanism to detect stale data — system will present degraded analysis with same confidence as fresh; (2) 400+ items are not uniform across sources — classification collapse risk from heterogeneity; (3) No feedback loop means system can't learn what matters vs. noise
- **Assumptions at Risk**: (1) $1/day LLM cost assumes stable volumes, but cross-referencing grows non-linearly as corpus grows; (2) EVA intake redesign isn't in production yet — building second floor on blueprint first floor; (3) YouTube watch history API may be further restricted by Google
- **Worst Case**: System ships, runs 3-4 weeks, YouTube sync breaks silently. System continues on Todoist-only but still presents "cross-source trend analysis." Chairman gets generic, repetitive digests. LLM costs creep up. `eva_consultant_recommendations` becomes another data graveyard. Net result: more noise, not less.

### Visionary
- **Opportunities**: (1) Cross-domain pattern arbitrage — extract alpha from data the chairman already possesses but can't manually cross-reference at scale; (2) Temporal intelligence — time-series of strategic attention reveals what topics the chairman gravitates toward before consciously deciding to act; (3) Recommendation feedback loop becomes a competitive moat — personalized strategic model no off-the-shelf AI can replicate
- **Synergies**: EVA intake redesign (classification backbone), roadmap wave system (automatic priority reality check), LEO Protocol (high-confidence recommendations auto-generate draft SDs), Todoist bidirectional sync (EVA→Todoist action items)
- **Upside Scenario**: Within 6 months, the daily digest replaces 2 hours of manual review. The agent surfaces a non-obvious cross-domain connection leading to a strategic decision the chairman wouldn't have reached independently. EVA transitions from productivity tool to intellectual partner.

### Pragmatist
- **Feasibility**: 5/10 — existing infrastructure makes Phase 0-1 straightforward, but the leap from classification to pattern detection/recommendation is qualitatively different
- **Resource Requirements**: 3-5 SDs (6-10 days), ~$0.50-1.50/day LLM, 1-2 new DB tables, no cron infrastructure needed for validation phase
- **Constraints**: (1) No persistent scheduler exists — manual invocation sufficient for validation; (2) Pattern detection quality will be mediocre at 400 items — early iterations should present clusters/frequencies, not bold recommendations; (3) LLM cost drift is the real risk — batch aggressively following `wave-clusterer.js` pattern
- **Recommended Path**: Start with trend snapshot table + batch aggregation script (no LLM). Run manually 2 weeks. If snapshots prove useful, proceed to LLM-powered recommendation engine. Do not build the cron runner in Phase 0.

### Synthesis
- **Consensus Points**: (1) Existing infrastructure makes this feasible (all 3 agree); (2) Feedback loop is critical (Challenger + Visionary agree it's the key differentiator); (3) Start small and validate (Challenger + Pragmatist agree on validation-first approach)
- **Tension Points**: (1) Visionary sees compound value over 6 months vs Challenger's concern about 3-4 week degradation window; (2) Pragmatist recommends no-LLM Phase 0 vs Visionary's emphasis on LLM-powered cross-domain pattern arbitrage
- **Composite Risk**: Medium — strong existing infrastructure mitigates implementation risk, but data quality and feedback loop risks require active management

## Open Questions
- Should Phase 0 snapshots include YouTube data, or Todoist-only to avoid the API risk?
- What is the minimum feedback engagement rate needed to make the learning loop viable?
- Should recommendations link to specific wave items, or present higher-level thematic summaries?

## Suggested Next Steps
1. Create SD(s) from this brainstorm with vision-key and arch-key linkage
2. The 4-phase architecture (Phase 0 → 3) may warrant an orchestrator SD with children
3. Phase 0 can begin immediately on existing raw data without waiting for EVA intake redesign
