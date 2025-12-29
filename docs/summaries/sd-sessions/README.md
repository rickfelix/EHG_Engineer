# SD Session Status Files

This directory contains session status and progress tracking for Strategic Directive implementations.

## Purpose

Session status files track real-time progress during SD implementation sessions, providing:
- Current phase and status
- Completed tasks
- Blockers and issues
- Next steps

## File Naming Convention

```
SD-{ID}_SESSION_STATUS.md
```

**Example**: `SD-DATA-INTEGRITY-001_SESSION_STATUS.md`

## When to Create

Create a session status file when:
- Starting multi-day SD implementation
- Need to track progress across multiple sessions
- Coordinating multiple agents/phases
- Complex implementation requiring checkpoints

## File Structure

```markdown
# SD-{ID} Session Status

**Last Updated**: YYYY-MM-DD HH:MM
**Current Phase**: [LEAD/PLAN/EXEC]
**Status**: [In Progress/Blocked/Review]

## Current Session
- Session started: [timestamp]
- Current task: [description]
- Progress: [percentage or description]

## Completed Tasks
- [x] Task 1
- [x] Task 2

## In Progress
- [ ] Task 3 (50% complete)

## Blockers
- [Issue description and impact]

## Next Steps
1. [Next action]
2. [Following action]
```

## Status Values

- **In Progress**: Active development
- **Blocked**: Waiting on dependency or decision
- **Review**: Ready for validation
- **Complete**: Session finished (move to `/implementations/`)

## Lifecycle

1. **Create**: Start of SD implementation session
2. **Update**: Throughout session as progress is made
3. **Complete**: Move to `/docs/summaries/implementations/` when done
4. **Archive**: Old sessions to `/docs/archive/`

## Related Files

- Final completion summaries → `/docs/summaries/implementations/`
- SD implementation status → `/docs/summaries/implementations/SD-{ID}-IMPLEMENTATION-STATUS.md`

---

*Part of LEO Protocol v4.3.3 - Progress Tracking*
*Updated: 2025-12-29*
