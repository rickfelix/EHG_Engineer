---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# EHG_Engineer - LEO Protocol Backend & Engine


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, api, testing, migration

> **ARCHITECTURE UPDATE (SD-ARCH-EHG-007)**: EHG is now the **unified frontend** (user + admin features at `/admin/*` routes). EHG_Engineer is **backend API only**. Both share the consolidated database.

## Current Architecture

| System | Port | Database | Purpose |
|--------|------|----------|---------|
| **EHG** | 8080 | dedlbzhpgkmetvhbkyzq | Unified frontend (user + admin UI) |
| **EHG_Engineer** | 3000 | dedlbzhpgkmetvhbkyzq | Backend API + LEO Protocol engine |

**Key Points**:
- All UI (user + admin) is in EHG
- EHG_Engineer provides REST APIs consumed by EHG
- Both use the CONSOLIDATED database

---

## Overview

EHG_Engineer is a comprehensive development environment implementing LEO Protocol v3.1.5, designed to build and manage multiple applications through an AI-assisted workflow system.

## Quick Start

### Managing Projects

```bash
# See all projects
node scripts/leo.js projects

# Switch to EHG project
node scripts/leo.js switch ehg

# Check current status
node scripts/leo.js status
```

### Adding New Projects

```bash
# Simple 3-step process
node scripts/leo.js add-project

# Then:
# 1. Copy template: cp .env.project-template .env.project-registration
# 2. Edit 2 fields: PROJECT_NAME and GITHUB_REPO
# 3. Register: node scripts/leo-register-from-env.js
```

## Project Registry

All projects are managed in `applications/registry.json`:
- APP001: ehg (the actual EHG project)
- APP002: test-leo-project (test project)
- Additional projects can be added via the registration process

## Database Connections

### For EHG Project Development:
```bash
# Connect to EHG database (NOT EHG_Engineer)
supabase link --project-ref liapbndqlqxdcgpwntbv
```

### For LEO Protocol System:
```bash
# This is only if you're modifying the LEO Protocol itself
supabase link --project-ref dedlbzhpgkmetvhbkyzq
```

## File Structure

```
EHG_Engineer/
├── applications/       # Project registry and configurations
├── docs/              # LEO Protocol documentation
├── lib/               # Core LEO Protocol libraries
├── scripts/           # LEO CLI and utilities
├── database/          # Database schemas and migrations
├── templates/         # Project templates
└── hooks/             # Git and workflow hooks
```

## Key Commands

### LEO Protocol Commands
- `leo lead` - Switch to LEAD agent role
- `leo plan` - Switch to PLAN agent role
- `leo exec` - Switch to EXEC agent role
- `leo projects` - List all projects
- `leo switch [name]` - Switch between projects
- `leo status` - Show current status

### Testing Connections
- `node scripts/test-ehg-connection.js` - Test EHG project connections
- `node scripts/test-connections.js` - Test all project connections

## Important Files

- `IMPORTANT_DATABASE_DISTINCTION.md` - Critical info about database separation
- `PROJECT_REGISTRATION_GUIDE.md` - How to add new projects
- `SIMPLE_PROJECT_SETUP.md` - Simplified setup instructions
- `.env.project-template` - Template for new projects

## Support

- GitHub Issues: For LEO Protocol issues
- Supabase Dashboard: For database management
- This README: For understanding the system architecture

---

**Remember**: This tool builds applications. It doesn't contain your application code - that lives in your project repositories!