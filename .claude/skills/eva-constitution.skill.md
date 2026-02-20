# /eva constitution - Protocol Constitution Management

Manage protocol constitution rules (CONST-001 through CONST-011) and constitutional amendments.

## Usage

```
/eva constitution view                             List all constitution rules
/eva constitution rule <code>                      Show full detail for a single rule
/eva constitution amend --code <code>              Propose a draft amendment
                        --text <proposed_text>
                        --rationale <reason>
                        [--proposed-by <name>]
/eva constitution history [--code <code>]          Show amendment history
```

## Instructions for Claude

### Step 0: Parse Arguments

From `$ARGUMENTS`, determine the subcommand:
- No args or `view` → list all rules
- `rule <code>` → show single rule detail
- `amend` → propose amendment
- `history` → show amendment history

Parse flags: `--code`, `--text`, `--rationale`, `--proposed-by`
Parse positional: first arg after `rule` is the rule code (e.g., `CONST-005`)

---

### If subcommand is `view` (default):

```bash
node scripts/eva/constitution-command.mjs view
```

Display the output directly. Shows all CONST rules with code, summary, and enforcement status.

---

### If subcommand is `rule`:

Extract the rule code from the positional argument (e.g., `CONST-001`).

```bash
node scripts/eva/constitution-command.mjs rule <code>
```

Display the full rule detail including text, rationale, enforcement mechanism, and history.

If no code provided:
```
Missing rule code. Usage: /eva constitution rule CONST-001
Available codes: CONST-001 through CONST-011
```

---

### If subcommand is `amend`:

Required flags: `--code`, `--text`, `--rationale`

If any required flag is missing, show:
```
Missing required flags. Usage:
  /eva constitution amend --code CONST-005 --text "New text" --rationale "Why this change"
```

```bash
node scripts/eva/constitution-command.mjs amend --code <code> --text "<text>" --rationale "<rationale>"
```

Include `--proposed-by <name>` if provided.

Display the output. Amendments create a draft that requires Chairman approval.

---

### If subcommand is `history`:

```bash
node scripts/eva/constitution-command.mjs history
```

If `--code` provided:
```bash
node scripts/eva/constitution-command.mjs history --code <code>
```

Display the amendment history.

---

### Error Handling

| Error | User message |
|-------|-------------|
| Rule not found | "Rule '<code>' not found. Run `/eva constitution view` to see available rules." |
| Missing flags for amend | Show usage with required flags |

---

## Related Commands

- `/eva mission` — Organizational mission management
- `/eva strategy` — Strategic theme management
- `/eva` — Show all EVA commands
