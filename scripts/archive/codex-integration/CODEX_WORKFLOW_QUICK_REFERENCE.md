# OpenAI Codex Integration - Quick Reference

## Current Test Status
- **SD Created**: SD-TEST-CODEX-1758340937843 ✅
- **PRD Created**: PRD-CODEX-TEST-1758341001565 ✅
- **Prompt Generated**: CODEX-1758341064216 ✅
- **Awaiting**: Human to copy prompt to OpenAI Codex ⏳

## Complete Workflow Commands

### Step 1: LEAD Creates Strategic Directive ✅
```bash
node scripts/create-test-sd-for-codex.js
# Output: SD-TEST-CODEX-1758340937843
```

### Step 2: PLAN Creates PRD from SD ✅
```bash
node scripts/create-prd-from-test-sd.js SD-TEST-CODEX-1758340937843
# Output: PRD-CODEX-TEST-1758341001565
```

### Step 3: Generate Codex Prompt ✅
```bash
node scripts/generate-codex-prompt.js PRD-CODEX-TEST-1758341001565
# Output: Prompt copied to clipboard
```

### Step 4: Human Copies to OpenAI Codex ⏳
**Manual Action Required**:
1. Open OpenAI Codex terminal/interface
2. Paste the generated prompt
3. Let Codex generate artifacts to `/tmp/codex-artifacts/`

### Step 5: Process Codex Artifacts
```bash
# Option A: Monitor for artifacts (auto-detects)
node scripts/monitor-codex-artifacts.js

# Option B: Manual processing when ready
node scripts/process-codex-artifacts.js PRD-CODEX-TEST-1758341001565

# Option C: Validate first, then process
node scripts/validate-codex-output.js
node scripts/process-codex-artifacts.js PRD-CODEX-TEST-1758341001565 --apply
```

## Expected Codex Output

Codex should create these files in `/tmp/codex-artifacts/`:
```
manifest-{timestamp}.json       # Links to PRD
changes-{timestamp}.patch       # Git diff for timestamp utility
sbom-{timestamp}.cdx.json      # Software BOM
attestation-{timestamp}.intoto  # Provenance attestation
```

## The Prompt (for reference)

The generated prompt asks Codex to:
1. Create `src/utils/timestamp.js` with 4 functions:
   - `getTimestamp()` - ISO 8601 format
   - `formatTimestamp(date, format)` - Custom formats
   - `getTimestampWithTimezone(timezone)` - Timezone support
   - `parseTimestamp(string)` - Parse timestamps

2. Generate artifacts following SLSA Level 3 requirements

## Verification Commands

```bash
# Check if artifacts exist
ls -la /tmp/codex-artifacts/

# Validate latest artifacts
node scripts/validate-codex-output.js

# Check PRD status in database
node scripts/query-active-sds.js
```

## Troubleshooting

If artifacts don't appear:
1. Check Codex saved to `/tmp/codex-artifacts/`
2. Ensure manifest includes `prd_id: "PRD-CODEX-TEST-1758341001565"`
3. Verify handoff_id matches: `CODEX-1758341064216`

If validation fails:
1. Check patch format is valid git diff
2. Ensure SBOM follows CycloneDX 1.5
3. Verify attestation is in-toto v1.0 format

## Database Connection

Both agents use:
```javascript
const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
```

## Current Working Directory
`/mnt/c/_EHG/EHG_Engineer`