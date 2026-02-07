# Quick Fixes for SD-UAT-CAMPAIGN-001 Friction Points

**Priority**: CRITICAL - Implement these 3 fixes to eliminate 40-80 minutes of wasted time per orchestrator

---

## Fix 1: Child SD Completeness (2 minutes to implement)

**File**: `scripts/leo-create-sd.js`
**Function**: `inheritStrategicFields()` (lines 438-463)

### The Problem
Empty arrays inherited from parent → default builders not triggered → 50% completeness

### The Fix
```javascript
// AFTER line 450, ADD this else clause:
if (parent.strategic_objectives && Array.isArray(parent.strategic_objectives) && parent.strategic_objectives.length > 0) {
  inherited.strategic_objectives = parent.strategic_objectives;
} else {
  // Explicitly set to null to trigger default generation in createSD()
  inherited.strategic_objectives = null;
}

// AFTER line 460, ADD this else clause:
if (parent.key_principles && Array.isArray(parent.key_principles) && parent.key_principles.length > 0) {
  inherited.key_principles = parent.key_principles;
} else {
  inherited.key_principles = null;
}
```

### Verification
```bash
# Test: Create child of orchestrator with empty arrays
node scripts/leo-create-sd.js --child SD-UAT-CAMPAIGN-001 9

# Check: Query completeness score
node -e "import {createDatabaseClient} from './lib/supabase-connection.js'; (async()=>{const c=await createDatabaseClient('engineer',{verify:false}); const r=await c.query('SELECT sd_id, completeness_score FROM strategic_directives_v2 WHERE sd_id LIKE \\'%UAT%\\' ORDER BY created_at DESC LIMIT 1'); console.log(r.rows); await c.end();})();"

# Expected: completeness_score >= 60
```

---

## Fix 2: Child Selector Status Filter (30 seconds to implement)

**File**: `scripts/modules/handoff/child-sd-selector.js`
**Line**: 48

### The Problem
Query includes 'planning', 'in_progress' as "ready" → selects mid-workflow SDs → LEAD-TO-PLAN fails

### The Fix
```javascript
// BEFORE (line 48)
.in('status', ['draft', 'in_progress', 'planning', 'active', 'pending_approval', 'review']);

// AFTER
.in('status', ['draft', 'active']);
```

### Verification
```bash
# Test: Set a child to 'planning' status manually
node -e "import {createClient} from '@supabase/supabase-js'; const s=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY); s.from('strategic_directives_v2').update({status:'planning'}).eq('id','<CHILD-ID>').then(()=>console.log('Set to planning'));"

# Run: Get next ready child
node -e "import {getNextReadyChild} from './scripts/modules/handoff/child-sd-selector.js'; import {createClient} from '@supabase/supabase-js'; (async()=>{const s=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY); const r=await getNextReadyChild(s,'SD-UAT-CAMPAIGN-001'); console.log('Next child:', r);})();"

# Expected: Next child should NOT be the one with status='planning'
```

---

## Fix 3: DOCMON Bypass Limit Increase (30 seconds - TEMPORARY)

**File**: `scripts/modules/handoff/cli/execution-helpers.js`
**Function**: `checkBypassRateLimits()` (approximate line 30)

### The Problem
3 bypasses per SD × legacy violations = campaign blocked

### The Temporary Fix
```javascript
// Find the line with: const MAX_BYPASSES = 3;
// CHANGE TO:
const MAX_BYPASSES = 10; // Temporary: increased for UAT campaign with pre-existing violations
```

### Better Fix (Later)
Implement git diff scoping in DOCMON (see full RCA document for details)

---

## Quick Cleanup: Reset Stuck Child SDs

If campaign already has children in wrong state:

```bash
# Reset all planning/in_progress children back to active
node -e "
import {createClient} from '@supabase/supabase-js';
(async () => {
  const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const {data: stuck} = await s
    .from('strategic_directives_v2')
    .select('id, sd_key, status, current_phase')
    .eq('parent_sd_id', 'SD-UAT-CAMPAIGN-001')
    .in('status', ['planning', 'in_progress']);

  console.log('Stuck children:', stuck);

  if (stuck && stuck.length > 0) {
    const {error} = await s
      .from('strategic_directives_v2')
      .update({status: 'active', current_phase: 'LEAD'})
      .in('id', stuck.map(s => s.id));

    if (error) {
      console.log('Error:', error.message);
    } else {
      console.log('Reset', stuck.length, 'children to active');
    }
  }
})();
"
```

---

## After Implementing All 3 Fixes

1. Test with NEW orchestrator:
   ```bash
   # Create test orchestrator
   node scripts/leo-create-sd.js LEO orchestrator "Test Auto-Chain"

   # Create 3 test children
   node scripts/leo-create-sd.js --child <ORCHESTRATOR-ID> 0
   node scripts/leo-create-sd.js --child <ORCHESTRATOR-ID> 1
   node scripts/leo-create-sd.js --child <ORCHESTRATOR-ID> 2

   # Run AUTO-PROCEED handoff
   node scripts/handoff.js execute LEAD-TO-PLAN <CHILD-1-ID> --auto-proceed
   ```

2. Verify:
   - [ ] All children created with completeness_score ≥ 60%
   - [ ] AUTO-PROCEED continues through all 3 children without pausing
   - [ ] No bypass flags needed
   - [ ] No manual status resets needed

3. If successful, apply to SD-UAT-CAMPAIGN-001:
   ```bash
   # Resume campaign from next ready child
   node scripts/handoff.js execute LEAD-TO-PLAN <NEXT-CHILD-ID> --auto-proceed
   ```

---

## Rollback Plan (If Fixes Cause Issues)

### Fix 1 Rollback
```bash
git checkout HEAD -- scripts/leo-create-sd.js
```

### Fix 2 Rollback
```bash
git checkout HEAD -- scripts/modules/handoff/child-sd-selector.js
```

### Fix 3 Rollback
```bash
# Change MAX_BYPASSES back to 3
git checkout HEAD -- scripts/modules/handoff/cli/execution-helpers.js
```

---

## Estimated Time

- **Implementation**: 5 minutes total
- **Testing**: 10 minutes
- **Campaign resume**: Immediate

**Total**: 15 minutes to eliminate 40-80 minutes of manual work per orchestrator
