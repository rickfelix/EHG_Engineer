# /eva score - EVA Vision Alignment Scorer

Score a Strategic Directive or build scope against the active EVA Vision and Architecture
documents. Produces per-dimension scores, a total alignment score, threshold action,
and optionally auto-generates a corrective SD for any gap.

## Usage

```
/eva score --sd-id <SD-KEY> [--vision-key <KEY>] [--arch-key <KEY>] [--dry-run]
/eva score --scope "<description>" [--vision-key <KEY>] [--arch-key <KEY>] [--dry-run]
```

## Instructions for Claude

### Step 1: Parse Arguments

From `$ARGUMENTS`, extract:
- **`--sd-id`**: SD key to score (e.g. `SD-MAN-INFRA-001`). Mutually exclusive with `--scope`.
- **`--scope`**: Free-text description of what to score (alternative to --sd-id).
- **`--vision-key`**: Optional. Vision document key (e.g. `VISION-EHG-L1-001`). Auto-loaded from DB if omitted.
- **`--arch-key`**: Optional. Architecture plan key (e.g. `ARCH-EHG-L1-001`). Auto-loaded from DB if omitted.
- **`--dry-run`**: Optional. Preview scores without writing to database.

If neither `--sd-id` nor `--scope` is provided, show error:
```
❌ Usage: /eva score --sd-id <SD-KEY> [options]
         /eva score --scope "<description>" [options]

Options:
  --vision-key <KEY>   Vision document key (auto-loads latest if omitted)
  --arch-key <KEY>     Architecture plan key (auto-loads latest if omitted)
  --dry-run            Preview scores without writing to database
```

---

### Step 2: Run the Scoring Command

```bash
node scripts/eva/score-command.mjs \
  [--sd-id <sdKey>] \
  [--scope "<scope>"] \
  [--vision-key <visionKey>] \
  [--arch-key <archKey>] \
  [--dry-run]
```

Display the command output directly to the user. The script handles:
- Loading default vision/arch keys from DB when flags are omitted
- Calling `scoreSD()` to produce LLM-based dimension scores
- Calling `generateCorrectiveSD()` when score is below accept threshold
- Formatting the results table

---

### Step 3: After Scoring

If the command succeeds, offer next steps using AskUserQuestion:

```javascript
{
  "questions": [{
    "question": "Scoring complete. What would you like to do next?",
    "header": "Next Step",
    "multiSelect": false,
    "options": [
      {"label": "View corrective SD", "description": "Open the auto-generated corrective SD in the queue"},
      {"label": "Score another SD", "description": "Run /eva score on a different SD"},
      {"label": "View vision document", "description": "Run /eva vision list to see all vision documents"},
      {"label": "Done", "description": "No further action"}
    ]
  }]
}
```

**If "View corrective SD"**: Run `/leo next` to show the SD queue where the corrective SD appears.
**If "Score another SD"**: Ask "Which SD key would you like to score?" then restart from Step 2.

---

### Step 4: Error Handling

| Error | User message |
|-------|-------------|
| Vision document not found | "❌ Vision document '<key>' not found. Run `/eva vision list` to see available documents." |
| Architecture plan not found | "❌ Architecture plan '<key>' not found. Run `/eva archplan list` to see available plans." |
| SD not found | "❌ SD '<key>' not found in the database. Check the SD key and try again." |
| LLM scoring failed | "❌ Scoring failed: <error>. Check LLM provider connectivity." |

---

## Score Tiers

| Score | Action | Result |
|-------|--------|--------|
| ≥ 85 | **Accept** | No corrective SD created |
| 70–84 | **Minor** | Corrective SD created (priority: medium) |
| 50–69 | **Gap Closure** | Corrective SD created (priority: high) |
| < 50 | **Escalation** | Corrective SD created (priority: critical) |

---

## Related Commands

- `/eva vision` — Manage vision documents
- `/eva archplan` — Manage architecture plans
- `/eva research` — Research questions against vision dimensions
- `/leo next` — View SD queue (includes any corrective SDs generated)
