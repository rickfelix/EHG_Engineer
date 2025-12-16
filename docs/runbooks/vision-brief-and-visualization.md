# Vision Brief & Visualization Runbook

**Version:** 1.0.0
**Last Updated:** 2025-12-14
**Owner:** EHG_Engineering Governance

---

## Overview

This runbook covers the operational workflow for generating vision briefs and visualizations as part of the SD governance pipeline.

**Components:**
- `generate-vision-brief.js` - Creates persona-driven vision discovery metadata
- `approve-vision-brief.js` - Approves/rejects vision briefs
- `generate-vision-visualization.js` - Creates UI mock images from approved briefs
- `governance-preflight.js` - Verifies system readiness

---

## Prerequisites

### Required Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...              # Vision brief generation + visualization fallback
SUPABASE_SERVICE_ROLE_KEY=...      # Database writes + storage access

# Database (one set required)
EHG_SUPABASE_URL=https://...       # EHG consolidated database
EHG_SUPABASE_SERVICE_ROLE_KEY=...  # Service role for EHG

# Or alternative:
NEXT_PUBLIC_SUPABASE_URL=...       # Default Supabase URL
SUPABASE_SERVICE_ROLE_KEY=...      # Default service key
```

### Recommended Environment Variables

```bash
GEMINI_API_KEY=...                 # Visualization primary provider (lower cost)
```

### Preflight Check

Always run before operations:

```bash
node scripts/governance-preflight.js
```

---

## Happy Path: Full Workflow

### Step 1: Generate Vision Brief (Draft)

Preview what will be generated:
```bash
node scripts/generate-vision-brief.js SD-FEATURE-001
```

Generate and save to database:
```bash
node scripts/generate-vision-brief.js SD-FEATURE-001 --confirm
```

**Output location:** `sd.metadata.vision_discovery` in `strategic_directives_v2`

### Step 2: Approve Vision Brief

Review and approve:
```bash
node scripts/approve-vision-brief.js SD-FEATURE-001
```

To reject with reason:
```bash
node scripts/approve-vision-brief.js SD-FEATURE-001 --reject "Personas missing Chairman perspective"
```

### Step 3: Generate Visualization

Preview (dry-run):
```bash
node scripts/generate-vision-visualization.js SD-FEATURE-001 --dry-run
```

Generate and upload:
```bash
node scripts/generate-vision-visualization.js SD-FEATURE-001 --confirm
```

Force specific provider:
```bash
node scripts/generate-vision-visualization.js SD-FEATURE-001 --confirm --provider gemini
node scripts/generate-vision-visualization.js SD-FEATURE-001 --confirm --provider openai
```

**Output location:**
- Image: Supabase Storage `vision-briefs/sd/<SD-ID>/vision/<timestamp>.png`
- Metadata: `sd.metadata.vision_discovery.visualization`

---

## Feature Flags

### PERSONA_SOFT_GATE_ENABLED

| Value | Behavior |
|-------|----------|
| `false` (default) | PRD creation proceeds even without approved vision brief |
| `true` | PRD creation blocks until vision brief is approved |

**To enable strict gating:**
```bash
export PERSONA_SOFT_GATE_ENABLED=true
```

**To bypass when enabled:**
```bash
node scripts/add-prd-to-database.js <SD-ID> --skip-vision-brief
```

### Visualization Provider Selection

| GEMINI_API_KEY | OPENAI_API_KEY | Provider Used |
|----------------|----------------|---------------|
| Set | Set | Gemini (primary) |
| Set | Not set | Gemini only |
| Not set | Set | OpenAI fallback |
| Not set | Not set | **Error** |

---

## Common Failure Modes & Fixes

### 1. Missing GEMINI_API_KEY (OpenAI Fallback)

**Symptom:**
```
⚠️  Gemini not configured (GEMINI_API_KEY missing)
→ Will use OpenAI as fallback
```

**Impact:** Higher cost per visualization (~$0.04 vs ~$0.01)

**Fix:**
```bash
# Add to .env
GEMINI_API_KEY=your-gemini-api-key
```

### 2. Vision Brief JSON Parse Failure

**Symptom:**
```
ERROR: Failed to parse AI response as JSON
```

**Impact:** Vision brief not saved; retry needed

**Causes:**
- AI returned malformed JSON
- Response truncated due to token limits

**Fixes:**
1. Retry (usually succeeds on second attempt):
   ```bash
   node scripts/generate-vision-brief.js SD-XXX --confirm
   ```

2. Use `--force` to overwrite corrupted data:
   ```bash
   node scripts/generate-vision-brief.js SD-XXX --confirm --force
   ```

### 3. Storage Bucket Does Not Exist

**Symptom:**
```
Creating storage bucket: vision-briefs
Failed to create bucket: permission denied
```

**Impact:** Visualization upload fails

**Fixes:**
1. Ensure service role key has storage admin permissions
2. Manually create bucket in Supabase Dashboard:
   - Go to Storage → Create Bucket
   - Name: `vision-briefs`
   - Public: Yes
   - File size limit: 10MB

### 4. Visualization Gate (Unapproved Brief)

**Symptom:**
```
ERROR: Vision brief is not approved.
Current status: draft
```

**Fixes:**
1. Approve the brief first:
   ```bash
   node scripts/approve-vision-brief.js SD-XXX
   ```

2. Override (not recommended for production):
   ```bash
   node scripts/generate-vision-visualization.js SD-XXX --confirm --allow-draft
   ```

### 5. SD Not Found

**Symptom:**
```
ERROR: SD not found: SD-XXX
```

**Fixes:**
- Verify SD ID exists in database
- Check for typos (IDs are case-sensitive)
- Ensure using correct database connection

---

## Safe Rollback Procedures

### Rollback Vision Brief

Remove vision discovery from SD metadata:

```sql
UPDATE strategic_directives_v2
SET metadata = metadata - 'vision_discovery'
WHERE id = 'SD-XXX';
```

Or via script (if available):
```bash
node -e "
const { createSupabaseServiceClient } = require('./scripts/lib/supabase-connection.js');
createSupabaseServiceClient('engineer').then(async c => {
  const { data: sd } = await c.from('strategic_directives_v2').select('metadata').eq('id', 'SD-XXX').single();
  if (sd) {
    const metadata = { ...sd.metadata };
    delete metadata.vision_discovery;
    await c.from('strategic_directives_v2').update({ metadata }).eq('id', 'SD-XXX');
    console.log('Vision discovery removed');
  }
});
"
```

### Rollback Visualization Only

Remove visualization but keep vision brief:

```sql
UPDATE strategic_directives_v2
SET metadata = jsonb_set(
  metadata,
  '{vision_discovery}',
  (metadata->'vision_discovery') - 'visualization'
)
WHERE id = 'SD-XXX';
```

### Rollback Feature (Full Git Revert)

If the entire feature needs to be rolled back:

```bash
# Find the merge commit
git log --oneline --grep="vision" | head -5

# Revert (creates new commit, safe)
git revert <merge-commit-sha>
```

### Disable Soft Gate Immediately

```bash
# In current session
unset PERSONA_SOFT_GATE_ENABLED

# Or explicitly disable
export PERSONA_SOFT_GATE_ENABLED=false
```

---

## Monitoring & Verification

### Check Vision Brief Status

```bash
node -e "
const { createSupabaseServiceClient } = require('./scripts/lib/supabase-connection.js');
createSupabaseServiceClient('engineer').then(async c => {
  const { data } = await c.from('strategic_directives_v2')
    .select('id, title, metadata')
    .eq('id', 'SD-XXX')
    .single();
  const vd = data?.metadata?.vision_discovery;
  console.log('Vision Discovery:', vd ? 'Present' : 'Missing');
  if (vd) {
    console.log('  Approval:', vd.approval?.status || 'N/A');
    console.log('  Personas:', vd.stakeholder_personas?.length || 0);
    console.log('  Visualization:', vd.visualization?.url ? 'Yes' : 'No');
  }
});
"
```

### List All SDs with Vision Briefs

```sql
SELECT id, title,
       metadata->'vision_discovery'->'approval'->>'status' as approval_status,
       metadata->'vision_discovery'->'visualization'->>'url' as viz_url
FROM strategic_directives_v2
WHERE metadata->'vision_discovery' IS NOT NULL;
```

---

## Related Documentation

- [Vision Discovery Merge Summary](../merge-summaries/vision-discovery-visualization.md)
- [Visualization Provider](../../scripts/lib/visualization-provider.js)
- [CLAUDE.md - LEO Protocol](../../CLAUDE.md)
