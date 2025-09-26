# Strategic Directive WSJF Execution Ordering System

## Overview
Implemented an automated execution ordering system for strategic directives using WSJF (Weighted Shortest Job First) scoring methodology.

## Problem Solved
- **Issue**: 72 strategic directives existed but only 11 had execution_order values set
- **Impact**: Dashboard showed directives in creation date order rather than business priority
- **Solution**: Automated WSJF scoring system with LEAD agent oversight

## Components Implemented

### 1. WSJF Calculator Script
**File**: `scripts/calculate-sd-execution-order.js`

Calculates optimal execution order based on:
- **Priority weights**: critical (100), high (70), medium (40), low (10)
- **Status modifiers**: active (1.5x), draft (1.0x), archived (0.1x)
- **Category values**: governance (90), platform (85), infrastructure (80), etc.
- **Time urgency**: Based on days since creation
- **Special bonuses**: Keywords like "wsjf", "vision", "critical", "blocker"

**Usage**:
```bash
node scripts/calculate-sd-execution-order.js
```

### 2. LEAD Review Workflow
**File**: `scripts/lead-review-execution-order.js`

Interactive workflow for LEAD agent to:
- Review current execution order
- Apply WSJF recommendations
- Make manual strategic adjustments
- Track changes with metadata

**Usage**:
```bash
node scripts/lead-review-execution-order.js
```

### 3. Database Updates
- All 72 strategic directives now have execution_order values
- Active/high-priority directives: Orders 1-62
- Archived directives: Orders 962-971
- Metadata includes WSJF scores and update timestamps

### 4. UI Improvements

#### Database Loader
**File**: `src/services/database-loader/strategic-loaders.js`
- Updated to sort by execution_order (primary), priority (secondary), created_at (tertiary)

#### SD Manager Component
**File**: `src/client/src/components/SDManager.jsx`
- Updated sorting logic to prioritize execution_order field
- Added visual execution order badges with gradient styling
- Shows WSJF score on hover for transparency

## Results

### Top 5 Strategic Directives (by WSJF Score)
1. **SD-VISION-001**: Vision Alignment Pipeline (Score: 111.98)
2. **SD-2025-09-EMB**: EHG Message Bus (Score: 82.22)
3. **SD-WSJF-001**: WSJF Sequencing Optimization (Score: 81.98)
4. **SD-VISION-ALIGN-001**: Scenario-Driven Vision Alignment (Score: 80.71)
5. **SD-PIPELINE-001**: CI/CD Pipeline Hardening (Score: 73.72)

### Dashboard Display
- Strategic directives now appear in execution order
- Each SD shows its execution rank (#1, #2, etc.)
- Consistent ordering across all views
- Archived directives appear at the end

## Maintenance

### Recalculate Execution Order
When new strategic directives are added:
```bash
node scripts/calculate-sd-execution-order.js
```

### LEAD Agent Review
For strategic oversight and manual adjustments:
```bash
node scripts/lead-review-execution-order.js
```

### View Current Order
```bash
node scripts/query-active-sds.js
```

## Benefits
1. **Automated Prioritization**: No manual drag-and-drop UI needed
2. **Business Alignment**: WSJF ensures highest value items are worked first
3. **Transparency**: All scoring factors are visible and auditable
4. **Flexibility**: LEAD agent can make strategic overrides when needed
5. **Consistency**: Single source of truth for execution priority