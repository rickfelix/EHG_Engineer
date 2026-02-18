# /eva vision - EVA Vision Document Manager

Create, version, and manage L1 (portfolio) and L2 (venture-specific) vision documents
in the EVA Vision Governance system.

## Usage

```
/eva vision create [--level L1|L2] [--source <file-path>] [--venture-id <id>]
/eva vision addendum [--vision-key <key>] [--section "<text>"]
/eva vision list
```

## Instructions for Claude

### Step 0: Parse Arguments

From `$ARGUMENTS`, determine the subcommand:
- No args or `list` → list all vision documents
- `create` → create a new vision document
- `addendum` → append a section to an existing vision document

Parse flags: `--level`, `--source`, `--venture-id`, `--vision-key`, `--section`

---

### If subcommand is `list`:

```bash
node scripts/eva/vision-command.mjs list
```

Display the output directly.

---

### If subcommand is `create`:

**Step 1: Determine level and source**

If `--level` not provided, ask:

```javascript
{
  "questions": [{
    "question": "What level of vision document are you creating?",
    "header": "Vision Level",
    "multiSelect": false,
    "options": [
      {"label": "L1 — Portfolio Vision", "description": "EHG portfolio-level vision (applies to all ventures)"},
      {"label": "L2 — Venture Vision", "description": "Venture-specific vision (requires --venture-id)"}
    ]
  }]
}
```

If `--source` not provided, ask:
```
"What is the path to the source document? (e.g. docs/plans/eva-venture-lifecycle-vision.md)"
```

**Step 2: Generate a vision key**

Format: `VISION-<PREFIX>-<LEVEL>-<NNN>`
- L1 portfolio: `VISION-EHG-L1-<NNN>` (e.g. VISION-EHG-L1-002)
- L2 venture: `VISION-<VENTURE_ID>-L2-001`

Check existing keys with `list` to determine the next number.

**Step 3: Extract dimensions via LLM**

```bash
node scripts/eva/vision-command.mjs extract --source <source-path>
```

Capture the JSON output (dimensions array).

**Step 4: Chairman approval gate**

Present the dimensions to the user:

```
📋 Extracted Vision Dimensions (preview before saving):

[list each dimension: name, weight, description]

Vision Key: <generated-key>
Level: <L1|L2>
Source: <source-path>
Dimensions: <count>
```

Then ask:

```javascript
{
  "questions": [{
    "question": "Review the extracted dimensions above. Approve to save to the database.",
    "header": "Chairman Approval",
    "multiSelect": false,
    "options": [
      {"label": "Approve — Save to database", "description": "Upsert vision document with these dimensions"},
      {"label": "Reject — Cancel", "description": "Do not save. No changes made."}
    ]
  }]
}
```

**Step 5: On Approve — upsert**

```bash
node scripts/eva/vision-command.mjs upsert \
  --vision-key <key> \
  --level <L1|L2> \
  --source <source-path> \
  --dimensions '<dimensions-json>'
```

Display the output confirming the stored document.

**Step 6: On Reject**

Output:
```
❌ Vision document creation cancelled. No changes were made.
```

---

### If subcommand is `addendum`:

**Step 1: Identify the vision document**

If `--vision-key` not provided:
1. Run `node scripts/eva/vision-command.mjs list` to show existing docs
2. Ask user which vision key to add an addendum to

**Step 2: Get the addendum section text**

If `--section` not provided, ask:
```
"Enter the addendum section text (can be multi-line markdown):"
```

**Step 3: Preview and confirm**

Show the section text and ask:

```javascript
{
  "questions": [{
    "question": "Add this section as an addendum to <vision-key>? Dimensions will be re-extracted.",
    "header": "Confirm Addendum",
    "multiSelect": false,
    "options": [
      {"label": "Yes — Add addendum", "description": "Append section and re-extract dimensions"},
      {"label": "No — Cancel", "description": "No changes made"}
    ]
  }]
}
```

**Step 4: On confirm — run addendum**

```bash
node scripts/eva/vision-command.mjs addendum \
  --vision-key <key> \
  --section "<section-text>"
```

Display the output confirming the addendum was added.

---

## Related Commands

- `/eva score` — Score a build against a vision document
- `/eva architecture` — Manage architecture plans linked to a vision
- `node scripts/eva/seed-l1-vision.js` — Seed initial L1 vision from existing docs (one-time)

## Notes

- L1 vision documents apply to all EHG ventures (portfolio level)
- L2 vision documents are venture-specific and require `--venture-id`
- Chairman approval is required before any DB write
- `addendum` re-extracts dimensions from the combined content automatically
- All vision documents are stored in `eva_vision_documents` table
