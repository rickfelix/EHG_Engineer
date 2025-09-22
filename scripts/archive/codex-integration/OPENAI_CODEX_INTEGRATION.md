# OpenAI Codex Integration with LEO Protocol

## Overview

This document describes the Level 1 manual integration between OpenAI Codex (read-only builder) and Anthropic Claude (write-enabled enforcer) using a database-driven workflow.

## Architecture

```
LEAD (Claude) → Strategic Directive → Database
      ↓
PLAN (Claude) → PRD → Database
      ↓
[Generate Prompt Script] → Manual Copy → OpenAI Codex
      ↓
Codex → Artifacts → /tmp/codex-artifacts/
      ↓
[Process Script] → Claude Applies Patches
      ↓
Database Updated with Results
```

## Prerequisites

1. **Database Access**: Both agents need read access to Supabase
   - URL: `https://dedlbzhpgkmetvhbkyzq.supabase.co`
   - Anon Key: Available in `.env` file

2. **Two Terminal Windows**:
   - Terminal 1: Anthropic Claude (this environment)
   - Terminal 2: OpenAI Codex (separate environment)

3. **Shared Directory**: `/tmp/codex-artifacts/`
   - Used for artifact exchange between agents

## Workflow Steps

### Step 1: PLAN Creates PRD

When PLAN completes a Product Requirements Document:
- PRD is saved to database (`product_requirements_v2` table)
- Status set to `approved` or `planning`
- Ready for Codex implementation

### Step 2: Generate Codex Prompt

In Claude terminal, run:
```bash
# List available PRDs
node scripts/generate-codex-prompt.js

# Generate prompt for specific PRD
node scripts/generate-codex-prompt.js PRD-2025-001
```

This will:
- Query PRD from database
- Extract requirements and test scenarios
- Generate formatted prompt
- Copy to clipboard (macOS/Linux)
- Display prompt for manual copy

### Step 3: Execute in OpenAI Codex

In Codex terminal:
1. Paste the generated prompt
2. Codex will:
   - Query database for full PRD details
   - Analyze codebase (read-only)
   - Generate unified diff patches
   - Create SBOM (CycloneDX 1.5)
   - Create attestation (in-toto v1.0)
   - Save artifacts to `/tmp/codex-artifacts/`

Expected artifacts:
```
/tmp/codex-artifacts/
├── manifest-{timestamp}.json      # Links to PRD
├── changes-{timestamp}.patch      # Unified diff
├── sbom-{timestamp}.cdx.json     # Software BOM
└── attestation-{timestamp}.intoto # Provenance
```

### Step 4: Validate Artifacts (Optional)

In Claude terminal, validate Codex output:
```bash
# Validate latest artifacts
node scripts/validate-codex-output.js

# Validate specific manifest
node scripts/validate-codex-output.js manifest-1234567890.json
```

This checks:
- Manifest structure and PRD reference
- Patch format and applicability
- SBOM compliance (CycloneDX)
- Attestation format (in-toto)
- Security constraints
- LEO Protocol compliance

### Step 5: Process Artifacts

In Claude terminal, apply patches:
```bash
# Dry run first (recommended)
node scripts/process-codex-artifacts.js PRD-2025-001 --dry-run

# Apply patches
node scripts/process-codex-artifacts.js PRD-2025-001 --apply

# List available artifacts
node scripts/process-codex-artifacts.js --list
```

This will:
- Find artifacts for the PRD
- Validate all components
- Test patch application
- Apply patches to codebase
- Update database status
- Move artifacts to `processed/` directory

## Database Schema

### codex_handoffs Table
Tracks handoffs between OpenAI Codex and Claude:
- `id`: Unique handoff identifier
- `prd_id`: Reference to PRD
- `status`: Current state (pending → processed)
- `artifacts`: JSON with file references
- `audit_log`: Complete activity trail

### product_requirements_v2 Extensions
Added columns for Codex integration:
- `codex_status`: pending/processing/completed/error
- `codex_handoff_id`: Reference to handoff
- `codex_artifacts`: JSON with artifact metadata
- `codex_completed_at`: Completion timestamp

## Setup Instructions

### First Time Setup

1. **Install dependencies**:
```bash
npm install chalk
```

2. **Create database tables**:
```bash
# Check what needs to be created
node scripts/setup-codex-handoffs.js

# After running migration in Supabase dashboard, verify
node scripts/setup-codex-handoffs.js --verify

# Create sample PRD for testing
node scripts/setup-codex-handoffs.js --sample
```

3. **Configure OpenAI Codex**:
Provide Codex with database credentials:
```javascript
const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' // anon key
);
```

## Example Complete Workflow

```bash
# 1. In Claude terminal - generate prompt
node scripts/generate-codex-prompt.js PRD-2025-001
# Output: Formatted prompt copied to clipboard

# 2. In Codex terminal - paste prompt and let it work
# Codex generates artifacts to /tmp/codex-artifacts/

# 3. In Claude terminal - validate artifacts
node scripts/validate-codex-output.js
# Output: Validation results

# 4. In Claude terminal - apply patches
node scripts/process-codex-artifacts.js PRD-2025-001 --apply
# Output: Patches applied, database updated
```

## Security Considerations

1. **Read-Only Codex**: Codex cannot modify files directly, only generate patches
2. **Anon Key Only**: Codex gets read-only database access via anon key
3. **Validation Layer**: All artifacts validated before application
4. **Audit Trail**: Complete tracking in database
5. **Dry Run Default**: Patches tested before real application

## Troubleshooting

### Common Issues

1. **"No artifacts found for PRD"**
   - Ensure Codex saved files to `/tmp/codex-artifacts/`
   - Check manifest includes `prd_id` field

2. **"Patch does not apply cleanly"**
   - Codex may be working with different code version
   - Try `git stash` to clean working directory

3. **"Database table not found"**
   - Run migration via Supabase dashboard
   - Verify with `node scripts/setup-codex-handoffs.js --verify`

4. **"Cannot copy to clipboard"**
   - Linux: Install `xclip` package
   - Manual: Copy prompt from terminal output

## Benefits of This Approach

1. **True Dual-Agent**: Real separation between OpenAI and Anthropic
2. **Database-Driven**: Single source of truth for requirements
3. **Security Boundaries**: Codex read-only, Claude write-enabled
4. **Audit Compliance**: Full tracking for SOC2/SLSA
5. **Minimal Manual Work**: Just copy/paste one prompt

## Next Steps (Future Automation)

### Level 2: Clipboard Automation
- Auto-copy prompt to clipboard
- Reduce to single paste operation

### Level 3: File Watching
- Monitor `/tmp/codex-artifacts/` for new files
- Auto-trigger processing when artifacts appear

### Level 4: API Integration
- Direct API calls to OpenAI
- Eliminate manual copy/paste

### Level 5: Full Automation
- Webhook triggers from PRD creation
- Automatic Codex execution
- Auto-apply patches after validation

## Conclusion

This Level 1 integration provides a working dual-agent system with minimal manual intervention. The database-driven approach ensures consistency and provides complete audit trails while maintaining security boundaries between the read-only builder (Codex) and write-enabled enforcer (Claude).