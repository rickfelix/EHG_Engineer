# Stage 17 "Pre-Build Checklist" -- AntiGravity Response (Google Gemini)

> Independent response to the Stage 17 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| Analysis Step | N/A (Does not exist) | None (User manual entry) | **5 Critical** | High manual burden; disconnect between plan and execution. | Build It | "Manual entry ensures user actually checks it." Counter: Users ignore blank checklists. Auto-seeding provides a baseline to verify against. |
| Blueprint Integration | N/A | None | **5 Critical** | Stage 17 fails to check if the specific Blueprint plans are ready. | Connect It | Is this strictly necessary? Yes, otherwise Stage 17 is just a generic "To Do" list found on Google. |
| Team Onboarding | N/A | Generic category | **4 High** | Hiring/Onboarding delays kill sprint velocity immediately. | Auto-Generate | Can we just have a "Team Ready" checkbox? No, we need specific items for specific roles defined in Stage 15. |
| Infra Provisioning | N/A | Generic category | **4 High** | "Environment Ready" is too vague. We need "AWS Account Created", "Vercel Linked", etc. based on Stage 14. | Auto-Generate | Over-engineering? No, "works on my machine" is the #1 sprint killer. |
| Go/No-Go Gate | N/A | Calc only (no threshold) | **5 Critical** | Allows starting Build Loop (Stage 18) with a broken environment. | Add Threshold | Should be 100%? No, maybe 100% of "Critical" items, 80% overall. |
| Role-Based Routing | N/A | Single owner string | **3 Medium** | Tasks get lost. | Enhance | Use Stage 15 roles? Yes, map checklist owners to Stage 15 roles. |

### 2. AnalysisStep Design

The analysisStep acts as an "Execution Generator" -- translating noun-based Blueprint (Architecture, Team, Roadmap) into verb-based Readiness tasks.

Pseudo-code logic iterates Stage 14 layers → architecture/tooling items, Stage 15 team_members → onboarding items, Stage 15 hiring_plan → job posting items, Stage 14 infra → environment items, Stage 16 runway → financial dependency items.

### 3. Prior-Stage Seeding

| Category | Source Stage | Logic |
|----------|------------|-------|
| Architecture | Stage 14 | 1 item per defined Layer + 1 per Integration Point |
| Team Readiness | Stage 15 | 1 item per Team Member + 1 per Open Hire + 1 per Skill Gap |
| Environment | Stage 14 (Infra) | 1 item per Infra Component |
| Tooling | Stage 14 (Tech) | 1 item per Technology specified |
| Dependencies | Stage 13 | Dependencies from Milestone 1 |

### 4. Go/No-Go Threshold

Metric: readiness_score (0-100). Threshold: 100% of Critical items. Secondary output: blocking_issues (list of critical items not complete). Rationale: Cannot start Sprint if no repo or no team.

### 5. Item Enrichment

Enhanced item schema: name, description (NEW - context from Blueprint), status, priority (NEW - critical/high/medium/low), owner_role (NEW - linked to Stage 15), source_ref (NEW), deadline (NEW - optional, relative to Sprint 1 start).

### 6. Blocker Severity Enum

Adopt Stage 15 standard: critical/high/medium/low.

### 7. Financial Readiness Integration

Check: Stage16.runway_months < 3? If yes, add Critical checklist item: "Secure bridge funding or adjust burn rate." Don't start building if running out of cash in 8 weeks.

### 8. Category Coverage

Stick to existing 5. Map Security items to architecture or environment. Possibly rename dependencies → external_dependencies.

### 9. CLI Superiorities

Direct link to code (CLI can verify repo exists). Strict validate() function.

### 10. Recommended Schema

Add priority enum, critical_ready boolean derived, readiness_threshold default 0.8.

### 11. Minimum Viable Change

1. Schema: Add priority enum + critical_ready derived
2. AnalysisStep: Create generation logic from Stages 13-16
3. Validation: Update computeDerived for readiness_score + critical_ready

### 12. Cross-Stage Impact

Stage 18: looks at completed items; if repo not set up, can't generate coding tasks. Stage 13: roadmap changes may need checklist refresh.

### 13. Dependency Conflicts

None identified. Stage is purely downstream and additive.

### 14. Contrarian Take

"The Checklist is an Illusion." Auto-generating 50 items creates a wall of text users will `mark_all_complete --force` to bypass. Risk: replace "thinking" with "admin." Mitigation: Keep generated list minimal (Critical items only), group intelligently, allow "Quick Actions" that execute setup AND mark complete.
