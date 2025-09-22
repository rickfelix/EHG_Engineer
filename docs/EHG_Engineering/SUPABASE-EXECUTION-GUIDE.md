# Supabase SQL Editor Execution Guide

## How to Run User Story Migration in Supabase

### Prerequisites
- Access to Supabase Dashboard: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq
- Service role key (for API calls)

### Step 1: Apply Compatibility Migration

1. Go to **SQL Editor** in Supabase Dashboard
2. Create new query
3. Paste entire contents of: `database/migrations/2025-01-17-user-stories-compat.sql`
4. Click **Run**
5. Verify output shows:
   ```
   check_name              | status | details
   Story columns           | PASS   | Found 11 of 11 expected columns
   Unique constraint       | PASS   | sd_backlog_map_unique_sd_backlog exists
   Views created          | PASS   | Found 4 of 4 expected views
   Generation function    | PASS   | fn_generate_stories_from_prd exists
   ```

### Step 2: Apply Seed Data

1. In same SQL Editor, create new query
2. Paste entire contents of: `database/migrations/seed-test-data.sql`
3. Click **Run**
4. Verify output shows:
   ```
   status          | prd_id      | sd_id          | title                                      | criteria_count
   Test PRD Created| PRD-EMB-001 | SD-2025-09-EMB | Backlog Import and Story Management System| 8
   ```

### Step 3: Test Story Generation (Dry Run)

```sql
-- Preview what will be created
SELECT * FROM fn_generate_stories_from_prd(
    'SD-2025-09-EMB',
    'PRD-EMB-001',
    'dry_run'
);
```

Expected output:
```json
{
  "status": "preview",
  "mode": "dry_run",
  "sd_key": "SD-2025-09-EMB",
  "sd_id": "SD-2025-09-EMB",
  "prd_id": "PRD-EMB-001",
  "total_criteria": 8,
  "stories_generated": 8,
  "stories_created": 0,
  "stories": [...]
}
```

### Step 4: Create Stories (Upsert)

```sql
-- Actually create the stories
SELECT * FROM fn_generate_stories_from_prd(
    'SD-2025-09-EMB',
    'PRD-EMB-001',
    'upsert'
);
```

Expected output:
```json
{
  "status": "success",
  "mode": "upsert",
  "sd_key": "SD-2025-09-EMB",
  "sd_id": "SD-2025-09-EMB",
  "prd_id": "PRD-EMB-001",
  "total_criteria": 8,
  "stories_generated": 8,
  "stories_created": 8,
  "stories": [...]
}
```

### Step 5: Verification Queries

```sql
-- 1. View generated stories
SELECT
    story_key,
    story_title,
    sequence_no,
    status,
    priority
FROM v_story_verification_status
WHERE sd_key = 'SD-2025-09-EMB'
ORDER BY sequence_no;

-- 2. Check release gate
SELECT * FROM v_sd_release_gate
WHERE sd_key = 'SD-2025-09-EMB';

-- 3. Check for duplicates (should return 0 rows)
SELECT sd_id, COUNT(*) c, COUNT(DISTINCT backlog_id) d
FROM sd_backlog_map
WHERE sd_id = 'SD-2025-09-EMB'
GROUP BY sd_id
HAVING COUNT(*) <> COUNT(DISTINCT backlog_id);

-- 4. Simulate test verification (optional)
UPDATE sd_backlog_map
SET
    verification_status = 'passing',
    last_verified_at = NOW(),
    coverage_pct = 85,
    verification_source = '{"test_run": "manual", "build": "staging-001"}'::jsonb
WHERE sd_id = 'SD-2025-09-EMB'
AND story_key IS NOT NULL
AND sequence_no <= 3;

-- 5. Check gate again after verification
SELECT * FROM v_sd_release_gate
WHERE sd_key = 'SD-2025-09-EMB';
```

### API Testing

Once migration is complete, test via API:

```bash
# Test with feature flag enabled
export FEATURE_AUTO_STORIES=true

# Dry run
curl -X POST http://localhost:3000/api/stories/generate \
  -H "Content-Type: application/json" \
  -d '{"sd_key":"SD-2025-09-EMB","prd_id":"PRD-EMB-001","mode":"dry_run"}'

# Or using SD ID directly
curl -X POST http://localhost:3000/api/stories/generate \
  -H "Content-Type: application/json" \
  -d '{"sd_id":"SD-2025-09-EMB","prd_id":"PRD-EMB-001","mode":"dry_run"}'

# List stories
curl "http://localhost:3000/api/stories?sd_key=SD-2025-09-EMB"
```

### Troubleshooting

**If migration fails:**
- Check for existing columns/constraints (migration is idempotent)
- Verify you're using service_role key for function execution
- Check RLS is not blocking operations

**If story generation fails:**
- Verify PRD has acceptance_criteria or test_scenarios
- Check v_prd_acceptance view returns data
- Verify SD exists and is active

**If duplicates appear:**
- Check unique constraint is active
- Verify MD5 generation is deterministic
- Use the deduplication query in verification section