# Handoff Resilience Guide

## 🎯 Purpose
Prevent handoff failures due to database schema mismatches. This guide provides fallback strategies when handoff tables are missing or have incompatible schemas.

## 🔍 Pre-Session Validation

### Run Before Starting Any SD
```bash
# Validate LEO Protocol database schema
node scripts/validate-leo-schema.js
```

**Expected Output:**
- ✅ Green checkmarks = All tables ready
- ❌ Red warnings = Use fallback methods

## 📋 Handoff Creation Strategy

### Step 1: Check Database Schema
```bash
node scripts/check-handoff-tables-new.mjs
```

This returns which table to use:
- `handoff_tracking` - **PREFERRED** (full 7-element structure)
- `leo_sub_agent_handoffs` - Legacy (requires adapted schema)
- `null` - No tables available (use git fallback)

### Step 2: Create Handoff with Fallback

#### Option A: handoff_tracking exists (Standard)
```javascript
const handoffData = {
  sd_id: sd.id,
  from_agent: 'EXEC',
  to_agent: 'PLAN',
  handoff_type: 'implementation_to_verification',
  status: 'completed',

  // 7 mandatory elements
  executive_summary: '...',
  deliverables_manifest: '...',
  key_decisions: '...',
  known_issues: '...',
  resource_utilization: '...',
  action_items: '...',
  metadata: { /* JSONB */ }
};

const { data, error } = await supabase
  .from('handoff_tracking')
  .insert(handoffData)
  .select()
  .single();
```

#### Option B: leo_sub_agent_handoffs exists (Legacy)
```javascript
const handoffData = {
  sub_agent_id: subAgentId, // Get from leo_sub_agents
  sd_id: sd.id,
  handoff_data: JSON.stringify({
    from: 'EXEC',
    to: 'PLAN',
    type: 'implementation_to_verification',
    // 7 elements as JSONB
    executive_summary: '...',
    deliverables_manifest: '...',
    key_decisions: '...',
    known_issues: '...',
    resource_utilization: '...',
    action_items: '...'
  }),
  created_at: new Date().toISOString()
};

const { data, error } = await supabase
  .from('leo_sub_agent_handoffs')
  .insert(handoffData)
  .select()
  .single();
```

#### Option C: No Database Tables (Git Fallback)
```bash
git commit -m "handoff(EXEC→PLAN): SD-041A Knowledge Base Integration

HANDOFF: EXEC → PLAN
SD: SD-041A
Date: $(date -Iseconds)

## 1. Executive Summary
...

## 2. Deliverables Manifest
...

## 3. Key Decisions & Rationale
...

## 4. Known Issues & Risks
...

## 5. Resource Utilization
...

## 6. Action Items for PLAN
...

## 7. Metadata
Branch: $(git branch --show-current)
Commit: $(git rev-parse HEAD)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Step 3: Reference in Subsequent Work
```javascript
// If using git fallback, reference commit in SD updates
const { data } = await supabase
  .from('strategic_directives_v2')
  .update({
    metadata: {
      ...existingMetadata,
      exec_plan_handoff_commit: commitSha
    }
  })
  .eq('sd_key', 'SD-041A');
```

## 🐛 Common Issues & Solutions

### Issue 1: `Could not find the table 'handoff_tracking'`

**Root Cause**: Table doesn't exist in database

**Solutions**:
1. **Create table** (if you have permissions):
   ```bash
   node scripts/create-handoff-tracking-tables.js
   ```

2. **Use legacy table** (check first):
   ```bash
   node scripts/check-handoff-tables-new.mjs
   ```

3. **Use git fallback** (always works):
   - Include full handoff in git commit message
   - Reference commit SHA in SD metadata

### Issue 2: `Could not find the 'action_items' column`

**Root Cause**: Table has different schema than expected

**Solutions**:
1. **Check actual schema**:
   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'handoff_tracking';
   ```

2. **Adapt to available columns**:
   - Store extra fields in `metadata` JSONB column
   - Use `handoff_data` JSONB column if available

3. **Use git fallback** if schema too different

### Issue 3: `Failed to get SD: Not found`

**Root Cause**: SD exists in docs but not in database

**Solutions**:
1. **Check SD key variations**:
   ```bash
   node scripts/list-all-sds.js | grep -i "knowledge"
   ```

2. **Create SD in database**:
   ```bash
   node scripts/create-sd-in-database.js \
     --sd-key SD-041A \
     --title "Knowledge Base Service Integration" \
     --status in_progress
   ```

3. **Use git commit with SD key in message** (fallback)

## 📊 Validation Checklist

Before creating handoffs, verify:

- [ ] Run `node scripts/validate-leo-schema.js`
- [ ] Check `handoff_tracking` table exists
- [ ] Verify SD exists in `strategic_directives_v2`
- [ ] Confirm you have write permissions
- [ ] Know fallback method if primary fails

## 🔄 Recovery from Failed Handoffs

If handoff creation fails mid-execution:

1. **Document handoff content** - Save to temp file or clipboard
2. **Check database state** - Run validation script
3. **Use fallback immediately** - Don't block progress
4. **Report issue** - Create ticket to fix root cause
5. **Continue workflow** - LEO Protocol can proceed with git handoffs

## 📈 Monitoring & Metrics

Track handoff success rate:
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_handoffs,
  COUNT(*) FILTER (WHERE status = 'completed') as successful
FROM handoff_tracking
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

Low success rate? Check:
- Database schema changes
- Missing tables after migrations
- Permission issues
- Network connectivity

## 🚀 Future Improvements

1. **Schema migration system** - Auto-update handoff tables
2. **Graceful degradation** - Auto-switch to fallback
3. **Validation on startup** - Pre-flight checks in scripts
4. **Better error messages** - Include fix instructions
5. **Multi-backend support** - Git, DB, file system

---

**Last Updated**: 2025-10-03
**Version**: 1.0.0 (Handoff Resilience)
**Related Scripts**: `validate-leo-schema.js`, `check-handoff-tables-new.mjs`
