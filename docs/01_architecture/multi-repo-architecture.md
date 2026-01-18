# Multi-Repository Architecture

**Last Updated**: 2026-01-18
**Status**: Active
**Version**: 1.0

## Overview

The EHG project uses a multi-repository architecture to separate concerns between frontend and backend systems. This document describes the architecture, rationale, and coordination patterns.

---

## Repository Structure

```
C:/_EHG/
├── ehg/                      (Frontend Repository)
│   ├── src/
│   │   ├── pages/            # React pages
│   │   ├── components/       # Reusable UI components
│   │   ├── routes/           # Route definitions
│   │   ├── hooks/            # Custom React hooks
│   │   └── lib/              # Frontend utilities
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
└── EHG_Engineer/             (Backend/Tooling Repository)
    ├── lib/                  # Shared library modules
    ├── scripts/              # CLI scripts and tools
    ├── .claude/              # LEO Protocol skills and commands
    ├── database/             # Migrations and schema
    ├── server.js             # Express API server
    └── package.json
```

---

## Repository Responsibilities

### EHG (Frontend)

**GitHub**: `rickfelix/ehg`
**Tech Stack**: React, Vite, TypeScript, Tailwind CSS, Shadcn UI
**Port**: 8080
**Purpose**: User-facing web application

**Responsibilities:**
- UI components and pages
- Client-side routing
- State management (React Context, Zustand)
- API client calls to backend
- User authentication flows (frontend)
- Data visualization and dashboards

**Key Directories:**
- `src/pages/` - Route pages (Dashboard, Quality, Settings, etc.)
- `src/components/` - Reusable UI components
- `src/hooks/` - Custom React hooks for data fetching
- `src/lib/` - Frontend utilities

### EHG_Engineer (Backend/Tooling)

**GitHub**: `rickfelix/EHG_Engineer`
**Tech Stack**: Node.js, Express, Supabase, ESM
**Port**: 3000
**Purpose**: Backend API, CLI tools, and LEO Protocol orchestration

**Responsibilities:**
- Express API server
- Database migrations and schema
- LEO Protocol implementation (LEAD/PLAN/EXEC)
- CLI tools and scripts
- Shared library modules (quality, UAT, multi-repo)
- Background jobs and automation
- Claude Code integration (.claude/skills, .claude/commands)

**Key Directories:**
- `lib/` - Shared modules (quality, UAT, multi-repo, simplifier)
- `scripts/` - CLI tools (SD management, handoffs, testing)
- `.claude/` - Claude Code skills and commands
- `database/` - Migrations and schema files
- `server.js` - Express API with routes

---

## Cross-Repo Dependencies

### API Communication

Frontend → Backend API calls via Supabase RPC or REST endpoints:

```typescript
// Frontend (EHG)
const response = await fetch(`${import.meta.env.VITE_API_URL}/api/feedback`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(feedbackData)
});
```

```javascript
// Backend (EHG_Engineer)
app.post('/api/feedback', async (req, res) => {
  const { data, error } = await supabase
    .from('feedback')
    .insert(req.body);
  res.json({ data, error });
});
```

### Shared Contracts

**Database Schema**: Single source of truth in Supabase
- Defined in: `EHG_Engineer/database/migrations/*.sql`
- Accessed by: Both repos via Supabase client
- RLS policies: Enforced at database level

**TypeScript Types**: Some duplication necessary
- Frontend types: `EHG/src/types/`
- Backend types: Inferred from database or defined in code
- **Sync mechanism**: Manual for now (future: shared types package)

---

## Coordination Patterns

### Pattern 1: Feature Spanning Both Repos

**Example**: Quality Lifecycle System (SD-QUALITY-LIFECYCLE-001)

**Backend Work (EHG_Engineer)**:
- Database schema (feedback table)
- CLI skills (/inbox, /feedback)
- Triage engine (lib/quality/)
- API endpoints (POST /api/feedback)

**Frontend Work (EHG)**:
- Quality pages (QualityInboxPage, QualityBacklogPage)
- Feedback components (FeedbackWidget, FeedbackDetailPanel)
- Breadcrumb labels
- "Promote to SD" button

**Coordination**:
1. Backend shipped first (infrastructure)
2. Frontend follows (consumes backend API)
3. Both branches reference same SD ID in name

### Pattern 2: Backend-Only Work

**Example**: Database migration, CLI tool, LEO Protocol enhancement

**Affected Repo**: EHG_Engineer only

**Process**: Standard single-repo workflow

### Pattern 3: Frontend-Only Work

**Example**: UI polish, component styling, dashboard layout

**Affected Repo**: EHG only

**Process**: Standard single-repo workflow

---

## Branch Naming Convention

When work spans multiple repos, use consistent SD ID in branch names:

```bash
# Backend (EHG_Engineer)
feat/SD-QUALITY-UI-001-backend

# Frontend (EHG)
feat/SD-QUALITY-UI-001-quality-web-ui
```

**Pattern**: `<type>/SD-<SD-ID>-<description>`

This allows tools like `multi-repo-status.js` to correlate branches across repos.

---

## Deployment Architecture

### Local Development

```
┌─────────────────────────────────────────────────┐
│                  Developer Machine               │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────┐        ┌──────────────────┐   │
│  │   EHG       │        │  EHG_Engineer    │   │
│  │  (Frontend) │        │   (Backend API)  │   │
│  │  Port 8080  │───────▶│   Port 3000      │   │
│  └─────────────┘  HTTP  └──────────────────┘   │
│         │                         │             │
│         │                         │             │
│         └─────────┬───────────────┘             │
│                   │                             │
│                   ▼                             │
│           ┌──────────────┐                      │
│           │   Supabase   │                      │
│           │   (Cloud)    │                      │
│           └──────────────┘                      │
└─────────────────────────────────────────────────┘
```

### Production (Future)

```
┌─────────────────────────────────────────────────┐
│                    Vercel                        │
│                                                 │
│  ┌─────────────┐                                │
│  │   EHG       │                                │
│  │  (Frontend) │                                │
│  │  Static     │                                │
│  └─────────────┘                                │
│         │                                       │
│         └───────────────────┐                   │
│                             │                   │
└─────────────────────────────┼───────────────────┘
                              │
                              ▼
                     ┌──────────────┐
                     │   Supabase   │
                     │   (Cloud)    │
                     └──────────────┘
                              ▲
                              │
┌─────────────────────────────┼───────────────────┐
│                    Render / Railway              │
│                             │                   │
│           ┌──────────────────┐                  │
│           │  EHG_Engineer    │                  │
│           │   (Backend API)  │                  │
│           │   Container      │                  │
│           └──────────────────┘                  │
└─────────────────────────────────────────────────┘
```

---

## SD-to-Repo Mapping

### Automatic Detection

The `lib/multi-repo` module automatically determines which repos are affected by an SD:

**Component Keywords**:
- `pages`, `components`, `tsx`, `ui` → Frontend (EHG)
- `lib`, `scripts`, `api`, `migrations` → Backend (EHG_Engineer)

**SD Type Defaults**:
- `feature`, `bugfix`, `security` → Both repos (assume full-stack)
- `api`, `database`, `infrastructure` → Backend only
- `ui`, `ux_debt` → Frontend only

**Example**:
```javascript
import { getAffectedRepos } from './lib/multi-repo/index.js';

const sd1 = { sd_type: 'feature', title: 'Add quality inbox page' };
getAffectedRepos(sd1); // ['ehg', 'EHG_Engineer']

const sd2 = { sd_type: 'database', title: 'Add feedback table' };
getAffectedRepos(sd2); // ['EHG_Engineer']
```

---

## Multi-Repo Workflows

### Workflow 1: Starting Work on a Multi-Repo SD

```bash
# 1. Check which repos are affected
node scripts/multi-repo-status.js --sd SD-QUALITY-UI-001

# Output:
#   Affected repos: ehg, EHG_Engineer

# 2. Start with backend (priority 1)
cd C:/_EHG/EHG_Engineer
git checkout -b feat/SD-QUALITY-UI-001-backend
# ... do backend work ...
git commit && git push

# 3. Move to frontend (priority 2)
cd C:/_EHG/ehg
git checkout -b feat/SD-QUALITY-UI-001-frontend
# ... do frontend work ...
git commit && git push
```

### Workflow 2: Checking Uncommitted Changes Before Shipping

```bash
# Before running /ship, check all repos
node scripts/multi-repo-status.js

# If changes found in other repo:
#   1. Ship that repo first
#   2. Return to original repo
#   3. Complete ship workflow
```

### Workflow 3: Marking SD Complete

```bash
# Verify all affected repos are shipped
node scripts/multi-repo-status.js --sd SD-QUALITY-UI-001

# Expected output (all clean):
#   ┌────────────────┬─────────────┬─────────────┐
#   │ Repository     │ Uncommitted │ Unpushed    │
#   ├────────────────┼─────────────┼─────────────┤
#   │ ehg            │ ✅ clean     │ ✅ clean     │
#   │ EHG_Engineer   │ ✅ clean     │ ✅ clean     │
#   └────────────────┴─────────────┴─────────────┘

# Then safe to mark SD complete in database
```

---

## Advantages of Multi-Repo Architecture

### Separation of Concerns
- Frontend developers focus on UX without backend complexity
- Backend developers focus on API/infrastructure without UI concerns
- Clear ownership boundaries

### Independent Deployment
- Frontend can deploy without backend changes
- Backend can deploy without frontend changes
- Reduces deployment risk and coordination overhead

### Technology Flexibility
- Frontend can use different stack (React vs Next.js)
- Backend can use different stack (Node vs Python)
- Each repo optimized for its purpose

### Scalability
- Teams can work independently
- CI/CD pipelines separated
- Easier to scale each service independently

---

## Challenges and Mitigations

### Challenge 1: Coordination Overhead

**Problem**: Work spanning both repos requires coordination

**Mitigations**:
- `lib/multi-repo` module for automated detection
- SD branch naming convention
- Multi-repo status checks before shipping
- LEO Protocol enforces SD completion across repos

### Challenge 2: Type Synchronization

**Problem**: TypeScript types duplicated between repos

**Current Mitigation**: Manual sync
**Future Solution**: Shared types package (e.g., `@ehg/types`)

### Challenge 3: Testing Full Stack Flows

**Problem**: E2E tests need both repos running

**Mitigation**:
- `scripts/leo-stack.sh` starts both servers
- E2E tests run against full stack
- UAT process validates cross-repo integration

### Challenge 4: Forgotten Work in Other Repo

**Problem**: Ship backend, forget frontend changes exist

**Mitigation**: `/ship` Step 0.1 runs `multi-repo-status.js` to catch this

---

## Future Enhancements

### Monorepo Consideration

**Option**: Combine into monorepo with workspaces

**Pros**:
- Easier coordination
- Shared types
- Single PR for full-stack changes

**Cons**:
- Larger repository
- More complex CI/CD
- Loss of deployment independence

**Decision**: Stay multi-repo for now, revisit if coordination pain increases

### Shared Types Package

Create `@ehg/types` package:
```
packages/
└── types/
    ├── database.ts     # Database types
    ├── api.ts          # API contracts
    └── common.ts       # Shared utilities
```

Both repos import from `@ehg/types` for consistency.

---

## Tools and Scripts

### Multi-Repo Manager Module

**Location**: `lib/multi-repo/index.js`
**Purpose**: Centralized multi-repo operations (single source of truth)
**Docs**: [Multi-Repo Module Reference](../reference/multi-repo-module.md)

**Phase 1 Refactoring (2026-01-18)**:
- Eliminated duplicated repo discovery logic across 3 scripts
- Added named exports for config constants (`EHG_BASE_DIR`, `KNOWN_REPOS`, `COMPONENT_REPO_MAP`, `IGNORED_REPOS`)
- Scripts now import from centralized module:
  - `MultiRepoCoordinator.js` - Reduced by ~70 lines
  - `branch-cleanup-v2.js` - Reduced by ~50 lines
  - `multi-repo-status.js` - Already using centralized module (123 lines)
- Net code reduction: 90 lines
- Benefit: Single source of truth, consistent behavior across all commands

### Multi-Repo Status CLI

**Location**: `scripts/multi-repo-status.js`
**Usage**:
```bash
node scripts/multi-repo-status.js              # Check all repos
node scripts/multi-repo-status.js --sd SD-XXX  # Check specific SD
node scripts/multi-repo-status.js --json       # JSON output
```

### LEO Stack Script

**Location**: `scripts/leo-stack.sh`
**Usage**:
```bash
bash scripts/leo-stack.sh start     # Start both servers
bash scripts/leo-stack.sh restart   # Restart both servers
bash scripts/leo-stack.sh status    # Check status
bash scripts/leo-stack.sh stop      # Stop both servers
```

---

## Best Practices

### When Working Across Repos

1. **Start with backend** (infrastructure before UI)
2. **Use consistent SD IDs** in branch names
3. **Check multi-repo status** before shipping
4. **Ship in order**: Backend → Frontend
5. **Verify full-stack** with E2E tests after both shipped

### When Adding New Features

1. **Determine repo scope** early (use `getAffectedRepos()`)
2. **Plan coordination points** (API contracts, shared types)
3. **Document cross-repo dependencies**
4. **Test integration** after both parts shipped

### When Refactoring

1. **Check for cross-repo impact** (breaking API changes)
2. **Coordinate changes** if API contracts affected
3. **Version API changes** if backward compatibility needed
4. **Update both repos atomically** if possible

---

## Related Documentation

- [Multi-Repo Module API Reference](../reference/multi-repo-module.md)
- [Ship Command Documentation](../../.claude/commands/ship.md)
- [LEO Protocol Overview](../03_protocols_and_standards/leo-protocol.md)
- [Deployment Guide](../06_deployment/deployment-guide.md)

---

**Last Review**: 2026-01-18
**Next Review**: 2026-04-18 (Quarterly)
