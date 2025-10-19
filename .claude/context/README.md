# Claude Context Files

This directory contains specialized context documentation for Claude Code AI assistant when working with specific aspects of the EHG_Engineer codebase.

## Purpose

These files provide domain-specific context to Claude Code for specialized tasks:
- **Sub-agent guidance**: Instructions for specific sub-agents (LEAD, EXEC, etc.)
- **Feature-specific context**: Detailed information about particular features or systems
- **Best practices**: Domain-specific development patterns and standards

## Files in this Directory

### Sub-Agent Context
- `CLAUDE-LEAD.md` - LEAD agent responsibilities and strategic validation
- `CLAUDE-EXEC.md` - EXEC agent implementation requirements
- `CLAUDE-PLAN.md` - PLAN agent planning and validation processes

### Feature-Specific Context
- `CLAUDE-API.md` - API development and patterns
- `CLAUDE-DATABASE.md` - Database architecture and operations
- `CLAUDE-TESTING.md` - Testing strategies and requirements
- `CLAUDE-DESIGN.md` - UI/UX design patterns and validation
- `CLAUDE-SECURITY.md` - Security best practices and patterns
- `CLAUDE-PERFORMANCE.md` - Performance optimization guidelines
- `CLAUDE-DEPENDENCY.md` - Dependency management
- `CLAUDE-DEBUGGING.md` - Debugging strategies and tools
- `CLAUDE-COST.md` - Cost optimization guidance
- `CLAUDE-DOCUMENTATION.md` - Documentation standards

### General Context
- `CLAUDE-LEO.md` - LEO Protocol overview and workflow

## Usage

These files are referenced by:
1. **Root CLAUDE*.md files** - Generated from database, provide high-level routing
2. **Sub-agents** - Load specific context based on their role
3. **Claude Code** - Dynamically loaded based on task requirements

## Relationship to Root CLAUDE Files

| Location | Purpose | Generated |
|----------|---------|-----------|
| `/CLAUDE.md` | Router to appropriate context | Yes (from DB) |
| `/CLAUDE_CORE.md` | Core workflow and architecture | Yes (from DB) |
| `/CLAUDE_LEAD.md` | LEAD phase operations | Yes (from DB) |
| `/CLAUDE_PLAN.md` | PLAN phase operations | Yes (from DB) |
| `/CLAUDE_EXEC.md` | EXEC phase operations | Yes (from DB) |
| `/.claude/context/CLAUDE-*.md` | Specialized domain context | No (manual) |

## Maintenance

- **Root CLAUDE*.md**: Auto-generated via `node scripts/generate-claude-md-from-db.js`
- **Context files**: Manually maintained as domain knowledge evolves
- **Review**: Update context files when major architectural changes occur

---

*Part of LEO Protocol v4.2.0 - Context Organization*
