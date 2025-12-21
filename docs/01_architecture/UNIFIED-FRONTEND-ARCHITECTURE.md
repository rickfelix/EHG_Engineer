# Unified Frontend Architecture

**SD Reference**: SD-ARCH-EHG-007
**Effective Date**: December 2024
**Status**: ACTIVE

---

## Executive Summary

The EHG ecosystem has consolidated into a **unified frontend architecture** where:

- **EHG** is the single frontend application (user + admin features)
- **EHG_Engineer** is the backend API and LEO Protocol engine (no standalone UI)
- Both applications share the **consolidated database** (`dedlbzhpgkmetvhbkyzq`)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    UNIFIED EHG ECOSYSTEM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 EHG (Port 8080)                          │    │
│  │              UNIFIED FRONTEND                            │    │
│  │                                                          │    │
│  │  ┌──────────────────┐    ┌──────────────────────────┐   │    │
│  │  │  User Features   │    │   Admin Features         │   │    │
│  │  │  - /             │    │   - /admin               │   │    │
│  │  │  - /ventures     │    │   - /admin/directives    │   │    │
│  │  │  - /dashboard    │    │   - /admin/prds          │   │    │
│  │  └──────────────────┘    │   - /admin/ventures      │   │    │
│  │                          │   - /admin/backlog       │   │    │
│  │                          └──────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼ REST API calls                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              EHG_Engineer (Port 3000)                    │    │
│  │             BACKEND API + LEO ENGINE                     │    │
│  │                                                          │    │
│  │  - /api/sd (Strategic Directives)                       │    │
│  │  - /api/prd (Product Requirements)                      │    │
│  │  - /api/backlog (Backlog Management)                    │    │
│  │  - LEO Protocol Scripts (handoff.js, etc.)              │    │
│  │  - WebSocket connections for real-time updates          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           Consolidated Database                          │    │
│  │           dedlbzhpgkmetvhbkyzq                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Application Responsibilities

### EHG (Unified Frontend)

| Aspect | Details |
|--------|---------|
| **Port** | 8080 |
| **Stack** | Vite + React + TypeScript + Tailwind + shadcn-ui |
| **Repository** | `rickfelix/ehg.git` |
| **Purpose** | All user-facing AND admin features |

**Routes:**
- `/` - User dashboard, venture creation
- `/ventures` - Venture management
- `/ventures/:id` - Individual venture with stage navigation
- `/admin` - Admin dashboard (migrated from EHG_Engineer)
- `/admin/directives` - Strategic Directives management
- `/admin/prds` - PRD management
- `/admin/ventures` - Admin ventures view
- `/admin/backlog` - Backlog management

**Key Directories:**
```
/mnt/c/_EHG/EHG/src/
├── components/
│   ├── admin/           # Admin features (SDManager, PRDManager, etc.)
│   ├── ventures/        # Venture management components
│   └── stages/          # Stage components for venture workflow
├── pages/
│   └── admin/           # Admin page wrappers
├── services/
│   └── adminApi.ts      # API client for EHG_Engineer backend
└── hooks/
    └── useAdminWebSocket.ts  # Real-time updates
```

---

### EHG_Engineer (Backend API)

| Aspect | Details |
|--------|---------|
| **Port** | 3000 |
| **Stack** | Node.js + Express + Supabase |
| **Repository** | `rickfelix/EHG_Engineer.git` |
| **Purpose** | Backend API + LEO Protocol engine (NO standalone UI) |

**API Endpoints:**
- `GET/POST /api/sd` - Strategic Directives CRUD
- `GET/POST /api/prd` - PRD management
- `GET/POST /api/backlog` - Backlog operations
- `GET /api/strategic-directives/:id/backlog-summary` - AI summaries

**Key Components:**
```
/mnt/c/_EHG/EHG_Engineer/
├── server.js            # Express API server
├── lib/agents/          # LEO Protocol agents
├── lib/services/        # Core services
├── scripts/             # LEO Protocol scripts
│   ├── handoff.js       # Phase transition handler
│   └── add-prd-to-database.js  # PRD creation
└── database/            # Schema and migrations
```

---

## Database Architecture

### Consolidated Database

| Key | Value |
|-----|-------|
| **Project ID** | `dedlbzhpgkmetvhbkyzq` |
| **Status** | ACTIVE (production) |
| **Used By** | Both EHG and EHG_Engineer |

### Deprecated Database (DO NOT USE)

| Key | Value |
|-----|-------|
| **Project ID** | `liapbndqlqxdcgpwntbv` |
| **Status** | DEPRECATED |
| **Reason** | SD-ARCH-EHG-006 consolidation |

### Connection

```bash
# Both applications use this:
supabase link --project-ref dedlbzhpgkmetvhbkyzq
```

---

## Target Application Field

The `target_application` field in `strategic_directives_v2` and `retrospectives` tables uses these values:

| Value | Meaning |
|-------|---------|
| `EHG` | Unified frontend (user + admin features via `/admin` routes) |
| `EHG_Engineer` | Backend API and LEO Protocol engine only |

**Note**: As of SD-ARCH-EHG-007, all UI development targets `EHG`.

---

## Development Workflow

### Starting the Stack

```bash
# Start all services
bash scripts/leo-stack.sh restart

# This starts:
# - EHG_Engineer on port 3000 (backend API)
# - EHG on port 8080 (unified frontend)
# - Agent Platform on port 8000 (optional)
```

### Adding UI Features

1. All UI goes to EHG (`/mnt/c/_EHG/EHG/src/`)
2. Admin features go to `/admin/*` routes
3. Use `adminApi.ts` to call EHG_Engineer backend

### Adding API Features

1. All APIs go to EHG_Engineer (`/mnt/c/_EHG/EHG_Engineer/`)
2. Add endpoints to `server.js`
3. Ensure CORS allows EHG frontend origin

---

## Migration History

| SD | Date | Change |
|----|------|--------|
| SD-ARCH-EHG-006 | 2024-11-30 | Database consolidation |
| SD-ARCH-EHG-007 | 2024-12 | Unified frontend architecture |

---

## Related Documentation

- [IMPORTANT_DATABASE_DISTINCTION.md](../operations/IMPORTANT_DATABASE_DISTINCTION.md) - Database architecture
- [Multi-Application Testing Architecture](../05_testing/architecture.md) - Test organization
- [Database Architecture](../database/architecture.md) - Multi-database patterns

---

*Document generated as part of SD-ARCH-EHG-007 documentation update*
*Last Updated: 2024-12-21*
