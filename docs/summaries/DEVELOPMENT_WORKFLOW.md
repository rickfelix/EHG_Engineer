# EHG_Engineer Development Workflow Guide


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-12
- **Tags**: database, migration, feature, guide

## Architecture Overview

The EHG_Engineer repository serves as the **LEO Protocol orchestration layer** for managing multiple venture applications.

### Directory Responsibilities

1. **`/mnt/c/_EHG/EHG_Engineer/`** - LEO Protocol Workspace
   - Contains CLAUDE.md files, agents, scripts, migrations
   - Manages multi-application registry and configurations
   - Houses Strategic Directives and retrospectives
   - Provides tooling for orchestration across all ventures

2. **`/mnt/c/_EHG/EHG/`** - APP001 (ehg Application)
   - The actual ehg portfolio application source code
   - Primary development location for ehg features
   - Separate git repository
   - This is where the dev server runs (`PORT=8080 npm run dev`)

### Conceptual Model

```
EHG_Engineer (Orchestration)
    ├── LEO Protocol Tooling
    ├── Multi-App Management
    │   ├── APP001 config → points to /mnt/c/_EHG/EHG
    │   ├── APP002 config → future venture repo
    │   └── APP003 config → future venture repo
    └── Strategic Directives, Agents, Scripts

Actual Application Repos (Separate Git Repos)
    ├── /mnt/c/_EHG/EHG (APP001)
    ├── /path/to/future-venture-1 (APP002)
    └── /path/to/future-venture-2 (APP003)
```

## Development Workflow

### For ehg Application Development (APP001)

1. **Navigate to actual repository**
   ```bash
   cd /mnt/c/_EHG/EHG
   ```

2. **Start development server**
   ```bash
   PORT=8080 npm run dev
   ```

3. **Make changes, test, commit**
   ```bash
   # Edit files in /mnt/c/_EHG/EHG
   git add .
   git commit -m "feat: your feature"
   git push
   ```

4. **NEVER edit files in** `/mnt/c/_EHG/EHG_Engineer/applications/APP001/codebase/`
   - This directory should remain empty (or contain only DO_NOT_USE_README.md)
   - Any code placed here will be gitignored and lost

### For LEO Protocol Development

1. **Navigate to EHG_Engineer**
   ```bash
   cd /mnt/c/_EHG/EHG_Engineer
   ```

2. **Work on orchestration tooling**
   - Update CLAUDE.md files
   - Create/modify agents
   - Write database migrations
   - Manage Strategic Directives

3. **Commit LEO Protocol changes**
   ```bash
   git add .
   git commit -m "feat(leo): your tooling change"
   git push
   ```

## Claude Code Session Checklist

Before starting any development work, verify:

- [ ] Check current directory with `pwd`
- [ ] For ehg development: ensure you're in `/mnt/c/_EHG/EHG`
- [ ] For LEO tooling: ensure you're in `/mnt/c/_EHG/EHG_Engineer`
- [ ] Never edit files in `applications/APP001/codebase/`
- [ ] Verify config.json points to correct `local_path`

## Application Configuration

Each APP has a `config.json` that specifies:

```json
{
  "id": "APP001",
  "name": "ehg",
  "local_path": "/mnt/c/_EHG/EHG",  // ← Actual repo location
  "github": {
    "owner": "rickfelix",
    "repo": "ehg.git",
    "branch": "main"
  }
}
```

**Key Point**: The `local_path` is the source of truth for where development happens.

## Common Mistakes to Avoid

### ❌ WRONG: Working in applications/APP001/codebase

```bash
# DON'T DO THIS:
cd /mnt/c/_EHG/EHG_Engineer/applications/APP001/codebase
npm run dev  # ← Wrong location!
```

### ✅ CORRECT: Working in the actual repository

```bash
# DO THIS:
cd /mnt/c/_EHG/EHG
npm run dev  # ← Correct location!
```

## Adding Future Ventures

When creating a new venture (e.g., a venture created by ehg):

1. **Create the venture's git repository separately**
   ```bash
   mkdir /path/to/new-venture
   cd /path/to/new-venture
   git init
   # ... set up the project
   ```

2. **Register it in EHG_Engineer**
   ```bash
   cd /mnt/c/_EHG/EHG_Engineer
   npm run register-app
   # Follow prompts to create APP003, APP004, etc.
   ```

3. **Update the app's config.json**
   - Ensure `local_path` points to the actual repo
   - Never clone code into `applications/APP00X/codebase/`

## Validation

Run this command to validate all app configurations:

```bash
cd /mnt/c/_EHG/EHG_Engineer
node scripts/validate-app-configs.mjs
```

This will check:
- All `local_path` values point to existing directories
- All paths are valid git repositories
- No code exists in gitignored `codebase/` directories

## Quick Reference

| Task | Directory | Command |
|------|-----------|---------|
| ehg development | `/mnt/c/_EHG/EHG` | `PORT=8080 npm run dev` |
| LEO tooling | `/mnt/c/_EHG/EHG_Engineer` | Edit CLAUDE.md, agents, scripts |
| View app configs | `/mnt/c/_EHG/EHG_Engineer/applications` | Check `config.json` files |
| Register new app | `/mnt/c/_EHG/EHG_Engineer` | `npm run register-app` |

## Architecture Benefits

This separation provides:

1. **Single Source of Truth**: Actual repos are the only code location
2. **Multi-App Support**: Easily manage multiple ventures
3. **Clean Orchestration**: LEO Protocol tooling separate from app code
4. **No Sync Conflicts**: No need to sync between multiple copies
5. **Future-Proof**: Ready for ventures created by ehg

## Support

If you're unsure which directory to work in:

1. Check the task type:
   - **App feature/bug** → Work in app's `local_path`
   - **LEO tooling** → Work in `/mnt/c/_EHG/EHG_Engineer`

2. Verify using `config.json`:
   ```bash
   cat /mnt/c/_EHG/EHG_Engineer/applications/APP001/config.json | grep local_path
   ```

3. Always prefer the `local_path` location for development

---

**Last Updated**: 2025-10-17
**Part of**: LEO Protocol v4.3.3 Multi-Application Architecture
