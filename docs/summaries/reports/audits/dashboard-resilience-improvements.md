---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Dashboard Resilience Improvements


## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, schema, sd

## Root Issues Discovered

From the SD-2025-001 investigation, we identified critical gaps between database schema and dashboard expectations:

### 1. Schema Misalignment
- **Dashboard expects**: `doc.checklist` (single array)
- **Database provides**: `plan_checklist`, `exec_checklist`, `validation_checklist` (separate fields)
- **Result**: Dashboard calculation defaults to 25% instead of 100%

### 2. Silent Calculation Failures
- No error handling when expected fields are missing
- Progress calculation fails silently and returns partial values
- No validation that database progress matches calculated progress

### 3. Incomplete Completion Process
- Completion scripts don't populate all fields dashboard expects
- Missing validation that all required fields are set before marking complete

## Proposed Resilience Improvements

### A. Database Schema Fixes

1. **Add missing fields** to match dashboard expectations:
   ```sql
   ALTER TABLE product_requirements_v2 ADD COLUMN checklist JSONB;
   ALTER TABLE strategic_directives_v2 ADD COLUMN progress INTEGER DEFAULT 0;
   ```

2. **Create database trigger** to sync checklist fields:
   ```sql
   -- Trigger to combine separate checklists into single checklist field
   -- Updates whenever plan_checklist, exec_checklist, or validation_checklist changes
   ```

### B. Dashboard Error Handling

1. **Add fallback logic** for missing fields:
   ```javascript
   // If doc.checklist is missing, construct from separate fields
   if (!doc.checklist && (doc.plan_checklist || doc.exec_checklist || doc.validation_checklist)) {
     doc.checklist = [
       ...(doc.plan_checklist || []),
       ...(doc.exec_checklist || []),
       ...(doc.validation_checklist || [])
     ];
   }
   ```

2. **Add validation and logging**:
   ```javascript
   if (!doc.checklist && !doc.progress) {
     console.error(`WARNING: Document ${doc.id} has no checklist or progress field`);
     // Log to dashboard error log for investigation
   }
   ```

### C. Completion Process Validation

1. **Pre-completion validation script**:
   ```bash
   node scripts/validate-completion-readiness.js SD-2025-001
   # Checks all fields dashboard needs before marking complete
   ```

2. **Updated completion templates** to ensure all fields are set

### D. Automated Testing

1. **Progress calculation tests**:
   ```javascript
   // Test that database records produce expected dashboard percentages
   testProgressCalculation('SD-2025-001', expectedProgress: 100);
   ```

2. **End-to-end dashboard tests**:
   ```javascript
   // Verify dashboard shows correct progress for various SD states
   ```

## Immediate Actions Recommended

1. **Create completion validation script** (high priority)
2. **Update all completion templates** to set required fields
3. **Add error handling to dashboard calculation** 
4. **Document database-dashboard field mapping**
5. **Create automated test for progress calculation**

## Long-term Architectural Improvements

1. **Standardize data model** between database and dashboard
2. **Create unified progress calculation service**
3. **Add monitoring/alerting for calculation mismatches**
4. **Version dashboard calculation logic** to handle schema changes

---
*Created: 2025-09-01 after SD-2025-001 investigation*
*Priority: High - Affects all Strategic Directive completion accuracy*