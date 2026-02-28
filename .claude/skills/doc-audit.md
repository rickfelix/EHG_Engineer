# /doc-audit - Documentation Health Audit

Comprehensive documentation quality scoring across 10 dimensions with automatic corrective SD generation. Mirrors the `/heal` iterative pattern: score → persist → generate → re-score until Grade A (≥93).

## Instructions

When the user invokes `/doc-audit` or mentions "doc audit", "documentation health", "doc quality check", "doc scoring":

### Step 1: Run the Audit

```bash
node scripts/eva/doc-health-audit.mjs score
```

This scans all documentation files and scores 10 dimensions:

| ID  | Dimension                 | Weight |
|-----|---------------------------|--------|
| D01 | Location Compliance       | 15%    |
| D02 | Metadata Completeness     | 12%    |
| D03 | Naming Convention         | 8%     |
| D04 | Cross-Reference Integrity | 12%    |
| D05 | Content Freshness         | 10%    |
| D06 | Index Coverage            | 10%    |
| D07 | Structural Completeness   | 10%    |
| D08 | Database-First Compliance | 8%     |
| D09 | Orphan Detection          | 8%     |
| D10 | Duplicate Detection       | 7%     |

### Step 2: Parse Signals and Auto-Proceed

After the score output, look for these signal lines:

- `DOC_AUDIT_STATUS=PASS` → All dimensions ≥93. Grade A achieved. Done.
- `DOC_AUDIT_STATUS=NEEDS_CORRECTION` → Dimensions below threshold. Continue.
- `DOC_AUDIT_SCORE_ID=<id>` → UUID of the persisted score record.
- `DOC_AUDIT_NEXT_CMD=<cmd>` → Machine-actionable next command.

### Step 3: Persist the Score

If `DOC_AUDIT_STATUS=NEEDS_CORRECTION`:

```bash
node scripts/eva/doc-health-audit.mjs score --json > /tmp/doc-audit-score.json
node scripts/eva/doc-health-audit.mjs persist --file /tmp/doc-audit-score.json
```

Or pipe inline JSON from the score output.

### Step 4: Generate Corrective SDs

```bash
node scripts/eva/doc-health-audit.mjs generate <score-id>
```

This creates corrective SDs for failing dimensions:
- **Escalation** (score <70): Critical priority, corrective SD
- **Gap Closure** (70-82): High priority, corrective SD
- **Minor** (83-92): Medium priority, enhancement SD

### Step 5: Iteration Loop

After corrective SDs are created and worked on:

1. Re-run `/doc-audit` to re-score
2. If still `NEEDS_CORRECTION`, repeat steps 3-4
3. If `PASS`, report "Grade A achieved"
4. **Safety limit: 10 rounds maximum**

## Subcommands

| Command | Purpose |
|---------|---------|
| `/doc-audit` | Full audit (score + display) |
| `/doc-audit status` | Show latest persisted score |
| `/doc-audit fix` | Generate corrective SDs from latest score |
| `/doc-audit history` | Show score trend (query DB) |

## Options

| Flag | Purpose |
|------|---------|
| `--json` | Machine-readable JSON output |
| `--verbose` | Show per-dimension gap details |

## Examples

```
User: /doc-audit
Claude: Running documentation health audit...
[Executes score, displays dimension table]
[If NEEDS_CORRECTION: auto-persist and generate corrective SDs]

User: /doc-audit status
Claude: [Queries latest score, shows compact summary]

User: /doc-audit fix
Claude: [Generates corrective SDs from latest failing score]
```

## Related

- `/heal` — Codebase-vs-intent scoring (similar pattern)
- `/audit` — SD gap detection
- `npm run doc:audit` — CLI shortcut
