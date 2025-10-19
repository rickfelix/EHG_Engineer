# Handoff RLS Patterns - Decision Matrix & Implementation Guide

**Last Updated**: 2025-10-12
**Source**: Infrastructure Enhancement from SD-SETTINGS-2025-10-12

## Problem Statement

Scripts cannot read handoffs via Supabase client using `ANON_KEY` because:
- RLS policies on `sd_phase_handoffs` only allow SELECT for "authenticated" and "service_role" roles
- `ANON_KEY` maps to PostgreSQL "anon" role (public, unauthenticated)
- Result: Queries return 0 rows even though data exists

## Three Access Patterns

### Pattern 1: Direct PostgreSQL Connection (Write Operations)

**Use This For**:
- INSERT operations (creating handoffs)
- UPDATE operations (modifying handoffs)
- DELETE operations
- Any operation blocked by RLS policies

**How It Works**:
- Connects directly to PostgreSQL using connection string
- Bypasses Supabase client entirely
- Bypasses ALL RLS policies
- Uses database password authentication

**Implementation**:
```javascript
import { createDatabaseClient } from './scripts/lib/supabase-connection.js';

async function createHandoff(sdId, handoffData) {
  const client = await createDatabaseClient('engineer', {
    verify: true,
    verbose: true
  });

  try {
    const result = await client.query(`
      INSERT INTO sd_phase_handoffs (
        sd_id, from_phase, to_phase, handoff_type, status,
        executive_summary, deliverables_manifest, key_decisions,
        known_issues, resource_utilization, action_items,
        completeness_report
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id;
    `, [
      sdId,
      handoffData.from_phase,
      handoffData.to_phase,
      handoffData.handoff_type,
      'pending_acceptance',
      handoffData.executive_summary,
      handoffData.deliverables_manifest,
      handoffData.key_decisions,
      handoffData.known_issues,
      handoffData.resource_utilization,
      handoffData.action_items,
      handoffData.completeness_report
    ]);

    return result.rows[0].id;
  } finally {
    await client.end();
  }
}
```

**Pros**:
✅ Bypasses RLS reliably
✅ No additional API keys needed
✅ Works for all database operations

**Cons**:
❌ Requires database password
❌ More verbose than Supabase client
❌ Requires manual query building

---

### Pattern 2: Service Role Client (Read Operations)

**Use This For**:
- SELECT operations (reading handoffs, sub-agent results)
- Server-side operations requiring authenticated access
- Admin operations that need to bypass RLS

**How It Works**:
- Uses Supabase client with `SERVICE_ROLE_KEY`
- `SERVICE_ROLE_KEY` bypasses ALL RLS policies
- Provides full admin access

**Implementation**:
```javascript
import { createSupabaseServiceClient } from './scripts/lib/supabase-connection.js';

async function getHandoffs(sdId) {
  const supabase = await createSupabaseServiceClient('engineer', {
    verbose: true
  });

  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to read handoffs: ${error.message}`);
  }

  return data;
}
```

**Pros**:
✅ Clean Supabase client API
✅ TypeScript type inference
✅ Automatic query building
✅ Works with all Supabase features

**Cons**:
❌ Requires `SERVICE_ROLE_KEY` in .env
⚠️  SECURITY: Bypasses ALL RLS (must never expose to client)

**Security Best Practices**:
- NEVER commit `SERVICE_ROLE_KEY` to version control
- NEVER expose to client-side code
- Only use in server-side scripts
- Store in .env file only

---

### Pattern 3: Anon Client (Public Read Operations)

**Use This For**:
- Public read operations
- Client-side operations
- Operations that SHOULD respect RLS policies

**How It Works**:
- Uses Supabase client with `ANON_KEY`
- Subject to RLS policies
- Limited to what anon role can access

**Implementation**:
```javascript
import { createSupabaseAnonClient } from './scripts/lib/supabase-connection.js';

async function getPublicData() {
  const supabase = await createSupabaseAnonClient('engineer', {
    verbose: true
  });

  // Only works if RLS policy allows anon role to read this table
  const { data, error } = await supabase
    .from('public_data_table')
    .select('*');

  if (error) {
    throw new Error(`Failed to read public data: ${error.message}`);
  }

  return data;
}
```

**Pros**:
✅ Respects RLS policies (secure)
✅ Safe for client-side operations
✅ No special credentials needed

**Cons**:
❌ Limited by RLS policies
❌ Cannot read protected data (handoffs, etc.)

---

## Decision Matrix

| Operation Type | Pattern | Why |
|----------------|---------|-----|
| **Create handoff** | Pattern 1 (Direct) | RLS blocks INSERT with anon key |
| **Read handoffs in script** | Pattern 2 (Service Role) | Clean API, server-side only |
| **Update handoff status** | Pattern 1 (Direct) | RLS may block UPDATE |
| **Read public docs** | Pattern 3 (Anon) | Respects security, no credentials |
| **Admin operations** | Pattern 2 (Service Role) | Full access needed |
| **Client-side fetch** | Pattern 3 (Anon) | Must respect RLS |

---

## RLS Policy Reference

Current policies on `sd_phase_handoffs`:

```sql
-- Policy 1: Allow authenticated delete
CREATE POLICY "Allow authenticated delete sd_phase_handoffs"
ON sd_phase_handoffs FOR DELETE
TO authenticated
USING (true);

-- Policy 2: Allow authenticated insert
CREATE POLICY "Allow authenticated insert sd_phase_handoffs"
ON sd_phase_handoffs FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy 3: Allow authenticated read
CREATE POLICY "Allow authenticated read sd_phase_handoffs"
ON sd_phase_handoffs FOR SELECT
TO authenticated
USING (true);

-- Policy 4: Allow authenticated update
CREATE POLICY "Allow authenticated update sd_phase_handoffs"
ON sd_phase_handoffs FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy 5: Allow service role all
CREATE POLICY "Allow service role all sd_phase_handoffs"
ON sd_phase_handoffs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

**Key Insight**: No policy exists for "anon" role, which is why `ANON_KEY` cannot read handoffs.

---

## Environment Configuration

### Required Variables

```bash
# EHG_Engineer Database (Management Dashboard)
SUPABASE_URL=https://dedlbzhpgkmetvhbkyzq.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # ⚠️ NEVER commit to git
SUPABASE_DB_PASSWORD=your-database-password

# EHG Application Database (Customer-Facing App)
EHG_SUPABASE_URL=https://liapbndqlqxdcgpwntbv.supabase.co
EHG_SUPABASE_ANON_KEY=your-ehg-anon-key
EHG_SUPABASE_SERVICE_ROLE_KEY=your-ehg-service-role-key  # ⚠️ NEVER commit to git
```

### Getting Your Keys

1. **ANON_KEY**: Supabase Dashboard > Project Settings > API > `anon` key
2. **SERVICE_ROLE_KEY**: Supabase Dashboard > Project Settings > API > `service_role` key
   ⚠️ **WARNING**: This key bypasses ALL RLS policies
3. **DB_PASSWORD**: Supabase Dashboard > Project Settings > Database > Reset password

---

## Helper Functions Reference

All helper functions are in `scripts/lib/supabase-connection.js`:

### Direct PostgreSQL Connection
```javascript
// For write operations, bypasses RLS
const client = await createDatabaseClient('engineer', {
  verify: true,
  verbose: true
});
```

### Service Role Client
```javascript
// For read operations requiring authenticated access
const supabase = await createSupabaseServiceClient('engineer', {
  verbose: true
});
```

### Anon Client
```javascript
// For public read operations, respects RLS
const supabase = await createSupabaseAnonClient('engineer', {
  verbose: true
});
```

### Environment Key Getters
```javascript
// Get SERVICE_ROLE_KEY (throws if missing)
const serviceKey = getServiceRoleKey('engineer');

// Get ANON_KEY (throws if missing)
const anonKey = getAnonKey('engineer');

// Get Supabase URL (constructs if missing)
const url = getSupabaseUrl('engineer');
```

---

## Examples from Codebase

### Example 1: Creating Handoffs (Pattern 1)
See: `scripts/store-handoff-settings-accessibility.js`

```javascript
import { createDatabaseClient } from '../ehg/scripts/lib/supabase-connection.js';

const client = await createDatabaseClient('engineer', { verify: true });
await client.query(`
  INSERT INTO sd_phase_handoffs (...)
  VALUES (...)
`);
await client.end();
```

### Example 2: Reading Handoffs with Service Role (Pattern 2)
```javascript
import { createSupabaseServiceClient } from './scripts/lib/supabase-connection.js';

const supabase = await createSupabaseServiceClient('engineer');
const { data } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', 'SD-SETTINGS-2025-10-12');
```

### Example 3: Using Service Role Fallback (Pattern 2)
See: `scripts/create-lead-plan-handoff-service-role.mjs`

```javascript
import { createClient } from '@supabase/supabase-js';

// Fallback pattern: Try SERVICE_ROLE_KEY, fallback to ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
                   process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, serviceKey);
```

---

## Migration from Old Pattern

### Before (Using Anon Key - BROKEN)
```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ❌ Returns 0 rows due to RLS
const { data } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', sdId);
```

### After (Using Service Role - WORKS)
```javascript
import { createSupabaseServiceClient } from './scripts/lib/supabase-connection.js';

const supabase = await createSupabaseServiceClient('engineer');

// ✅ Returns all rows, bypasses RLS
const { data } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', sdId);
```

---

## Security Considerations

### SERVICE_ROLE_KEY Security
- **Bypasses ALL RLS policies** - Has full admin access
- **NEVER commit to git** - Add to .gitignore
- **NEVER expose to client** - Server-side scripts only
- **Rotate periodically** - Follow security best practices
- **Monitor usage** - Log service role operations

### Alternative: Fix RLS Policies (NOT RECOMMENDED)

**Option**: Add RLS policy for anon role
```sql
-- ❌ NOT RECOMMENDED - Makes handoffs publicly readable
CREATE POLICY "Allow anon read sd_phase_handoffs"
ON sd_phase_handoffs FOR SELECT
TO anon
USING (true);
```

**Why NOT Recommended**:
- Handoffs contain internal process details
- Security risk: Anyone with ANON_KEY can read all handoffs
- Better to use SERVICE_ROLE_KEY in server-side scripts

---

## Troubleshooting

### Issue: "SERVICE_ROLE_KEY not found"
**Solution**: Add `SUPABASE_SERVICE_ROLE_KEY` to `.env` file

### Issue: Still getting 0 rows with service role
**Check**:
1. Verify correct key used: `console.log(process.env.SUPABASE_SERVICE_ROLE_KEY)`
2. Check RLS is enabled: `SELECT relrowsecurity FROM pg_class WHERE relname = 'sd_phase_handoffs';`
3. Verify table exists: `SELECT COUNT(*) FROM sd_phase_handoffs WHERE sd_id = 'YOUR_SD_ID';`

### Issue: Error "Cannot find module '@supabase/supabase-js'"
**Solution**: Install dependency: `npm install @supabase/supabase-js`

---

## References

- Original issue: SD-SETTINGS-2025-10-12 (handoff read access blocked)
- Helper functions: `scripts/lib/supabase-connection.js`
- Environment template: `.env.example`
- LEO Protocol docs: `CLAUDE.md` (Handoff RLS Bypass Pattern section)
