# Stage 1: Canonical Definition

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:2-42

## YAML Definition

```yaml
- id: 1
  title: Draft Idea
  description: Capture and validate initial venture ideas with AI assistance and Chairman feedback.
  depends_on: []
  inputs:
    - Voice recording
    - Text input
    - Chairman feedback
  outputs:
    - Structured idea document
    - Initial validation
    - Risk assessment
  metrics:
    - Idea quality score
    - Validation completeness
    - Time to capture
  gates:
    entry: []
    exit:
      - Title validated (3-120 chars)
      - Description validated (20-2000 chars)
      - Category assigned
  substages:
    - id: '1.1'
      title: Idea Brief Creation
      done_when:
        - Title captured
        - Description written
        - Category selected
    - id: '1.2'
      title: Assumption Listing
      done_when:
        - Key assumptions documented
        - Risk factors identified
    - id: '1.3'
      title: Initial Success Criteria
      done_when:
        - Success metrics defined
        - Validation rules applied
  notes:
    progression_mode: Manual → Assisted → Auto (suggested)
```

---

## Field Breakdown

| Field | Value | Notes |
|-------|-------|-------|
| `id` | 1 | Unique stage identifier |
| `title` | Draft Idea | Short name |
| `description` | "Capture and validate..." | Purpose statement |
| `depends_on` | [] | No prerequisites (entry point) |
| `inputs` | 3 items | Voice, text, Chairman feedback |
| `outputs` | 3 items | Document, validation, risk assessment |
| `metrics` | 3 items | Quality score, completeness, time |
| `gates.entry` | [] | No entry gates |
| `gates.exit` | 3 criteria | Title, description, category validation |
| `substages` | 3 substages | Nested workflow steps |
| `notes.progression_mode` | Manual → Assisted → Auto | Automation roadmap |

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Full YAML | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 2-42 |
