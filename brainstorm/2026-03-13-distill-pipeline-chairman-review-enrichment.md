# Distill Pipeline: Chairman Review & Enrichment Enhancement

## Problem Statement

The current `/distill` pipeline takes raw Todoist items (often just link titles with no description) and pushes them through classification, wave clustering, and promotion to SDs with minimal context. Three critical gaps:

1. **No enrichment** — YouTube URLs aren't extracted or fetched for metadata. Web pages aren't summarized. Classification operates on bare titles.
2. **No chairman intent capture** — AI sets `chairman_intent` autonomously. The chairman never verifies classification or explains *why* they saved an item.
3. **No strategic development** — Items promoted to SDs have no brainstorm, research, or triangulation. They enter LEO as thin stubs.
4. **Approved waves aren't locked** — New items are silently inserted into already-approved waves, undermining the approval checkpoint.

## Desired End-to-End Pipeline

### Phase 1: Intake (Sync + Enrich + Classify)
1. **Sync** — Pull new items from Todoist and YouTube playlists
2. **Enrich** — For each new item:
   - Extract YouTube URLs from Todoist titles (existing `url-extractor.js`)
   - Fetch YouTube metadata via API (title, channel, description, tags, duration)
   - Fetch and summarize non-YouTube web pages
   - Cross-link with `eva_youtube_intake` if video already exists (existing `dedup-checker.js`)
3. **Classify** — AI classification using enrichment context (app, aspects, intent)

### Phase 2: Chairman Review
4. **Per-item review** — One `AskUserQuestion` per new item in CLI:
   - Show: item title, source, enrichment summary (video metadata or page summary)
   - Show: AI classification with confidence and rationale
   - Choices: intent options (Reference, Research, Build, Improve) with AI recommendation first
   - Chairman can override classification and/or intent
   - Items marked "reference" are stored but excluded from wave pipeline
5. **Summary checkpoint** — Display all reviewed items with confirmed intents. Ask to proceed before clustering.

### Phase 3: Clustering
6. **Wave creation** — Actionable items (non-reference) clustered into new independent waves
   - **Approved waves are locked** — never insert into waves with status `approved`, `active`, or `completed`
   - New waves get independent AI-generated names (no reference to existing wave themes)
   - New waves start with `status: 'proposed'`

### Phase 4: Refinement
7. **Refine** — Dedup (semantic), reconcile against existing SDs, 4-persona scoring
8. **Approve** — Chairman approves wave sequence (existing flow)

### Phase 5: Strategic Development
9. **Batch brainstorm per wave** — One brainstorm session per approved wave:
   - Research the wave's theme and constituent items
   - Triangulation across items
   - Strategic analysis and recommendations
   - Identify which items are strong candidates vs weak
10. **Brainstorm review** — Chairman reviews wave brainstorm findings via AskUserQuestion:
    - Summary of research/insights
    - Per-item recommendations (promote, defer, merge, reframe)
    - Confirm before any SDs are created

### Phase 6: Promotion
11. **Promote** — Confirmed items become SDs with:
    - Enrichment data (YouTube metadata, page summaries)
    - Chairman intent and notes
    - Wave brainstorm context and strategic rationale
12. SDs enter LEO queue (LEAD -> PLAN -> EXEC)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Review timing | After classification, before clustering | Chairman intent shapes wave composition |
| Review format | Single combined AskUserQuestion per item | Efficient — covers classification + intent in one interaction |
| Enrichment depth | Full (YouTube metadata + web page summaries) | Review is meaningless without understanding the content |
| Reference handling | Store but skip waves | Keeps waves focused on actionable work |
| Post-review flow | Summary checkpoint before clustering | Chairman sees full picture before grouping |
| Approved wave locking | New items create new waves only | Preserves approval integrity |
| New wave naming | Independent (no reference to existing waves) | Clean separation between approved and incoming work |
| Pre-SD development | Batch brainstorm per wave | Strategic depth without per-item overhead |
| Brainstorm gate | Chairman reviews before promotion | Last chance to drop/reframe before SD creation |
| Activation | Default behavior of /distill | `--skip-review` flag to bypass when needed |

## Implementation Scope

### Existing infrastructure to leverage:
- `lib/integrations/url-extractor.js` — YouTube URL extraction from text
- `lib/integrations/dedup-checker.js` — Cross-source dedup with video ID matching
- `lib/integrations/youtube/video-metadata.js` — YouTube API v3 metadata fetch
- `lib/integrations/evaluation-bridge.js` — Steps 1.5-1.7 (extraction + cross-linking), not currently wired into distill
- `eva_todoist_intake` schema — Already has `extracted_youtube_id`, `extracted_youtube_url`, `youtube_intake_id`, `chairman_intent`, `chairman_notes` columns
- `roadmap_waves.status` — Already has `proposed`/`approved`/`active`/`completed`/`archived` lifecycle

### New work needed:
1. Wire enrichment into distill sync path (connect evaluation-bridge extraction to `eva-intake-pipeline.js`)
2. Build chairman review step (AskUserQuestion loop with enrichment display)
3. Add approved-wave locking to `roadmap-generate.js` clustering logic
4. Build wave-level batch brainstorm step
5. Build brainstorm review step (AskUserQuestion with wave findings)
6. Enhance promote step to attach enrichment + brainstorm context to SDs
7. Add `--skip-review` flag to pipeline
8. Web page summarization for non-YouTube URLs (new capability)

## Deferred / Out of Scope
- YouTube sync fix (gaxios module issue) — separate fix
- YouTube transcript fetching — not built, could enhance enrichment later
- Retroactive review of existing 442 items — focus on new items going forward
