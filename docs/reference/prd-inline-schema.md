# PRD Inline Generation Schema Reference

**Purpose**: When Claude Code generates PRDs inline (no external API), use this as the field reference.

## DB Table: `product_requirements_v2`

### Required Fields (Hard Gates)

| Field | Type | Constraint |
|-------|------|-----------|
| `id` | VARCHAR(100) | `PRD-{SD_ID}` |
| `directive_id` | UUID | FK to `strategic_directives_v2.uuid_id` |
| `title` | VARCHAR(500) | NOT NULL |
| `status` | VARCHAR(50) | `draft` for new PRDs |
| `category` | VARCHAR(50) | `technical` |
| `priority` | VARCHAR(20) | `critical`/`high`/`medium`/`low` |
| `version` | VARCHAR(20) | `1.0` |
| `phase` | VARCHAR(50) | `planning` |
| `created_by` | VARCHAR(100) | `PLAN` |

### Content Fields (TEXT)

| Field | Constraint |
|-------|-----------|
| `executive_summary` | 100-300 chars ONLY. Concise goal statement. |
| `business_context` | Business justification |
| `technical_context` | Technical baseline |
| `system_architecture` | Components, data flow, integration points (stringify if object) |
| `implementation_approach` | Phased approach with deliverables (stringify if object) |
| `content` | Full markdown PRD document |

### JSONB Array Fields (Minimum Counts)

| Field | Min | Item Structure |
|-------|-----|---------------|
| `functional_requirements` | **5** | `{id, requirement, description, priority, acceptance_criteria: string[]}` |
| `technical_requirements` | **3** | `{id, requirement, rationale}` |
| `non_functional_requirements` | 0 | Same as functional |
| `test_scenarios` | **5** | `{id, scenario, test_type, given, when, then}` |
| `acceptance_criteria` | **3** | Array of specific, measurable strings |
| `risks` | **3** | `{risk, probability, impact, mitigation, rollback_plan}` |

### JSONB Object Fields

| Field | Required For | Structure |
|-------|-------------|-----------|
| `integration_operationalization` | feature/bugfix SDs | 5 subsections: `consumers`, `dependencies`, `data_contracts`, `runtime_config`, `observability_rollout` |
| `exploration_summary` | All | `{files_read[], patterns_identified[], key_decisions[], exploration_date}` |
| `metadata` | All | `{generated_by, generation_method: 'inline-direct', grounding_confidence}` |

### Forbidden Patterns (Instant Fail)
- `TBD`, `TBA`, `To be defined`, `Will be determined`, `To be specified`
- Generic: `Define requirements`, `placeholder`, `TODO`

### Quality Rubric (40/30/20/10 Weights)
1. **Requirements Depth** (40%): Specific, actionable, complete acceptance criteria
2. **Architecture Quality** (30%): Named components, data flow, integration points
3. **Test Sophistication** (20%): Happy path + edge cases + error scenarios
4. **Risk Completeness** (10%): Specific risks with concrete mitigations + rollback

### SD-Type-Specific Rules
- **infrastructure**: Skip `integration_operationalization`. Focus on tooling, scripts, automation.
- **feature/bugfix**: `integration_operationalization` REQUIRED with all 5 subsections.
- **fix**: Lighter requirements (3 functional, 2 technical acceptable).
