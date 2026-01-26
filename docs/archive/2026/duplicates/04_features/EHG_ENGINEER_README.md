<!-- ARCHIVED: 2026-01-26T16:26:32.775Z
     Reason: Duplicate of canonical file
     Original location: docs\04_features\EHG_ENGINEER_README.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# EHG_Engineer - LEO Protocol Builder Tool


## Metadata
- **Category**: Feature
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, migration, schema

## ⚠️ CRITICAL DISTINCTION - READ THIS FIRST!

### Two Separate Systems:

| System | Database ID | Purpose |
|--------|------------|---------|
| **EHG_Engineer** | dedlbzhpgkmetvhbkyzq | The LEO Protocol tool you're using RIGHT NOW to build applications |
| **EHG** | liapbndqlqxdcgpwntbv | The actual EHG portfolio application being built |

**Remember**: 
- EHG_Engineer = The hammer 🔨
- EHG = The house you're building 🏠

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