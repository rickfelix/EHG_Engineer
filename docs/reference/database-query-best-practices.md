---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Database Query Best Practices


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, protocol, leo, sd

**Generated**: 2025-10-28T21:47:56.040Z
**Source**: Database (leo_protocol_sections)
**Context Tier**: REFERENCE

---

**Database Query Efficiency**: Smart querying saves 5K-10K tokens per SD.

**Quick Rules:**
1. **Select specific columns** only (not `SELECT *`)
2. **Limit results** with `.limit(5)` for summaries
3. **Use Read tool** with offset/limit for large files
4. **Summarize results**, don't dump full objects
5. **Batch related reads** for parallel execution

**Expected Impact**: 90-98% token reduction per query

**Examples & Patterns**: See `docs/reference/database-best-practices.md`

---

*This is reference documentation, load on-demand only*
*Generated from: scripts/generate-claude-md-from-db-v3.js*
