# product_requirements_v2 Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (55 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `character varying(100)` | **NO** | - | Human-readable primary key in format PRD-SD-XXX. Links PRD to its Strategic Directive. |
| directive_id | `character varying(50)` | YES | - | DEPRECATED: Use sd_uuid instead. Kept for backward compatibility during migration. |
| title | `character varying(500)` | **NO** | - | PRD title - typically matches Strategic Directive title. Displayed in dashboards and reports. |
| version | `character varying(20)` | YES | `'1.0'::character varying` | Semantic version (e.g., "1.0", "2.1"). Incremented when PRD is significantly revised. |
| status | `character varying(50)` | YES | `'draft'::character varying` | PRD lifecycle status: draft, approved, in_progress, completed, archived. |
| category | `character varying(50)` | YES | `'technical'::character varying` | Feature category (e.g., authentication, reporting, dashboard). Used for grouping and filtering. |
| priority | `character varying(20)` | YES | `'high'::character varying` | Priority level: CRITICAL (90+), HIGH (70-89), MEDIUM (50-69), LOW (30-49). Inherited from Strategic Directive. |
| executive_summary | `text` | YES | - | High-level summary (2-3 paragraphs) for stakeholders. Answers: What, Why, Impact. |
| business_context | `text` | YES | - | Business justification and value proposition. Explains why this feature matters to users/business. |
| technical_context | `text` | YES | - | Technical landscape and constraints. Existing systems, architecture patterns, integration points. |
| functional_requirements | `jsonb` | YES | `'[]'::jsonb` | JSONB array: Functional requirements describing WHAT the system must do. Format: [{ id, requirement, priority, acceptance_criteria }] |
| non_functional_requirements | `jsonb` | YES | `'[]'::jsonb` | JSONB array: Non-functional requirements (performance, security, scalability). Format: [{ type, requirement, target_metric }] |
| technical_requirements | `jsonb` | YES | `'[]'::jsonb` | JSONB array: Technical specifications and constraints. Technologies, libraries, patterns to use/avoid. |
| system_architecture | `text` | YES | - | Text description of system architecture. Component diagrams, data flows, integration patterns. |
| data_model | `jsonb` | YES | `'{}'::jsonb` | JSONB object: Database schema design. Tables, columns, relationships, indexes, constraints. |
| api_specifications | `jsonb` | YES | `'[]'::jsonb` | JSONB object: API contracts. Endpoints, request/response formats, authentication, error handling. |
| ui_ux_requirements | `jsonb` | YES | `'[]'::jsonb` | JSONB object: UI/UX specifications. Component designs, user flows, accessibility requirements, responsive behavior. |
| implementation_approach | `text` | YES | - | Text: Step-by-step implementation strategy. Phasing, checkpoints, migration approach. |
| technology_stack | `jsonb` | YES | `'[]'::jsonb` | JSONB object: Technologies to be used. Languages, frameworks, libraries, tools. Format: { frontend: [], backend: [], infrastructure: [] } |
| dependencies | `jsonb` | YES | `'[]'::jsonb` | JSONB array: External dependencies and blockers. Third-party services, infrastructure, other SDs. Format: [{ type, name, status, blocker }] |
| test_scenarios | `jsonb` | YES | `'[]'::jsonb` | JSONB array: Test scenarios covering all user stories. Format: [{ id, scenario, expected_result, test_type }] |
| acceptance_criteria | `jsonb` | YES | `'[]'::jsonb` | JSONB array: Criteria for marking PRD complete. Measurable, verifiable conditions. Format: [{ id, criterion, verification_method }] |
| performance_requirements | `jsonb` | YES | `'{}'::jsonb` | JSONB object: Performance targets. Load times, throughput, concurrency, resource limits. Format: { metric: target } |
| plan_checklist | `jsonb` | YES | `'[]'::jsonb` | JSONB array: PLAN phase checklist items. Pre-implementation verification steps. |
| exec_checklist | `jsonb` | YES | `'[]'::jsonb` | JSONB array: EXEC phase checklist items. Implementation and testing requirements. |
| validation_checklist | `jsonb` | YES | `'[]'::jsonb` | JSONB array: PLAN verification checklist. Post-implementation validation steps. |
| progress | `integer(32)` | YES | `0` | Overall completion percentage (0-100). Calculated from phase_progress. |
| phase | `character varying(50)` | YES | `'planning'::character varying` | Current LEO phase: LEAD_PRE_APPROVAL, PLAN_PRD, EXEC_IMPL, PLAN_VERIFY, LEAD_FINAL. |
| phase_progress | `jsonb` | YES | `'{}'::jsonb` | JSONB object: Progress breakdown by phase. Format: { LEAD: 100, PLAN: 100, EXEC: 50, ... } |
| risks | `jsonb` | YES | `'[]'::jsonb` | JSONB array: Identified risks and mitigation strategies. Format: [{ risk, impact, probability, mitigation }] |
| constraints | `jsonb` | YES | `'[]'::jsonb` | JSONB array: Project constraints (time, budget, resources, technical). Format: [{ type, constraint, impact }] |
| assumptions | `jsonb` | YES | `'[]'::jsonb` | JSONB array: Assumptions made during planning. Format: [{ assumption, validation_method }] |
| stakeholders | `jsonb` | YES | `'[]'::jsonb` | JSONB array: Key stakeholders and their roles. Format: [{ name, role, involvement_level }] |
| approved_by | `character varying(100)` | YES | - | User ID or name of person who approved this PRD. Set during LEAD final approval. |
| approval_date | `timestamp without time zone` | YES | - | Timestamp when PRD was approved. Marks transition from draft to approved status. |
| planned_start | `timestamp without time zone` | YES | - | Planned start date for EXEC implementation phase. Estimated during PLAN phase. |
| planned_end | `timestamp without time zone` | YES | - | Planned completion date for entire SD. Used for roadmap planning. |
| actual_start | `timestamp without time zone` | YES | - | Actual start timestamp when EXEC phase began. Auto-set when status changes to in_progress. |
| actual_end | `timestamp without time zone` | YES | - | Actual completion timestamp when LEAD marked SD complete. Auto-set when status changes to completed. |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | Timestamp when PRD was created. Auto-set to NOW() on insert. |
| updated_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | Timestamp of last modification. Auto-updated via trigger on any column change. |
| created_by | `character varying(100)` | YES | `'PLAN'::character varying` | User ID or agent code that created this PRD. Typically "PLAN" agent or human user ID. |
| updated_by | `character varying(100)` | YES | - | User ID or agent code that last modified this PRD. Updated with each change. |
| metadata | `jsonb` | YES | `'{}'::jsonb` | JSONB object: Flexible metadata storage. Custom fields, integrations, temporary data. Format: { key: value } |
| content | `text` | YES | - | Full markdown content of PRD. Can be used for markdown-based PRD generation or legacy compatibility. |
| evidence_appendix | `text` | YES | - | Supporting evidence and artifacts. Screenshots, logs, research findings. Appended to PRD for reference. |
| backlog_items | `jsonb` | YES | `'[]'::jsonb` | JSONB array: Linked backlog items from sd_backlog_map. Cached for quick access. Format: [{ id, title, status }] |
| sd_id | `character varying(50)` | YES | - | Strategic directive ID - unified column for pipeline compatibility. Mirrors directive_id for legacy support. |
| planning_section | `jsonb` | YES | `'{"quality_gates": [], "risk_analysis": {}, "success_metrics": [], "timeline_breakdown": {}, "implementation_steps": [], "reasoning_depth_used": "standard", "resource_requirements": {}}'::jsonb` | Structured planning information including implementation steps, risks, resources, and timeline. Generated by PRD Expert sub-agent. |
| reasoning_analysis | `jsonb` | YES | `'{}'::jsonb` | Full chain-of-thought reasoning results from automatic analysis. Captures AI decision-making process. |
| complexity_analysis | `jsonb` | YES | `'{}'::jsonb` | Complexity scoring and trigger analysis results. Used by sub-agents to assess SD difficulty. |
| reasoning_depth | `character varying(20)` | YES | `'standard'::character varying` | Depth of reasoning used (quick, standard, deep, ultra). Determines analysis thoroughness. |
| confidence_score | `integer(32)` | YES | - | Confidence score (0-100) from reasoning analysis. Higher = more certain about planning accuracy. |
| sd_uuid | `uuid` | **NO** | - | Foreign key to strategic_directives_v2.uuid_id. Use this for all queries requiring UUID joins. |
| research_confidence_score | `numeric(3,2)` | YES | - | Confidence score for automated research results (0.7-0.85: human review, >0.85: auto-applied) |

## Constraints

### Primary Key
- `product_requirements_v2_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `fk_prd_sd`: sd_uuid → strategic_directives_v2(uuid_id)
- `prd_sd_fk`: sd_id → strategic_directives_v2(id)

### Check Constraints
- `acceptance_criteria_required`: CHECK (((acceptance_criteria IS NOT NULL) AND ((acceptance_criteria -> 0) IS NOT NULL)))
- `functional_requirements_min_count`: CHECK (((functional_requirements IS NOT NULL) AND ((functional_requirements -> 0) IS NOT NULL) AND ((functional_requirements -> 1) IS NOT NULL) AND ((functional_requirements -> 2) IS NOT NULL)))
- `product_requirements_v2_confidence_score_check`: CHECK (((confidence_score >= 0) AND (confidence_score <= 100)))
- `product_requirements_v2_reasoning_depth_check`: CHECK (((reasoning_depth)::text = ANY ((ARRAY['quick'::character varying, 'standard'::character varying, 'deep'::character varying, 'ultra'::character varying])::text[])))
- `product_requirements_v2_research_confidence_score_check`: CHECK (((research_confidence_score >= (0)::numeric) AND (research_confidence_score <= (1)::numeric)))
- `test_scenarios_required`: CHECK (((test_scenarios IS NOT NULL) AND ((test_scenarios -> 0) IS NOT NULL)))

## Indexes

- `idx_prd_confidence_score`
  ```sql
  CREATE INDEX idx_prd_confidence_score ON public.product_requirements_v2 USING btree (confidence_score DESC)
  ```
- `idx_prd_created_at`
  ```sql
  CREATE INDEX idx_prd_created_at ON public.product_requirements_v2 USING btree (created_at DESC)
  ```
- `idx_prd_directive`
  ```sql
  CREATE INDEX idx_prd_directive ON public.product_requirements_v2 USING btree (directive_id)
  ```
- `idx_prd_phase`
  ```sql
  CREATE INDEX idx_prd_phase ON public.product_requirements_v2 USING btree (phase)
  ```
- `idx_prd_priority`
  ```sql
  CREATE INDEX idx_prd_priority ON public.product_requirements_v2 USING btree (priority)
  ```
- `idx_prd_reasoning_depth`
  ```sql
  CREATE INDEX idx_prd_reasoning_depth ON public.product_requirements_v2 USING btree (reasoning_depth)
  ```
- `idx_prd_sd_uuid`
  ```sql
  CREATE INDEX idx_prd_sd_uuid ON public.product_requirements_v2 USING btree (sd_uuid)
  ```
- `idx_prd_status`
  ```sql
  CREATE INDEX idx_prd_status ON public.product_requirements_v2 USING btree (status)
  ```
- `idx_product_requirements_sd_uuid`
  ```sql
  CREATE INDEX idx_product_requirements_sd_uuid ON public.product_requirements_v2 USING btree (sd_uuid)
  ```
- `idx_product_requirements_v2_sd_id`
  ```sql
  CREATE INDEX idx_product_requirements_v2_sd_id ON public.product_requirements_v2 USING btree (sd_id)
  ```
- `product_requirements_v2_pkey`
  ```sql
  CREATE UNIQUE INDEX product_requirements_v2_pkey ON public.product_requirements_v2 USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_product_requirements_v2 (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_product_requirements_v2 (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### audit_product_requirements

- **Timing**: AFTER INSERT
- **Action**: `EXECUTE FUNCTION governance_audit_trigger()`

### audit_product_requirements

- **Timing**: AFTER DELETE
- **Action**: `EXECUTE FUNCTION governance_audit_trigger()`

### audit_product_requirements

- **Timing**: AFTER UPDATE
- **Action**: `EXECUTE FUNCTION governance_audit_trigger()`

### planning_section_auto_update_trigger

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION update_planning_section_from_reasoning()`

### planning_section_auto_update_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_planning_section_from_reasoning()`

### trigger_auto_populate_prd_sd_uuid

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION auto_populate_prd_sd_uuid()`

### trigger_auto_populate_prd_sd_uuid

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION auto_populate_prd_sd_uuid()`

### update_prd_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at()`

## Usage Examples

_Common query patterns for this table:_


```javascript
// Get PRD by PRD ID
const { data, error } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('prd_id', 'PRD-XXX-001')
  .single();

// Get PRD with linked SD
const { data, error } = await supabase
  .from('product_requirements_v2')
  .select(`
    *,
    strategic_directive:strategic_directives_v2(sd_id, title, status)
  `)
  .eq('prd_id', 'PRD-XXX-001')
  .single();
```
---

[← Back to Schema Overview](../database-schema-overview.md)
