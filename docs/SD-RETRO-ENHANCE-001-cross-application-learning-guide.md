# Cross-Application Learning Guide
## SD-RETRO-ENHANCE-001: US-009

**Purpose**: Enable learning from retrospectives across multiple applications (EHG_engineer, EHG, venture_*)

**Status**: Auto-population trigger deployed, documentation complete

---

## 🎯 Overview

The enhanced retrospective system enables cross-application learning by:
1. **Auto-tagging process improvements** - PROCESS_IMPROVEMENT retrospectives automatically marked as `applies_to_all_apps = TRUE`
2. **Application filtering** - Query retrospectives by specific application or include all
3. **Venture-specific patterns** - Filter to venture-specific learnings
4. **Semantic search across apps** - Find similar issues regardless of application

**Target Metric**: 60% adoption rate for process improvements across ventures

---

## 🔧 Auto-Population Logic

### Trigger Function (Deployed in Checkpoint 1)

```sql
CREATE OR REPLACE FUNCTION auto_populate_retrospective_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-populate applies_to_all_apps for PROCESS_IMPROVEMENT category
  IF NEW.learning_category = 'PROCESS_IMPROVEMENT' THEN
    NEW.applies_to_all_apps := TRUE;
  ELSE
    NEW.applies_to_all_apps := FALSE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Behavior**:
- `learning_category = 'PROCESS_IMPROVEMENT'` → `applies_to_all_apps = TRUE`
- All other categories → `applies_to_all_apps = FALSE`
- Automatic, no manual intervention required

---

## 📊 Query Patterns

### 1. Get All Cross-Application Learnings

```sql
-- Find all process improvements applicable to all apps
SELECT
  id,
  title,
  target_application,
  learning_category,
  key_learnings,
  action_items,
  created_at
FROM retrospectives
WHERE applies_to_all_apps = TRUE
  AND status = 'PUBLISHED'
ORDER BY created_at DESC;
```

**Use Case**: Dashboard widget showing "Process Improvements for All Applications"

---

### 2. Get Learnings for Specific Application

```sql
-- Get retrospectives for EHG app (including cross-app learnings)
SELECT
  id,
  title,
  learning_category,
  key_learnings,
  applies_to_all_apps
FROM retrospectives
WHERE (target_application = 'EHG' OR applies_to_all_apps = TRUE)
  AND status = 'PUBLISHED'
ORDER BY created_at DESC
LIMIT 20;
```

**Use Case**: Show relevant retrospectives when working on EHG application

---

### 3. Get Venture-Specific Learnings

```sql
-- Get retrospectives for a specific venture
SELECT
  id,
  title,
  target_application,
  learning_category,
  key_learnings
FROM retrospectives
WHERE target_application LIKE 'venture_%'
  AND status = 'PUBLISHED'
ORDER BY created_at DESC;

-- Get retrospectives for specific venture (e.g., venture_saas_platform)
SELECT * FROM retrospectives
WHERE target_application = 'venture_saas_platform';
```

**Use Case**: Filter learnings when creating new ventures

---

### 4. Semantic Search Across Applications

Using the `match_retrospectives()` RPC function (Checkpoint 2):

```sql
-- Find authentication-related retrospectives across ALL applications
SELECT * FROM match_retrospectives(
  query_embedding := '[embedding vector]'::vector,
  match_threshold := 0.7,
  match_count := 10,
  filter_application := NULL,           -- Search all applications
  filter_category := NULL,              -- All categories
  filter_severity := NULL,              -- All severities
  include_all_apps := true              -- Include cross-app learnings
);

-- Find retrospectives for specific application + cross-app learnings
SELECT * FROM match_retrospectives(
  query_embedding := '[embedding vector]'::vector,
  match_threshold := 0.7,
  match_count := 10,
  filter_application := 'EHG',          -- EHG app
  filter_category := 'APPLICATION_ISSUE', -- Only app issues
  filter_severity := 'CRITICAL',        -- Only critical
  include_all_apps := true              -- Include cross-app learnings
);
```

**Use Case**: "Show me authentication problems from any application"

---

## 🎨 Dashboard Widget Examples

### Widget 1: Process Improvements Overview

**SQL Query**:
```sql
SELECT
  learning_category,
  COUNT(*) as improvement_count,
  COUNT(DISTINCT target_application) as apps_affected
FROM retrospectives
WHERE applies_to_all_apps = TRUE
  AND status = 'PUBLISHED'
GROUP BY learning_category
ORDER BY improvement_count DESC;
```

**Widget Display**:
```
┌─────────────────────────────────────┐
│ Process Improvements (All Apps)    │
├─────────────────────────────────────┤
│ • Testing Strategy:      12 items  │
│ • Documentation:          8 items  │
│ • Deployment Process:     5 items  │
└─────────────────────────────────────┘
```

---

### Widget 2: Cross-Application Adoption Rate

**SQL Query**:
```sql
WITH process_improvements AS (
  SELECT
    id,
    title,
    created_at
  FROM retrospectives
  WHERE applies_to_all_apps = TRUE
    AND status = 'PUBLISHED'
    AND created_at >= NOW() - INTERVAL '90 days'
),
venture_adoptions AS (
  SELECT
    target_application,
    COUNT(*) as referenced_count
  FROM retrospectives
  WHERE target_application LIKE 'venture_%'
    AND created_at >= NOW() - INTERVAL '90 days'
  GROUP BY target_application
)
SELECT
  COUNT(DISTINCT venture_adoptions.target_application)::float /
  NULLIF((SELECT COUNT(DISTINCT target_application)
          FROM retrospectives
          WHERE target_application LIKE 'venture_%'), 0) * 100
  AS adoption_percentage
FROM venture_adoptions;
```

**Widget Display**:
```
┌─────────────────────────────────────┐
│ 📈 Cross-App Adoption Rate         │
├─────────────────────────────────────┤
│     60% of ventures                │
│     using process improvements     │
│                                     │
│  ████████████░░░░░░░               │
│                                     │
│  Target: 60% ✅                    │
└─────────────────────────────────────┘
```

---

### Widget 3: Recent Cross-Application Learnings

**SQL Query**:
```sql
SELECT
  id,
  title,
  learning_category,
  LEFT(key_learnings::text, 100) as snippet,
  created_at
FROM retrospectives
WHERE applies_to_all_apps = TRUE
  AND status = 'PUBLISHED'
ORDER BY created_at DESC
LIMIT 5;
```

**Widget Display**:
```
┌────────────────────────────────────────────┐
│ 🌐 Recent Process Improvements (All Apps) │
├────────────────────────────────────────────┤
│ • Testing Strategy Enhancement             │
│   "Always run both unit and E2E tests..." │
│   2 days ago                               │
│                                            │
│ • Database Migration Best Practices       │
│   "Verify table names before assuming..." │
│   5 days ago                               │
└────────────────────────────────────────────┘
```

---

## 🔍 Advanced Query Examples

### Example 1: Find Common Patterns Across Applications

```sql
-- Find learning categories that appear in multiple applications
SELECT
  learning_category,
  COUNT(DISTINCT target_application) as app_count,
  ARRAY_AGG(DISTINCT target_application) as applications,
  COUNT(*) as total_retrospectives
FROM retrospectives
WHERE status = 'PUBLISHED'
GROUP BY learning_category
HAVING COUNT(DISTINCT target_application) > 1
ORDER BY app_count DESC, total_retrospectives DESC;
```

**Use Case**: Identify cross-cutting concerns (e.g., "Testing issues affect 3 applications")

---

### Example 2: Compare Learning Distribution

```sql
-- Compare learning categories between applications
SELECT
  target_application,
  learning_category,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY target_application), 1) as percentage
FROM retrospectives
WHERE status = 'PUBLISHED'
  AND target_application IN ('EHG_engineer', 'EHG')
GROUP BY target_application, learning_category
ORDER BY target_application, count DESC;
```

**Use Case**: "EHG_engineer has 40% testing issues vs 20% in EHG"

---

### Example 3: Severity Distribution Across Applications

```sql
-- Critical issues by application
SELECT
  target_application,
  severity_level,
  COUNT(*) as issue_count,
  ARRAY_AGG(title ORDER BY created_at DESC) FILTER (WHERE severity_level = 'CRITICAL') as critical_issues
FROM retrospectives
WHERE status = 'PUBLISHED'
  AND severity_level IN ('CRITICAL', 'HIGH')
GROUP BY target_application, severity_level
ORDER BY
  CASE severity_level
    WHEN 'CRITICAL' THEN 1
    WHEN 'HIGH' THEN 2
  END,
  issue_count DESC;
```

**Use Case**: Risk dashboard showing critical issues per application

---

## 📈 Adoption Metrics

### Tracking Cross-Application Learning Adoption

**Metric 1: Process Improvement Usage Rate**
```sql
SELECT
  COUNT(*) FILTER (WHERE applies_to_all_apps = TRUE) as cross_app_count,
  COUNT(*) as total_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE applies_to_all_apps = TRUE) / COUNT(*), 1) as cross_app_percentage
FROM retrospectives
WHERE status = 'PUBLISHED';
```

**Target**: ≥20% of retrospectives should be cross-application

---

**Metric 2: Venture Adoption Rate**
```sql
WITH ventures AS (
  SELECT DISTINCT target_application
  FROM retrospectives
  WHERE target_application LIKE 'venture_%'
),
adopting_ventures AS (
  SELECT DISTINCT target_application
  FROM retrospectives
  WHERE target_application LIKE 'venture_%'
    AND created_at >= (
      SELECT MIN(created_at)
      FROM retrospectives
      WHERE applies_to_all_apps = TRUE
    )
)
SELECT
  COUNT(adopting_ventures.target_application) as adopting_count,
  COUNT(ventures.target_application) as total_ventures,
  ROUND(100.0 * COUNT(adopting_ventures.target_application) /
        NULLIF(COUNT(ventures.target_application), 0), 1) as adoption_percentage
FROM ventures
LEFT JOIN adopting_ventures USING (target_application);
```

**Target**: ≥60% of ventures reference cross-application learnings

---

## 💡 Usage Examples (JavaScript)

### Example: Query Cross-App Learnings in Node.js

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Get all cross-application learnings
async function getCrossAppLearnings() {
  const { data, error } = await supabase
    .from('retrospectives')
    .select('id, title, learning_category, key_learnings, target_application')
    .eq('applies_to_all_apps', true)
    .eq('status', 'PUBLISHED')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching cross-app learnings:', error);
    return [];
  }

  return data;
}

// Get learnings for specific application (including cross-app)
async function getLearningsForApp(targetApp) {
  const { data, error } = await supabase
    .from('retrospectives')
    .select('*')
    .or(`target_application.eq.${targetApp},applies_to_all_apps.eq.true`)
    .eq('status', 'PUBLISHED')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return [];
  }

  return data;
}

// Get adoption metrics
async function getAdoptionMetrics() {
  const { data, error } = await supabase.rpc('get_cross_app_adoption_metrics');

  return data;
}
```

---

## 🎯 Implementation Checklist

- [x] **Trigger deployed** - `auto_populate_retrospective_fields()` sets `applies_to_all_apps`
- [x] **Documentation complete** - Query patterns and examples documented
- [x] **Semantic search integration** - `match_retrospectives()` supports `include_all_apps` parameter
- [ ] **Dashboard widget created** - (Future: implement in EHG app)
- [ ] **Adoption metrics dashboard** - (Future: track 60% adoption target)
- [ ] **Venture onboarding integration** - (Future: show relevant retrospectives when creating ventures)

---

## 🔄 Future Enhancements

1. **Automated Recommendations**
   - When creating new venture, suggest relevant cross-app retrospectives
   - "Based on your venture type, here are 5 relevant learnings"

2. **Learning Propagation**
   - Alert when new PROCESS_IMPROVEMENT retrospective created
   - Notify all application teams of new cross-app learning

3. **Adoption Tracking**
   - Track which ventures reference cross-app retrospectives
   - Measure time-to-adoption for process improvements

4. **Machine Learning**
   - Predict which retrospectives should be cross-app based on content
   - Suggest reclassification of retrospectives

---

## 📚 Related Documentation

- `database/migrations/20251016_enhance_retrospectives_multi_app_context.sql` - Trigger implementation
- `database/migrations/20251016_add_vector_search_embeddings.sql` - `match_retrospectives()` RPC
- `docs/SD-RETRO-ENHANCE-001-exec-progress-update-2.md` - Implementation progress

---

**Status**: Cross-application learning enabled ✅
**Auto-Population**: Working via database trigger ✅
**Query Patterns**: Documented ✅
**Adoption Target**: 60% (to be measured after deployment)

---

*Last Updated*: 2025-10-16
*SD*: SD-RETRO-ENHANCE-001
*User Story*: US-009
