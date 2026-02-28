---
category: protocol
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [protocol, auto-generated]
---
# LEO Protocol Status Reference Card


## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, protocol, leo

## Quick Reference for Valid Database Status Values

### 🎯 Strategic Directives (SD)
| Status | When to Use | Agent |
|--------|-------------|-------|
| **draft** | Initial creation | LEAD |
| **active** ✅ | SD approved and being worked on | LEAD |
| **archived** ✅ | SD completed successfully | LEAD |
| on_hold | Work temporarily paused | LEAD |
| cancelled | Work stopped permanently | LEAD |

**✅ = PREFERRED**

### 📋 Product Requirements Documents (PRD)
| Status | When to Use | Agent |
|--------|-------------|-------|
| **draft** | Initial creation | PLAN |
| **planning** ✅ | PLAN creating PRD | PLAN |
| **ready** | Ready for implementation | PLAN |
| **in_progress** ✅ | EXEC implementing | EXEC |
| **testing** ✅ | PLAN verifying work | PLAN |
| **approved** ✅ | Work accepted by LEAD | LEAD |
| rejected | Failed verification | PLAN |
| on_hold | Work paused | Any |
| cancelled | Work stopped | Any |

**✅ = PREFERRED**

### 🔄 Execution Sequences (EES)
| Status | When to Use | Agent |
|--------|-------------|-------|
| **pending** ✅ | Not yet started | EXEC |
| **in_progress** ✅ | Currently working | EXEC |
| **completed** ✅ | Successfully done | EXEC |
| failed | Error occurred | EXEC |
| blocked | Waiting on dependency | EXEC |
| skipped | Not needed | EXEC |
| cancelled | Stopped | EXEC |

**✅ = PREFERRED**

## Status Flow by Agent

### LEAD Agent Flow
```
SD: draft → active → archived
PRD: (observes) → approved
```

### PLAN Agent Flow
```
PRD: draft → planning → ready → (waits) → testing → approved/rejected
```

### EXEC Agent Flow
```
PRD: (receives ready) → in_progress → testing
EES: pending → in_progress → completed/failed
```

## Common Mistakes to Avoid

❌ **DON'T** use these invalid combinations:
- SD with status "complete" (use "archived")
- PRD with status "complete" (use "approved")
- EES with status "approved" (use "completed")

❌ **DON'T** skip status transitions:
- PRD cannot go from "planning" to "approved"
- SD cannot go from "draft" to "archived"

✅ **DO** follow the proper flow:
1. LEAD creates SD as "draft" then "active"
2. PLAN creates PRD as "planning" then "ready"
3. EXEC changes PRD to "in_progress" then "testing"
4. PLAN changes PRD to "approved" or "rejected"
5. LEAD changes SD to "archived" when done

## Database Compatibility Note

All status values listed above have been **verified against the actual database constraints**. While the database may accept additional values (like "complete", "completed", "in_progress" for SDs), the values marked with ✅ are the recommended ones for consistency across the LEO Protocol.

## Quick Validation Test

If unsure whether a status is valid, agents can test with:
```sql
SELECT 1 FROM <table_name> WHERE status = '<proposed_status>' LIMIT 1;
```

If no error occurs, the status is valid for that table.