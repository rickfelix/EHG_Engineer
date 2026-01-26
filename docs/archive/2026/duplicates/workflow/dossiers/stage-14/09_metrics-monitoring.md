<!-- ARCHIVED: 2026-01-26T16:26:51.805Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-14\09_metrics-monitoring.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 14 Metrics & Monitoring


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, unit, schema, infrastructure

## Key Performance Indicators (KPIs)

### 1. Readiness Score

**Definition**: Composite score measuring overall development preparation readiness
**Calculation**: (Environment Readiness % + Team Readiness % + Sprint Readiness %) / 3
**Target**: ≥90/100
**Unit**: Percentage (0-100)
**Measurement Frequency**: Daily during Stage 14 execution

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:611 "Readiness score"

#### Component Breakdown

**Environment Readiness** (0-100):
```python
def calculate_environment_readiness(venture_id: str) -> float:
    """Calculate environment readiness component."""
    checks = {
        'dev_environment_accessible': 25,  # All developers can access
        'ci_cd_pipeline_passing': 30,      # Pipeline passes smoke test
        'staging_environment_ready': 20,   # Staging env provisioned
        'monitoring_configured': 15,       # Alerts and dashboards setup
        'tools_provisioned': 10            # All required tools accessible
    }

    score = sum([
        checks[check] for check in checks
        if check_passed(venture_id, check)
    ])

    return score  # 0-100
```

**Team Readiness** (0-100):
```python
def calculate_team_readiness(venture_id: str) -> float:
    """Calculate team readiness component."""
    checks = {
        'roles_filled': 40,                # % of roles filled
        'onboarding_complete': 30,         # All onboarded
        'raci_approved': 20,               # RACI matrix approved
        'team_kickoff_held': 10            # Kickoff meeting complete
    }

    score = sum([
        checks[check] for check in checks
        if check_passed(venture_id, check)
    ])

    return score  # 0-100
```

**Sprint Readiness** (0-100):
```python
def calculate_sprint_readiness(venture_id: str) -> float:
    """Calculate sprint planning readiness component."""
    checks = {
        'backlog_created': 30,             # Backlog exists
        'sprint_1_planned': 25,            # Sprint 1 scheduled
        'velocity_estimated': 20,          # Velocity calculated
        'ceremonies_scheduled': 15,        # Standup/review/retro scheduled
        'sprint_goal_defined': 10          # Clear sprint goal
    }

    score = sum([
        checks[check] for check in checks
        if check_passed(venture_id, check)
    ])

    return score  # 0-100
```

**Overall Readiness Score**:
```python
def calculate_readiness_score(venture_id: str) -> float:
    """Calculate overall Stage 14 readiness score."""
    env_readiness = calculate_environment_readiness(venture_id)
    team_readiness = calculate_team_readiness(venture_id)
    sprint_readiness = calculate_sprint_readiness(venture_id)

    return (env_readiness + team_readiness + sprint_readiness) / 3
```

**SQL Query**:
```sql
-- Track readiness score over time
SELECT
    venture_id,
    date_recorded,
    environment_readiness,
    team_readiness,
    sprint_readiness,
    (environment_readiness + team_readiness + sprint_readiness) / 3 AS overall_readiness
FROM stage_14_metrics
WHERE venture_id = :venture_id
    AND date_recorded >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY date_recorded DESC;
```

### 2. Team Velocity

**Definition**: Estimated story points per sprint based on team capacity
**Calculation**: Team Capacity × Utilization Rate × Complexity Factor
**Target**: ≥20 story points per sprint (baseline TBD after sprint 1)
**Unit**: Story points per sprint
**Measurement Frequency**: Per sprint (updated after each sprint completion)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:612 "Team velocity"

#### Velocity Calculation Formula

```python
def calculate_team_velocity(venture_id: str) -> float:
    """Calculate estimated team velocity for sprint planning."""
    team = get_team(venture_id)
    sprint_duration_days = get_sprint_duration(venture_id)

    # Team capacity (available hours)
    team_capacity = sum([
        member.hours_per_sprint
        for member in team.members
    ])

    # Utilization rate (account for meetings, interruptions)
    utilization_rate = 0.75  # 75% (25% overhead)

    # Complexity factor (story points per hour)
    # Industry average: 1 story point = 4-6 hours
    complexity_factor = 1 / 5  # 0.2 points per hour

    velocity = team_capacity * utilization_rate * complexity_factor

    return round(velocity, 1)

# Example: 5 people × 8 hours/day × 10 days = 400 hours
# 400 hours × 0.75 utilization = 300 productive hours
# 300 hours × 0.2 points/hour = 60 story points per sprint
```

**SQL Query**:
```sql
-- Track team velocity trends
SELECT
    venture_id,
    sprint_number,
    estimated_velocity,
    actual_velocity,
    (actual_velocity - estimated_velocity) AS variance,
    (actual_velocity / NULLIF(estimated_velocity, 0) * 100) AS accuracy_percent
FROM sprint_metrics
WHERE venture_id = :venture_id
ORDER BY sprint_number DESC
LIMIT 10;
```

**Velocity Benchmarks**:
- **Small team (3-4 people)**: 15-25 points per sprint
- **Medium team (5-7 people)**: 25-40 points per sprint
- **Large team (8-10 people)**: 40-60 points per sprint

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-14.md:36-39 "Missing: Threshold values, measurement frequency"

### 3. Infrastructure Stability

**Definition**: Uptime percentage of development environment
**Calculation**: (Total Uptime / Total Time) × 100
**Target**: ≥99.5%
**Unit**: Percentage (0-100)
**Measurement Frequency**: Real-time monitoring (5-minute intervals)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:613 "Infrastructure stability"

#### Stability Calculation

```python
def calculate_infrastructure_stability(venture_id: str, time_window_hours: int = 24) -> float:
    """Calculate infrastructure stability over time window."""
    import datetime

    end_time = datetime.datetime.now()
    start_time = end_time - datetime.timedelta(hours=time_window_hours)

    # Query monitoring data
    uptime_events = get_uptime_events(venture_id, start_time, end_time)

    total_time = time_window_hours * 60  # minutes
    downtime = sum([event.duration_minutes for event in uptime_events if event.status == 'DOWN'])

    uptime = total_time - downtime
    stability = (uptime / total_time) * 100

    return round(stability, 2)
```

**SQL Query**:
```sql
-- Infrastructure stability over last 30 days
SELECT
    venture_id,
    DATE_TRUNC('day', timestamp) AS date,
    COUNT(*) FILTER (WHERE status = 'UP') AS up_checks,
    COUNT(*) FILTER (WHERE status = 'DOWN') AS down_checks,
    (COUNT(*) FILTER (WHERE status = 'UP')::float / COUNT(*) * 100) AS uptime_percent
FROM infrastructure_health_checks
WHERE venture_id = :venture_id
    AND timestamp >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY venture_id, DATE_TRUNC('day', timestamp)
ORDER BY date DESC;
```

**Stability Thresholds**:
- **Production**: ≥99.9% (8.76 hours downtime per year)
- **Staging**: ≥99.5% (3.6 hours downtime per month)
- **Development**: ≥99.0% (7.2 hours downtime per month)

**Allowed Downtime**:
- 99.9%: 43.2 minutes per month
- 99.5%: 3.6 hours per month
- 99.0%: 7.2 hours per month

## Supporting Metrics

### 4. Environment Setup Duration

**Definition**: Time to complete Substage 14.1 (Environment Setup)
**Target**: ≤5 business days
**Unit**: Days
**Measurement Frequency**: Per venture

**SQL Query**:
```sql
-- Average environment setup duration
SELECT
    AVG(
        EXTRACT(EPOCH FROM (substage_14_1_end_time - substage_14_1_start_time)) / 86400
    ) AS avg_duration_days,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
        EXTRACT(EPOCH FROM (substage_14_1_end_time - substage_14_1_start_time)) / 86400
    ) AS median_duration_days
FROM stage_14_substages
WHERE substage_id = '14.1'
    AND substage_14_1_end_time IS NOT NULL;
```

### 5. Team Assembly Time

**Definition**: Time to complete Substage 14.2 (Team Formation)
**Target**: ≤10 business days
**Unit**: Days
**Measurement Frequency**: Per venture

**SQL Query**:
```sql
-- Track team assembly duration
SELECT
    venture_id,
    roles_required,
    roles_filled,
    (roles_filled::float / roles_required * 100) AS fill_rate_percent,
    EXTRACT(EPOCH FROM (team_assembly_complete_time - team_assembly_start_time)) / 86400 AS duration_days
FROM stage_14_substages
WHERE substage_id = '14.2'
ORDER BY venture_id DESC;
```

### 6. Sprint Planning Efficiency

**Definition**: Time to complete Substage 14.3 (Sprint Planning)
**Target**: ≤3 business days
**Unit**: Days
**Measurement Frequency**: Per venture

**SQL Query**:
```sql
-- Sprint planning efficiency
SELECT
    venture_id,
    backlog_items_count,
    sprint_1_items_count,
    EXTRACT(EPOCH FROM (sprint_planning_complete_time - sprint_planning_start_time)) / 86400 AS duration_days,
    (sprint_1_items_count::float / backlog_items_count * 100) AS sprint_1_coverage_percent
FROM stage_14_substages
WHERE substage_id = '14.3'
ORDER BY venture_id DESC;
```

### 7. Stage 14 Total Duration

**Definition**: Total time from Stage 14 entry to exit
**Target**: ≤15 business days
**Unit**: Days
**Measurement Frequency**: Per venture

**SQL Query**:
```sql
-- Stage 14 total duration with variance analysis
SELECT
    venture_id,
    EXTRACT(EPOCH FROM (stage_14_exit_time - stage_14_entry_time)) / 86400 AS duration_days,
    15 AS target_days,
    EXTRACT(EPOCH FROM (stage_14_exit_time - stage_14_entry_time)) / 86400 - 15 AS variance_days,
    CASE
        WHEN EXTRACT(EPOCH FROM (stage_14_exit_time - stage_14_entry_time)) / 86400 <= 15 THEN 'ON_TIME'
        WHEN EXTRACT(EPOCH FROM (stage_14_exit_time - stage_14_entry_time)) / 86400 <= 20 THEN 'DELAYED'
        ELSE 'CRITICAL_DELAY'
    END AS status
FROM stage_execution
WHERE stage_id = 14
ORDER BY venture_id DESC;
```

### 8. Rollback/Recursion Rate

**Definition**: Percentage of Stage 14 executions requiring rollback or recursion
**Target**: <10%
**Unit**: Percentage
**Measurement Frequency**: Monthly

**SQL Query**:
```sql
-- Rollback and recursion rate for Stage 14
SELECT
    DATE_TRUNC('month', stage_14_entry_time) AS month,
    COUNT(*) AS total_executions,
    COUNT(*) FILTER (WHERE rollback_triggered = TRUE) AS rollback_count,
    COUNT(*) FILTER (WHERE recursion_triggered = TRUE) AS recursion_count,
    (COUNT(*) FILTER (WHERE rollback_triggered = TRUE OR recursion_triggered = TRUE)::float / COUNT(*) * 100) AS failure_rate_percent
FROM stage_execution
WHERE stage_id = 14
    AND stage_14_entry_time >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', stage_14_entry_time)
ORDER BY month DESC;
```

## Dashboard Specifications

### Stage 14 Overview Dashboard

**Panel 1: Readiness Score Gauge**
- Visualization: Gauge chart
- Data Source: `calculate_readiness_score(venture_id)`
- Thresholds:
  - Red: <70
  - Yellow: 70-89
  - Green: ≥90
- Refresh: 5 minutes

**Panel 2: Environment Readiness Breakdown**
- Visualization: Horizontal bar chart
- Data Source: `calculate_environment_readiness(venture_id)` components
- Shows: Dev environment, CI/CD, Staging, Monitoring, Tools
- Refresh: 5 minutes

**Panel 3: Team Readiness Breakdown**
- Visualization: Horizontal bar chart
- Data Source: `calculate_team_readiness(venture_id)` components
- Shows: Roles filled, Onboarding, RACI, Kickoff
- Refresh: 5 minutes

**Panel 4: Sprint Readiness Breakdown**
- Visualization: Horizontal bar chart
- Data Source: `calculate_sprint_readiness(venture_id)` components
- Shows: Backlog, Sprint 1, Velocity, Ceremonies, Goal
- Refresh: 5 minutes

**Panel 5: Infrastructure Stability Timeline**
- Visualization: Line chart (24-hour window)
- Data Source: `calculate_infrastructure_stability(venture_id, 24)`
- Y-axis: Uptime % (95-100)
- X-axis: Time
- Threshold line: 99.5%
- Refresh: 5 minutes

**Panel 6: Stage 14 Progress**
- Visualization: Checklist/progress bars
- Data Source: Substage completion status
- Shows: 14.1 (0-100%), 14.2 (0-100%), 14.3 (0-100%)
- Refresh: 5 minutes

### Stage 14 Historical Trends Dashboard

**Panel 1: Stage 14 Duration Trends**
- Visualization: Line chart (last 20 ventures)
- Data Source: Stage 14 total duration query
- Y-axis: Duration (days)
- X-axis: Venture ID
- Target line: 15 days
- Shows: Min, Max, Avg, Median

**Panel 2: Team Velocity Estimation Accuracy**
- Visualization: Scatter plot
- Data Source: Estimated vs Actual velocity
- X-axis: Estimated velocity
- Y-axis: Actual velocity (from sprint 1)
- Diagonal line: Perfect accuracy
- Shows: Variance %

**Panel 3: Rollback/Recursion Rate**
- Visualization: Stacked bar chart (monthly)
- Data Source: Rollback/recursion rate query
- Shows: Normal completions, Rollbacks, Recursions
- Target line: <10% failure rate

**Panel 4: Substage Duration Comparison**
- Visualization: Grouped bar chart
- Data Source: Substage duration queries
- Shows: 14.1, 14.2, 14.3 average durations
- Grouped by: Venture size (small, medium, large)

## Alerting Rules

### Critical Alerts (Immediate notification)

**Alert 1: Infrastructure Stability Critical**
```yaml
alert_name: infrastructure_stability_critical
condition: infrastructure_stability < 95.0% for 3 consecutive hours
severity: CRITICAL
notify: EXEC, DevOps team
action: Escalate to Chairman if not resolved in 24 hours
```

**Alert 2: Stage 14 Duration Exceeds Threshold**
```yaml
alert_name: stage_14_duration_critical
condition: stage_14_duration > 30 days
severity: CRITICAL
notify: EXEC, Chairman
action: Trigger rollback evaluation
```

**Alert 3: Critical Role Unfilled**
```yaml
alert_name: critical_role_unfilled
condition: critical_role_unfilled_days > 14
severity: HIGH
notify: EXEC, HR team
action: Trigger DEV-002 recursion consideration
```

### Warning Alerts (Daily summary)

**Alert 4: Readiness Score Below Target**
```yaml
alert_name: readiness_score_warning
condition: readiness_score < 90% for 3 consecutive days
severity: MEDIUM
notify: EXEC
action: Review blocking issues
```

**Alert 5: CI/CD Pipeline Failing**
```yaml
alert_name: ci_cd_pipeline_warning
condition: ci_cd_failures_consecutive > 2
severity: MEDIUM
notify: EXEC, DevOps team
action: Review pipeline configuration
```

### Informational Alerts (Weekly summary)

**Alert 6: Velocity Estimation Variance**
```yaml
alert_name: velocity_estimation_variance
condition: abs(estimated_velocity - actual_velocity) / estimated_velocity > 0.3
severity: LOW
notify: EXEC, Team Lead
action: Refine velocity estimation model
```

## Metrics Collection Implementation

### Database Schema
```sql
-- Stage 14 metrics table
CREATE TABLE stage_14_metrics (
    id SERIAL PRIMARY KEY,
    venture_id INTEGER REFERENCES ventures(id),
    date_recorded DATE NOT NULL,
    environment_readiness NUMERIC(5,2),
    team_readiness NUMERIC(5,2),
    sprint_readiness NUMERIC(5,2),
    overall_readiness NUMERIC(5,2),
    infrastructure_stability NUMERIC(5,2),
    team_velocity NUMERIC(5,1),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(venture_id, date_recorded)
);

-- Infrastructure health checks table
CREATE TABLE infrastructure_health_checks (
    id SERIAL PRIMARY KEY,
    venture_id INTEGER REFERENCES ventures(id),
    timestamp TIMESTAMP NOT NULL,
    status VARCHAR(10) CHECK (status IN ('UP', 'DOWN')),
    response_time_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Substage tracking table
CREATE TABLE stage_14_substages (
    id SERIAL PRIMARY KEY,
    venture_id INTEGER REFERENCES ventures(id),
    substage_id VARCHAR(10) CHECK (substage_id IN ('14.1', '14.2', '14.3')),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(20) CHECK (status IN ('pending', 'in_progress', 'complete', 'failed')),
    completion_percent NUMERIC(5,2),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(venture_id, substage_id)
);
```

### Metrics Collection Script
```python
def collect_stage_14_metrics(venture_id: int):
    """Collect and store Stage 14 metrics."""
    import datetime

    # Calculate current metrics
    env_readiness = calculate_environment_readiness(venture_id)
    team_readiness = calculate_team_readiness(venture_id)
    sprint_readiness = calculate_sprint_readiness(venture_id)
    overall_readiness = (env_readiness + team_readiness + sprint_readiness) / 3
    infra_stability = calculate_infrastructure_stability(venture_id, 24)
    team_velocity = calculate_team_velocity(venture_id)

    # Store in database
    db.execute("""
        INSERT INTO stage_14_metrics (
            venture_id,
            date_recorded,
            environment_readiness,
            team_readiness,
            sprint_readiness,
            overall_readiness,
            infrastructure_stability,
            team_velocity
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (venture_id, date_recorded)
        DO UPDATE SET
            environment_readiness = EXCLUDED.environment_readiness,
            team_readiness = EXCLUDED.team_readiness,
            sprint_readiness = EXCLUDED.sprint_readiness,
            overall_readiness = EXCLUDED.overall_readiness,
            infrastructure_stability = EXCLUDED.infrastructure_stability,
            team_velocity = EXCLUDED.team_velocity
    """, (
        venture_id,
        datetime.date.today(),
        env_readiness,
        team_readiness,
        sprint_readiness,
        overall_readiness,
        infra_stability,
        team_velocity
    ))
```

## Source Tables

| Source File | Lines | Content Type |
|-------------|-------|--------------|
| docs/workflow/stages.yaml | 610-613 | Stage 14 metrics definition |
| docs/workflow/critique/stage-14.md | 36-39 | Metrics gaps (thresholds, frequency) |

<!-- Generated by Claude Code Phase 7 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
