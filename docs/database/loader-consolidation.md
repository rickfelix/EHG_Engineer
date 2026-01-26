# Database Loader Consolidation - Architecture Decision Record


## Metadata
- **Category**: Database
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, unit

## Date: 2025-09-11

## Problem
During implementation of the backlog feature, we discovered duplicate `database-loader.js` files:
1. `/lib/dashboard/database-loader.js` (936 lines)
2. `/src/services/database-loader.js` (1330 lines) - **ACTIVE**

This duplication caused confusion and wasted development effort when changes were made to the wrong file.

## Discovery
- While adding backlog data loading functionality
- Edited `/lib/dashboard/database-loader.js` initially
- Changes didn't take effect because `server.js` imports from `/src/services/database-loader.js`
- Lost time debugging why changes weren't working

## Analysis

### Files using each version:
- **`/src/services/database-loader.js`** (PRODUCTION):
  - `server.js` (main application server)
  - `scripts/cleanup-duplicate-sds.js`
  - `test-dbloader-direct.js`

- **`/lib/dashboard/database-loader.js`** (TEST ONLY):
  - `tests/unit/progress-calculation.test.js`
  - `tests/integration/database-operations.test.js`

### Key Differences:
- `/src/services/` version is more complete (400+ more lines)
- Contains additional SDIP/DirectiveLab methods
- Is the active version used by production server

## Decision
**Use `/src/services/database-loader.js` as the single source of truth**

## Actions Taken
1. ✅ Added backlog loading functionality to `/src/services/database-loader.js`
2. ✅ Synced critical changes to `/lib/dashboard/database-loader.js` for compatibility
3. ✅ Updated test imports to use `/src/services/` version
4. ✅ Documented this decision for future reference

## Recommendations
1. **DELETE** `/lib/dashboard/database-loader.js` after verifying tests pass
2. **RENAME** `/lib/dashboard/` to `/lib/dashboard-deprecated/` to prevent confusion
3. **STANDARDIZE** on `/src/services/` for all service modules
4. Consider adding a pre-commit hook to detect duplicate service files

## Lessons Learned
- Multiple database-loader files create confusion and maintenance burden
- Always verify which file is being imported by the main application
- Module duplication can lead to significant debugging time waste
- Clear directory structure and naming conventions are critical

## Impact
- Fixed: Backlog items now display correctly on Strategic Directives
- Prevented: Future confusion about which database-loader to edit
- Improved: Development efficiency by consolidating to single file

## Verification Commands
```bash
# Check which database-loader is used
grep -r "database-loader" --include="*.js" | grep -E "require|import"

# Verify backlog data is loading
curl -s http://localhost:3000/api/state | jq '.strategicDirectives[0] | {h_count, m_count, l_count}'
```

## Related Files Modified
- `/tests/unit/progress-calculation.test.js` - Updated import
- `/tests/integration/database-operations.test.js` - Updated import
- `/src/services/database-loader.js` - Added backlog functionality

## Future Work
- [ ] Remove `/lib/dashboard/database-loader.js` after full testing
- [ ] Audit other potential duplicate service files
- [ ] Create architectural guidelines document