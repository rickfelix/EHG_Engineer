# EHG_Engineer - LEO Protocol Backend & Engine

> **ARCHITECTURE UPDATE (SD-ARCH-EHG-007)**: As of December 2024, EHG is the **unified frontend** (user + admin features via `/admin` routes). EHG_Engineer is now **backend API only**. Both share the consolidated database.

## Current Architecture

| System | Port | Purpose | Database |
|--------|------|---------|----------|
| **EHG** | 8080 | Unified frontend (user features + admin dashboard at `/admin/*`) | dedlbzhpgkmetvhbkyzq |
| **EHG_Engineer** | 3000 | Backend API + LEO Protocol engine (no standalone frontend) | dedlbzhpgkmetvhbkyzq |

**Key Points**:
- All UI (user + admin) is in EHG
- EHG_Engineer provides REST APIs consumed by EHG
- Admin routes: `/admin/directives`, `/admin/prds`, `/admin/ventures`

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

> **NOTE**: Both EHG and EHG_Engineer now use the **CONSOLIDATED** database (SD-ARCH-EHG-006).

### For All Development (CONSOLIDATED):
```bash
# Connect to the consolidated database
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