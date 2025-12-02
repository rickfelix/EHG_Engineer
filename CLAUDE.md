# CLAUDE.md - LEO Protocol Context Router

**This file is AUTO-GENERATED from the database.**

## To Make Changes:
1. **For dynamic content** (agents, sub-agents, triggers): Update database tables directly
2. **For static sections** (guides, examples, instructions): Add/update in `leo_protocol_sections` table
3. **Regenerate file**: Run `node scripts/generate-claude-md-from-db.js`

**Any direct edits to this file will be lost on next regeneration!**

See documentation for table structure: `database/schema/007_leo_protocol_schema_fixed.sql`

## Session Prologue (Short)

1. **Follow LEAD→PLAN→EXEC** - Target ≥85% gate pass rate
2. **Use sub-agents** - Architect, QA, Reviewer - summarize outputs
3. **Database-first** - No markdown files as source of truth
4. **USE PROCESS SCRIPTS** - ⚠️ NEVER bypass add-prd-to-database.js, unified-handoff-system.js ⚠️
5. **Small PRs** - Target ≤100 lines, max 400 with justification
6. **Priority-first** - Use `npm run prio:top3` to justify work

*For copy-paste version: see `templates/session-prologue.md` (generate via `npm run session:prologue`)*

## Common Commands

- `bash scripts/leo-stack.sh restart` - Restart all LEO servers (Engineer on 3000, App on 8080, Agent Platform on 8000)
- `bash scripts/leo-stack.sh status` - Check server status
- `bash scripts/leo-stack.sh stop` - Stop all servers

## ⚠️ DYNAMICALLY GENERATED FROM DATABASE
**Last Generated**: 2025-12-02 7:29:22 PM
**Source**: Supabase Database (not files)
**Auto-Update**: Run `node scripts/generate-claude-md-from-db.js` anytime

## 🟢 CURRENT LEO PROTOCOL VERSION: 4.3.3

**CRITICAL**: This is the ACTIVE version from database
**ID**: leo-v4-3-3-ui-parity
**Status**: ACTIVE
**Title**: LEO Protocol v4.3.3 - UI Parity Governance

## CLAUDE.md Router (Context Loading)

### Loading Strategy
1. **ALWAYS**: Read CLAUDE_CORE.md first (15k)
2. **Phase Detection**: Load phase-specific file based on keywords
3. **On-Demand**: Load reference docs only when issues arise

### Phase Keywords → File
| Keywords | Load |
|----------|------|
| "approve", "LEAD", "directive", "simplicity" | CLAUDE_LEAD.md |
| "PRD", "PLAN", "validation", "schema" | CLAUDE_PLAN.md |
| "implement", "EXEC", "code", "test" | CLAUDE_EXEC.md |

### Issue → Reference Doc
| Issue | Load |
|-------|------|
| Database/schema/RLS errors | docs/reference/database-agent-patterns.md |
| Validation failures | docs/reference/validation-enforcement.md |
| Test/E2E issues | docs/reference/qa-director-guide.md |
| Context >70% | docs/reference/context-monitoring.md |

### Context Budget
- Router + Core: 18k (9% of 200k budget) ✅
- + Phase file: 43k avg (22%) ✅
- + Reference doc: 58k (29%) ✅

---

*Router generated from database: 2025-12-02*
*Protocol Version: 4.3.3*
*Part of LEO Protocol router architecture*
