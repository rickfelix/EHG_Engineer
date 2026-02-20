# /eva mission - Organizational Mission Management

Manage organizational mission statements in the missions table.

## Usage

```
/eva mission view    [--venture <name>]           Show active mission (default: EHG)
/eva mission history [--venture <name>]           List all mission versions
/eva mission propose --text <mission_text>        Create a draft mission revision
                     [--venture <name>]
                     [--proposed-by <name>]
```

## Instructions for Claude

### Step 0: Parse Arguments

From `$ARGUMENTS`, determine the subcommand:
- No args or `view` → view active mission
- `history` → list mission versions
- `propose` → create draft revision

Parse flags: `--venture`, `--text`, `--proposed-by`

---

### If subcommand is `view` (default):

```bash
node scripts/eva/mission-command.mjs view
```

If `--venture` provided:
```bash
node scripts/eva/mission-command.mjs view --venture <name>
```

Display the output directly.

---

### If subcommand is `history`:

```bash
node scripts/eva/mission-command.mjs history
```

If `--venture` provided:
```bash
node scripts/eva/mission-command.mjs history --venture <name>
```

Display the output directly.

---

### If subcommand is `propose`:

If `--text` not provided, ask:
```
"What is the proposed mission statement text?"
```

```bash
node scripts/eva/mission-command.mjs propose --text "<mission_text>"
```

Include optional flags if provided:
- `--venture <name>`
- `--proposed-by <name>`

Display the output. The propose command creates a draft revision that requires Chairman approval.

---

### Error Handling

| Error | User message |
|-------|-------------|
| No active mission found | "No active mission found. Use `/eva mission propose --text '...'` to create one." |
| Missing --text for propose | "Missing required flag: --text. Usage: `/eva mission propose --text 'New mission statement'`" |

---

## Related Commands

- `/eva constitution` — Protocol constitution rules
- `/eva strategy` — Strategic theme management
- `/eva` — Show all EVA commands
