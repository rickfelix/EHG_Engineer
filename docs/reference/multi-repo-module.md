---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Multi-Repository Manager Module



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
  - [Architecture Context](#architecture-context)
  - [Problem Solved](#problem-solved)
- [Installation & Usage](#installation-usage)
- [API Reference](#api-reference)
  - [Repository Discovery](#repository-discovery)
  - [Git Status Operations](#git-status-operations)
  - [SD-to-Repo Mapping](#sd-to-repo-mapping)
  - [Branch Operations](#branch-operations)
  - [Display Helpers](#display-helpers)
- [Configuration](#configuration)
  - [KNOWN_REPOS](#known_repos)
  - [COMPONENT_REPO_MAP](#component_repo_map)
- [Usage Examples](#usage-examples)
  - [Example 1: Pre-Ship Check (Used by `/ship`)](#example-1-pre-ship-check-used-by-ship)
  - [Example 2: SD Completion Validation](#example-2-sd-completion-validation)
  - [Example 3: Display SD Queue with Repo Scope](#example-3-display-sd-queue-with-repo-scope)
  - [Example 4: Find Related Branches](#example-4-find-related-branches)
- [Integration with Commands](#integration-with-commands)
  - [Current Integrations](#current-integrations)
  - [Planned Integrations](#planned-integrations)
- [Migration Guide](#migration-guide)
  - [For Existing Scripts Using Duplicated Logic](#for-existing-scripts-using-duplicated-logic)
  - [Scripts to Migrate](#scripts-to-migrate)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
  - ["No repositories found"](#no-repositories-found)
  - ["Branch might not have upstream" warnings](#branch-might-not-have-upstream-warnings)
  - [SD mapped to wrong repos](#sd-mapped-to-wrong-repos)
- [Version History](#version-history)

## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-18
- **Tags**: database, api, testing, migration

**Module**: `lib/multi-repo/index.js`
**Version**: 1.0.0
**Purpose**: Centralized management of multi-repository operations across the EHG ecosystem

## Overview

The EHG project spans multiple repositories (frontend + backend). This module provides a single source of truth for all multi-repo operations, eliminating duplicated logic and ensuring consistent behavior across commands.

### Architecture Context

```
EHG Ecosystem (Multi-Repository)
├── EHG (Frontend)
│   ├── React/Vite application
│   ├── UI components, pages, routes
│   └── Repository: rickfelix/ehg
└── EHG_Engineer (Backend)
    ├── CLI tools, scripts, lib modules
    ├── Database migrations
    └── Repository: rickfelix/EHG_Engineer
```

### Problem Solved

**Before**: Repo discovery logic was duplicated in:
- `scripts/branch-cleanup-v2.js`
- `scripts/modules/shipping/MultiRepoCoordinator.js`
- `scripts/multi-repo-status.js`

**After**: Single module imported by all commands needing multi-repo awareness.

---

## Installation & Usage

```javascript
import {
  discoverRepos,
  checkUncommittedChanges,
  getAffectedRepos,
  formatStatusForDisplay
} from '../lib/multi-repo/index.js';

// Check if any repo has uncommitted changes
const status = checkUncommittedChanges(true);
console.log(formatStatusForDisplay(status));

// Determine which repos are affected by an SD
const sd = { sd_type: 'feature', title: 'Add quality UI' };
const repos = getAffectedRepos(sd);
console.log('Affected repos:', repos); // ['ehg', 'EHG_Engineer']
```

---

## API Reference

### Repository Discovery

#### `discoverRepos()`

Discovers all git repositories in the EHG base directory.

**Returns**: `Object` - Map of repo name to repo info

```javascript
const repos = discoverRepos();
// {
//   ehg: {
//     name: 'ehg',
//     displayName: 'EHG (Frontend)',
//     purpose: 'React/Vite frontend application',
//     path: 'C:\\Users\\...\\ehg',
//     github: 'rickfelix/ehg',
//     priority: 2,
//     contains: ['UI components', 'pages', 'routes', 'React hooks']
//   },
//   EHG_Engineer: { ... }
// }
```

#### `getPrimaryRepos()`

Gets only the primary EHG repositories (ehg + EHG_Engineer).

**Returns**: `Object` - Map of primary repos

```javascript
const primary = getPrimaryRepos();
// Returns subset with only 'ehg' and 'EHG_Engineer'
```

---

### Git Status Operations

#### `getRepoGitStatus(repoPath)`

Gets git status for a single repository.

**Parameters:**
- `repoPath` (string) - Absolute path to repository

**Returns**: `Object` - Status information

```javascript
const status = getRepoGitStatus('C:\\Users\\...\\ehg');
// {
//   branch: 'main',
//   changes: [
//     { status: 'M', file: 'src/App.tsx', changeType: 'modified' },
//     { status: '?', file: 'temp.js', changeType: 'untracked' }
//   ],
//   unpushedCount: 2,
//   hasUncommitted: true,
//   hasUnpushed: true,
//   isClean: false
// }
```

#### `getAllReposStatus(primaryOnly = true)`

Gets git status for all discovered repositories.

**Parameters:**
- `primaryOnly` (boolean) - If true, only check ehg + EHG_Engineer

**Returns**: `Array` - Status for each repo, sorted by priority

```javascript
const statuses = getAllReposStatus(true);
// [
//   {
//     name: 'EHG_Engineer',
//     displayName: 'EHG_Engineer (Backend)',
//     path: '...',
//     priority: 1,
//     status: { branch: 'main', changes: [], ... }
//   },
//   {
//     name: 'ehg',
//     displayName: 'EHG (Frontend)',
//     path: '...',
//     priority: 2,
//     status: { ... }
//   }
// ]
```

#### `checkUncommittedChanges(primaryOnly = true)`

Summary check for uncommitted changes across all repos.

**Parameters:**
- `primaryOnly` (boolean) - If true, only check primary repos

**Returns**: `Object` - Summary object

```javascript
const result = checkUncommittedChanges(true);
// {
//   hasChanges: true,
//   totalRepos: 2,
//   reposWithChanges: [{ name: 'ehg', displayName: '...', ... }],
//   cleanRepos: [{ name: 'EHG_Engineer', ... }],
//   summary: [
//     {
//       name: 'ehg',
//       displayName: 'EHG (Frontend)',
//       path: '...',
//       branch: 'main',
//       uncommittedCount: 3,
//       unpushedCount: 0,
//       changes: [...]
//     }
//   ]
// }
```

---

### SD-to-Repo Mapping

#### `getAffectedRepos(sd)`

Determines which repositories are likely affected by a Strategic Directive based on its type, title, and description.

**Parameters:**
- `sd` (Object) - Strategic Directive object with at least `sd_type`, `title`, `description`

**Returns**: `Array<string>` - List of affected repo names

**Logic:**
1. Scans title and description for component keywords (pages, api, components, lib, etc.)
2. Falls back to SD type defaults
3. Defaults to both repos if ambiguous

```javascript
// Feature with UI keywords
const sd1 = { sd_type: 'feature', title: 'Add quality inbox page' };
getAffectedRepos(sd1); // ['ehg', 'EHG_Engineer']

// API-only work
const sd2 = { sd_type: 'api', title: 'Create user endpoint' };
getAffectedRepos(sd2); // ['EHG_Engineer']

// UI-only work
const sd3 = { sd_type: 'feature', title: 'Update button component' };
getAffectedRepos(sd3); // ['ehg']
```

**Component Keyword Mapping:**

| Keywords | Repo |
|----------|------|
| pages, components, routes, hooks, tsx, ui, frontend | ehg |
| scripts, lib, cli, skills, commands, migrations, api, backend, server | EHG_Engineer |

**Type Defaults:**

| SD Type | Default Repos |
|---------|---------------|
| feature, bugfix, security, performance | both |
| api, database, infrastructure, documentation | EHG_Engineer |
| ui, ux_debt | ehg |

#### `checkSDRepoStatus(sd)`

Checks if an SD has uncommitted work in any of its affected repositories.

**Parameters:**
- `sd` (Object) - Strategic Directive object

**Returns**: `Object` - Status per repo

```javascript
const result = checkSDRepoStatus({ sd_key: 'SD-QUALITY-UI-001' });
// {
//   sdId: 'SD-QUALITY-UI-001',
//   affectedRepos: ['ehg', 'EHG_Engineer'],
//   repoStatus: [
//     {
//       name: 'ehg',
//       displayName: 'EHG (Frontend)',
//       path: '...',
//       hasUncommitted: false,
//       hasUnpushed: false,
//       uncommittedCount: 0,
//       unpushedCount: 0
//     },
//     {
//       name: 'EHG_Engineer',
//       displayName: 'EHG_Engineer (Backend)',
//       path: '...',
//       hasUncommitted: true,
//       hasUnpushed: false,
//       uncommittedCount: 2,
//       unpushedCount: 0
//     }
//   ],
//   hasUncommittedWork: true,
//   recommendation: 'Ship changes in EHG_Engineer before marking SD complete'
// }
```

---

### Branch Operations

#### `findSDBranches(sdId)`

Finds all branches related to a Strategic Directive across all repositories.

**Parameters:**
- `sdId` (string) - SD identifier (e.g., 'SD-QUALITY-UI-001')

**Returns**: `Array` - Branches found in each repo

```javascript
const branches = findSDBranches('SD-QUALITY-UI-001');
// [
//   {
//     repo: 'ehg',
//     repoPath: '...',
//     branch: 'feat/SD-QUALITY-UI-001-quality-web-ui',
//     isMerged: true,
//     commitsAhead: 0,
//     needsAction: false
//   },
//   {
//     repo: 'EHG_Engineer',
//     repoPath: '...',
//     branch: 'feat/SD-QUALITY-UI-001-backend',
//     isMerged: false,
//     commitsAhead: 5,
//     needsAction: true
//   }
// ]
```

---

### Display Helpers

#### `formatStatusForDisplay(status)`

Formats multi-repo status for console output.

**Parameters:**
- `status` (Object) - Result from `checkUncommittedChanges()`

**Returns**: `string` - Formatted console output

```javascript
const status = checkUncommittedChanges(true);
const output = formatStatusForDisplay(status);
console.log(output);
```

**Output Example:**
```
════════════════════════════════════════════════════════════
  MULTI-REPO STATUS
════════════════════════════════════════════════════════════

  Scanned 2 repositories
  ⚠️  Changes found in 1 repo(s)

────────────────────────────────────────────────────────────
📂 EHG (Frontend) (branch: main)
   📝 3 uncommitted change(s):
      M src/components/quality/FeedbackDetailPanel.tsx
      M src/pages/quality/QualityInboxPage.tsx
      ? temp.js

════════════════════════════════════════════════════════════
  RECOMMENDATIONS
════════════════════════════════════════════════════════════

  📂 ehg:
     cd C:\Users\...\ehg
     git checkout -b feat/SD-XXX-description
     git add .
     git commit -m "feat: description"
     git push -u origin HEAD
```

#### `formatSDStatusForDisplay(sdStatus)`

Formats SD-specific repo status for console output.

**Parameters:**
- `sdStatus` (Object) - Result from `checkSDRepoStatus()`

**Returns**: `string` - Formatted console output

```javascript
const sdStatus = checkSDRepoStatus({ sd_key: 'SD-QUALITY-UI-001' });
const output = formatSDStatusForDisplay(sdStatus);
console.log(output);
```

**Output Example:**
```
════════════════════════════════════════════════════════════
  SD REPO STATUS: SD-QUALITY-UI-001
════════════════════════════════════════════════════════════

  Affected repos: ehg, EHG_Engineer

┌────────────────┬─────────────┬─────────────┐
│ Repository     │ Uncommitted │ Unpushed    │
├────────────────┼─────────────┼─────────────┤
│ ehg            │ ✅ clean     │ ✅ clean     │
│ EHG_Engineer   │ 2 files     │ ✅ clean     │
└────────────────┴─────────────┴─────────────┘

⚠️  Ship changes in EHG_Engineer before marking SD complete
```

---

## Configuration

### KNOWN_REPOS

Metadata for known repositories in the EHG ecosystem.

```javascript
const KNOWN_REPOS = {
  ehg: {
    name: 'ehg',
    displayName: 'EHG (Frontend)',
    purpose: 'React/Vite frontend application',
    github: 'rickfelix/ehg',
    priority: 2,
    contains: ['UI components', 'pages', 'routes', 'React hooks']
  },
  EHG_Engineer: {
    name: 'EHG_Engineer',
    displayName: 'EHG_Engineer (Backend)',
    purpose: 'Backend tooling, CLI, and infrastructure',
    github: 'rickfelix/EHG_Engineer',
    priority: 1,
    contains: ['CLI tools', 'scripts', 'lib modules', 'database migrations']
  }
};
```

**Priority**: Lower number = higher priority. Used for sorting (infrastructure before frontend).

### COMPONENT_REPO_MAP

Maps component types to their expected repository.

```javascript
const COMPONENT_REPO_MAP = {
  // Frontend components (EHG)
  'pages': 'ehg',
  'components': 'ehg',
  'routes': 'ehg',
  'hooks': 'ehg',
  'tsx': 'ehg',
  'ui': 'ehg',
  'frontend': 'ehg',

  // Backend components (EHG_Engineer)
  'scripts': 'EHG_Engineer',
  'lib': 'EHG_Engineer',
  'cli': 'EHG_Engineer',
  'skills': 'EHG_Engineer',
  'commands': 'EHG_Engineer',
  'migrations': 'EHG_Engineer',
  'api': 'EHG_Engineer',
  'backend': 'EHG_Engineer',
  'server': 'EHG_Engineer'
};
```

---

## Usage Examples

### Example 1: Pre-Ship Check (Used by `/ship`)

```javascript
import { checkUncommittedChanges, formatStatusForDisplay } from '../lib/multi-repo/index.js';

// Check if any repo has uncommitted changes before shipping
const status = checkUncommittedChanges(true);

if (status.hasChanges) {
  console.log(formatStatusForDisplay(status));
  process.exit(1); // Block ship
}

console.log('✅ All repos clean - ready to ship');
```

### Example 2: SD Completion Validation

```javascript
import { checkSDRepoStatus, formatSDStatusForDisplay } from '../lib/multi-repo/index.js';

// Before marking SD complete, verify all affected repos are shipped
const sd = await loadSD('SD-QUALITY-UI-001');
const status = checkSDRepoStatus(sd);

if (status.hasUncommittedWork) {
  console.log(formatSDStatusForDisplay(status));
  console.log('\n❌ Cannot mark SD complete - uncommitted work exists');
  process.exit(1);
}

console.log('✅ All affected repos are clean');
```

### Example 3: Display SD Queue with Repo Scope

```javascript
import { getAffectedRepos } from '../lib/multi-repo/index.js';

// Show which repos each SD will affect
const sds = await loadSDQueue();

for (const sd of sds) {
  const repos = getAffectedRepos(sd);
  console.log(`${sd.sd_key} - ${repos.join(' + ')}`);
}

// Output:
// SD-QUALITY-UI-001 - ehg + EHG_Engineer
// SD-API-PERF-001 - EHG_Engineer
// SD-LANDING-002 - ehg
```

### Example 4: Find Related Branches

```javascript
import { findSDBranches } from '../lib/multi-repo/index.js';

// Find all branches for an SD before completion
const branches = findSDBranches('SD-QUALITY-UI-001');

const unmerged = branches.filter(b => b.needsAction);
if (unmerged.length > 0) {
  console.log('⚠️ Unmerged branches found:');
  for (const branch of unmerged) {
    console.log(`  ${branch.repo}: ${branch.branch} (${branch.commitsAhead} commits)`);
  }
}
```

---

## Integration with Commands

### Current Integrations

| Command | Usage |
|---------|-------|
| `/ship` Step 0.1 | Uses `checkUncommittedChanges()` to detect cross-repo changes |
| `multi-repo-status.js` | CLI wrapper around the module |

### Planned Integrations

| Command | Planned Usage |
|---------|---------------|
| `/leo next` | Show repo scope per SD in queue display |
| SD Completion | Verify all affected repos shipped before marking complete |
| `/uat` | Generate test scenarios covering both frontend and backend |
| `/document` | Coordinate docs across repos (frontend user guide + backend API docs) |

---

## Migration Guide

### For Existing Scripts Using Duplicated Logic

**Before:**
```javascript
// Local repo discovery function
function discoverRepos() {
  const repos = [];
  const entries = readdirSync(EHG_BASE_DIR);
  // ... 50 lines of discovery logic
  return repos;
}

const repos = discoverRepos();
```

**After:**
```javascript
import { discoverRepos } from '../lib/multi-repo/index.js';

const repos = discoverRepos();
```

**Benefits:**
- Reduced code duplication
- Consistent repo metadata
- Centralized configuration
- Easier testing and maintenance

### Scripts to Migrate

1. **`scripts/branch-cleanup-v2.js`** - Replace repo discovery
2. **`scripts/modules/shipping/MultiRepoCoordinator.js`** - Replace repo discovery + branch operations
3. Any new scripts needing multi-repo awareness

---

## Testing

```javascript
import { checkUncommittedChanges, getAffectedRepos } from '../lib/multi-repo/index.js';

// Test 1: Check status
const status = checkUncommittedChanges(true);
console.assert(typeof status.hasChanges === 'boolean');
console.assert(status.totalRepos === 2); // ehg + EHG_Engineer

// Test 2: SD mapping
const sd1 = { sd_type: 'feature', title: 'Add quality page' };
const repos1 = getAffectedRepos(sd1);
console.assert(repos1.length >= 1);
console.assert(repos1.includes('ehg') || repos1.includes('EHG_Engineer'));

// Test 3: API-only work
const sd2 = { sd_type: 'api', title: 'Create endpoint' };
const repos2 = getAffectedRepos(sd2);
console.assert(repos2.includes('EHG_Engineer'));
```

---

## Troubleshooting

### "No repositories found"

**Cause**: EHG_BASE_DIR calculation incorrect or repos not in expected location

**Solution**: Check that repos are in parent directory of EHG_Engineer:
```
C:/_EHG/
  ├── ehg/
  └── EHG_Engineer/
```

### "Branch might not have upstream" warnings

**Cause**: Local branches without remote tracking

**Solution**: This is expected for local-only branches. The module handles this gracefully.

### SD mapped to wrong repos

**Cause**: Component keywords in title/description trigger mapping

**Solution**: Check `COMPONENT_REPO_MAP` and ensure keywords are specific enough. Update mapping if needed.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-18 | Initial release - consolidates multi-repo logic |

---

**See Also:**
- [Multi-Repo Architecture](../01_architecture/multi-repo-architecture.md)
- Ship Command Documentation
- [LEO Protocol Documentation](schema/engineer/tables/leo_protocols.md)
