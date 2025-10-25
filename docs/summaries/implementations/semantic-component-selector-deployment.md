# Semantic Component Selector - Deployment Guide

**Feature**: Semantic Component Recommendations with Explainable AI
**Version**: 1.0
**Date**: 2025-10-18
**Status**: Ready for Deployment

---

## Overview

This guide walks you through deploying the **Semantic Component Selector** system, which provides AI-powered component recommendations in PRDs with explainable confidence breakdowns.

**What it does**:
- Recommends shadcn/ui + third-party components for Strategic Directives
- Uses OpenAI embeddings for semantic matching
- Provides explainable confidence scores (semantic + keyword + popularity)
- Generates installation scripts
- Updates PRDs with `ui_components` field

**Architecture**:
```
SD Creation → PLAN Creates PRD → Semantic Selector → Component Recommendations → PRD Updated
                                        ↓
                            OpenAI Embeddings + pgvector Search
                                        ↓
                            Explainable Confidence Breakdown
```

---

## Prerequisites

### 1. Environment Setup

**Required**:
- ✅ Supabase account with project (dedlbzhpgkmetvhbkyzq)
- ✅ OpenAI API key (for embeddings)
- ✅ Node.js environment
- ✅ Database access (via Supabase Dashboard or psql)

**Environment Variables** (`.env`):
```bash
# Supabase
SUPABASE_URL=https://dedlbzhpgkmetvhbkyzq.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here # Optional but recommended
SUPABASE_DB_PASSWORD=your_db_password_here

# OpenAI
OPENAI_API_KEY=sk-...your_openai_key_here
```

### 2. Package Dependencies

**Already installed** in EHG_Engineer:
- ✅ `@supabase/supabase-js` (v2.56.0)
- ✅ `openai` (v6.4.0)
- ✅ `dotenv` (v17.2.2)
- ✅ `pg` (v8.16.3)

---

## Deployment Steps

### Step 1: Deploy Database Migration

**Option A: Supabase Dashboard (Recommended)**

1. Go to Supabase Dashboard:
   ```
   https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq
   ```

2. Navigate to: **SQL Editor** → **New Query**

3. Open migration file:
   ```
   /mnt/c/_EHG/EHG_Engineer/database/migrations/20251018_component_registry_embeddings.sql
   ```

4. Copy entire contents and paste into SQL Editor

5. Click **Run**

6. Verify success:
   ```sql
   SELECT COUNT(*) FROM component_registry_embeddings;
   -- Should return 0 (table exists but empty)
   ```

**Option B: psql Command Line**

```bash
# If you have network access to Supabase
export PGPASSWORD='Fl!M32DaM00n!1'
psql -h db.dedlbzhpgkmetvhbkyzq.supabase.co -U postgres -d postgres -p 5432 \
  -f database/migrations/20251018_component_registry_embeddings.sql
```

**Option C: Supabase CLI**

```bash
# If you have Supabase CLI configured
supabase db push
```

**Verification**:

```sql
-- Check table exists
\d component_registry_embeddings

-- Check RPC function exists
SELECT proname FROM pg_proc WHERE proname = 'match_components_semantic';

-- Check pgvector extension enabled
SELECT * FROM pg_extension WHERE extname = 'vector';
```

---

### Step 2: Seed Component Registry

**Prerequisites**:
- ✅ Migration deployed (Step 1)
- ✅ OPENAI_API_KEY in .env
- ✅ Supabase credentials in .env

**Run Seed Script**:

```bash
cd /mnt/c/_EHG/EHG_Engineer

# Preview what will be inserted (dry run)
node scripts/seed-component-registry.js --dry-run

# Seed 12 components with embeddings
node scripts/seed-component-registry.js
```

**Expected Output**:

```
🎨 Component Registry Seed - Starting...

======================================================================
📋 Processing 12 components
   Dry run: No
   Force regenerate: No
======================================================================

💰 Cost Estimate:
   Total tokens: ~2,400
   Estimated cost: $0.0001

[1/12] Processing: table (shadcn-ui)
----------------------------------------------------------------------
   🧠 Generating embedding...
   ✅ Inserted successfully
   📊 Tokens: ~200, Cost: $0.000004

[2/12] Processing: card (shadcn-ui)
...

======================================================================
📊 Summary
======================================================================
✅ Success: 12
⏭️  Skipped: 0
❌ Errors: 0
💰 Total Cost: $0.0001
======================================================================

🎉 Component registry seeded successfully!
```

**Verification**:

```sql
-- Check components inserted
SELECT component_name, registry_source, confidence_weight
FROM component_registry_embeddings
ORDER BY confidence_weight DESC;

-- Should show 12 components:
-- table, card, form, dialog, select, calendar (shadcn-ui)
-- message, conversation, code-block (ai-elements)
-- voice-transcription, text-to-speech, realtime-audio (openai-voice)

-- Check embeddings generated
SELECT component_name,
       CASE WHEN description_embedding IS NOT NULL THEN 'Yes' ELSE 'No' END as has_embedding
FROM component_registry_embeddings;

-- All should have embeddings
```

**Troubleshooting**:

| Error | Cause | Solution |
|-------|-------|----------|
| `OPENAI_API_KEY not found` | Missing env var | Add OPENAI_API_KEY to .env |
| `Failed to connect to component_registry_embeddings` | Migration not applied | Run Step 1 first |
| `invalid_api_key` | Invalid OpenAI key | Verify API key at platform.openai.com |
| `rate_limit_exceeded` | Too many API calls | Wait 1 minute and retry |

---

### Step 3: Test Semantic Search

**Create Test Script**:

```javascript
// test-semantic-search.js
import { getComponentRecommendations } from './lib/shadcn-semantic-explainable-selector.js';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  console.log('🧪 Testing Semantic Component Selector\n');

  const result = await getComponentRecommendations({
    sdScope: 'Build a user management dashboard',
    sdDescription: 'Admin interface for viewing and managing user accounts with data table, filters, and forms',
    sdObjectives: 'Enable admins to create, edit, and delete users efficiently',
    maxComponents: 5,
    similarityThreshold: 0.65
  });

  console.log('Recommendations:', JSON.stringify(result, null, 2));
}

test();
```

**Run Test**:

```bash
node test-semantic-search.js
```

**Expected Output**:

```json
{
  "recommendations": [
    {
      "component_name": "table",
      "registry_source": "shadcn-ui",
      "confidence": 87,
      "priority": "CRITICAL",
      "explanation": {
        "confidence_tier": "HIGH",
        "confidence_percentage": 87,
        "reasons": [
          "Primary use case: Display structured data with sorting, filtering, and pagination",
          "Excellent semantic match with SD requirements",
          "Trigger keywords matched in SD description",
          "Highly popular component with proven reliability"
        ]
      }
    },
    {
      "component_name": "form",
      "confidence": 85,
      "priority": "CRITICAL"
    }
  ],
  "summary": {
    "total_found": 5,
    "breakdown": {
      "critical": 2,
      "recommended": 2,
      "optional": 1
    }
  }
}
```

---

### Step 4: Test PRD Integration

**Create Test SD**:

```bash
# Create a test Strategic Directive in database
# (Replace with actual SD creation method)

# Then create PRD
node scripts/add-prd-to-database.js SD-TEST-001 "Test PRD for Component Selector"
```

**Expected Output**:

```
📋 Adding PRD for SD-TEST-001 to database...

   SD uuid_id: abc-123-def

✅ PRD-SD-TEST-001 added to database successfully!

═══════════════════════════════════════════════════
🎨 SEMANTIC COMPONENT RECOMMENDATIONS
═══════════════════════════════════════════════════
🔍 Analyzing SD scope and generating component recommendations...

✅ Found 5 component recommendations:

1. table (shadcn-ui)
   Priority: CRITICAL
   Confidence: 87% (HIGH)
   Install: npx shadcn@latest add table
   Reason: Primary use case: Display structured data...

2. form (shadcn-ui)
   Priority: CRITICAL
   Confidence: 85% (HIGH)
   Install: npx shadcn@latest add form
   Reason: Primary use case: Collect user input...

✅ Component recommendations added to PRD

📦 Installation Script (Critical + Recommended):
----------------------------------------------------------------------
#!/bin/bash
npx shadcn@latest add table
npx shadcn@latest add form
----------------------------------------------------------------------

Summary:
- 2 CRITICAL components
- 2 RECOMMENDED components
- 1 OPTIONAL components

Top recommendation: table (87% confidence, CRITICAL priority)
```

**Verify PRD Updated**:

```sql
SELECT id, ui_components_summary, jsonb_array_length(ui_components) as component_count
FROM product_requirements_v2
WHERE id = 'PRD-SD-TEST-001';
```

---

### Step 5: Verify End-to-End Workflow

**Full Workflow Test**:

1. **LEAD**: Approve SD (existing process)
2. **PLAN**: Create PRD with `add-prd-to-database.js`
3. **Verify**: PRD contains `ui_components` field
4. **EXEC**: Review component recommendations (see EXEC guide)
5. **EXEC**: Install components using generated script

**Success Criteria**:
- ✅ PRD created without errors
- ✅ Component recommendations generated
- ✅ Confidence scores present (60-100%)
- ✅ Installation script generated
- ✅ Explanations include reasoning
- ✅ ui_components field populated in database

---

## Maintenance

### Adding New Components

**Edit Seed Script**:

```javascript
// scripts/seed-component-registry.js
const COMPONENTS = [
  // ... existing components
  {
    component_name: 'new-component',
    component_category: 'ui',
    registry_source: 'shadcn-ui',
    description: 'Component description for semantic matching',
    use_cases: ['Use case 1', 'Use case 2'],
    trigger_keywords: ['keyword1', 'keyword2'],
    install_command: 'npx shadcn@latest add new-component',
    // ... other fields
  }
];
```

**Re-run Seed**:

```bash
# Force regenerate all embeddings
node scripts/seed-component-registry.js --force
```

### Updating Component Metadata

**Direct Database Update**:

```sql
UPDATE component_registry_embeddings
SET confidence_weight = 1.8,
    bundle_size_kb = 50,
    common_alternatives = '[{"component": "Alternative", "tradeoff": "Lighter but less features"}]'
WHERE component_name = 'table' AND registry_source = 'shadcn-ui';
```

**Regenerate Embedding** (if description changed):

```sql
UPDATE component_registry_embeddings
SET description_embedding = NULL
WHERE component_name = 'table';
```

Then re-run seed script with `--force`.

### Adjusting Confidence Thresholds

**In PRD Creation** (`add-prd-to-database.js`):

```javascript
const { recommendations, summary } = await getComponentRecommendations({
  sdScope: sdData.scope,
  maxComponents: 8,
  similarityThreshold: 0.60, // Lower = more recommendations, less confident
  // ...
});
```

**Recommendation**:
- **0.70-0.75**: Balanced (default)
- **0.60-0.70**: More recommendations, some low confidence
- **0.75-0.85**: Fewer but highly confident

---

## Monitoring

### Query Performance

```sql
-- Check average query time
EXPLAIN ANALYZE
SELECT * FROM match_components_semantic(
  (SELECT description_embedding FROM component_registry_embeddings LIMIT 1),
  0.70,
  10,
  NULL,
  NULL
);
```

**Expected**: <100ms for 12 components, <500ms for 100+ components

### Embedding Quality

```sql
-- Check components without embeddings
SELECT component_name, registry_source
FROM component_registry_embeddings
WHERE description_embedding IS NULL;

-- Should return 0 rows
```

### Recommendation Quality

**Manual Review**:
1. Create PRDs for diverse SDs
2. Review component recommendations
3. Check if recommendations make sense
4. Adjust component metadata if needed

**Metrics to Track**:
- Average confidence score per PRD
- % of PRDs with ≥1 CRITICAL recommendation
- % of EXEC agents using recommended components
- False positive rate (irrelevant recommendations)

---

## Rollback Plan

### If Issues Occur

**Option 1: Disable Component Recommendations**

```javascript
// In add-prd-to-database.js, comment out semantic selector section
/*
try {
  const { recommendations, summary } = await getComponentRecommendations(...);
  // ... recommendation logic
} catch (componentError) {
  // ...
}
*/
```

**Option 2: Roll Back Database Migration**

```sql
-- Drop table
DROP TABLE IF EXISTS component_registry_embeddings CASCADE;

-- Drop function
DROP FUNCTION IF EXISTS match_components_semantic CASCADE;

-- Optionally remove pgvector extension (only if not used elsewhere)
-- DROP EXTENSION IF EXISTS vector;
```

**Option 3: Revert Code Changes**

```bash
# Restore add-prd-to-database.js to previous version
git checkout HEAD~1 -- scripts/add-prd-to-database.js
```

---

## Cost Estimation

### OpenAI Embedding Costs

**Initial Seeding** (12 components):
- Tokens: ~2,400 total
- Cost: **$0.0001** (negligible)

**Per PRD Creation**:
- Tokens: ~200-500 (depends on SD description length)
- Cost: **$0.00001** per PRD (negligible)

**Annual Estimate** (1,000 PRDs):
- Total tokens: ~500,000
- Total cost: **$0.01** per year

### Storage Costs

**Database**:
- 12 components × 1536 dimensions × 4 bytes = **74KB**
- 100 components = **615KB**
- Negligible storage cost

---

## Troubleshooting

### No Recommendations Generated

**Symptoms**:
```
ℹ️  No component recommendations found above confidence threshold
   Threshold: 65%
```

**Causes**:
1. SD description too vague
2. No components match requirements
3. Component registry not seeded

**Solutions**:
1. Refine SD description with specific UI keywords
2. Lower threshold to 0.60
3. Verify components seeded: `SELECT COUNT(*) FROM component_registry_embeddings;`

### Low Confidence Scores

**Symptoms**: All recommendations <70% confidence

**Causes**:
1. SD description doesn't match component use cases
2. Component metadata needs refinement
3. Semantic mismatch

**Solutions**:
1. Update component descriptions to include more use cases
2. Add trigger keywords to component metadata
3. Increase confidence_weight for popular components

### OpenAI API Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `invalid_api_key` | API key incorrect | Verify key at platform.openai.com |
| `rate_limit_exceeded` | Too many requests | Wait 1 minute, add retry logic |
| `insufficient_quota` | No credits | Add billing at OpenAI |
| `model_not_found` | Wrong model name | Use `text-embedding-3-small` |

---

## Success Metrics

### Phase 1: Deployment (Week 1)

- ✅ Migration deployed without errors
- ✅ 12 components seeded successfully
- ✅ All embeddings generated
- ✅ Test semantic search returns results
- ✅ PRD integration working

### Phase 2: Adoption (Week 2-4)

- ✅ 10+ PRDs created with component recommendations
- ✅ Average confidence score ≥75%
- ✅ 80% of PRDs have ≥1 CRITICAL recommendation
- ✅ EXEC agents installing recommended components

### Phase 3: Optimization (Month 2)

- ✅ Add 20+ more components to registry
- ✅ Refine component metadata based on feedback
- ✅ False positive rate <10%
- ✅ Average query time <100ms

---

## Next Steps

1. **Deploy migration** (Step 1)
2. **Seed component registry** (Step 2)
3. **Test semantic search** (Step 3)
4. **Create test PRD** (Step 4)
5. **Verify end-to-end** (Step 5)
6. **Monitor first 10 PRDs** (collect feedback)
7. **Refine component metadata** (based on feedback)
8. **Expand component registry** (add more components)

---

## Support

**Questions?**
- Review this deployment guide
- Check EXEC guide: `docs/reference/exec-component-recommendations-guide.md`
- Consult semantic selector module: `lib/shadcn-semantic-explainable-selector.js`

**Issues?**
- Check troubleshooting section
- Verify prerequisites
- Review error messages

**Enhancements?**
- Add new components to registry
- Refine component metadata
- Adjust confidence thresholds
- Report feedback for improvements
