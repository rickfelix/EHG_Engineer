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
- `approve --roadmap-id <id>` → Chairman approves wave sequence
- `promote --wave-id <id>` → Promote approved wave items to SDs

## Instructions

### If argument is "status":

```bash
node scripts/roadmap-status.js
```

Display the output showing all roadmaps with their waves, item counts, and progress.

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
/distill approve --roadmap-id abc # Chairman approves wave sequence
/distill promote --wave-id xyz    # Promote approved wave to SDs
```

## Command Ecosystem

| Before this | After this |
|-------------|------------|
| Todoist/YouTube capture | `/distill` processes raw ideas |
| `/distill` completes | `/distill status` to review waves |
| Chairman reviews waves | `/distill approve` to lock sequence |
| Waves approved | `/distill promote` to create SDs |
| SDs created | `/leo next` to begin work |
