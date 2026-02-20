# /eva - Unified EVA Governance CLI

Entry point for all EVA governance commands. Routes `/eva <subcommand>` to the appropriate handler.

## Usage

```
/eva                          Show available commands
/eva mission [subcommand]     Organizational mission management
/eva constitution [subcommand] Protocol constitution rules
/eva strategy [subcommand]    Strategic theme management
/eva okr [subcommand]         Monthly OKR lifecycle
/eva vision [subcommand]      Vision document management
/eva archplan [subcommand]    Architecture plan management
/eva score [options]          Vision alignment scoring
/eva research [question]      Tiered research queries
/eva dashboard                Aggregated EVA metrics
```

## Instructions for Claude

### Step 0: Parse Subcommand

From `$ARGUMENTS`, extract the first word as the subcommand. Everything after it becomes the subcommand's arguments.

**Examples:**
- `/eva` → subcommand = none (show help)
- `/eva mission view` → subcommand = `mission`, args = `view`
- `/eva score --sd-id SD-XXX` → subcommand = `score`, args = `--sd-id SD-XXX`
- `/eva dashboard` → subcommand = `dashboard`, args = none

---

### If no subcommand (or "help"):

Display this menu:

```
EVA Governance CLI
==================

  /eva mission        Manage organizational mission statements
                      Subcommands: view, history, propose

  /eva constitution   Manage protocol constitution rules (CONST-001..011)
                      Subcommands: view, rule <code>, amend, history

  /eva strategy       Manage annual strategic themes
                      Subcommands: view, detail <id>, derive, create

  /eva okr            Monthly OKR lifecycle management
                      Subcommands: generate, review, history, link, archive

  /eva vision         Vision document management
                      Subcommands: create, addendum, list

  /eva archplan       Architecture plan management
                      Subcommands: create, version, list

  /eva score          Score SD/scope against vision alignment
                      Options: --sd-id <KEY>, --scope "<text>", --dry-run

  /eva research       Tiered research queries
                      Options: <question> [--tier L1|L2|L3]

  /eva dashboard      Aggregated EVA governance metrics
```

---

### If subcommand is recognized:

Use the Skill tool to invoke the corresponding individual skill:

| Subcommand | Skill to invoke | Pass remaining args |
|------------|----------------|---------------------|
| `mission` | `eva-mission` | Yes |
| `constitution` | `eva-constitution` | Yes |
| `strategy` | `eva-strategy` | Yes |
| `okr` | `eva-okr` | Yes |
| `vision` | `eva-vision` | Yes |
| `archplan` | `eva-archplan` | Yes |
| `score` | `eva-score` | Yes |
| `research` | `eva-research` | Yes |
| `dashboard` | `eva-dashboard` | Yes |

**Delegation example:**
If user runs `/eva mission view`, invoke the `eva-mission` skill with args `view`.

---

### If subcommand is "dashboard":

Run the dashboard command directly:

```bash
node scripts/eva/dashboard-command.mjs
```

Display the output directly to the user.

---

### If subcommand is not recognized:

```
Unknown subcommand: <input>

Run /eva to see available commands.
```

---

## Related Commands

- `/leo next` — View SD queue
- `/leo audit` — Audit discovery report
- `/leo analytics` — Self-improvement analytics
