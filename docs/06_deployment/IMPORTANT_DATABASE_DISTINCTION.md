# IMPORTANT: Unified Database Architecture


## Metadata
- **Category**: Database
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, api, feature, protocol

> **ARCHITECTURE UPDATE (SD-ARCH-EHG-007)**: As of December 2024, EHG and EHG_Engineer
> now share a **consolidated database**. The old EHG database has been deprecated.

## Consolidated Architecture

### Single Database (ID: dedlbzhpgkmetvhbkyzq)

Both applications now use the **same consolidated database**:

| Application | Port | Purpose | Database |
|-------------|------|---------|----------|
| **EHG** | 8080 | Unified frontend (user + admin features) | dedlbzhpgkmetvhbkyzq |
| **EHG_Engineer** | 3000 | Backend API + LEO Protocol engine | dedlbzhpgkmetvhbkyzq |

### What Changed

**Before (Pre-SD-ARCH-EHG-007)**:
- EHG_Engineer: Had its own frontend dashboard + database
- EHG: Separate customer-facing app + database

**After (Current)**:
- EHG: Unified frontend with user features + admin dashboard at `/admin/*`
- EHG_Engineer: Backend API only (no standalone frontend)
- Database: Consolidated into `dedlbzhpgkmetvhbkyzq`

## Current Architecture

### EHG (Unified Frontend - Port 8080)
- **Purpose**: All user-facing AND admin features
- **Routes**:
  - `/` - User dashboard, venture creation
  - `/ventures` - Venture management
  - `/admin` - Admin dashboard (migrated from EHG_Engineer)
  - `/admin/directives` - Strategic Directives management
  - `/admin/prds` - PRD management
  - `/admin/ventures` - Admin ventures view
- **Stack**: Vite + React + Shadcn + TypeScript
- **GitHub**: rickfelix/ehg.git

### EHG_Engineer (Backend API - Port 3000)
- **Purpose**: Backend API server + LEO Protocol execution engine
- **Provides**:
  - REST API endpoints (`/api/sd`, `/api/prd`, etc.)
  - LEO Protocol scripts (`handoff.js`, `add-prd-to-database.js`)
  - WebSocket connections for real-time updates
- **NO standalone frontend** (admin UI migrated to EHG)
- **GitHub**: rickfelix/EHG_Engineer.git

## Supabase Projects Mapping

| Project Name | Supabase ID | Status | Purpose |
|-------------|-------------|--------|---------|
| **ehg_engineer** | dedlbzhpgkmetvhbkyzq | **ACTIVE** | Consolidated database for both apps |
| ehg | liapbndqlqxdcgpwntbv | **DEPRECATED** | Old EHG database (do not use) |
| ehg-platform | nxchardjdnvvlufhrumr | Staging | Alternative/staging version |
| ehg-platform-dev | jmqfmjadlvgyduupeexl | Development | Development version |

## When Connecting

### For ALL operations (both apps use same database):
```bash
supabase link --project-ref dedlbzhpgkmetvhbkyzq
```

### DEPRECATED - Do NOT use:
```bash
# OLD: supabase link --project-ref liapbndqlqxdcgpwntbv  # DEPRECATED
```

## Implementation Targets

| Feature Type | Target Directory | Repository |
|--------------|------------------|------------|
| User UI features | `/mnt/c/_EHG/EHG/src/` | rickfelix/ehg.git |
| Admin UI features | `/mnt/c/_EHG/EHG/src/components/admin/` | rickfelix/ehg.git |
| Stage components | `/mnt/c/_EHG/EHG/src/components/stages/admin/` | rickfelix/ehg.git |
| Backend API | `/mnt/c/_EHG/EHG_Engineer/` | rickfelix/EHG_Engineer.git |

## Remember

- **ALL UI changes** go to EHG (unified frontend)
- **Only backend API/script changes** go to EHG_Engineer
- **Both apps share** the consolidated database (dedlbzhpgkmetvhbkyzq)
- **Old database ID** (liapbndqlqxdcgpwntbv) is **DEPRECATED**
