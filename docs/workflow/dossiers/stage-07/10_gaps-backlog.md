# Stage 7: Gaps & Implementation Backlog


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, schema, rls

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:22-71

---

## Critical Gaps (Block Automation)

### GAP-S7-001: Planning Automation Not Implemented

**Issue**: Critique notes "Limited automation for manual processes" (Automation Leverage: 3/5); currently 100% manual planning

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:24 "Limited automation for manual"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:30-33 "Enhance Automation: Target 80%"

**Impact**: Cannot achieve target 80% automation; comprehensive planning takes weeks (blocks downstream stages)

**Proposed Artifacts**:
1. Build AI-assisted business planning tool:
   - Generate business model canvas from Stage 4/5 outputs
   - Generate go-to-market strategy from Stage 3 customer insights
   - Generate operations design from Stage 6 risk assessment
2. Build AI-assisted technical planning tool:
   - Recommend architecture patterns based on requirements (monolith vs microservices)
   - Recommend tech stack based on team skills, constraints, industry best practices
   - Generate development roadmap from requirements and timeline constraints
3. Build AI-assisted resource planning tool:
   - Estimate team size based on WBS complexity (using historical data)
   - Estimate budget based on team size, timeline, infrastructure needs
   - Generate timeline based on roadmap and resource constraints

**Priority**: P0 (blocks automation target entirely)

**Estimated Effort**: 20-30 days (largest gap)

---

### GAP-S7-002: Recursion Engine Not Implemented (Inbound)

**Issue**: No code or infrastructure to receive RESOURCE-001, TIMELINE-001, TECH-001 triggers from Stages 8 and 10

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-08.md:62-63 "Stage 7 | RESOURCE-001, TIMELINE-001"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-10.md:39 "Stage 7 | TECH-001"

**Impact**: Cannot handle recursion from downstream stages; planning errors discovered in Stage 8/10 cannot trigger updates to Stage 7 plans

**Proposed Artifacts**:
1. Build `recursionEngine.ts` handler for inbound recursion:
   - Receive RESOURCE-001 (resource shortage)
   - Receive TIMELINE-001 (timeline constraint exceeded)
   - Receive TECH-001 (technical complexity timeline impact)
2. Implement recursion routing logic:
   - RESOURCE-001 → return to Substage 7.3 (Resource Planning)
   - TIMELINE-001 → return to Substage 7.3 (Resource Planning)
   - TECH-001 → return to Substage 7.2 (Technical Planning) or 7.3
3. Build Chairman approval workflow (all triggers are HIGH or MEDIUM severity)
4. Integrate with `recursion_events` table for tracking

**Priority**: P0 (blocks recursion feature)

**Estimated Effort**: 5-7 days

---

### GAP-S7-003: Recursion Events Table Not Created

**Issue**: Database table for tracking recursion history does not exist

**Evidence**: Inferred from Stage 5 pattern (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:137 "recursion_events table")

**Impact**: Cannot track recursion history, enforce loop prevention, or analyze recursion patterns

**Proposed Artifacts**:
1. Create `recursion_events` table with schema:
   ```sql
   CREATE TABLE recursion_events (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     venture_id UUID REFERENCES ventures(id) NOT NULL,
     from_stage INT NOT NULL,              -- 8 or 10
     to_stage INT NOT NULL,                -- 7
     target_substage VARCHAR(10),          -- '7.2', '7.3'
     trigger_type VARCHAR(50) NOT NULL,    -- 'RESOURCE-001', 'TIMELINE-001', 'TECH-001'
     trigger_data JSONB,                   -- WBS data, tech review data
     severity VARCHAR(20) NOT NULL,        -- 'HIGH', 'MEDIUM'
     auto_executed BOOLEAN DEFAULT false,  -- Always false (requires approval)
     resolution_notes TEXT,
     recursion_count_for_stage INT,
     created_at TIMESTAMP DEFAULT NOW(),
     resolved_at TIMESTAMP,
     chairman_override BOOLEAN DEFAULT false,
     chairman_override_reason TEXT
   );
   ```
2. Add indexes for performance (venture_id, to_stage, trigger_type)
3. Implement RLS policies for Chairman access

**Priority**: P0 (blocks recursion tracking)

**Estimated Effort**: 1-2 days

---

## Important Gaps (Reduce Quality)

### GAP-S7-004: Metrics Not Implemented

**Issue**: All metrics defined in stages.yaml (Plan completeness, Timeline feasibility, Resource efficiency) but none implemented

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:287-290 "metrics: Plan completeness"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:35-38 "Define Clear Metrics: Missing threshold values"

**Impact**: Cannot measure plan quality, identify inefficient planning, or track improvement over time

**Proposed Artifacts**:
1. Implement all 11 queries from file 09 (metrics-monitoring.md):
   - Plan completeness (% of required sections completed)
   - Timeline feasibility (planned vs benchmark timeline)
   - Resource efficiency (planned vs benchmark budget)
   - Stage completion time, revision cycles, recursion rate, etc.
2. Build planning dashboard:
   - Real-time health status (GREEN/YELLOW/RED) for ventures in Stage 7
   - Recursion heatmap (which triggers are most common)
   - Planning efficiency trends (are we improving over time?)
   - Resource estimation accuracy (planned vs actual post-launch)
3. Implement alerting rules:
   - Alert when stage duration exceeded (> 15 days)
   - Alert when plan completeness low (< 70%)
   - Alert when recursion rate high (> 40%)

**Priority**: P1 (impacts visibility and improvement)

**Estimated Effort**: 5-7 days

---

### GAP-S7-005: Rollback Procedures Not Defined

**Issue**: Critique notes "Unclear rollback procedures"

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:25 "Unclear rollback procedures"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:46-49 "Add Rollback Procedures"

**Impact**: If plans need to be reverted (e.g., Chairman rejects, critical error discovered), unclear how to restore previous state

**Proposed Artifacts**:
1. Define rollback decision tree:
   - **When to rollback**: Chairman rejects plans, critical calculation errors, recursion triggered
   - **How to rollback**: Restore from `venture_plan_history`, mark stage as "In Progress"
2. Implement rollback triggers:
   - Auto-rollback on recursion (return to Substage 7.2 or 7.3)
   - Manual rollback for Chairman rejection or errors
3. Build plan version history:
   - Create `venture_plan_history` table to store snapshots
   - Auto-snapshot on each substage completion and Chairman submission
   - Implement restore functionality (rollback to previous version)
4. Document rollback procedures in SOP (file 05)

**Priority**: P1 (impacts reliability and governance)

**Estimated Effort**: 2-3 days

---

### GAP-S7-006: Data Transformation Rules Not Documented

**Issue**: Critique notes "Data transformation and validation rules" missing; unclear how inputs become outputs

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:12 "Data Readiness: data flow unclear"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:40-44 "Improve Data Flow"

**Impact**: Unclear how risk assessment (Stage 6) informs resource planning, how profitability model (Stage 5) informs budget allocation

**Proposed Artifacts**:
1. Document data schemas for all inputs:
   - Risk assessment schema (from Stage 6)
   - Resource requirements schema (from Stage 6)
   - Timeline constraints schema (from Stage 6)
2. Document data schemas for all outputs:
   - Business plan schema (Substage 7.1)
   - Technical roadmap schema (Substage 7.2)
   - Resource plan schema (Substage 7.3)
3. Define transformation rules:
   - Risk assessment → Resource planning (e.g., compliance risks require legal/security experts)
   - Profitability model (Stage 5) → Budget allocation (e.g., OpEx from Stage 5 becomes salary budget)
   - Timeline constraints (Stage 6) → Development roadmap (e.g., GDPR deadline becomes milestone)
4. Implement validation rules:
   - Budget in Resource Plan (7.3) must match Financial Model (Stage 5) OpEx
   - Timeline in Resource Plan (7.3) must fit Development Roadmap (7.2) milestones
   - Team size in Resource Plan (7.3) must support Dev Roadmap scope (7.2)

**Priority**: P1 (impacts consistency and quality)

**Estimated Effort**: 3-4 days

---

### GAP-S7-007: Tool Integrations Missing

**Issue**: Critique notes "Missing specific tool integrations" (no Jira, Asana, Excel, Lucidchart)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:26 "Missing specific tool integrations"

**Impact**: Manual export/import of plans to project management tools; reduced efficiency

**Proposed Artifacts**:
1. Integrate with Jira API:
   - Sync technical roadmap to Jira (create epics, stories, milestones)
   - Auto-create Jira board for venture
   - Bi-directional sync (updates in Jira reflect in EHG)
2. Integrate with Excel/Google Sheets API:
   - Export budget allocation to Excel (for detailed modeling)
   - Export resource plan to Google Sheets (for sharing with team)
   - Import budget updates from Excel
3. Integrate with Lucidchart API:
   - Sync architecture diagram to Lucidchart (for collaborative editing)
   - Import updated diagram from Lucidchart
4. Integrate with Notion API (optional):
   - Sync business plan to Notion (for documentation)
   - Export go-to-market strategy to Notion workspace

**Priority**: P1 (enhances efficiency and collaboration)

**Estimated Effort**: 7-10 days (depends on tool complexity)

---

### GAP-S7-008: Chairman Approval Workflow Not Implemented

**Issue**: Exit gates require "Business plan approved, Technical roadmap set, Resources allocated" but no approval workflow exists

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:295-298 "exit: Business plan approved"

**Impact**: Cannot enforce Chairman approval requirement; unclear process for requesting/granting approval

**Proposed Artifacts**:
1. Implement Chairman approval workflow:
   - Notify Chairman when Stage 7 complete (ready for review)
   - Present all 3 plans (business, technical, resource) in approval UI
   - Chairman approval options: Approve, Request Revisions, Reject
2. Build revision request workflow:
   - Chairman specifies which sections need revision
   - System returns to appropriate substage (7.1, 7.2, or 7.3)
   - Track revision cycles (count, reasons)
3. Add audit trail:
   - Log all Chairman approvals, rejections, revisions
   - Store approval timestamp, reason (if rejected)
   - Track approval rate by venture category

**Priority**: P1 (impacts governance)

**Estimated Effort**: 3-5 days

---

### GAP-S7-009: Plan Validation Rules Not Implemented

**Issue**: No automated validation to catch inconsistencies (e.g., timeline in Resource Plan doesn't match Dev Roadmap)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:40-44 "Improve Data Flow: validation rules"

**Impact**: Inconsistent plans pass through to Stage 8, trigger recursion when contradictions discovered

**Proposed Artifacts**:
1. Implement consistency validation rules:
   - Timeline consistency: Resource Plan timeline (7.3) matches Dev Roadmap milestones (7.2)
   - Budget consistency: Resource Plan budget (7.3) matches Financial Model OpEx (Stage 5)
   - Team size consistency: Resource Plan team size (7.3) supports Dev Roadmap scope (7.2)
   - Revenue consistency: Business Plan revenue (7.1) matches Financial Model (Stage 5)
2. Implement completeness validation:
   - Business Plan (7.1): All 7 sections complete (business model, revenue streams, cost structure, GTM, operations, value prop, key resources)
   - Technical Plan (7.2): All 5 sections complete (architecture, tech stack, dev roadmap, data flow, integrations)
   - Resource Plan (7.3): All 3 sections complete (team requirements, budget allocation, timeline)
3. Build validation UI:
   - Real-time validation (show errors as user enters data)
   - Pre-submission validation (block submission if validation fails)
   - Validation report (list all errors, warnings)

**Priority**: P1 (impacts quality and reduces recursion)

**Estimated Effort**: 4-6 days

---

## Minor Gaps (Nice-to-Have)

### GAP-S7-010: Plan Templates Not Implemented

**Issue**: No industry-specific templates (SaaS, marketplace, hardware) to accelerate planning

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:30-33 "Build automation workflows"

**Impact**: Every venture starts from blank slate; cannot leverage patterns from similar ventures

**Proposed Artifacts**:
1. Create SaaS plan template:
   - Business model: Subscription revenue, tiered pricing
   - Tech stack: React, Node.js, PostgreSQL, AWS
   - Resource estimate: 5-7 engineers, 6-9 month timeline
2. Create marketplace plan template:
   - Business model: Transaction fees, commission-based
   - Tech stack: 2-sided platform patterns, payment integrations
   - Resource estimate: 10-15 engineers, 9-12 month timeline
3. Create hardware plan template:
   - Business model: Hardware + service revenue
   - Tech stack: Embedded systems, IoT integrations
   - Resource estimate: Longer timeline (12-18 months), prototyping costs
4. Build template selection UI:
   - Dropdown in Substage 7.1: "Select template: Default, SaaS, Marketplace, Hardware"
   - Auto-populate plan sections based on template
   - Allow customization after template applied

**Priority**: P2 (enhances efficiency)

**Estimated Effort**: 5-7 days

---

### GAP-S7-011: Historical Data Analysis Not Implemented

**Issue**: No historical data analysis to inform benchmarks (average team size, timeline, budget for similar ventures)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/dossiers/stage-07/07_recursion-blueprint.md:273-282 "Historical Data (similar ventures)"

**Impact**: Cannot show "Your estimate is 30% below average" warning; no data-driven guidance

**Proposed Artifacts**:
1. Build historical data aggregation:
   - Query all completed ventures (Stage 30+) by category
   - Calculate average team size, budget, timeline
   - Calculate variance (min, max, std dev)
2. Build benchmark comparison:
   - As user enters data in Stage 7.3 (Resource Planning), compare to benchmarks
   - Show warning if estimate deviates significantly (> 20% below average)
   - Color-code indicator (green/yellow/red)
3. Build benchmark admin UI:
   - Chairman can view/edit benchmarks by category
   - Override benchmarks for specific venture types
   - Import external benchmark data (industry reports)

**Priority**: P2 (enhances accuracy)

**Estimated Effort**: 4-6 days

---

### GAP-S7-012: Outbound Recursion Not Defined

**Issue**: Stage 7 critique does not define any outbound recursion triggers (e.g., to Stage 5 when budget exceeds financial model)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:28-71 "No detailed recursion triggers"

**Impact**: Planning may reveal cost increases > 25% above Stage 5 financial model, but no mechanism to trigger update to Stage 5

**Proposed Artifacts**:
1. Define PLAN-001 trigger (to Stage 5):
   - Condition: Resource planning reveals costs 25%+ above Stage 5 financial model
   - Severity: HIGH
   - Action: Chairman approval to recurse to Stage 5 (update OpEx, recalculate ROI)
2. Define PLAN-002 trigger (to Stage 6):
   - Condition: Technical planning identifies new risks not in Stage 6 risk assessment
   - Severity: MEDIUM
   - Action: Chairman approval to recurse to Stage 6 (add new risks, update mitigation strategies)
3. Implement outbound recursion logic in `recursionEngine.ts`

**Priority**: P2 (enhances consistency across stages)

**Estimated Effort**: 3-4 days

---

### GAP-S7-013: Performance Monitoring Not Implemented

**Issue**: No monitoring for plan generation time, validation time, recursion detection time

**Evidence**: Similar to Stage 5 performance gap (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-05.md:116-120)

**Impact**: Cannot track performance violations or optimize slow planning processes

**Proposed Artifacts**:
1. Implement performance tracking:
   - Log plan generation time (AI-assisted tools)
   - Log validation time (consistency checks)
   - Log recursion detection time (evaluate triggers from Stage 8/10)
2. Store metrics in `stage_performance` table
3. Build performance dashboard:
   - Identify slow operations
   - Track trends (are we getting faster over time?)
   - Alert when performance thresholds exceeded

**Priority**: P2 (enhances reliability)

**Estimated Effort**: 2-3 days

---

### GAP-S7-014: Customer Validation Touchpoint Missing

**Issue**: Critique suggests adding customer feedback loop to validate go-to-market assumptions; UX/Customer Signal score only 1/5

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:14 "UX/Customer Signal | 1"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-07.md:51-54 "Customer Integration"

**Impact**: Business plan based on assumptions, not real customer feedback; go-to-market strategy not validated

**Proposed Artifacts**:
1. Add customer validation checkpoint in Substage 7.1 (Business Planning):
   - Survey customers for go-to-market feedback (which channels do they prefer?)
   - A/B test messaging/positioning with target customers
   - Conduct customer interviews to validate operations design
2. Integrate customer feedback into business plan:
   - Update go-to-market strategy based on channel preferences
   - Adjust positioning based on customer messaging feedback
   - Refine operations design based on customer expectations
3. Track customer validation metrics:
   - % of business plans with customer validation
   - Customer satisfaction with proposed GTM strategy

**Priority**: P2 (enhances accuracy and customer-centricity)

**Estimated Effort**: 3-4 days

---

## Backlog Summary

| Gap ID | Title | Priority | Blocks Automation? | Estimated Effort |
|--------|-------|----------|-------------------|------------------|
| GAP-S7-001 | Planning Automation Not Implemented | P0 | ✅ Yes | 20-30 days |
| GAP-S7-002 | Recursion Engine Not Implemented (Inbound) | P0 | ✅ Yes | 5-7 days |
| GAP-S7-003 | Recursion Events Table Not Created | P0 | ✅ Yes | 1-2 days |
| GAP-S7-004 | Metrics Not Implemented | P1 | ❌ No | 5-7 days |
| GAP-S7-005 | Rollback Procedures Not Defined | P1 | ❌ No | 2-3 days |
| GAP-S7-006 | Data Transformation Rules Not Documented | P1 | ❌ No | 3-4 days |
| GAP-S7-007 | Tool Integrations Missing | P1 | ❌ No | 7-10 days |
| GAP-S7-008 | Chairman Approval Workflow Not Implemented | P1 | ❌ No | 3-5 days |
| GAP-S7-009 | Plan Validation Rules Not Implemented | P1 | ❌ No | 4-6 days |
| GAP-S7-010 | Plan Templates Not Implemented | P2 | ❌ No | 5-7 days |
| GAP-S7-011 | Historical Data Analysis Not Implemented | P2 | ❌ No | 4-6 days |
| GAP-S7-012 | Outbound Recursion Not Defined | P2 | ❌ No | 3-4 days |
| GAP-S7-013 | Performance Monitoring Not Implemented | P2 | ❌ No | 2-3 days |
| GAP-S7-014 | Customer Validation Touchpoint Missing | P2 | ❌ No | 3-4 days |

**Total Estimated Effort**: 68-98 days (14-20 weeks)

**Critical Path** (P0 only): 26-39 days (5-8 weeks)

---

## Recommended Implementation Order

### Phase 1: Recursion Foundation (P0 - 26-39 days)

1. **GAP-S7-003**: Create `recursion_events` table (1-2 days)
2. **GAP-S7-002**: Build recursion engine for inbound triggers (5-7 days)
3. **GAP-S7-001**: Implement AI-assisted planning automation (20-30 days)

**Milestone**: Recursion engine functional; planning automation at 80%

---

### Phase 2: Quality & Governance (P1 - 24-35 days)

4. **GAP-S7-005**: Define rollback procedures (2-3 days)
5. **GAP-S7-006**: Document data transformation rules (3-4 days)
6. **GAP-S7-009**: Implement plan validation rules (4-6 days)
7. **GAP-S7-008**: Implement Chairman approval workflow (3-5 days)
8. **GAP-S7-004**: Implement metrics and dashboard (5-7 days)
9. **GAP-S7-007**: Integrate with external tools (7-10 days)

**Milestone**: Full governance; plan quality validation; tool integrations

---

### Phase 3: Enhancement (P2 - 17-24 days)

10. **GAP-S7-010**: Create plan templates by industry (5-7 days)
11. **GAP-S7-011**: Implement historical data analysis (4-6 days)
12. **GAP-S7-012**: Define outbound recursion triggers (3-4 days)
13. **GAP-S7-013**: Implement performance monitoring (2-3 days)
14. **GAP-S7-014**: Add customer validation touchpoint (3-4 days)

**Milestone**: Complete enhancement features

---

## Comparison with Other Stages

| Stage | Total Effort | P0 Effort | P1 Effort | Top Gap |
|-------|-------------|-----------|-----------|---------|
| **Stage 7** | **68-98 days** | **26-39 days** | **24-35 days** | **Planning automation (20-30 days)** |
| Stage 5 | 44-66 days | 16-24 days | 10-17 days | Financial modeling tools (10-15 days) |

**Insight**: Stage 7 has significantly higher effort (50% more than Stage 5) due to complexity of planning automation (3 substages, multiple outputs, cross-stage dependencies)

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Critique weaknesses | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-07.md | 22-27 |
| Improvement priorities | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-07.md | 29-71 |
| Recursion references | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-08.md | 62-63, 150 |
| Tech complexity | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-10.md | 39, 87, 121, 187 |
| Metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 287-290 |
| Exit gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 295-298 |

---

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
