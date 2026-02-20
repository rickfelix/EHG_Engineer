# /eva okr - Monthly OKR Lifecycle Management

Manage the monthly OKR lifecycle: generation, review, history, vision linkage, and archival.

## Usage

```
/eva okr generate  [--dry-run]                   Trigger monthly OKR generation
/eva okr review                                  Show current period scorecard
/eva okr history   [--limit <n>]                 Show month-over-month trends
/eva okr link      --kr <kr-code> --dim <code>   Link KR to vision dimension
/eva okr archive   [--dry-run]                   Archive stale/expired OKRs
```

## Instructions for Claude

### Step 0: Parse Arguments

From `$ARGUMENTS`, determine the subcommand:
- No args or `review` → show current scorecard
- `generate` → trigger monthly generation
- `history` → show trends
- `link` → link KR to vision dimension
- `archive` → archive stale OKRs

Parse flags: `--dry-run`, `--limit`, `--kr`, `--dim`

---

### If subcommand is `review` (default):

```bash
node scripts/eva/okr-command.mjs review
```

Display the current period OKR scorecard with objectives, key results, and progress percentages.

---

### If subcommand is `generate`:

```bash
node scripts/eva/okr-command.mjs generate
```

If `--dry-run` provided:
```bash
node scripts/eva/okr-command.mjs generate --dry-run
```

Display the generated OKRs. Dry-run mode previews without writing to database.

---

### If subcommand is `history`:

```bash
node scripts/eva/okr-command.mjs history
```

If `--limit` provided:
```bash
node scripts/eva/okr-command.mjs history --limit <n>
```

Display month-over-month OKR trends.

---

### If subcommand is `link`:

Required flags: `--kr`, `--dim`

If any required flag is missing, show:
```
Missing required flags. Usage:
  /eva okr link --kr KR-2026-03-01 --dim A05
```

```bash
node scripts/eva/okr-command.mjs link --kr <kr-code> --dim <dim-code>
```

Display the linkage confirmation.

---

### If subcommand is `archive`:

```bash
node scripts/eva/okr-command.mjs archive
```

If `--dry-run` provided:
```bash
node scripts/eva/okr-command.mjs archive --dry-run
```

Display the archived OKRs or preview.

---

### Error Handling

| Error | User message |
|-------|-------------|
| No OKRs for current period | "No OKRs found for current period. Run `/eva okr generate` to create them." |
| KR not found for link | "Key Result '<code>' not found. Run `/eva okr review` to see current KRs." |
| Dimension not found for link | "Vision dimension '<code>' not found. Run `/eva vision list` to check dimensions." |

---

## Related Commands

- `/eva strategy` — Strategic themes (OKRs derive from themes)
- `/eva vision` — Vision documents (OKRs link to dimensions)
- `/eva` — Show all EVA commands
