# User Story System v1.1 - Database Documentation

> **Note**: This file was archived from `database/README.md` on 2026-01-03.
> This is feature-specific documentation for the User Story subsystem.
> For general database documentation, see `database/README.md`.

## Overview
Database-first user story management integrated with LEO Protocol.

## Feature Flags (ALL DEFAULT OFF)
```bash
FEATURE_AUTO_STORIES=false  # Auto-generate stories from PRDs
FEATURE_STORY_AGENT=false   # Enable STORY sub-agent
FEATURE_STORY_UI=false      # Show dashboard UI
FEATURE_STORY_GATES=false   # Enforce release gates
```

## Migration

### Apply Migration
```bash
psql $DATABASE_URL -f database/migrations/2025-01-17-user-stories.sql
```

### Verify Migration
```bash
psql $DATABASE_URL -f database/migrations/verify-2025-01-17-user-stories.sql
psql $DATABASE_URL -f scripts/verify_user_stories.sql
```

### Rollback (if needed)
```bash
psql $DATABASE_URL -f database/migrations/rollback-2025-01-17-user-stories.sql
```

## API Endpoints

### Generate Stories from PRD
```bash
curl -X POST http://localhost:3000/api/stories/generate \
  -H "Content-Type: application/json" \
  -d '{
    "sd_key": "SD-2025-001",
    "prd_id": "550e8400-e29b-41d4-a716-446655440000",
    "mode": "dry_run"
  }'
```

Response:
```json
{
  "status": "success",
  "mode": "dry_run",
  "sd_key": "SD-2025-001",
  "story_count": 3,
  "stories": [
    {
      "action": "would_insert",
      "story_key": "SD-2025-001:US-a3b4c5d6",
      "sequence_no": 1,
      "title": "User can submit directive"
    }
  ]
}
```

### List Stories
```bash
curl "http://localhost:3000/api/stories?sd_key=SD-2025-001&status=passing&limit=10"
```

### Verify Stories (CI Integration)
```bash
curl -X POST http://localhost:3000/api/stories/verify \
  -H "Content-Type: application/json" \
  -d '{
    "story_keys": ["SD-2025-001:US-a3b4c5d6"],
    "test_run_id": "tr-2025-001",
    "build_id": "ci-4567",
    "status": "passing",
    "coverage_pct": 95.0
  }'
```

## Database Schema

### Extended Tables
- `sd_backlog_map` - Extended with story-specific columns:
  - `item_type` - epic/story/task classification
  - `verification_status` - not_run/failing/passing
  - `acceptance_criteria` - JSONB array of criteria
  - `sequence_no` - Story ordering within SD

### Views
- `v_story_verification_status` - Current story status with test results
- `v_sd_release_gate` - Release readiness based on story verification

### Functions
- `fn_generate_stories_from_prd(sd_key, prd_id, mode)` - Generate stories from PRD acceptance criteria

### Security
- Function restricted to `service_role` only
- Views accessible by `authenticated` users
- Audit log tracks all operations

## Performance Optimizations
- Covering index `idx_story_list` for fast story queries
- No ORDER BY in views for optimizer flexibility
- Targeted indexes on verification status and parent relationships

## CI/CD Integration

### Webhook Format
POST `/api/stories/verify` with:
```json
{
  "story_keys": ["SD-XXX:US-XXX"],
  "test_run_id": "tr-XXX",
  "build_id": "ci-XXX",
  "status": "passing|failing|not_run",
  "coverage_pct": 95.0,
  "artifacts": ["s3://bucket/test.log"]
}
```

## Staging Activation Checklist

### Phase 1: Foundation (Day 1)
- [ ] Apply migration
- [ ] Run verification scripts
- [ ] Test dry_run generation

### Phase 2: Shadow Mode (Day 2)
- [ ] Enable FEATURE_AUTO_STORIES=true
- [ ] Generate stories for pilot SD
- [ ] Verify no duplicates

### Phase 3: UI Verification (Day 3)
- [ ] Enable FEATURE_STORY_UI=true
- [ ] Test story lists and filters
- [ ] Verify gate calculations

### Phase 4: Full Integration (Day 4)
- [ ] Enable FEATURE_STORY_AGENT=true
- [ ] Test CI webhook integration
- [ ] Verify end-to-end flow

## Monitoring

### Key Metrics
- Story generation success rate
- Verification update latency
- Query performance (target P95 < 200ms)
- Gate calculation accuracy

### Health Checks
```sql
-- Check story counts
SELECT sd_key, COUNT(*) as story_count
FROM v_story_verification_status
GROUP BY sd_key;

-- Check gate status
SELECT * FROM v_sd_release_gate
WHERE NOT ready AND passing_pct > 90;

-- Check recent verifications
SELECT story_key, status, last_run_at
FROM v_story_verification_status
WHERE last_run_at > NOW() - INTERVAL '1 hour'
ORDER BY last_run_at DESC;
```

## Troubleshooting

### Common Issues

1. **Function permission denied**
   - Ensure using service_role key
   - Check GRANT statement executed

2. **Duplicate story keys**
   - Unique constraint prevents duplicates
   - Use upsert mode to update existing

3. **Cross-SD update rejected**
   - API validates single SD per request
   - Split updates by SD

4. **Performance degradation**
   - Check covering index usage with EXPLAIN
   - Verify pagination in use
   - Review audit log growth
