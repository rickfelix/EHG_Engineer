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
