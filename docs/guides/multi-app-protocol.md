# Multi-Application Management Protocol

## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, migration, schema, security

## LEO Protocol v3.1.5 Extension for Multi-App Support

### Version: 1.0.0
### Status: ACTIVE
### Last Updated: 2025-01-15

---

## Executive Summary

The Multi-Application Management Protocol extends LEO Protocol v3.1.5 to support managing multiple applications from a single EHG_Engineer platform. Each application maintains its own GitHub repository, Supabase database, and deployment pipeline while being orchestrated through unified Strategic Directives.

## Core Concepts

### 1. Application Context

Every LEO Protocol operation now operates within an **Application Context** that defines:
- Target application (APP-ID)
- Repository location
- Database connection
- Environment (dev/staging/prod)
- Current working branch

### 2. Naming Conventions

All artifacts now include application prefixes:

| Artifact | Single-App Format | Multi-App Format |
|----------|------------------|------------------|
| Strategic Directive | SD-2025-01-15-A | APP001-SD-2025-01-15-A |
| Epic Execution Sequence | EES-2025-01-15-A-01 | APP001-EES-2025-01-15-A-01 |
| HAP Block | HAP-2025-01-15-A-01-001 | APP001-HAP-2025-01-15-A-01-001 |
| Product Requirements | PRD-SD-2025-01-15-A | APP001-PRD-SD-2025-01-15-A |

### 3. Directory Structure

```
EHG_Engineer/
├── applications/
│   ├── registry.json                 # Master application registry
│   ├── APP001/
│   │   ├── config.json              # Application configuration
│   │   ├── codebase/                # Full git repository (gitignored)
│   │   ├── .env.encrypted           # Encrypted credentials
│   │   ├── directives/              # App-specific SDs
│   │   │   └── APP001-SD-*.md
│   │   ├── ees/                     # Epic Execution Sequences
│   │   ├── prds/                    # Product Requirements
│   │   └── .leo-sync/               # Sync status
│   └── APP002/
│       └── ...
├── database/
│   ├── schema/
│   │   ├── 001_initial_schema.sql   # Core LEO tables
│   │   └── 002_multi_app_schema.sql # Multi-app extensions
├── lib/
│   ├── security/
│   │   └── encryption.js            # Credential encryption
│   └── sync/
│       └── sync-manager.js          # GitHub/Supabase sync
└── scripts/
    ├── register-app.js              # Application registration
    ├── switch-context.js            # Context switching
    └── sync-*.js                    # Sync scripts
```

## Database Schema

### New Tables

1. **managed_applications** - Registry of all managed applications
2. **application_credentials** - Encrypted credential storage
3. **application_directives** - Links SDs to applications
4. **application_sync_history** - Sync operation logs
5. **application_context** - Context switching history

### Modified Tables

All core LEO tables now include `application_id`:
- strategic_directives_v2
- execution_sequences_v2
- hap_blocks_v2

## Workflows

### 1. Application Registration

```bash
npm run register-app
```

Interactive wizard that:
1. Generates unique APP-ID
2. Clones GitHub repository
3. Encrypts credentials
4. Creates configuration
5. Updates registry

### 2. Context Switching

```bash
npm run switch-context APP001
```

Sets the active application for all operations:
- Updates .leo-context file
- Modifies environment variables
- Records switch in database

### 3. Synchronization

#### GitHub Sync
```bash
npm run sync-github pull APP001  # Pull from GitHub
npm run sync-github push APP001  # Push to GitHub
```

#### Supabase Sync
```bash
npm run sync-supabase pull APP001  # Pull DB schema
npm run sync-supabase push APP001  # Push migrations
```

#### Full Sync
```bash
npm run sync-app APP001  # Full bi-directional sync
npm run sync-app all     # Sync all active apps
```

### 4. Strategic Directive Creation

```bash
npm run create-app-sd APP001
```

Creates SD with:
- Application context headers
- APP-ID prefix in naming
- Repository/database references
- Environment specifications

## Communication Standards

### Enhanced Header Format

All agent communications must include:

```markdown
**To:** [Recipient Agent]
**From:** [Sending Agent]
**Protocol:** LEO Protocol v3.1.5 (Multi-Application Framework)
**Application Context:** APP001 - Demo SaaS Platform
**Application Repository:** github.com/org/demo-saas
**Application Database:** demo-proj-123
**Strategic Directive:** APP001-SD-2025-01-15-A: Feature Implementation
**Strategic Directive Path:** `applications/APP001/directives/APP001-SD-2025-01-15-A.md`
```

### Agent Responsibilities

#### LEAD Agent
- Specify target application in all SDs
- Consider app-specific architecture
- Reference app documentation

#### PLAN Agent
- Validate against app capabilities
- Check app dependencies
- Create app-specific EES items

#### EXEC Agent
- Switch to correct repository
- Use app-specific credentials
- Follow app coding standards
- Create feature branches per app

#### HUMAN
- Maintain oversight across all apps
- Approve cross-app changes
- Manage credential access

## Security

### Credential Encryption

- Algorithm: AES-256-GCM
- Key derivation: PBKDF2 (100,000 iterations)
- Master key: Stored in `.leo-keys` (gitignored)
- Per-app encryption in `.env.encrypted`

### Access Control

- Credentials never stored in plain text
- Audit logging for all credential access
- Role-based permissions (future)
- Encrypted transmission only

## CLI Commands

### Core Commands

```bash
# Application Management
npm run register-app                    # Register new app
npm run list-apps                       # List all apps
npm run remove-app <APP-ID>            # Remove app

# Context Management  
npm run switch-context <APP-ID>        # Switch context
npm run show-context                   # Show current context

# Synchronization
npm run sync-github <pull|push> [APP]  # GitHub sync
npm run sync-supabase <pull|push> [APP] # Supabase sync
npm run sync-app [APP|all]             # Full sync

# Credentials
npm run encrypt-credentials <APP-ID>   # Encrypt credentials
npm run validate-credentials <APP-ID>  # Test connections

# Development
npm run create-app-sd <APP-ID>        # Create SD
npm run deploy-sd <SD-ID>             # Deploy SD
```

## Best Practices

### 1. Always Set Context
Before any operation, ensure correct context:
```bash
npm run switch-context APP001
```

### 2. Regular Synchronization
Sync before starting work:
```bash
npm run sync-app APP001
```

### 3. Branch Strategy
Use SD-specific branches:
```
feature/APP001-SD-2025-01-15-A
```

### 4. Commit Messages
Include app context:
```
feat(APP001): implement user authentication
```

### 5. PR Descriptions
Reference SD and APP:
```markdown
## APP001 - Strategic Directive Implementation
SD: APP001-SD-2025-01-15-A
```

## Monitoring

### Sync Status
Check sync history:
```sql
SELECT * FROM application_sync_history 
WHERE application_id = 'APP001'
ORDER BY started_at DESC;
```

### Active Contexts
Monitor context switches:
```sql
SELECT * FROM application_context
ORDER BY switched_at DESC;
```

### Deployment Status
Track SD deployments:
```sql
SELECT * FROM application_directives
WHERE application_id = 'APP001';
```

## Troubleshooting

### Common Issues

#### Issue: Context not switching
**Solution:**
```bash
# Manually set context
echo "APP001" > .leo-context
# Verify
npm run show-context
```

#### Issue: Sync fails
**Solution:**
```bash
# Check GitHub auth
gh auth status
# Re-authenticate if needed
gh auth login
```

#### Issue: Credentials not working
**Solution:**
```bash
# Re-encrypt credentials
npm run encrypt-credentials APP001
# Validate
npm run validate-credentials APP001
```

#### Issue: Can't find application
**Solution:**
```bash
# List all apps
npm run list-apps
# Check registry
cat applications/registry.json
```

## Migration Guide

### From Single-App to Multi-App

1. **Install multi-app schema:**
   ```sql
   -- Run in Supabase dashboard
   -- Contents of database/schema/002_multi_app_schema.sql
   ```

2. **Register existing app:**
   ```bash
   npm run register-app
   # Use "APP001" as ID
   ```

3. **Update existing SDs:**
   - Add APP-ID prefix
   - Update paths
   - Add application context

4. **Test synchronization:**
   ```bash
   npm run sync-app APP001
   ```

## Future Enhancements

### Planned Features

1. **MCP Integration**
   - Supabase MCP for database operations
   - Vercel MCP for deployments
   - Custom MCP servers

2. **Automated Deployments**
   - CI/CD pipeline integration
   - Automatic PR creation
   - Deployment tracking

3. **Cross-App Operations**
   - Shared component libraries
   - Cross-app Strategic Directives
   - Unified reporting

4. **Enhanced Security**
   - Hardware key support
   - Multi-factor authentication
   - Audit compliance reports

## Compliance

This protocol maintains full compliance with:
- LEO Protocol v3.1.5
- Strategic Directive naming standards
- Epic Execution Sequence requirements
- Agent communication protocols

All multi-app extensions are backward compatible with single-app operations.

---

**Document Version**: 1.0.0  
**LEO Protocol**: v3.1.5  
**Status**: Production Ready  
**Support**: See `/docs/README.md` for assistance