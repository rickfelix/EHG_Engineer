# Stage 5: Gaps & Implementation Backlog


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, unit, schema

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:139-182

---

## Critical Gaps (Block Automation)

### GAP-S5-001: Recursion Engine Not Implemented

**Issue**: Detailed JavaScript implementation provided in critique (lines 44-77) but not built yet

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:44-77 "async function onStage5Complete"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:136 "recursionEngine.ts: Central recursion"

**Impact**: Cannot trigger FIN-001 recursion when ROI < 15%; critical quality gate blocked

**Proposed Artifacts**:
1. Build `recursionEngine.ts` service with:
   - `triggerRecursion()` method (auto-execute for CRITICAL severity)
   - `requestChairmanApproval()` method (for HIGH severity)
   - Loop prevention logic (max 3 recursions)
   - Integration with `recursion_events` table
2. Implement threshold evaluation logic from critique lines 49-76
3. Build notification system (Chairman post-execution alerts)

**Priority**: P0 (blocks recursion feature entirely)

**Estimated Effort**: 5-7 days

---

### GAP-S5-002: Recursion Events Table Not Created

**Issue**: Database schema described in critique but table does not exist

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:137 "recursion_events table: Database logging"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:72 "Recursion event logged to database"

**Impact**: Cannot track recursion history, enforce loop prevention, or display comparison analysis

**Proposed Artifacts**:
1. Create `recursion_events` table with full schema:
   ```sql
   CREATE TABLE recursion_events (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     venture_id UUID REFERENCES ventures(id) NOT NULL,
     from_stage INT NOT NULL,
     to_stage INT NOT NULL,
     trigger_type VARCHAR(50) NOT NULL,  -- 'FIN-001', 'MKT-001', etc.
     trigger_data JSONB,                 -- Full financial model snapshot
     severity VARCHAR(20) NOT NULL,      -- 'CRITICAL', 'HIGH', 'MEDIUM'
     auto_executed BOOLEAN DEFAULT false,
     resolution_notes TEXT,
     recursion_count_for_stage INT,
     created_at TIMESTAMP DEFAULT NOW(),
     resolved_at TIMESTAMP,
     chairman_override BOOLEAN DEFAULT false,
     chairman_override_reason TEXT
   );
   ```
2. Add indexes for performance (venture_id, from_stage, trigger_type)
3. Implement RLS policies for Chairman override access

**Priority**: P0 (blocks recursion tracking)

**Estimated Effort**: 1-2 days

---

### GAP-S5-003: Financial Modeling Tools Not Implemented

**Issue**: No automated financial model generation; critique notes "Limited automation for manual processes" (Automation Leverage: 3/5)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:24 "Limited automation for manual"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:141-144 "Enhance Automation"

**Impact**: Manual spreadsheet creation required; target 80% automation not achievable

**Proposed Artifacts**:
1. Build financial modeling service:
   - Revenue model generator (inputs: pricing, market size → outputs: 3-5 year projections)
   - Cost structure calculator (inputs: team size, infrastructure costs → outputs: COGS, OpEx, CapEx)
   - Profitability analyzer (inputs: revenue model, cost structure → outputs: ROI, margins, break-even)
2. Integrate with Excel/Google Sheets API for export
3. Implement financial model templates by industry (SaaS, hardware, marketplace)

**Priority**: P0 (blocks automation target)

**Estimated Effort**: 10-15 days

---

## Important Gaps (Reduce Quality)

### GAP-S5-004: ROI Real-Time Indicator UI Missing

**Issue**: Critique describes pre-emptive warning system (green/yellow/red indicator) but not implemented

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:122-127 "Pre-emptive Warning: Show ROI trend"

**Impact**: Users surprised by recursion trigger; no progressive disclosure of ROI status

**Proposed Artifacts**:
1. Build real-time ROI calculator (runs as user enters revenue/cost data)
2. Implement color-coded indicator:
   - 🟢 Green: ROI > 20%
   - 🟡 Yellow: ROI 15-20% (warning: may require approval)
   - 🔴 Red: ROI < 15% (critical: will trigger recursion)
3. Add tooltip explaining threshold and consequences

**Priority**: P1 (impacts UX significantly)

**Estimated Effort**: 2-3 days

---

### GAP-S5-005: Recursion Explanation Modal Missing

**Issue**: Critique specifies clear modal explaining recursion, but not implemented

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:128-131 "Recursion Explanation: Clear modal"

**Impact**: Users confused about why recursion occurred; reduced transparency

**Proposed Artifacts**:
1. Build modal component with:
   - Clear explanation of why recursion triggered (e.g., "ROI 12% below 15% threshold")
   - List of re-validation requirements (willingness to pay, problem-solution fit, MVP scope)
   - "View Financial Model" and "Continue to Stage 3" buttons
2. Integrate with recursionEngine (auto-display on FIN-001 trigger)

**Priority**: P1 (impacts UX and transparency)

**Estimated Effort**: 1-2 days

---

### GAP-S5-006: Financial Comparison View Missing

**Issue**: Critique describes side-by-side comparison of original vs updated financial model, but not implemented

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:132 "Financial Comparison: Side-by-side"

**Impact**: Users cannot see impact of recursion; difficult to validate improvements

**Proposed Artifacts**:
1. Build comparison component:
   - Left column: Original financial model (before recursion)
   - Right column: Updated financial model (after recursion)
   - Delta indicators (↑↓ with % change)
2. Store financial model history in `financial_model_history` table
3. Display comparison after recursion resolved

**Priority**: P1 (impacts transparency and validation)

**Estimated Effort**: 2-3 days

---

### GAP-S5-007: Chairman Approval Workflow Not Implemented

**Issue**: Recursion blueprint specifies Chairman approval for HIGH severity (ROI 15-20%, Margin <20%) but no workflow exists

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:108-114 "HIGH severity: Requires Chairman"

**Impact**: Cannot enforce approval requirements for HIGH severity triggers; either all auto-execute or all manual

**Proposed Artifacts**:
1. Implement approval request workflow:
   - Notify Chairman (email + dashboard notification)
   - Present options: Proceed, Recurse, Kill
   - Wait for Chairman response before proceeding
2. Build Chairman override UI:
   - Modify ROI threshold for specific venture
   - Skip recursion despite threshold violation
   - Approve continuation after max recursions
3. Add audit trail to `chairman_overrides` table

**Priority**: P1 (impacts governance)

**Estimated Effort**: 3-5 days

---

### GAP-S5-008: Rollback Procedures Not Defined

**Issue**: Critique notes "Unclear rollback procedures"

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:25 "Unclear rollback procedures"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:157-160 "Add Rollback Procedures"

**Impact**: If financial model needs to be reverted, unclear how to restore previous state

**Proposed Artifacts**:
1. Define rollback decision tree:
   - When to rollback: Critical calculation errors, input data invalidated, recursion triggered
   - How to rollback: Restore from `financial_model_history`, mark stage as "In Progress"
2. Implement rollback triggers (auto-rollback on recursion, manual rollback for errors)
3. Document rollback procedures in SOP

**Priority**: P1 (impacts reliability)

**Estimated Effort**: 1-2 days

---

## Minor Gaps (Nice-to-Have)

### GAP-S5-009: Accounting Tool Integration Missing

**Issue**: Critique notes "Missing specific tool integrations" (no QuickBooks, Xero, etc.)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:26 "Missing specific tool integrations"

**Impact**: Manual data entry for financial data; reduced efficiency

**Proposed Artifacts**:
1. Integrate with accounting APIs (QuickBooks, Xero, FreshBooks)
2. Auto-import cost data (COGS, OpEx, CapEx) from accounting systems
3. Export financial model to accounting tools for tracking

**Priority**: P2 (enhances efficiency)

**Estimated Effort**: 5-7 days

---

### GAP-S5-010: Customer Validation Touchpoint Missing

**Issue**: Critique suggests adding customer feedback loop to validate pricing assumptions; UX/Customer Signal score only 1/5

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:14 "UX/Customer Signal | 1"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:162-165 "Customer Integration"

**Impact**: Financial model based on assumptions, not real customer data

**Proposed Artifacts**:
1. Add customer validation checkpoint in Substage 5.1 (Revenue Modeling):
   - Survey customers for willingness-to-pay validation
   - A/B test pricing tiers with real users
   - Capture pricing feedback during user interviews (Stage 3)
2. Integrate customer feedback into revenue projections

**Priority**: P2 (enhances accuracy)

**Estimated Effort**: 3-4 days

---

### GAP-S5-011: Performance Monitoring Not Implemented

**Issue**: Critique specifies performance SLAs (ROI calculation <500ms, total latency <1s) but no monitoring

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:116-120 "Performance Requirements"

**Impact**: Cannot track performance violations or optimize slow calculations

**Proposed Artifacts**:
1. Implement performance tracking:
   - Log ROI calculation time
   - Log recursion detection time
   - Log total stage latency
2. Store metrics in `stage_performance` table
3. Build performance dashboard (identify violations, track trends)

**Priority**: P2 (enhances reliability)

**Estimated Effort**: 2-3 days

---

### GAP-S5-012: Financial Model History Not Implemented

**Issue**: Comparison view requires historical snapshots, but no `financial_model_history` table exists

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:132 "Side-by-side of original vs updated"

**Impact**: Cannot display comparison analysis; reduced transparency

**Proposed Artifacts**:
1. Create `financial_model_history` table:
   ```sql
   CREATE TABLE financial_model_history (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     venture_id UUID REFERENCES ventures(id),
     stage_id INT NOT NULL,
     financial_model JSONB NOT NULL,  -- Full snapshot
     roi_pct NUMERIC,
     gross_margin_pct NUMERIC,
     net_margin_pct NUMERIC,
     break_even_months INT,
     created_at TIMESTAMP DEFAULT NOW(),
     recursion_event_id UUID REFERENCES recursion_events(id)
   );
   ```
2. Auto-snapshot financial model on stage completion and recursion trigger
3. Implement comparison query (fetch latest 2 snapshots)

**Priority**: P2 (required for comparison view)

**Estimated Effort**: 1-2 days

---

### GAP-S5-013: Metrics Implementation Missing

**Issue**: All metrics defined in stages.yaml but none implemented yet

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:196-199 "metrics: Model accuracy"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:146-149 "Define Clear Metrics"

**Impact**: Cannot measure stage effectiveness, model accuracy, or identify improvement opportunities

**Proposed Artifacts**:
1. Implement all queries from file 09 (metrics-monitoring.md)
2. Build financial health dashboard (ROI distribution, recursion heatmap, margin analysis)
3. Implement post-launch model accuracy tracking (compare projected vs actual)

**Priority**: P2 (enhances visibility)

**Estimated Effort**: 5-7 days

---

### GAP-S5-014: Data Transformation Rules Not Documented

**Issue**: Critique notes "Data transformation and validation rules" missing

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:151-155 "Improve Data Flow"

**Impact**: Unclear how inputs (Market size data, Pricing strategy, Cost estimates) transform into outputs (Financial model, P&L projections, Break-even analysis)

**Proposed Artifacts**:
1. Document data schemas for all inputs/outputs
2. Define transformation rules:
   - Market size → Revenue projections (conversion rate assumptions)
   - Pricing strategy → Revenue model (pricing tiers, upsells)
   - Cost estimates → Cost structure (COGS, OpEx, CapEx breakdown)
3. Implement validation rules (e.g., Revenue > Costs, Margin 0-100%)

**Priority**: P3 (enhances documentation)

**Estimated Effort**: 2-3 days

---

## Backlog Summary

| Gap ID | Title | Priority | Blocks Automation? | Estimated Effort |
|--------|-------|----------|-------------------|------------------|
| GAP-S5-001 | Recursion Engine Not Implemented | P0 | ✅ Yes | 5-7 days |
| GAP-S5-002 | Recursion Events Table Not Created | P0 | ✅ Yes | 1-2 days |
| GAP-S5-003 | Financial Modeling Tools Not Implemented | P0 | ✅ Yes | 10-15 days |
| GAP-S5-004 | ROI Real-Time Indicator UI Missing | P1 | ❌ No | 2-3 days |
| GAP-S5-005 | Recursion Explanation Modal Missing | P1 | ❌ No | 1-2 days |
| GAP-S5-006 | Financial Comparison View Missing | P1 | ❌ No | 2-3 days |
| GAP-S5-007 | Chairman Approval Workflow Not Implemented | P1 | ❌ No | 3-5 days |
| GAP-S5-008 | Rollback Procedures Not Defined | P1 | ❌ No | 1-2 days |
| GAP-S5-009 | Accounting Tool Integration Missing | P2 | ❌ No | 5-7 days |
| GAP-S5-010 | Customer Validation Touchpoint Missing | P2 | ❌ No | 3-4 days |
| GAP-S5-011 | Performance Monitoring Not Implemented | P2 | ❌ No | 2-3 days |
| GAP-S5-012 | Financial Model History Not Implemented | P2 | ❌ No | 1-2 days |
| GAP-S5-013 | Metrics Implementation Missing | P2 | ❌ No | 5-7 days |
| GAP-S5-014 | Data Transformation Rules Not Documented | P3 | ❌ No | 2-3 days |

**Total Estimated Effort**: 44-66 days (9-13 weeks)

**Critical Path** (P0 only): 16-24 days (3-5 weeks)

---

## Recommended Implementation Order

### Phase 1: Recursion Foundation (P0 - 16-24 days)

1. **GAP-S5-002**: Create `recursion_events` table (1-2 days)
2. **GAP-S5-001**: Build `recursionEngine.ts` service (5-7 days)
3. **GAP-S5-003**: Implement financial modeling tools (10-15 days)

**Milestone**: Recursion engine functional; ROI calculation triggers FIN-001

---

### Phase 2: UX & Governance (P1 - 10-17 days)

4. **GAP-S5-004**: Build ROI real-time indicator (2-3 days)
5. **GAP-S5-005**: Build recursion explanation modal (1-2 days)
6. **GAP-S5-012**: Create `financial_model_history` table (1-2 days)
7. **GAP-S5-006**: Build financial comparison view (2-3 days)
8. **GAP-S5-007**: Implement Chairman approval workflow (3-5 days)
9. **GAP-S5-008**: Define rollback procedures (1-2 days)

**Milestone**: Full recursion UX; Chairman governance controls

---

### Phase 3: Enhancement (P2 - 16-23 days)

10. **GAP-S5-013**: Implement metrics and dashboard (5-7 days)
11. **GAP-S5-011**: Build performance monitoring (2-3 days)
12. **GAP-S5-010**: Add customer validation touchpoint (3-4 days)
13. **GAP-S5-009**: Integrate accounting tools (5-7 days)

**Milestone**: Complete monitoring, external integrations

---

### Phase 4: Documentation (P3 - 2-3 days)

14. **GAP-S5-014**: Document data transformation rules (2-3 days)

**Milestone**: Full documentation complete

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Critique weaknesses | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 24-27 |
| Recursion blueprint | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 44-77, 103-114, 122-132 |
| Improvement priorities | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 141-182 |
| Metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 196-199 |
| Integration points | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-05.md | 133-138 |

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
