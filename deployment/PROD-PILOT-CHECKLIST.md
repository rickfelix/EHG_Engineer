# Production Pilot Owner Checklist

## Pre-Deployment Verification

### Database Setup
- [ ] Run migration #1: `database/migrations/2025-01-17-user-stories-compat.sql`
- [ ] Run migration #2: `database/migrations/verify-2025-01-17-user-stories.sql`
- [ ] Run migration #3: `database/migrations/2025-01-17-prod-hardening.sql`
- [ ] Optional: Run seed data `database/migrations/prod-pilot-seed.sql`

### Environment Configuration
- [ ] `SERVICE_TOKEN_PROD` = Supabase service-role key (NOT anon key)
- [ ] `FEATURE_AUTO_STORIES=true`
- [ ] `FEATURE_STORY_UI=true`
- [ ] `FEATURE_STORY_AGENT=true`
- [ ] `FEATURE_STORY_GATES=false` ⚠️ **MUST BE FALSE FOR PILOT**
- [ ] `VITE_FEATURE_STORY_GATES=false` ⚠️ **Frontend must match**

### CI/CD Configuration
- [ ] GitHub Actions workflow updated with webhook step
- [ ] `SERVICE_TOKEN_PROD` added to GitHub secrets
- [ ] `STORY_WEBHOOK_URL` configured to production endpoint
- [ ] Test webhook connectivity: `curl -X GET [PROD_URL]/api/stories/health`

### GitHub Settings
- [ ] Gate check workflow exists but **NOT set as required** on protected branches
- [ ] Can be found at: Settings → Branches → Protection rules → Status checks

## Deployment Steps

### 1. Database Migration
```sql
-- In Supabase SQL Editor (production)
-- Run each file in order:
1. 2025-01-17-user-stories-compat.sql
2. verify-2025-01-17-user-stories.sql
3. 2025-01-17-prod-hardening.sql
4. prod-pilot-seed.sql (optional)
```

### 2. Verify Migration Success
```sql
-- Should return all PASS
SELECT * FROM verify_story_setup();
```

### 3. Deploy Application
```bash
# With gates OFF
FEATURE_STORY_GATES=false npm run deploy:prod
```

### 4. Generate Pilot Stories
```sql
-- Dry run first
SELECT * FROM fn_generate_stories_from_prd('SD-2025-PILOT-001', 'PRD-PILOT-001', 'dry_run');

-- Then create stories
SELECT * FROM fn_generate_stories_from_prd('SD-2025-PILOT-001', 'PRD-PILOT-001', 'upsert');
```

### 5. Trigger CI Pipeline
```bash
# Push a test commit to trigger CI
git commit --allow-empty -m "test: Trigger story verification webhook"
git push
```

### 6. Verify Story Updates
```sql
-- Check stories were updated
SELECT story_key, status, build_id, last_verified_at
FROM v_story_verification_status
WHERE sd_key = 'SD-2025-PILOT-001'
ORDER BY sequence_no;
```

## Monitoring Checklist

### Health Endpoints
- [ ] `/api/stories/health` returns `{"status": "healthy", "views_ok": true}`
- [ ] `/api/stories?sd_key=SD-2025-PILOT-001` returns story list
- [ ] Dashboard shows story verification status

### Key Metrics
- [ ] DLQ depth = 0 (no stuck messages)
- [ ] API response time P95 ≤ 200ms
- [ ] API error rate < 2%
- [ ] Story verification updates within 30s of CI completion

### Database Queries
```sql
-- Overall health
WITH metrics AS (
    SELECT
        COUNT(*) as total_stories,
        COUNT(*) FILTER (WHERE verification_status = 'passing') as passing,
        COUNT(*) FILTER (WHERE last_verified_at > NOW() - INTERVAL '1 hour') as recent
    FROM sd_backlog_map
    WHERE story_key IS NOT NULL
)
SELECT
    total_stories,
    passing,
    recent as updated_last_hour,
    ROUND(100.0 * passing / NULLIF(total_stories, 0), 1) as passing_pct
FROM metrics;
```

## Rollback Plan

### Instant Disable (No Deployment Required)
```bash
# Set flags and restart
export FEATURE_STORY_AGENT=false
export FEATURE_AUTO_STORIES=false
export FEATURE_STORY_UI=false
export FEATURE_STORY_GATES=false

# Restart application
pm2 restart app-name
```

### Full Rollback
1. Disable feature flags (above)
2. Redeploy previous version
3. Schema remains (additive-only design)

## Success Criteria

### Week 1 (Pilot)
- [ ] 0 production incidents
- [ ] >95% webhook success rate
- [ ] <2% API error rate
- [ ] Stories updating correctly from CI

### Week 2 (Stability)
- [ ] 10+ successful CI runs
- [ ] Consistent gate calculations
- [ ] No manual interventions required

### Gate Enablement (Post-Pilot)
After 2 weeks of stable operation:
1. [ ] Get approval from stakeholders
2. [ ] Set `FEATURE_STORY_GATES=true`
3. [ ] Set `VITE_FEATURE_STORY_GATES=true`
4. [ ] Deploy with gates enabled
5. [ ] Make GitHub check required on protected branch

## Support Contacts

- **Database Issues**: Check Supabase dashboard logs
- **CI/CD Issues**: Check GitHub Actions logs
- **API Issues**: Check application logs
- **Rollback Authority**: [Owner Name]

## CAB Template

```
Change Title: LEO User Stories - Production Pilot
Change Type: New Feature (Pilot)
Risk Level: Low (gates disabled, instant rollback)
Rollback Time: <1 minute (feature flags)

Impact:
- New database tables (additive only)
- New API endpoints (/api/stories/*)
- CI webhook integration
- Dashboard UI components

Testing:
- Staging validation: 100% pass
- Pilot SD prepared
- Rollback tested

Metrics:
- DLQ depth
- API latency (P95)
- Error rate
- Story update success rate

Rollback:
- Method: Feature flags
- Time: <1 minute
- Authority: [Owner]
```

## Make Targets

```makefile
# Production commands
make stories-generate ENV=prod SD=SD-2025-PILOT-001 PRD=PRD-PILOT-001
make stories-verify ENV=prod
make stories-health ENV=prod
make gates-status ENV=prod SD=SD-2025-PILOT-001
```

---

✅ **Ready for Production Pilot** when all items checked