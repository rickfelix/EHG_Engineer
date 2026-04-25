<!-- reasoning_effort: medium -->

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
- `refine --skip-promote` → Run steps 1-3 only (skip promotion analysis)
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
   - YouTube videos about the same tool/topic (e.g., multiple OpenClaw tutorials) must be grouped.
   - Items with the same chairman_intent AND overlapping scope are likely duplicates.
   - Short/vague items (single words like "script") must NOT be grouped unless clearly identical.
   - Each item appears in at most ONE group.
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
3. Match on MEANING, not keywords. "Add dark mode" matches "Implement theme switching".
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
   - Account for wave context (title/description) when scoring strategic alignment.
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
- Brainstorm promotion analysis if ran (Phase G)

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

Each item has: `itemId`, `markdown` (formatted description), `options` (ignored — use B1 options below), `title`, `captureIntent`.

**Build the question text** for each item:
1. Start with the item's `markdown` field (title, source, application, aspects, enrichment summary, confidence, description)
2. **If the item has a YouTube video**: Add a clickable link line: `**Watch:** https://www.youtube.com/watch?v=VIDEO_ID` — detect this by checking if `enrichment_summary` contains "Video:" or "YouTube video:" or if the title contains a youtu.be/youtube.com URL
3. **If enrichment contains "AI Analysis:"**: Show the Gemini video summary prominently — this is the actual content analysis of the video

Present using AskUserQuestion with **B1 action-first options** (always use these, ignore the script's `options` array):
- `question`: The built question text with clickable YouTube URL
- `header`: "Review"
- `options`: **Always use these 4 options:**
  1. `"Build now (brainstorm)"` — "Shape this idea immediately via brainstorm → vision → arch → SD"
  2. `"Build later (add to wave)"` — "Add to roadmap wave for future prioritization"
  3. `"Research"` — "Needs investigation before committing to build"
  4. `"Reference"` — "Store for future lookup only — exclude from wave clustering"
- `multiSelect`: false

**Why B1:** The options explicitly encode both intent AND routing. The chairman sees exactly what will happen — no hidden logic based on annotations or notes.

**Batching strategy** (for efficiency when many items):
- If ≤ 4 items: present all in a single AskUserQuestion call (one question per item)
- If 5-20 items: batch into groups of 4, present sequentially
- If > 20 items: present an initial AskUserQuestion asking:
  - "Auto-approve all N items with AI recommendations" — stamps all items without further questions
  - "Review each item individually" — presents each item (batched in groups of 4)
  - "Review only low-confidence items (< 80%)" — auto-approves high-confidence, presents only low-confidence ones

**Step 2c: Store decisions + complete Todoist task (IMMEDIATE)**

For each item the chairman reviewed, store the decision AND immediately complete the Todoist task. The `chairman_intent` column has a check constraint allowing only: `idea`, `insight`, `reference`, `question`, `value`. Map the B1 option to storage:

| Chairman chose | Store as `chairman_intent` | Routing |
|---------------|---------------------------|---------|
| Build now (brainstorm) | `idea` | → brainstorm queue (immediate) |
| Build later (add to wave) | `idea` | → direct to wave clustering |
| Research | `question` | → wave clustering |
| Reference | `reference` | → stored, excluded from waves |

The routing is determined by which option was selected — NOT by annotations or notes.

**IMPORTANT**: Once ANY B1 option is selected, the item is decided. Two things happen immediately:
1. Store the decision in the database
2. Complete (check off) the Todoist task — do NOT defer to the archive step

For each reviewed item, run:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // 1. Store chairman decision + mark processed
  const { error: dbErr } = await sb.from('eva_todoist_intake').update({
    chairman_intent: 'INTENT_VALUE',
    chairman_reviewed_at: new Date().toISOString(),
    status: 'processed',
    processed_at: new Date().toISOString()
  }).eq('id', 'ITEM_UUID');
  if (dbErr) { console.error('DB Error:', dbErr.message); return; }

  // 2. Get the todoist_task_id
  const { data: item } = await sb.from('eva_todoist_intake')
    .select('todoist_task_id').eq('id', 'ITEM_UUID').single();
  if (!item?.todoist_task_id) { console.log('No Todoist task to complete'); return; }

  // 3. Complete the Todoist task via Sync API
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) { console.log('No TODOIST_API_TOKEN — skipping Todoist completion'); return; }
  const uuid = randomUUID();
  const body = new URLSearchParams({
    commands: JSON.stringify([{ type: 'item_complete', uuid, args: { id: item.todoist_task_id } }])
  });
  const resp = await fetch('https://api.todoist.com/api/v1/sync', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const data = await resp.json();
  if (data.sync_status?.[uuid] === 'ok') console.log('Todoist task completed');
  else console.log('Todoist completion status:', JSON.stringify(data.sync_status));
}
run();
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

Partition all reviewed items based on the B1 option the chairman selected (NOT based on annotations/notes):
- **Brainstorm queue**: Items where chairman chose **"Build now (brainstorm)"**
- **Direct-to-wave**: Items where chairman chose **"Build later (add to wave)"** or **"Research"**
- **Reference only**: Items where chairman chose **"Reference"** — excluded from waves

Display the queue:
```
Brainstorm Queue (N items):
  1. [PENDING] "Item title..." (YouTube / Web / Text)
  2. [PENDING] "Item title..." (YouTube / Web / Text)

Direct to Waves (M items):
  3. "Item title..." → build later
  4. "Item title..." → research

Reference Only (P items):
  5. "Item title..." → stored for lookup
```

**2e.2: Items already processed and Todoist-completed**

Step 2c already handles both marking items as `status = 'processed'` AND completing the Todoist task immediately after each B1 selection. No batch processing needed here — every item is processed and Todoist-completed the moment the chairman makes a decision.

**2e.2b: Cherry-pick items for brainstorming (SD-DISTILLTOBRAINSTORM-ORCH-001-C)**

If the brainstorm queue has more than 1 item, present a cherry-pick selection:

```javascript
{
  "question": "Which items should be brainstormed now? (Others will be deferred to waves)",
  "header": "Cherry-Pick Brainstorm Items",
  "multiSelect": true,
  "options": [
    // For each item in brainstorm queue:
    {"label": "Item title...", "description": "Source: YouTube/Web | Score: N"}
  ]
}
```

- **Selected items**: Set `item_disposition = 'selected'` in roadmap_wave_items (if wave item exists)
- **Unselected items**: Set `item_disposition = 'deferred'` — they go to waves without brainstorm
- If only 1 item in queue, auto-select it (skip AskUserQuestion)

**2e.2c: Initialize pause/resume state (SD-DISTILLTOBRAINSTORM-ORCH-001-C)**

Before starting the brainstorm loop, save state for resilience:

```bash
node -e "
const fs = require('fs');
const state = {
  wave_id: 'CURRENT_WAVE_ID',
  selected_items: [/* array of selected item IDs */],
  completed_items: [],
  sds_created: [],
  started_at: new Date().toISOString()
};
fs.writeFileSync('scripts/temp/distill-loop-state.json', JSON.stringify(state, null, 2));
console.log('Loop state saved:', state.selected_items.length, 'items to process');
"
```

On resume (if `distill-loop-state.json` exists at start of Step 2e):
- Load state, filter out `completed_items` from processing
- Display: `Resuming: ${completed} of ${total} items already processed`
- Continue with remaining items

**2e.3: Process brainstorm queue — AUTO-INVOKE `/brainstorm`**

**IMPORTANT**: "Build now (brainstorm)" means NOW. Do NOT ask the chairman if they want to brainstorm — they already said "Build now." Auto-invoke `/brainstorm` immediately for each item in the brainstorm queue.

For each item in the **selected** brainstorm queue (cherry-picked subset), process one at a time:

1. Display progress: `Brainstorming 1 of N: "Item title..."`

2. **Auto-invoke `/brainstorm`** with the item as the topic, seeded with context:

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

3. **After brainstorm completes**, auto-chain: vision → arch → SD → roadmap link

   The brainstorm skill (when invoked from distill with `source: 'distill'`) auto-chains through vision, arch, and SD creation without prompting (Step 11.0). It outputs `DISTILL_SD_CREATED=<SD-KEY>` when complete. Parse this, or fall back to querying the brainstorm session metadata.

   The brainstorm skill outputs a `brainstorm_session_id`. Use it to:

   **3a. Link brainstorm to intake item:**
   ```bash
   node -e "
   require('dotenv').config();
   const { createClient } = require('@supabase/supabase-js');
   const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   sb.from('eva_todoist_intake').update({
     enrichment_summary: 'EXISTING_SUMMARY | Brainstorm: SESSION_ID | SD: SD_KEY'
   }).eq('id', 'ITEM_UUID').then(({error}) => {
     if (error) console.error('Error:', error.message);
     else console.log('Linked brainstorm + SD to intake item');
   });
   "
   ```

   **3b. Check if brainstorm produced vision + arch docs (fallback if DISTILL_SD_CREATED not parsed):**
   ```bash
   node -e "
   require('dotenv').config();
   const { createClient } = require('@supabase/supabase-js');
   const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   sb.from('brainstorm_sessions').select('id, topic, metadata')
     .eq('id', 'BRAINSTORM_SESSION_ID').single()
     .then(({data}) => {
       const vk = data?.metadata?.vision_key;
       const ak = data?.metadata?.arch_key;
       console.log('VISION_KEY=' + (vk || 'NONE'));
       console.log('ARCH_KEY=' + (ak || 'NONE'));
       console.log('CHAIN_READY=' + (vk && ak ? 'true' : 'false'));
     });
   "
   ```

   **3c. If CHAIN_READY=true, create SD from brainstorm:**
   ```bash
   node scripts/leo-create-sd.js --from-brainstorm BRAINSTORM_SESSION_ID --vision-key VISION_KEY --arch-key ARCH_KEY
   ```
   If `leo-create-sd.js` doesn't support `--from-brainstorm`, create the SD directly:
   ```bash
   node -e "
   require('dotenv').config();
   const { createClient } = require('@supabase/supabase-js');
   const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   // Use sd-key-generator for proper key
   const { execSync } = require('child_process');
   const keyResult = execSync('node scripts/modules/sd-key-generator.js LEO feature \"BRAINSTORM_TOPIC\"', {encoding:'utf8'}).trim();
   const sdKey = keyResult.split('\\n').pop().trim();
   sb.from('strategic_directives_v2').insert({
     sd_key: sdKey,
     title: 'BRAINSTORM_TOPIC',
     status: 'draft',
     sd_type: 'feature',
     current_phase: 'LEAD',
     description: 'Created from brainstorm session BRAINSTORM_SESSION_ID via distill pipeline.',
     metadata: { vision_key: 'VISION_KEY', arch_key: 'ARCH_KEY', brainstorm_session_id: 'BRAINSTORM_SESSION_ID', source: 'distill-pipeline' }
   }).select('sd_key').single().then(({data, error}) => {
     if (error) console.error('SD creation failed:', error.message);
     else console.log('SD_CREATED=' + data.sd_key);
   });
   "
   ```

   **3d. Link to roadmap wave item (if wave context exists):**
   ```bash
   node -e "
   require('dotenv').config();
   const { createClient } = require('@supabase/supabase-js');
   const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   // Update wave item with promoted_to_sd_key if this item came from a wave
   sb.from('roadmap_wave_items')
     .update({ promoted_to_sd_key: 'SD_KEY_CREATED' })
     .eq('source_id', 'BRAINSTORM_SESSION_ID')
     .eq('source_type', 'brainstorm')
     .then(({error}) => {
       if (error) console.warn('Wave link skipped:', error.message);
       else console.log('Wave item linked to SD');
     });
   "
   ```

   **3e. If CHAIN_READY=false** (brainstorm didn't produce vision+arch):
   - Log: `[NEEDS_TRIAGE] "Item title..." — brainstorm completed but no vision/arch produced`
   - Item goes to waves for manual processing later

4. Update queue display: `[DONE] "Item title..." → SD_KEY (VISION-KEY, ARCH-KEY)` or `[NEEDS_TRIAGE] "Item title..."`

5. **Inter-item progression** (deterministic under AUTO-PROCEED):

   If there are remaining items in the selected queue, log progress and continue to the next item automatically:

   ```
   [Brainstorm Loop N/M] SD_KEY created. Continuing to: 'NEXT_ITEM_TITLE'
   ```

   The loop state (step 6) is written per iteration regardless of how the loop terminates, so resume always works. Per CLAUDE.md AUTO-PROCEED canonical pause-points, do **not** present an `AskUserQuestion` menu at this boundary.

   **Cancellation pattern** — operators can verbally interrupt at any time. Honor any of:
   - "stop", "skip remaining", "done for now", "defer the rest"
   - On verbal interrupt: set `item_disposition = 'deferred'` for all remaining items, save loop state, skip to summary.
   - On Ctrl+C: state file is already up to date; resume next session via `/distill`.

   If this is the LAST item (no more remaining), skip directly to summary.

6. **After each item completes**, update loop state:
   ```bash
   node -e "
   const fs = require('fs');
   const stateFile = 'scripts/temp/distill-loop-state.json';
   if (fs.existsSync(stateFile)) {
     const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
     state.completed_items.push('ITEM_ID');
     state.sds_created.push('SD_KEY_OR_NULL');
     fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
   }
   "
   ```

After all brainstorms complete, display final summary and clean up state:
```
Distill Pipeline Complete:
  Brainstormed: N/M selected items
  SDs Created:  K (with vision + architecture)
  Needs Triage: J (brainstorm incomplete)
  Deferred:     D (not selected, sent to waves)
  Direct to Waves: P items (no chairman notes)
  Processed (Todoist archived): T items total
```

Clean up loop state:
```bash
node -e "
const fs = require('fs');
const stateFile = 'scripts/temp/distill-loop-state.json';
if (fs.existsSync(stateFile)) { fs.unlinkSync(stateFile); console.log('Loop state cleaned up'); }
"
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
- Classification coverage (target 100% if all items classified)
- How many items the chairman reviewed and the intent distribution
- Number of waves proposed and their themes
- Whether results were persisted (live run) or previewed (dry run)

**Step 5: Next steps (deterministic routing on roadmap state)**

After a live run, route automatically based on the current roadmap state — no `AskUserQuestion` menu, per CLAUDE.md AUTO-PROCEED.

| Roadmap state | Next action |
|---------------|-------------|
| Waves exist but unrefined (no `roadmap_wave_items` with `dedup_status`/`reconcile_status`/`score`) | Log: "Pipeline complete with N waves. Run `/distill refine --roadmap-id <id>` to deduplicate, reconcile, and score." |
| Waves refined but unapproved (`roadmaps.approved_at IS NULL`) | Log: "Refinement complete. Run `/distill approve --roadmap-id <id>` to lock wave sequence." |
| Waves approved but unpromoted | Log: "Approved. Run `/distill promote --wave-id <id>` to create SDs from each wave." |
| Pipeline produced 0 waves | Log: "Pipeline complete; no waves produced (insufficient classified items)." Return. |

The operator can verbally override at any time ("skip refine", "done for now"). Fetch the most recent roadmap ID once for the log lines.

After a dry run, log results and instruct the operator on the exact next command — no menu:

```
[DRY RUN COMPLETE]
  Items synced:    N (preview only — not persisted)
  Items classified: M (preview only — not persisted)
  Waves proposed:   K
  Re-run live:    /distill
  Re-run live (skip sync): /distill --skip-sync
```

Dry run is a true preview — no deferred-tool round-trip is needed to ask whether to persist; the operator decides by re-invoking the command.

---

## Pipeline Steps Reference

| Step | What it does | Script / Method |
|------|-------------|-----------------|
| 1. Sync | Pull new items from Todoist + YouTube | `eva-idea-sync.js` |
| 2. Classify | AI classification using 3D taxonomy | `eva-intake-classify.js` |
| 2.5. Enrich | YouTube metadata, web summaries, SPA detection | `eva/intake-enricher.js` |
| 3. Chairman Review | Interactive B1 action-first review via AskUserQuestion (Build now / Build later / Research / Reference) | **Inline** (not subprocess) |
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
