# Temporary Files Archive

This directory contains temporary files moved from the project root.

## Purpose

Temporary files are archived here for:
- **Historical reference**: May contain useful context
- **Cleanup staging**: Review before permanent deletion
- **Audit trail**: Track what was temporary during development

## File Naming

Original filenames preserved with `temp-` prefix:
```
temp-{description}.md
```

## Review Process

Periodically review files in this directory:

1. **Still relevant?** → Move to appropriate docs location
2. **Obsolete?** → Delete permanently
3. **Uncertain?** → Add review date to filename and revisit later

## Retention Policy

- Review every 3 months
- Delete files older than 6 months unless marked for retention
- Document deletion decisions in cleanup commits

## Files in This Directory

Temporary files typically include:
- Session notes and scratchpad files
- Sub-agent assessment drafts
- Planning artifacts superseded by PRDs
- API access clarifications resolved
- Scope update notes integrated into SDs
- [Temp Api Access And Clarifications](temp-api-access-and-clarifications.md)
- [Temp Backlog Exception Sd Video Variant 001](temp-backlog-exception-sd-video-variant-001.md)
- [Temp Exec Remediation Plan Sd Board 002](temp-exec-remediation-plan-sd-board-002.md)
- [Temp Plan Verification Verdict Sd Board 002](temp-plan-verification-verdict-sd-board-002.md)
- [Temp Sd Scope Update Manual](temp-sd-scope-update-manual.md)
- [Temp Sub Agent Aggregated Summary](temp-sub-agent-aggregated-summary.md)
- [Temp Sub Agent Database Architect Assessment](temp-sub-agent-database-architect-assessment.md)
- [Temp Sub Agent Design Assessment](temp-sub-agent-design-assessment.md)
- [Temp Sub Agent Systems Analyst Assessment](temp-sub-agent-systems-analyst-assessment.md)
- [Temp Subagent Issues To Fix](temp-subagent-issues-to-fix.md)

## Cleanup Commands

```bash
# List files older than 6 months
find docs/archive/temp/ -name "temp-*.md" -mtime +180

# Delete old temp files (review first!)
find docs/archive/temp/ -name "temp-*.md" -mtime +180 -delete
```

## Related Directories

- `/docs/summaries/` - Finalized status and completion docs
- `/docs/archive/` - Long-term archival storage
- `/docs/analysis/` - Formal analysis documents

---

*Created during documentation reorganization - 2025-10-19*
