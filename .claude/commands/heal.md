# /heal — Iterative Codebase-vs-Intent Scoring

Score the current codebase against intended outcomes and generate corrective work when gaps are found.

## Arguments

Parse `$ARGUMENTS` to determine the subcommand:
- No args → **Interactive menu** (ask user what to heal)
- `status` → Show heal status (vision + SD)
- `vision` → Vision heal (score codebase vs Vision + Architecture docs)
- `sd` → SD heal (score codebase vs completed Strategic Directives)
- `sd --today` → SDs completed today
- `sd --sd-id X` → Specific SD
- `sd --last N` → Last N completed SDs (default 5)
- `sd --since YYYY-MM-DD` → SDs completed on or after date
- `sd --since YYYY-MM-DD --until YYYY-MM-DD` → SDs in date range

ARGUMENTS: $ARGUMENTS

---

## Instructions for Claude

### Step 1: Parse Arguments

Determine which subcommand to run from the arguments above.

### Step 2: Execute Subcommand

---

#### If no args (bare `/heal`):

Present an interactive menu using AskUserQuestion:

```javascript
{
  "questions": [
    {
      "question": "What would you like to heal?",
      "header": "Heal mode",
      "multiSelect": false,
      "options": [
        {"label": "Vision", "description": "Score codebase vs Vision + Architecture documents (portfolio-level)"},
        {"label": "Strategic Directives", "description": "Score codebase vs completed SD promises (verify delivery)"},
        {"label": "Status", "description": "Show latest heal scores + active correctives"}
      ]
    }
  ]
}
```

**If user selects "Strategic Directives"**, follow up with a second question:

```javascript
{
  "questions": [
    {
      "question": "Which completed SDs should we heal against?",
      "header": "SD filter",
      "multiSelect": false,
      "options": [
        {"label": "Today", "description": "SDs completed today"},
        {"label": "Last 5", "description": "Last 5 completed SDs"},
        {"label": "Date range", "description": "Specify a start and end date"},
        {"label": "Specific SD", "description": "Enter a specific SD key (e.g. SD-LEARN-FIX-001)"}
      ]
    }
  ]
}
```

- If "Date range" → ask for start date and end date using AskUserQuestion (free text)
- If "Specific SD" → ask for the SD key using AskUserQuestion (free text)
- Then proceed to the appropriate subcommand below

---

#### If `status`:

Show combined heal status:

```bash
node scripts/eva/heal-command.mjs status
```

Display the output showing latest vision and SD heal scores, plus any active corrective SDs.

---

#### If `vision`:

Run the vision heal loop. This scores the codebase against Vision + Architecture documents.

**Step 2a: Get scoring context**

```bash
node scripts/eva/heal-command.mjs vision score
```

This outputs a `===VISION_HEAL_SCORE_CONTEXT===` block containing vision and architecture dimensions.

**Step 2b: Score the codebase**

Read the scoring context. For each dimension listed, evaluate the CURRENT STATE of the codebase:
- Read relevant source files, configs, and tests
- Score each dimension 0-100 based on actual implementation state
- Note specific gaps where the codebase falls short

Produce a JSON response matching the `responseFormat` in the context.

**Step 2c: Persist the score**

```bash
node scripts/eva/heal-command.mjs vision persist '<YOUR_JSON>'
```

**Step 2d: Follow HEAL_STATUS signals — AUTO-CHAIN**

If output contains `HEAL_STATUS=NEEDS_CORRECTION`:
- **Immediately** read the `HEAL_NEXT_CMD` line and execute it to generate corrective SDs
- Do NOT pause or ask — continue the loop automatically (max 10 rounds)

If output contains `HEAL_STATUS=PASS`:
- Report success, loop is complete

---

#### If `sd` (with optional filters):

Score the codebase against completed Strategic Directives to verify their promises were delivered.

**IMPORTANT: This is a CONTINUOUS LOOP. Execute ALL steps automatically without pausing between them. Do NOT stop after any individual step — chain them together end-to-end.**

**Step 2a: Get SD scoring context**

Run the appropriate query command based on the filter:

```bash
node scripts/eva/heal-command.mjs sd --today
```
or `--sd-id SD-XXX-001` or `--last 5` or `--since YYYY-MM-DD` etc.

This outputs a `===SD_HEAL_SCORE_CONTEXT===` block listing each SD's promises. Capture the SD list.

**Step 2b: Verify each SD's promises against the codebase (PARALLEL)**

For EACH SD in the context, verify its promises against the actual codebase. Use the **Task tool with Explore agents** to parallelize — batch SDs into groups of 10-15 per agent:

For each SD, score these 5 dimensions (0-100):
1. **key_changes_delivered**: Were the stated key_changes actually implemented?
2. **success_criteria_met**: Are the success_criteria verifiable in tests/configs/behavior?
3. **success_metrics_achieved**: Do the success_metrics hold true?
4. **smoke_tests_pass**: Would the smoke_test_steps pass if executed?
5. **capabilities_present**: Are delivers_capabilities actually functional?

Produce a JSON response matching the `responseFormat` from the context.

**Step 2c: Persist scores (use --file to avoid ENAMETOOLONG)**

Write the complete scoring JSON to a temp file, then persist:

```bash
# Write JSON to file using the Write tool:
#   scripts/temp/heal-scores.json

# Then persist from file:
node scripts/eva/heal-command.mjs sd persist --file scripts/temp/heal-scores.json
```

**NEVER pass large JSON as an inline command argument** — it will fail with ENAMETOOLONG for more than ~5 SDs.

**Step 2d: Follow HEAL_STATUS signals — AUTO-CHAIN**

Parse the persist output for `HEAL_STATUS`:

If `HEAL_STATUS=NEEDS_CORRECTION`:
- **Immediately** run batch corrective generation (do NOT run individually per score):
  ```bash
  node scripts/eva/heal-command.mjs sd generate-all
  ```
- This batch-processes ALL failing scores in one command
- Continue to Step 3 (present results)

If `HEAL_STATUS=PASS`:
- All SDs verified successfully — proceed to Step 3

---

### Step 3: Present Results

After any subcommand, present a clear summary:

- For `status`: Show a table of latest scores with color indicators
- For `vision`/`sd` scoring: Show per-dimension scores with bar charts, highlight gaps
- For corrective generation: List created SDs with next-step instructions

---

## Command Ecosystem

| After this | Suggest |
|------------|---------|
| Corrective SDs created | `npm run sd:next` to work the corrective SD |
| All dimensions pass | No action needed |
| Want deeper analysis | `/heal sd --sd-id X` for specific SD |
| Vision check | `/heal vision` for portfolio-level scoring |

---

## Examples

```
User: /heal
Claude: [Runs status, shows latest vision + SD scores]

User: /heal vision
Claude: [Runs vision score context, evaluates codebase, persists, follows loop]

User: /heal sd --today
Claude: [Queries today's completed SDs, evaluates promises vs codebase, persists]

User: /heal sd --sd-id SD-LEARN-FIX-001
Claude: [Evaluates that specific SD's promises against the codebase]

User: /heal status
Claude: [Shows combined vision + SD heal scores and active correctives]
```
