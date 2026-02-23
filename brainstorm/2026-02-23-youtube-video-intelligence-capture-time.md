# Brainstorm: YouTube Video Intelligence at Capture Time

## Metadata
- **Date**: 2026-02-23
- **Domain**: Integration
- **Phase**: Process
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: Cross-venture (all active ventures benefit from improved signal capture)

---

## Problem Statement

When a YouTube video is shared via Telegram, the current pipeline only performs shallow text classification on the user's message — it never analyzes the actual video content. The YouTube URL is saved as a metadata bookmark (`youtube_processed: false`) but nothing ever processes it. This means strategic intelligence locked inside video content is lost — the assist engine sees a generic enhancement title, not the actionable insights within the video.

## Discovery Summary

### Architecture Decision: Gemini Replaces Haiku for YouTube
- When a YouTube URL is detected in a Telegram message, **Gemini API replaces Claude Haiku entirely** for that message
- Gemini natively processes YouTube videos (visual + audio) without needing transcript extraction
- The **EHG Unified Sensemaking Meta-Gem prompt** drives the analysis — extracting input classification, facts/assumptions/mechanisms/unknowns, EHG relevance scoring, persona-driven insights, spec-level impacts, and prioritized next steps
- Non-YouTube messages continue using the existing Claude Haiku path unchanged

### Processing Model: Immediate Ack + Background
- Telegram user receives immediate confirmation ("Analyzing video...")
- Background: Gemini processes the video content
- Result stored in `feedback.metadata.video_analysis`
- Edge function timeout (60s) provides sufficient headroom (~5s typical processing)

### Prompt Management: Database-Stored
- Meta-gem sensemaking prompt stored in `chairman_preferences` table
- Editable without redeploying the edge function
- Enables rapid iteration on analysis quality

### YouTube Playlist Integration
- After successful Gemini analysis, check if the video exists in the "For Processing" YouTube playlist
- If found, move it to the "Processed" playlist using existing `post-processor.js` infrastructure
- Uses YouTube Data API v3 with OAuth (already authenticated via `oauth-manager.js`)

### Existing Infrastructure
- **`lib/integrations/youtube/playlist-sync.js`** — Syncs videos from "For Processing" playlist to `eva_youtube_intake`
- **`lib/integrations/post-processor.js`** — Moves videos from "For Processing" to "Processed" playlist, marks as processed
- **`enrichment.ts`** (edge function) — Current Claude Haiku enrichment with YouTube URL regex detection
- **Google Gemini provider** — Already integrated (PR #1565), `GoogleAdapter` in provider-adapters.js

---

## Analysis

### Arguments For
- Transforms passive bookmarks into structured strategic intelligence — every YouTube share becomes queryable, scored, and actionable
- Gemini's native video understanding eliminates transcript-fetching middleware — one API call covers visual + audio + context
- Database-stored prompt enables rapid iteration without redeployment
- Existing YouTube playlist infrastructure (post-processor.js) already handles "For Processing" to "Processed" move — just needs wiring
- At current volume (<10 videos/day), cost is negligible ($1-3/day for Gemini)
- Compounding data layer: every video analysis builds institutional memory that improves over time

### Arguments Against
- Gemini's YouTube support is relatively new — SLA and reliability less proven than text APIs
- Edge function timeout (60s) leaves limited headroom for long videos — may need retry mechanism
- No monitoring exists yet — silent failures would erode trust
- Vendor lock-in: Gemini is the only model that natively processes YouTube video; no alternative without building transcript extraction
- Cost scales with video length and volume — needs monitoring at scale

---

## Integration: Data Quality/Coverage Analysis

| Dimension | Score |
|-----------|-------|
| Data Quality | 7/10 |
| Coverage | 7/10 |
| Edge Cases | 7 identified |

### Data Quality
- **Source reliability (4/5)**: Gemini API 99.9% SLA for text; YouTube video processing newer but Google-backed. YouTube Data API v3 is mature.
- **Schema stability (3/5)**: Meta-gem prompt output is structured markdown, not typed JSON. Chairman_preferences-stored prompts can drift if edited carelessly. Output parsing needs resilience.

### Coverage
- **Data completeness (4/5)**: Gemini extracts comprehensive video content (visual + audio + captions). May miss non-English content or heavily visual videos without narration.
- **Error handling (3/5)**: Haiku fallback exists for non-YouTube. YouTube path needs explicit fallback — store analysis_error in metadata, surface in /leo inbox.

### Edge Cases
| Edge Case | Frequency | Handling Strategy |
|-----------|-----------|-------------------|
| Private/age-restricted/deleted video | Common | Store `analysis_error: "video_inaccessible"`, fall back to title-only enrichment |
| Very long video (>30 min) | Common | Set max_video_duration_seconds threshold, analyze first 30 min or fall back to Haiku |
| Shortened URL (bit.ly) redirecting to YouTube | Rare | Current regex won't match; accept limitation or pre-expand URLs |
| YouTube playlist URL instead of single video | Rare | Detect playlist URLs (contains `list=`), process first video only or flag for manual review |
| Duplicate video shared by multiple messages | Rare | Check feedback.metadata.youtube_url for existing analysis before invoking Gemini |
| Gemini timeout mid-analysis (>50s) | Rare | Store partial result, set youtube_processed: false, retry via pg_cron or next assist run |
| Video not in "For Processing" playlist | Common | Playlist move is opportunistic — skip if no match, don't error |

---

## Team Perspectives

### Challenger
- **Blind Spots**:
  - Network partitioning between Telegram/Supabase/Gemini — silent failure if Gemini times out after ack
  - Gemini's native YouTube support is undocumented operationally (SLA, caching behavior, quota limits for video)
  - Metadata update atomicity — race condition if same URL arrives twice within seconds
- **Assumptions at Risk**:
  - Cost-benefit parity: Gemini is 3-5x more expensive than Haiku per token; 80% of URLs may be low-relevance (recommends two-tier strategy)
  - Schema evolution: unversioned metadata JSONB queries become brittle if Gemini response structure changes
  - URL classification reliability: shortened URLs, playlist URLs, embedded URLs may not match regex
- **Worst Case**: Gemini timeout → silent failure → user sees ack but analysis never completes → trust erosion over time with no alerting to detect it

### Visionary
- **Opportunities**:
  - Real-time venture signal detection at inbox time — detect trends before they're public
  - Compounding data layer — every video analysis builds queryable institutional memory
  - Telegram becomes a structured venture intelligence feed, not just chat
- **Synergies**:
  - /leo assist gets pre-enriched context — can surface video analyses matching user's domain/problem
  - Chairman preference system makes analysis tunable — evolves with strategic focus
  - Cross-venture pattern recognition from aggregated video analyses
- **Upside Scenario**: Within 6 months, EHG leadership can query a "video analysis scoreboard" with trending topics, emerging risks, and innovation clusters detected in real-time from Telegram

### Pragmatist
- **Feasibility**: 6/10 (Moderate — rate limiting is the critical blocker)
- **Resource Requirements**: 60-80 hrs implementation, $800-2000/month Gemini costs at scale, Gemini quota increase needed
- **Constraints**:
  - Gemini API rate limits (15 req/min standard — needs quota increase for spikes)
  - Supabase Edge Function 60s timeout (workable but tight for long videos)
  - Telegram webhook expects ACK within 30s (must ack before Gemini call)
- **Recommended Path**: 3-phase implementation — Foundation (quota + backoff + monitoring) → Edge Function (async pattern + retry queue) → Observation & Hardening (10% rollout → 100%)

### Synthesis
- **Consensus Points**: Timeout/failure handling is critical; Haiku fallback essential; async is the right pattern; monitoring is non-negotiable
- **Tension Points**: Challenger wants two-tier (Haiku first, Gemini only for high-relevance) vs user preference for full Gemini replacement; Pragmatist's 12-week estimate may be over-engineered for MVP
- **Composite Risk**: Medium — technically sound, primary risks are operational (timeout, cost monitoring)

---

## Open Questions
- What is Gemini's actual latency for YouTube video analysis? (Need to benchmark with real videos of varying lengths)
- Should playlist post-processing happen only after successful Gemini analysis, or at capture time regardless?
- What is the maximum video length Gemini can process natively? (Undocumented for YouTube-specific support)
- Should the Challenger's two-tier suggestion be reconsidered at scale (>50 videos/day)?

## Suggested Next Steps
1. **Create SD** via `/leo create` — type: feature, scope: edge function + Gemini integration + playlist post-processing
2. **Benchmark Gemini YouTube latency** — test with 3-5 real videos of varying lengths before implementation
3. **Request Gemini quota increase** from Google (24-48 hrs lead time)
4. **Define fallback behavior** — what exactly happens when Gemini fails (Haiku fallback? Retry queue? Both?)
