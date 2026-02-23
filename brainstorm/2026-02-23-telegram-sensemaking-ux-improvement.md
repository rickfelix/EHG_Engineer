# Brainstorm: Telegram Sensemaking UX — Interactive Persona Insights & Disposition

## Metadata
- **Date**: 2026-02-23
- **Domain**: Venture
- **Phase**: Ideation
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: EHG (Chairman Bot / EVA)
- **Related Brainstorms**: "Achieving Out-of-Scope Meta-Gem Objectives" (2026-02-23), "YouTube Video Intelligence at Capture Time" (2026-02-23), "Chairman Telegram Assistant — Two-Way EVA Operations Bot" (2026-02-22)

---

## Problem Statement

The Unified Sensemaking Service (SD-LEO-FEAT-UNIFIED-SENSEMAKING-SERVICE-002) runs silently in the background when content is submitted through Telegram. The Chairman has no visibility into whether analysis succeeded, what insights were captured, or from which personas. There is no mechanism to curate, approve, or reject individual insights — they go straight into the database unreviewed.

The core problem: **insights are trapped in the database with no user feedback loop.**

## Discovery Summary

### Current State
- Sensemaking service runs as fire-and-forget background task via `dispatchSensemakingAnalysis()` in `tool-executors.ts`
- Results stored in `sensemaking_analyses` table with no user notification
- 6 personas analyze content (VC, CTO, PM, AI Engineer, Security Engineer, Data Architect)
- 7-section structured output (FAMU decomposition, persona insights, actionable outputs, etc.)
- User experience: identical to before the service was built — zero visible change

### Desired State (Chairman's Vision)
1. Send YouTube URL → EVA acknowledges ("Looking at this now...")
2. Analysis runs with persona selection
3. EVA returns conversational summary: "The marketing persona thinks X, the sales persona thinks Y"
4. Chairman reviews and provides disposition per insight (keep / discard / modify)
5. Disposition stored on feedback table with optional comments
6. `/assist` inbox processing respects dispositions downstream

### Key Constraints
- Primary user: Chairman (single user via Telegram)
- User is patient with 10-30s wait times (with acknowledgment)
- Telegram message limit: 4096 characters
- Supabase Edge Function timeout: 150 seconds
- Backend sensemaking service already exists and works

## Analysis

### Arguments For
- **Closes the feedback loop** — Makes sensemaking visible and useful instead of theoretical
- **Low marginal cost** — Backend exists; this is Telegram UI + 2-3 new DB fields
- **Builds a decision journal** — Every keep/discard is a data point about strategic priorities; EVA learns over time
- **4-day MVP estimate** — Small enough to ship quickly, validate, and iterate
- **Existing async pattern** — `dispatchSensemakingAnalysis()` already fires in background; extend, don't rewrite

### Arguments Against
- **Protocol binding is hard** — Making `/assist` actually respect dispositions requires careful integration that fails silently if done wrong
- **Adoption risk** — If persona insights aren't consistently differentiated and useful, curation becomes noise
- **Scope creep magnet** — "Modify" workflow, persona ranking, advisor syndication are natural next steps that expand scope significantly

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Disposition data needs to emit observable protocol events, not just sit in a field — if `/assist` independently regenerates dismissed insights, trust erodes
  2. Cost of 6 personas x 7 sections per video is unbenchmarked — could be $200-800/week at scale
  3. The "conversational" framing overstates what's actually pull-based curation (buttons, not dialogue)
- **Assumptions at Risk**:
  1. Disposition adoption curve — curation may become a chore by week 3 (habituation cliff)
  2. 6 personas may not produce sufficiently differentiated insights to justify display
  3. Disposition-to-/assist mapping is unspecified (one disposition per insight? per analysis? per video?)
- **Worst Case**: Feature ships, user curates enthusiastically for 2 weeks, `/assist` doesn't respect dispositions, user stops curating, cost continues, feature becomes silent bloat that erodes trust in EVA

### Visionary
- **Opportunities**:
  1. Conversational Intelligence as a Core Product — disposition data becomes proprietary decision-intelligence IP
  2. Network Effects via Persona Syndication — advisors subscribe to persona-filtered feeds
  3. Active feedback loop — dispositions recalculate downstream recommendations in real-time
- **Synergies**:
  - Vision Score Healing Loop gets real human signal instead of stalling
  - Decision-Filter Engine gets a natural Telegram input channel
  - Chairman Preferences becomes time-series data (evolving strategic focus)
- **Upside Scenario**: Within 6 months, Chairman manages 80% of portfolio signal processing from Telegram. Disposition history trains a personal decision model. Disposition data becomes licensable IP.

### Pragmatist
- **Feasibility**: 6/10 (moderately difficult, achievable)
- **Resource Requirements**: 1 full-stack engineer, 8 working days (4-day MVP + 4 days buffer/enhancements), <$50/month API cost for single user
- **Constraints**:
  1. 150s Edge Function timeout vs streaming — must use async dispatch pattern
  2. 4096 char Telegram limit — need persona-focused message chunking
  3. "Modify" is underspecified — defer to v2
- **Recommended Path**:
  - Day 1: DB migration (disposition fields) + /assist gate filter
  - Day 2: Telegram keyboard callbacks + async synthesis dispatch
  - Day 3: Background synthesis polling + persona insight presentation
  - Day 4: E2E testing + deploy
  - v2 (2 weeks later): Modify workflow, persona confidence scores, batch dispositioning

### Synthesis
- **Consensus Points**: Async dispatch mandatory; Keep/Discard only for v1; disposition→/assist binding is make-or-break; message chunking needed
- **Tension Points**: Scope (single-user MVP vs multi-user syndication); adoption durability (habituation cliff vs self-reinforcing learning loop); cost model ($50/month vs $800/week depending on volume)
- **Composite Risk**: Medium — UX is straightforward, protocol binding is the hard part

## Technical Architecture (MVP)

### New Database Fields
```sql
ALTER TABLE feedback ADD COLUMN disposition TEXT CHECK (disposition IN ('keep', 'discard'));
ALTER TABLE feedback ADD COLUMN disposition_at TIMESTAMPTZ;
ALTER TABLE feedback ADD COLUMN disposition_reason TEXT;
```

### Telegram Flow
```
User sends YouTube URL
  → Bot: "Looking at this now, I'll get back to you shortly."
  → dispatchSensemakingAnalysis() fires (existing, async)
  → Analysis completes → stored in sensemaking_analyses
  → Bot sends Message 2:
    "Interesting video. Here's what stood out:

    🎯 VC Perspective: [key takeaway - 2 sentences]
    🔧 CTO Perspective: [key takeaway - 2 sentences]
    📊 PM Perspective: [key takeaway - 2 sentences]

    What do you think?"
  → Inline keyboard: [✅ Keep All] [Review Each] [❌ Discard]
  → If "Review Each": show per-persona keyboards
  → Disposition stored on feedback table
```

### /assist Integration
```javascript
// In assist processing, filter by disposition
const items = await supabase.from('feedback')
  .select('*')
  .or('disposition.is.null,disposition.eq.keep')
  // Items with disposition='discard' are excluded
```

## Open Questions
- What does "Modify" mean in practice? (Deferred to v2 — needs real usage data)
- Should persona ranking change based on accumulated dispositions? (v2 enhancement)
- At what volume does cost become a concern? (Monitor during v1)
- Should discarded insights be permanently hidden or recoverable?

## Suggested Next Steps
1. **Create an SD** via `/leo create` to implement the MVP (4-day scope)
2. Focus on: async acknowledgment → persona insight presentation → Keep/Discard keyboard → disposition storage → /assist filter
3. Defer: Modify workflow, persona syndication, advisor access, confidence scoring
