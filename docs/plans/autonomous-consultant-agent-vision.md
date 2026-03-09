# Vision: Autonomous Consultant Agent

## Executive Summary
The Autonomous Consultant Agent transforms EVA from a reactive assistant into a proactive strategic advisor. By continuously monitoring industry trends, competitor moves, and the chairman's curated content feeds (Todoist tasks, YouTube research), EVA autonomously surfaces actionable insights before they're needed — like a top-tier management consultant who never sleeps.

This capability addresses the core problem of information overload: the chairman captures dozens of ideas, articles, and research leads daily, but synthesis and strategic connection-making happens manually. The consultant agent closes that gap by autonomously processing inputs, identifying patterns, and presenting synthesized recommendations.

## Problem Statement
The chairman captures strategic ideas across multiple channels (Todoist, YouTube, conversations, reading) but lacks an autonomous system that connects dots across these inputs. Currently, insights are processed manually during brainstorm sessions, leading to delayed action on time-sensitive opportunities and missed connections between seemingly unrelated ideas. The volume of captured ideas (400+ in recent waves) far exceeds human synthesis capacity.

## Personas
- **Chairman (Rick)**: Captures ideas rapidly across channels. Needs synthesis, not more raw data. Values concise, actionable recommendations. Time-constrained — needs the agent to do the heavy lifting.
- **EVA (AI Advisor)**: Acts as the autonomous consultant. Monitors feeds, identifies patterns, generates recommendations. Must earn trust through accuracy and relevance over time.

## Information Architecture
- **Data Sources**: Todoist API (task lists, projects), YouTube API (watch history, playlists), roadmap_wave_items (historical ideas), strategic_directives_v2 (active work)
- **Processing Pipeline**: Sync → Classify → Pattern Detection → Trend Correlation → Recommendation Generation
- **Output Routes**: Chairman digest (daily/weekly), priority alerts (time-sensitive), trend reports (monthly)
- **Storage**: Recommendations stored in dedicated table with confidence scores, source links, and action status

## Key Decision Points
- **Autonomy Level**: How much should the agent act without confirmation? Start conservative (recommend only) and graduate to auto-action based on confidence thresholds.
- **Signal vs Noise**: What filtering mechanisms prevent recommendation fatigue? Quality scoring with adjustable thresholds. Require minimum 3 corroborating signals before surfacing a trend.
- **Feed Priority**: When multiple trends compete for attention, how does the agent prioritize? Composite scoring based on strategic alignment, time-sensitivity, and opportunity size.
- **Data Freshness Monitoring**: How does the system detect degraded input quality? Each data source must report last-sync timestamps. If any source goes stale (>72 hours without new data), recommendations from that source are flagged as "degraded confidence" and the chairman is informed. The system must never present stale analysis with high confidence.
- **Feedback Loop**: How does the recommendation engine learn? The chairman's accept/dismiss actions feed back into the scoring model. Without explicit feedback, the system cannot distinguish signal from noise. This is critical to avoid the system becoming another notification to ignore.
- **Source Heterogeneity**: Todoist tasks are structured and actionable; YouTube content is noisy and ambiguous. The pattern detector must weight sources differently and handle varying signal-to-noise ratios per source type.

## Integration Patterns
- Extends existing EVA intake pipeline (Todoist sync, YouTube sync already built)
- Leverages existing classification taxonomy (App + Aspects + Intent from EVA intake redesign)
- Feeds into existing roadmap wave system for items that graduate from recommendations to action items
- Connects to chairman view for presentation layer
- **Bidirectional Todoist sync**: Currently ideas flow Todoist→EVA only. The consultant agent enables EVA→Todoist: creating follow-up tasks, flagging stale ideas for review, and injecting synthesized action items back into the chairman's daily workflow
- **LEO Protocol integration**: High-confidence recommendations can auto-generate draft SDs via `leo-create-sd.js`, closing the loop from observation to actionable work item
- **Roadmap reality check**: Detects misalignment between `roadmap_wave_items` priorities and where the chairman's actual attention flows (measured by idea volume and recency per domain)

## Evolution Plan
- **Phase 0 (Validation)**: Trend snapshot table + batch aggregation script — materialize classified item statistics (items per app/aspect/intent/week, velocity changes) without LLM. Run manually for 2 weeks to validate whether automated synthesis surfaces non-obvious patterns. Cheapest possible hypothesis test before investing in LLM-powered generation.
- **Phase 1**: Trend detection from existing feeds (Todoist + YouTube) — LLM-assisted pattern matching across recent inputs with data freshness tracking per source
- **Phase 2**: Proactive recommendations with confidence scoring and chairman feedback loop — "Based on 3 recent signals, consider X" with accept/dismiss actions that train the model
- **Phase 3**: Autonomous action (create draft SDs, schedule research, flag competitors) with human-in-the-loop approval. Bidirectional Todoist sync (EVA→Todoist action items).

## Out of Scope
- Building a new data ingestion pipeline (uses existing sync infrastructure: `todoist-sync.js`, `playlist-sync.js`, `intake-classifier.js`)
- Real-time monitoring (batch processing on configurable schedule is sufficient)
- External data sources beyond Todoist and YouTube (can be added later)
- Full agent autonomy without human approval gates
- Building a persistent scheduler/cron infrastructure (manual invocation sufficient for validation; scheduler decision deferred until pipeline is proven)
- Replacing or modifying the existing EVA intake redesign 3D classification taxonomy

## UI/UX Wireframes
N/A — this is primarily a backend/pipeline capability. Output surfaces through existing chairman view routes.

## Success Criteria
- Agent processes new inputs within 24 hours of capture
- Recommendations have >60% chairman acceptance rate (measured by explicit accept/dismiss feedback)
- Reduces time from idea capture to strategic decision by 50%
- Identifies cross-domain connections that chairman confirms as valuable
- Zero false-positive alerts that waste chairman attention
- Data freshness: system detects and reports stale sources within 24 hours of last sync failure
- LLM cost stays under $2/day via aggressive batching (Haiku for classification, Sonnet only for final synthesis)
- Phase 0 validation: trend snapshots surface at least 1 non-obvious pattern within 2 weeks of manual operation
