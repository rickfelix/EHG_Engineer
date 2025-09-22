# ⚠️ DEPRECATED - DO NOT USE

## This directory is deprecated as of 2025-09-11

### Why is this deprecated?
- Duplicate service files caused confusion and wasted development effort
- The main server (`/server.js`) uses `/src/services/` for all service modules
- This directory contains outdated versions that are no longer maintained

### Where should I look instead?
**Use `/src/services/` for all service modules:**
- `database-loader.js`
- `handoff-validator.js`
- `progress-calculator.js`
- `realtime-dashboard.js`
- `realtime-manager.js`
- `refresh-api.js`
- `status-validator.js`
- `version-detector.js`

### Files in this directory
All `.js` files have been renamed to `.js.deprecated` to prevent accidental usage.

### Migration Status
- ✅ All production code uses `/src/services/`
- ✅ Test imports updated to use `/src/services/`
- ✅ Pre-commit hook added to prevent new duplicates
- ⚠️ Some scripts may still reference this directory (being updated)

### References
- [Architectural Guidelines](/docs/ARCHITECTURAL_GUIDELINES.md)
- [Database Loader Consolidation](/docs/DATABASE_LOADER_CONSOLIDATION.md)

### DO NOT:
- ❌ Create new files in this directory
- ❌ Import from this directory in new code
- ❌ Edit files in this directory

### DO:
- ✅ Use `/src/services/` for all service modules
- ✅ Follow the architectural guidelines
- ✅ Report any remaining references to this directory

---
*This directory will be removed in a future cleanup phase.*