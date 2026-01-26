<!-- ARCHIVED: 2026-01-26T16:26:49.956Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-14\08_configurability-matrix.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 14 Configurability Matrix


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: api, schema, feature, validation

## Tunable Parameters

### 1. Metrics Thresholds

#### Readiness Score
- **Parameter**: `readiness_score_threshold`
- **Current Value**: Undefined (gap identified)
- **Recommended Value**: 90/100
- **Valid Range**: 70-100
- **Impact**: Stage 14 exit gate blocking condition
- **Rationale**: 90% readiness ensures development can proceed without major blockers

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:611 "Readiness score"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-14.md:36-39 "Missing: Threshold values, measurement frequency"

#### Team Velocity Estimate
- **Parameter**: `team_velocity_min`
- **Current Value**: TBD (establish baseline after sprint 1)
- **Recommended Value**: 20 story points per sprint (2-week sprint)
- **Valid Range**: 10-50 story points
- **Impact**: Sprint planning feasibility check
- **Rationale**: Industry average for 5-person team is 20-30 points

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:612 "Team velocity"

#### Infrastructure Stability
- **Parameter**: `infrastructure_uptime_min`
- **Current Value**: Undefined (gap identified)
- **Recommended Value**: 99.5%
- **Valid Range**: 95.0-99.9%
- **Impact**: Environment readiness gate
- **Rationale**: 99.5% allows 3.6 hours downtime per month, acceptable for dev env

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:613 "Infrastructure stability"

### 2. Quality Gate Thresholds

#### Entry Gate: Technical Plan Approval
- **Parameter**: `technical_plan_approval_authority`
- **Current Value**: EXEC or Chairman
- **Configurable Values**: ["EXEC", "Chairman", "Tech Lead"]
- **Impact**: Who can approve Stage 14 entry
- **Rationale**: EXEC has implementation authority, Chairman for strategic ventures

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:616 "Technical plan approved"

#### Entry Gate: Resource Allocation
- **Parameter**: `resource_allocation_min_percent`
- **Current Value**: 100% (all resources allocated)
- **Recommended Value**: 80% (allows 20% contingency)
- **Valid Range**: 70-100%
- **Impact**: Stage 14 entry gate flexibility
- **Rationale**: 80% allows stage to begin while finalizing edge case resources

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:617 "Resources allocated"

#### Exit Gate: Environment Ready
- **Parameter**: `environment_ready_criteria`
- **Current Value**: [Dev environment configured, CI/CD pipeline ready, Tools provisioned]
- **Configurable**: Add/remove criteria based on project needs
- **Impact**: Stage 14 exit gate conditions
- **Rationale**: Smaller projects may not need full CI/CD initially

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:619 "Environment ready"

#### Exit Gate: Team Assembled
- **Parameter**: `team_roles_filled_min_percent`
- **Current Value**: 100% (all roles filled)
- **Recommended Value**: 90% (allows 1-2 open roles for 10-person team)
- **Valid Range**: 80-100%
- **Impact**: Team formation completion criteria
- **Rationale**: Core roles filled, supporting roles can be added in sprint 1

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:620 "Team assembled"

#### Exit Gate: First Sprint Planned
- **Parameter**: `sprint_planning_horizon`
- **Current Value**: Sprint 1 only
- **Recommended Value**: Sprints 1-3 (6 weeks)
- **Valid Range**: 1-5 sprints
- **Impact**: Planning depth before development begins
- **Rationale**: 3 sprints provides runway without over-planning

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:621 "First sprint planned"

### 3. Substage Completion Criteria

#### Substage 14.1: Environment Setup
- **Parameter**: `required_environments`
- **Current Value**: ["dev", "staging"]
- **Configurable Values**: ["dev", "staging", "production", "test"]
- **Impact**: Number of environments to provision
- **Rationale**: Smaller projects may only need dev initially

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:626 "Dev environment configured"

- **Parameter**: `ci_cd_pipeline_coverage_min`
- **Current Value**: Undefined
- **Recommended Value**: 80% (build, test, deploy to staging)
- **Valid Range**: 50-100%
- **Impact**: CI/CD completeness for exit gate
- **Rationale**: 80% covers core pipeline, advanced features can be added later

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:627 "CI/CD pipeline ready"

#### Substage 14.2: Team Formation
- **Parameter**: `onboarding_completion_days`
- **Current Value**: Undefined
- **Recommended Value**: 5 business days
- **Valid Range**: 3-10 days
- **Impact**: Time allocated for team member onboarding
- **Rationale**: 5 days allows environment setup + codebase orientation

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:633 "Team assembled"

- **Parameter**: `raci_approval_quorum`
- **Current Value**: 100% (all team members)
- **Recommended Value**: 80% (majority approval)
- **Valid Range**: 50-100%
- **Impact**: RACI matrix approval threshold
- **Rationale**: 80% prevents single holdout blocking team formation

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:631 "Roles defined"

#### Substage 14.3: Sprint Planning
- **Parameter**: `sprint_duration_weeks`
- **Current Value**: Undefined
- **Recommended Value**: 2 weeks
- **Valid Range**: 1-4 weeks
- **Impact**: Sprint length for velocity calculation
- **Rationale**: 2 weeks is industry standard (Scrum default)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:639 "First sprint planned"

- **Parameter**: `backlog_depth_sprints`
- **Current Value**: Undefined (critique recommends ≥3 sprints)
- **Recommended Value**: 3 sprints
- **Valid Range**: 2-5 sprints
- **Impact**: Backlog planning horizon
- **Rationale**: 3 sprints (6 weeks) provides runway without over-planning

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:638 "Backlog created"

### 4. Rollback Triggers

#### Infrastructure Failures
- **Parameter**: `infrastructure_failure_max_attempts`
- **Current Value**: Undefined (critique identifies gap)
- **Recommended Value**: 3 attempts
- **Valid Range**: 2-5 attempts
- **Impact**: Rollback trigger for environment setup failures
- **Rationale**: 3 attempts allows transient issues but prevents infinite loops

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-14.md:47-50 "Current: No rollback defined"

#### Team Assembly Delays
- **Parameter**: `critical_role_unfilled_max_days`
- **Current Value**: Undefined
- **Recommended Value**: 14 days
- **Valid Range**: 7-30 days
- **Impact**: Rollback trigger for recruitment failures
- **Rationale**: 14 days allows thorough search but prevents indefinite delays

#### CI/CD Validation Failures
- **Parameter**: `ci_cd_validation_max_failures`
- **Current Value**: Undefined
- **Recommended Value**: 3 consecutive failures
- **Valid Range**: 2-5 failures
- **Impact**: Rollback trigger for pipeline issues
- **Rationale**: 3 failures indicates systematic issue, not transient error

### 5. Automation Configuration

#### Automation Level
- **Parameter**: `automation_target_percent`
- **Current Value**: 20% (manual process)
- **Recommended Value**: 80% (assisted/auto)
- **Valid Range**: 0-100%
- **Impact**: Degree of manual intervention required
- **Rationale**: 80% automation reduces human error and speeds execution

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:642 "progression_mode: Manual → Assisted → Auto"
**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-14.md:31-34 "Current State: Manual process, Target: 80%"

#### Auto-Approval Thresholds
- **Parameter**: `auto_approve_environment_setup`
- **Current Value**: false (manual approval required)
- **Recommended Value**: true (if all smoke tests pass)
- **Valid Range**: [true, false]
- **Impact**: Whether environment setup can auto-approve
- **Rationale**: Smoke tests provide sufficient validation for standard setups

### 6. Measurement Frequency

#### Metrics Collection Interval
- **Parameter**: `metrics_collection_frequency`
- **Current Value**: Undefined (critique identifies gap)
- **Recommended Value**: Daily during Stage 14 execution
- **Valid Range**: ["hourly", "daily", "weekly"]
- **Impact**: How often metrics are collected and reported
- **Rationale**: Daily provides visibility without overhead

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-14.md:36-39 "Missing: Threshold values, measurement frequency"

#### Infrastructure Monitoring Interval
- **Parameter**: `infrastructure_monitoring_interval`
- **Current Value**: Undefined
- **Recommended Value**: Real-time (5-minute intervals)
- **Valid Range**: ["real-time", "hourly", "daily"]
- **Impact**: How quickly infrastructure issues are detected
- **Rationale**: Real-time enables rapid response to outages

## Configuration Schema

```yaml
stage_14_configuration:
  metrics:
    readiness_score_threshold: 90  # 70-100
    team_velocity_min: 20          # 10-50 story points per sprint
    infrastructure_uptime_min: 99.5  # 95.0-99.9%

  gates:
    entry:
      technical_plan_approval_authority: ["EXEC", "Chairman"]
      resource_allocation_min_percent: 80  # 70-100%
    exit:
      environment_ready_criteria:
        - "Dev environment configured"
        - "CI/CD pipeline ready"
        - "Tools provisioned"
      team_roles_filled_min_percent: 90  # 80-100%
      sprint_planning_horizon: 3  # 1-5 sprints

  substages:
    environment_setup:
      required_environments: ["dev", "staging"]
      ci_cd_pipeline_coverage_min: 80  # 50-100%
    team_formation:
      onboarding_completion_days: 5  # 3-10 days
      raci_approval_quorum: 80  # 50-100%
    sprint_planning:
      sprint_duration_weeks: 2  # 1-4 weeks
      backlog_depth_sprints: 3  # 2-5 sprints

  rollback:
    infrastructure_failure_max_attempts: 3  # 2-5
    critical_role_unfilled_max_days: 14  # 7-30
    ci_cd_validation_max_failures: 3  # 2-5

  automation:
    automation_target_percent: 80  # 0-100%
    auto_approve_environment_setup: true  # true/false

  monitoring:
    metrics_collection_frequency: "daily"  # hourly/daily/weekly
    infrastructure_monitoring_interval: "real-time"  # real-time/hourly/daily
```

## Configuration Override Patterns

### Per-Venture Overrides
Allow individual ventures to override default thresholds based on:
- **Venture size**: Larger ventures may require higher readiness scores
- **Risk profile**: High-risk ventures may require stricter gate criteria
- **Timeline urgency**: Urgent ventures may reduce planning horizon

```python
def apply_venture_configuration_overrides(venture_id: str, base_config: dict) -> dict:
    """Apply venture-specific configuration overrides."""
    venture = get_venture(venture_id)

    if venture.risk_profile == "HIGH":
        base_config['metrics']['readiness_score_threshold'] = 95
        base_config['gates']['exit']['team_roles_filled_min_percent'] = 100

    if venture.timeline_urgency == "CRITICAL":
        base_config['substages']['sprint_planning']['backlog_depth_sprints'] = 2
        base_config['monitoring']['metrics_collection_frequency'] = "hourly"

    return base_config
```

### Environment-Based Overrides
Allow different configurations for dev/staging/production:
- **Development**: Relaxed thresholds for experimentation
- **Staging**: Moderate thresholds for validation
- **Production**: Strict thresholds for stability

```python
def get_environment_config(environment: str) -> dict:
    """Get configuration specific to environment type."""
    configs = {
        "development": {
            "infrastructure_uptime_min": 95.0,
            "ci_cd_pipeline_coverage_min": 60
        },
        "staging": {
            "infrastructure_uptime_min": 98.0,
            "ci_cd_pipeline_coverage_min": 80
        },
        "production": {
            "infrastructure_uptime_min": 99.9,
            "ci_cd_pipeline_coverage_min": 100
        }
    }
    return configs.get(environment, configs["development"])
```

## Immutable vs Configurable Parameters

### Immutable (Core Identity)
- **Stage ID**: 14
- **Stage Title**: "Comprehensive Development Preparation"
- **Dependency**: Stage 13 (cannot change)
- **Substage Count**: 3 (14.1, 14.2, 14.3)

### Configurable (Tunable)
- All metrics thresholds
- Gate criteria percentages
- Rollback trigger values
- Automation levels
- Measurement frequencies

### Advisory (Non-Enforced)
- `progression_mode`: Manual → Assisted → Auto (roadmap guidance)
- Industry benchmark suggestions
- Best practice recommendations

## Configuration Validation Rules

```python
def validate_stage_14_configuration(config: dict) -> list[str]:
    """Validate Stage 14 configuration parameters."""
    errors = []

    # Validate metrics thresholds
    if not 70 <= config['metrics']['readiness_score_threshold'] <= 100:
        errors.append("readiness_score_threshold must be 70-100")

    if not 10 <= config['metrics']['team_velocity_min'] <= 50:
        errors.append("team_velocity_min must be 10-50")

    if not 95.0 <= config['metrics']['infrastructure_uptime_min'] <= 99.9:
        errors.append("infrastructure_uptime_min must be 95.0-99.9")

    # Validate gate thresholds
    if not 70 <= config['gates']['entry']['resource_allocation_min_percent'] <= 100:
        errors.append("resource_allocation_min_percent must be 70-100")

    if not 80 <= config['gates']['exit']['team_roles_filled_min_percent'] <= 100:
        errors.append("team_roles_filled_min_percent must be 80-100")

    # Validate automation level
    if not 0 <= config['automation']['automation_target_percent'] <= 100:
        errors.append("automation_target_percent must be 0-100")

    return errors
```

## Default vs Recommended vs Minimum Configurations

### Default Configuration (Conservative)
- Readiness score: 90/100
- Team roles filled: 90%
- Infrastructure uptime: 99.5%
- Backlog depth: 3 sprints

### Recommended Configuration (Balanced)
- Readiness score: 85/100
- Team roles filled: 85%
- Infrastructure uptime: 98.0%
- Backlog depth: 2 sprints

### Minimum Configuration (MVP)
- Readiness score: 70/100
- Team roles filled: 80%
- Infrastructure uptime: 95.0%
- Backlog depth: 1 sprint

**Rationale**: Default provides safety margin, Recommended balances speed and quality, Minimum enables rapid prototyping

## Source Tables

| Source File | Lines | Content Type |
|-------------|-------|--------------|
| docs/workflow/stages.yaml | 597-642 | Stage 14 definition with tunable parameters |
| docs/workflow/critique/stage-14.md | 36-39 | Metrics gaps (thresholds, frequency undefined) |

<!-- Generated by Claude Code Phase 7 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
