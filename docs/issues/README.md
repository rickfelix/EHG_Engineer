# Issues Documentation

This directory contains documented issues, bugs, and known problems.

## Purpose

Issue documentation tracks:
- **Bugs**: Defects and incorrect behavior
- **Technical debt**: Code quality issues
- **Blockers**: Issues preventing progress
- **Workarounds**: Temporary solutions

## File Naming Convention

```
{SEVERITY}_{COMPONENT}_{DESCRIPTION}.md
```

**Examples**:
- `CRITICAL_DATABASE_RLS_POLICY_BYPASS.md`
- `HIGH_API_RATE_LIMITING_ISSUE.md`
- `MEDIUM_UI_LAYOUT_SHIFT.md`

## Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| **CRITICAL** | System down, data loss | Immediate |
| **HIGH** | Major feature broken | < 24 hours |
| **MEDIUM** | Feature degraded | < 1 week |
| **LOW** | Minor issue, cosmetic | Backlog |

## Issue Document Structure

```markdown
# [Severity] - [Component] - [Issue Title]

**Created**: YYYY-MM-DD
**Status**: [Open/In Progress/Resolved]
**Severity**: [Critical/High/Medium/Low]
**Component**: [Affected system/feature]
**Related SD/PRD**: [If applicable]

## Description
[Clear description of the issue]

## Steps to Reproduce
1. Step 1
2. Step 2
3. Expected vs Actual behavior

## Impact
- Users affected: [count/percentage]
- Features affected: [list]
- Business impact: [description]

## Root Cause
[If identified, describe root cause]

## Workaround
[Temporary solution if available]

## Resolution
[Permanent fix description]

## Prevention
[How to prevent in future]
```

## Issue Lifecycle

1. **Open**: Issue reported and documented
2. **Triaged**: Severity assigned, owner identified
3. **In Progress**: Fix being developed
4. **Resolved**: Fix implemented and tested
5. **Closed**: Verified in production

## Integration with SD System

Critical and high severity issues may trigger:
- Emergency Strategic Directive
- Hotfix implementation
- Post-mortem retrospective

## Tracking

Issues can also be tracked in:
- **GitHub Issues**: For public visibility
- **Database**: `issues` table (if exists)
- **This directory**: For detailed documentation

## Related Documentation

- `/docs/analysis/` - Root cause analysis documents
- `/docs/retrospectives/` - Post-mortem reviews
- `/docs/troubleshooting/` - Common problems and solutions

## Quick Issue Template

```bash
# Create new issue document
cat > docs/issues/SEVERITY_COMPONENT_ISSUE.md << 'EOF'
# [Severity] - [Component] - [Issue Title]

**Created**: $(date +%Y-%m-%d)
**Status**: Open
**Severity**:
**Component**:

## Description


## Impact


## Workaround

EOF
```

---

*Part of LEO Protocol v4.3.3 - Issue Management*
*Updated: 2025-12-29*
