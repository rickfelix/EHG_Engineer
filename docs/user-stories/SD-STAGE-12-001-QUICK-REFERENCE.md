# Quick Reference: SD-STAGE-12-001 User Stories

**For Copy-Paste into Database**: See `SD-STAGE-12-001-user-stories-database.json`

---

## One-Liner Summary of Each Story

### US-STAGE12-001
**Manual Brand Variant Entry**
- Form dialog for brand managers to input variants (name, type, hypothesis, confidence_delta)
- Validates all fields, auto-generates IDs, appears in variants list
- FR-1, Must Have, 3 points, Medium

### US-STAGE12-002
**Domain Availability Validation**
- Real-time domain checks for .com/.co/.io/.net, 1-hour caching
- Suggests alternatives, flags premium opportunities, handles API failures gracefully
- FR-2, Must Have, 5 points, Large

### US-STAGE12-003
**Chairman Approval Workflow**
- Structured approval (Approve/Reject/Conditional), directional feedback, priority constraints
- Manages state transitions, records decisions for audit trail
- FR-3, Must Have, 5 points, Large

### US-STAGE12-004
**Brand Variants Management Dashboard**
- Sortable/filterable table, real-time updates, batch operations, 100+ variant support
- Shows variant_name, type, status, confidence, domain_status, approval_status
- FR-4, Must Have, 3 points, Medium

### US-STAGE12-005
**Provider Abstraction Layer**
- Pluggable providers (GoDaddy, Whois, Namecheap), normalized results, rate limiting, fallback
- Allows switching providers without code changes, transparent error handling
- FR-5, Must Have, 5 points, Large

### US-STAGE12-006
**Configuration-Driven Automation**
- 4 levels: MANUAL_ONLY, SEMI_AUTOMATED, FULLY_AUTOMATED, THRESHOLD_BASED
- Global and per-venture overrides, per-trigger enable/disable
- FR-6, Should Have, 3 points, Medium

### US-STAGE12-007
**JSONB Schema Validation with Zod**
- Comprehensive Zod schemas for all JSONB fields (variant_details, performance_metrics, etc.)
- Early validation, clear errors, type safety across pipeline
- FR-7, Must Have, 5 points, Large

### US-STAGE12-008
**Variant Lifecycle State Management**
- State machine: GENERATED → UNDER_EVALUATION → APPROVED → PROMOTED → RETIRED
- Enforces valid transitions, terminal states, notification triggers, audit logging
- FR-8, Must Have, 3 points, Medium

---

## Story Points by Priority

**Must Have** (7 stories, 26 points):
- US-STAGE12-001 (3), US-STAGE12-002 (5), US-STAGE12-003 (5), US-STAGE12-004 (3)
- US-STAGE12-005 (5), US-STAGE12-007 (5), US-STAGE12-008 (3)

**Should Have** (1 story, 3 points):
- US-STAGE12-006 (3)

**Total**: 8 stories, 29 points

---

## Implementation Phase Order

### Phase 1: Week 1-2 (Foundations)
1. **US-STAGE12-007**: JSONB schemas (needed for data integrity)
2. **US-STAGE12-008**: Lifecycle state machine (needed for workflows)
3. **US-STAGE12-001**: Manual variant entry (first user interaction)

### Phase 2: Week 3 (Display & Governance)
4. **US-STAGE12-004**: Variants dashboard (see what's created)
5. **US-STAGE12-003**: Chairman approval (validate what's created)

### Phase 3: Week 4+ (Integration)
6. **US-STAGE12-002**: Domain validation (external service)
7. **US-STAGE12-005**: Provider abstraction (external abstraction)
8. **US-STAGE12-006**: Automation configuration (scale features)

---

## Acceptance Criteria Count by Story

| US Key | AC Count | Testable Scenarios |
|--------|----------|-------------------|
| US-STAGE12-001 | 5 | 5 |
| US-STAGE12-002 | 6 | 5 |
| US-STAGE12-003 | 6 | 4 |
| US-STAGE12-004 | 7 | 7 |
| US-STAGE12-005 | 6 | 3 |
| US-STAGE12-006 | 7 | 4 |
| US-STAGE12-007 | 7 | 7 |
| US-STAGE12-008 | 8 | N/A (state machine) |
| **TOTAL** | **52 AC** | **35+ scenarios** |

---

## Database Fields Touched by Story

### US-STAGE12-001 (Manual Entry)
- `adaptive_name_variants`: variant_id, parent_evaluation_id, variant_details, lifecycle_status

### US-STAGE12-002 (Domain Validation)
- `adaptive_name_variants`: availability_status.domain_availability

### US-STAGE12-003 (Approval)
- `chairman_adaptive_guidance`: guidance_id, guidance_type, directional_feedback, adaptation_approval
- `adaptive_name_variants`: lifecycle_status (status → UNDER_EVALUATION/APPROVED/REJECTED)

### US-STAGE12-004 (Dashboard)
- `adaptive_name_variants`: all fields (read-only for display)

### US-STAGE12-005 (Providers)
- `configuration`: domain_providers, trademark_providers
- No direct user story data changes

### US-STAGE12-006 (Automation)
- `configuration`: automation_level, confidence_threshold, venture_overrides

### US-STAGE12-007 (Validation)
- All JSONB fields in `adaptive_name_variants`

### US-STAGE12-008 (Lifecycle)
- `adaptive_name_variants`: lifecycle_status (all transitions)

---

## Key Integration Points

**Supabase Client**: `src/lib/supabase.ts`
- Used by: All stories for database operations

**WebSocket Real-time**: Supabase subscriptions
- Used by: US-STAGE12-004 (dashboard updates), US-STAGE12-003 (approval notifications)

**Redis Cache**: 1-hour domain check caching
- Used by: US-STAGE12-002 (domain availability)

**Zod Validation**: Schema validation
- Used by: All stories (US-STAGE12-007 defines, others use)

**React Hook Form**: Form validation
- Used by: US-STAGE12-001 (manual entry), US-STAGE12-003 (approval form)

**TanStack Table**: Data table
- Used by: US-STAGE12-004 (variants dashboard)

**Domain Provider Abstraction**: `src/services/providers/domain/`
- Used by: US-STAGE12-002 (domain checks), US-STAGE12-005 (provider framework)

**State Machine**: Lifecycle management
- Used by: US-STAGE12-008 (state transitions), US-STAGE12-003 (approval workflow)

---

## Example Database Record (US-STAGE12-001)

```json
{
  "variant_id": "550e8400-e29b-41d4-a716-446655440000",
  "venture_id": "660e8400-e29b-41d4-a716-446655440000",
  "parent_evaluation_id": "770e8400-e29b-41d4-a716-446655440000",
  "variant_details": {
    "name_text": "VentureNamePro",
    "generation_cycle": 1,
    "adaptation_timestamp": "2025-12-05T10:00:00Z",
    "adaptation_reason": "manual_entry",
    "variant_type": "semantic_enhancement",
    "improvement_hypothesis": "Adding Pro suffix increases perceived premium positioning"
  },
  "performance_metrics": {
    "baseline_comparison": {
      "original_name": "VentureName",
      "original_score": 65,
      "net_improvement_score": 12
    },
    "confidence_tracking": [
      {
        "timestamp": "2025-12-05T10:00:00Z",
        "confidence_score": 0.75
      }
    ]
  },
  "availability_status": {
    "domain_availability": null,
    "trademark_status": null,
    "last_checked": null,
    "monitoring_active": false
  },
  "validation_results": {
    "linguistic_analysis": null,
    "stakeholder_feedback": [],
    "chairman_assessment": null
  },
  "lifecycle_status": {
    "status": "GENERATED",
    "promoted_to_primary": false,
    "created_at": "2025-12-05T10:00:00Z",
    "created_by": "brand-manager-1"
  }
}
```

---

## E2E Test Files to Create

```
tests/e2e/
├── US-STAGE12-001-manual-variant-entry.spec.ts
├── US-STAGE12-002-domain-validation.spec.ts
├── US-STAGE12-003-chairman-approval.spec.ts
├── US-STAGE12-004-variants-table.spec.ts
├── US-STAGE12-005-provider-abstraction.spec.ts
├── US-STAGE12-006-automation-config.spec.ts
├── US-STAGE12-007-zod-validation.spec.ts
└── US-STAGE12-008-lifecycle-management.spec.ts
```

---

## Validation Before EXEC→PLAN Handoff

### Checklist
- [ ] All 8 user stories documented
- [ ] 100% of FR-1 through FR-8 covered
- [ ] All stories have acceptance criteria in Given/When/Then format
- [ ] All stories have example code patterns
- [ ] All stories estimated (29 points total)
- [ ] INVEST criteria compliance verified
- [ ] Implementation context provided (architecture, patterns, code examples)
- [ ] E2E test files created (tests/e2e/US-STAGE12-XXX-*.spec.ts)
- [ ] All E2E tests passing
- [ ] Git commits reference SD-STAGE-12-001 and US-STAGE12-XXX
- [ ] User stories auto-validated in database
- [ ] E2E tests auto-mapped to user stories
- [ ] 100% coverage verified (8/8 stories with E2E tests)

### Success Criteria
- [ ] PLAN_verification passes (deliverables marked complete)
- [ ] Zero unmapped user stories
- [ ] Zero user stories without E2E tests
- [ ] Progress = 100% (all stories validated)

---

## Notes for EXEC

### What's Provided
1. **Complete user stories** with negotiable details
2. **Example code patterns** to get started quickly
3. **Architecture references** to avoid reinventing wheel
4. **Testing scenarios** to guide QA
5. **Edge cases** to consider
6. **Performance targets** to measure success

### What to Implement
1. Create the stories in order (Phase 1 → Phase 2 → Phase 3)
2. Write E2E tests in parallel with implementation
3. Reference provided code patterns
4. Follow INVEST principles throughout
5. Keep git commits clean (one story = one PR, <400 lines)

### What to Avoid
1. Don't create variants without lifecycle state
2. Don't skip schema validation (data integrity critical)
3. Don't ignore approval workflow (governance required)
4. Don't hardcode providers (abstraction essential)
5. Don't skip E2E tests (100% coverage required)

---

**Generated**: 2025-12-05
**Status**: Ready for EXEC handoff
**Total Effort**: 29 story points across 4 weeks
