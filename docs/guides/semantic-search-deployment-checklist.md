# Phase 4 Semantic Search - Deployment Checklist

**Date:** 2025-10-17
**Status:** ✅ Ready for Deployment

---

## Pre-Deployment Checklist

### Environment Setup
- [ ] Verify OpenAI API key is set in `.env`
  ```bash
  grep OPENAI_API_KEY .env
  ```
- [ ] Verify Supabase connection credentials
  ```bash
  grep SUPABASE_URL .env
  grep SUPABASE_SERVICE_ROLE_KEY .env
  ```
- [ ] Install/verify OpenAI npm package
  ```bash
  npm ls openai
  # If not installed:
  npm install openai@latest
  ```

### Database Access
- [ ] Confirm database connection works
  ```bash
  psql -h <HOST> -U postgres -d ehg_engineer -c "SELECT 1"
  ```
- [ ] Verify pgvector extension can be enabled
  ```sql
  SELECT * FROM pg_available_extensions WHERE name = 'vector';
  ```

---

## Deployment Steps

### Step 1: Database Migrations

- [ ] **Apply sub-agent embeddings migration**
  ```bash
  psql -h <HOST> -U postgres -d ehg_engineer \
    -f database/migrations/20251017_add_subagent_embeddings.sql
  ```

- [ ] **Verify sub-agent migration**
  ```sql
  -- Should return 1 row
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'leo_sub_agents' AND column_name = 'domain_embedding';

  -- Should return 2 rows (semantic + hybrid)
  SELECT routine_name FROM information_schema.routines
  WHERE routine_name LIKE '%sub_agents%';
  ```

- [ ] **Apply SD embeddings migration**
  ```bash
  psql -h <HOST> -U postgres -d ehg_engineer \
    -f database/migrations/20251017_add_sd_embeddings.sql
  ```

- [ ] **Verify SD migration**
  ```sql
  -- Should return 1 row
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'strategic_directives_v2' AND column_name = 'scope_embedding';

  -- Should return 3 rows (match_sds_semantic, find_similar_sds, update_sd_embedding)
  SELECT routine_name FROM information_schema.routines
  WHERE routine_name LIKE '%sd%' AND routine_name LIKE '%semantic%';
  ```

### Step 2: Generate Embeddings

- [ ] **Generate sub-agent embeddings (one-time)**
  ```bash
  node scripts/generate-subagent-embeddings.js
  ```
  - Expected: 14 sub-agents processed
  - Expected cost: ~$0.0001
  - Expected time: <1 minute

- [ ] **Verify sub-agent embeddings**
  ```sql
  -- Should return 14
  SELECT COUNT(*) FROM leo_sub_agents
  WHERE active = true AND domain_embedding IS NOT NULL;
  ```

- [ ] **Generate SD embeddings (batch)**
  ```bash
  node scripts/generate-sd-embeddings.js
  ```
  - Expected: ~47 SDs processed (varies by environment)
  - Expected cost: ~$0.0006 per 50 SDs
  - Expected time: ~1-2 minutes per 50 SDs

- [ ] **Verify SD embeddings**
  ```sql
  -- Check coverage by status
  SELECT status,
    COUNT(*) as total,
    SUM(CASE WHEN scope_embedding IS NOT NULL THEN 1 ELSE 0 END) as with_embeddings,
    ROUND(100.0 * SUM(CASE WHEN scope_embedding IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) as pct_coverage
  FROM strategic_directives_v2
  WHERE status NOT IN ('ARCHIVED', 'CANCELLED')
  GROUP BY status;
  ```

### Step 3: Testing & Validation

- [ ] **Test hybrid selector (CLI)**
  ```bash
  # Test with sample SD
  node lib/context-aware-sub-agent-selector.js \
    "API Gateway Implementation" \
    "Build REST endpoints with authentication" \
    --hybrid
  ```
  - Expected: API, SECURITY, DATABASE agents recommended
  - Expected: Hybrid scores shown (semantic + keyword breakdown)

- [ ] **Test orchestrator integration**
  ```bash
  # Pick a test SD (or create one)
  node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-TEST-001
  ```
  - Expected: "using hybrid semantic + keyword matching" in log
  - Expected: Hybrid match reasons shown for each agent
  - Expected: No errors or fallback warnings

- [ ] **Test semantic matching functions**
  ```sql
  -- Test sub-agent semantic matching
  SELECT code, name, similarity
  FROM match_sub_agents_semantic(
    (SELECT domain_embedding FROM leo_sub_agents WHERE code = 'API'),
    0.7,
    5
  );
  -- Expected: Returns API + 4-5 similar agents

  -- Test SD duplicate detection
  SELECT sd_id, title, similarity, is_potential_duplicate
  FROM find_similar_sds(
    (SELECT scope_embedding FROM strategic_directives_v2 LIMIT 1),
    NULL,
    0.8
  );
  -- Expected: Returns similar SDs (if any exist)
  ```

- [ ] **Verify no critical errors in logs**
  - Check for OpenAI API errors
  - Check for database RPC errors
  - Check for fallback warnings (should be rare)

### Step 4: Monitoring Setup

- [ ] **Set up daily monitoring query**
  ```sql
  -- Save this as a scheduled query or dashboard
  SELECT
    sub_agent_code,
    COUNT(*) as total_executions,
    AVG(confidence_score) as avg_confidence,
    COUNT(*) FILTER (WHERE verdict = 'PASS') as passes,
    COUNT(*) FILTER (WHERE verdict = 'FAIL') as fails
  FROM sub_agent_execution_results
  WHERE created_at >= NOW() - INTERVAL '24 hours'
  GROUP BY sub_agent_code
  ORDER BY total_executions DESC;
  ```

- [ ] **Set up embedding coverage alerts**
  ```sql
  -- Alert if coverage drops below 90%
  SELECT
    ROUND(100.0 * COUNT(*) FILTER (WHERE scope_embedding IS NOT NULL) / COUNT(*), 1) as coverage_pct
  FROM strategic_directives_v2
  WHERE status NOT IN ('ARCHIVED', 'CANCELLED');
  ```

- [ ] **Document rollback procedure**
  - Save rollback SQL commands from migration files
  - Test rollback in dev/staging environment first

---

## Post-Deployment Checklist

### Week 1: Active Monitoring

- [ ] **Day 1:** Check sub-agent execution results
  - Verify hybrid matching is working
  - Check for any OpenAI API errors
  - Verify cost estimates are accurate

- [ ] **Day 3:** Review false positive rate
  - Compare keyword-only baseline (if available)
  - Identify any problematic SDs
  - Adjust thresholds if needed

- [ ] **Day 7:** Generate first report
  - Total embeddings generated
  - Average semantic/keyword scores
  - False positive rate vs baseline
  - Cost analysis

### Week 2: Optimization

- [ ] **Tune hybrid weights** (if needed)
  - Default: 60% semantic, 40% keyword
  - Test: 70% semantic, 30% keyword (if false positives persist)
  - Test: 50% semantic, 50% keyword (if too restrictive)

- [ ] **Adjust thresholds** (if needed)
  - Default combined threshold: 0.6
  - Increase to 0.65 if too many low-confidence matches
  - Decrease to 0.55 if missing relevant agents

- [ ] **Review coordination groups**
  - Verify multi-agent workflows still trigger correctly
  - Add new coordination groups if patterns emerge

### Month 1: Continuous Improvement

- [ ] **Regenerate embeddings for new sub-agents**
  - If new agents added, run: `node scripts/generate-subagent-embeddings.js --force`

- [ ] **Batch process any SDs missing embeddings**
  - Weekly: `node scripts/generate-sd-embeddings.js` (skips existing)

- [ ] **Review and refine domain descriptions**
  - Update `SUB_AGENT_DOMAINS` in `scripts/generate-subagent-embeddings.js`
  - Regenerate if descriptions change significantly

---

## Success Metrics

### Required for Sign-Off

- [ ] ✅ **All migrations applied successfully** (no errors)
- [ ] ✅ **All 14 sub-agents have embeddings** (100% coverage)
- [ ] ✅ **>90% of active SDs have embeddings**
- [ ] ✅ **Hybrid matching working** (no persistent fallback warnings)
- [ ] ✅ **No critical errors** in orchestrator logs
- [ ] ✅ **False positive rate <15%** (measured over 1 week)

### Target Metrics (2 Weeks)

- [ ] 🎯 **False positive rate <10%** (vs 20-30% baseline)
- [ ] 🎯 **Average confidence score >70%** (vs ~60% keyword-only)
- [ ] 🎯 **Hybrid matching success rate >95%** (embeddings available)
- [ ] 🎯 **Total cost <$1** per 1,000 SDs processed

---

## Rollback Procedure

If critical issues arise, rollback steps:

1. **Disable hybrid matching:**
   ```javascript
   // In orchestrate-phase-subagents.js
   // Temporarily revert to keyword-only
   const { recommended } = selectSubAgents(sd, { confidenceThreshold: 0.4 });
   ```

2. **Remove database functions (optional):**
   ```sql
   DROP FUNCTION IF EXISTS match_sub_agents_hybrid;
   DROP FUNCTION IF EXISTS match_sub_agents_semantic;
   DROP FUNCTION IF EXISTS find_similar_sds;
   DROP FUNCTION IF EXISTS match_sds_semantic;
   ```

3. **Revert code changes:**
   ```bash
   # If committed, revert to previous version
   git revert <commit-hash>
   ```

4. **Document issues** for future resolution

---

## Quick Reference

### Key Files
- Migrations: `database/migrations/20251017_add_*_embeddings.sql`
- Scripts: `scripts/generate-*-embeddings.js`
- Selector: `lib/context-aware-sub-agent-selector.js`
- Orchestrator: `scripts/orchestrate-phase-subagents.js`

### Key Commands
```bash
# Generate embeddings
node scripts/generate-subagent-embeddings.js
node scripts/generate-sd-embeddings.js

# Test hybrid selection
node lib/context-aware-sub-agent-selector.js "<title>" "<description>" --hybrid

# Test orchestrator
node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-TEST-001
```

### Key SQL Queries
```sql
-- Embedding coverage
SELECT COUNT(*) FROM leo_sub_agents WHERE domain_embedding IS NOT NULL;
SELECT COUNT(*) FROM strategic_directives_v2 WHERE scope_embedding IS NOT NULL;

-- Test semantic matching
SELECT * FROM match_sub_agents_semantic('[...]'::vector(1536), 0.7, 5);
SELECT * FROM find_similar_sds('[...]'::vector(1536), NULL, 0.85);
```

---

**Deployment Status:** ✅ **READY**
**Approver:** ____________________
**Deployment Date:** ____________________
**Sign-Off Date:** ____________________
