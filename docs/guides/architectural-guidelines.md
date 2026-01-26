# EHG Engineer - Architectural Guidelines


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-13
- **Tags**: database, api, testing, migration

## Date: 2025-09-11

## Purpose
Establish clear architectural patterns and directory structure to prevent confusion, duplication, and wasted development effort.

## Directory Structure

### ✅ PRODUCTION Services Location
**`/src/services/`** - The canonical location for all service modules

All service modules used by the production server (`server.js`) should be located here:
- `database-loader.js` - Database operations and data loading
- `realtime-manager.js` - WebSocket/realtime functionality
- `refresh-api.js` - Data refresh endpoints
- `version-detector.js` - LEO Protocol version detection
- `realtime-dashboard.js` - Dashboard realtime features
- `status-validator.js` - Status normalization and validation
- `progress-calculator.js` - Progress calculation logic
- `handoff-validator.js` - Handoff validation logic

### ⚠️ DEPRECATED Location
**`/lib/dashboard/`** - Legacy location (DO NOT USE FOR NEW CODE)

This directory contains duplicate files and should be considered deprecated:
- Contains older versions of service modules
- Only kept for backward compatibility with some tests
- Will be removed in future refactoring

### Client-Side Code
**`/src/client/`** - React application and client-side code
- `/src/client/src/` - React source code
- `/src/client/dist/` - Built/compiled client code

### Scripts
**`/scripts/`** - Utility and automation scripts
- Database operations
- LEO Protocol management
- Testing utilities

### Database Schema
**`/database/schema/`** - SQL schema definitions
- Migration files
- Table definitions
- View definitions

## Import Guidelines

### ✅ CORRECT Import Patterns

```javascript
// From server.js or any production code
import DatabaseLoader from './src/services/database-loader.js';
import RealtimeManager from './src/services/realtime-manager.js';

// From test files
const DatabaseLoader = require('../../src/services/database-loader');
```

### ❌ INCORRECT Import Patterns

```javascript
// DO NOT use lib/dashboard for new code
import DatabaseLoader from './lib/dashboard/database-loader';

// DO NOT import from deprecated locations
const StatusValidator = require('../../lib/dashboard/status-validator');
```

## Service Module Duplication Status

### Identified Duplicates (as of 2025-09-11)

| Module | `/src/services/` | `/lib/dashboard/` | Action Required |
|--------|------------------|-------------------|-----------------|
| database-loader.js | ✅ ACTIVE | 🗑️ .deprecated | Already renamed |
| handoff-validator.js | ✅ ACTIVE | ⚠️ Duplicate | Remove duplicate |
| progress-calculator.js | ✅ ACTIVE | ⚠️ Duplicate | Remove duplicate |
| realtime-dashboard.js | ✅ ACTIVE | ⚠️ Duplicate | Remove duplicate |
| realtime-manager.js | ✅ ACTIVE | ⚠️ Duplicate | Remove duplicate |
| refresh-api.js | ✅ ACTIVE | ⚠️ Duplicate | Remove duplicate |
| status-validator.js | ✅ ACTIVE | ⚠️ Duplicate | Remove duplicate |
| version-detector.js | ✅ ACTIVE | ⚠️ Duplicate | Remove duplicate |

## Best Practices

### 1. Before Creating a New Service Module
- Check if it already exists in `/src/services/`
- Verify no duplicate exists in `/lib/dashboard/`
- Follow the established naming convention

### 2. When Modifying Service Modules
- ALWAYS edit the version in `/src/services/`
- NEVER edit files in `/lib/dashboard/`
- Run tests to ensure nothing breaks

### 3. Import Path Resolution
- Use relative paths from the importing file
- Maintain consistency across the codebase
- Update all imports when moving files

### 4. Testing After Changes
```bash
# Verify server starts correctly
PORT=3000 node server.js

# Check API endpoints
curl http://localhost:3000/api/state

# Run tests if available
npm test
```

## Migration Plan

### Phase 1: Immediate Actions ✅
- [x] Rename `/lib/dashboard/database-loader.js` to `.deprecated`
- [x] Update test imports to use `/src/services/`
- [x] Document the architecture decision

### Phase 2: Near-term Cleanup (TODO)
- [ ] Remove all duplicate files from `/lib/dashboard/`
- [ ] Update any remaining imports
- [ ] Add pre-commit hooks to prevent new duplicates

### Phase 3: Long-term Refactoring
- [ ] Consider moving `/lib/dashboard/` to `/lib/dashboard-legacy/`
- [ ] Consolidate all services under `/src/services/`
- [ ] Create automated tests for import validation

## Verification Commands

### Check for Duplicate Files
```bash
# Find duplicate service files (run from EHG_Engineer root)
for file in lib/dashboard/*.js; do
  basename_file=$(basename "$file")
  if [ -f "src/services/$basename_file" ]; then
    echo "Duplicate: $basename_file"
  fi
done
```

### Check Import Usage
```bash
# Find files importing from lib/dashboard
grep -r "lib/dashboard" --include="*.js" --include="*.mjs" | grep -v node_modules

# Find files importing from src/services
grep -r "src/services" --include="*.js" --include="*.mjs" | grep -v node_modules
```

## Lessons Learned

1. **Directory structure matters** - Clear, consistent structure prevents confusion
2. **Single source of truth** - One location for each service module
3. **Documentation is critical** - This guide prevents future duplication
4. **Regular audits help** - Periodic checks for duplicates save time

## References

- [Database Loader Consolidation](./DATABASE_LOADER_CONSOLIDATION.md)
- [LEO Protocol Documentation](./03_protocols_and_standards/)
- Main Server: `/server.js`

---

*This document should be updated whenever architectural changes are made to maintain accuracy.*