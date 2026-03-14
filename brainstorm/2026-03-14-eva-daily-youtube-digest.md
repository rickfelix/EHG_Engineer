# Brainstorm: EVA Daily YouTube Subscription Feed Analyzer

## Metadata
- **Date**: 2026-03-14
- **Domain**: Integration
- **Phase**: Intake
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Board of Directors (6/6 seats + 1 specialist)
- **Related Ventures**: All active (Shortform Sage, Elysian, ListingLens AI, MindStack AI, CodeShift, LegacyAI, LexiGuard)
- **Chairman Review**: 3 items reviewed, 3 accepted, 0 flagged, 0 research-needed

---

## Problem Statement

The Chairman manages 8 active ventures and manually scans YouTube subscriptions daily (30-60 minutes) for strategically relevant content. This is unstructured, subject to algorithmic bias (YouTube surfaces engagement-optimized content, not venture-aligned content), and produces no audit trail of what was reviewed or missed. EVA already processes Todoist captures and brainstorms through a structured pipeline, but YouTube content — a major source of technical insights, market signals, and competitive intelligence — has no structured intake path.

## Discovery Summary

### Pre-Seeded Context (from Todoist/Distill)
- Chairman wants daily automated analysis of YouTube subscription feed
- Output as Todoist parent task with subtasks per recommended video
- Each subtask: summary, relevance reasoning, direct video link
- Videos scored against venture interests and strategic priorities

### Existing Infrastructure
- YouTube integration partially built (`lib/integrations/youtube/video-metadata.js` with Gemini analysis)
- Todoist API fully operational (Sync API v1 patterns proven in distill pipeline)
- EVA classification taxonomy available for content categorization
- GitHub Actions scheduling infrastructure operational (30+ workflows)
- YouTube googleapis module is broken — but RSS + raw fetch bypasses this entirely

## Analysis

### Arguments For
1. **Direct time recovery**: 25-50 min/day of Chairman executive time redirected from content triage to content consumption
2. **Venture-aligned filtering**: LLM scoring against interest profile surfaces what matters, not what's popular
3. **Audit trail**: Every recommendation is logged with reasoning — know what was surfaced and why
4. **Near-zero cost**: RSS feeds are free, API enrichment is ~1-2 units/day, LLM analysis via Ollama is free

### Arguments Against
1. **Trust erosion risk**: Bad recommendations could cause Chairman to ignore the digest within 2 weeks
2. **Interest profile maintenance**: Static config needs manual updates as venture priorities evolve
3. **RSS latency**: YouTube RSS feeds can lag 15-60 minutes behind publish time (acceptable for daily batch)

## Board of Directors Deliberation

### Round 1: Board Positions

| Seat | Standing Question | Position Summary |
|------|------------------|-----------------|
| CSO | Does this move EHG forward or sideways? | Forward — converts passive consumption into structured venture intelligence. Conditional on tight scope (fetch-summarize-route only) and DB-configurable interest mapping. |
| CRO | What's the blast radius if this fails? | MODERATE-LOW. No revenue systems at risk. Primary dangers: googleapis module (bypassed by RSS), OAuth silent expiry, quota exhaustion (solved by RSS hybrid). |
| CTO | What do we already have? What's the real build cost? | ~420 LOC, 5 components. Extensive reusable assets (video-metadata.js, Todoist sync patterns, LLM client-factory, GH Actions). RSS hybrid recommended. 3-4 sessions. |
| CISO | What attack surface does this create? | MEDIUM-HIGH pre-mitigation. OAuth tokens in CI/CD, unsupervised Todoist write loop, trust boundary crossing. Required: dry-run default, [EVA-AUTO] prefix, credential isolation, action pinning. |
| COO | Can we actually deliver this given current load? | Yes — empty queue, full bandwidth. Originally required Phase 0 googleapis RCA but withdrew after RSS bypass confirmed. |
| CFO | What does this cost and what's the return? | Strong approve. $0-$0.02/day operating cost. Payback under 2 months. Annual ROI >100x. |

### Specialist Testimony
- **SPECIALIST-YOUTUBE-API**: RSS hybrid is the clear winner. RSS provides title, description, thumbnail, publish date at zero quota. Only need API for metadata enrichment (duration, tags) on ~10-20 filtered videos. `googleapis` module not needed — raw fetch covers everything. OAuth `youtube.readonly` scope cannot escalate. `fast-xml-parser` recommended for RSS.

### Round 2: Key Rebuttals
- CSO withdrew timing concern after CTO/specialist confirmed googleapis bypass via RSS
- CRO revised risk from MODERATE-LOW to LOW after RSS hybrid confirmation
- COO withdrew Phase 0 prerequisite — googleapis RCA filed as separate backlog item
- CSO and CISO converged on static JSON config (not DB) for interest profiles
- All seats endorsed CISO's dry-run default requirement

### Judiciary Verdict
- **Board Consensus**: RSS hybrid architecture, no googleapis dependency, dry-run default, [EVA-AUTO] prefix, static interest config, timing is optimal
- **Key Tensions**: All resolved — Phase 0 blocker withdrawn, risk level aligned, config approach agreed
- **Constitutional Citations**: FOUR_OATHS Transparency (95/100), Do No Harm (85/100), CONST-005 Source of Truth (75/100), CONST-003 Scope Discipline (70/100)
- **Recommendation**: APPROVED as Tier 3 SD with binding security conditions
- **Escalation**: No — unanimous approval

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Video detection method | RSS feeds (zero quota) | 10,000 unit daily API quota is precious; RSS provides all needed fields for filtering |
| API usage | Metadata enrichment only (~1-2 units/day) | Duration, tags, category not in RSS; needed for quality recommendations |
| googleapis module | Bypassed entirely | Known broken; raw fetch + fast-xml-parser covers all needs |
| OAuth handling | google-auth-library (token refresh only) | Lightweight; only needed for weekly subscription list refresh |
| Interest config | Static JSON in repo | No DB creds in CI; version controlled; CISO requirement |
| Todoist output | Parent task + subtasks with [EVA-AUTO] prefix | Provenance tracking; matches Chairman's existing workflow |
| Launch mode | Dry-run default (2 weeks) | CISO non-negotiable; proves value before unsupervised writes |
| Scheduling | GitHub Actions daily cron | Existing infrastructure; 30+ workflows already running |

## Open Questions
- What time of day should the daily scan run? (Chairman's morning preferred)
- How many videos per day is the right threshold before the digest becomes noise? (Start with top 10-15)
- Should the interest config support negative keywords (topics to always exclude)?

## Suggested Next Steps
- Create vision and architecture documents
- Register in EVA for HEAL scoring
- Create SD via /leo create with vision/arch keys
- Implementation: RSS scanner → interest matcher → Todoist creator → orchestrator → GH Actions
