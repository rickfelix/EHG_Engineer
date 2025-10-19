# EHG_Engineer Multi-Application Management

This directory contains configurations and management tools for multiple applications managed through the LEO Protocol.

## Directory Structure

```
applications/
├── registry.json           # Master registry of all managed applications
├── .gitignore             # Ignore rules for codebases and credentials
├── APP001/                # Example application directory
│   ├── config.json        # Application configuration
│   ├── codebase/         # Full git clone (gitignored)
│   ├── .env.encrypted    # Encrypted credentials (gitignored)
│   ├── directives/       # App-specific Strategic Directives
│   └── .leo-sync         # Sync status tracking (gitignored)
└── APP002/               # Another application...
```

## CRITICAL: Development Workflow Warning

The `codebase/` directories in each APP folder should **NEVER** be used for direct development. They are gitignored and meant to remain empty or contain only placeholder files.

**Always work in the actual repository location specified in each APP's `config.json` under `local_path`.**

Example:
- APP001 `config.json` specifies: `"local_path": "/mnt/c/_EHG/ehg"`
- Therefore, **always** work in `/mnt/c/_EHG/ehg`, **never** in `APP001/codebase/`

This architecture ensures:
- Single source of truth (the actual git repository)
- No synchronization conflicts
- Clear separation between orchestration (EHG_Engineer) and application code

## Setup Instructions

### 1. Prerequisites

Ensure you have the following CLI tools installed:
- GitHub CLI (`gh`) - Required for repo management
- Supabase CLI (`supabase`) - Required for database sync
- Node.js 14+ - Required for scripts

Authenticate CLI tools:
```bash
gh auth login
supabase login
```

### 2. Register a New Application

```bash
npm run register-app
```

This interactive wizard will:
1. Assign an APP-ID (e.g., APP001)
2. Clone the GitHub repository
3. Encrypt and store credentials
4. Create initial configuration
5. Add to registry.json

### 3. Switch Application Context

```bash
npm run switch-context APP001
# or
leo context set APP001
```

This sets the current working application for all LEO Protocol operations.

### 4. Application Configuration

Each application has a `config.json` file with:
```json
{
  "id": "APP001",
  "name": "Application Name",
  "github": {
    "owner": "org-name",
    "repo": "repo-name",
    "branch": "main"
  },
  "supabase": {
    "project_id": "project-id",
    "url": "https://xxx.supabase.co"
  },
  "settings": {
    "auto_sync": true,
    "ci_cd_enabled": true,
    "test_on_push": true
  }
}
```

### 5. Credential Management

Credentials are encrypted using AES-256-GCM and stored in `.env.encrypted`.

To update credentials:
```bash
npm run update-credentials APP001
```

Never commit plain text credentials. The encryption key is stored in `../.leo-keys` (gitignored).

### 6. Synchronization

#### Manual Sync
```bash
npm run sync-app APP001
```

#### Auto-Sync
Enable in `config.json`:
```json
{
  "settings": {
    "auto_sync": true,
    "sync_interval": 1800
  }
}
```

### 7. Strategic Directive Deployment

Create app-specific Strategic Directives:
```bash
npm run create-app-sd APP001
```

Deploy to application:
```bash
npm run deploy-sd APP001-SD-2025-01-15-A
```

## Security Notes

1. **Never commit**:
   - Codebases (use GitHub for version control)
   - Plain text credentials
   - `.leo-keys` file
   - Sync status files

2. **Always encrypt** credentials before storage

3. **Use context switching** to avoid cross-app contamination

4. **Regular backups** of registry.json and configs

## Troubleshooting

### Issue: Cannot find application
- Check registry.json
- Ensure APP-ID is correct
- Run `npm run list-apps`

### Issue: Sync failed
- Check GitHub CLI auth: `gh auth status`
- Verify credentials: `npm run validate-credentials APP001`
- Check network connectivity
- Review sync logs in `APP001/.leo-sync/logs/`

### Issue: Context not switching
- Check `.leo-context` file
- Run `leo context show`
- Restart terminal session

## Commands Reference

```bash
# Application Management
npm run register-app              # Register new application
npm run remove-app <APP-ID>       # Remove application
npm run list-apps                 # List all applications

# Context Management
npm run switch-context <APP-ID>   # Switch to application
npm run show-context              # Show current context

# Synchronization
npm run sync-app <APP-ID>        # Sync specific app
npm run sync-all                 # Sync all active apps

# Credentials
npm run encrypt-credentials <APP-ID>    # Encrypt credentials
npm run validate-credentials <APP-ID>   # Test connections

# Strategic Directives
npm run create-app-sd <APP-ID>          # Create SD for app
npm run deploy-sd <SD-ID>               # Deploy SD to app
npm run list-app-sds <APP-ID>           # List app's SDs
```

## Integration with LEO Protocol

All applications follow LEO Protocol v3.1.5 standards:
- Strategic Directives use APP-ID prefixes
- Communication headers include application context
- Agents are aware of current application
- Database tracks per-app artifacts

See `/docs/multi-app-protocol.md` for complete protocol documentation.