# /eva archplan - EVA Architecture Plan Manager

Create, version, and manage Architecture Plans linked to Vision documents
in the EVA Vision Governance system.

## Usage

```
/eva archplan create [--vision-key <key>] [--plan-key <key>] [--source <file-path>] [--brainstorm-id <uuid>]
/eva archplan version --plan-key <key> --source <file-path>
/eva archplan addendum --plan-key <key> --section "<text>"
/eva archplan list
```

## Instructions for Claude

### Step 0: Parse Arguments

From `$ARGUMENTS`, determine the subcommand:
- No args or `list` → list all architecture plans with vision linkage
- `create` → create a new architecture plan linked to a vision document
- `version` → create a new version of an existing architecture plan
- `addendum` → append a section to an existing architecture plan

---

### If subcommand is `list`:

```bash
node scripts/eva/archplan-command.mjs list
```

Display the output directly.

---

### If subcommand is `create` or `version`:

**Step 1: Select source file**

If `--source` not provided, ask:
```
"What is the path to the architecture source document? (e.g. docs/plans/eva-platform-architecture.md)"
```

**Step 1.5: Brainstorm tradeoff linkage**

Ask using AskUserQuestion:

```javascript
{
  "questions": [{
    "question": "Does this architecture plan formalize a specific brainstorm option or tradeoff?",
    "header": "Brainstorm Link",
    "multiSelect": false,
    "options": [
      {"label": "Yes — link to brainstorm", "description": "I'll provide the brainstorm session ID for traceability"},
      {"label": "No — standalone plan", "description": "This plan is not derived from a brainstorm session"}
    ]
  }]
}
```

If yes, ask for the brainstorm-id and pass it as `--brainstorm-id <uuid>` to the upsert command.

**Step 2: Select parent vision document**

If `--vision-key` not provided:
1. Run `node scripts/eva/vision-command.mjs list` to show available vision documents
2. Ask the user which vision document this architecture plan is linked to:

```javascript
{
  "questions": [{
    "question": "Which vision document should this architecture plan be linked to?",
    "header": "Parent Vision",
    "multiSelect": false,
    "options": [
      {"label": "VISION-EHG-L1-001", "description": "EHG Portfolio Vision v1 (L1)"}
    ]
  }]
}
```
(Populate options dynamically from the list output.)

**Step 3: Generate a plan key**

Format: `ARCH-<PREFIX>-<LEVEL>-<NNN>`
- Portfolio architecture: `ARCH-EHG-L1-<NNN>` (e.g. ARCH-EHG-L1-002)
- Venture-specific: `ARCH-<VENTURE_ID>-L2-001`

Check existing keys with `list` to determine the next number.

**Step 4: Extract dimensions with ADR/capability context**

```bash
node scripts/eva/archplan-command.mjs extract --source <source-path>
```

Capture the JSON output (dimensions array). The script automatically queries
`leo_adrs` and `sd_capabilities` to enrich the LLM extraction context.

**Step 4.5: Required section validation**

Check the source document for these required architecture sections:
- Stack Decisions (technology choices)
- Data Layer (database, queries, RLS)
- Implementation Phases (milestones/timeline)
- Risk Mitigation (failure modes, rollback)

If any are missing, ask using AskUserQuestion:

```javascript
{
  "questions": [{
    "question": "The source document is missing: [list missing sections]. These improve HEAL architecture scoring.",
    "header": "Missing Sections",
    "multiSelect": false,
    "options": [
      {"label": "Add sections now", "description": "I'll provide the missing content before saving"},
      {"label": "Proceed without", "description": "Save as-is — sections can be added via addendum later"}
    ]
  }]
}
```

**Step 5: Chairman approval gate**

Present the dimensions to the user:

```
📐 Extracted Architecture Dimensions (preview before saving):

[list each dimension: name, weight, description, source_section]

Plan Key:    <generated-key>
Vision Link: <vision-key>
Source:      <source-path>
Dimensions:  <count>
ADR Context: <N ADRs loaded | not available>
```

Then ask:

```javascript
{
  "questions": [{
    "question": "Review the extracted architecture dimensions above. Approve to save.",
    "header": "Chairman Approval",
    "multiSelect": false,
    "options": [
      {"label": "Approve — Save to database", "description": "Upsert architecture plan linked to vision"},
      {"label": "Reject — Cancel", "description": "Do not save. No changes made."}
    ]
  }]
}
```

**Step 6: On Approve — upsert**

```bash
node scripts/eva/archplan-command.mjs upsert \
  --plan-key <key> \
  --vision-key <vision-key> \
  --source <source-path> \
  --dimensions '<dimensions-json>'
```

Display the confirmation output.

**Step 7: On Reject**

Output:
```
❌ Architecture plan creation cancelled. No changes were made.
```

---

---

### If subcommand is `addendum`:

**Step 1: Identify the architecture plan**

If `--plan-key` not provided:
1. Run `node scripts/eva/archplan-command.mjs list` to show existing plans
2. Ask user which plan key to add an addendum to

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
    "question": "Add this section as an addendum to <plan-key>? Dimensions will be re-extracted with ADR context.",
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
node scripts/eva/archplan-command.mjs addendum \
  --plan-key <key> \
  --section "<section-text>"
```

Display the output confirming the addendum was added.

---

## Related Commands

- `/eva vision` — Manage vision documents (parent of architecture plans)
- `/eva score` — Score a build against vision + architecture dimensions
- `node scripts/eva/seed-l1-vision.js` — Seed initial L1 architecture from existing docs (one-time)

## Notes

- Architecture plans MUST be linked to a Vision document (vision_id FK is required)
- Dimensions are enriched with ADR context from `leo_adrs` and capabilities from `sd_capabilities`
- If `leo_adrs` or `sd_capabilities` are empty, extraction proceeds with source content only
- Chairman approval is required before any DB write
- All architecture plans stored in `eva_architecture_plans` table
- Use `/eva vision list` to see available vision documents before creating an architecture plan
