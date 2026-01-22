# LEO Operational Documentation

Documentation for LEO Protocol operations and self-improvement.

## Operational Overview

LEO Protocol includes systems for:
- **Autonomous workflow execution** - Auto-proceed through phases (v4.3.3+)
- Continuous self-improvement via `/learn`
- Dynamic context routing via CLAUDE.md
- Session continuity via handoffs

### Autonomous Workflow (v4.3.3+)

LEO Protocol now operates in **auto-proceed mode** by default:
- Phase transitions execute automatically without user confirmation
- Post-completion sequences run automatically (`/restart` → `/ship` → `/document` → `/learn`)
- Next SD is automatically shown after completion

**Stop Conditions**: Only stops for blocking errors, test failures (after 2 retries), or critical scenarios requiring human judgment.

## CLAUDE.md Router

The router system dynamically loads context based on:
- Current phase (LEAD/PLAN/EXEC)
- Keywords in user queries
- Issues encountered

### Loading Strategy

1. Always load: `CLAUDE_CORE.md`
2. Phase detection: Load phase-specific file
3. On-demand: Load reference docs for issues

### Context Budget

| Content | Size | % of 200k |
|---------|------|-----------|
| Router + Core | 18k | 9% |
| + Phase file | 43k avg | 22% |
| + Reference doc | 58k | 29% |

## Self-Improvement System

The `/learn` command captures:
- Patterns discovered during work
- Solutions to recurring problems
- Protocol improvements

These are stored in the database and can generate new SDs for implementation.

---

*Back to [LEO Hub](../README.md)*
