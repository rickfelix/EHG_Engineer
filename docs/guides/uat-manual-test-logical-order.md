---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# UAT Manual Test Logical Order


## Metadata
- **Category**: Testing
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, security, feature, guide

## Overview
This document defines the logical assessment order for the 20 manual UAT test cases based on typical user journey through the EHG application.

## Logical Grouping Strategy

### 🏠 ENTRY POINT (Tests 1-2)
Start where users first land and access the main dashboard.

1. **Chairman Console** (MANUAL-DASHBOARD-MG5GGDV0) - Initial dashboard view
2. **Chairman Console** (TEST-NAV-001) - Main console functionality

### 🤖 AI FEATURES (Tests 3-7)
Core AI orchestration features - the heart of the application.

3. **EVA Assistant** (TEST-NAV-002) - Primary AI interaction
4. **EVA Dashboard** (TEST-NAV-005) - AI orchestration overview
5. **Workflows** (TEST-NAV-006) - Workflow management
6. **AI Agents** (TEST-NAV-007) - Agent configuration
7. **EVA Knowledge Base** (TEST-NAV-008) - Knowledge management

### 💼 CORE BUSINESS (Tests 8-9)
Primary business functionality for managing ventures and portfolios.

8. **Ventures** (TEST-NAV-003) - Venture management
9. **Portfolios** (TEST-NAV-004) - Portfolio management

### 📊 ANALYTICS & REPORTS (Tests 10-15)
Data analysis and reporting capabilities.

10. **Analytics** (TEST-NAV-009) - Basic analytics
11. **Reports** (TEST-NAV-010) - Report generation
12. **Insights** (TEST-NAV-011) - Business insights
13. **Risk Forecasting** (TEST-NAV-012) - Risk analysis
14. **Advanced Analytics** (TEST-NAV-013) - Advanced analysis
15. **Mobile Companion** (TEST-NAV-014) - Mobile features

### ⚙️ ADMINISTRATION (Tests 16-19)
Administrative and configuration features.

16. **Governance** (TEST-NAV-015) - Governance policies
17. **Integration Hub** (TEST-NAV-016) - Third-party integrations
18. **Enhanced Security** (TEST-NAV-017) - Security settings
19. **Settings** (TEST-NAV-018) - System configuration

### 🔀 CROSS-CUTTING (Test 20)
General navigation and UX concerns that span the application.

20. **Navigation & UX** (TEST-NAV-019) - Overall navigation/UX

## Implementation

### Step 1: Add sort_order column to database
Run this SQL in Supabase Dashboard → SQL Editor:

```sql
-- Add sort_order field to uat_cases table
ALTER TABLE uat_cases
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Create index for efficient sorting
CREATE INDEX IF NOT EXISTS idx_uat_cases_sort_order
ON uat_cases(sort_order);

-- Add comment
COMMENT ON COLUMN uat_cases.sort_order IS 'Defines the logical order for test execution/assessment. Lower numbers appear first.';
```

### Step 2: Apply sort order values
Run: `node scripts/apply-uat-sort-order.js`

### Step 3: Update UI queries
Change your Supabase queries to include:
```javascript
.order('sort_order', { ascending: true })
```

## Benefits
- ✅ Natural user journey flow
- ✅ Test dependencies respected (entry → core → admin)
- ✅ Easier to assess systematically
- ✅ Better organization for test reporting
- ✅ Flexible ordering (can renumber as needed)

## Rationale
1. **Entry first**: Users must access the system before using features
2. **AI features early**: Core differentiator, highest priority
3. **Business features next**: Primary value delivery
4. **Analytics middle**: Supporting data analysis capabilities
5. **Admin last**: Configuration typically done after using features
6. **Cross-cutting last**: General concerns that span all areas
