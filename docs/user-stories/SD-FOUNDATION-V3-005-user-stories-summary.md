# User Stories Summary: SD-FOUNDATION-V3-005
## EVA Directive Execution Engine

**Strategic Directive**: SD-FOUNDATION-V3-005
**PRD ID**: PRD-SD-FOUNDATION-V3-005
**Total User Stories**: 8
**Total Story Points**: 42
**Generated**: 2025-12-17
**Status**: Draft

---

## Overview

The EVA Directive Execution Engine enables the Chairman to issue natural language directives (e.g., "analyze venture X financials") that EVA can parse, understand, route to appropriate handlers, execute via agent task contracts, and report results in an aggregated executive summary.

## Functional Requirements Mapping

| FR | Description | User Stories |
|----|-------------|--------------|
| FR-1 | Command Parser Service | US-001, US-002 |
| FR-2 | Directive Router | US-003 |
| FR-3 | Execution Dispatcher | US-004, US-005 |
| FR-4 | Status Polling Endpoint | US-006 |
| FR-5 | Result Aggregator | US-007, US-008 |

---

## User Stories

### Phase 1: Foundation (18 story points)

#### US-001: Create Command Parser Service (8 pts, CRITICAL)
**Intent**: Parse Chairman directive text into structured intent objects

**Key Capabilities**:
- Extract action (analyze, create, generate, update, check)
- Identify target (venture, agent, budget, report, portfolio)
- Resolve entities via database lookup
- Confidence scoring (0.0-1.0)
- Ambiguity detection with clarification suggestions
- Multi-step directive detection

**Acceptance Criteria**:
- Parse "analyze venture TechCorp financials" → structured intent
- Extract parameters from complex directives (Q4 2024, technology category)
- Detect multi-step directives with hasMultipleSteps flag
- Handle ambiguous directives with clarification suggestions
- Resolve entities from database (ventures, agents)
- Detect unsupported directives with suggested alternatives

**Files to Create**:
- `src/services/directiveParser.ts`
- TypeScript interfaces: DirectiveIntent, ParseResult, EntityReference

**Tests**: 10+ unit tests, integration tests with Supabase lookups

---

#### US-002: Extend Parser with Validation (5 pts, HIGH)
**Intent**: Validate directives against business rules, permissions, and prerequisites

**Key Capabilities**:
- Permission checks (venture ownership via RLS)
- Prerequisite validation (data availability)
- Business rule enforcement (valid quarters, parameters)
- Concurrency limit (max 5 concurrent directives)
- Detailed validation results

**Acceptance Criteria**:
- Permission check passes for owned ventures
- Permission check fails for unowned ventures with access denied error
- Prerequisite validation detects missing data with suggested actions
- Business rule validation catches invalid parameters (Q5 → error)
- Concurrency limit enforced at 5 directives

**Validation Response**:
- permissionCheck (boolean)
- prerequisitesMet (boolean)
- businessRulesValid (boolean)
- concurrencyLimit (boolean)
- proceedWithExecution (boolean)
- errors[], warnings[], suggestedActions[]

---

#### US-003: Create Directive Router (5 pts, CRITICAL)
**Intent**: Route parsed intents to appropriate execution handlers

**Key Capabilities**:
- Handler registry (Map<action:target, handler[]>)
- Priority-based handler selection
- Extensible handler registration
- Error handling for unsupported directives

**Acceptance Criteria**:
- Route analyze-venture → AnalyzeVentureHandler
- Route create-report → CreateReportHandler
- Route check-venture → CheckVentureStatusHandler
- Throw error for unsupported action-target combinations
- Select highest priority handler when multiple registered

**Files to Create**:
- `src/services/directiveRouter.ts`
- Handler interfaces: DirectiveHandler, HandlerConfig, ExecutionResult

**Handler Pattern**:
```typescript
interface DirectiveHandler {
  name: string;
  supports(intent): boolean;
  execute(intent, config): Promise<ExecutionResult>;
}
```

---

### Phase 2: Execution (13 story points)

#### US-004: Create Execution Dispatcher (8 pts, CRITICAL)
**Intent**: Create and dispatch task contracts to target agents

**Key Capabilities**:
- Task contract creation and persistence
- Agent task dispatching (event bus or direct)
- Multi-agent task orchestration
- Dispatch retry logic (exponential backoff)
- Execution state tracking

**Acceptance Criteria**:
- Create task contract with taskId, directiveId, status, persist to DB
- Multi-agent dispatch creates 2 contracts with dependencies
- High urgency directives include deadline (now + 1 hour)
- Retry dispatch on failure with exponential backoff (5s, 10s, 20s)
- getExecutionState() returns totalTasks, completed, running, failed, progress%

**Database Schema**:
- `chairman_directive_tasks` table
- Columns: task_id, directive_id, agent_type, handler_name, status, priority, deadline, retry_count

**Task Statuses**:
- pending, dispatched, running, completed, failed, dispatch_failed, timeout

---

#### US-005: Task Dependency Orchestration (5 pts, HIGH)
**Intent**: Execute multi-step directives with agent task dependencies

**Key Capabilities**:
- Dependency graph creation (DAG)
- Sequential execution (PLAN → EXEC)
- Parallel execution (no dependencies)
- Dependency failure handling
- Topological sort for validation (cycle detection)

**Acceptance Criteria**:
- Sequential: PLAN dispatched → EXEC waits → PLAN completes → EXEC dispatched
- PLAN failure → EXEC marked dependency_failed, not dispatched
- Parallel tasks (no dependencies) dispatched immediately
- Complex DAG: LEAD → (PLAN1 || PLAN2) → EXEC
- Predecessor results passed to dependent tasks

**Task Statuses**:
- waiting_dependency, dependency_failed

---

### Phase 3: Observability (11 story points)

#### US-006: Status Polling API Endpoint (3 pts, CRITICAL)
**Intent**: Real-time directive execution status via API

**Key Capabilities**:
- GET /api/v2/directives/[id]/status endpoint
- Authentication and authorization (chairman owns directive)
- Progress calculation (completed/total%)
- Estimated completion time (task velocity)
- ETag support for polling optimization (304 responses)

**Acceptance Criteria**:
- Return status with directiveId, status, progress%, tasks, estimatedCompletion
- Task-level details: taskId, agentType, handlerName, status, progress
- Completed directives return result
- Failed directives return error and failedTask
- 403 Forbidden for unauthorized access
- 304 Not Modified for unchanged status (ETag)

**API Response**:
```json
{
  "directiveId": "dir-123",
  "status": "running",
  "progress": 33,
  "tasks": [...],
  "estimatedCompletion": "2025-12-17T10:30:00Z"
}
```

---

#### US-007: Result Aggregator (5 pts, HIGH)
**Intent**: Aggregate task results into executive summary

**Key Capabilities**:
- Multi-task result synthesis
- Executive summary generation (2-3 sentences)
- Key findings extraction (top 5, by severity)
- Actionable recommendations (top 3, by priority)
- Partial failure handling

**Acceptance Criteria**:
- Single task result → summary with executiveSummary, keyFindings, recommendations
- Multi-task (3+) → synthesized unified summary
- Partial success (2 success + 1 fail) → status=partial_success with details
- Findings prioritized by severity (critical > high > medium > low > info)
- Extract actionable recommendations with priority and impact

**Aggregated Result Structure**:
```typescript
{
  executiveSummary: string;  // 2-3 sentences
  keyFindings: Finding[];    // Top 5, sorted by severity
  recommendations: Recommendation[];  // Top 3, sorted by priority
  detailedResults: DetailedResult[];  // Per-task outputs
  successfulTasks: number;
  failedTasks: number;
  status: 'completed' | 'partial_success' | 'failed';
}
```

---

#### US-008: Result Integration (3 pts, HIGH)
**Intent**: Auto-aggregate and display results on completion

**Key Capabilities**:
- Auto-aggregation on directive completion
- Result storage in chairman_directives.result (JSONB)
- UI component for result display
- Aggregation failure handling
- Re-aggregation support
- Chairman notification

**Acceptance Criteria**:
- Directive completes → ResultAggregator called automatically → stored in DB
- UI displays executiveSummary, top 5 keyFindings, top 3 recommendations
- Aggregation failure → status=completed_with_errors, retry button shown
- Re-aggregate button → re-runs aggregation, updates UI
- Chairman notified on completion (event bus)

**Files to Create**:
- `src/components/directives/DirectiveResultView.tsx` (UI component)
- POST /api/v2/directives/[id]/re-aggregate endpoint

---

## Implementation Order

### Recommended Sequence

**Phase 1 - Foundation (Week 1)**
1. US-001: Command Parser Service (8 pts)
2. US-002: Directive Validation (5 pts)
3. US-003: Directive Router (5 pts)

**Phase 2 - Execution (Week 2)**
4. US-004: Execution Dispatcher (8 pts)
5. US-005: Task Dependencies (5 pts)

**Phase 3 - Observability (Week 3)**
6. US-006: Status Polling API (3 pts)
7. US-007: Result Aggregator (5 pts)
8. US-008: Result Integration (3 pts)

---

## Priority Breakdown

| Priority | Count | Story Points |
|----------|-------|--------------|
| CRITICAL | 4 | 24 |
| HIGH | 4 | 18 |
| **Total** | **8** | **42** |

---

## Testing Strategy

### Unit Tests
- Directive parsing (10+ patterns)
- Validation logic (5+ scenarios)
- Routing logic (handler selection)
- Task creation and dependency resolution
- Result aggregation algorithms

### Integration Tests
- Entity resolution (Supabase lookups)
- Permission checks (RLS)
- Task dispatching (event bus)
- Multi-agent workflows
- API endpoints

### E2E Tests
- Complete directive workflow (parse → route → dispatch → complete → aggregate)
- Status polling flow
- UI result display
- Re-aggregation

---

## Database Schema Changes

### New Tables

**chairman_directive_tasks**
```sql
CREATE TABLE chairman_directive_tasks (
  task_id TEXT PRIMARY KEY,
  directive_id TEXT NOT NULL REFERENCES chairman_directives(directive_id),
  agent_type TEXT NOT NULL,
  handler_name TEXT NOT NULL,
  intent JSONB NOT NULL,
  config JSONB NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  dispatched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  depends_on TEXT[]  -- Task IDs this task depends on
);
```

### Modified Tables

**chairman_directives** (if not exists)
```sql
ALTER TABLE chairman_directives ADD COLUMN IF NOT EXISTS result JSONB;
ALTER TABLE chairman_directives ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE chairman_directives ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
```

---

## Architecture References

### Services to Create
- `src/services/directiveParser.ts` - NLP parsing + entity resolution
- `src/services/directiveRouter.ts` - Handler registry and routing
- `src/services/executionDispatcher.ts` - Task contracts and dispatching
- `src/services/resultAggregator.ts` - Result synthesis and summarization
- `src/services/handlers/` - Directory for handler implementations

### API Endpoints to Create
- `GET /api/v2/directives/[directiveId]/status` - Status polling
- `POST /api/v2/directives/[directiveId]/re-aggregate` - Re-run aggregation

### UI Components to Create
- `src/components/directives/DirectiveResultView.tsx` - Result display
- `src/components/directives/DirectiveStatusIndicator.tsx` - Progress indicator

---

## INVEST Criteria Validation

### Independent
- Each user story can be developed and tested independently
- US-001 (parser) can work standalone without router
- US-006 (status API) can query tasks without aggregation

### Negotiable
- Details can be adjusted (e.g., concurrency limit, retry strategy)
- Confidence thresholds can be tuned
- Summary format can be customized

### Valuable
- Each story delivers tangible value to Chairman
- US-001 enables natural language directives
- US-006 provides real-time progress visibility
- US-008 delivers actionable executive summaries

### Estimable
- All stories have clear scope and story points
- Complexity based on similar work (parsing, APIs, aggregation)
- 3-8 story points per story

### Small
- Largest story is 8 points (1-2 days for experienced dev)
- Each story can be completed in single sprint iteration
- Acceptance criteria testable within story scope

### Testable
- All stories have specific Given-When-Then acceptance criteria
- Clear definition of done
- Test scenarios identified (unit, integration, E2E)

---

## Key Technical Decisions

1. **NLP Library**: Compromise, Natural, or OpenAI API for parsing
2. **Agent Messaging**: Event bus (preferred) or direct API calls
3. **Task Storage**: Supabase chairman_directive_tasks table
4. **Retry Strategy**: Exponential backoff (5s, 10s, 20s)
5. **Concurrency Limit**: 5 concurrent directives per chairman
6. **Status Polling**: ETag optimization for 304 responses
7. **Result Storage**: JSONB column in chairman_directives
8. **Summary Generation**: Template-based (v1) → AI-powered (v2)

---

## Success Metrics

### Functional Metrics
- Parse accuracy: >80% confidence for common directives
- Validation accuracy: 100% permission checks
- Dispatch success rate: >95% (with retries)
- Aggregation success rate: >99%

### Performance Metrics
- Parse time: <500ms average
- Validation time: <200ms average
- Status API response: <100ms
- End-to-end directive: <5 minutes (simple), <30 minutes (complex)

### User Experience Metrics
- Clarification rate: <20% (low-confidence parses)
- Directive success rate: >90%
- Chairman satisfaction: >8/10

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| NLP parsing inaccuracy | High | Confidence scoring + clarifications |
| Agent queue downtime | High | Retry logic + exponential backoff |
| Circular dependencies | Medium | Topological sort validation |
| Aggregation failure | Medium | Fallback to raw task results |
| Performance degradation | Medium | Caching + database indexing |

---

## Next Steps

1. Review and approve user stories
2. Create PRD: `npm run prd:create SD-FOUNDATION-V3-005`
3. Set up database tables (chairman_directive_tasks)
4. Begin Phase 1 implementation (US-001)
5. Create test fixtures for directive parsing

---

**Document Status**: Draft
**Last Updated**: 2025-12-17
**Generated By**: STORIES sub-agent (Sonnet 4.5)
**Story Points Total**: 42
**Estimated Duration**: 3 weeks (14 story points per week)
