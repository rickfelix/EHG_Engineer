# Distill Command

Refine raw ideas from all sources into strategic roadmap waves.

Runs the full EVA intake pipeline: **Sync → Classify → AI Wave Clustering → Archive → Roadmap Status**

## Arguments

Parse `$ARGUMENTS` for flags:
- No args → Full pipeline
- `--dry-run` → Preview only, no DB writes
- `--skip-sync` → Skip Todoist/YouTube sync, start at classify
- `--from-step N` → Start from step N (1-4)
- `--app <app>` → Filter clustering by application (ehg_engineer, ehg_app, new_venture)
- `--skip-archive` → Skip moving items to Processed (Todoist project / YouTube playlist)
- `status` → Show current roadmap status only
- `refine` → Run pre-promote refinement pipeline (dedup, reconcile, score, promote)
- `refine --dry-run` → Preview refinement without DB writes
- `refine --roadmap-id <id>` → Refine a specific roadmap
- `refine --wave-id <id>` → Refine a specific wave only
- `refine --skip-promote` → Run steps 1-3 only (no Research SD creation)
- `approve --roadmap-id <id>` → Chairman approves wave sequence
- `promote --wave-id <id>` → Promote approved wave items to SDs

## Instructions

### If argument is "status":

```bash
node scripts/roadmap-status.js
```

Display the output showing all roadmaps with their waves, item counts, and progress.

---

### If argument starts with "refine":

Run the pre-promote refinement pipeline. This runs AFTER `/distill` creates waves and BEFORE `/distill approve`.

**Pipeline**: **Dedup (Claude Code inline)** → **Reconcile (Claude Code inline)** → **Score (Claude Code inline)** → Promote

All three analysis steps use Claude Code inline for semantic analysis (not an external API). This is a 7-phase orchestration:

**Phase A: Extract Dedup Context**

```bash
node scripts/eva-intake-refine.js --extract-dedup [flags]
```

Pass through user flags (`--dry-run`, `--roadmap-id <id>`, `--wave-id <id>`).
Use `timeout: 600000` (10 minutes).

This outputs `===DEDUP_CONTEXT===` JSON containing per-wave item summaries (title, description, source_type, target_application, chairman_intent).

**Phase B: Claude Code Inline Deduplication**

Read the `===DEDUP_CONTEXT===` JSON from Phase A output. For each wave, semantically identify duplicate/near-duplicate items:

1. Parse the context JSON (between `===DEDUP_CONTEXT===` and `===END_DEDUP_CONTEXT===`)
2. For each wave's items, find groups of duplicates or near-duplicates — same idea expressed differently
3. Rules:
   - Match on MEANING, not just keywords. "Add dark mode" and "Implement theme switching" are duplicates.
   - Items from different sources (todoist vs youtube) can still be duplicates if about the same topic.
   - YouTube videos about the same tool/topic (e.g., multiple OpenClaw tutorials) should be grouped.
   - Items with the same chairman_intent AND overlapping scope are likely duplicates.
   - Short/vague items (single words like "script") should NOT be grouped unless clearly identical.
   - Each item should appear in at most ONE group.
   - Groups must have at least 2 items.
   - item_indices are 1-based (per wave, not global).
4. Produce results per wave.

Write results to `scripts/temp/dedup-results.json` using the Write tool:
```json
[
  {
    "wave_id": "<uuid>",
    "wave_title": "Wave 1 Title",
    "groups": [
      {"item_indices": [1, 3], "reason": "Both about implementing dark mode"},
      {"item_indices": [5, 8, 12], "reason": "All OpenClaw integration tutorials"}
    ]
  }
]
```

For efficiency with 400+ items: process each wave separately, batch items in groups of ~30-50.

**Phase C: Extract Reconcile Context**

```bash
node scripts/eva-intake-refine.js --from-step 2 --dedup-file scripts/temp/dedup-results.json --extract-reconcile [flags]
```

Pass through user flags. Use `timeout: 600000`.

This loads dedup results, then outputs `===RECONCILE_CONTEXT===` JSON containing:
- All existing SDs (sd_key, status, title, key_changes)
- All wave items (title, description, target_application, chairman_intent)

**Phase D: Claude Code Inline Reconciliation**

Read the `===RECONCILE_CONTEXT===` JSON from Phase C output. For each wave item, semantically match against existing SDs:

1. Parse the context JSON (between `===RECONCILE_CONTEXT===` and `===END_RECONCILE_CONTEXT===`)
2. For each item, determine status:
   - `novel` — No existing SD covers this idea
   - `already_done` — A completed SD already delivered this capability
   - `in_progress` — An active SD is working on this
   - `partially_done` — An SD partially covers this
3. Match on MEANING, not keywords. "Add dark mode" should match "Implement theme switching".
4. Only flag non-novel if confidence >= 60.
5. Short/vague items with no clear semantic match → `novel`.

Write results to `scripts/temp/reconcile-results.json` using the Write tool:
```json
{
  "results": [
    {"item_index": 1, "status": "novel", "matched_sd_key": null, "matched_sd_title": null, "confidence": 0},
    {"item_index": 2, "status": "already_done", "matched_sd_key": "SD-XXX-001", "matched_sd_title": "...", "confidence": 85}
  ]
}
```

For efficiency with 400+ items: batch analysis by wave, process items in groups of ~30-50, use an Explore agent if needed to parallelize.

**Phase E: Extract Scoring Context**

```bash
node scripts/eva-intake-refine.js --from-step 3 --reconcile-file scripts/temp/reconcile-results.json --extract-scoring [flags]
```

Pass through user flags. Use `timeout: 600000`.

This loads the inline reconcile results, then outputs `===SCORING_CONTEXT===` JSON containing per-wave items with the 4-persona rubric (Optimist 15%, Pragmatist 35%, Devil's Advocate 25%, Strategist 25%).

**Phase F: Claude Code Inline Scoring**

Read the `===SCORING_CONTEXT===` JSON from Phase E output. For each wave's items, score using the 4-persona rubric:

1. Parse the context JSON (between `===SCORING_CONTEXT===` and `===END_SCORING_CONTEXT===`)
2. For each item in each wave, evaluate through all 4 personas:
   - **Optimist** (15%): Potential upside, innovation value, opportunity
   - **Pragmatist** (35%): Feasibility, effort-to-value ratio, achievability
   - **Devil's Advocate** (25%): Risk level (INVERTED: 100 = low risk, 0 = extremely risky)
   - **Strategist** (25%): Vision alignment, strategic importance, timing
3. Compute composite: `(optimist × 0.15) + (pragmatist × 0.35) + (devils_advocate × 0.25) + (strategist × 0.25)`
4. Assign recommendation: `promote` if ≥70, `review` if 40-69, `defer` if <40
5. Rules:
   - Score based on the item's MEANING and strategic value, not just keywords.
   - Consider the wave context (title/description) when scoring strategic alignment.
   - YouTube reference videos score high on pragmatist (actionable) and strategist (informative).
   - Vague/short items without clear scope score lower on pragmatist.
   - Items about core infrastructure (security, protocols) score high on strategist.
   - Keep reasoning to 1 sentence per persona.

Write results to `scripts/temp/scoring-results.json` using the Write tool:
```json
[
  {
    "wave_id": "<uuid>",
    "wave_title": "Wave 1 Title",
    "item_scores": [
      {
        "item_index": 1,
        "composite": 75,
        "persona_scores": {
          "optimist": {"score": 80, "reasoning": "High potential..."},
          "pragmatist": {"score": 70, "reasoning": "Feasible..."},
          "devils_advocate": {"score": 75, "reasoning": "Low risk..."},
          "strategist": {"score": 78, "reasoning": "Aligns with..."}
        },
        "recommendation": "promote"
      }
    ],
    "method": "claude_inline"
  }
]
```

For efficiency with 400+ items: use parallel Explore agents (one per wave or batch of ~30-50 items).

**Phase G: Promote with Inline Scoring Results**

```bash
node scripts/eva-intake-refine.js --from-step 4 --scoring-file scripts/temp/scoring-results.json [flags]
```

Pass through user flags. Use `timeout: 600000`.

This loads the inline scoring results, persists scores to DB, then runs Step 4 (promotion).

**After all 7 phases complete**, summarize:
- Duplicate groups found (Phase B, semantic)
- Reconciliation results — novel vs already-done items (Phase D, semantic)
- Scoring distribution — promote / review / defer (Phase F, semantic)
- Research SDs created if promotion ran (Phase G)

If this was a live run, show:
```
Next steps:
  /distill approve --roadmap-id <id>    Approve refined waves
  /distill promote --wave-id <id>       Promote approved wave to SDs
  /distill status                       View current roadmap
```

**Fallback**: If inline flags are NOT used (e.g., running the script directly from CLI), the pipeline uses keyword dedup + Gemini scoring as a fast fallback:
```bash
node scripts/eva-intake-refine.js [flags]
```

---

### If argument starts with "approve":

Extract `--roadmap-id` from arguments:

```bash
node scripts/roadmap-promote.js --approve --roadmap-id <id>
```

If `--roadmap-id` is missing, show usage:
```
Usage: /distill approve --roadmap-id <uuid>
       /distill approve --roadmap-id <uuid> --rationale "reason"
```

---

### If argument starts with "promote":

Extract `--wave-id` from arguments:

```bash
node scripts/roadmap-promote.js --wave-id <id>
```

Add `--dry-run` if the user included it. If `--wave-id` is missing, show usage:
```
Usage: /distill promote --wave-id <uuid>
       /distill promote --wave-id <uuid> --dry-run
```

---

### If no subcommand (default — run pipeline):

The pipeline runs in 3 phases: automated pre-processing, interactive chairman review, then automated post-processing.

**Phase 1: Sync + Classify + Enrich (automated)**

Run Steps 1-2.5 of the pipeline (sync, classify, enrich) via subprocess. Pass through user flags.

```bash
node scripts/eva-intake-pipeline.js --from-step 1 --skip-review $FLAGS
```

Use `timeout: 600000`. The `--skip-review` flag skips the auto-review — we handle review interactively below.

**Phase 2: Chairman Interactive Review (inline via AskUserQuestion)**

After Phase 1 completes, fetch unreviewed items and present them to the chairman for intent decisions.

**Step 2a: Fetch unreviewed items**

```bash
node scripts/eva/chairman-intake-review.js --interactive
```

Use `timeout: 45000`. Parse the output between `REVIEW_ITEMS_START` and `REVIEW_ITEMS_END` as JSON. Also capture `REVIEW_COUNT=N`.

If `REVIEW_COUNT=0`, skip to Phase 3 — no items need review.

**Step 2b: Present items to chairman via AskUserQuestion**

For each item in the review JSON (or batched in groups of up to 4 — AskUserQuestion supports 1-4 questions per call):

Each item has: `itemId`, `markdown` (formatted description), `options` (intent choices with AI recommendation first), `title`, `captureIntent`.

**Build the question text** for each item:
1. Start with the item's `markdown` field (title, source, application, aspects, enrichment summary, confidence, description)
2. **If the item has a YouTube video**: Add a clickable link line: `**Watch:** https://www.youtube.com/watch?v=VIDEO_ID` — detect this by checking if `enrichment_summary` contains "Video:" or "YouTube video:" or if the title contains a youtu.be/youtube.com URL
3. **If enrichment contains "AI Analysis:"**: Show the Gemini video summary prominently — this is the actual content analysis of the video

Present using AskUserQuestion:
- `question`: The built question text with clickable YouTube URL
- `header`: "Review"
- `options`: Use the item's `options` array (Build/Research/Reference/Improve with AI recommendation marked)
- `multiSelect`: false

**IMPORTANT**: Use the `annotations` parameter on the AskUserQuestion call to enable the chairman to add notes. The user can attach free-text notes to any selection. After the user responds, check `annotations` for any notes they provided.

**Batching strategy** (for efficiency when many items):
- If ≤ 4 items: present all in a single AskUserQuestion call (one question per item)
- If 5-20 items: batch into groups of 4, present sequentially
- If > 20 items: present an initial AskUserQuestion asking:
  - "Auto-approve all N items with AI recommendations" — stamps all items without further questions
  - "Review each item individually" — presents each item (batched in groups of 4)
  - "Review only low-confidence items (< 80%)" — auto-approves high-confidence, presents only low-confidence ones

**Step 2c: Store decisions**

For each item the chairman reviewed, store the decision AND any notes. The `chairman_intent` column has a check constraint allowing only: `idea`, `insight`, `reference`, `question`, `value`. So we store the chairman's action-intent choice by mapping it BACK to capture-intent for storage:

| Chairman chose | Store as `chairman_intent` |
|---------------|---------------------------|
| Build | `idea` |
| Improve | `insight` |
| Reference | `reference` |
| Research | `question` |

Check `annotations` from the AskUserQuestion response for any notes the chairman provided. Store notes in `chairman_notes` column.

For each reviewed item, run:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('eva_todoist_intake').update({
  chairman_intent: 'INTENT_VALUE',
  chairman_notes: 'NOTES_OR_NULL',
  chairman_reviewed_at: new Date().toISOString()
}).eq('id', 'ITEM_UUID').then(({error}) => {
  if (error) console.error('Error:', error.message);
  else console.log('OK');
});
"
```

Replace `INTENT_VALUE` with the mapped capture-intent value and `ITEM_UUID` with the item ID.

You can batch multiple updates into a single script for efficiency.

**Step 2d: Gemini video analysis for YouTube items (post-review)**

After storing all chairman decisions, check if any reviewed items are YouTube videos where the chairman provided notes. For these items, run Gemini video analysis with the chairman's intent as context.

Identify YouTube items: items where `enrichment_summary` starts with `"Video:"` or contains `"YouTube video:"`.

For each YouTube item with chairman notes, run:

```bash
node -e "
import dotenv from 'dotenv';
dotenv.config();
import { analyzeVideoContent } from './lib/integrations/youtube/video-metadata.js';

const result = await analyzeVideoContent('VIDEO_ID', {
  verbose: true,
  chairmanIntent: 'CHAIRMAN_NOTES_HERE',
  metadata: { title: 'VIDEO_TITLE', channelName: 'CHANNEL', durationSeconds: DURATION }
});
if (result) console.log('ANALYSIS:' + result);
else console.log('ANALYSIS_FAILED');
"
```

Use `timeout: 120000` (videos can take time).

If analysis succeeds, update the item's `enrichment_summary` to append the analysis:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('eva_todoist_intake').update({
  enrichment_summary: 'EXISTING_SUMMARY | Chairman Analysis: GEMINI_RESULT'
}).eq('id', 'ITEM_UUID').then(({error}) => {
  if (error) console.error('Error:', error.message);
  else console.log('OK');
});
"
```

Present the Gemini analysis to the chairman as a summary after all items are processed.

**Step 2e: Build brainstorm queue and mark items processed**

After storing decisions (Step 2c) and any Gemini analysis (Step 2d):

**2e.1: Build the brainstorm queue**

Partition all reviewed items into two lists:
- **Brainstorm queue**: Items WITH `chairman_notes` — need brainstorming before wave clustering
- **Direct-to-wave**: Items WITHOUT `chairman_notes` — skip brainstorming, go straight to waves

Display the queue:
```
Brainstorm Queue (N items):
  1. [PENDING] "Item title..." (YouTube / Web / Text)
  2. [PENDING] "Item title..." (YouTube / Web / Text)

Direct to Waves (M items):
  3. "Item title..." → reference (no notes, skip brainstorm)
```

**2e.2: Mark ALL reviewed items as processed**

After the chairman has expressed intent on every item (regardless of whether they have notes), mark them as `status = 'processed'`. Do NOT set `processed_at` here — the archive step (Step 5) sets `processed_at` after completing Todoist tasks. Setting `processed_at` prematurely causes the archive to skip these items.

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ids = [REVIEWED_ITEM_IDS];
sb.from('eva_todoist_intake').update({
  status: 'processed'
}).in('id', ids).then(({error}) => {
  if (error) console.error('Error:', error.message);
  else console.log('Marked', ids.length, 'items as processed');
});
"
```

**2e.3: Process brainstorm queue sequentially**

For each item in the brainstorm queue, process one at a time:

1. Display progress: `Brainstorming 1 of N: "Item title..."`

2. **Invoke `/brainstorm`** with the item as the topic, seeded with context:

   ```
   skill: "brainstorm"
   args: "<item title> --domain <auto-detect from target_application>"
   ```

   Domain mapping from `target_application`:
   - `ehg_engineer` → `protocol` or `architecture` (auto-detect from aspects)
   - `ehg_app` → `venture` or `architecture`
   - `new_venture` → `venture`

   **IMPORTANT**: Before the brainstorm skill starts its discovery questions, inject the following context so it doesn't ask redundant questions:

   ```
   Pre-seeded context from EVA intake:
   - Chairman's intent: "<chairman_notes>"
   - Video/content analysis: "<gemini_analysis_if_available>"
   - Enrichment summary: "<enrichment_summary>"
   - Source: <todoist_url>
   - Application: <target_application>
   - Aspects: <target_aspects>

   Use this context to skip discovery questions the chairman has already answered.
   Focus the brainstorm on shaping the chairman's stated intent into an actionable plan.
   ```

3. **After brainstorm completes**, auto-chain vision → arch → SD creation:

   a. **Link brainstorm to intake item**:
   ```bash
   node -e "
   require('dotenv').config();
   const { createClient } = require('@supabase/supabase-js');
   const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   sb.from('eva_todoist_intake').update({
     enrichment_summary: 'EXISTING_SUMMARY | Brainstorm: SESSION_ID'
   }).eq('id', 'ITEM_UUID').then(({error}) => {
     if (error) console.error('Error:', error.message);
     else console.log('Linked brainstorm to intake item');
   });
   "
   ```

   b. **Check if brainstorm produced vision+arch docs** (SD-DISTILLTOBRAINSTORM-CONTINUOUS-GUIDED-PIPELINE-ORCH-001-A):
   ```bash
   node -e "
   require('dotenv').config();
   const { createClient } = require('@supabase/supabase-js');
   const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   sb.from('brainstorm_sessions').select('id, title, metadata')
     .eq('id', 'BRAINSTORM_SESSION_ID').single()
     .then(({data}) => {
       const vk = data?.metadata?.vision_key;
       const ak = data?.metadata?.arch_key;
       if (vk && ak) {
         console.log('AUTO_CHAIN=true');
         console.log('VISION_KEY=' + vk);
         console.log('ARCH_KEY=' + ak);
         console.log('BRAINSTORM_TITLE=' + data.title);
       } else {
         console.log('AUTO_CHAIN=false');
         console.log('REASON=Missing ' + (!vk ? 'vision_key' : 'arch_key'));
       }
     });
   "
   ```

   c. **If AUTO_CHAIN=true**, create SD from brainstorm (using existing leo-create-sd.js):
   ```bash
   node scripts/leo-create-sd.js --vision-key VISION_KEY --arch-key ARCH_KEY "BRAINSTORM_TITLE"
   ```
   This auto-creates an SD with vision+arch keys linked, bypassing the vision readiness rubric (exempt due to upstream governance).

   d. **Link SD to wave item** via brainstorm-to-roadmap hook:
   ```bash
   node -e "
   const { createRoadmapItemFromBrainstorm } = await import('./scripts/modules/brainstorm-to-roadmap.js');
   createRoadmapItemFromBrainstorm('BRAINSTORM_SESSION_ID').then(r => {
     if (r.created) console.log('Roadmap item created: ' + r.item_id);
     else console.log('Roadmap: ' + r.reason);
   });
   "
   ```

   e. **If AUTO_CHAIN=false**, mark item as `needs_triage` for manual follow-up.

4. Update queue display: `[DONE] "Item title..." → sd_created (VISION-KEY, ARCH-KEY)` or `[DONE] "Item title..." → needs_triage`

5. **Continue to next item** in queue automatically.

After all brainstorms complete, display final summary:
```
Brainstorm Queue Complete:
  1. [DONE] "Item title..." → sd_created
  2. [DONE] "Item title..." → needs_triage

Direct to Waves: M items
Processed (Todoist archived): N items total
```

**Phase 3: Waves + Archive + Status (automated)**

Resume the pipeline from Step 4:

```bash
node scripts/eva-intake-pipeline.js --from-step 4 $FLAGS
```

Use `timeout: 600000`.

**Step 4: Present results**

After the pipeline completes, summarize:
- How many items were synced (if sync ran)
- Classification coverage (should be 100% if all items classified)
- How many items the chairman reviewed and the intent distribution
- Number of waves proposed and their themes
- Whether results were persisted (live run) or previewed (dry run)

**Step 5: Next steps**

If this was a live run (not dry-run), show:
```
Chairman Review (next steps):
  /distill status                              View roadmap waves
  /distill approve --roadmap-id <id>           Approve wave sequence
  /distill promote --wave-id <id>              Promote wave to SDs
```

If this was a dry run, suggest:
```
Looks good? Run without --dry-run to persist:
  /distill
  /distill --skip-sync    (if items already synced)
```

---

## Pipeline Steps Reference

| Step | What it does | Script / Method |
|------|-------------|-----------------|
| 1. Sync | Pull new items from Todoist + YouTube | `eva-idea-sync.js` |
| 2. Classify | AI classification using 3D taxonomy | `eva-intake-classify.js` |
| 2.5. Enrich | YouTube metadata, web summaries, SPA detection | `eva/intake-enricher.js` |
| 3. Chairman Review | Interactive intent review via AskUserQuestion + notes | **Inline** (not subprocess) |
| 3.5. Gemini Analysis | Analyze YouTube videos guided by chairman's intent | `video-metadata.js` |
| 3.7. Brainstorm | Shape items with notes into actionable plans | **Inline** → `/brainstorm` skill |
| 4. Cluster | AI groups classified items into 2-6 execution waves | `roadmap-generate.js` |
| 5. Archive | Move classified items to Processed | `eva-intake-archive.js` |
| 6. Status | Display roadmap with wave breakdown | `roadmap-status.js` |

## Examples

```
/distill                          # Full pipeline (sync + classify + cluster + status)
/distill --dry-run                # Preview without writing to DB
/distill --skip-sync              # Skip sync, classify + cluster existing items
/distill --app ehg_engineer       # Only cluster items for EHG Engineer
/distill status                   # View current roadmap waves
/distill refine                   # Pre-promote refinement (dedup, reconcile, score)
/distill refine --dry-run         # Preview refinement
/distill refine --skip-promote    # Run steps 1-3 only
/distill approve --roadmap-id abc # Chairman approves wave sequence
/distill promote --wave-id xyz    # Promote approved wave to SDs
```

## Command Ecosystem

| Before this | After this |
|-------------|------------|
| Todoist/YouTube capture | `/distill` processes raw ideas |
| `/distill` completes | `/distill refine` to deduplicate, reconcile, and score |
| `/distill refine` completes | `/distill approve` to lock wave sequence |
| Chairman reviews waves | `/distill approve --roadmap-id <id>` |
| Waves approved | `/distill promote` to create SDs |
| SDs created | `/leo next` to begin work |
