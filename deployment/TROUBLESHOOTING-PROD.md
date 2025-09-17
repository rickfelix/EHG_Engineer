# Production Story Verification Troubleshooting

## Common Issues & Solutions

### 1. SERVICE_TOKEN_PROD Issues

#### Symptom: 401/403 errors from API
```
Error: Unauthorized
Status: 401
```

#### Solution
```bash
# Verify token is service-role (not anon)
echo $SERVICE_TOKEN_PROD | base64 -d | jq .

# Should contain:
# "role": "service_role"
# NOT "role": "anon"
```

### 2. Story Keys Not Matching

#### Symptom: Stories stay in `not_run` after CI
```sql
-- All stories still not_run
SELECT status, COUNT(*) FROM v_story_verification_status
WHERE sd_key = 'SD-2025-PILOT-001'
GROUP BY status;
```

#### Solution
Ensure test names include exact story keys:
```javascript
// ✅ Correct - includes story key
test('SD-2025-PILOT-001:US-c7eba47b - Story generation', () => {})

// ❌ Wrong - missing story key
test('Story generation creates unique keys', () => {})
```

### 3. Webhook Not Receiving Data

#### Symptom: CI runs but stories don't update

#### Diagnostic Steps
```bash
# 1. Check API health
curl -X GET https://prod.com/api/stories/health \
  -H "Authorization: Bearer $SERVICE_TOKEN_PROD"

# 2. Test direct webhook call
curl -X POST https://prod.com/api/stories/verify \
  -H "Authorization: Bearer $SERVICE_TOKEN_PROD" \
  -H "Content-Type: application/json" \
  -d '{"stories":[{"story_key":"SD-2025-PILOT-001:US-c7eba47b","status":"passing"}]}'

# 3. Check application logs for errors
```

### 4. Duplicate Story Constraint Violations

#### Symptom
```
ERROR: duplicate key value violates unique constraint "sd_backlog_map_unique_sd_backlog"
```

#### Solution
```sql
-- Find duplicates
SELECT sd_id, backlog_id, COUNT(*)
FROM sd_backlog_map
GROUP BY sd_id, backlog_id
HAVING COUNT(*) > 1;

-- Remove duplicates (keep first)
DELETE FROM sd_backlog_map a
USING sd_backlog_map b
WHERE a.ctid < b.ctid
  AND a.sd_id = b.sd_id
  AND a.backlog_id = b.backlog_id;
```

### 5. Release Gate Not Calculating

#### Symptom: Gate shows 0% even with passing stories

#### Solution
```sql
-- Check view is working
SELECT * FROM v_sd_release_gate
WHERE sd_key = 'SD-2025-PILOT-001';

-- Manually refresh if needed
REFRESH MATERIALIZED VIEW CONCURRENTLY v_sd_release_gate;
-- (Only if it's a materialized view)
```

### 6. Timezone Issues

#### Symptom: Timestamps off by hours

#### Solution
Ensure all timestamps are ISO8601 UTC:
```javascript
// ✅ Correct
timestamp: new Date().toISOString()  // 2025-01-17T12:00:00.000Z

// ❌ Wrong
timestamp: new Date().toString()     // Local timezone
```

### 7. Query Performance Issues

#### Symptom: P95 > 200ms

#### Diagnostic
```sql
-- Check missing indexes
EXPLAIN ANALYZE
SELECT * FROM v_story_verification_status
WHERE sd_key = 'SD-2025-PILOT-001';

-- Add missing index if needed
CREATE INDEX CONCURRENTLY idx_sd_backlog_perf
ON sd_backlog_map(sd_id, story_key)
WHERE story_key IS NOT NULL;
```

### 8. CI Pipeline Not Triggering Webhook

#### Check GitHub Actions
```yaml
# Verify these are set:
- name: Post to webhook
  env:
    SERVICE_TOKEN: ${{ secrets.SERVICE_TOKEN_PROD }}  # Must exist
    STORY_WEBHOOK_URL: ${{ vars.STORY_WEBHOOK_URL }}  # Must be set
```

#### Check Secrets
Go to: Settings → Secrets → Actions
- `SERVICE_TOKEN_PROD` must exist
- Must be service-role token

### 9. Gates Blocking When They Shouldn't

#### Symptom: Gates enforcing despite OFF flag

#### Solution
```bash
# Verify both backend AND frontend flags
grep FEATURE_STORY_GATES .env*

# Should see:
FEATURE_STORY_GATES=false
VITE_FEATURE_STORY_GATES=false

# Rebuild frontend if needed
npm run build:client
```

### 10. DLQ Filling Up

#### Symptom: Failed webhook calls accumulating

#### Solution
```sql
-- Check DLQ (if implemented)
SELECT COUNT(*), MAX(retry_count)
FROM story_webhook_dlq
WHERE status = 'failed';

-- Process DLQ manually
UPDATE story_webhook_dlq
SET status = 'pending', retry_count = 0
WHERE status = 'failed' AND retry_count < 3;
```

## Quick Health Check Script

```bash
#!/bin/bash
# Save as check-prod-health.sh

echo "🏥 Production Story System Health Check"
echo "======================================="

# 1. API Health
echo -n "API Health: "
curl -s -X GET "$PROD_API_BASE/api/stories/health" \
  -H "Authorization: Bearer $SERVICE_TOKEN_PROD" | jq -r .status || echo "❌ FAIL"

# 2. Database connectivity
echo -n "Database: "
psql "$DATABASE_URL_PROD" -c "SELECT 1" >/dev/null 2>&1 && echo "✅ OK" || echo "❌ FAIL"

# 3. Story count
echo -n "Stories: "
psql "$DATABASE_URL_PROD" -t -c \
  "SELECT COUNT(*) FROM sd_backlog_map WHERE story_key IS NOT NULL"

# 4. Duplicate check
echo -n "Duplicates: "
DUPES=$(psql "$DATABASE_URL_PROD" -t -c \
  "SELECT COUNT(*) FROM (SELECT sd_id, story_key, COUNT(*)
   FROM sd_backlog_map WHERE story_key IS NOT NULL
   GROUP BY 1,2 HAVING COUNT(*) > 1) d")
[ "$DUPES" = "0" ] && echo "✅ None" || echo "❌ $DUPES found"

# 5. Recent updates
echo -n "Recent updates (1hr): "
psql "$DATABASE_URL_PROD" -t -c \
  "SELECT COUNT(*) FROM sd_backlog_map
   WHERE last_verified_at > NOW() - INTERVAL '1 hour'"

echo "======================================="
```

## Emergency Rollback

```bash
# Instant disable - no deployment needed
export FEATURE_STORY_AGENT=false
export FEATURE_AUTO_STORIES=false
export FEATURE_STORY_UI=false
export FEATURE_STORY_GATES=false

# Restart application
pm2 restart your-app || systemctl restart your-app
```

## Support Escalation

1. **Check logs first**: Application and database logs
2. **Run health check**: `bash check-prod-health.sh`
3. **Capture snapshot**: `make stories-snapshot-prod`
4. **Document issue**: Include all error messages and timestamps
5. **Rollback if needed**: Use emergency rollback above