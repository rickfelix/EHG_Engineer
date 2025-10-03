# Strategic Directive Creation Best Practices

**Date**: 2025-10-03
**Purpose**: Prevent null sd_key issues and ensure SD database integrity
**Root Cause**: SD-BACKEND-002C incident where sd_key was null

---

## 🚨 CRITICAL: Always Set sd_key

### The Problem

On 2025-10-03, SD-BACKEND-002C was created with:
- ✅ `id`: "SD-BACKEND-002C"
- ❌ `sd_key`: `null`

This caused:
- Completion scripts failed to find the SD (queried by sd_key)
- Dashboard showed incorrect status
- Progress tracking broken

### The Solution

**ALWAYS set `sd_key` when creating SDs:**

```javascript
// ❌ WRONG - sd_key will be null
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .insert({
    id: 'SD-XXX-001',
    title: 'My Strategic Directive',
    // ... other fields
  });

// ✅ CORRECT - sd_key explicitly set
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .insert({
    id: 'SD-XXX-001',
    sd_key: 'SD-XXX-001',  // ← MUST MATCH id
    title: 'My Strategic Directive',
    // ... other fields
  });
```

---

## 📋 SD Creation Checklist

When creating a new SD, ALWAYS include:

### Required Fields
- [ ] `id` - Unique identifier (e.g., "SD-BACKEND-003")
- [ ] `sd_key` - **MUST match `id`** (e.g., "SD-BACKEND-003")
- [ ] `title` - Descriptive title
- [ ] `status` - One of: draft, active, completed, cancelled, deferred
- [ ] `category` - Categorization (e.g., "backend", "frontend", "AI & Automation")
- [ ] `priority` - One of: critical, high, medium, low
- [ ] `target_application` - Usually "EHG" or "EHG_Engineer"
- [ ] `description` - Brief description
- [ ] `scope` - Detailed scope document
- [ ] `progress` - Initial progress (usually 0)
- [ ] `created_by` - Creator (e.g., "LEAD", "PLAN")

### Optional But Recommended
- [ ] `current_phase` - LEO phase (LEAD_REVIEW, PLAN_DESIGN, EXEC_IMPLEMENTATION, etc.)
- [ ] `metadata` - Additional context (dependencies, estimates, etc.)
- [ ] `dependencies` - Array of prerequisite SD IDs
- [ ] `sequence_rank` - Execution order

---

## 🔧 Completion Script Best Practices

### Query by 'id', Not 'sd_key'

```javascript
// ❌ WRONG - Fails if sd_key is null
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('sd_key', 'SD-XXX-001')  // ← Won't find if sd_key is null
  .single();

// ✅ CORRECT - Always works
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-XXX-001')  // ← Reliable primary key
  .single();
```

### Auto-Fix Null sd_key

```javascript
const sdKeyToUse = sd.sd_key || sd.id;

if (!sd.sd_key) {
  console.warn('⚠️  sd_key is null, fixing...');
}

await supabase
  .from('strategic_directives_v2')
  .update({
    sd_key: sdKeyToUse,  // Fix if null
    // ... other fields
  })
  .eq('id', sd.id);
```

### Set All Completion Fields

Don't just update `progress`. Update everything:

```javascript
const now = new Date().toISOString();

await supabase
  .from('strategic_directives_v2')
  .update({
    sd_key: sd.sd_key || sd.id,     // Fix null
    status: 'completed',             // Status
    progress: 100,                   // Progress
    current_phase: 'COMPLETED',      // Phase
    phase_progress: 100,             // Phase progress
    completion_date: now,            // When completed
    approval_date: now,              // When approved
    approved_by: 'LEAD',            // Who approved
    updated_at: now                  // Timestamp
  })
  .eq('id', SD_ID);
```

### Fail Loudly, Not Silently

```javascript
// ❌ WRONG - Fails silently
if (!sd) {
  console.log('SD not found');
  return;  // Silent failure
}

// ✅ CORRECT - Throws error
if (!sd) {
  throw new Error(`SD not found: ${SD_ID}`);
}
```

---

## 🛠️ Tools & Scripts

### 1. Fix Existing Null sd_keys
```bash
node scripts/fix-null-sd-keys.js
```

Finds all SDs with `sd_key = null` and sets `sd_key = id`.

### 2. Use Improved Template
```bash
cp scripts/complete-sd-template-improved.js scripts/complete-sd-xxx-001.js
# Edit SD_ID and SD_TITLE
node scripts/complete-sd-xxx-001.js
```

Includes all best practices and auto-fixes.

### 3. Verify SD Integrity
```bash
node -e "
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const { data } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key')
  .is('sd_key', null);

console.log('SDs with null sd_key:', data?.length || 0);
"
```

---

## 📊 Database Schema Improvements

### Current Schema
```sql
CREATE TABLE strategic_directives_v2 (
  id TEXT PRIMARY KEY,
  sd_key TEXT,  -- Can be NULL (problem!)
  ...
);
```

### Recommended Improvement
```sql
-- Add NOT NULL constraint
ALTER TABLE strategic_directives_v2
  ALTER COLUMN sd_key SET NOT NULL;

-- Add default value (id)
ALTER TABLE strategic_directives_v2
  ALTER COLUMN sd_key SET DEFAULT id;

-- Or use a trigger to auto-set
CREATE OR REPLACE FUNCTION set_sd_key()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sd_key IS NULL THEN
    NEW.sd_key := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_sd_key
  BEFORE INSERT OR UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION set_sd_key();
```

---

## ✅ Validation Checklist

Before committing SD creation code:

- [ ] `sd_key` is explicitly set to match `id`
- [ ] All required fields populated
- [ ] Query uses `id` field for lookups
- [ ] Error handling throws exceptions (not silent failures)
- [ ] Completion updates all status fields
- [ ] Tested with `node scripts/verify-sd-integrity.js`

---

## 📚 Related Documents

- **Root Cause Analysis**: See conversation history 2025-10-03
- **Improved Template**: `scripts/complete-sd-template-improved.js`
- **Fix Script**: `scripts/fix-null-sd-keys.js`
- **CLAUDE.md**: LEO Protocol guidelines

---

## 🎯 Summary

### The Golden Rules

1. **Always set `sd_key = id`** when creating SDs
2. **Query by `id`**, not `sd_key`, for reliability
3. **Auto-fix null `sd_key`** if encountered
4. **Update all fields** when completing SDs
5. **Fail loudly** with exceptions, not silent returns

### Prevention > Cure

Following these practices prevents the SD-BACKEND-002C issue from recurring.

---

**Last Updated**: 2025-10-03
**Maintained By**: LEAD Agent
**Status**: Active
