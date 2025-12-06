# Stage 32: Customer Success & Retention Engineering — Canonical Definition

**Generated**: 2025-11-06
**Version**: 1.0

---

## Source

**Repository**: EHG_Engineer
**Commit**: 468a959
**File**: `docs/workflow/stages.yaml`
**Lines**: 1426-1471

---

## Full YAML Excerpt

```yaml
  - id: 32
    title: Customer Success & Retention Engineering
    description: Establish customer success systems and retention mechanisms.
    depends_on:
      - 31
    inputs:
      - Customer data
      - Usage metrics
      - Support tickets
    outputs:
      - Success playbooks
      - Retention programs
      - Health scores
    metrics:
      - Customer health score
      - Retention rate
      - NPS score
    gates:
      entry:
        - Customers onboarded
        - Data flowing
      exit:
        - Success system active
        - Retention improving
        - NPS positive
    substages:
      - id: '32.1'
        title: Success Infrastructure
        done_when:
          - CRM configured
          - Playbooks created
          - Team trained
      - id: '32.2'
        title: Health Monitoring
        done_when:
          - Metrics defined
          - Scoring implemented
          - Alerts configured
      - id: '32.3'
        title: Retention Programs
        done_when:
          - Programs designed
          - Automation built
          - Engagement tracked
    notes:
      progression_mode: Manual → Assisted → Auto (suggested)
```

---

## Field Breakdown

### Core Attributes

| Field | Value | Purpose |
|-------|-------|---------|
| `id` | 32 | Unique stage identifier |
| `title` | Customer Success & Retention Engineering | Human-readable stage name |
| `description` | Establish customer success systems and retention mechanisms. | Purpose summary |
| `depends_on` | [31] | Prerequisite stages |

### Data Flow

**Inputs** (3):
1. Customer data - Onboarding records, user profiles
2. Usage metrics - Feature adoption, engagement patterns
3. Support tickets - Issues, feedback, churn signals

**Outputs** (3):
1. Success playbooks - Best practices documentation
2. Retention programs - Automated intervention workflows
3. Health scores - Predictive churn indicators

### Metrics (3)

1. **Customer health score** - Composite indicator of account health
2. **Retention rate** - Percentage of customers remaining over time
3. **NPS score** - Net Promoter Score (customer satisfaction)

Evidence: EHG_Engineer@468a959:docs/workflow/stages.yaml:1439-1442

### Gates

**Entry Gates** (2):
- Customers onboarded (prerequisite from Stage 31)
- Data flowing (analytics and support systems operational)

**Exit Gates** (3):
- Success system active (CRM configured, playbooks deployed)
- Retention improving (churn rate decreasing or stable)
- NPS positive (customer satisfaction above threshold)

Evidence: EHG_Engineer@468a959:docs/workflow/stages.yaml:1443-1450

---

## Substage Definitions

### Substage 32.1: Success Infrastructure

**Done When**:
- CRM configured (e.g., HubSpot, Salesforce integration)
- Playbooks created (customer journey templates)
- Team trained (success team onboarding complete)

Evidence: EHG_Engineer@468a959:docs/workflow/stages.yaml:1452-1457

**Estimated Duration**: 1-2 weeks
**Criticality**: High (foundation for health monitoring)

---

### Substage 32.2: Health Monitoring

**Done When**:
- Metrics defined (health score algorithm documented)
- Scoring implemented (automated health score calculation)
- Alerts configured (low-health notifications to success team)

Evidence: EHG_Engineer@468a959:docs/workflow/stages.yaml:1458-1463

**Estimated Duration**: 1-2 weeks
**Criticality**: High (proactive churn prevention)

---

### Substage 32.3: Retention Programs

**Done When**:
- Programs designed (at-risk customer playbooks)
- Automation built (triggered retention campaigns)
- Engagement tracked (program effectiveness metrics)

Evidence: EHG_Engineer@468a959:docs/workflow/stages.yaml:1464-1469

**Estimated Duration**: 1-2 weeks
**Criticality**: Medium (continuous improvement)

---

## Progression Mode

**Current**: Manual → Assisted → Auto (suggested)

**Interpretation**:
- **Manual**: Initial CRM setup and playbook creation
- **Assisted**: AI-suggested health score adjustments
- **Auto**: Fully automated retention campaigns and alerts

Evidence: EHG_Engineer@468a959:docs/workflow/stages.yaml:1471 "progression_mode: Manual → Assisted → Auto"

**EVA Ownership**: 5/5 Automation Leverage (EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-32.md:11 "Fully automatable")

---

## Schema Compliance

**Validation Against `workflow_stages` Table**:
- ✅ `id`: Integer (32)
- ✅ `title`: VARCHAR(255)
- ✅ `description`: TEXT
- ✅ `depends_on`: INTEGER[] (single dependency: 31)
- ✅ `inputs`: TEXT[] (3 elements)
- ✅ `outputs`: TEXT[] (3 elements)
- ✅ `metrics`: TEXT[] (3 elements)
- ✅ `gates`: JSONB (entry/exit structure)
- ✅ `substages`: JSONB[] (3 substages with id/title/done_when)
- ✅ `notes`: JSONB (progression_mode key)

**Database Table Reference**: `database/schema/*.sql` (workflow_stages definition)

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Purpose |
|--------|------|--------|------|-------|---------|
| stages.yaml | EHG_Engineer | 468a959 | docs/workflow/stages.yaml | 1426-1471 | Canonical YAML definition |
| critique | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-32.md | 11 | Automation leverage score |

---

**Next**: See `04_current-assessment.md` for critique rubric scores.

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
