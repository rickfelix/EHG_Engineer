# Brainstorm: EVA Automated Research Pipeline — Autonomous Consultant Agent

## Session Context
- **Domain**: integration
- **Topic**: EVA-powered autonomous consultant agent for proactive strategic briefings
- **Mode**: structured (3-agent team analysis)
- **SD**: SD-RESEARCH-EVA_PIPELINE-20260309-005

## Three-Agent Team Analysis

### Challenger Perspective
**Core Question**: Why build this when the chairman already has EVA intake working?

1. **Risk of Premature Automation**: The EVA intake redesign (3D classification: App + Aspects + Intent) is designed but not yet production-validated. Building an autonomous layer on top of an unvalidated foundation compounds risk. If the classification taxonomy is wrong, the consultant agent amplifies bad signals.

2. **Recommendation Fatigue is Real**: Every recommendation system eventually becomes noise. The chairman already manages 400+ ideas across Todoist/YouTube/conversations. Adding automated recommendations could worsen information overload rather than reduce it — the opposite of the stated goal.

3. **Single-User ROI Trap**: This is a sophisticated ML-adjacent pipeline serving one person. The effort-to-value ratio must be scrutinized. If the chairman can achieve 80% of the value by spending 15 minutes per week on manual synthesis (which he already does during brainstorm sessions), the remaining 20% may not justify the engineering investment.

4. **Data Quality Dependency**: YouTube Data API is progressively restricted by Google. Todoist data is structured but limited to what the chairman manually captures. The system's intelligence is capped by its input quality. "Garbage in, garbage out" applies — without diversified, high-quality data sources, the agent will produce shallow insights.

5. **Phase 0 is the Right Approach**: The trend snapshot validation (no LLM, manual review for 2 weeks) is exactly the right move. It's the cheapest possible test of the hypothesis. If Phase 0 doesn't surface non-obvious patterns, the entire pipeline should be reconsidered.

### Visionary Perspective
**Core Question**: What transformative capability does this unlock?

1. **From Reactive to Anticipatory**: Currently, EVA responds to requests. The consultant agent inverts the model — EVA tells the chairman what he should be thinking about. This is the difference between a search engine and a news editor. The chairman stops asking questions and starts receiving curated strategic intelligence.

2. **Closing the Observation-Action Loop**: Today's flow is: Chairman observes → captures idea → forgets for weeks → rediscovers during brainstorm → creates SD. The consultant agent compresses this to: Chairman observes → system classifies → system detects pattern → system recommends action → SD auto-generated. The cycle time drops from weeks to hours.

3. **Compounding Intelligence**: Each chairman accept/dismiss action trains the system. Over months, the agent builds a model of what the chairman values. This is a flywheel — the more you use it, the better it gets. No competitor has this because it requires the chairman's proprietary judgment data.

4. **Strategic Early Warning System**: Cross-domain pattern detection can surface connections the chairman can't see manually. Example: a YouTube video about a competitor's pivot + a Todoist idea about a similar feature + an active SD in that space = a strategic signal that demands immediate attention. No human can hold all these threads simultaneously across 400+ items.

5. **Foundation for Multi-Venture Scaling**: When EHG grows beyond one venture, the chairman can't manually synthesize across all ventures. The consultant agent is the prototype for the "AI board of advisors" that scales with the portfolio. Build it now for one venture, and the architecture serves ten.

### Pragmatist Perspective
**Core Question**: What's the smallest thing we can build that proves the value?

1. **Phase 0 is Sufficient for Validation**: A SQL query that aggregates classified items by app/aspect/intent per week, showing velocity changes, costs nothing to run and answers the core question: "Does automated synthesis surface non-obvious patterns?" If the answer is no after 2 weeks, stop.

2. **Existing Infrastructure is 70% There**: `todoist-sync.js`, `playlist-sync.js`, `intake-classifier.js`, `wave-clusterer.js`, `client-factory.js` — the heavy lifting is done. The incremental work is trend detection + recommendation formatting. Estimated 300-400 LOC of new code for Phase 0+1.

3. **LLM Cost is Manageable**: Haiku for classification ($0.00025/1K tokens), Sonnet for synthesis ($0.003/1K tokens). With aggressive batching (one big prompt per run), daily cost stays under $1.50. Monthly cost < $45. This is a rounding error for the value delivered.

4. **Chairman Digest is the Killer Feature**: Forget the fancy ML pipeline. The highest-value deliverable is a formatted daily/weekly summary that says: "Here are 3 things you should know about your ventures today." If this is useful, the pipeline justifies itself. If not, no amount of sophistication will help.

5. **Ship Phase 0 in 1-2 Days, Then Pause**: Don't commit to all 4 phases upfront. Ship Phase 0, run it manually for 2 weeks, review with the chairman, then decide. This is research, not a feature commitment. The build/no-build decision comes AFTER Phase 0 validation, not before.

## Synthesis & Recommendations

### Consensus Points
- Phase 0 (trend snapshots without LLM) is the correct starting point — all three perspectives agree
- The feedback loop (Phase 2) is critical — without it, the system can't improve and becomes notification spam
- Data freshness monitoring is non-negotiable — stale data produces false confidence
- YouTube API restrictions are a real risk — design for graceful degradation

### Key Tensions
- **Scope vs. Speed**: Visionary wants the full 4-phase pipeline; Pragmatist wants Phase 0 only with decision gates
- **Automation vs. Quality**: Challenger worries about recommendation fatigue; Visionary sees compounding intelligence
- **Single-user vs. Platform**: Building for one user is expensive; building for scale is premature

### Recommended Path
1. **Ship Phase 0** (1-2 days): `eva_consultant_snapshots` table + `eva-trend-snapshot.mjs` script
2. **Manual validation** (2 weeks): Chairman reviews trend snapshots weekly
3. **Build/no-build decision**: Based on whether Phase 0 surfaced non-obvious patterns
4. **If GO**: Proceed to Phases 1-3 sequentially, each with its own SD and validation gate
5. **If NO-GO**: Archive research, document findings, no wasted effort beyond Phase 0

## Related Documents
- **Vision**: `docs/plans/autonomous-consultant-agent-vision.md`
- **Architecture**: `docs/plans/autonomous-consultant-agent-architecture.md`
- **Follow-up SDs**: SD-LEO-INFRA-CONSULTANT-AGENT-PHASE-001 through 004
