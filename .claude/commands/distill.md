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

**Pipeline**: Dedup → Reconcile → Score → Promote

```bash
node scripts/eva-intake-refine.js [flags]
```

Pass through any flags the user provided (`--dry-run`, `--roadmap-id <id>`, `--wave-id <id>`, `--skip-promote`, `--from-step N`).

Use `timeout: 600000` (10 minutes) — AI scoring across 4 personas can take time.

After the pipeline completes, summarize:
- Duplicate groups found
- Reconciliation results (novel vs already-done items)
- Scoring distribution (promote / review / defer)
- Research SDs created (if promotion ran)

If this was a live run, show:
```
Next steps:
  /distill approve --roadmap-id <id>    Approve refined waves
  /distill promote --wave-id <id>       Promote approved wave to SDs
  /distill status                       View current roadmap
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

**Step 1: Build the command**

Start with the base command and append flags from arguments:

```bash
node scripts/eva-intake-pipeline.js [flags]
```

Pass through any flags the user provided (`--dry-run`, `--skip-sync`, `--from-step N`, `--app <app>`).

**Step 2: Execute the pipeline**

```bash
node scripts/eva-intake-pipeline.js $FLAGS
```

Use `timeout: 600000` (10 minutes) — the AI classification and clustering steps can take time with 200+ items.

**Step 3: Present results**

After the pipeline completes, summarize:
- How many items were synced (if sync ran)
- Classification coverage (should be 100% if all items classified)
- Number of waves proposed and their themes
- Whether results were persisted (live run) or previewed (dry run)

**Step 4: Next steps**

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

| Step | What it does | Script |
|------|-------------|--------|
| 1. Sync | Pull new items from Todoist + YouTube | `eva-idea-sync.js` |
| 2. Classify | AI classification using 3D taxonomy (App + Aspects + Intent) | `eva-intake-classify.js` |
| 3. Cluster | AI groups classified items into 2-6 execution waves | `roadmap-generate.js` |
| 4. Archive | Move classified items to Processed (Todoist project + YouTube playlist) | `eva-intake-archive.js` |
| 5. Status | Display roadmap with wave breakdown | `roadmap-status.js` |

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
