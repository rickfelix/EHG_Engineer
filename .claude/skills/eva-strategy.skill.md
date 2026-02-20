# /eva strategy - Strategic Theme Management

Manage annual strategic themes derived from vision documents.

## Usage

```
/eva strategy view                             List all strategic themes
/eva strategy detail <id-or-title>             Show full detail for a single theme
/eva strategy derive [--year <year>]           Auto-derive themes from active vision docs
                     [--vision-key <key>]
/eva strategy create --title <title>           Manually create a strategic theme
                     --year <year>
                     --description <desc>
                     [--vision-key <key>]
```

## Instructions for Claude

### Step 0: Parse Arguments

From `$ARGUMENTS`, determine the subcommand:
- No args or `view` → list all themes
- `detail <id>` → show single theme detail
- `derive` → auto-derive themes from vision
- `create` → manually create a theme

Parse flags: `--year`, `--vision-key`, `--title`, `--description`
Parse positional: first arg after `detail` is the theme ID or title

---

### If subcommand is `view` (default):

```bash
node scripts/eva/strategy-command.mjs view
```

Display the output directly. Shows current year themes with title, status, and vision linkage.

---

### If subcommand is `detail`:

Extract the theme ID from the positional argument (e.g., `THEME-2026-001`).

```bash
node scripts/eva/strategy-command.mjs detail <id-or-title>
```

Display the full theme detail including description, linked vision key, and derived OKRs.

If no ID provided:
```
Missing theme ID. Usage: /eva strategy detail THEME-2026-001
Run /eva strategy view to see available themes.
```

---

### If subcommand is `derive`:

```bash
node scripts/eva/strategy-command.mjs derive
```

Include optional flags if provided:
- `--year <year>`
- `--vision-key <key>`

Display the derived themes. This uses LLM analysis of vision documents to propose strategic themes.

---

### If subcommand is `create`:

Required flags: `--title`, `--year`, `--description`

If any required flag is missing, show:
```
Missing required flags. Usage:
  /eva strategy create --title "AI-First Operations" --year 2026 --description "Leverage AI across all operational areas"
```

```bash
node scripts/eva/strategy-command.mjs create --title "<title>" --year <year> --description "<description>"
```

Include `--vision-key <key>` if provided.

Display the created theme confirmation.

---

### Error Handling

| Error | User message |
|-------|-------------|
| Theme not found | "Theme '<id>' not found. Run `/eva strategy view` to see available themes." |
| No vision docs for derive | "No active vision documents found. Create one first with `/eva vision create`." |
| Missing flags for create | Show usage with required flags |

---

## Related Commands

- `/eva vision` — Vision document management (input for derive)
- `/eva okr` — OKR management (output from themes)
- `/eva` — Show all EVA commands
